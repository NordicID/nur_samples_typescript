/**
 * Application entry point.
 *
 * 1. Import `@nordicid/nurapi-web` as a side-effect — this registers the
 *    `ser://` (Web Serial) and `ble://` (Web Bluetooth) URI schemes in the
 *    global transport registry so that `api.connect('ser://request')` works.
 * 2. Create the shared NurApi instance and store it in state.ts.
 * 3. Wire the status bar to connection events.
 * 4. Initialize every UI panel.
 * 5. Show a compatibility notice if running in a non-Chromium browser.
 * 6. Install a global unhandled-rejection handler for catch-all error display.
 */

// Side-effect import — registers Web Serial and Web Bluetooth transports
import '@nordicid/nurapi-web';

import './style.css';

import { NurApi } from '@nordicid/nurapi';
import { isWebSerialSupported, isWebBluetoothSupported } from '@nordicid/nurapi-web';
import { setApi } from './state.js';
import { $ } from './helpers.js';
import { showToast } from './ui/toast.js';
import { initConnectionPanel } from './ui/connection.js';
import { initReaderInfoPanel } from './ui/reader-info.js';
import { initInventoryPanel } from './ui/inventory.js';
import { initTagOpsPanel } from './ui/tag-ops.js';
import { initGpioPanel } from './ui/gpio.js';
import { initEventLogPanel } from './ui/event-log.js';

// ---------------------------------------------------------------------------
// 1. Create the NurApi instance
// ---------------------------------------------------------------------------

const api = new NurApi();
setApi(api);

// ---------------------------------------------------------------------------
// 2. Wire status bar to connection lifecycle events
// ---------------------------------------------------------------------------

const statusBar = $('#status-bar');
const statusText = $('#status-text');
const readerName = $('#reader-name');

api.on('connecting', () => {
  statusBar.className = 'status-connecting';
  statusText.textContent = 'Connecting...';
  readerName.textContent = '';
});

api.on('connected', async () => {
  statusBar.className = 'status-connected';
  statusText.textContent = 'Connected';

  // Try to display the reader name
  try {
    const info = await api.getReaderInfo();
    readerName.textContent = info.name;
  } catch {
    // Non-critical — leave reader name empty
  }
});

api.on('disconnected', () => {
  statusBar.className = 'status-disconnected';
  statusText.textContent = 'Disconnected';
  readerName.textContent = '';
});

// ---------------------------------------------------------------------------
// 3. Initialize all UI panels
// ---------------------------------------------------------------------------

initConnectionPanel();
initReaderInfoPanel();
initInventoryPanel();
initTagOpsPanel();
initGpioPanel();
initEventLogPanel();

// ---------------------------------------------------------------------------
// 4. Browser compatibility notice
// ---------------------------------------------------------------------------

const browserNotice = $('#browser-notice');

// Feature-detect rather than UA-sniff: if neither Web Serial nor Web Bluetooth
// is available, the user is likely on Firefox/Safari.
if (!isWebSerialSupported() && !isWebBluetoothSupported()) {
  browserNotice.textContent = 'Serial & BLE require Chrome or Edge';
}

// ---------------------------------------------------------------------------
// 5. Global unhandled rejection handler
// ---------------------------------------------------------------------------

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason);
  showToast(`Unhandled error: ${message}`, 'error');
  console.error('Unhandled rejection:', reason);
});
