/**
 * Tag Operations panel — scan single, read memory, write memory.
 *
 * Populates `#tag-ops-content` with three sub-sections for common RFID tag
 * operations. Handles error display, hex validation, and confirmation dialogs
 * for destructive write operations.
 */

import { getApi } from '../state.js';
import { $, el, btn, formatHexBlock, hexToBytes, isValidHex, bankName } from '../helpers.js';
import { showToast } from './toast.js';
import { NurApiError } from '@nordicid/nurapi';

export function initTagOpsPanel(): void {
  const container = $('#tag-ops-content');
  const api = getApi();

  // ---------------------------------------------------------------------------
  // Section 1: Scan Single Tag
  // ---------------------------------------------------------------------------

  const scanSection = el('div', 'tag-ops-section') as HTMLDivElement;
  scanSection.appendChild(el('h3', undefined, 'Scan Single Tag'));

  const scanRow = el('div', 'form-row') as HTMLDivElement;
  const scanTimeoutGroup = el('div', 'form-group') as HTMLDivElement;
  const scanTimeoutLabel = document.createElement('label');
  scanTimeoutLabel.textContent = 'Timeout (ms)';
  const scanTimeoutInput = document.createElement('input');
  scanTimeoutInput.type = 'number';
  scanTimeoutInput.min = '100';
  scanTimeoutInput.value = '1000';
  scanTimeoutGroup.appendChild(scanTimeoutLabel);
  scanTimeoutGroup.appendChild(scanTimeoutInput);

  const scanBtn = btn('Scan', 'btn-primary', () => {
    doScanSingle();
  });
  scanBtn.disabled = true;

  scanRow.appendChild(scanTimeoutGroup);
  scanRow.appendChild(scanBtn);
  scanSection.appendChild(scanRow);

  const scanResult = el('div', 'result-box') as HTMLDivElement;
  scanResult.style.display = 'none';
  scanSection.appendChild(scanResult);

  const scanError = el('div', 'error-text') as HTMLDivElement;
  scanError.style.display = 'none';
  scanSection.appendChild(scanError);

  async function doScanSingle(): Promise<void> {
    scanResult.style.display = 'none';
    scanError.style.display = 'none';
    scanBtn.disabled = true;

    try {
      const timeout = Math.max(100, parseInt(scanTimeoutInput.value, 10) || 1000);
      const result = await api.scanSingle(timeout);

      scanResult.textContent =
        `EPC: ${result.epcHex}\n` +
        `RSSI: ${result.rssi} dBm (${result.scaledRssi}%)\n` +
        `Antenna: ${result.antennaId}`;
      scanResult.style.display = '';
    } catch (err) {
      if (err instanceof NurApiError) {
        scanError.textContent = 'No tag found';
      } else {
        scanError.textContent = err instanceof Error ? err.message : String(err);
      }
      scanError.style.display = '';
    } finally {
      scanBtn.disabled = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Section 2: Read Tag Memory
  // ---------------------------------------------------------------------------

  const readSection = el('div', 'tag-ops-section') as HTMLDivElement;
  readSection.appendChild(el('h3', undefined, 'Read Memory'));

  const readRow1 = el('div', 'form-row') as HTMLDivElement;

  const readBankGroup = el('div', 'form-group') as HTMLDivElement;
  const readBankLabel = document.createElement('label');
  readBankLabel.textContent = 'Bank';
  const readBankSelect = document.createElement('select');
  for (let i = 0; i <= 3; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${bankName(i)} (${i})`;
    readBankSelect.appendChild(opt);
  }
  readBankGroup.appendChild(readBankLabel);
  readBankGroup.appendChild(readBankSelect);

  const readAddrGroup = el('div', 'form-group') as HTMLDivElement;
  const readAddrLabel = document.createElement('label');
  readAddrLabel.textContent = 'Word address';
  const readAddrInput = document.createElement('input');
  readAddrInput.type = 'number';
  readAddrInput.min = '0';
  readAddrInput.value = '0';
  readAddrGroup.appendChild(readAddrLabel);
  readAddrGroup.appendChild(readAddrInput);

  const readCountGroup = el('div', 'form-group') as HTMLDivElement;
  const readCountLabel = document.createElement('label');
  readCountLabel.textContent = 'Word count';
  const readCountInput = document.createElement('input');
  readCountInput.type = 'number';
  readCountInput.min = '1';
  readCountInput.value = '4';
  readCountGroup.appendChild(readCountLabel);
  readCountGroup.appendChild(readCountInput);

  readRow1.appendChild(readBankGroup);
  readRow1.appendChild(readAddrGroup);
  readRow1.appendChild(readCountGroup);
  readSection.appendChild(readRow1);

  const readRow2 = el('div', 'form-row') as HTMLDivElement;
  const readEpcGroup = el('div', 'form-group') as HTMLDivElement;
  const readEpcLabel = document.createElement('label');
  readEpcLabel.textContent = 'EPC filter (hex, optional)';
  const readEpcInput = document.createElement('input');
  readEpcInput.type = 'text';
  readEpcInput.placeholder = 'e.g., E200...';
  readEpcGroup.appendChild(readEpcLabel);
  readEpcGroup.appendChild(readEpcInput);

  const readBtn = btn('Read', 'btn-primary', () => {
    doReadMemory();
  });
  readBtn.disabled = true;

  readRow2.appendChild(readEpcGroup);
  readRow2.appendChild(readBtn);
  readSection.appendChild(readRow2);

  const readResult = el('div', 'result-box') as HTMLDivElement;
  readResult.style.display = 'none';
  readSection.appendChild(readResult);

  const readError = el('div', 'error-text') as HTMLDivElement;
  readError.style.display = 'none';
  readSection.appendChild(readError);

  async function doReadMemory(): Promise<void> {
    readResult.style.display = 'none';
    readError.style.display = 'none';
    readBtn.disabled = true;

    try {
      const bank = parseInt(readBankSelect.value, 10);
      const address = Math.max(0, parseInt(readAddrInput.value, 10) || 0);
      const wordCount = Math.max(1, parseInt(readCountInput.value, 10) || 4);

      let epc: Uint8Array | undefined;
      const epcHex = readEpcInput.value.replace(/\s/g, '');
      if (epcHex.length > 0) {
        if (!isValidHex(epcHex)) {
          readError.textContent = 'Invalid EPC hex string';
          readError.style.display = '';
          return;
        }
        epc = hexToBytes(epcHex);
      }

      const data = await api.readTag({ bank, address, wordCount, epc });

      readResult.textContent =
        `${bankName(bank)} @ word ${address}, ${wordCount} words:\n\n` +
        formatHexBlock(data);
      readResult.style.display = '';
    } catch (err) {
      readError.textContent = err instanceof Error ? err.message : String(err);
      readError.style.display = '';
    } finally {
      readBtn.disabled = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Section 3: Write Tag Memory
  // ---------------------------------------------------------------------------

  const writeSection = el('div', 'tag-ops-section') as HTMLDivElement;
  writeSection.appendChild(el('h3', undefined, 'Write Memory'));

  const writeRow1 = el('div', 'form-row') as HTMLDivElement;

  const writeBankGroup = el('div', 'form-group') as HTMLDivElement;
  const writeBankLabel = document.createElement('label');
  writeBankLabel.textContent = 'Bank';
  const writeBankSelect = document.createElement('select');
  for (let i = 0; i <= 3; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${bankName(i)} (${i})`;
    writeBankSelect.appendChild(opt);
  }
  writeBankGroup.appendChild(writeBankLabel);
  writeBankGroup.appendChild(writeBankSelect);

  const writeAddrGroup = el('div', 'form-group') as HTMLDivElement;
  const writeAddrLabel = document.createElement('label');
  writeAddrLabel.textContent = 'Word address';
  const writeAddrInput = document.createElement('input');
  writeAddrInput.type = 'number';
  writeAddrInput.min = '0';
  writeAddrInput.value = '0';
  writeAddrGroup.appendChild(writeAddrLabel);
  writeAddrGroup.appendChild(writeAddrInput);

  writeRow1.appendChild(writeBankGroup);
  writeRow1.appendChild(writeAddrGroup);
  writeSection.appendChild(writeRow1);

  const writeRow2 = el('div', 'form-row') as HTMLDivElement;
  const writeDataGroup = el('div', 'form-group') as HTMLDivElement;
  const writeDataLabel = document.createElement('label');
  writeDataLabel.textContent = 'Hex data';
  const writeDataArea = document.createElement('textarea');
  writeDataArea.rows = 2;
  writeDataArea.placeholder = 'Enter hex data (e.g., AABB CCDD)';
  writeDataGroup.appendChild(writeDataLabel);
  writeDataGroup.appendChild(writeDataArea);
  writeRow2.appendChild(writeDataGroup);
  writeSection.appendChild(writeRow2);

  const writeRow3 = el('div', 'form-row') as HTMLDivElement;
  const writeEpcGroup = el('div', 'form-group') as HTMLDivElement;
  const writeEpcLabel = document.createElement('label');
  writeEpcLabel.textContent = 'EPC filter (hex, optional)';
  const writeEpcInput = document.createElement('input');
  writeEpcInput.type = 'text';
  writeEpcInput.placeholder = 'e.g., E200...';
  writeEpcGroup.appendChild(writeEpcLabel);
  writeEpcGroup.appendChild(writeEpcInput);

  const writeBtn = btn('Write', 'btn-primary', () => {
    doWriteMemory();
  });
  writeBtn.disabled = true;

  writeRow3.appendChild(writeEpcGroup);
  writeRow3.appendChild(writeBtn);
  writeSection.appendChild(writeRow3);

  const writeStatus = el('div') as HTMLDivElement;
  writeStatus.style.display = 'none';
  writeSection.appendChild(writeStatus);

  async function doWriteMemory(): Promise<void> {
    writeStatus.style.display = 'none';
    writeStatus.className = '';
    writeBtn.disabled = true;

    try {
      // Validate hex data
      const hexRaw = writeDataArea.value.replace(/\s/g, '');
      if (hexRaw.length === 0) {
        writeStatus.textContent = 'Please enter hex data to write';
        writeStatus.className = 'error-text';
        writeStatus.style.display = '';
        return;
      }
      if (!/^[0-9a-fA-F]+$/.test(hexRaw)) {
        writeStatus.textContent = 'Invalid hex characters — only 0-9, A-F allowed';
        writeStatus.className = 'error-text';
        writeStatus.style.display = '';
        return;
      }
      if (hexRaw.length % 2 !== 0) {
        writeStatus.textContent = 'Hex data must have an even number of characters';
        writeStatus.className = 'error-text';
        writeStatus.style.display = '';
        return;
      }
      if (hexRaw.length % 4 !== 0) {
        writeStatus.textContent = 'Data must be word-aligned (multiple of 4 hex characters / 2 bytes)';
        writeStatus.className = 'error-text';
        writeStatus.style.display = '';
        return;
      }

      const bank = parseInt(writeBankSelect.value, 10);
      const address = Math.max(0, parseInt(writeAddrInput.value, 10) || 0);
      const data = hexToBytes(hexRaw);

      let epc: Uint8Array | undefined;
      const epcHex = writeEpcInput.value.replace(/\s/g, '');
      if (epcHex.length > 0) {
        if (!isValidHex(epcHex)) {
          writeStatus.textContent = 'Invalid EPC hex string';
          writeStatus.className = 'error-text';
          writeStatus.style.display = '';
          return;
        }
        epc = hexToBytes(epcHex);
      }

      // Confirmation dialog
      if (!confirm('Write data to tag memory?')) {
        return;
      }

      await api.writeTag({ bank, address, data, epc });

      writeStatus.textContent =
        `Successfully wrote ${data.length} bytes to ${bankName(bank)} @ word ${address}`;
      writeStatus.className = 'success-text';
      writeStatus.style.display = '';
      showToast('Write successful', 'success');
    } catch (err) {
      writeStatus.textContent = err instanceof Error ? err.message : String(err);
      writeStatus.className = 'error-text';
      writeStatus.style.display = '';
    } finally {
      writeBtn.disabled = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Assemble sections into container
  // ---------------------------------------------------------------------------

  container.innerHTML = '';
  container.appendChild(scanSection);
  container.appendChild(readSection);
  container.appendChild(writeSection);

  // ---------------------------------------------------------------------------
  // Connected: enable action buttons
  // ---------------------------------------------------------------------------

  api.on('connected', () => {
    scanBtn.disabled = false;
    readBtn.disabled = false;
    writeBtn.disabled = false;
  });

  // ---------------------------------------------------------------------------
  // Disconnected: disable buttons and reset UI
  // ---------------------------------------------------------------------------

  api.on('disconnected', () => {
    scanBtn.disabled = true;
    readBtn.disabled = true;
    writeBtn.disabled = true;
    scanResult.style.display = 'none';
    scanError.style.display = 'none';
    readResult.style.display = 'none';
    readError.style.display = 'none';
    writeStatus.style.display = 'none';
  });
}
