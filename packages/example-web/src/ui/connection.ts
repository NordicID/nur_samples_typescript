/**
 * Connection UI — transport selection panel.
 *
 * Creates the connection interface inside `#connection-content` with three
 * transport options (Web Serial, Web Bluetooth, WebSocket) and a disconnect
 * button. Manages UI state in response to connection lifecycle events.
 */

import { getApi } from '../state.js';
import { $, el, btn } from '../helpers.js';
import { showToast } from './toast.js';
import { isWebSerialSupported, isWebBluetoothSupported } from '@nordicid/nurapi-web';

export function initConnectionPanel(): void {
  const container = $('#connection-content');
  const api = getApi();

  // ---------------------------------------------------------------------------
  // Web Serial section
  // ---------------------------------------------------------------------------

  const serialSection = el('div', 'transport-section serial');
  const serialTitle = el('h3', undefined, 'Web Serial');
  serialSection.appendChild(serialTitle);

  if (isWebSerialSupported()) {
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
      const baudrate = baudSelect.value;
      await doConnect(`ser://request?baudrate=${baudrate}`);
    });

    serialRow.appendChild(baudGroup);
    serialRow.appendChild(serialBtn);
    serialSection.appendChild(serialRow);
  } else {
    const notice = el('p', 'transport-unsupported', 'Web Serial is not supported in this browser.');
    serialSection.appendChild(notice);
  }

  // ---------------------------------------------------------------------------
  // Web Bluetooth section
  // ---------------------------------------------------------------------------

  const bleSection = el('div', 'transport-section bluetooth');
  const bleTitle = el('h3', undefined, 'Web Bluetooth');
  bleSection.appendChild(bleTitle);

  if (isWebBluetoothSupported()) {
    const bleRow = el('div', 'form-row');
    const bleBtn = btn('Connect', 'btn-primary', async () => {
      await doConnect('ble://request');
    });
    bleRow.appendChild(bleBtn);
    bleSection.appendChild(bleRow);
  } else {
    const notice = el('p', 'transport-unsupported', 'Web Bluetooth is not supported in this browser.');
    bleSection.appendChild(notice);
  }

  // ---------------------------------------------------------------------------
  // WebSocket section
  // ---------------------------------------------------------------------------

  const wsSection = el('div', 'transport-section websocket');
  const wsTitle = el('h3', undefined, 'WebSocket');
  wsSection.appendChild(wsTitle);

  const wsRow = el('div', 'form-row');
  const wsGroup = el('div', 'form-group');
  const wsLabel = document.createElement('label');
  wsLabel.textContent = 'URL';
  const wsInput = document.createElement('input');
  wsInput.type = 'text';
  wsInput.value = 'wss://192.168.1.100/wsp/4333';
  wsGroup.appendChild(wsLabel);
  wsGroup.appendChild(wsInput);

  const wsBtn = btn('Connect', 'btn-primary', async () => {
    const url = wsInput.value.trim();
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
      showToast('WebSocket URL must start with ws:// or wss://', 'error');
      return;
    }
    await doConnect(url);
  });

  wsRow.appendChild(wsGroup);
  wsRow.appendChild(wsBtn);
  wsSection.appendChild(wsRow);

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
  container.appendChild(disconnectBtn);

  // Collect all connect buttons for state management
  const connectSections = [serialSection, bleSection, wsSection];
  const connectButtons = Array.from(
    container.querySelectorAll<HTMLButtonElement>('.btn-primary'),
  );

  // ---------------------------------------------------------------------------
  // Connection helper
  // ---------------------------------------------------------------------------

  async function doConnect(uri: string): Promise<void> {
    // Disable immediately to prevent double-clicks before the 'connecting' event
    for (const b of connectButtons) b.disabled = true;
    try {
      await api.connect(uri);
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
        showToast('Connection cancelled', 'info');
      } else {
        showToast(err instanceof Error ? err.message : String(err), 'error');
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
    for (const section of connectSections) {
      section.style.display = 'none';
    }
    disconnectBtn.style.display = '';
  });

  api.on('disconnected', () => {
    for (const section of connectSections) {
      section.style.display = '';
    }
    disconnectBtn.style.display = 'none';
    for (const b of connectButtons) {
      b.disabled = false;
      b.textContent = 'Connect';
    }
  });
}
