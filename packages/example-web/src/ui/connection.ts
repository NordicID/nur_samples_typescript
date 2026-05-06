/**
 * Connection UI — transport selection panel.
 *
 * Renders Web Serial, Web Bluetooth, and WebSocket connection forms inside
 * `#connection-content` and manages enable/disable state across the connection
 * lifecycle. WebSocket fields (user, password, host, path, TLS) are explicit
 * inputs and persist to localStorage so reconnects don't require retyping.
 */

import { getApi, setConnectionUri } from '../state.js';
import { $, el, btn } from '../helpers.js';
import { showToast } from './toast.js';
import { isWebSerialSupported, isWebBluetoothSupported } from '@nordicid/nurapi-web';

const WS_STORAGE_KEY = 'nur-demo-ws-config';
const WS_DEFAULT_URL = 'wss://192.168.1.100/wsp/4333';

interface WsConfig {
  user: string;
  pass: string;
  url: string;
}

const DEFAULT_WS: WsConfig = {
  user: '',
  pass: '',
  url: WS_DEFAULT_URL,
};

function loadWsConfig(): WsConfig {
  try {
    const raw = localStorage.getItem(WS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_WS };
    return { ...DEFAULT_WS, ...(JSON.parse(raw) as Partial<WsConfig>) };
  } catch {
    return { ...DEFAULT_WS };
  }
}

function saveWsConfig(c: WsConfig): void {
  try {
    localStorage.setItem(WS_STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* ignore quota / disabled storage */
  }
}

/** Inject user:pass into a ws:// or wss:// URL, replacing any existing userinfo. */
function buildWsUri(c: WsConfig): string {
  const u = new URL(c.url);
  u.username = encodeURIComponent(c.user);
  u.password = encodeURIComponent(c.pass);
  return u.toString();
}

interface FieldOpts {
  type?: string;
  placeholder?: string;
  required?: boolean;
  reveal?: boolean;
}

function field(
  label: string,
  value: string,
  opts: FieldOpts = {},
): { wrap: HTMLDivElement; input: HTMLInputElement } {
  const wrap = el('div', 'form-group') as HTMLDivElement;
  const lbl = document.createElement('label');
  lbl.textContent = label;
  if (opts.required) {
    const star = el('span', 'required-star', '*');
    lbl.appendChild(star);
  }
  wrap.appendChild(lbl);

  const input = document.createElement('input');
  input.type = opts.type ?? 'text';
  input.value = value;
  if (opts.placeholder) input.placeholder = opts.placeholder;
  if (opts.required) input.required = true;
  input.spellcheck = false;
  input.autocomplete = 'off';

  if (opts.reveal) {
    const inputWrap = el('div', 'input-with-action') as HTMLDivElement;
    inputWrap.appendChild(input);
    const reveal = btn('Show', 'btn-icon', () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      reveal.textContent = showing ? 'Show' : 'Hide';
    });
    reveal.type = 'button';
    reveal.title = 'Show/hide password';
    inputWrap.appendChild(reveal);
    wrap.appendChild(inputWrap);
  } else {
    wrap.appendChild(input);
  }
  return { wrap, input };
}

export function initConnectionPanel(): void {
  const container = $('#connection-content');
  const api = getApi();

  // ---------------------------------------------------------------------------
  // Web Serial section
  // ---------------------------------------------------------------------------

  const serialSection = el('div', 'transport-section serial');
  serialSection.appendChild(el('h3', undefined, 'Web Serial'));

  if (isWebSerialSupported()) {
    serialSection.appendChild(
      el('p', 'transport-help', 'USB cable. Browser will prompt to pick the port.'),
    );
    const serialRow = el('div', 'form-row');

    const baudGroup = el('div', 'form-group');
    const baudLabel = document.createElement('label');
    baudLabel.textContent = 'Baud rate';
    const baudSelect = document.createElement('select');
    for (const rate of [115200, 230400, 500000, 38400]) {
      const opt = document.createElement('option');
      opt.value = String(rate);
      opt.textContent = String(rate);
      baudSelect.appendChild(opt);
    }
    baudGroup.appendChild(baudLabel);
    baudGroup.appendChild(baudSelect);

    const serialBtn = btn('Connect', 'btn-primary', async () => {
      await doConnect(`ser://request?baudrate=${baudSelect.value}`);
    });

    serialRow.appendChild(baudGroup);
    serialRow.appendChild(serialBtn);
    serialSection.appendChild(serialRow);
  } else {
    serialSection.appendChild(
      el('p', 'transport-unsupported', 'Web Serial is not supported in this browser.'),
    );
  }

  // ---------------------------------------------------------------------------
  // Web Bluetooth section
  // ---------------------------------------------------------------------------

  const bleSection = el('div', 'transport-section bluetooth');
  bleSection.appendChild(el('h3', undefined, 'Web Bluetooth'));

  if (isWebBluetoothSupported()) {
    bleSection.appendChild(
      el('p', 'transport-help', 'Wireless. Browser will prompt to pick the device.'),
    );
    const bleRow = el('div', 'form-row');
    const bleBtn = btn('Connect', 'btn-primary', async () => {
      await doConnect('ble://request');
    });
    bleRow.appendChild(bleBtn);
    bleSection.appendChild(bleRow);
  } else {
    bleSection.appendChild(
      el('p', 'transport-unsupported', 'Web Bluetooth is not supported in this browser.'),
    );
  }

  // ---------------------------------------------------------------------------
  // WebSocket section
  // ---------------------------------------------------------------------------

  const wsSection = el('div', 'transport-section websocket');
  wsSection.appendChild(el('h3', undefined, 'WebSocket'));
  wsSection.appendChild(
    el(
      'p',
      'transport-help',
      'Network. Username and password are required and sent in the URL.',
    ),
  );

  const cfg = loadWsConfig();
  const wsGrid = el('div', 'ws-form-grid') as HTMLDivElement;

  const userField = field('Username', cfg.user, {
    placeholder: 'admin',
    required: true,
  });
  const passField = field('Password', cfg.pass, {
    type: 'password',
    placeholder: 'password',
    required: true,
    reveal: true,
  });
  const urlField = field('URL', cfg.url, {
    placeholder: WS_DEFAULT_URL,
    required: true,
  });

  wsGrid.appendChild(userField.wrap);
  wsGrid.appendChild(passField.wrap);
  wsGrid.appendChild(urlField.wrap);

  wsSection.appendChild(wsGrid);

  // If a pasted URL contains user:pass@host, hoist them into the user/pass
  // fields so the URL field stays clean and credentials are visible.
  urlField.input.addEventListener('input', () => {
    const v = urlField.input.value.trim();
    if (!/^wss?:\/\//i.test(v)) return;
    try {
      const u = new URL(v);
      if (!u.username && !u.password) return;
      if (u.username) userField.input.value = decodeURIComponent(u.username);
      if (u.password) passField.input.value = decodeURIComponent(u.password);
      u.username = '';
      u.password = '';
      urlField.input.value = u.toString();
    } catch {
      /* ignore — let the user keep typing */
    }
  });

  function readWsForm(): WsConfig {
    return {
      user: userField.input.value.trim(),
      pass: passField.input.value,
      url: urlField.input.value.trim(),
    };
  }

  const wsBtn = btn('Connect', 'btn-primary', async () => {
    const c = readWsForm();
    const missing: string[] = [];
    if (!c.url) missing.push('URL');
    if (!c.user) missing.push('Username');
    if (!c.pass) missing.push('Password');
    if (missing.length) {
      showToast(`${missing.join(', ')} required`, 'error');
      return;
    }
    if (!c.url.startsWith('ws://') && !c.url.startsWith('wss://')) {
      showToast('URL must start with ws:// or wss://', 'error');
      return;
    }
    let uri: string;
    try {
      uri = buildWsUri(c);
    } catch {
      showToast('Invalid WebSocket URL', 'error');
      return;
    }
    saveWsConfig(c);
    await doConnect(uri);
  });

  const wsActions = el('div', 'ws-actions') as HTMLDivElement;
  wsActions.appendChild(wsBtn);
  wsSection.appendChild(wsActions);

  const wsErrorBox = el('div', 'ws-error-box') as HTMLDivElement;
  wsErrorBox.style.display = 'none';
  wsSection.appendChild(wsErrorBox);

  function clearWsError(): void {
    wsErrorBox.style.display = 'none';
    wsErrorBox.innerHTML = '';
  }

  function showWsCertHint(uri: string, errorMsg: string): void {
    wsErrorBox.innerHTML = '';
    let httpsUrl = '';
    try {
      const u = new URL(uri);
      httpsUrl = `https://${u.host}/`;
    } catch {
      /* no host available */
    }

    const title = el('div', 'ws-error-title', 'WebSocket connection failed');
    wsErrorBox.appendChild(title);

    if (errorMsg) {
      wsErrorBox.appendChild(el('div', 'ws-error-detail', errorMsg));
    }

    const hint = el('div', 'ws-error-hint') as HTMLDivElement;
    hint.appendChild(
      document.createTextNode(
        'NUR readers ship with a self-signed TLS certificate, which Chrome blocks until you accept it once. ',
      ),
    );
    if (httpsUrl) {
      hint.appendChild(document.createTextNode('Open '));
      const link = document.createElement('a');
      link.href = httpsUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = httpsUrl;
      hint.appendChild(link);
      hint.appendChild(
        document.createTextNode(
          ' in a new tab, click "Advanced" and "Proceed", then try connecting again.',
        ),
      );
    } else {
      hint.appendChild(
        document.createTextNode(
          'Open the reader\'s https URL in a new tab, accept the certificate, then try again.',
        ),
      );
    }
    wsErrorBox.appendChild(hint);

    wsErrorBox.style.display = 'block';
  }

  // ---------------------------------------------------------------------------
  // Disconnect button
  // ---------------------------------------------------------------------------

  const disconnectBtn = btn('Disconnect', 'btn-danger', async () => {
    try {
      await api.disconnect();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  });
  disconnectBtn.style.display = 'none';

  // ---------------------------------------------------------------------------
  // Assemble into container
  // ---------------------------------------------------------------------------

  container.appendChild(serialSection);
  container.appendChild(bleSection);
  container.appendChild(wsSection);

  const panel = container.parentElement!;
  disconnectBtn.style.marginTop = '12px';
  panel.appendChild(disconnectBtn);

  const connectButtons = Array.from(
    container.querySelectorAll<HTMLButtonElement>('.btn-primary'),
  );

  // ---------------------------------------------------------------------------
  // Connection helper
  // ---------------------------------------------------------------------------

  async function doConnect(uri: string): Promise<void> {
    const isWss = uri.startsWith('wss://');
    if (uri.startsWith('ws://') || isWss) clearWsError();
    for (const b of connectButtons) b.disabled = true;
    try {
      await api.connect(uri);
      setConnectionUri(uri);
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
        showToast('Connection cancelled', 'info');
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        showToast(msg, 'error');
        if (isWss) showWsCertHint(uri, msg);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // State management via connection events
  // ---------------------------------------------------------------------------

  api.on('connecting', () => {
    for (const b of connectButtons) {
      b.disabled = true;
      b.textContent = 'Connecting...';
    }
  });

  api.on('connected', () => {
    container.style.display = 'none';
    disconnectBtn.style.display = '';
    clearWsError();
  });

  api.on('disconnected', () => {
    setConnectionUri(null);
    container.style.display = '';
    disconnectBtn.style.display = 'none';
    for (const b of connectButtons) {
      b.disabled = false;
      b.textContent = 'Connect';
    }
  });
}
