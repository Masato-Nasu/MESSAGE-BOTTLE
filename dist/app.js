import { periods } from './periods.mjs';
import { letterLimit, longLetterThreshold } from './letter.mjs';

const find = (id) => document.getElementById(id);
const form = find('compose');
const letter = find('letter');
letter.maxLength = letterLimit;
const launch = find('launch');
const shore = find('shore');
const pairing = find('pairing');
const sample = find('sample');
const again = find('again');
const apiKeySection = find('api-key-section');
const apiKeyInput = find('api-key');
const loginDraftKey = 'message-bottle-login-draft';

let config;
let browserKey;
let pendingCode;
let pendingBottle;
let pollTimer;
let checkingConnection = false;
let busy = false;

for (const [value, label] of periods) {
  const choice = document.createElement('label');
  const input = document.createElement('input');
  const caption = document.createElement('span');
  choice.className = 'choice';
  input.type = 'radio';
  input.name = 'period';
  input.value = value;
  input.checked = value === '3m';
  caption.textContent = label;
  choice.append(input, caption);
  find('choices').append(choice);
}

function status(title, detail = '') {
  find('status-title').textContent = title;
  find('status-detail').textContent = detail;
  find('status').hidden = false;
}

function setBusy(value) {
  busy = value;
  launch.disabled = value;
  letter.readOnly = value;
  apiKeyInput.readOnly = value;
}

function showApiKey(prompt = false) {
  apiKeySection.hidden = false;
  apiKeyInput.required = true;
  if (prompt) {
    apiKeySection.scrollIntoView({ block: 'center' });
    apiKeyInput.focus();
  }
}

async function post(path, payload) {
  const response = await fetch('/api/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ browserKey, ...payload })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'もう一度お試しください。');
  return data;
}

function uuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return hex.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}

function connectCode(code) {
  pendingCode = code;
  pairing.hidden = false;
  find('pair-code').textContent = code;
  find('copy-code').textContent = 'コードをコピー';
  const openLine = find('open-line');
  openLine.href = 'https://line.me/R/oaMessage/' + encodeURIComponent(config.lineId) + '/?' + encodeURIComponent(code);
  openLine.textContent = 'LINEで連携コードを送る ↗';
  status('LINE連携を待っています', 'LINEでMESSAGE BOTTLEを友だち追加し、連携コードを送信して元のブラウザに戻ってください。');
  letter.blur();
  pairing.scrollIntoView({ block: 'center' });
  window.clearTimeout(pollTimer);
  pollTimer = window.setTimeout(checkConnection, 2500);
}

async function checkConnection() {
  if (!pendingCode || document.hidden || checkingConnection) return;
  checkingConnection = true;
  try {
    const connection = await post('connection', {});
    if (!pendingCode || document.hidden) return;
    if (connection.connected) {
      pendingCode = null;
      pairing.hidden = true;
      if (config.byok) {
        status('LINEとつながりました', 'OpenAI APIキーを入力し、手紙を投函できます。');
        showApiKey(true);
        return;
      }
      const period = new FormData(form).get('period');
      if (!busy && pendingBottle?.message === letter.value.trim() && pendingBottle.period === period) {
        form.requestSubmit();
        return;
      }
      status('LINEとつながりました', '「海に流す」を押すと、手紙を投函できます。');
      return;
    }
    if (connection.expired) {
      pendingCode = null;
      pairing.hidden = true;
      status('連携コードの期限が切れました', '「海に流す」を押すと、新しいコードが出ます。');
      return;
    }
  } catch {
    // A closed or suspended browser can check again once it resumes.
  } finally {
    checkingConnection = false;
  }
  window.clearTimeout(pollTimer);
  pollTimer = window.setTimeout(checkConnection, 3500);
}

window.addEventListener('pageshow', () => { if (pendingCode) void checkConnection(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && pendingCode) void checkConnection();
});

find('copy-code').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(pendingCode);
    find('copy-code').textContent = 'コピーしました';
  } catch {
    status('LINEをつなぐ', '表示されているコードを、LINE公式アカウントのトークに入力してください。');
  }
});

function playAnimation(text) {
  letter.blur();
  find('animated-letter').textContent = text;
  shore.classList.remove('playing');
  void shore.offsetWidth;
  shore.classList.add('playing');
  shore.scrollIntoView({ block: 'nearest' });
  return new Promise((resolve) => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.setTimeout(resolve, 1250);
      return;
    }
    const bottle = shore.querySelector('.bottle');
    const finish = (event) => {
      if (event && event.target !== bottle) return;
      window.clearTimeout(fallback);
      bottle.removeEventListener('animationend', finish);
      resolve();
    };
    const duration = Number.parseFloat(getComputedStyle(shore).getPropertyValue('--voyage')) * 1000;
    const fallback = window.setTimeout(finish, duration + 250);
    bottle.addEventListener('animationend', finish);
  });
}

function showSample(message) {
  status('返事の見本', '本番では、選んだ頃にこうした手紙がLINEに届きます。');
  find('sample-letter').textContent = 'あなたの瓶を拾いました。\n「波」という言葉で、版画のあの大きな波を思い出しました。手前の波と遠くの富士山を見比べるのが好きです。この一枚を送ります。';
  if (message.length >= longLetterThreshold) {
    find('sample-letter').textContent += '\n\n手紙を読んで、波の形が残るのは、波が止まったからではなく、どの瞬間を選んだかによるのだと考えました。この絵も、砕ける直前を描いているから、見ているだけでその続きが頭に浮かびます。左下の舟は波に沿って低く伸びていて、上から覆いかぶさる波とは形の向きが違います。そこを見ると、海全体が一方向に動いているようには見えなくなりました。\n\nもうひとつ気になったのは、波の下に見える富士山です。手前の波と遠くの山が同じくらい尖っていて、動いていくものと、そこに留まるものが一瞬だけ似た形に見える。読み終えてからもその重なりが頭に残ったので、この絵をお返しに選びました。';
  }
  const link = find('sample-link');
  link.textContent = '葛飾北斎《神奈川沖浪裏》 · メトロポリタン美術館 ↗';
  link.href = 'https://www.metmuseum.org/art/collection/search/45434';
  sample.hidden = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !config) return;
  const message = letter.value.trim();
  if (!message) { letter.focus(); return; }
  const period = new FormData(form).get('period');
  sample.hidden = true;
  again.hidden = true;
  setBusy(true);

  try {
    if (config.mode === 'live') {
      if (!pendingBottle || pendingBottle.message !== message || pendingBottle.period !== period) {
        pendingBottle = { id: uuid(), message, period };
      }
      const result = await post('launch', config.byok && !apiKeySection.hidden
        ? { ...pendingBottle, apiKey: apiKeyInput.value.trim() }
        : pendingBottle);
      if (result.loginRequired) {
        sessionStorage.setItem(loginDraftKey, JSON.stringify(pendingBottle));
        const { url } = await post('line/login', {});
        status('LINEで連携します', 'LINEで許可したあと、元のページに戻ります。');
        location.assign(url);
        return;
      }
      if (result.code) {
        connectCode(result.code);
        return;
      }
      if (result.apiKeyRequired) {
        status('OpenAI APIキーを入力してください', '入力したキーで、この手紙の返信を作ります。');
        showApiKey(true);
        return;
      }
      if (!result.accepted) throw new Error('投函を確認できませんでした。もう一度お試しください。');
      apiKeyInput.value = '';
      try { sessionStorage.removeItem(loginDraftKey); } catch { /* Optional once accepted. */ }
    }

    pendingCode = null;
    window.clearTimeout(pollTimer);
    pairing.hidden = true;
    status('瓶を流しています');
    await playAnimation(message);
    if (config.mode === 'demo') {
      showSample(message);
    } else {
      const label = periods.find(([value]) => value === period)[1];
      status('海に流しました', period === 'random'
        ? 'いつ返事が来るかは、潮まかせ。LINEでお知らせします。'
        : label + 'を目安に、LINEへ返事が届きます。');
    }
    form.hidden = true;
    again.hidden = false;
    pendingBottle = null;
  } catch (error) {
    status('手紙を流せませんでした', error.message || 'もう一度お試しください。');
    find('status-title').scrollIntoView({ block: 'center' });
  } finally {
    setBusy(false);
  }
});

again.addEventListener('click', () => {
  shore.classList.remove('playing');
  find('status').hidden = true;
  form.reset();
  form.hidden = false;
  letter.focus();
});

async function resumeLineLogin() {
  const url = new URL(location.href);
  const result = url.searchParams.get('line');
  if (!result) return;
  url.searchParams.delete('line');
  history.replaceState(null, '', url);
  let draft;
  try { draft = JSON.parse(sessionStorage.getItem(loginDraftKey)); } catch { /* The draft may be unavailable. */ }
  const period = periods.some(([value]) => value === draft?.period)
    ? form.elements.namedItem('period') : null;
  if (period && typeof draft.message === 'string' && draft.message.trim()) {
    letter.value = draft.message;
    period.value = draft.period;
    pendingBottle = draft;
  }

  if (result === 'connected') {
    const connection = await post('connection', {});
    if (!connection.connected) {
      status('このブラウザでLINE連携を確認できませんでした', '「海に流す」から、もう一度お試しください。');
    } else if (config.byok) {
      status('LINEとつながりました', 'OpenAI APIキーを入力し、手紙を投函できます。');
      showApiKey();
    } else if (pendingBottle) {
      form.requestSubmit();
    } else {
      status('LINEとつながりました', '「海に流す」を押すと、手紙を投函できます。');
    }
  } else if (result === 'friend') {
    status('LINEで友だち追加が必要です', '「海に流す」を押し直し、LINEの画面でMESSAGE BOTTLEを友だち追加してください。');
  } else if (result === 'cancelled') {
    status('LINE連携を中止しました', '「海に流す」から、いつでもやり直せます。');
  } else if (result === 'browser') {
    status('LINE連携のブラウザ情報を確認できませんでした', '元のブラウザで「海に流す」からやり直してください。');
  } else if (result === 'credentials') {
    status('LINEログインの認証情報が一致しません', '管理者はLINEログインチャネルのIDとシークレットを確認してください。');
  } else if (/^token-\d{3}$/.test(result)) {
    status('LINEが認証コードを受け付けませんでした', '診断コード ' + result + '。新しい投函からLINE連携をお試しください。');
  } else if (/^friendship-\d{3}$/.test(result)) {
    status('LINE公式アカウントの連携を確認できませんでした', '診断コード ' + result + '。管理者はLINEログインチャネルにリンクされた公式アカウントを確認してください。');
  } else if (/^profile-\d{3}$/.test(result)) {
    status('LINEの利用者情報を確認できませんでした', '診断コード ' + result + '。');
  } else if (result === 'already-linked') {
    status('このブラウザは別のLINEアカウントと連携済みです', '別のブラウザでLINE連携してください。');
  } else {
    status('LINE連携を確認できませんでした', '「海に流す」を押して、もう一度お試しください。');
  }
  if (!find('status').hidden) find('status-title').scrollIntoView({ block: 'center' });
}

async function initialize() {
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    if (response.status === 404 || !response.headers.get('content-type')?.includes('application/json')) {
      config = { mode: 'demo' };
    } else if (response.ok) {
      config = await response.json();
    }
    if (config?.mode === 'live') {
      browserKey = localStorage.getItem('message-bottle-key');
      if (!browserKey) {
        browserKey = uuid();
        localStorage.setItem('message-bottle-key', browserKey);
      }
      find('badge').textContent = 'LINEで受け取る';
      if (config.byok && !new URL(location.href).searchParams.has('line')) {
        const connection = await post('connection', {}).catch(() => null);
        if (connection?.connected) showApiKey();
      }
    } else if (config?.mode === 'demo') {
      find('badge').textContent = '試用版';
      find('hint').textContent = '試用版では、瓶を流す映像のあとに返事の見本が出ます。LINEには送信されません。';
    } else {
      find('badge').textContent = '準備中';
      status('配信の準備中です', '管理者によるLINEとAIの設定が必要です。');
      return;
    }
    launch.disabled = false;
    if (config.mode === 'live') await resumeLineLogin();
  } catch {
    find('badge').textContent = '準備中';
    status('読み込めませんでした', 'ページを再読み込みしてください。');
  }
}

void initialize();
