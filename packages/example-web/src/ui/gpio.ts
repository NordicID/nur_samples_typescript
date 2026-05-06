/**
 * GPIO Panel — displays GPIO pin states with toggle controls.
 *
 * Creates a GPIO status table inside `#gpio-content` that shows pin numbers,
 * current HIGH/LOW states, and toggle buttons. Automatically refreshes on
 * connect and updates on ioChange events.
 */

import { getApi } from '../state.js';
import { $, el, btn } from '../helpers.js';
import { showToast } from './toast.js';

/** Placeholder message shown when not connected. */
const PLACEHOLDER_TEXT = 'Connect to a reader to view GPIO status.';

/** Message shown when GPIO is not supported by the module. */
const NOT_AVAILABLE_TEXT = 'GPIO not available on this reader.';

export function initGpioPanel(): void {
  const container = $('#gpio-content');
  const api = getApi();

  /** Track current pin states for toggle logic and ioChange updates. */
  let pinStates: Array<{ number: number; state: number }> = [];

  /** Reference to the table body for live updates. */
  let tableBody: HTMLTableSectionElement | null = null;

  // Show initial placeholder
  showPlaceholder(PLACEHOLDER_TEXT);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function showPlaceholder(message: string): void {
    container.innerHTML = '';
    tableBody = null;
    pinStates = [];
    const placeholder = el('p', 'placeholder', message);
    container.appendChild(placeholder);
  }

  function buildTable(): void {
    container.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'gpio-table';

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const heading of ['Pin', 'State', 'Action']) {
      const th = document.createElement('th');
      th.textContent = heading;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    tableBody = document.createElement('tbody');
    for (let i = 0; i < pinStates.length; i++) {
      const row = createPinRow(i);
      tableBody.appendChild(row);
    }
    table.appendChild(tableBody);

    container.appendChild(table);
  }

  function createPinRow(pinIdx: number): HTMLTableRowElement {
    const pin = pinStates[pinIdx];
    const row = document.createElement('tr');

    // Pin number cell
    const pinCell = document.createElement('td');
    pinCell.textContent = String(pin.number);
    row.appendChild(pinCell);

    // State cell
    const stateCell = document.createElement('td');
    const stateSpan = el(
      'span',
      pin.state ? 'gpio-state-high' : 'gpio-state-low',
      pin.state ? 'HIGH' : 'LOW',
    );
    stateCell.appendChild(stateSpan);
    row.appendChild(stateCell);

    // Toggle button cell
    const actionCell = document.createElement('td');
    const toggleBtn = btn('Toggle', 'btn-sm', async () => {
      try {
        const newState = pin.state ? 0 : 1;
        await api.setGpioStatus(1 << pin.number, [newState]);
        pin.state = newState;
        updateRowState(row, pin.state);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showToast(`GPIO toggle failed: ${msg}`, 'error');
      }
    });
    actionCell.appendChild(toggleBtn);
    row.appendChild(actionCell);

    return row;
  }

  function updateRowState(row: HTMLTableRowElement, state: number): void {
    const stateCell = row.cells[1];
    stateCell.innerHTML = '';
    const stateSpan = el(
      'span',
      state ? 'gpio-state-high' : 'gpio-state-low',
      state ? 'HIGH' : 'LOW',
    );
    stateCell.appendChild(stateSpan);
  }

  // ---------------------------------------------------------------------------
  // Event: connected — fetch GPIO status and build table
  // ---------------------------------------------------------------------------

  api.on('connected', async () => {
    try {
      const states = await api.getGpioStatus();
      pinStates = states.map((s) => ({ number: s.number, state: s.state }));
      if (pinStates.length === 0) {
        showPlaceholder(NOT_AVAILABLE_TEXT);
        return;
      }
      buildTable();
    } catch {
      showPlaceholder(NOT_AVAILABLE_TEXT);
    }
  });

  // ---------------------------------------------------------------------------
  // Event: ioChange — update the relevant pin's state in the table
  // ---------------------------------------------------------------------------

  api.on('ioChange', (data) => {
    if (data.sensor || !tableBody) return;

    // Find the pin by source number
    const pinIdx = pinStates.findIndex((p) => p.number === data.source);
    if (pinIdx === -1) return;

    // Update internal state: direction 1 = HIGH (rising), 0 = LOW (falling)
    pinStates[pinIdx].state = data.direction;

    // Update the DOM row
    const row = tableBody.rows[pinIdx];
    if (row) {
      updateRowState(row, data.direction);
    }
  });

  // ---------------------------------------------------------------------------
  // Event: disconnected — clear content and show placeholder
  // ---------------------------------------------------------------------------

  api.on('disconnected', () => {
    showPlaceholder(PLACEHOLDER_TEXT);
  });
}
