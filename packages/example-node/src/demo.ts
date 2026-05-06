#!/usr/bin/env tsx
/**
 * NUR RFID Reader Demo — unified entry point.
 *
 * Usage:
 *   npx tsx src/demo.ts                              # discover devices
 *   npx tsx src/demo.ts ser://COM3                    # connect directly, run demo
 *   npx tsx src/demo.ts tcp://192.168.1.100:4333 -i   # connect, interactive REPL
 *   npx tsx src/demo.ts wss://192.168.1.100/wsp/4333  # WebSocket
 *
 * Flags:
 *   -i, --interactive   Launch interactive REPL instead of automated demo
 */

// Side-effect import — registers ser://, tcp:// transports and discoverers
import '@nordicid/nurapi-node';

import * as readline from 'node:readline';
import { NurApi, NurDeviceDiscovery } from '@nordicid/nurapi';
import type { DiscoveredDevice } from '@nordicid/nurapi';
import { c, error, runDemo, runInteractive, parseArgs } from './utils.js';

async function main(): Promise<void> {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const interactive = flags['interactive'] === 'true';
  let uri = positional[0];

  if (!uri) {
    uri = await discoverAndSelect();
  }

  console.log(`${c.bold}NUR RFID Reader Demo${c.reset}`);
  console.log(`URI: ${c.cyan}${uri}${c.reset}  Mode: ${interactive ? 'interactive' : 'demo'}\n`);

  const api = new NurApi({ autoReconnect: false });

  if (interactive) {
    await runInteractive(api, uri);
  } else {
    await runDemo(api, uri);
  }
}

/**
 * Run device discovery and let the user pick a device.
 * Returns the selected device URI.
 */
async function discoverAndSelect(): Promise<string> {
  console.log(`${c.bold}NUR Device Discovery${c.reset}`);
  console.log(`${c.dim}Scanning for NUR readers... (press Ctrl+C to cancel)${c.reset}\n`);

  const discovery = new NurDeviceDiscovery();
  const devices: DiscoveredDevice[] = [];

  return new Promise<string>((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const printDeviceList = () => {
      if (devices.length === 0) return;
      console.log(`\n${c.bold}Found devices:${c.reset}`);
      for (let i = 0; i < devices.length; i++) {
        const d = devices[i];
        const meta = d.metadata.manufacturer ? ` (${d.metadata.manufacturer})` : '';
        console.log(`  ${c.cyan}${i + 1}.${c.reset} ${d.name}${meta}  ${c.dim}${d.uri}${c.reset}`);
      }
      console.log(`\n${c.dim}Enter number to connect, or type a URI directly:${c.reset}`);
    };

    discovery.on('deviceDiscovery', (device) => {
      if (device.visible) {
        // Avoid duplicates (discovery dedup handles timing, but we track our own list)
        if (!devices.some((d) => d.uri === device.uri)) {
          devices.push(device);
          const idx = devices.length;
          const meta = device.metadata.manufacturer ? ` (${device.metadata.manufacturer})` : '';
          console.log(`  ${c.green}[${idx}]${c.reset} ${device.name}${meta}  ${c.dim}${device.uri}${c.reset}`);
        }
      } else {
        const idx = devices.findIndex((d) => d.uri === device.uri);
        if (idx !== -1) {
          console.log(`  ${c.red}[-]${c.reset} ${device.name} disappeared`);
          devices.splice(idx, 1);
          printDeviceList();
        }
      }
    });

    discovery.on('error', (err) => {
      error(err.message);
    });

    discovery.start({ intervalMs: 3000 });

    rl.on('line', (line) => {
      const input = line.trim();
      if (!input) return;

      // Check if it's a number (device index)
      const num = parseInt(input, 10);
      if (!isNaN(num) && num >= 1 && num <= devices.length) {
        const selected = devices[num - 1];
        console.log(`\n${c.green}Selected: ${selected.name} (${selected.uri})${c.reset}\n`);
        cleanup();
        resolve(selected.uri);
        return;
      }

      // Check if it looks like a URI
      if (input.includes('://')) {
        console.log(`\n${c.green}Using: ${input}${c.reset}\n`);
        cleanup();
        resolve(input);
        return;
      }

      console.log(`${c.dim}Enter a device number (1-${devices.length}) or a URI:${c.reset}`);
    });

    const cleanup = () => {
      discovery.stop();
      rl.close();
    };

    process.once('SIGINT', () => {
      console.log();
      cleanup();
      process.exit(0);
    });
  });
}

main().catch((err) => {
  error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
