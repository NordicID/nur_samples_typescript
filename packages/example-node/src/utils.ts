/**
 * Shared utilities for console demo scripts.
 *
 * Provides formatted output helpers, SIGINT handling, a common
 * "run demo" harness, and an interactive REPL.
 */

import * as readline from 'node:readline';
import { NurApi, NurApiError, NurError, bytesToHex } from '@nordicid/nurapi';
import type {
  TagEntry,
  InventoryStreamEvent,
} from '@nordicid/nurapi';

// ---------------------------------------------------------------------------
// Console formatting
// ---------------------------------------------------------------------------

/** ANSI color helpers (no dependencies). */
export const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

/** Print a section header. */
export function header(text: string): void {
  console.log(`\n${c.bold}${c.cyan}--- ${text} ---${c.reset}`);
}

/** Print a key-value info line. */
export function info(label: string, value: string | number): void {
  console.log(`  ${c.dim}${label}:${c.reset} ${value}`);
}

/** Print an error message. */
export function error(msg: string): void {
  console.log(`${c.red}Error: ${msg}${c.reset}`);
}

/** Format an EPC hex string with spaces every 4 chars. */
export function formatEpc(epcHex: string): string {
  const parts: string[] = [];
  for (let i = 0; i < epcHex.length; i += 4) {
    parts.push(epcHex.substring(i, i + 4));
  }
  return parts.join(' ');
}

/** Print a single tag entry as a formatted line. */
export function printTag(index: number, tag: TagEntry): void {
  const epc = formatEpc(tag.epcHex);
  const rssi = String(tag.rssi).padStart(4);
  const pct = String(tag.scaledRssi).padStart(3);
  const ant = tag.antennaId;
  console.log(`  ${c.dim}${String(index).padStart(3)}.${c.reset} ${epc}  ${c.yellow}${rssi} dBm${c.reset} (${pct}%)  ant=${ant}`);
}

/** Print a table of tags. */
export function printTagTable(tags: TagEntry[]): void {
  if (tags.length === 0) {
    console.log(`  ${c.dim}(no tags found)${c.reset}`);
    return;
  }
  for (let i = 0; i < tags.length; i++) {
    printTag(i + 1, tags[i]);
  }
}

// ---------------------------------------------------------------------------
// Reader info display
// ---------------------------------------------------------------------------

/** Fetch and display reader identification and capabilities. */
export async function printReaderInfo(api: NurApi): Promise<void> {
  const [versions, readerInfo, caps, setup] = await Promise.all([
    api.getVersions(),
    api.getReaderInfo(),
    api.getDeviceCaps(),
    api.getModuleSetup(),
  ]);

  const regionInfo = await api.getRegionInfo(setup.regionId);

  header('Reader Info');
  info('Name', readerInfo.name);
  info('Serial', readerInfo.serial);
  info('Firmware', `${versions.vMajor}.${versions.vMinor}.${versions.vBuild}`);
  info('Mode', String.fromCharCode(versions.mode));
  info('Hardware', readerInfo.hwVersion);
  info('Antennas', `${readerInfo.numAntennas} / ${readerInfo.maxAntennas}`);
  info('GPIO', String(readerInfo.numGpio));
  info('Regions', String(readerInfo.numRegions));
  info('Region', `${regionInfo.name} (${regionInfo.baseFreq / 1000} MHz, ${regionInfo.channelCount} ch)`);
  info('Max TX', `${caps.maxTxdBm} dBm`);
  info('Tag buffer', `${caps.szTagBuffer} bytes`);
}

// ---------------------------------------------------------------------------
// Common demo flow
// ---------------------------------------------------------------------------

/**
 * Run the standard demo sequence:
 * 1. Connect
 * 2. Ping
 * 3. Print reader info
 * 4. Single inventory
 * 5. 5-second streaming inventory
 * 6. Read TID of first tag (if found)
 * 7. Disconnect
 */
export async function runDemo(api: NurApi, uri: string): Promise<void> {
  // Wire events
  api.on('connecting', () => {
    console.log(`${c.yellow}Connecting to ${uri}...${c.reset}`);
  });
  api.on('connected', () => {
    console.log(`${c.green}Connected!${c.reset}`);
  });
  api.on('disconnected', () => {
    console.log(`${c.dim}Disconnected.${c.reset}`);
  });

  // Install SIGINT handler for clean shutdown
  const shutdown = async () => {
    console.log(`\n${c.yellow}Shutting down...${c.reset}`);
    try {
      await api.stopStreaming();
    } catch {
      // Ignore — may not be streaming
    }
    try {
      await api.disconnect();
    } catch {
      // Ignore
    }
    process.exit(0);
  };
  process.once('SIGINT', () => { void shutdown(); });

  // Connect
  await api.connect(uri);

  // Ping
  header('Ping');
  const t0 = performance.now();
  await api.ping();
  const t1 = performance.now();
  console.log(`  ${c.green}OK${c.reset} (${(t1 - t0).toFixed(1)} ms)`);

  // Reader info
  await printReaderInfo(api);

  // Single inventory
  header('Single Inventory');
  try {
    const result = await api.inventory();
    const tags = await api.fetchTags(true);
    console.log(`  Found ${c.bold}${result.tagsFound}${c.reset} tags (${result.roundsDone} rounds, ${result.collisions} collisions, Q=${result.Q})`);
    printTagTable(tags);

    // Merge into tag storage for the streaming phase
    api.tagStorage.addFromBuffer(tags);
  } catch (err) {
    if (err instanceof NurApiError && err.code === NurError.NO_TAG) {
      console.log(`  ${c.dim}(no tags found)${c.reset}`);
    } else {
      throw err;
    }
  }

  // 5-second streaming inventory
  header('Streaming Inventory (5 seconds)');
  let streamTagCount = 0;
  let streamRounds = 0;

  const onStream = (event: InventoryStreamEvent) => {
    streamTagCount += event.tagsAdded;
    streamRounds += event.roundsDone;

    // Auto-restart when reader stops
    if (event.stopped) {
      api.startInventoryStream().catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  ${c.red}Stream restart failed: ${msg}${c.reset}`);
      });
    }
  };
  api.on('inventoryStream', onStream);

  await api.startInventoryStream();
  console.log(`  ${c.dim}Streaming...${c.reset}`);

  // Wait 5 seconds
  await sleep(5000);

  // Stop streaming
  api.off('inventoryStream', onStream);
  await api.stopStreaming();

  const allTags = api.tagStorage.toArray();
  console.log(`  Stream complete: ${c.bold}${streamTagCount}${c.reset} tag reads in ${streamRounds} rounds`);
  console.log(`  Unique tags in storage: ${c.bold}${allTags.length}${c.reset}`);
  printTagTable(allTags);

  // Read TID of first tag (if any)
  if (allTags.length > 0) {
    header('Read TID (first tag)');
    try {
      const tidData = await api.readTag({
        bank: 2, // TID
        address: 0,
        wordCount: 6,
        epc: allTags[0].epc,
      });
      console.log(`  EPC: ${formatEpc(allTags[0].epcHex)}`);
      console.log(`  TID: ${c.cyan}${bytesToHex(tidData)}${c.reset}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ${c.red}Failed to read TID: ${msg}${c.reset}`);
    }
  }

  // Disconnect
  header('Done');
  await api.disconnect();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Promise-based sleep. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse CLI arguments into positional args and --flag values. */
export function parseArgs(args: string[]): { positional: string[]; flags: Record<string, string> } {
  const positional: string[] = [];
  const flags: Record<string, string> = {};

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        flags[arg.substring(2, eq)] = arg.substring(eq + 1);
      } else {
        flags[arg.substring(2)] = 'true';
      }
    } else if (arg === '-i') {
      flags['interactive'] = 'true';
    } else {
      positional.push(arg);
    }
  }

  return { positional, flags };
}

/**
 * Convert hex string to Uint8Array.
 * Throws if input is not valid even-length hex.
 */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s/g, '');
  if (clean.length % 2 !== 0) {
    throw new Error(`Hex string must have even length, got ${clean.length} characters`);
  }
  if (!/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error('Hex string contains invalid characters');
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Interactive REPL
// ---------------------------------------------------------------------------

/**
 * Run an interactive REPL connected to a NUR reader.
 *
 * Commands: ping, info, inventory, stream start/stop, tags, clear,
 * read, scan, beep, help, quit/exit.
 */
export async function runInteractive(api: NurApi, uri: string): Promise<void> {
  let streaming = false;
  let busy = false;
  let shuttingDown = false;
  let rl: readline.Interface | undefined;

  api.on('connecting', () => console.log(`${c.yellow}Connecting...${c.reset}`));
  api.on('connected', () => console.log(`${c.green}Connected!${c.reset}`));
  api.on('disconnected', () => {
    console.log(`${c.dim}Disconnected.${c.reset}`);
    if (!shuttingDown) {
      console.log(`${c.red}Connection lost unexpectedly.${c.reset}`);
      shuttingDown = true;
      if (rl) rl.close();
      process.exit(1);
    }
  });

  const onStream = (event: InventoryStreamEvent) => {
    const total = api.tagStorage.count;
    if (event.tagsAdded > 0) {
      console.log(`  ${c.green}[+${event.tagsAdded} tags]${c.reset} total: ${c.bold}${total}${c.reset}  rounds=${event.roundsDone}${event.stopped ? ` ${c.yellow}[STOPPED]${c.reset}` : ''}`);
    }
    if (event.stopped && streaming) {
      api.startInventoryStream().catch((err) => {
        error(`Stream restart failed: ${err instanceof Error ? err.message : String(err)}`);
        streaming = false;
        api.off('inventoryStream', onStream);
      });
    }
  };

  console.log(`${c.bold}NUR Interactive CLI${c.reset}`);
  try {
    await api.connect(uri);
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log(`Type ${c.cyan}help${c.reset} for available commands.\n`);

  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${c.cyan}NUR>${c.reset} `,
  });

  rl.prompt();

  rl.on('line', async (line: string) => {
    const input = line.trim();
    if (!input) { rl!.prompt(); return; }
    if (busy) { console.log(`${c.dim}Command in progress, please wait...${c.reset}`); return; }

    const parts = input.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    busy = true;
    try {
      switch (cmd) {
        case 'ping': {
          const t0 = performance.now();
          await api.ping();
          const t1 = performance.now();
          console.log(`${c.green}OK${c.reset} (${(t1 - t0).toFixed(1)} ms)`);
          break;
        }
        case 'info':
          await printReaderInfo(api);
          break;
        case 'inventory':
        case 'inv': {
          const result = await api.inventory();
          const tags = await api.fetchTags(true);
          api.tagStorage.addFromBuffer(tags);
          console.log(`Found ${c.bold}${result.tagsFound}${c.reset} tags (${result.roundsDone} rounds, ${result.collisions} collisions, Q=${result.Q})`);
          printTagTable(tags);
          break;
        }
        case 'stream':
          if (parts[1]?.toLowerCase() === 'stop') {
            if (!streaming) { console.log(`${c.dim}Not streaming.${c.reset}`); }
            else {
              streaming = false;
              api.off('inventoryStream', onStream);
              await api.stopStreaming();
              console.log(`${c.yellow}Stream stopped.${c.reset}`);
              console.log(`Unique tags: ${c.bold}${api.tagStorage.count}${c.reset}`);
            }
          } else if (parts[1]?.toLowerCase() === 'start' || parts[1] === undefined) {
            if (streaming) { console.log(`${c.dim}Already streaming. Use "stream stop" to stop.${c.reset}`); }
            else {
              streaming = true;
              api.on('inventoryStream', onStream);
              await api.startInventoryStream();
              console.log(`${c.green}Streaming...${c.reset} (type "stream stop" to stop)`);
            }
          } else {
            console.log('Usage: stream start | stream stop');
          }
          break;
        case 'tags': {
          const allTags = api.tagStorage.toArray();
          console.log(`${c.bold}${allTags.length}${c.reset} unique tags in storage:`);
          printTagTable(allTags);
          break;
        }
        case 'clear':
          api.tagStorage.clear();
          try { await api.clearTags(); } catch { /* module may not support */ }
          console.log('Tag storage cleared.');
          break;
        case 'read': {
          const bank = parseInt(parts[1], 10);
          const addr = parseInt(parts[2], 10);
          const words = parseInt(parts[3], 10);
          if (isNaN(bank) || isNaN(addr) || isNaN(words)) {
            console.log('Usage: read <bank> <addr> <words> [epc-hex]');
            break;
          }
          const epcHex = parts[4];
          let epc: Uint8Array | undefined;
          if (epcHex && epcHex.length > 0) epc = hexToBytes(epcHex);
          const data = await api.readTag({ bank, address: addr, wordCount: words, epc });
          console.log(`${c.cyan}${bytesToHex(data)}${c.reset}`);
          break;
        }
        case 'scan': {
          const timeout = parts[1] ? parseInt(parts[1], 10) : 1000;
          if (isNaN(timeout) || timeout <= 0) { console.log('Usage: scan [timeout-ms]'); break; }
          const tag = await api.scanSingle(timeout);
          console.log(`EPC: ${formatEpc(tag.epcHex)}  RSSI: ${tag.rssi} dBm (${tag.scaledRssi}%)  ant=${tag.antennaId}`);
          break;
        }
        case 'setup': {
          const setup = await api.getModuleSetup();
          const rfProfileNames = ['Robust', 'Nominal', 'High Speed', 'High Speed 2', 'Fast', 'AutoSet'];
          header('Module Setup');
          info('RF profile', rfProfileNames[setup.rfProfile] ?? String(setup.rfProfile));
          info('Antenna', setup.selectedAntenna === -1 ? 'auto' : String(setup.selectedAntenna));
          info('Inventory Q', setup.inventoryQ === 0 ? 'auto' : String(setup.inventoryQ));
          info('Inventory session', String(setup.inventorySession));
          info('Inventory target', String(setup.inventoryTarget));
          info('Inventory rounds', setup.inventoryRounds === 0 ? 'auto' : String(setup.inventoryRounds));
          break;
        }
        case 'beep':
          await api.beep();
          console.log(`${c.green}Beep!${c.reset}`);
          break;
        case 'help':
          console.log(`
${c.bold}Available commands:${c.reset}
  ${c.cyan}ping${c.reset}                           Ping the reader
  ${c.cyan}info${c.reset}                           Display reader info
  ${c.cyan}inventory${c.reset} / ${c.cyan}inv${c.reset}                Single inventory round
  ${c.cyan}stream start${c.reset}                   Start continuous inventory
  ${c.cyan}stream stop${c.reset}                    Stop streaming
  ${c.cyan}tags${c.reset}                           Show accumulated tags
  ${c.cyan}clear${c.reset}                          Clear tag storage
  ${c.cyan}read${c.reset} <bank> <addr> <words>     Read tag memory
  ${c.cyan}scan${c.reset} [timeout]                 Scan for single tag
  ${c.cyan}setup${c.reset}                          Show module setup
  ${c.cyan}beep${c.reset}                           Beep the reader
  ${c.cyan}help${c.reset}                           Show this help
  ${c.cyan}quit${c.reset} / ${c.cyan}exit${c.reset}                    Disconnect and exit
`);
          break;
        case 'quit':
        case 'exit':
          shuttingDown = true;
          if (streaming) {
            streaming = false;
            api.off('inventoryStream', onStream);
            await api.stopStreaming();
          }
          await api.disconnect();
          rl!.close();
          process.exit(0);
          break;
        default:
          console.log(`Unknown command: ${cmd}. Type "help" for available commands.`);
      }
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
    } finally {
      busy = false;
    }
    rl!.prompt();
  });

  rl.on('close', () => {
    if (!shuttingDown) {
      shuttingDown = true;
      void api.disconnect().catch(() => {});
      process.exit(0);
    }
  });

  process.on('SIGINT', () => {
    console.log();
    shuttingDown = true;
    if (streaming) {
      streaming = false;
      api.off('inventoryStream', onStream);
      void api.stopStreaming().catch(() => {});
    }
    void api.disconnect().catch(() => {});
    rl!.close();
    process.exit(0);
  });
}
