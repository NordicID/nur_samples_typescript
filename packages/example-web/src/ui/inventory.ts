/**
 * Inventory panel — single inventory, streaming inventory, and tag table.
 *
 * Populates `#inventory-content` with controls for performing single or
 * streaming inventory rounds, displays real-time tag statistics, and renders
 * an efficiently-updated tag table with RSSI signal bars.
 */

import { getApi } from '../state.js';
import { $, el, btn, timeAgo } from '../helpers.js';
import { showToast } from './toast.js';
import type { InventoryStreamEvent } from '@nordicid/nurapi';

/** Return a CSS color for a scaled RSSI percentage (0–100). */
function rssiColor(pct: number): string {
  if (pct >= 66) return '#34a853'; // green
  if (pct >= 33) return '#f9ab00'; // yellow
  return '#ea4335';                // red
}

export function initInventoryPanel(): void {
  const container = $('#inventory-content');
  const api = getApi();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let streaming = false;
  /** Map of EPC hex -> table row for efficient DOM updates. */
  const rowMap = new Map<string, HTMLTableRowElement>();
  /** Whether the tag table needs a re-render (dirty flag for RAF throttle). */
  let dirty = false;
  /** Whether a RAF callback is already scheduled. */
  let rafScheduled = false;

  // ---------------------------------------------------------------------------
  // Controls bar
  // ---------------------------------------------------------------------------

  const controls = el('div', 'inv-controls') as HTMLDivElement;

  const singleBtn = btn('Single Inventory', 'btn-primary', () => {
    doSingleInventory();
  });

  const streamBtn = btn('Start Stream', 'btn-success', () => {
    if (streaming) {
      doStopStream();
    } else {
      doStartStream();
    }
  });

  const clearBtn = btn('Clear Tags', '', () => {
    doClearTags();
  });

  // Parameters
  const params = el('div', 'inv-params') as HTMLDivElement;

  const qLabel = document.createElement('label');
  qLabel.textContent = 'Q';
  const qInput = document.createElement('input');
  qInput.type = 'number';
  qInput.min = '0';
  qInput.max = '15';
  qInput.value = '0';

  const sessionLabel = document.createElement('label');
  sessionLabel.textContent = 'Session';
  const sessionSelect = document.createElement('select');
  for (let i = 0; i <= 3; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = String(i);
    sessionSelect.appendChild(opt);
  }

  const roundsLabel = document.createElement('label');
  roundsLabel.textContent = 'Rounds';
  const roundsInput = document.createElement('input');
  roundsInput.type = 'number';
  roundsInput.min = '0';
  roundsInput.value = '0';

  params.appendChild(qLabel);
  params.appendChild(qInput);
  params.appendChild(sessionLabel);
  params.appendChild(sessionSelect);
  params.appendChild(roundsLabel);
  params.appendChild(roundsInput);

  // Start disabled — enabled when connected
  singleBtn.disabled = true;
  streamBtn.disabled = true;
  clearBtn.disabled = true;

  controls.appendChild(singleBtn);
  controls.appendChild(streamBtn);
  controls.appendChild(clearBtn);
  controls.appendChild(params);

  // ---------------------------------------------------------------------------
  // Stats bar
  // ---------------------------------------------------------------------------

  const stats = el('div', 'inv-stats') as HTMLDivElement;
  stats.textContent = 'Tags: 0 unique | Round: 0 found, 0 collisions, Q=0';

  // ---------------------------------------------------------------------------
  // Tag table
  // ---------------------------------------------------------------------------

  const tableWrap = el('div', 'tag-table-wrap') as HTMLDivElement;
  const table = document.createElement('table');
  table.className = 'tag-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const label of ['#', 'EPC', 'RSSI (dBm)', 'Signal', 'Antenna', 'Seen', 'Updated']) {
    const th = document.createElement('th');
    th.textContent = label;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  tableWrap.appendChild(table);

  // ---------------------------------------------------------------------------
  // Assemble into container
  // ---------------------------------------------------------------------------

  container.appendChild(controls);
  container.appendChild(stats);
  container.appendChild(tableWrap);

  // ---------------------------------------------------------------------------
  // Helpers: read parameter inputs
  // ---------------------------------------------------------------------------

  function getParams(): { Q: number; session: number; rounds: number } {
    return {
      Q: Math.max(0, Math.min(15, parseInt(qInput.value, 10) || 0)),
      session: parseInt(sessionSelect.value, 10) || 0,
      rounds: Math.max(0, parseInt(roundsInput.value, 10) || 0),
    };
  }

  function updateStats(
    uniqueCount: number,
    tagsFound = 0,
    collisions = 0,
    Q = 0,
  ): void {
    stats.textContent =
      `Tags: ${uniqueCount} unique | Round: ${tagsFound} found, ${collisions} collisions, Q=${Q}`;
  }

  // ---------------------------------------------------------------------------
  // Single inventory
  // ---------------------------------------------------------------------------

  async function doSingleInventory(): Promise<void> {
    singleBtn.disabled = true;
    streamBtn.disabled = true;
    clearBtn.disabled = true;
    try {
      const p = getParams();
      const result = await api.inventory({ Q: p.Q, session: p.session, rounds: p.rounds });
      const tags = await api.fetchTags(true);

      // Merge into tagStorage for consistency
      api.tagStorage.addFromBuffer(tags);

      updateStats(api.tagStorage.count, result.tagsFound, result.collisions, result.Q);
      renderTable();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      singleBtn.disabled = false;
      streamBtn.disabled = false;
      clearBtn.disabled = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Streaming inventory
  // ---------------------------------------------------------------------------

  function doStartStream(): void {
    streaming = true;
    streamBtn.textContent = 'Stop Stream';
    streamBtn.className = 'btn-danger';
    singleBtn.disabled = true;

    const p = getParams();
    api.startInventoryStream({ Q: p.Q, session: p.session, rounds: p.rounds }).catch((err) => {
      showToast(err instanceof Error ? err.message : String(err), 'error');
      resetStreamUI();
    });
  }

  function doStopStream(): void {
    streaming = false;
    api.stopInventoryStream().catch((err) => {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    });
    resetStreamUI();
  }

  function resetStreamUI(): void {
    streaming = false;
    streamBtn.textContent = 'Start Stream';
    streamBtn.className = 'btn-success';
    singleBtn.disabled = false;
  }

  // Streaming event handler
  api.on('inventoryStream', (event: InventoryStreamEvent) => {
    updateStats(api.tagStorage.count, event.tags.length, event.collisions, event.Q);

    // Auto-restart if the reader stopped but we still want to stream
    if (event.stopped && streaming) {
      const p = getParams();
      api.startInventoryStream({ Q: p.Q, session: p.session, rounds: p.rounds }).catch((err) => {
        showToast(err instanceof Error ? err.message : String(err), 'error');
        resetStreamUI();
      });
    }

    // Schedule a RAF-throttled table update
    dirty = true;
    if (!rafScheduled) {
      rafScheduled = true;
      requestAnimationFrame(() => {
        rafScheduled = false;
        if (dirty) {
          dirty = false;
          renderTable();
        }
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Clear tags
  // ---------------------------------------------------------------------------

  async function doClearTags(): Promise<void> {
    api.tagStorage.clear();
    rowMap.clear();
    tbody.innerHTML = '';
    updateStats(0);

    try {
      await api.clearTags();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  // ---------------------------------------------------------------------------
  // Tag table rendering (efficient diff-update)
  // ---------------------------------------------------------------------------

  function renderTable(): void {
    const tags = api.tagStorage.toArray();
    const seenKeys = new Set<string>();

    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      const key = tag.epcHex;
      seenKeys.add(key);

      const existing = rowMap.get(key);
      if (existing) {
        // Update only changing cells: RSSI, signal bar, antenna, seen, updated
        const cells = existing.cells;
        cells[2].textContent = String(tag.rssi);

        // Signal bar
        const barFill = cells[3].querySelector('.rssi-bar-fill') as HTMLElement;
        if (barFill) {
          barFill.style.width = `${tag.scaledRssi}%`;
          barFill.style.background = rssiColor(tag.scaledRssi);
        }
        const barText = cells[3].lastChild;
        if (barText && barText.nodeType === Node.TEXT_NODE) {
          barText.textContent = ` ${tag.scaledRssi}%`;
        }

        cells[4].textContent = String(tag.antennaId);
        cells[5].textContent = String(tag.updateCount);
        cells[6].textContent = timeAgo(tag.lastSeen);
      } else {
        // Create new row
        const tr = document.createElement('tr');

        // #
        const tdIdx = document.createElement('td');
        tdIdx.textContent = String(i + 1);
        tr.appendChild(tdIdx);

        // EPC
        const tdEpc = document.createElement('td');
        tdEpc.textContent = tag.epcHex;
        tr.appendChild(tdEpc);

        // RSSI (dBm)
        const tdRssi = document.createElement('td');
        tdRssi.textContent = String(tag.rssi);
        tr.appendChild(tdRssi);

        // Signal bar
        const tdSignal = document.createElement('td');
        const barOuter = document.createElement('span');
        barOuter.className = 'rssi-bar';
        const barInner = document.createElement('span');
        barInner.className = 'rssi-bar-fill';
        barInner.style.width = `${tag.scaledRssi}%`;
        barInner.style.background = rssiColor(tag.scaledRssi);
        barOuter.appendChild(barInner);
        tdSignal.appendChild(barOuter);
        tdSignal.appendChild(document.createTextNode(` ${tag.scaledRssi}%`));
        tr.appendChild(tdSignal);

        // Antenna
        const tdAnt = document.createElement('td');
        tdAnt.textContent = String(tag.antennaId);
        tr.appendChild(tdAnt);

        // Seen
        const tdSeen = document.createElement('td');
        tdSeen.textContent = String(tag.updateCount);
        tr.appendChild(tdSeen);

        // Updated
        const tdUpdated = document.createElement('td');
        tdUpdated.textContent = timeAgo(tag.lastSeen);
        tr.appendChild(tdUpdated);

        tbody.appendChild(tr);
        rowMap.set(key, tr);
      }
    }

    // Remove rows for tags no longer in storage (e.g., after clear)
    for (const [key, row] of rowMap) {
      if (!seenKeys.has(key)) {
        row.remove();
        rowMap.delete(key);
      }
    }

    // Update row index numbers
    let idx = 1;
    for (const tag of tags) {
      const row = rowMap.get(tag.epcHex);
      if (row) {
        row.cells[0].textContent = String(idx++);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Connected: enable controls
  // ---------------------------------------------------------------------------

  api.on('connected', () => {
    singleBtn.disabled = false;
    streamBtn.disabled = false;
    clearBtn.disabled = false;
  });

  // ---------------------------------------------------------------------------
  // Disconnected: clean up and disable controls
  // ---------------------------------------------------------------------------

  api.on('disconnected', () => {
    if (streaming) {
      resetStreamUI();
    }
    rowMap.clear();
    tbody.innerHTML = '';
    updateStats(0);
    singleBtn.disabled = true;
    streamBtn.disabled = true;
    clearBtn.disabled = true;
  });
}
