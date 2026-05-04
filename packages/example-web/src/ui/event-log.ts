/**
 * Event Log Panel — scrollable, filterable event log for NUR reader events.
 *
 * Creates a log display inside `#event-log-content` with filter checkboxes,
 * auto-scroll toggle, and a clear button. Subscribes to all typed NurApi
 * events and formats them as timestamped log entries.
 */

import { getApi } from '../state.js';
import { $, el, btn, formatTime, formatHex } from '../helpers.js';

/** Log entry type — used for CSS classes and filter matching. */
type LogType = 'connection' | 'inventory' | 'io' | 'boot' | 'debug' | 'other';

/** Maximum number of log entries to keep in the DOM. */
const MAX_ENTRIES = 500;

/** Filter label to log type mapping. */
const FILTER_MAP: Record<string, LogType> = {
  Connection: 'connection',
  Inventory: 'inventory',
  IO: 'io',
  Boot: 'boot',
  Debug: 'debug',
  Other: 'other',
};

export function initEventLogPanel(): void {
  const container = $('#event-log-content');
  const api = getApi();

  // Track filter states and auto-scroll setting
  const filterState: Record<LogType, boolean> = {
    connection: true,
    inventory: true,
    io: true,
    boot: true,
    debug: true,
    other: true,
  };
  let autoScroll = true;

  // ---------------------------------------------------------------------------
  // Controls bar
  // ---------------------------------------------------------------------------

  const controls = el('div', 'log-controls');

  // Clear button
  const clearBtn = btn('Clear', 'btn-sm', () => {
    logContainer.innerHTML = '';
  });
  controls.appendChild(clearBtn);

  // Auto-scroll checkbox
  const autoScrollLabel = document.createElement('label');
  const autoScrollCb = document.createElement('input');
  autoScrollCb.type = 'checkbox';
  autoScrollCb.checked = true;
  autoScrollCb.addEventListener('change', () => {
    autoScroll = autoScrollCb.checked;
  });
  autoScrollLabel.appendChild(autoScrollCb);
  autoScrollLabel.appendChild(document.createTextNode(' Auto-scroll'));
  controls.appendChild(autoScrollLabel);

  // Filter checkboxes
  const filters = el('div', 'log-filters');
  for (const [label, type] of Object.entries(FILTER_MAP)) {
    const filterLabel = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.addEventListener('change', () => {
      filterState[type] = cb.checked;
      applyFilter(type, cb.checked);
    });
    filterLabel.appendChild(cb);
    filterLabel.appendChild(document.createTextNode(` ${label}`));
    filters.appendChild(filterLabel);
  }
  controls.appendChild(filters);

  container.appendChild(controls);

  // ---------------------------------------------------------------------------
  // Log container
  // ---------------------------------------------------------------------------

  const logContainer = el('div', 'log-container');
  container.appendChild(logContainer);

  // ---------------------------------------------------------------------------
  // Helper: apply filter visibility to existing entries
  // ---------------------------------------------------------------------------

  function applyFilter(type: LogType, visible: boolean): void {
    const entries = logContainer.querySelectorAll<HTMLElement>(`.log-${type}`);
    for (const entry of entries) {
      if (visible) {
        entry.classList.remove('log-hidden');
      } else {
        entry.classList.add('log-hidden');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helper: add a log entry
  // ---------------------------------------------------------------------------

  function addEntry(type: LogType, detail: string): void {
    const entry = el('div', `log-entry log-${type}`);
    if (!filterState[type]) {
      entry.classList.add('log-hidden');
    }

    const timeSpan = el('span', 'log-time', `[${formatTime()}]`);
    const typeSpan = el('span', 'log-type', `[${type.toUpperCase()}]`);

    entry.appendChild(timeSpan);
    entry.appendChild(document.createTextNode(' '));
    entry.appendChild(typeSpan);
    entry.appendChild(document.createTextNode(` ${detail}`));

    logContainer.appendChild(entry);

    // Cap at MAX_ENTRIES — remove oldest from DOM when exceeded
    while (logContainer.childElementCount > MAX_ENTRIES) {
      logContainer.removeChild(logContainer.firstElementChild!);
    }

    // Auto-scroll to bottom
    if (autoScroll) {
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  }

  // ---------------------------------------------------------------------------
  // Subscribe to NurApi events
  // ---------------------------------------------------------------------------

  // Connection lifecycle
  api.on('connecting', () => {
    addEntry('connection', 'Connecting...');
  });

  api.on('connected', () => {
    addEntry('connection', 'Connected');
  });

  api.on('disconnected', () => {
    addEntry('connection', 'Disconnected');
  });

  // Boot notification
  api.on('boot', (data) => {
    addEntry('boot', `Boot: ${data.message}`);
  });

  // IO change notification
  api.on('ioChange', (data) => {
    addEntry('io', `IO source=${data.source} dir=${data.direction} sensor=${data.sensor}`);
  });

  // Inventory stream notification
  api.on('inventoryStream', (data) => {
    addEntry(
      'inventory',
      `Stream: +${data.tagsAdded} tags, ${data.roundsDone} rounds, Q=${data.Q}${data.stopped ? ' [STOPPED]' : ''}`,
    );
  });

  // Extended inventory stream notification
  api.on('inventoryEx', (data) => {
    addEntry(
      'inventory',
      `StreamEx: +${data.tagsAdded} tags, ${data.roundsDone} rounds${data.stopped ? ' [STOPPED]' : ''}`,
    );
  });

  // Debug message notification
  api.on('debugMessage', (data) => {
    addEntry('debug', `[${data.level}] ${data.message}`);
  });

  // Trace tag notification
  api.on('traceTag', (data) => {
    addEntry('other', `Trace: RSSI=${data.rssi} ant=${data.antennaId}`);
  });

  // Trigger read notification
  api.on('triggerRead', (data) => {
    addEntry('other', `Trigger: src=${data.source} RSSI=${data.rssi}`);
  });

  // Hop event notification
  api.on('hopEvent', (data) => {
    addEntry('other', `Hop: ${data.freqKhz}kHz idx=${data.freqIdx}`);
  });

  // NXP alarm notification
  api.on('nxpAlarm', (data) => {
    addEntry('other', `NXP: armed=${data.armed} stopped=${data.stopped}`);
  });

  // Diagnostic report notification
  api.on('diagReport', (data) => {
    addEntry('other', `Diag: uptime=${data.uptimeMs}ms temp=${data.temperature}°C`);
  });

  // EPC enumeration notification
  api.on('epcEnum', (data) => {
    addEntry('other', `EPC Enum: ${formatHex(data.epc)}`);
  });

  // Auto-tune notification
  api.on('autoTune', (data) => {
    addEntry('other', `AutoTune: ant=${data.antenna} freq=${data.freqKhz}kHz refl=${data.reflPowerDbm}dBm`);
  });

  // General-purpose notification
  api.on('general', (data) => {
    addEntry('other', `General: ${data.data.length} bytes`);
  });
}
