const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function keyEncryptionConfigured(env) {
  return /^[0-9a-f]{64}$/i.test(env.BOTTLE_KEY_ENCRYPTION_SECRET ?? '');
}

async function encryptionKey(env) {
  const bytes = Uint8Array.from(env.BOTTLE_KEY_ENCRYPTION_SECRET.match(/../g), (pair) => parseInt(pair, 16));
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function cipherParams(iv, bottleId) {
  return { name: 'AES-GCM', iv, additionalData: encoder.encode(bottleId) };
}

export async function encryptBottleKey(env, bottleId, apiKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    cipherParams(iv, bottleId), await encryptionKey(env), encoder.encode(apiKey)
  ));
  return btoa(String.fromCharCode(...iv, ...encrypted));
}

export async function decryptBottleKey(env, bottleId, storedKey) {
  const bytes = Uint8Array.from(atob(storedKey), (char) => char.charCodeAt(0));
  const plaintext = await crypto.subtle.decrypt(
    cipherParams(bytes.slice(0, 12), bottleId), await encryptionKey(env), bytes.slice(12)
  );
  return decoder.decode(plaintext);
}
