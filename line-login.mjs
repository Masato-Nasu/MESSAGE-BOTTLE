const cookieName = '__Host-mb_line_state';
const callbackPath = '/api/line/login/callback';
const encoder = new TextEncoder();

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomToken() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

async function signingKey(env) {
  return crypto.subtle.importKey('raw', encoder.encode(env.LINE_LOGIN_CHANNEL_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function callbackUrl(request) {
  return new URL(callbackPath, request.url).href;
}

function stateCookie(value, maxAge) {
  return `${cookieName}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function finish(request, result) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL('/?line=' + result, request.url).href,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Set-Cookie': stateCookie('', 0)
    }
  });
}

export function lineLoginEnabled(env) {
  return /^\d+$/.test(env.LINE_LOGIN_CHANNEL_ID ?? '') && Boolean(env.LINE_LOGIN_CHANNEL_SECRET);
}

export async function beginLineLogin(request, env, browserHash) {
  const state = randomToken();
  const verifier = randomToken();
  const challenge = await crypto.subtle.digest('SHA-256', encoder.encode(verifier));
  const payload = [state, browserHash, verifier, Date.now() + 600_000].join('.');
  const signature = await crypto.subtle.sign('HMAC', await signingKey(env), encoder.encode(payload));
  const authorization = new URL('https://access.line.me/oauth2/v2.1/authorize');
  authorization.search = new URLSearchParams({
    response_type: 'code',
    client_id: env.LINE_LOGIN_CHANNEL_ID,
    redirect_uri: callbackUrl(request),
    state,
    scope: 'profile',
    bot_prompt: 'aggressive',
    code_challenge: base64url(new Uint8Array(challenge)),
    code_challenge_method: 'S256'
  }).toString();

  return Response.json({ url: authorization.href }, {
    headers: {
      'Cache-Control': 'no-store',
      'Set-Cookie': stateCookie(payload + '.' + base64url(new Uint8Array(signature)), 600)
    }
  });
}

export async function finishLineLogin(request, env) {
  try {
    const params = new URL(request.url).searchParams;
    const cookie = (request.headers.get('Cookie') ?? '').split(/;\s*/)
      .find((value) => value.startsWith(cookieName + '='))
      ?.slice(cookieName.length + 1) ?? '';
    const fields = /^([\w-]{43})\.([0-9a-f]{64})\.([\w-]{43})\.(\d{13})\.([\w-]{43})$/.exec(cookie);
    if (!fields) return finish(request, 'browser');
    const [, state, browserHash, verifier, expires, signature] = fields;
    if (params.get('state') !== state || Date.now() >= Number(expires)) return finish(request, 'browser');
    const signatureBytes = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/') + '='),
      (char) => char.charCodeAt(0));
    if (!await crypto.subtle.verify('HMAC', await signingKey(env), signatureBytes,
      encoder.encode(cookie.slice(0, cookie.lastIndexOf('.'))))) return finish(request, 'browser');
    const code = params.get('code');
    if (!code) return finish(request, params.get('error') === 'access_denied' ? 'cancelled' : 'error');

    const token = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl(request),
        client_id: env.LINE_LOGIN_CHANNEL_ID,
        client_secret: env.LINE_LOGIN_CHANNEL_SECRET,
        code_verifier: verifier
      }),
      signal: AbortSignal.timeout(12_000)
    });
    if (!token.ok) {
      const failure = await token.json().catch(() => ({}));
      if (failure.error === 'invalid_client' || token.status === 401) return finish(request, 'credentials');
      return finish(request, 'token-' + token.status);
    }
    const { access_token: accessToken } = await token.json();
    if (!accessToken) return finish(request, 'error');
    const options = { headers: { Authorization: 'Bearer ' + accessToken }, signal: AbortSignal.timeout(12_000) };
    const [profile, friendship] = await Promise.all([
      fetch('https://api.line.me/v2/profile', options),
      fetch('https://api.line.me/friendship/v1/status', options)
    ]);
    if (!friendship.ok) return finish(request, 'friendship-' + friendship.status);
    if (!profile.ok) return finish(request, 'profile-' + profile.status);
    if ((await friendship.json()).friendFlag !== true) return finish(request, 'friend');
    const { userId } = await profile.json();
    if (!/^U[0-9a-f]{32}$/.test(userId)) return finish(request, 'error');

    const connection = await env.DB.prepare(
      `INSERT INTO connections (browser_hash, code, expires_at, line_id) VALUES (?, NULL, 0, ?)
       ON CONFLICT(browser_hash) DO UPDATE SET code = NULL, line_id = excluded.line_id
       WHERE connections.line_id IS NULL OR connections.line_id = excluded.line_id
       RETURNING line_id`
    ).bind(browserHash, userId).first();
    return finish(request, connection ? 'connected' : 'already-linked');
  } catch {
    return finish(request, 'error');
  }
}
