/**
 * Reader Info panel — displays reader identification, firmware, and capabilities.
 *
 * Populates `#reader-info-content` on `connected` events by fetching version,
 * reader info, and device capabilities. Provides Ping, Beep, and Refresh
 * action buttons.
 */

import { getApi } from '../state.js';
import { $, el, btn } from '../helpers.js';
import { showToast } from './toast.js';
import type { VersionInfo, ReaderInfo, DeviceCaps } from '@nordicid/nurapi';

export function initReaderInfoPanel(): void {
  const container = $('#reader-info-content');
  const api = getApi();

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  api.on('connected', () => {
    loadInfo();
  });

  api.on('disconnected', () => {
    container.innerHTML = '';
    const placeholder = el('p', 'placeholder', 'Not connected');
    container.appendChild(placeholder);
  });

  // Show placeholder initially
  const placeholder = el('p', 'placeholder', 'Not connected');
  container.appendChild(placeholder);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  async function loadInfo(): Promise<void> {
    container.innerHTML = '';
    const loading = el('p', 'placeholder', 'Loading...');
    container.appendChild(loading);

    try {
      const [versions, info, caps] = await Promise.all([
        api.getVersions(),
        api.getReaderInfo(),
        api.getDeviceCaps(),
      ]);

      container.innerHTML = '';
      container.appendChild(buildInfoGrid(versions, info, caps));
      container.appendChild(buildActions());
    } catch (err) {
      container.innerHTML = '';
      const errMsg = el('p', 'placeholder', 'Failed to load reader info');
      container.appendChild(errMsg);
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  // ---------------------------------------------------------------------------
  // Info grid
  // ---------------------------------------------------------------------------

  function buildInfoGrid(
    versions: VersionInfo,
    info: ReaderInfo,
    caps: DeviceCaps,
  ): HTMLDListElement {
    const dl = document.createElement('dl');
    dl.className = 'info-grid';

    const modeChar = String.fromCharCode(versions.mode);
    const modeLabel = modeChar === 'A' ? 'A=App' : modeChar === 'B' ? 'B=Bootloader' : modeChar;

    const fields: [string, string][] = [
      ['Name', info.name],
      ['Serial', info.serial],
      ['Firmware', `${versions.vMajor}.${versions.vMinor}.${versions.vBuild}`],
      ['Mode', modeLabel],
      ['Hardware', info.hwVersion],
      ['Antennas', `${info.numAntennas} / ${info.maxAntennas}`],
      ['GPIO', String(info.numGpio)],
      ['Regions', String(info.numRegions)],
      ['Max TX', `${caps.maxTxdBm} dBm`],
      ['Tag Buffer', `${caps.szTagBuffer} bytes`],
    ];

    for (const [label, value] of fields) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      dl.appendChild(dt);
      dl.appendChild(dd);
    }

    return dl;
  }

  // ---------------------------------------------------------------------------
  // Action buttons
  // ---------------------------------------------------------------------------

  function buildActions(): HTMLDivElement {
    const actions = document.createElement('div');
    actions.className = 'info-actions';

    const pingResult = document.createElement('span');
    pingResult.className = 'ping-result';

    const pingBtn = btn('Ping', 'btn-sm', async () => {
      try {
        const t0 = performance.now();
        await api.ping();
        const t1 = performance.now();
        pingResult.textContent = `${(t1 - t0).toFixed(1)} ms`;
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err), 'error');
      }
    });

    const beepBtn = btn('Beep', 'btn-sm', async () => {
      try {
        await api.beep();
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err), 'error');
      }
    });

    const refreshBtn = btn('Refresh', 'btn-sm', () => {
      loadInfo();
    });

    actions.appendChild(pingBtn);
    actions.appendChild(beepBtn);
    actions.appendChild(refreshBtn);
    actions.appendChild(pingResult);

    return actions;
  }
}
