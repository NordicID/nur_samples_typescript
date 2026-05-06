/**
 * Reader Info panel — displays reader identification, firmware, and capabilities.
 *
 * Populates `#reader-info-content` on `connected` events by fetching version,
 * reader info, and device capabilities. Shows a header with the reader name,
 * serial, and the active transport, then groups remaining fields into
 * Firmware and Capability sections. Provides Ping, Beep, and Refresh actions.
 */

import { getApi, getConnectionUri } from '../state.js';
import { $, el, btn } from '../helpers.js';
import { showToast } from './toast.js';
import type { VersionInfo, ReaderInfo, DeviceCaps } from '@nordicid/nurapi';

interface TransportInfo {
  type: 'serial' | 'bluetooth' | 'websocket' | 'unknown';
  label: string;
  detail: string;
}

function describeTransport(uri: string | null): TransportInfo {
  if (!uri) return { type: 'unknown', label: 'Connected', detail: '' };
  if (uri.startsWith('ser://')) {
    let baud = '';
    try {
      const u = new URL(uri);
      const b = u.searchParams.get('baudrate');
      if (b) baud = `${b} baud`;
    } catch {
      /* ignore */
    }
    return { type: 'serial', label: 'Web Serial', detail: baud };
  }
  if (uri.startsWith('ble://')) {
    return { type: 'bluetooth', label: 'Web Bluetooth', detail: '' };
  }
  if (uri.startsWith('ws://') || uri.startsWith('wss://')) {
    try {
      const u = new URL(uri);
      const scheme = u.protocol.replace(':', '');
      return {
        type: 'websocket',
        label: `WebSocket (${scheme})`,
        detail: `${u.hostname}${u.pathname}`,
      };
    } catch {
      return { type: 'websocket', label: 'WebSocket', detail: '' };
    }
  }
  return { type: 'unknown', label: 'Connected', detail: '' };
}

export function initReaderInfoPanel(): void {
  const container = $('#reader-info-content');
  const api = getApi();

  api.on('connected', () => {
    container.style.display = '';
    loadInfo();
  });

  api.on('disconnected', () => {
    container.style.display = 'none';
    container.innerHTML = '';
  });

  container.style.display = 'none';

  async function loadInfo(): Promise<void> {
    container.innerHTML = '';
    const loading = el('p', 'placeholder', 'Loading reader info…');
    container.appendChild(loading);

    try {
      const [versions, info, caps] = await Promise.all([
        api.getVersions(),
        api.getReaderInfo(),
        api.getDeviceCaps(),
      ]);

      container.innerHTML = '';
      const transport = describeTransport(getConnectionUri());
      container.appendChild(buildHeader(info, transport));
      container.appendChild(buildSections(versions, info, caps));
      container.appendChild(buildActions());
    } catch (err) {
      container.innerHTML = '';
      container.appendChild(el('p', 'placeholder', 'Failed to load reader info'));
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  function buildHeader(info: ReaderInfo, transport: TransportInfo): HTMLDivElement {
    const header = el('div', 'reader-header') as HTMLDivElement;

    const ident = el('div', 'reader-ident') as HTMLDivElement;
    const nameEl = el('div', 'reader-name-big', info.name || '(unnamed reader)');
    const serialEl = el(
      'div',
      'reader-meta',
      info.serial ? `Serial ${info.serial}` : '',
    );
    ident.appendChild(nameEl);
    if (info.serial) ident.appendChild(serialEl);

    const badge = el(
      'span',
      `transport-badge transport-badge-${transport.type}`,
      transport.label,
    ) as HTMLSpanElement;
    badge.title = transport.detail || transport.label;

    const right = el('div', 'reader-header-right') as HTMLDivElement;
    right.appendChild(badge);
    if (transport.detail) {
      right.appendChild(el('div', 'reader-header-detail', transport.detail));
    }

    header.appendChild(ident);
    header.appendChild(right);
    return header;
  }

  function buildSections(
    versions: VersionInfo,
    info: ReaderInfo,
    caps: DeviceCaps,
  ): HTMLDivElement {
    const wrap = el('div', 'reader-info-sections') as HTMLDivElement;

    const modeChar = String.fromCharCode(versions.mode);
    const modeLabel =
      modeChar === 'A' ? 'Application' : modeChar === 'B' ? 'Bootloader' : modeChar;

    wrap.appendChild(
      buildSection('Firmware', [
        ['Version', `${versions.vMajor}.${versions.vMinor}.${versions.vBuild}`],
        ['Mode', modeLabel],
        ['Hardware', info.hwVersion || '—'],
      ]),
    );

    wrap.appendChild(
      buildSection('Capabilities', [
        ['Antennas', `${info.numAntennas} / ${info.maxAntennas}`],
        ['GPIO pins', String(info.numGpio)],
        ['Regions', String(info.numRegions)],
        ['Max TX power', `${caps.maxTxdBm} dBm`],
        ['Tag buffer', `${caps.szTagBuffer} bytes`],
      ]),
    );

    return wrap;
  }

  function buildSection(title: string, rows: [string, string][]): HTMLDivElement {
    const section = el('div', 'reader-info-section') as HTMLDivElement;
    section.appendChild(el('h4', 'reader-info-section-title', title));
    const dl = document.createElement('dl');
    dl.className = 'info-grid';
    for (const [label, value] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      dl.appendChild(dt);
      dl.appendChild(dd);
    }
    section.appendChild(dl);
    return section;
  }

  function buildActions(): HTMLDivElement {
    const actions = el('div', 'info-actions') as HTMLDivElement;

    const pingResult = el('span', 'ping-result', '') as HTMLSpanElement;

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
