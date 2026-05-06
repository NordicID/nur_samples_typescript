# @nordicid/nurapi — API Reference

> Generated: 2026-05-05 21:12:34 UTC  
> Package version: `0.9.3`  
> Source: TypeDoc + hand-written articles

Single-file reference for the `@nordicid/nurapi` TypeScript library. The Guide section covers common workflows with examples; the API Reference section enumerates every public type and member. Headings are predictable and greppable — search for `Class \`X\``, `Function \`Y\``, etc.

## Guide

## Overview

`@nordicid/nurapi` is Nordic ID's TypeScript library for working with NUR-based
UHF RFID readers. It runs in browsers (Web Serial, Web Bluetooth), Node.js
(serial port, TCP socket), and any JavaScript environment that supports
WebSocket — with zero native dependencies for the core package.

This document is the single-file API reference for the TypeScript library.
Hand-written guides cover the most common workflows; the full API reference
section enumerates every public type and member.

### Packages

The library ships as three packages. Pick the platform packages you need
alongside the core:

| Package | Provides |
|---|---|
| `@nordicid/nurapi` | Core library: protocol engine, command API, typed events, WebSocket transport. |
| `@nordicid/nurapi-web` | Browser transports: Web Serial (`ser://`), Web Bluetooth (`ble://`). |
| `@nordicid/nurapi-node` | Node.js transports: serial port (`ser://`), TCP socket (`tcp://`). |

| Environment | Install |
|---|---|
| Node.js (serial port, TCP) | `@nordicid/nurapi` + `@nordicid/nurapi-node` |
| Browser (Web Serial, Web Bluetooth) | `@nordicid/nurapi` + `@nordicid/nurapi-web` |
| WebSocket only (any environment, zero native deps) | `@nordicid/nurapi` |

Platform transport packages register URI schemes as side effects on import — no
manual setup required:

```typescript
import '@nordicid/nurapi-node'; // registers ser:// and tcp://
import '@nordicid/nurapi-web';  // registers ser:// and ble:// (browser)
```

### Capabilities at a glance

- URI-based connection (`tcp://`, `ser://`, `ble://`, `ws://`)
- Auto-reconnect with exponential backoff
- Single-shot and streaming (continuous) inventories
- Tag read / write across all Gen2 memory banks (EPC, TID, User, Reserved)
- Inventory + read combined
- Multi-criteria tag filtering via `inventoryEx`
- Module configuration (TX power, RF profile, antennas, sessions)
- GPIO pin control and sensor events
- Gen2 version 2 commands (Authenticate, Untraceable, ReadBuffer)
- ISO 29167-10 tag authentication (TAM1/TAM2) with AES decryption
- Accessory device control (EXA51, EXA31 — barcode, LEDs, vibra, sensors)
- NXP extensions (EAS alarm, UCODE DNA)
- Diagnostics and firmware info
- Typed events for every reader notification

### Supported environments

- **Node.js** 18+ — serial port and TCP via `@nordicid/nurapi-node`
- **Browser** — Web Serial and Web Bluetooth via `@nordicid/nurapi-web` (Chromium-based browsers only)
- **Any JS runtime** — WebSocket transport is built into the core package

### Typical workflow

1. Create a `NurApi` instance.
2. Import the transport package for your platform.
3. Connect via URI string.
4. Configure the module (TX power, antennas, session, etc.).
5. Run inventories (single-shot or streaming) and/or read/write tag memory.
6. Disconnect.

Each step is covered in the following articles.

## Connecting to a Reader

```typescript
import { NurApi } from '@nordicid/nurapi';
import '@nordicid/nurapi-node'; // registers ser:// and tcp://

const reader = new NurApi();

reader.on('connected',    () => console.log('Connected'));
reader.on('disconnected', () => console.log('Disconnected'));

await reader.connect('tcp://192.168.1.100');
const info = await reader.getReaderInfo();
console.log(`Reader: ${info.name}, FW ${info.swVersion.join('.')}`);

await reader.disconnect();
```

`connect()` accepts any URI string whose scheme is registered with the
transport registry. The WebSocket scheme (`ws://`, `wss://`) is built into the
core package; serial, TCP, and Bluetooth are provided by the platform transport
packages.

### URI schemes

| Scheme | Transport | Package | Example |
|---|---|---|---|
| `ser://` | Serial port | `@nordicid/nurapi-node` | `ser://COM3`, `ser:///dev/ttyUSB0` |
| `ser://request` | Web Serial (browser prompt) | `@nordicid/nurapi-web` | `ser://request` |
| `ble://request` | Web Bluetooth (browser prompt) | `@nordicid/nurapi-web` | `ble://request` |
| `tcp://` | TCP socket | `@nordicid/nurapi-node` | `tcp://192.168.1.100:4333` |
| `ws://` / `wss://` | WebSocket | `@nordicid/nurapi` (core) | `ws://host:8080` |

> **Browser APIs require a user gesture** — `ser://request` and `ble://request`
> must be called from a click handler. Chromium-based browsers only.

### Transport registry

Schemes are managed by `NurTransportRegistry`. Platform packages register
their transports as a side effect of `import`:

```typescript
import '@nordicid/nurapi-node'; // registers ser:// and tcp://
import '@nordicid/nurapi-web';  // registers ser:// and ble://
```

Custom transports can be registered via:

```typescript
import { NurTransportRegistry } from '@nordicid/nurapi';
NurTransportRegistry.register('myscheme', MyTransportFactory);
```

### Auto-reconnect

Auto-reconnect is **enabled by default**. When the connection drops, NurApi
retries with exponential backoff (1 s → 30 s cap), emitting `connecting` /
`disconnected` events on each attempt. An explicit `disconnect()` call stops
the reconnection cycle.

```typescript
const reader = new NurApi({
  autoReconnect: true,          // default
  reconnectInterval: 1000,      // initial retry (ms)
  maxReconnectInterval: 30000,  // cap (ms)
});

// Toggle at runtime
reader.autoReconnect = false;
```

> **Pending operations are not replayed.** A reconnect re-establishes the
> transport but does not re-issue commands that were in flight when the
> connection dropped. After `connected` fires, re-send any commands the
> application still cares about.

### Connection events

```typescript
reader.on('connecting', () => console.log('Connecting...'));
reader.on('connected',  () => console.log('Connected'));
reader.on('disconnected', () => console.log('Disconnected'));
```

The `connectionStatus` property returns the current state as a
`ConnectionStatus` enum: `'disconnected'`, `'connecting'`, or `'connected'`.

### Identifying the reader

Once connected, `getReaderInfo()` returns serial number, firmware version,
antenna count, and more:

```typescript
const info = await reader.getReaderInfo();
console.log(`Serial: ${info.serial}`);
console.log(`FW: ${info.swVersion.join('.')}`);
console.log(`Antennas: ${info.numAntennas} (max ${info.maxAntennas})`);

const caps = await reader.getDeviceCaps();
console.log(`Max TX: ${caps.maxTxdBm} dBm (${caps.maxTxmW} mW)`);
```

## Configuring the Reader

Reader configuration goes through `ModuleSetup`. The pattern is:

1. Read the current setup.
2. Change the fields you care about.
3. Apply the change with `setModuleSetup`.
4. Optionally persist to flash with `storeSetup`.

```typescript
// Read current setup
const setup = await reader.getModuleSetup();
console.log(`TX level: ${setup.txLevel}`);
console.log(`Region: ${setup.regionId}`);
console.log(`RF profile: ${setup.rfProfile}`);

// Change settings
await reader.setModuleSetup({
  txLevel: 0,            // 0 = max power
  inventoryQ: 4,
  inventorySession: 0,
  rfProfile: 1,          // NOMINAL
  antennaMaskEx: 0x03,   // antennas 1 and 2
  selectedAntenna: -1,   // auto-select
});

// Save to non-volatile flash
await reader.storeSetup();
```

### Antennas

- `antennaMaskEx` selects which antennas participate (bitmask, bit 0 = antenna 1).
- `selectedAntenna` picks a specific antenna ID, or `-1` for auto-select (round-robin through enabled antennas).

```typescript
await reader.setAntenna(0x01);  // antenna 1 only
await reader.setAntenna(0x0F);  // antennas 1–4

const mask = await reader.getAntenna();
```

### TX power

`txLevel` is an attenuation index: `0` = maximum power, higher values reduce
output. The actual dBm depends on the reader model — check
`DeviceCaps.maxTxdBm` and `DeviceCaps.txSteps` for the available range.

### RF profiles

RF profiles combine link frequency, RX decoding (Miller), TX modulation, and
Tari into named presets. Prefer `rfProfile` over setting those individually.

| Profile | Value | Description |
|---|---|---|
| ROBUST | 0 | Best for noisy RF environments |
| NOMINAL | 1 | Good for most environments (default) |
| HIGHSPEED | 2 | Best throughput, sensitive to interference |
| HIGHSPEED_2 | 3 | Reduced Tari for faster PIE encoding |
| FAST | 4 | Balance between speed and sensitivity |
| AUTOSET | 5 | Module auto-selects based on conditions |

### Auto-inventory power saving (periodSetup)

The `periodSetup` field controls RF duty cycling during inventory streaming.
It reduces power consumption by inserting sleep periods between inventory rounds.
Use `NurAutoPeriod` enum values:

| Mode | Value | Description |
|---|---|---|
| OFF | 0 | No duty cycling (default) |
| CYCLE_25 | 1 | Max ~1000 ms off time (~25% duty cycle) |
| CYCLE_33 | 2 | Max ~500 ms off time (~33% duty cycle) |
| CYCLE_50 | 3 | Max ~100 ms off time (~50% duty cycle) |
| FORCE_1000MS | 4 | Forced 1000 ms sleep between rounds |
| FORCE_500MS | 5 | Forced 500 ms sleep between rounds |
| FORCE_100MS | 6 | Forced 100 ms sleep between rounds |

CYCLE values set a *maximum* off-time — the module may resume sooner.
FORCE values guarantee the specified sleep duration.

```typescript
import { NurAutoPeriod } from '@nordicid/nurapi';

// Enable 50% duty cycle for battery-powered operation
await reader.setModuleSetup({
  periodSetup: NurAutoPeriod.CYCLE_50,
});
```

### Region

The `regionId` field controls regulatory RF parameters (frequencies, power
limits, duty cycle). It should normally match the physical operating region.
Use `getRegionInfo(id)` to inspect available channels and limits.

## Simple Inventory

A single inventory round scans for tags and stores them in the reader
module's tag buffer. The host then fetches the results.

```typescript
await reader.clearTags();              // discard any previous reads
const result = await reader.inventory();
console.log(`Found ${result.tagsFound} tags in ${result.roundsDone} rounds`);

const tags = await reader.fetchTags();
for (const tag of tags) {
  console.log(`  ${tag.epcHex}  RSSI: ${tag.rssi} dBm  Ant: ${tag.antennaId}`);
}
```

Calling `inventory()` without arguments uses whatever Q, session, rounds,
antennas and TX power are currently configured via
[Module Configuration](03-configuring-reader.md). For per-call overrides
(transit time, target flag, SL state) and filters, see
[Inventory Parameters](06-inventory-params.md) and
[Inventory Filters](07-inventory-filters.md).

### Per-call overrides

Override Q, session, and round count without touching the global setup:

```typescript
const result = await reader.inventory({ Q: 4, session: 0, rounds: 5 });
```

| Parameter | Range | Description |
|---|---|---|
| `Q`       | 0–15  | Number of tag slots per round. 0 = automatic. |
| `session` | 0–3   | Gen2 session for inventory. |
| `rounds`  | 0–10  | Full query rounds. 0 = automatic. |

For everything else (`transitTime`, `inventoryTarget`, `inventorySelState`,
filters), use [`inventoryEx`](06-inventory-params.md).

### When to use simple vs. streaming inventory

| Use simple `inventory()` when… | Use `startInventoryStream()` when… |
|---|---|
| You want a single snapshot                | You need continuous monitoring |
| Reads are user-triggered                  | The application reacts to tag arrivals/exits |
| You can tolerate a short blocking call    | Latency matters |

### Error handling

All NurApi commands throw `NurApiError` on failure:

```typescript
import { NurApiError, NurError } from '@nordicid/nurapi';

try {
  await reader.inventory();
} catch (e) {
  if (e instanceof NurApiError) {
    console.error(`NUR error ${e.code}: ${e.message}`);
  }
}
```

See [Errors and Events](09-errors-and-events.md) for the full error catalogue.

## Streaming Inventory

Streaming inventory runs continuously on the reader module, delivering tags via
events. This is the preferred method for real-time tag monitoring.

```typescript
reader.on('inventoryStream', (event) => {
  console.log(`Stream: ${event.tagsAdded} new, stopped=${event.stopped}`);

  // Access accumulated tags
  for (const tag of reader.tagStorage.toArray()) {
    console.log(`  ${tag.epcHex} seen ${tag.updateCount}x, RSSI: ${tag.rssi}`);
  }

  // Restart when the reader pauses (normal behavior)
  if (event.stopped) {
    reader.startInventoryStream();
  }
});

await reader.startInventoryStream();
```

### Stopping

```typescript
await reader.stopInventoryStream();
// or stop all continuous operations:
await reader.stopStreaming();
```

### Tag storage

During streaming, tags accumulate in `reader.tagStorage`. It deduplicates by
EPC and tracks per-tag statistics (RSSI, update count, antenna, timestamp).

```typescript
const allTags = reader.tagStorage.toArray();
const count = reader.tagStorage.count;

// Clear storage and module buffer
reader.tagStorage.clear();
await reader.clearTags();
```

### Filtered streaming

For tuning per-call parameters (transit time, target flag, SL state), see
[Inventory Parameters](06-inventory-params.md). For tag-population
filtering, see [Inventory Filters](07-inventory-filters.md) — both
`startInventoryExStream(params)` and `startInventorySelectStream(params)`
are documented there.

## Inventory Parameters (`inventoryEx`)

`inventoryEx` is the advanced variant of `inventory`. It accepts an
`InventoryExParams` object and an optional array of filters, giving you
per-call control without mutating the global module setup.

```typescript
import { NurInventoryTarget, NurInventorySelState } from '@nordicid/nurapi';

const result = await reader.inventoryEx({
  Q: 0,                                       // auto
  session: 0,
  rounds: 0,                                  // auto
  inventoryTarget: NurInventoryTarget.A,
  inventorySelState: NurInventorySelState.SL,
  transitTime: 0,                             // no time cap
});
console.log(`Tags: ${result.tagsFound}`);
```

Every field is optional and defaults to `0`, so idiomatic calls only set what
they need:

```typescript
await reader.inventoryEx({ Q: 4, session: 0, rounds: 5 });
```

### Field reference

| Field               | Purpose                                                              |
|---------------------|----------------------------------------------------------------------|
| `Q`                 | Slot-count exponent (`2^Q`). `0` = auto.                             |
| `session`           | Gen2 session: `0`–`3` (see `NurInventorySession`).                   |
| `rounds`            | Number of complete Q rounds. `0` = auto. Overridden by `transitTime`. |
| `transitTime`       | Hard time limit in milliseconds (subject to regional channel-time rules). `0` = no cap. |
| `inventoryTarget`   | Read tags with inventoried flag `A`, `B`, or both. See `NurInventoryTarget`. |
| `inventorySelState` | SL flag filter: `ALL`, `SL`, `NOTSL`. See `NurInventorySelState`.    |
| `flags`             | Reserved protocol flags. Leave `0`.                                  |
| `filters`           | Optional select-filter array. See [Inventory Filters](07-inventory-filters.md). |

### Choosing values

- **Q = 0 (auto)** is almost always the right starting point.
- **Sessions S2 / S3** keep tags silent between reads — useful in dense
  populations and around metal where re-reads waste airtime.
- **`transitTime`** is your friend in time-bounded scenarios (e.g. user
  pulling the trigger for ≤500 ms); when nonzero it overrides `rounds`.

### Streaming variant

The same parameter object drives the streaming form:

```typescript
import { NurInventoryTarget } from '@nordicid/nurapi';

await reader.startInventoryExStream({
  Q: 4,
  session: 1,
  inventoryTarget: NurInventoryTarget.A,
});
```

### Combining with filters

Pass a `filters` array to restrict the inventory to specific tags by EPC, TID,
USER, or password-bank prefix. See
[Inventory Filters](07-inventory-filters.md) for the filter shape and
examples.

## Inventory Filters

`InventoryExFilter` lets you restrict an `inventoryEx` (or filtered stream)
to a subset of tags by matching a bit-pattern in any memory bank. Multiple
filters are evaluated together, allowing complex AND/OR criteria.

```typescript
import {
  NurBank,
  NurFilterAction,
  NurInventorySelState,
  NurInventorySession,
  NurInventoryTarget,
} from '@nordicid/nurapi';

const result = await reader.inventoryEx({
  Q: 0,                                        // 0 = auto Q
  session: NurInventorySession.S0,             // use session S0
  rounds: 0,                                   // 0 = auto rounds
  inventoryTarget: NurInventoryTarget.A,       // query tags with flag A
  inventorySelState: NurInventorySelState.SL,  // only SL-asserted tags reply
  filters: [
    {
      // Assert SL for tags whose EPC starts with AA:BB:CC:DD;
      // deassert SL for all others.
      target: 4,                                       // operate on the SL flag
      action: NurFilterAction.FACTION_0,               // match -> assert, no match -> deassert
      bank: NurBank.EPC,
      address: 32,                                     // bit offset - first 32 bits are CRC + PC
      maskBitLen: 32,                                  // compare 4 bytes (32 bits)
      maskData: new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD]),
    },
    {
      // Additionally require 11:22:33 at the start of user memory.
      // Matching tags keep SL asserted; non-matching are left unchanged.
      target: 4,
      action: NurFilterAction.FACTION_1,               // match -> assert, no match -> unchanged
      bank: NurBank.USER,
      address: 0,                                      // bit offset - start of user memory
      maskBitLen: 24,                                  // compare 3 bytes (24 bits)
      maskData: new Uint8Array([0x11, 0x22, 0x33]),
    },
  ],
});
```

### Single-filter shortcut

For the common case of one selection mask, `inventorySelect` is more compact:

```typescript
const result = await reader.inventorySelect({
  bank: NurBank.EPC,
  address: 32,                                  // bits, real EPC starts here
  maskData: new Uint8Array([0xE2, 0x00]),       // match tags whose EPC starts with E2 00
  Q: 4,
  session: NurInventorySession.S0,
  rounds: 5,
});
```

### Streaming variants

Both forms have streaming counterparts:

- `startInventoryExStream(params)` — multi-filter stream; tags arrive on the `inventoryEx` event.
- `startInventorySelectStream(params)` — single-filter stream; tags arrive on the `inventoryStream` event.

Stop with `stopInventoryExStream()` or `stopInventoryStream()` respectively.

### `InventoryExFilter` field reference

| Field        | Purpose                                                           |
|--------------|-------------------------------------------------------------------|
| `target`     | Flag the action affects: SL flag (4) or session S0–S3 (0–3).      |
| `action`     | Gen2 select action (`FACTION_0` … `FACTION_7`) — see below.       |
| `bank`       | Memory bank: `NurBank.EPC`, `NurBank.TID`, `NurBank.USER`, `NurBank.PASSWD`. |
| `address`    | Start **bit** address in the bank (uint32).                       |
| `maskBitLen` | Number of bits to compare. Defaults to `maskData.length * 8`.     |
| `maskData`   | Mask bytes (left-aligned to `maskBitLen`).                        |
| `truncate`   | Reserved — leave `0` (default).                                   |

#### `target` values

| Value | Meaning              |
|-------|----------------------|
| 0     | Inventoried flag, S0 |
| 1     | Inventoried flag, S1 |
| 2     | Inventoried flag, S2 |
| 3     | Inventoried flag, S3 |
| 4     | SL flag              |

#### `NurFilterAction` quick reference

`FACTION_n` follows the Gen2 standard. The most useful ones:

- `FACTION_0` — matching tags asserted, others deasserted (default "include").
- `FACTION_1` — matching tags asserted, others untouched.
- `FACTION_4` — matching tags deasserted, others asserted ("exclude").

### Tips

- Address is in **bits**, not bytes. The first 32 bits of `NurBank.EPC` are
  PC + CRC; real EPC content begins at bit 32.
- A filter that matches no tag does not raise an error — the call simply
  returns zero tags.
- Combine filters cumulatively: subsequent filters operate on the population
  left by previous ones.
- Omitted optional fields (`truncate`, `target`, `action`) default to `0`.

## Tag Access

### Reading

```typescript
import { NurBank } from '@nordicid/nurapi';

// Read 4 words (8 bytes) from TID, starting at word address 0
const tid = await reader.readTag({
  bank: NurBank.TID,
  address: 0,
  wordCount: 4,
});
console.log('TID:', bytesToHex(tid));
```

To target a specific tag, pass the `epc` parameter for singulation:

```typescript
const userData = await reader.readTag({
  bank: NurBank.USER,
  address: 0,
  wordCount: 8,
  epc: new Uint8Array([0xE2, 0x00, 0x12, 0x34, ...]),
});
```

### Writing

```typescript
// Write 4 bytes to user memory at word address 0
await reader.writeTag({
  bank: NurBank.USER,
  address: 0,
  data: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
});

// Write singulated by EPC
await reader.writeTag({
  bank: NurBank.USER,
  address: 0,
  data: new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]),
  epc: targetEpc,
});
```

### Writing EPC

`writeEpc` writes a new EPC to a tag's EPC memory bank, handling the PC word
and length automatically:

```typescript
await reader.writeEpc({
  currentEpc: existingTag.epc,
  newEpc: new Uint8Array([
    0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF,
    0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
  ]),
});
```

### Memory banks

| Bank | Value | Contents |
|---|---|---|
| `NurBank.PASSWD` | 0 | Kill and access passwords (Reserved bank) |
| `NurBank.EPC` | 1 | CRC, PC word, EPC data |
| `NurBank.TID` | 2 | Tag identifier (read-only on most tags) |
| `NurBank.USER` | 3 | User-defined memory |

### Locking

`lockTag` controls read/write access to memory areas. Use with care —
permalock is **irreversible**.

```typescript
await reader.lockTag({
  password: 0x12345678,
  lockMask: lockMask,
  lockAction: lockAction,
  epc: targetEpc,
});
```

### Kill

`killTag` permanently disables a tag. The tag's kill password must be set
(non-zero) and provided:

```typescript
await reader.killTag({
  password: killPassword,
  epc: targetEpc,
});
```

> **Warning**: Killing a tag is **irreversible**. The tag will never respond
> to any command again.

## Errors and Events

### Exceptions

Every NurApi command returns a Promise. Errors are thrown as `NurApiError`:

```typescript
import { NurApiError, NurError } from '@nordicid/nurapi';

try {
  await reader.inventory();
} catch (e) {
  if (e instanceof NurApiError) {
    console.error(`NUR error ${e.code}: ${e.message}`);

    if (e.code === NurError.NO_TAG) {
      console.log('No tags found');
    } else if (e.code === NurError.TR_NOT_CONNECTED) {
      console.log('Not connected');
    }
  }
}
```

Common error codes from `NurError`:

| Code | Name | Description |
|---|---|---|
| 0x01 | `INVALID_COMMAND` | Invalid command sent to module |
| 0x04 | `RECEIVE_TIMEOUT` | Data receive timeout |
| 0x20 | `NO_TAG` | No tag(s) found |
| 0x22 | `G2_SELECT` | Tag not selectable (not in field) for RF operation |
| 0x30 | `G2_READ` | Gen2 read error |
| 0x40 | `G2_WRITE` | Gen2 write error |

### Events

NurApi emits typed events for connection lifecycle and reader notifications:

```typescript
// Connection
reader.on('connecting',    () => { /* ... */ });
reader.on('connected',     () => { /* ... */ });
reader.on('disconnected',  () => { /* ... */ });

// Streaming
reader.on('inventoryStream', (event) => { /* ... */ });
reader.on('inventoryEx',     (event) => { /* ... */ });

// GPIO / Sensors
reader.on('ioChange',     (event) => { /* ... */ });
reader.on('triggerRead',  (event) => { /* ... */ });

// Tag operations
reader.on('traceTag',     (event) => { /* ... */ });

// Diagnostics
reader.on('diagReport',    (event) => { /* ... */ });
reader.on('debugMessage',  (event) => { /* ... */ });

// Reader lifecycle
reader.on('boot',          (event) => { /* ... */ });

// RF
reader.on('hopEvent',      (event) => { /* ... */ });
reader.on('autoTune',      (event) => { /* ... */ });

// NXP EAS
reader.on('nxpAlarm',      (event) => { /* ... */ });

// Catch-all for raw notifications
reader.on('notification',  (packet) => { /* ... */ });
```

### Logging

```typescript
import { NurApi } from '@nordicid/nurapi';
import type { LogLevel } from '@nordicid/nurapi';

const reader = new NurApi({ logLevel: 'verbose' });

// Or set at runtime
reader.logLevel = 'info';
```

Log levels (most to least severe): `'error'`, `'warning'`, `'info'`, `'verbose'`.

## Gen2X Features

Gen2X extends the standard Gen2 protocol with Impinj-specific features such
as **FastID**, **TagFocus**, and **ScanID**. These features require Impinj
Monza or M700-series tags and a reader that supports Gen2X.

Check `getDeviceCaps()` before enabling Gen2X — not all readers support it.

### Reading and writing the Gen2X configuration

```typescript
import { NurGen2XFlags } from '@nordicid/nurapi';

// Read current Gen2X config
const cfg = await reader.getGen2XConfig();

// Modify and apply
cfg.flags = NurGen2XFlags.ENABLE_FASTID | NurGen2XFlags.ENABLE_TAGFOCUS;
cfg.inventoryMode = 1; // 0=Gen2, 1=Gen2X, 2=Hybrid
await reader.setGen2XConfig(cfg);
```

Always read-modify-write so existing fields (PIN, ScanID parameters) are
preserved.

### Feature flags

Set the `flags` field using `NurGen2XFlags` (combinable with `|`):

| Flag                              | Description                                              |
|-----------------------------------|----------------------------------------------------------|
| `ENABLE_SCANID`                   | Enable ScanID feature                                    |
| `ENABLE_TAGFOCUS`                 | Enable TagFocus — only un-inventoried tags respond       |
| `ENABLE_FASTID`                   | Enable FastID — tag reports TID alongside EPC            |
| `ACCEPT_CRC5_CRC5PLUS`            | Accept both CRC5 and CRC5Plus for collision resolution   |
| `POWER_BOOST`                     | Enable power boost feature                               |
| `ENABLE_PROTECTED_MODE`           | Enable protected mode (requires `protectedModePin`)      |
| `ALL_FLAGS`                       | All supported flags combined                             |

### Inventory mode

The `inventoryMode` field controls how the reader communicates with tags:

| Value | Mode   | Description                                              |
|-------|--------|----------------------------------------------------------|
| `0`   | Gen2   | Standard Gen2 only — Gen2X features are not used         |
| `1`   | Gen2X  | Gen2X protocol — only Gen2X-capable tags will respond    |
| `2`   | Hybrid | Reader alternates between Gen2 and Gen2X rounds          |

### FastID

FastID makes the tag include its TID memory in every inventory response,
eliminating the need for a separate read command per tag.

```typescript
import { NurGen2XFlags } from '@nordicid/nurapi';

const cfg = await reader.getGen2XConfig();
cfg.flags = NurGen2XFlags.ENABLE_FASTID;
cfg.inventoryMode = 1;
await reader.setGen2XConfig(cfg);

await reader.clearTags();
await reader.inventory();

const tags = await reader.fetchTags();
for (const tag of tags) {
  // With FastID enabled, TID data is appended to the EPC payload
  console.log(tag.epc);
}
```

### TagFocus

TagFocus causes only tags that have not yet been inventoried to respond. This
is useful in dense populations where you want to find new tags quickly without
re-reading known ones.

```typescript
const cfg = await reader.getGen2XConfig();
cfg.flags = NurGen2XFlags.ENABLE_TAGFOCUS;
cfg.inventoryMode = 1;
await reader.setGen2XConfig(cfg);
```

### ScanID

ScanID is an optimized inventory mode for reading large tag populations. It
uses shorter collision-resolution identifiers and configurable encoding.

```typescript
const cfg = await reader.getGen2XConfig();
cfg.flags = NurGen2XFlags.ENABLE_SCANID;
cfg.inventoryMode = 1;

// ScanID parameters
cfg.scanCodeType       = 1; // 0=Rfu, 1=Antipodal, 2=CCOneHalf, 3=CCThreeQuarters
cfg.scanCRType         = 0; // 0=ID32, 1=ID16, 2=StoredCRC, 3=RN16
cfg.scanProtectionType = 2; // 0=None, 1=Parity, 2=CRC5, 3=CRC5Plus
cfg.scanIdType         = 3; // 0=NoAckResponse, 1=TMNPlusTSN, 2=Part, 3=Full
cfg.scanCrypto         = 0; // 0=All tags, 1=S=1 tags only
cfg.scanIdAppSize      = 1; // 0=Rfu, 1=24 bits, 2=16 bits, 3=8 bits
cfg.scanIdAppId        = 0;

await reader.setGen2XConfig(cfg);
```

### Protected mode

Protected mode hides tag data from unauthorized readers. Tags in protected
mode only respond after receiving the correct PIN.

```typescript
const cfg = await reader.getGen2XConfig();
cfg.flags = NurGen2XFlags.ENABLE_PROTECTED_MODE;
cfg.inventoryMode = 1;
cfg.protectedModePin = 0x12345678; // u32 access PIN
await reader.setGen2XConfig(cfg);
```

### Disabling Gen2X

To return to standard Gen2 operation:

```typescript
const cfg = await reader.getGen2XConfig();
cfg.flags = 0;
cfg.inventoryMode = 0;
await reader.setGen2XConfig(cfg);
```

## Gen2v2 Features

Gen2v2 (ISO 18000-63 amendment) extends the Gen2 protocol with security and
privacy features: **Authenticate**, **Untraceable**, and **ReadBuffer**.
These require tags that support the Gen2v2 standard (e.g. NXP UCODE DNA,
Impinj M7xx with crypto).

The library also provides higher-level **ISO 29167-10 TAM** helpers (TAM1 /
TAM2) that build on top of Authenticate; see the
[TAM section](#tam-iso-29167-10) below.

### NurGen2v2 wrapper

All Gen2v2 operations live on a separate `NurGen2v2` class that wraps a
`NurApi` instance:

```typescript
import { NurApi, NurGen2v2 } from '@nordicid/nurapi';

const reader = new NurApi();
await reader.connect('tcp://192.168.1.100');

const gen2v2 = new NurGen2v2(reader);
```

### Singulation

Every Gen2v2 method targets a specific tag through one of two mutually
exclusive fields on the params object:

- `epc: Uint8Array` — shortcut, singulates by EPC bank.
- `singulation: Singulation` — `{ bank, address, maskData, maskBitLen? }`
  for custom mask singulation.

Omit both to operate on a single tag in field with no singulation. Passing
both throws.

### Authenticate

The Authenticate command performs a cryptographic challenge-response
exchange with a tag. The exact protocol depends on the Cryptographic Suite
Indicator (CSI) supported by the tag chip.

```typescript
const challenge = new Uint8Array(12); // 96-bit challenge
crypto.getRandomValues(challenge);

const result = await gen2v2.authenticate({
  csi: 0,
  message: challenge,
  messageBitLength: 96,
  rxLengthBits: 128,    // expected response length in bits (0 = unknown)
  rxAttn: false,        // true reduces range (write-like operation)
  reSelect: false,      // re-select tag between internal operations
  timeout: 25,          // response timeout in ms (20–50)
  preTxWait: 2000,      // carrier-on time before TX in microseconds
  epc: epcBytes,        // singulate by EPC
});
```

The result has `status` (`Gen2v2AuthStatus`: `OK`, `NO_RESPONSE`,
`TAG_ERROR`, `BUFFER_ERROR`), `tagBitLength`, `actualBitLength`, and `data`:

```typescript
import { Gen2v2AuthStatus } from '@nordicid/nurapi';

if (result.status === Gen2v2AuthStatus.OK) {
  console.log(`Auth OK, ${result.actualBitLength} bits received`);
  console.log(Buffer.from(result.data).toString('hex'));
} else if (result.status === Gen2v2AuthStatus.TAG_ERROR) {
  console.log(`Tag error, first byte: 0x${result.data[0].toString(16)}`);
}
```

> **preTxWait** gives the tag time to power up its crypto engine before the
> command is sent. 2000 µs is recommended; setting it to 0 may cause
> authentication failures with some tag chips.

For secured-state authentication (not recommended — exposes the password
over the air), pass the `password` field on the same params object.

### Untraceable

Untraceable hides parts of a tag's identity to protect privacy. It can
shorten the visible EPC, hide user memory, and control TID visibility. The
tag's access password is **always required**.

```typescript
import { Gen2v2TidOp, Gen2v2RangeOp } from '@nordicid/nurapi';

await gen2v2.untraceable({
  password: 0xAABBCCDD,
  assertU: false,
  rxAttn: false,
  hideEpc: true,
  epcWordLength: 2,                // show only 2 words (4 bytes) of EPC
  hideUser: true,                  // hide user memory
  tidOp: Gen2v2TidOp.HIDE_SOME,    // partially hide TID
  rangeOp: Gen2v2RangeOp.NORMAL,   // no range reduction
  epc: epcBytes,
});
```

#### Resetting Untraceable

To undo all hiding and restore the tag to its default state:

```typescript
await gen2v2.untraceable({
  password: 0xAABBCCDD,
  assertU: false,
  rxAttn: false,
  hideEpc: false,
  epcWordLength: 6,                // 6 words = 96 bits (standard EPC)
  hideUser: false,
  tidOp: Gen2v2TidOp.HIDE_NONE,
  rangeOp: Gen2v2RangeOp.NORMAL,
  epc: epcBytes,
});
```

#### TID hide operations (`Gen2v2TidOp`)

| Value         | Effect                                      |
|---------------|---------------------------------------------|
| `HIDE_NONE`   | TID fully visible                           |
| `HIDE_SOME`   | Partial TID — chip-dependent which fields   |
| `HIDE_ALL`    | TID completely hidden                       |

#### Range operations (`Gen2v2RangeOp`)

| Value     | Effect                                                |
|-----------|-------------------------------------------------------|
| `NORMAL`  | Normal range                                          |
| `TOGGLE`  | Toggle current range state                            |
| `REDUCE`  | Reduced range — tag only responds at close proximity  |

### ReadBuffer

ReadBuffer reads data from a Gen2v2 tag's internal buffer (e.g. the result
of a previous Authenticate command). Addresses and lengths are in **bits**.

```typescript
const buf = await gen2v2.readBuffer({
  bitAddress: 0,
  bitCount: 128,
  epc: epcBytes,
});

console.log(`Read ${buf.bitLength} bits`);
console.log(Buffer.from(buf.data).toString('hex'));
```

> The returned data is left-aligned in the byte array. If `bitCount` is
> not a multiple of 8, the application must handle the partial last byte.

### TAM (ISO 29167-10)

For tags implementing the ISO 29167-10 cryptographic suite (e.g. NXP
UCODE DNA), high-level TAM helpers wrap `authenticate()` with the correct
message format and handle AES decryption. Both use CSI = 0 and a 10-byte
random challenge from `crypto.getRandomValues`.

#### TAM1 — simple authentication

TAM1 verifies the tag's identity using a shared AES-128 key. The library
generates a random challenge, sends it, decrypts the response, and checks
the C_TAM constant (`0x96C5`) and challenge echo.

```typescript
const key = new Uint8Array([
  0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77,
  0x88, 0x99, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF,
]);

const result = await gen2v2.tam1({
  keyNum: 0,
  key,
  epc: epcBytes,
});

if (result.ok) {
  console.log(`Tag authenticated (C_TAM = 0x${result.cTam.toString(16)})`);
}
```

If `key` is omitted, no decryption is performed: `firstBlock` holds raw
ciphertext, `result.response` indicates whether the tag replied, and
`result.ok` is always `false`.

#### TAM2 — authentication with data

TAM2 extends TAM1 by also returning encrypted data from a tag memory bank.

```typescript
import { TamMemoryProfile } from '@nordicid/nurapi';

const result = await gen2v2.tam2({
  keyNum: 1,
  key,                                    // 16-byte AES-128 key
  mpi: TamMemoryProfile.TID,              // 0=EPC, 1=TID, 2=user memory
  offset: 0,                              // block offset (0–0xFFF)
  blockCount: 1,                          // 1–4 blocks (8 bytes each)
  protMode: 1,                            // encipherment protection mode (0–15)
  epc: epcBytes,
});

if (result.ok) {
  console.log(`C_TAM   = 0x${result.cTam.toString(16)}`);
  console.log(`TRnd32  = 0x${result.tRnd32.toString(16)}`);
  console.log(`Blocks  = ${Buffer.from(result.blockData).toString('hex')}`);
  if (result.cmac.length) {
    console.log(`CMAC    = ${Buffer.from(result.cmac).toString('hex')}`);
  }
}
```

`TamResult` fields:

| Field         | Meaning                                                       |
|---------------|---------------------------------------------------------------|
| `response`    | The tag replied at all                                        |
| `ok`          | Decryption succeeded and C_TAM + challenge echo are valid     |
| `cTam`        | 16-bit C_TAM constant from the decrypted first block          |
| `tRnd32`      | 32-bit tag random value from the decrypted first block        |
| `firstBlock`  | Decrypted (or raw) first 16 bytes of the response             |
| `blockData`   | Decrypted custom data (TAM2 only, empty for TAM1)             |
| `cmac`        | CMAC bytes for protection modes 2/3 (empty otherwise)         |
| `challenge`   | The 10-byte challenge that was sent to the tag                |

Protection modes 2 and 3 append a 96-bit CMAC to the response, which is
extracted into `cmac`. If `blockCount` is odd the tag pads the response
with one extra block; the helper trims the padding before returning
`blockData`.

## Accessory Extensions

Nordic ID handheld readers (EXA21, EXA31, EXA51, EXA81) have accessory
features beyond RFID: battery monitoring, barcode scanning, LED / beep /
vibration feedback, BLE pairing, sensors, and wireless charging. These
methods are exposed by the `NurAccessoryExt` class, which wraps a `NurApi`
instance. The reader is typically connected via `ble://` or `usb://`.

### Setup

```typescript
import { NurApi, NurAccessoryExt, AccLedMode } from '@nordicid/nurapi';

const reader = new NurApi();
const acc = new NurAccessoryExt(reader);

await reader.connect('ble://request');

const fw = await acc.getFwVersion();
console.log(fw);
```

All `NurAccessoryExt` methods are async. Notification-style results
(barcode scans, sensor data) are emitted as events on the `reader`
instance, not on `acc`.

### Device information

```typescript
// Accessory firmware version (raw string)
const version = await acc.getFwVersion();

// Structured firmware info: { applicationVersion, fullAppVersion, bootloaderVersion }
const fw = await acc.getFwInfo();
console.log(`App: ${fw.applicationVersion}, BL: ${fw.bootloaderVersion}`);

// Model and connection details
console.log(await acc.getModelInfo());
console.log(await acc.getConnectionInfo());
```

### Configuration

`AccConfig` holds the device's persistent settings. Always read the
current configuration before modifying it — pass the full struct back
unchanged on the fields you don't intend to touch:

```typescript
const cfg = await acc.getConfig();
console.log(`Device: ${acc.getDeviceType(cfg)}, Name: ${cfg.deviceName}`);
console.log(`Has imager: ${acc.hasImagerScanner(cfg)}`);
console.log(`Has wireless charging: ${acc.hasWirelessCharging(cfg)}`);
console.log(`Has vibrator: ${acc.hasVibrator(cfg)}`);

cfg.deviceName = 'My Reader';
await acc.setConfig(cfg);
```

#### HID mode

HID mode makes the device act as a keyboard, typing scanned barcodes or
tag EPCs directly into the focused application.

```typescript
import { AccHidMode } from '@nordicid/nurapi';

await acc.setHidMode(AccHidMode.RFID_BARCODE);
const mode = await acc.getHidMode();

// Fine-grained control via the config struct
const cfg = await acc.getConfig();
cfg.hidBarcodeTimeout = 3000; // ms
cfg.hidRfidTimeout    = 3000; // ms
cfg.hidRfidMaxtags    = 10;
await acc.setConfig(cfg);
```

| `AccHidMode`     | Behaviour                                |
|------------------|------------------------------------------|
| `DISABLED`       | No HID output                            |
| `BARCODE`        | Barcode scans sent as keystrokes         |
| `RFID`           | Tag EPCs sent as keystrokes              |
| `RFID_BARCODE`   | Both barcode and RFID sent as keystrokes |

### Battery

```typescript
const bat = await acc.getBatteryInfo();
console.log(`Charging: ${bat.charging}`);
console.log(`Level: ${bat.percentage}%`);     // 0–100, -1 = unknown
console.log(`Voltage: ${bat.voltage_mV} mV`);
console.log(`Current: ${bat.current_mA} mA`);
console.log(`Capacity: ${bat.capacity_mA} mAh`);

// Quick voltage-only read
const mV = await acc.getBatteryVoltage();
```

### User feedback (beep, LED, vibrate)

```typescript
import { AccLedMode } from '@nordicid/nurapi';

await acc.beep(200);                  // beep for 200 ms (range 1–5000)
await acc.setLed(AccLedMode.BLINK);   // OFF / ON / BLINK
await acc.vibrate(100, 3);            // 100 ms pulses, 3 times (total ≤ 2000 ms)
```

| `AccLedMode` | Behaviour              |
|--------------|------------------------|
| `OFF`        | LED off                |
| `ON`         | LED on continuously    |
| `BLINK`      | LED blinking           |

### Barcode scanning

Barcode scanning is **asynchronous**: start the scan, then handle the
result via the `accBarcode` event on the `NurApi` instance:

```typescript
import { BarcodeReadStatus } from '@nordicid/nurapi';

reader.on('accBarcode', (result) => {
  if (result.status === BarcodeReadStatus.SUCCESS) {
    console.log(`Barcode: ${result.barcode}`);
  } else {
    console.log(`Scan status: ${result.status}`);
  }
});

// Start scanning with a 5-second timeout
await acc.readBarcodeAsync(5000);

// Cancel before timeout if needed
await acc.cancelBarcode();
```

While a barcode read is active, do not send other commands to the reader.
Barcode payloads are decoded as UTF-8.

### Imager

The built-in imager (Opticon, on EXA31/51/81) can be controlled directly:

```typescript
await acc.imagerPower(true);   // power the imager module on
await acc.imagerAim(true);     // turn the aiming laser on
await acc.imagerTrigger();     // trigger a scan
await acc.imagerCancel();      // cancel an in-progress scan
```

Raw imager configuration commands and persistent imager config saving
are not available in the TS API.

### BLE pairing

```typescript
import { PairingMode } from '@nordicid/nurapi';

// Enable pairing mode (accessory restart required to take effect)
await acc.setPairingMode(PairingMode.ENABLED);
const mode = await acc.getPairingMode();

// Remove all paired devices
await acc.clearPairings();
```

### Wireless charging

Only available on devices that report `acc.hasWirelessCharging(cfg) === true`.

```typescript
import { AccWirelessChargeStatus } from '@nordicid/nurapi';

const status = await acc.getWirelessChargeStatus();
if (status !== AccWirelessChargeStatus.NOT_SUPPORTED) {
  await acc.setWirelessCharge(true);
}
```

| `AccWirelessChargeStatus` | Value | Meaning                    |
|---------------------------|-------|----------------------------|
| `OFF`                     | `0`   | Charging disabled          |
| `ON`                      | `1`   | Charging enabled           |
| `REFUSED`                 | `-1`  | Device refused the request |
| `FAIL`                    | `-2`  | Command failed             |
| `NOT_SUPPORTED`           | `-3`  | Hardware not available     |

### Sensors

Some devices have external or built-in sensors (ultrasonic range finders,
ToF sensors, GPIO pins, tap detection). Sensors are discovered at runtime.

#### Enumerating sensors

```typescript
const sensors = await acc.sensorEnumerate();
for (const s of sensors) {
  console.log(`Source: ${s.source}, Type: ${s.type}`);
  console.log(`  Features: ${s.feature}, Mode: ${s.mode}`);
}
```

#### Sensor modes

| `AccSensorMode` | Behaviour                                                            |
|-----------------|----------------------------------------------------------------------|
| `GPIO`          | Report changes as GPIO-style events (sensor flag set)                |
| `STREAM`        | Stream raw values via `accSensorRangeData` / `accSensorToFFrBfaRawData` |

Source identifiers come from `AccSensorSource` (`USB1_SENSOR`,
`TOF_SENSOR`, `TOF_SENSOR_FR_BFA`, `TAP_SENSOR`, `GPIO_PIN1`–`GPIO_PIN4`,
`BUTTON_TRIGGER`, etc.).

#### Configuring and reading a sensor

```typescript
import { AccSensorSource, AccSensorMode } from '@nordicid/nurapi';

// Read current config
const cfg = await acc.sensorGetConfig(AccSensorSource.USB1_SENSOR);

// Enable streaming
await acc.sensorSetConfig(AccSensorSource.USB1_SENSOR, AccSensorMode.STREAM);

// Read a single typed value (range sensors return AccSensorRangeData)
const value = await acc.sensorGetTypedValue(AccSensorSource.USB1_SENSOR);
if ('range' in value) {
  console.log(`Range: ${value.range} mm`);
}
```

#### Sensor filters

Filters control when sensor events fire — by range threshold, time
threshold, or both:

```typescript
import { AccSensorFilterFlag, AccSensorSource } from '@nordicid/nurapi';

await acc.sensorSetFilter(AccSensorSource.USB1_SENSOR, {
  flags: AccSensorFilterFlag.RANGE,
  rangeLo: 100,    // minimum range in mm
  rangeHi: 2000,   // maximum range in mm
  timeLo: 0,
  timeHi: 0,
});
```

#### Streaming sensor events

```typescript
// Range sensors (ultrasonic, ToF)
reader.on('accSensorRangeData', (data) => {
  console.log(`[${data.source}] Range: ${data.range} mm`);
});

// FR BFA ToF sensor (16-zone raw data)
reader.on('accSensorToFFrBfaRawData', (data) => {
  for (const item of data.items) {
    process.stdout.write(`${item.distCm}cm `);
  }
  console.log();
});

// Sensor added / removed
reader.on('accSensorChanged', (data) => {
  console.log(data.removed
    ? `Sensor removed: ${data.source}`
    : `Sensor connected: ${data.source}`);
});
```

### Power management

```typescript
await acc.restart();             // reboot the accessory (default)
await acc.restart('reboot');     // explicit reboot
await acc.restart('dfu');        // enter DFU bootloader for firmware upgrade
await acc.restart('poweroff');   // power off the accessory
```

All variants disconnect the host transport.

### Hardware health

```typescript
const health = await acc.getHwHealth();
for (const [key, value] of health) {
  console.log(`${key} = ${value}`);
}

// Or as a single string
console.log(await acc.getHealthState());
```

## API Reference

### Connection

#### NurApiOptions


Configuration options for the NurApi instance.

##### Properties

###### autoReconnect?

> `optional` **autoReconnect?**: `boolean`


Enable auto-reconnect on unexpected disconnect.

###### Default Value

```ts
true
```

###### reconnectInterval?

> `optional` **reconnectInterval?**: `number`


Initial reconnect interval in ms.

###### Default Value

```ts
1000
```

###### maxReconnectInterval?

> `optional` **maxReconnectInterval?**: `number`


Maximum reconnect interval in ms — backoff cap.

###### Default Value

```ts
30000
```

###### defaultTimeout?

> `optional` **defaultTimeout?**: `number`


Default command timeout in ms.

###### Default Value

```ts
3000
```

###### logLevel?

> `optional` **logLevel?**: [`LogLevel`](#loglevel-2)


Minimum log level. Messages above this severity are suppressed.
Listen for `'log'` events to receive log entries.

###### Default Value

```ts
'error'
```

***

#### NurApi


High-level API for Nordic ID NUR RFID reader modules.

Provides connection lifecycle management, typed command methods, streaming
inventory, and auto-reconnect with exponential backoff.

##### Example

```typescript
import { NurApi } from '@nordicid/nurapi';
import '@nordicid/nurapi-node'; // registers ser:// and tcp:// transports

const reader = new NurApi();
reader.on('connected', () => console.log('Connected!'));
await reader.connect('tcp://192.168.1.100');

const info = await reader.getReaderInfo();
console.log(`Reader: ${info.name}, Serial: ${info.serial}`);

const inv = await reader.inventory();
const tags = await reader.fetchTags();
console.log(`Found ${inv.tagsFound} tags`);

await reader.disconnect();
```

##### Extends

- [`TypedEventEmitter`](#typedeventemitter)\<[`NurApiEvents`](#nurapievents)\>

##### Accessors

###### connectionStatus

###### Get Signature

> **get** **connectionStatus**(): [`ConnectionStatus`](#connectionstatus-1)


Current connection status.

**Returns** [`ConnectionStatus`](#connectionstatus-1)

###### connected

###### Get Signature

> **get** **connected**(): `boolean`


Whether the reader is connected and ready for commands.

**Returns** `boolean`

###### lastConnectUri

###### Get Signature

> **get** **lastConnectUri**(): `string` \| `null`


The last URI used for a connection attempt (used for auto-reconnect).

**Returns** `string` \| `null`

###### autoReconnect

###### Get Signature

> **get** **autoReconnect**(): `boolean`


Whether auto-reconnect is enabled.

**Returns** `boolean`

###### Set Signature

> **set** **autoReconnect**(`value`): `void`


Enable or disable auto-reconnect. Disabling also stops any active reconnect loop.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| value | `boolean` | `true` to enable, `false` to disable. |

**Returns** `void`

###### logLevel

###### Get Signature

> **get** **logLevel**(): [`LogLevel`](#loglevel-2)


Current minimum log level. Listen for `'log'` events to receive entries.

**Returns** [`LogLevel`](#loglevel-2)

###### Set Signature

> **set** **logLevel**(`value`): `void`


Change the log level at runtime.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| value | [`LogLevel`](#loglevel-2) | New minimum log level. |

**Returns** `void`

###### isInventoryStreamRunning

###### Get Signature

> **get** **isInventoryStreamRunning**(): `boolean`


Whether any inventory stream (standard or extended) is currently running.

**Returns** `boolean`

###### isInventoryExStreamRunning

###### Get Signature

> **get** **isInventoryExStreamRunning**(): `boolean`


Whether an extended inventory stream is currently running.

**Returns** `boolean`

###### isTraceTagStreamRunning

###### Get Signature

> **get** **isTraceTagStreamRunning**(): `boolean`


Whether a trace tag stream is currently running.

**Returns** `boolean`

###### isNxpAlarmStreamRunning

###### Get Signature

> **get** **isNxpAlarmStreamRunning**(): `boolean`


Whether an NXP EAS alarm stream is currently running.

**Returns** `boolean`

##### Constructors

###### Constructor

> **new NurApi**(`options?`): [`NurApi`](#nurapi)


**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| options? | [`NurApiOptions`](#nurapioptions) = `{}` | Optional configuration for auto-reconnect, timeouts, and logging. |

**Returns** [`NurApi`](#nurapi)

##### Methods

###### connect()

> **connect**(`uri`): `Promise`\<`void`\>


Connect to a NUR reader module via URI.

Resolves the transport from the registry, connects, wires up the
command dispatcher, and sends a PING to verify communication.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| uri | `string` | Connection URI (e.g., 'ws://host:port', 'ser://COM3', 'tcp://192.168.1.100') |

**Returns** `Promise`\<`void`\>

**Throws** If connection or verification fails

###### See

 - [disconnect](#disconnect)
 - [autoReconnect](#autoreconnect-1)

###### disconnect()

> **disconnect**(): `Promise`\<`void`\>


Disconnect from the reader module.

Stops auto-reconnect, flushes pending commands, and closes the transport.
Safe to call even if not connected.

**Returns** `Promise`\<`void`\>

###### execute()

> **execute**(`cmd`, `payload?`, `timeout?`): `Promise`\<[`ParsedPacket`](#parsedpacket)\>


Send a command to the reader and wait for its response.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| cmd | `number` | Command byte (e.g., NurCmd.INVENTORY) |
| payload? | `Uint8Array`\<`ArrayBufferLike`\> | Command-specific data (default: empty) |
| timeout? | `number` | Per-command timeout in ms (default: `defaultTimeout`) |

**Returns** `Promise`\<[`ParsedPacket`](#parsedpacket)\> — Parsed response packet

**Throws** If not connected, timeout, or error response

###### ping()

> **ping**(`hostFlags?`): `Promise`\<`void`\>


Ping the reader module — verifies communication.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| hostFlags? | `number` | Optional host capability flags. When provided, sends a 4-byte DWORD payload to communicate host capabilities to the reader. |

**Returns** `Promise`\<`void`\>

###### setHostFlags()

> **setHostFlags**(`hostFlags`): `Promise`\<`void`\>


Send host flags to the module via PING command.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| hostFlags | `number` | Host capability flags (e.g., `HOSTFLAGS_EN_UNSOL_ACK`) |

**Returns** `Promise`\<`void`\>

###### getVersions()

> **getVersions**(): `Promise`\<[`VersionInfo`](#versioninfo)\>


Get firmware version information.

**Returns** `Promise`\<[`VersionInfo`](#versioninfo)\>

###### getReaderInfo()

> **getReaderInfo**(): `Promise`\<[`ReaderInfo`](#readerinfo)\>


Get reader identification and capability summary.

**Returns** `Promise`\<[`ReaderInfo`](#readerinfo)\>

###### getMode()

> **getMode**(): `Promise`\<`string`\>


Get the current operating mode ('A' = app, 'B' = bootloader).

**Returns** `Promise`\<`string`\>

###### getDeviceCaps()

> **getDeviceCaps**(): `Promise`\<[`DeviceCaps`](#devicecaps)\>


Get device capabilities (supported features, chip version, etc.).

**Returns** `Promise`\<[`DeviceCaps`](#devicecaps)\>

###### beep()

> **beep**(`freq?`, `duration?`, `duty?`): `Promise`\<`void`\>


Play a beep on the reader.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| freq? | `number` = `1000` | Frequency in Hz. |
| duration? | `number` = `100` | Duration in milliseconds. |
| duty? | `number` = `50` | Duty cycle percentage (0-100). |

**Returns** `Promise`\<`void`\>

###### reset()

> **reset**(): `Promise`\<`void`\>


Reset the reader module (soft reset).

**Returns** `Promise`\<`void`\>

###### restart()

> **restart**(): `Promise`\<`void`\>


Restart the reader module.

**Returns** `Promise`\<`void`\>

###### factoryReset()

> **factoryReset**(): `Promise`\<`void`\>


Restore factory default settings.

**Returns** `Promise`\<`void`\>

###### getFwInfo()

> **getFwInfo**(): `Promise`\<`string`\>


Get firmware info string.

**Returns** `Promise`\<`string`\>

###### inventory()

> **inventory**(`params?`): `Promise`\<[`InventoryResult`](#inventoryresult)\>


Perform a single inventory round.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params? |  |  |
| Q? | `number` |  |
| session? | `number` |  |
| rounds? | `number` |  |

**Returns** `Promise`\<[`InventoryResult`](#inventoryresult)\> — Inventory result with tag count and statistics

###### Example

```typescript
const result = await reader.inventory({ Q: 4, session: 0, rounds: 5 });
console.log(`Found ${result.tagsFound} tags in ${result.roundsDone} rounds`);
const tags = await reader.fetchTags();
```

###### See

 - [inventoryEx](#inventoryex-1) for filtered inventory
 - [fetchTags](#fetchtags) to retrieve tag data after inventory
 - [startInventoryStream](#startinventorystream) for continuous inventory

###### inventoryEx()

> **inventoryEx**(`params`): `Promise`\<[`InventoryResult`](#inventoryresult)\>


Perform an extended inventory with select filters.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params | [`InventoryExParams`](#inventoryexparams) | Extended inventory parameters including filters |

**Returns** `Promise`\<[`InventoryResult`](#inventoryresult)\> — Inventory result with tag count and statistics

###### inventorySelect()

> **inventorySelect**(`params`): `Promise`\<[`InventoryResult`](#inventoryresult)\>


Perform a single inventory round with a tag selection mask filter.

Selects tags matching the specified mask in the given memory bank,
then inventories only those tags.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params | [`InventorySelectParams`](#inventoryselectparams) | Selection parameters (bank, address, maskData, Q, session, rounds) |

**Returns** `Promise`\<[`InventoryResult`](#inventoryresult)\> — Inventory result with tag count and statistics

###### startInventorySelectStream()

> **startInventorySelectStream**(`params`): `Promise`\<`void`\>


Start a continuous inventory stream with a tag selection mask filter.

Tags matching the selection mask are inventoried continuously.
Results are delivered via `inventoryStream` events.
Call [stopInventoryStream](#stopinventorystream) to end the stream.

The firmware auto-detects select-stream when the payload is >= 13 bytes.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params | [`InventorySelectParams`](#inventoryselectparams) | Selection parameters (bank, address, maskData, Q, session, rounds) |

**Returns** `Promise`\<`void`\>

###### fetchTags()

> **fetchTags**(`clearModule?`): `Promise`\<[`TagEntry`](#tagentry)[]\>


Fetch all tags from the module's tag buffer (with full metadata).

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| clearModule? | `boolean` = `true` | Clear the module's tag buffer after fetch (default: true) |

**Returns** `Promise`\<[`TagEntry`](#tagentry)[]\> — Array of tag entries with EPC, RSSI, antenna, etc.

###### fetchTagAt()

> **fetchTagAt**(`index`): `Promise`\<[`TagEntry`](#tagentry)[]\>


Fetch a single tag from the module's tag buffer by index.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| index | `number` | Zero-based tag index |

**Returns** `Promise`\<[`TagEntry`](#tagentry)[]\> — Array containing the single tag entry

###### clearTags()

> **clearTags**(): `Promise`\<`void`\>


Clear the module's tag ID buffer.

**Returns** `Promise`\<`void`\>

###### readTag()

> **readTag**(`params`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>


Read data from a tag's memory bank.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params | [`ReadTagParams`](#readtagparams) | Read parameters (bank, address, wordCount, optional EPC for singulation) |

**Returns** `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\> — Raw data bytes read from the tag

###### Example

```typescript
import { NurBank } from '@nordicid/nurapi';
const data = await reader.readTag({
  bank: NurBank.EPC,
  address: 2,
  wordCount: 6,
});
```

###### See

 - [writeTag](#writetag)
 - [writeEpc](#writeepc)

###### writeTag()

> **writeTag**(`params`): `Promise`\<`void`\>


Write data to a tag's memory bank.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params | [`WriteTagParams`](#writetagparams) | Write parameters (bank, address, data, optional EPC for singulation) |

**Returns** `Promise`\<`void`\>

###### writeEpc()

> **writeEpc**(`params`): `Promise`\<`void`\>


Write a new EPC to a tag (convenience wrapper around writeTag).

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params | [`WriteEpcParams`](#writeepcparams) | EPC write parameters (currentEpc or singulation, newEpc, optional password) |

**Returns** `Promise`\<`void`\>

###### scanSingle()

> **scanSingle**(`timeout?`): `Promise`\<[`ScanSingleResult`](#scansingleresult)\>


Scan for a single tag (blocking until found or timeout).

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| timeout? | `number` = `1000` | Scan timeout in ms (default: module's configured timeout) |

**Returns** `Promise`\<[`ScanSingleResult`](#scansingleresult)\> — Tag data (antenna, RSSI, EPC)

###### lockTag()

> **lockTag**(`params`): `Promise`\<`void`\>


Lock or unlock tag memory areas.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params | [`LockTagParams`](#locktagparams) | Lock parameters (mask, action, password, optional EPC) |

**Returns** `Promise`\<`void`\>

###### lockTagOpen()

> **lockTagOpen**(`params`): `Promise`\<`void`\>


Lock a tag in the open state (without access password).

Uses the same lock command but without the secured flag,
allowing lock operations on tags that don't require password access.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params | `Omit`\<[`LockTagParams`](#locktagparams), `"password"`\> | Lock parameters (lockMask, lockAction, singulation) |

**Returns** `Promise`\<`void`\>

###### killTag()

> **killTag**(`params`): `Promise`\<`void`\>


Permanently disable (kill) a tag.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params | [`KillTagParams`](#killtagparams) | Kill parameters (kill password, optional EPC) |

**Returns** `Promise`\<`void`\>

###### getModuleSetup()

> **getModuleSetup**(`flags?`): `Promise`\<[`ModuleSetup`](#modulesetup)\>


Get the module's current configuration.

When `flags` is `ALL` (default), an empty payload is sent so the reader
returns all fields it supports — matching the .NET `NurCmdLoadSetup(flags=0)`
pattern.  The returned `ModuleSetup.returnedFlags` records which flags
the reader actually provided.

If the reader responds with `INVALID_PARAMETER` (some requested flags
are unsupported), the response payload is still parsed — only the
supported flags will contain real values, the rest are defaults.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| flags? | `number` = `NurModuleSetupFlags.ALL` | Which configuration fields to retrieve (default: ALL) |

**Returns** `Promise`\<[`ModuleSetup`](#modulesetup)\> — Current module setup

###### See

 - [setModuleSetup](#setmodulesetup)
 - [storeSetup](#storesetup)

###### setModuleSetup()

> **setModuleSetup**(`setup`, `flags?`): `Promise`\<`void`\>


Set module configuration.

Only fields present in the partial setup object are changed.
Flags are auto-detected from the provided fields unless explicitly specified.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| setup | `Partial`\<[`ModuleSetup`](#modulesetup)\> | Partial setup with fields to change |
| flags? | `number` | Optional explicit flags (auto-detected if omitted) |

**Returns** `Promise`\<`void`\>

###### storeSetup()

> **storeSetup**(`flags?`): `Promise`\<`void`\>


Store current module setup to non-volatile flash.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| flags? | `number` = `NurStoreFlags.ALL` | Which setup categories to store (default: ALL) |

**Returns** `Promise`\<`void`\>

###### getRegionInfo()

> **getRegionInfo**(`regionId`): `Promise`\<[`RegionInfo`](#regioninfo)\>


Get region information.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| regionId | `number` | Region ID to query |

**Returns** `Promise`\<[`RegionInfo`](#regioninfo)\> — Region details (frequencies, channels, name)

###### getBaudrate()

> **getBaudrate**(): `Promise`\<`number`\>


Get the current baudrate setting.

**Returns** `Promise`\<`number`\>

###### setBaudrate()

> **setBaudrate**(`setting`): `Promise`\<`void`\>


Set the baudrate.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| setting | `number` | Baudrate setting value. |

**Returns** `Promise`\<`void`\>

###### setAntenna()

> **setAntenna**(`mask`): `Promise`\<`void`\>


Set the active antenna mask.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| mask | `number` | Bitmask of active antennas (bit 0 = ant 1, etc.) |

**Returns** `Promise`\<`void`\>

###### getAntenna()

> **getAntenna**(): `Promise`\<`number`\>


Get the current active antenna mask.

**Returns** `Promise`\<`number`\>

###### getAntennaMap()

> **getAntennaMap**(): `Promise`\<[`AntennaMapping`](#antennamapping)[]\>


Get the antenna ID-to-name mapping table.

**Returns** `Promise`\<[`AntennaMapping`](#antennamapping)[]\>

###### tuneAntenna()

> **tuneAntenna**(`params?`): `Promise`\<[`TuneAntennaResult`](#tuneantennaresult)\>


Tune an antenna (measure and optimize reflected power).

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params? | [`TuneAntennaParams`](#tuneantennaparams) = `{}` | Tune parameters (antenna, band, type, save) |

**Returns** `Promise`\<[`TuneAntennaResult`](#tuneantennaresult)\> — Tune results per band (I, Q, dBm)

###### getGpioConfig()

> **getGpioConfig**(`flags?`): `Promise`\<[`GpioPinConfig`](#gpiopinconfig)[]\>


Get GPIO pin configuration.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| flags? | `number` = `0xff` | Bitmask of GPIOs to query (default: 0xFF = all) |

**Returns** `Promise`\<[`GpioPinConfig`](#gpiopinconfig)[]\>

###### setGpioConfig()

> **setGpioConfig**(`flags`, `configs`): `Promise`\<`void`\>


Set GPIO pin configuration.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| flags | `number` | Bitmask of GPIOs to configure |
| configs | [`GpioPinConfig`](#gpiopinconfig)[] | Configuration for each flagged GPIO |

**Returns** `Promise`\<`void`\>

###### getGpioStatus()

> **getGpioStatus**(`flags?`): `Promise`\<[`GpioPinState`](#gpiopinstate)[]\>


Get GPIO pin states.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| flags? | `number` = `0xff` | Bitmask of GPIOs to query (default: 0xFF = all) |

**Returns** `Promise`\<[`GpioPinState`](#gpiopinstate)[]\>

###### setGpioStatus()

> **setGpioStatus**(`flags`, `states`): `Promise`\<`void`\>


Set GPIO pin output states.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| flags | `number` | Bitmask of GPIOs to set |
| states | `number`[] | Output state for each flagged GPIO |

**Returns** `Promise`\<`void`\>

###### getGpioPinStatus()

> **getGpioPinStatus**(`pin`): `Promise`\<[`GpioPinState`](#gpiopinstate) \| `undefined`\>


Get the state of a single GPIO pin (convenience wrapper).

Converts the pin number to a bitmask internally, matching C host API behavior.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| pin | `number` | GPIO pin number (0-7) |

**Returns** `Promise`\<[`GpioPinState`](#gpiopinstate) \| `undefined`\> — The state of the requested pin, or undefined if not found

###### setGpioPinStatus()

> **setGpioPinStatus**(`pin`, `state`): `Promise`\<`void`\>


Set the output state of a single GPIO pin (convenience wrapper).

Converts the pin number to a bitmask internally, matching C host API behavior.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| pin | `number` | GPIO pin number (0-7) |
| state | `boolean` | true = high, false = low |

**Returns** `Promise`\<`void`\>

###### diagGetReport()

> **diagGetReport**(`flags?`): `Promise`\<[`DiagReport`](#diagreport-1)\>


Get a diagnostic report from the reader.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| flags? | `number` = `0` | Report flags (default: 0 = current stats) |

**Returns** `Promise`\<[`DiagReport`](#diagreport-1)\>

###### diagGetConfig()

> **diagGetConfig**(): `Promise`\<[`DiagConfig`](#diagconfig)\>


Get the diagnostic notification configuration.

**Returns** `Promise`\<[`DiagConfig`](#diagconfig)\>

###### diagSetConfig()

> **diagSetConfig**(`config`): `Promise`\<`void`\>


Set the diagnostic notification configuration.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| config | [`DiagConfig`](#diagconfig) | Diagnostic notification configuration. |

**Returns** `Promise`\<`void`\>

###### traceTag()

> **traceTag**(`params`): `Promise`\<[`TraceTagResult`](#tracetagresult)\>


Trace a tag — locate it by continuously reading RSSI.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params | [`TraceTagParams`](#tracetagparams) | Trace parameters (bank, address, maskData) |

**Returns** `Promise`\<[`TraceTagResult`](#tracetagresult)\> — RSSI and antenna information

###### getCustomHoptable()

> **getCustomHoptable**(): `Promise`\<[`CustomHopTable`](#customhoptable)\>


Get the custom frequency hopping table.

**Returns** `Promise`\<[`CustomHopTable`](#customhoptable)\>

###### setCustomHoptable()

> **setCustomHoptable**(`table`): `Promise`\<`void`\>


Set the custom frequency hopping table.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| table | [`CustomHopTable`](#customhoptable) | Custom frequency hopping table. |

**Returns** `Promise`\<`void`\>

###### setExtCarrier()

> **setExtCarrier**(`on`, `channel?`): `Promise`\<`void`\>


Enable or disable continuous carrier output.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| on | `boolean` | true to start, false to stop |
| channel? | `number` = `0` | Channel index (used when starting) |

**Returns** `Promise`\<`void`\>

###### getRefPower()

> **getRefPower**(): `Promise`\<[`RefPowerResult`](#refpowerresult)\>


Get reflected power measurement.

**Returns** `Promise`\<[`RefPowerResult`](#refpowerresult)\>

###### getRefPowerEx()

> **getRefPowerEx**(`freqKhz`): `Promise`\<[`RefPowerResult`](#refpowerresult)\>


Get reflected power measurement at a specific frequency.

Returns iPart, qPart, div plus the actual freqKhz from the reader.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| freqKhz | `number` | Frequency in kHz (e.g., 866500 for 866.5 MHz) |

**Returns** `Promise`\<[`RefPowerResult`](#refpowerresult)\> — Reflected power measurement (iPart, qPart, div)

###### setChannel()

> **setChannel**(`channelIdx`): `Promise`\<`void`\>


Set the RF channel.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| channelIdx | `number` | Channel index to switch to |

**Returns** `Promise`\<`void`\>

###### scanChannels()

> **scanChannels**(): `Promise`\<[`ScanChannelInfo`](#scanchannelinfo)[]\>


Scan region channels and return RSSI for each frequency.

**Returns** `Promise`\<[`ScanChannelInfo`](#scanchannelinfo)[]\> — Array of channel info with frequency, RSSI, and raw IQ data

###### stopAllContinuous()

> **stopAllContinuous**(): `Promise`\<`void`\>


Stop all continuous operations (inventory stream, EAS alarm, etc.).

**Returns** `Promise`\<`void`\>

###### getSensorConfig()

> **getSensorConfig**(): `Promise`\<[`SensorConfig`](#sensorconfig)\>


Get the sensor configuration (tap and light sensors).

**Returns** `Promise`\<[`SensorConfig`](#sensorconfig)\>

###### setSensorConfig()

> **setSensorConfig**(`config`): `Promise`\<`void`\>


Set the sensor configuration (tap and light sensors).

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| config | [`SensorConfig`](#sensorconfig) | Sensor configuration for tap and light sensors. |

**Returns** `Promise`\<`void`\>

###### getSystemInfo()

> **getSystemInfo**(): `Promise`\<[`SystemInfo`](#systeminfo)\>


Get system-level hardware/firmware information.

**Returns** `Promise`\<[`SystemInfo`](#systeminfo)\>

###### getInventoryReadConfig()

> **getInventoryReadConfig**(): `Promise`\<[`InventoryReadConfig`](#inventoryreadconfig)\>


Get the current inventory-read configuration.

**Returns** `Promise`\<[`InventoryReadConfig`](#inventoryreadconfig)\>

###### setInventoryReadConfig()

> **setInventoryReadConfig**(`config`): `Promise`\<`void`\>


Set the inventory-read configuration.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| config | [`InventoryReadConfig`](#inventoryreadconfig) | Inventory-read configuration. |

**Returns** `Promise`\<`void`\>

###### getGen2XConfig()

> **getGen2XConfig**(): `Promise`\<[`Gen2XConfig`](#gen2xconfig)\>


Get the Gen2X (Gen2v2) extended configuration.

**Returns** `Promise`\<[`Gen2XConfig`](#gen2xconfig)\>

###### setGen2XConfig()

> **setGen2XConfig**(`config`): `Promise`\<`void`\>


Set the Gen2X (Gen2v2) extended configuration.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| config | [`Gen2XConfig`](#gen2xconfig) | Gen2X extended configuration. |

**Returns** `Promise`\<`void`\>

###### blockWriteTag()

> **blockWriteTag**(`params`): `Promise`\<`void`\>


Block-write data to tag memory.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params | [`BlockWriteTagParams`](#blockwritetagparams) | Block write parameters (bank, address, data, blSize, optional singulation) |

**Returns** `Promise`\<`void`\>

###### blockEraseTag()

> **blockEraseTag**(`params`): `Promise`\<`void`\>


Block-erase tag memory.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params | [`BlockEraseTagParams`](#blockerasetagparams) | Block erase parameters (bank, address, wordCount, optional singulation) |

**Returns** `Promise`\<`void`\>

###### getTitle()

> **getTitle**(): `Promise`\<`string`\>


Get the reader's title string.

**Returns** `Promise`\<`string`\> — The reader title (up to 31 characters)

###### setTitle()

> **setTitle**(`title`): `Promise`\<`void`\>


Set the reader's title string.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| title | `string` | Title string (max 31 UTF-8 bytes) |

**Returns** `Promise`\<`void`\>

###### resetTarget()

> **resetTarget**(`session?`, `targetIsA?`): `Promise`\<`void`\>


Reset the inventory target flag (session A/B state).

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| session? | `number` = `0` | Session number (0-3, default 0) |
| targetIsA? | `boolean` = `true` | True to reset to target A, false for B (default true) |

**Returns** `Promise`\<`void`\>

###### setAccessPassword()

> **setAccessPassword**(`currentPw`, `newPw`, `singulation?`): `Promise`\<`void`\>


Set the access password on a tag.

Writes 4 bytes to Reserved bank (0), word address 2.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| currentPw | `number` | Current access password (0 if tag has no password) |
| newPw | `number` | New access password to set |
| singulation? | [`Singulation`](#singulation-13) | Optional singulation parameters |

**Returns** `Promise`\<`void`\>

###### getAccessPassword()

> **getAccessPassword**(`pw`, `singulation?`): `Promise`\<`number`\>


Get the access password from a tag.

Reads 4 bytes from Reserved bank (0), word address 2.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| pw | `number` | Access password |
| singulation? | [`Singulation`](#singulation-13) | Optional singulation parameters |

**Returns** `Promise`\<`number`\> — The access password as a 32-bit number

###### setKillPassword()

> **setKillPassword**(`accessPw`, `killPw`, `singulation?`): `Promise`\<`void`\>


Set the kill password on a tag.

Writes 4 bytes to Reserved bank (0), word address 0.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| accessPw | `number` | Current access password |
| killPw | `number` | Kill password to set |
| singulation? | [`Singulation`](#singulation-13) | Optional singulation parameters |

**Returns** `Promise`\<`void`\>

###### getKillPassword()

> **getKillPassword**(`accessPw`, `singulation?`): `Promise`\<`number`\>


Get the kill password from a tag.

Reads 4 bytes from Reserved bank (0), word address 0.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| accessPw | `number` | Access password |
| singulation? | [`Singulation`](#singulation-13) | Optional singulation parameters |

**Returns** `Promise`\<`number`\> — The kill password as a 32-bit number

###### readPermalock()

> **readPermalock**(`params`): `Promise`\<`number`[]\>


Read the permalock status of tag memory blocks.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params | `Omit`\<[`PermalockCmdParams`](#permalockcmdparams), `"lock"` \| `"mask"`\> | Permalock read parameters (bank, address, range) |

**Returns** `Promise`\<`number`[]\> — Array of lock status words

###### writePermalock()

> **writePermalock**(`params`): `Promise`\<`void`\>


Permanently lock tag memory blocks.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params | `Omit`\<[`PermalockCmdParams`](#permalockcmdparams), `"lock"`\> & `object` | Permalock write parameters (bank, address, range, mask) |

**Returns** `Promise`\<`void`\>

###### enablePhysicalAntenna()

> **enablePhysicalAntenna**(`commaSeparated`, `disableOthers?`): `Promise`\<`void`\>


Enable physical antennas by name.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| commaSeparated | `string` | Comma-separated antenna names (e.g. "Beam1,Beam2.X") or "ALL" |
| disableOthers? | `boolean` = `false` | If true, antennas not listed will be disabled (default false) |

**Returns** `Promise`\<`void`\>

###### Remarks

Names support prefix matching: "Beam1" enables both "Beam1.X" and "Beam1.Y".

###### disablePhysicalAntenna()

> **disablePhysicalAntenna**(`commaSeparated`): `Promise`\<`void`\>


Disable physical antennas by name.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| commaSeparated | `string` | Comma-separated antenna names (e.g. "Beam1,Beam3") |

**Returns** `Promise`\<`void`\>

###### isPhysicalAntennaEnabled()

> **isPhysicalAntennaEnabled**(`commaSeparated`): `Promise`\<`boolean`\>


Check whether all specified physical antennas are enabled.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| commaSeparated | `string` | Comma-separated antenna names to check |

**Returns** `Promise`\<`boolean`\> — True if all specified antennas are enabled

###### getPhysicalAntennaMask()

> **getPhysicalAntennaMask**(`commaSeparated`): `Promise`\<`number`\>


Convert physical antenna names to a bitmask.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| commaSeparated | `string` | Comma-separated antenna names |

**Returns** `Promise`\<`number`\> — Bitmask of the specified antennas

###### setHopEvents()

> **setHopEvents**(`enabled`): `Promise`\<`void`\>


Enable or disable frequency hop event notifications.

Toggles the `NUR_OPFLAGS_EN_HOPEVENTS` bit in the module's opFlags.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| enabled | `boolean` | True to enable hop event notifications |

**Returns** `Promise`\<`void`\>

###### nxpReadProtect()

> **nxpReadProtect**(`params`): `Promise`\<`void`\>


Enable or disable NXP read protection on a tag.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params | [`NxpCommandParams`](#nxpcommandparams) | NXP command parameters (password, set, optional singulation) |

**Returns** `Promise`\<`void`\>

###### nxpEas()

> **nxpEas**(`params`): `Promise`\<`void`\>


Arm or disarm NXP EAS (Electronic Article Surveillance).

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params | [`NxpCommandParams`](#nxpcommandparams) | NXP command parameters (password, set, optional singulation) |

**Returns** `Promise`\<`void`\>

###### monza4QtRead()

> **monza4QtRead**(`params?`): `Promise`\<[`Monza4QtResult`](#monza4qtresult)\>


Read Monza4 QT settings from a tag.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params? | `Partial`\<[`Monza4QtParams`](#monza4qtparams)\> | QT parameters (password, singulation) |

**Returns** `Promise`\<[`Monza4QtResult`](#monza4qtresult)\> — QT result with shortRange and publicMemory flags

###### monza4QtWrite()

> **monza4QtWrite**(`params`): `Promise`\<`void`\>


Write Monza4 QT settings to a tag.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params | `Omit`\<[`Monza4QtParams`](#monza4qtparams), `"write"`\> | QT parameters (password, reduce, publicMemory, singulation) |

**Returns** `Promise`\<`void`\>

###### readScratchArea()

> **readScratchArea**(`page`, `offset`, `length`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>


Read data from the module's scratch area.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| page | `number` | Page number (0-1) |
| offset | `number` | Byte offset within the page (0-255) |
| length | `number` | Number of bytes to read (1-256) |

**Returns** `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\> — Raw data bytes

###### writeScratchArea()

> **writeScratchArea**(`page`, `offset`, `data`): `Promise`\<`void`\>


Write data to the module's scratch area.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| page | `number` | Page number (0-1) |
| offset | `number` | Byte offset within the page (0-255) |
| data | `Uint8Array` | Data to write (1-256 bytes) |

**Returns** `Promise`\<`void`\>

###### startInventoryStream()

> **startInventoryStream**(`params?`): `Promise`\<`void`\>


Start continuous inventory stream.

Tags are delivered via `inventoryStream` events with parsed tag data.
Tags also accumulate in [tagStorage](#tagstorage) automatically.
The reader will periodically stop (`stopped=true` in event) — the
application must restart by calling this method again if desired.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params? |  |  |
| Q? | `number` |  |
| session? | `number` |  |
| rounds? | `number` |  |

**Returns** `Promise`\<`void`\>

###### Example

```typescript
reader.on('inventoryStream', (event) => {
  console.log(`${reader.tagStorage.count} unique tags`);
  if (event.stopped) {
    reader.startInventoryStream(); // restart stream
  }
});
await reader.startInventoryStream();
```

###### See

 - [stopInventoryStream](#stopinventorystream)
 - [stopStreaming](#stopstreaming)
 - [tagStorage](#tagstorage)

###### startInventoryExStream()

> **startInventoryExStream**(`params`): `Promise`\<`void`\>


Start extended inventory stream with select filters.

Tags are delivered via `inventoryEx` events with parsed tag data.
Tags also accumulate in `tagStorage` automatically.
Sent via NUR_CMD_INVENTORYEX (0x3B) with stream flag bit set.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params | [`InventoryExParams`](#inventoryexparams) | Extended inventory parameters including filters |

**Returns** `Promise`\<`void`\>

###### stopInventoryStream()

> **stopInventoryStream**(): `Promise`\<`void`\>


Stop the standard inventory stream.

Sends NUR_CMD_INVENTORYSTREAM (0x39) with empty payload to stop.
Use `stopInventoryExStream()` to stop an extended inventory stream,
or `stopStreaming()` to stop all streaming operations.

**Returns** `Promise`\<`void`\>

###### stopInventoryExStream()

> **stopInventoryExStream**(): `Promise`\<`void`\>


Stop the extended inventory stream.

Sends NUR_CMD_INVENTORYEX (0x3B) with stop payload [0x01].
Use `stopInventoryStream()` to stop a standard inventory stream,
or `stopStreaming()` to stop all streaming operations.

**Returns** `Promise`\<`void`\>

###### startTraceTagStream()

> **startTraceTagStream**(`params`): `Promise`\<`void`\>


Start continuous trace tag stream.

Continuously traces a tag by RSSI. Results are delivered via `traceTag` events.
The stream runs until explicitly stopped with [stopTraceTagStream](#stoptracetagstream).

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params | [`TraceTagParams`](#tracetagparams) | Trace parameters (bank, address, maskData, flags) |

**Returns** `Promise`\<`void`\>

###### Example

```typescript
reader.on('traceTag', (data) => {
  console.log(`RSSI: ${data.rssi} dBm, scaled: ${data.scaledRssi}%`);
});
await reader.startTraceTagStream({
  bank: NurBank.EPC,
  address: 32,
  maskData: epcBytes,
});
```

###### See

 - [stopTraceTagStream](#stoptracetagstream)
 - [stopStreaming](#stopstreaming)

###### stopTraceTagStream()

> **stopTraceTagStream**(): `Promise`\<`void`\>


Stop the continuous trace tag stream.

Sends NUR_CMD_TRACETAG (0x38) with STOP_CONTINUOUS flag.

**Returns** `Promise`\<`void`\>

###### nxpAlarm()

> **nxpAlarm**(): `Promise`\<`boolean`\>


Perform a one-shot NXP EAS alarm check.

Returns `true` if armed EAS tags are detected in the reader's field,
`false` otherwise (including when no tags are present).

For continuous monitoring, use [startNxpAlarmStream](#startnxpalarmstream) instead.

**Returns** `Promise`\<`boolean`\>

###### startNxpAlarmStream()

> **startNxpAlarmStream**(): `Promise`\<`void`\>


Start NXP EAS alarm stream.

Alarms are delivered via `nxpAlarm` events.
Sent via NUR_CMD_NXP_EASALARM (0x52) with start payload [0x01].

**Returns** `Promise`\<`void`\>

###### stopNxpAlarmStream()

> **stopNxpAlarmStream**(): `Promise`\<`void`\>


Stop NXP EAS alarm stream.

Sent via NUR_CMD_NXP_EASALARM (0x52) with stop payload [0x00].

**Returns** `Promise`\<`void`\>

###### stopStreaming()

> **stopStreaming**(): `Promise`\<`void`\>


Stop all active streaming operations.

Convenience method that resets all stream flags and sends STOPALLCONT.

**Returns** `Promise`\<`void`\>

###### clearTagStorage()

> **clearTagStorage**(): `Promise`\<`void`\>


Clear the internal tag storage.

Also clears the module's tag ID buffer.

**Returns** `Promise`\<`void`\>

###### on()

> **on**\<`K`\>(`event`, `listener`): `this`


Subscribe to an event.

###### Type Parameters

###### K

`K` *extends* `"disconnected"` \| `"connecting"` \| `"connected"` \| `"notification"` \| `"inventoryEx"` \| `"nxpAlarm"` \| `"boot"` \| `"ioChange"` \| `"inventoryStream"` \| `"traceTag"` \| `"triggerRead"` \| `"hopEvent"` \| `"debugMessage"` \| `"epcEnum"` \| `"autoTune"` \| `"diagReport"` \| `"general"` \| `"wlanSearch"` \| `"accBarcode"` \| `"accSensorChanged"` \| `"accSensorRangeData"` \| `"accSensorToFFrBfaRawData"` \| `"log"`

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| event | `K` | Event name. |
| listener | [`NurApiEvents`](#nurapievents)\[`K`\] | Callback invoked when the event fires. |

**Returns** `this`

###### off()

> **off**\<`K`\>(`event`, `listener`): `this`


Unsubscribe from an event.

If the listener was registered with `once()`, the original reference
can be used to remove it before it fires.

###### Type Parameters

###### K

`K` *extends* `"disconnected"` \| `"connecting"` \| `"connected"` \| `"notification"` \| `"inventoryEx"` \| `"nxpAlarm"` \| `"boot"` \| `"ioChange"` \| `"inventoryStream"` \| `"traceTag"` \| `"triggerRead"` \| `"hopEvent"` \| `"debugMessage"` \| `"epcEnum"` \| `"autoTune"` \| `"diagReport"` \| `"general"` \| `"wlanSearch"` \| `"accBarcode"` \| `"accSensorChanged"` \| `"accSensorRangeData"` \| `"accSensorToFFrBfaRawData"` \| `"log"`

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| event | `K` | Event name. |
| listener | [`NurApiEvents`](#nurapievents)\[`K`\] | The same callback reference passed to `on()` or `once()`. |

**Returns** `this`

###### once()

> **once**\<`K`\>(`event`, `listener`): `this`


Subscribe to an event for a single invocation.

The original listener reference can be passed to `off()` to cancel
before the event fires.

###### Type Parameters

###### K

`K` *extends* `"disconnected"` \| `"connecting"` \| `"connected"` \| `"notification"` \| `"inventoryEx"` \| `"nxpAlarm"` \| `"boot"` \| `"ioChange"` \| `"inventoryStream"` \| `"traceTag"` \| `"triggerRead"` \| `"hopEvent"` \| `"debugMessage"` \| `"epcEnum"` \| `"autoTune"` \| `"diagReport"` \| `"general"` \| `"wlanSearch"` \| `"accBarcode"` \| `"accSensorChanged"` \| `"accSensorRangeData"` \| `"accSensorToFFrBfaRawData"` \| `"log"`

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| event | `K` | Event name. |
| listener | [`NurApiEvents`](#nurapievents)\[`K`\] | Callback invoked once when the event fires. |

**Returns** `this`

###### emit()

> **emit**\<`K`\>(`event`, ...`args`): `void`


Emit an event, calling all subscribed listeners.

###### Type Parameters

###### K

`K` *extends* `"disconnected"` \| `"connecting"` \| `"connected"` \| `"notification"` \| `"inventoryEx"` \| `"nxpAlarm"` \| `"boot"` \| `"ioChange"` \| `"inventoryStream"` \| `"traceTag"` \| `"triggerRead"` \| `"hopEvent"` \| `"debugMessage"` \| `"epcEnum"` \| `"autoTune"` \| `"diagReport"` \| `"general"` \| `"wlanSearch"` \| `"accBarcode"` \| `"accSensorChanged"` \| `"accSensorRangeData"` \| `"accSensorToFFrBfaRawData"` \| `"log"`

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| event | `K` | Event name. |
| args | ...`Parameters`\<[`NurApiEvents`](#nurapievents)\[`K`\]\> | Arguments forwarded to each listener. |

**Returns** `void`

###### removeAllListeners()

> **removeAllListeners**(`event?`): `this`


Remove all listeners, optionally scoped to a single event.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| event? | `"disconnected"` \| `"connecting"` \| `"connected"` \| `"notification"` \| `"inventoryEx"` \| `"nxpAlarm"` \| `"boot"` \| `"ioChange"` \| `"inventoryStream"` \| `"traceTag"` \| `"triggerRead"` \| `"hopEvent"` \| `"debugMessage"` \| `"epcEnum"` \| `"autoTune"` \| `"diagReport"` \| `"general"` \| `"wlanSearch"` \| `"accBarcode"` \| `"accSensorChanged"` \| `"accSensorRangeData"` \| `"accSensorToFFrBfaRawData"` \| `"log"` | If provided, only remove listeners for this event. |

**Returns** `this`

###### listenerCount()

> **listenerCount**(`event`): `number`


Return the number of listeners for a given event.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| event | `"disconnected"` \| `"connecting"` \| `"connected"` \| `"notification"` \| `"inventoryEx"` \| `"nxpAlarm"` \| `"boot"` \| `"ioChange"` \| `"inventoryStream"` \| `"traceTag"` \| `"triggerRead"` \| `"hopEvent"` \| `"debugMessage"` \| `"epcEnum"` \| `"autoTune"` \| `"diagReport"` \| `"general"` \| `"wlanSearch"` \| `"accBarcode"` \| `"accSensorChanged"` \| `"accSensorRangeData"` \| `"accSensorToFFrBfaRawData"` \| `"log"` | Event name. |

**Returns** `number`

##### Properties

###### tagStorage

> `readonly` **tagStorage**: [`TagStorage`](#tagstorage-1)


Internal tag storage, populated during streaming inventory.

***

#### ReconnectOptions


Options for configuring auto-reconnect behavior.

##### Properties

###### initialInterval?

> `optional` **initialInterval?**: `number`


Initial reconnect delay in ms (default 1000).

###### maxInterval?

> `optional` **maxInterval?**: `number`


Maximum reconnect delay in ms (default 30000).

###### backoffMultiplier?

> `optional` **backoffMultiplier?**: `number`


Backoff multiplier (default 2).

***

#### ReconnectHandler


Manages reconnection attempts with exponential backoff.

##### Example

```typescript
const handler = new ReconnectHandler({ initialInterval: 1000 });
handler.start(async () => {
  await transport.connect(uri);
});
// On success, call handler.reset() + handler.stop()
// On explicit disconnect, call handler.stop()
```

##### Accessors

###### active

###### Get Signature

> **get** **active**(): `boolean`


Whether the reconnect loop is currently active.

**Returns** `boolean`

##### Constructors

###### Constructor

> **new ReconnectHandler**(`options?`): [`ReconnectHandler`](#reconnecthandler)


**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| options? | [`ReconnectOptions`](#reconnectoptions) = `{}` |  |

**Returns** [`ReconnectHandler`](#reconnecthandler)

##### Methods

###### start()

> **start**(`connectFn`, `onFailed?`): `void`


Start the reconnect loop.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| connectFn | () => `Promise`\<`void`\> | Async function that attempts to reconnect. If it resolves, reconnection was successful (caller should call stop + reset). If it rejects, the next attempt is scheduled with increased backoff. |
| onFailed? | (`error`) => `void` | Optional callback when an attempt fails (for logging/events). |

**Returns** `void`

###### stop()

> **stop**(): `void`


Stop the reconnect loop. Cancels any pending timer.

**Returns** `void`

###### reset()

> **reset**(): `void`


Reset backoff to the initial interval (call after successful connect).

**Returns** `void`

##### Properties

###### initialInterval

> `readonly` **initialInterval**: `number`


###### maxInterval

> `readonly` **maxInterval**: `number`


###### backoffMultiplier

> `readonly` **backoffMultiplier**: `number`


***

#### VersionInfo


Version information from the reader module.

##### Properties

###### mode

> **mode**: `number`


Current operating mode (char code: 'A' = Application, 'B' = Bootloader).

###### vMajor

> **vMajor**: `number`


Primary firmware major version.

###### vMinor

> **vMinor**: `number`


Primary firmware minor version.

###### vBuild

> **vBuild**: `string`


Primary firmware build letter (e.g., 'A', 'B').

###### otherMajor

> **otherMajor**: `number`


Secondary firmware major version.

###### otherMinor

> **otherMinor**: `number`


Secondary firmware minor version.

###### otherBuild

> **otherBuild**: `string`


Secondary firmware build letter.

***

#### ReaderInfo


Reader identification and capability summary.

##### Properties

###### serial

> **serial**: `string`


Module serial number.

###### altSerial

> **altSerial**: `string`


Alternative manufacturer serial number (empty string if not available).

###### name

> **name**: `string`


Reader name (e.g., "NUR2-1W").

###### fccId

> **fccId**: `string`


FCC ID string.

###### hwVersion

> **hwVersion**: `string`


Hardware version string.

###### swVersion

> **swVersion**: \[`number`, `number`, `string`\]


Software version [major, minor, build letter].

###### numGpio

> **numGpio**: `number`


Number of GPIO pins available on module.

###### numSensors

> **numSensors**: `number`


Number of sensors available on module.

###### numRegions

> **numRegions**: `number`


Number of supported regions.

###### numAntennas

> **numAntennas**: `number`


Number of enabled antennas on module.

###### maxAntennas

> **maxAntennas**: `number`


Maximum number of antennas the module supports.

***

#### DeviceCaps


Device capabilities — supported features, chip version, and hardware limits.

##### Properties

###### dwSize

> **dwSize**: `number`


Structure size in bytes (used for protocol versioning).

###### flagSet1

> **flagSet1**: `number`


Device capabilities flag set 1 — bitmask of supported features (RX decodings, link frequencies, sensors, etc.).

###### flagSet2

> **flagSet2**: `number`


Device capabilities flag set 2 — reserved for future use.

###### maxTxdBm

> **maxTxdBm**: `number`


Maximum TX power in dBm.

###### txAttnStep

> **txAttnStep**: `number`


TX level attenuation per step in dBm.

###### maxTxmW

> **maxTxmW**: `number`


Maximum TX level in mW.

###### txSteps

> **txSteps**: `number`


Number of TX attenuation steps available.

###### szTagBuffer

> **szTagBuffer**: `number`


Number of 96-bit EPCs that the module tag buffer can hold.

###### curCfgMaxAnt

> **curCfgMaxAnt**: `number`


Maximum number of antennas with current configuration.

###### curCfgMaxGPIO

> **curCfgMaxGPIO**: `number`


Maximum number of GPIO pins with current configuration.

###### chipVersion

> **chipVersion**: `number`


RFID chip version code (e.g., 3 = R2000, 7 = E710).

###### moduleType

> **moduleType**: `number`


Module type code (e.g., 5 = NUR2-1W, 9 = NUR3-1W).

###### moduleConfigFlags

> **moduleConfigFlags**: `number`


Module configuration flag bits (USB table reader, ETH table reader, etc.).

###### ver2Level

> **ver2Level**: `number`


Gen2 version 2 support level (0 = none, 1 = Authenticate/Untraceable/ReadBuffer).

###### secChipMajorVersion

> **secChipMajorVersion**: `number`


Secondary chip major software version.

###### secChipMinorVersion

> **secChipMinorVersion**: `number`


Secondary chip minor software version.

###### secChipMaintenanceVersion

> **secChipMaintenanceVersion**: `number`


Secondary chip maintenance software version.

###### secChipReleaseVersion

> **secChipReleaseVersion**: `number`


Secondary chip release software version.

***

#### SystemInfo


System-level hardware/firmware information.

##### See

[NurApi.getSystemInfo](#getsysteminfo)

##### Properties

###### blAddr

> **blAddr**: `number`


Bootloader address.

###### appAddr

> **appAddr**: `number`


Application address.

###### vectorBase

> **vectorBase**: `number`


Interrupt vector base address.

###### appSzWord

> **appSzWord**: `number`


Application size in words.

###### appCRCWord

> **appCRCWord**: `number`


Application CRC word.

###### szFlash

> **szFlash**: `number`


Flash size in bytes.

###### szSram

> **szSram**: `number`


SRAM size in bytes.

###### stackTop

> **stackTop**: `number`


Stack top address.

###### nvSetAddr

> **nvSetAddr**: `number`


Non-volatile settings address.

###### szNvSettings

> **szNvSettings**: `number`


Size of non-volatile settings region.

###### mainStackUsage

> **mainStackUsage**: `number`


Main stack usage at app entry.

###### szUsedSram

> **szUsedSram**: `number`


Used SRAM in bytes.

###### szTagBuffer

> **szTagBuffer**: `number`


Internal tag buffer size in bytes.

***

#### ConnectionStatus


Connection status of the NUR API instance.

##### Enumeration Members

###### Disconnected

> **Disconnected**: `"disconnected"`


Not connected to any reader.

###### Connecting

> **Connecting**: `"connecting"`


Connection attempt in progress.

###### Connected

> **Connected**: `"connected"`


Connected and ready for communication.

### Inventory

#### InventoryResult


Result from an inventory round.

##### Properties

###### tagsFound

> **tagsFound**: `number`


Number of tags found in this round.

###### tagsMem

> **tagsMem**: `number`


Total number of tags stored in the module's tag buffer.

###### roundsDone

> **roundsDone**: `number`


Number of inventory rounds completed.

###### collisions

> **collisions**: `number`


Number of collisions detected.

###### Q

> **Q**: `number`


Final Q value used.

***

#### TagEntry


A single tag entry from the tag buffer.

##### Extended by

- [`StoredTag`](#storedtag)

##### Properties

###### rssi

> **rssi**: `number`


Raw RSSI value (dBm, signed).

###### scaledRssi

> **scaledRssi**: `number`


Scaled RSSI (0-100).

###### timestamp

> **timestamp**: `number`


Timestamp of detection (module ticks).

###### freq

> **freq**: `number`


Frequency at which the tag was read (Hz).

###### channel

> **channel**: `number`


Channel index.

###### antennaId

> **antennaId**: `number`


Antenna ID that read the tag.

###### epc

> **epc**: `Uint8Array`


Raw EPC bytes.

###### epcHex

> **epcHex**: `string`


Hex-encoded EPC string (uppercase).

###### pc

> **pc**: `number`


Protocol Control (PC) word.

###### data?

> `optional` **data?**: `Uint8Array`\<`ArrayBufferLike`\>


Optional inventory-read (IR) data, if IR was enabled.

###### xpcW1?

> `optional` **xpcW1?**: `number`


XPC word 1, present if PC bit 9 (XPC indicator) is set.

###### xpcW2?

> `optional` **xpcW2?**: `number`


XPC word 2, present if XPC_W1 bit 15 (XEB) is set.

***

#### InventorySelectParams


Parameters for inventory with tag selection filter.

##### Properties

###### Q?

> `optional` **Q?**: `number`


Query parameter Q (0-15). Defaults to reader's configured value.

###### session?

> `optional` **session?**: `number`


Session (0-3). Defaults to reader's configured value.

###### rounds?

> `optional` **rounds?**: `number`


Number of inventory rounds. Defaults to reader's configured value.

###### invertSelect?

> `optional` **invertSelect?**: `boolean`


Invert the select flag.

###### bank

> **bank**: `number`


Memory bank for the selection mask.

###### address

> **address**: `number`


Bit address in the selected memory bank.

###### maskData

> **maskData**: `Uint8Array`


Selection mask data.

###### maskBitLen?

> `optional` **maskBitLen?**: `number`


Mask length in bits. Defaults to `maskData.length * 8`.

***

#### InventoryExParams


Parameters for extended inventory with select filters.

##### Example

```typescript
// Inventory with EPC filter — only tags starting with 'E200'
const result = await reader.inventoryEx({
  Q: 4,
  session: 0,
  rounds: 5,
  filters: [{
    bank: NurBank.EPC,
    address: 32, // bit address (word 2 * 16)
    maskData: new Uint8Array([0xE2, 0x00]),
  }],
});
```

##### Properties

###### flags?

> `optional` **flags?**: `number`


Control flags.

###### Q?

> `optional` **Q?**: `number`


Q parameter (0-15). 0 = automatic.

###### session?

> `optional` **session?**: `number`


Session (0-3).

###### rounds?

> `optional` **rounds?**: `number`


Number of rounds. 0 = automatic.

###### transitTime?

> `optional` **transitTime?**: `number`


Transit time in ms.

###### inventoryTarget?

> `optional` **inventoryTarget?**: `number`


Inventory target. Use [NurInventoryTarget](#nurinventorytarget) enum values.

###### inventorySelState?

> `optional` **inventorySelState?**: `number`


Inventory selection state. Use [NurInventorySelState](#nurinventoryselstate) enum values.

###### filters?

> `optional` **filters?**: [`InventoryExFilter`](#inventoryexfilter)[]


Select filters to apply.

***

#### InventoryExFilter


A single select filter for inventoryEx.

##### Properties

###### truncate?

> `optional` **truncate?**: `number`


Truncate action.

###### target?

> `optional` **target?**: `number`


Target (0-4).

###### action?

> `optional` **action?**: `number`


Action (0-7).

###### bank

> **bank**: `number`


Memory bank (0-3). Use [NurBank](#nurbank) enum values.

###### address

> **address**: `number`


Bit address in the memory bank.

###### maskData

> **maskData**: `Uint8Array`


Mask data to match against.

###### maskBitLen?

> `optional` **maskBitLen?**: `number`


Mask length in bits (default: maskData.length * 8).

### Tag Operations

#### Monza4QtParams


Parameters for Monza4 QT read/write.

##### Properties

###### password?

> `optional` **password?**: `number`


Access password (sent with RW_SEC always set). Default 0.

###### write

> **write**: `boolean`


True to write QT settings, false to read.

###### reduce

> **reduce**: `boolean`


Short-range mode.

###### publicMemory

> **publicMemory**: `boolean`


Public memory mode.

###### epc?

> `optional` **epc?**: `Uint8Array`\<`ArrayBufferLike`\>


EPC data for tag singulation (shortcut — mutually exclusive with singulation).

###### singulation?

> `optional` **singulation?**: [`Singulation`](#singulation-13)


Full singulation parameters (mutually exclusive with epc).

***

#### Monza4QtResult


Result from a Monza4 QT read.

##### Properties

###### qtParam

> **qtParam**: `number`


Raw QT parameter word.

###### shortRange

> **shortRange**: `boolean`


True if short-range mode is enabled.

###### publicMemory

> **publicMemory**: `boolean`


True if public memory mode is enabled.

***

#### NxpCommandParams


Parameters for NXP Read Protect and EAS commands.

##### Properties

###### password?

> `optional` **password?**: `number`


Access password.

###### set

> **set**: `boolean`


True to enable/arm, false to disable/disarm.

###### epc?

> `optional` **epc?**: `Uint8Array`\<`ArrayBufferLike`\>


EPC data for tag singulation (shortcut — mutually exclusive with singulation).

###### singulation?

> `optional` **singulation?**: [`Singulation`](#singulation-13)


Full singulation parameters (mutually exclusive with epc).

***

#### PermalockCmdParams


Parameters for a permalock read or write operation.

##### Properties

###### password?

> `optional` **password?**: `number`


Access password (required for secured access).

###### lock

> **lock**: `boolean`


True to write (lock blocks), false to read lock status.

###### bank

> **bank**: `number`


Memory bank (1-3).

###### address

> **address**: `number`


Starting word address (multiplied by 16 to get the first block number).

###### range

> **range**: `number`


Number of 16-bit word blocks to read/lock.

###### mask?

> `optional` **mask?**: `number`[]


Lock mask words (required for write mode, one u16 per block).

###### epc?

> `optional` **epc?**: `Uint8Array`\<`ArrayBufferLike`\>


EPC data for tag singulation (shortcut — mutually exclusive with singulation).

###### singulation?

> `optional` **singulation?**: [`Singulation`](#singulation-13)


Full singulation parameters (mutually exclusive with epc).

***

#### ReadTagParams


Parameters for reading tag memory.

##### Example

```typescript
// Read 4 words from EPC bank starting at word address 2
const data = await reader.readTag({
  bank: NurBank.EPC,
  address: 2,
  wordCount: 4,
});
```

##### Properties

###### bank

> **bank**: `number`


Memory bank to read from. Use [NurBank](#nurbank) enum values.

###### address

> **address**: `number`


Word address to start reading from.

###### wordCount

> **wordCount**: `number`


Number of 16-bit words to read.

###### password?

> `optional` **password?**: `number`


Access password (required for secured memory banks).

###### epc?

> `optional` **epc?**: `Uint8Array`\<`ArrayBufferLike`\>


EPC data for tag singulation (shortcut — mutually exclusive with singulation).

###### singulation?

> `optional` **singulation?**: [`Singulation`](#singulation-13)


Full singulation parameters (mutually exclusive with epc).

***

#### WriteTagParams


Parameters for writing tag memory.

##### Example

```typescript
// Write 2 words to user memory bank at word address 0
await reader.writeTag({
  bank: NurBank.USER,
  address: 0,
  data: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
});
```

##### Properties

###### bank

> **bank**: `number`


Memory bank to write to. Use [NurBank](#nurbank) enum values.

###### address

> **address**: `number`


Word address to start writing at.

###### data

> **data**: `Uint8Array`


Data to write (must be word-aligned — even number of bytes).

###### password?

> `optional` **password?**: `number`


Access password (required for secured memory banks).

###### epc?

> `optional` **epc?**: `Uint8Array`\<`ArrayBufferLike`\>


EPC data for tag singulation (shortcut — mutually exclusive with singulation).

###### singulation?

> `optional` **singulation?**: [`Singulation`](#singulation-13)


Full singulation parameters (mutually exclusive with epc).

***

#### WriteEpcParams


Parameters for writing a new EPC to a tag.

##### Properties

###### currentEpc?

> `optional` **currentEpc?**: `Uint8Array`\<`ArrayBufferLike`\>


Current EPC of the tag to modify (shortcut singulation — mutually exclusive with singulation).

###### newEpc

> **newEpc**: `Uint8Array`


New EPC to write.

###### password?

> `optional` **password?**: `number`


Access password.

###### singulation?

> `optional` **singulation?**: [`Singulation`](#singulation-13)


Full singulation parameters (mutually exclusive with currentEpc).

***

#### ScanSingleResult


Result from scanSingle.

##### Properties

###### antennaId

> **antennaId**: `number`


Antenna that read the tag.

###### rssi

> **rssi**: `number`


Raw RSSI (dBm, signed).

###### scaledRssi

> **scaledRssi**: `number`


Scaled RSSI (0-100).

###### epc

> **epc**: `Uint8Array`


Tag EPC bytes.

###### epcHex

> **epcHex**: `string`


Hex-encoded EPC string (uppercase).

***

#### LockTagParams


Parameters for locking tag memory.

##### Properties

###### lockMask

> **lockMask**: `number`


Lock mask — which memory areas to affect.

###### lockAction

> **lockAction**: `number`


Lock action — what lock state to apply.

###### password?

> `optional` **password?**: `number`


Access password. Omit or pass 0 for open-state lock (no password required).

###### epc?

> `optional` **epc?**: `Uint8Array`\<`ArrayBufferLike`\>


EPC data for tag singulation (shortcut — mutually exclusive with singulation).

###### singulation?

> `optional` **singulation?**: [`Singulation`](#singulation-13)


Full singulation parameters (mutually exclusive with epc).

***

#### KillTagParams


Parameters for killing a tag.

##### Properties

###### password

> **password**: `number`


Kill password (required, must be non-zero).

###### epc?

> `optional` **epc?**: `Uint8Array`\<`ArrayBufferLike`\>


EPC data for tag singulation (shortcut — mutually exclusive with singulation).

###### singulation?

> `optional` **singulation?**: [`Singulation`](#singulation-13)


Full singulation parameters (mutually exclusive with epc).

***

#### TraceTagParams


Parameters for tag tracing (locating a tag by RSSI).

##### Properties

###### bank

> **bank**: `number`


Memory bank for the mask. Use [NurBank](#nurbank) enum values.

###### address

> **address**: `number`


Bit address in the memory bank.

###### maskData

> **maskData**: `Uint8Array`


Mask data to match.

###### maskBitLen?

> `optional` **maskBitLen?**: `number`


Mask bit length (default: maskData.length * 8).

###### flags?

> `optional` **flags?**: `number`


Flags (e.g., NUR_TRACETAG_NO_EPC).

***

#### TraceTagResult


Trace tag result — RSSI measurement for tag location.

##### Properties

###### rssi

> **rssi**: `number`


Raw RSSI value (dBm, signed).

###### scaledRssi

> **scaledRssi**: `number`


Scaled RSSI (0-100).

###### antennaId

> **antennaId**: `number`


Antenna that detected the tag.

###### epc

> **epc**: `Uint8Array`


Tag EPC bytes.

###### epcHex

> **epcHex**: `string`


Hex-encoded EPC string (uppercase).

***

#### Singulation


Generic tag singulation parameters for targeting specific tags.

##### Properties

###### bank

> **bank**: `number`


Memory bank for the mask.

###### address

> **address**: `number`


Bit address in the memory bank.

###### maskData

> **maskData**: `Uint8Array`


Mask data to match.

###### maskBitLen?

> `optional` **maskBitLen?**: `number`


Mask length in bits (default: maskData.length * 8).

***

#### BlockWriteTagParams


Parameters for block-writing tag memory.

##### Properties

###### bank

> **bank**: `number`


Memory bank to write to.

###### address

> **address**: `number`


Word address to start writing at.

###### data

> **data**: `Uint8Array`


Data to write (must be word-aligned — even number of bytes).

###### blSize?

> `optional` **blSize?**: `number`


Block size in words (default: 1).

###### password?

> `optional` **password?**: `number`


Access password.

###### epc?

> `optional` **epc?**: `Uint8Array`\<`ArrayBufferLike`\>


EPC data for tag singulation (shortcut — mutually exclusive with singulation).

###### singulation?

> `optional` **singulation?**: [`Singulation`](#singulation-13)


Full singulation parameters (mutually exclusive with epc).

***

#### BlockEraseTagParams


Parameters for block-erasing tag memory.

##### Properties

###### bank

> **bank**: `number`


Memory bank to erase.

###### address

> **address**: `number`


Word address to start erasing at.

###### wordCount

> **wordCount**: `number`


Number of words to erase.

###### password?

> `optional` **password?**: `number`


Access password.

###### epc?

> `optional` **epc?**: `Uint8Array`\<`ArrayBufferLike`\>


EPC data for tag singulation (shortcut — mutually exclusive with singulation).

###### singulation?

> `optional` **singulation?**: [`Singulation`](#singulation-13)


Full singulation parameters (mutually exclusive with epc).

### Configuration

#### ModuleSetup


Module setup — readable/writable configuration of the NUR reader module.

Use [NurApi.getModuleSetup](#getmodulesetup) to read and [NurApi.setModuleSetup](#setmodulesetup)
to write (accepts `Partial<ModuleSetup>`).

##### Example

```typescript
// Read current setup
const setup = await reader.getModuleSetup();
console.log(`TX level: ${setup.txLevel}, Region: ${setup.regionId}`);

// Change TX level and save to flash
await reader.setModuleSetup({ txLevel: 5 });
await reader.storeSetup();
```

##### Properties

###### linkFreq

> **linkFreq**: `number`


Link frequency in Hz (160000 / 256000 / 320000 = 160 / 256 / 320 kHz).

###### rxDecoding

> **rxDecoding**: `number`


RX encoding (Miller encoding). Use [NurRxDecoding](#nurrxdecoding) enum values.

###### txLevel

> **txLevel**: `number`


TX power level in 1 dB steps (0–19). Subtracted from max TX. Level 0 = max power.

###### txModulation

> **txModulation**: `number`


TX modulation style. Use [NurTxModulation](#nurtxmodulation) enum values.

###### regionId

> **regionId**: `number`


Region ID. Use [NurRegionId](#nurregionid) enum values.

###### inventoryQ

> **inventoryQ**: `number`


Inventory Q value (0–15). 0 = automatic Q selection.

###### inventorySession

> **inventorySession**: `number`


Inventory session. Use [NurInventorySession](#nurinventorysession) enum values.

###### inventoryRounds

> **inventoryRounds**: `number`


Module's internal inventory rounds per call (0–10). 0 = automatic.

###### scanSingleTriggerTimeout

> **scanSingleTriggerTimeout**: `number`


Triggered single-scan timeout in milliseconds.

###### inventoryTriggerTimeout

> **inventoryTriggerTimeout**: `number`


Triggered inventory timeout in milliseconds (0–60000).

###### selectedAntenna

> **selectedAntenna**: `number`


Selected antenna index. Use [NurAntennaId](#nurantennaid) enum values. -1 = auto-select.

###### opFlags

> **opFlags**: `number`


Operation flags. Use [NurOpFlags](#nuropflags) enum values (bitmask).

###### inventoryTarget

> **inventoryTarget**: `number`


Inventory target. Use [NurInventoryTarget](#nurinventorytarget) enum values.

###### inventoryEpcLength

> **inventoryEpcLength**: `number`


Exact EPC reception length in bytes (even values 2–62, or -1 for accept all).

###### readRssiFilter

> **readRssiFilter**: [`RssiFilter`](#rssifilter)


RSSI filter for read operations. Min/max in dBm; 0 disables.

###### writeRssiFilter

> **writeRssiFilter**: [`RssiFilter`](#rssifilter)


RSSI filter for write operations. Min/max in dBm; 0 disables.

###### inventoryRssiFilter

> **inventoryRssiFilter**: [`RssiFilter`](#rssifilter)


RSSI filter for inventory operations. Min/max in dBm; 0 disables.

###### readTO

> **readTO**: `number`


Tag read timeout in ms.

###### writeTO

> **writeTO**: `number`


Tag write timeout in ms.

###### lockTO

> **lockTO**: `number`


Tag lock timeout in ms.

###### killTO

> **killTO**: `number`


Tag kill timeout in ms.

###### periodSetup

> **periodSetup**: `number`


Periodic auto-inventory power saving mode. Use [NurAutoPeriod](#nurautoperiod) enum values.

###### antennaMaskEx

> **antennaMaskEx**: `number`


Extended antenna mask — bitmask supporting up to 32 antennas. Use [NurAntennaMask](#nurantennamask) enum values.

###### autotune

> **autotune**: [`AutotuneSetup`](#autotunesetup)


Runtime auto-tuning setup.

###### antPowerEx

> **antPowerEx**: `number`[]


Extended per-antenna TX levels (0–19). -1 = use default TX level.

###### rxSensitivity

> **rxSensitivity**: `number`


Receiver sensitivity. Use [NurRxSensitivity](#nurrxsensitivity) enum values.

###### rfProfile

> **rfProfile**: `number`


RF profile. Use [NurRfProfile](#nurrfprofile) enum values (ROBUST, NOMINAL, HIGHSPEED, etc.).

###### toSleepTime

> **toSleepTime**: `number`


Time before module enters deep sleep in ms. 0 = disabled.

###### returnedFlags

> **returnedFlags**: `number`


Bitmask of flags actually returned by the reader.

When reading the setup, the reader may not support all requested flags.
This field records which flags were present in the response so callers
know which fields contain real values vs defaults.

***

#### RegionInfo


Region information — RF frequency plan for a regulatory region.

##### Properties

###### regionId

> **regionId**: `number`


Region ID.

###### baseFreq

> **baseFreq**: `number`


RF base frequency in kHz.

###### channelSpacing

> **channelSpacing**: `number`


RF channel spacing in kHz.

###### channelCount

> **channelCount**: `number`


Number of RF channels.

###### channelTime

> **channelTime**: `number`


Maximum RF channel on-time in ms.

###### name

> **name**: `string`


Human-readable region name.

***

#### SensorConfig


Sensor configuration for tap and light sensors.

##### See

 - [NurApi.getSensorConfig](#getsensorconfig)
 - [NurApi.setSensorConfig](#setsensorconfig)

##### Properties

###### tapEnabled

> **tapEnabled**: `boolean`


Whether the tap sensor is enabled.

###### tapAction

> **tapAction**: `number`


Action for tap sensor (use NurGpioAction.NOTIFY or NurGpioAction.SCANTAG).

###### lightEnabled

> **lightEnabled**: `boolean`


Whether the light sensor is enabled.

###### lightAction

> **lightAction**: `number`


Action for light sensor (use NurGpioAction.NOTIFY or NurGpioAction.SCANTAG).

***

#### InventoryReadConfig


Inventory-read (IR) configuration for reading additional tag data during inventory.

##### See

 - [NurApi.getInventoryReadConfig](#getinventoryreadconfig)
 - [NurApi.setInventoryReadConfig](#setinventoryreadconfig)

##### Properties

###### active

> **active**: `boolean`


Whether inventory-read is active.

###### type

> **type**: `number`


Type: 0 = EPC + data, 1 = data only.

###### bank

> **bank**: `number`


Memory bank to read from.

###### wAddress

> **wAddress**: `number`


Word address to start reading from.

###### wLength

> **wLength**: `number`


Number of words to read.

### GPIO

#### GpioPinConfig


GPIO pin configuration.

##### Properties

###### enabled

> **enabled**: `boolean`


Whether this GPIO pin is enabled.

###### type

> **type**: `number`


GPIO type. See GPIO_TYPE constants (INPUT, OUTPUT).

###### edge

> **edge**: `number`


Trigger edge: falling, rising, or both. See GPIO_EDGE constants.

###### action

> **action**: `number`


Trigger action. See GPIO_ACTION constants.

***

#### GpioPinState


GPIO pin state result.

##### Properties

###### number

> **number**: `number`


GPIO pin number.

###### enabled

> **enabled**: `boolean`


Whether this GPIO pin is enabled.

###### type

> **type**: `number`


GPIO type. See GPIO_TYPE constants.

###### state

> **state**: `number`


GPIO state. Only valid if GPIO is configured as input.

### Streaming

#### StoredTag


A stored tag with tracking metadata.

##### Extends

- [`TagEntry`](#tagentry)

##### Properties

###### updateCount

> **updateCount**: `number`


Number of times this tag has been seen (starts at 1).

###### firstSeen

> **firstSeen**: `number`


Timestamp (Date.now()) when first seen in this storage session.

###### lastSeen

> **lastSeen**: `number`


Timestamp (Date.now()) when last seen/updated.

###### rssi

> **rssi**: `number`


Raw RSSI value (dBm, signed).

###### scaledRssi

> **scaledRssi**: `number`


Scaled RSSI (0-100).

###### timestamp

> **timestamp**: `number`


Timestamp of detection (module ticks).

###### freq

> **freq**: `number`


Frequency at which the tag was read (Hz).

###### channel

> **channel**: `number`


Channel index.

###### antennaId

> **antennaId**: `number`


Antenna ID that read the tag.

###### epc

> **epc**: `Uint8Array`


Raw EPC bytes.

###### epcHex

> **epcHex**: `string`


Hex-encoded EPC string (uppercase).

###### pc

> **pc**: `number`


Protocol Control (PC) word.

###### data?

> `optional` **data?**: `Uint8Array`\<`ArrayBufferLike`\>


Optional inventory-read (IR) data, if IR was enabled.

###### xpcW1?

> `optional` **xpcW1?**: `number`


XPC word 1, present if PC bit 9 (XPC indicator) is set.

###### xpcW2?

> `optional` **xpcW2?**: `number`


XPC word 2, present if XPC_W1 bit 15 (XEB) is set.

***

#### TagStorage


Tag accumulator for streaming inventory.

Tags are deduplicated by EPC hex string. Duplicate sightings update
the existing entry's RSSI, timestamp, and antenna info, and increment
[StoredTag.updateCount](#updatecount).

##### Example

```typescript
reader.on('inventoryStream', (event) => {
  for (const tag of reader.tagStorage.toArray()) {
    console.log(`${tag.epcHex} seen ${tag.updateCount}x, RSSI: ${tag.rssi} dBm`);
  }
  if (event.stopped) {
    reader.startInventoryStream(); // restart
  }
});
await reader.startInventoryStream();
```

##### Accessors

###### count

###### Get Signature

> **get** **count**(): `number`


Number of unique tags in storage.

**Returns** `number`

##### Constructors

###### Constructor

> **new TagStorage**(): [`TagStorage`](#tagstorage-1)

**Returns** [`TagStorage`](#tagstorage-1)

##### Methods

###### addOrUpdate()

> **addOrUpdate**(`tag`): `boolean`


Add or update a tag.

If the tag's EPC already exists, the entry is updated with the latest
metadata (RSSI, timestamp, freq, antenna, etc.) and `updateCount` is
incremented. Otherwise a new entry is created.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| tag | [`TagEntry`](#tagentry) | Tag entry to add or update. |

**Returns** `boolean` — `true` if the tag is new, `false` if it was an update.

###### addFromBuffer()

> **addFromBuffer**(`tags`): `number`


Add multiple tags from a parsed tag buffer.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| tags | [`TagEntry`](#tagentry)[] | Array of tag entries. |

**Returns** `number` — Number of **new** (previously unseen) tags added.

###### toArray()

> **toArray**(): [`StoredTag`](#storedtag)[]


Get all stored tags as an array snapshot.

Returns a copy — mutations to the array do not affect storage.

**Returns** [`StoredTag`](#storedtag)[]

###### get()

> **get**(`epcHex`): [`StoredTag`](#storedtag) \| `undefined`


Get a tag by EPC hex string.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| epcHex | `string` | Tag EPC as uppercase hex. |

**Returns** [`StoredTag`](#storedtag) \| `undefined` — The stored tag, or `undefined` if not found.

###### clear()

> **clear**(): `void`


Remove all tags from storage.

**Returns** `void`

### Events

#### NurApiEvents

> **NurApiEvents** = `object`


Events emitted by NurApi — connection lifecycle + typed notifications.

##### Properties

###### connecting

> **connecting**: () => `void`


Emitted when a connection attempt starts.

**Returns** `void`

###### connected

> **connected**: () => `void`


Emitted when the connection is established and verified.

**Returns** `void`

###### disconnected

> **disconnected**: () => `void`


Emitted when the connection is lost or closed.

**Returns** `void`

###### notification

> **notification**: (`packet`) => `void`


Emitted for every raw unsolicited notification packet.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| packet | [`ParsedPacket`](#parsedpacket) |  |

**Returns** `void`

###### boot

> **boot**: (`data`) => `void`


Reader module has booted or reset.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| data | [`BootEvent`](#bootevent) |  |

**Returns** `void`

###### ioChange

> **ioChange**: (`data`) => `void`


GPIO pin or sensor state changed.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| data | [`IOChangeEvent`](#iochangeevent) |  |

**Returns** `void`

###### inventoryStream

> **inventoryStream**: (`data`) => `void`


Streaming inventory progress.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| data | [`InventoryStreamEvent`](#inventorystreamevent) |  |

**Returns** `void`

###### traceTag

> **traceTag**: (`data`) => `void`


Tag trace result.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| data | [`TraceTagEvent`](#tracetagevent) |  |

**Returns** `void`

###### triggerRead

> **triggerRead**: (`data`) => `void`


GPIO/sensor-triggered tag read.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| data | [`TriggerReadEvent`](#triggerreadevent) |  |

**Returns** `void`

###### hopEvent

> **hopEvent**: (`data`) => `void`


Frequency hop event.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| data | [`HopEvent`](#hopevent-1) |  |

**Returns** `void`

###### debugMessage

> **debugMessage**: (`data`) => `void`


Debug/log message from the reader firmware.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| data | [`DebugMessageEvent`](#debugmessageevent) |  |

**Returns** `void`

###### inventoryEx

> **inventoryEx**: (`data`) => `void`


Extended streaming inventory progress.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| data | [`InventoryStreamEvent`](#inventorystreamevent) |  |

**Returns** `void`

###### nxpAlarm

> **nxpAlarm**: (`data`) => `void`


NXP EAS alarm stream event.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| data | [`NxpAlarmEvent`](#nxpalarmevent) |  |

**Returns** `void`

###### epcEnum

> **epcEnum**: (`data`) => `void`


EPC enumeration result.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| data | [`EpcEnumEvent`](#epcenumevent) |  |

**Returns** `void`

###### autoTune

> **autoTune**: (`data`) => `void`


Antenna auto-tune event.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| data | [`TuneEvent`](#tuneevent) |  |

**Returns** `void`

###### diagReport

> **diagReport**: (`data`) => `void`


Diagnostic report from the reader.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| data | [`DiagReportEvent`](#diagreportevent) |  |

**Returns** `void`

###### general

> **general**: (`data`) => `void`


General-purpose notification.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| data | [`GeneralEvent`](#generalevent) |  |

**Returns** `void`

###### wlanSearch

> **wlanSearch**: (`data`) => `void`


WLAN network search result.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| data | [`WlanSearchEvent`](#wlansearchevent) |  |

**Returns** `void`

###### accBarcode

> **accBarcode**: (`data`) => `void`


Barcode scan result from accessory device.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| data | [`AccBarcodeEvent`](#accbarcodeevent) |  |

**Returns** `void`

###### accSensorChanged

> **accSensorChanged**: (`data`) => `void`


Accessory sensor added or removed.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| data | [`AccSensorChangedEvent`](#accsensorchangedevent) |  |

**Returns** `void`

###### accSensorRangeData

> **accSensorRangeData**: (`data`) => `void`


Range sensor data from accessory.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| data | [`AccSensorRangeDataEvent`](#accsensorrangedataevent) |  |

**Returns** `void`

###### accSensorToFFrBfaRawData

> **accSensorToFFrBfaRawData**: (`data`) => `void`


ToF FR BFA raw sensor data from accessory.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| data | [`AccSensorToFFrBfaRawDataEvent`](#accsensortoffrbfarawdataevent) |  |

**Returns** `void`

###### log

> **log**: (`entry`) => `void`


Internal debug log entry (connection lifecycle, commands, errors).

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| entry | [`LogEntry`](#logentry) |  |

**Returns** `void`

***

#### TypedEventEmitter


A generic typed event emitter.

##### Example

```typescript
interface MyEvents {
  data: (value: number) => void;
  error: (err: Error) => void;
}
const ee = new TypedEventEmitter<MyEvents>();
ee.on('data', (v) => console.log(v));
```

##### Extended by

- [`NurApi`](#nurapi)
- [`NurDeviceDiscovery`](#nurdevicediscovery)

##### Type Parameters

###### Events

`Events` *extends* `Record`\<`string`, (...`args`) => `void`\>

— Record mapping event names to listener signatures.

##### Constructors

###### Constructor

> **new TypedEventEmitter**\<`Events`\>(): [`TypedEventEmitter`](#typedeventemitter)\<`Events`\>

**Returns** [`TypedEventEmitter`](#typedeventemitter)\<`Events`\>

##### Methods

###### on()

> **on**\<`K`\>(`event`, `listener`): `this`


Subscribe to an event.

###### Type Parameters

###### K

`K` *extends* `string`

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| event | `K` | Event name. |
| listener | `Events`\[`K`\] | Callback invoked when the event fires. |

**Returns** `this`

###### off()

> **off**\<`K`\>(`event`, `listener`): `this`


Unsubscribe from an event.

If the listener was registered with `once()`, the original reference
can be used to remove it before it fires.

###### Type Parameters

###### K

`K` *extends* `string`

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| event | `K` | Event name. |
| listener | `Events`\[`K`\] | The same callback reference passed to `on()` or `once()`. |

**Returns** `this`

###### once()

> **once**\<`K`\>(`event`, `listener`): `this`


Subscribe to an event for a single invocation.

The original listener reference can be passed to `off()` to cancel
before the event fires.

###### Type Parameters

###### K

`K` *extends* `string`

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| event | `K` | Event name. |
| listener | `Events`\[`K`\] | Callback invoked once when the event fires. |

**Returns** `this`

###### emit()

> **emit**\<`K`\>(`event`, ...`args`): `void`


Emit an event, calling all subscribed listeners.

###### Type Parameters

###### K

`K` *extends* `string`

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| event | `K` | Event name. |
| args | ...`Parameters`\<`Events`\[`K`\]\> | Arguments forwarded to each listener. |

**Returns** `void`

###### removeAllListeners()

> **removeAllListeners**(`event?`): `this`


Remove all listeners, optionally scoped to a single event.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| event? | `string` & keyof `Events` | If provided, only remove listeners for this event. |

**Returns** `this`

###### listenerCount()

> **listenerCount**(`event`): `number`


Return the number of listeners for a given event.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| event | `string` & keyof `Events` | Event name. |

**Returns** `number`

***

#### NurDeviceDiscovery


A generic typed event emitter.

##### Example

```typescript
interface MyEvents {
  data: (value: number) => void;
  error: (err: Error) => void;
}
const ee = new TypedEventEmitter<MyEvents>();
ee.on('data', (v) => console.log(v));
```

##### Extends

- [`TypedEventEmitter`](#typedeventemitter)\<[`NurDeviceDiscoveryEvents`](#nurdevicediscoveryevents)\>

##### Accessors

###### isActive

###### Get Signature

> **get** **isActive**(): `boolean`


Whether discovery is currently active.

**Returns** `boolean`

##### Constructors

###### Constructor

> **new NurDeviceDiscovery**(): [`NurDeviceDiscovery`](#nurdevicediscovery)

**Returns** [`NurDeviceDiscovery`](#nurdevicediscovery)

##### Methods

###### on()

> **on**\<`K`\>(`event`, `listener`): `this`


Subscribe to an event.

###### Type Parameters

###### K

`K` *extends* `"error"` \| `"deviceDiscovery"`

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| event | `K` | Event name. |
| listener | [`NurDeviceDiscoveryEvents`](#nurdevicediscoveryevents)\[`K`\] | Callback invoked when the event fires. |

**Returns** `this`

###### off()

> **off**\<`K`\>(`event`, `listener`): `this`


Unsubscribe from an event.

If the listener was registered with `once()`, the original reference
can be used to remove it before it fires.

###### Type Parameters

###### K

`K` *extends* `"error"` \| `"deviceDiscovery"`

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| event | `K` | Event name. |
| listener | [`NurDeviceDiscoveryEvents`](#nurdevicediscoveryevents)\[`K`\] | The same callback reference passed to `on()` or `once()`. |

**Returns** `this`

###### once()

> **once**\<`K`\>(`event`, `listener`): `this`


Subscribe to an event for a single invocation.

The original listener reference can be passed to `off()` to cancel
before the event fires.

###### Type Parameters

###### K

`K` *extends* `"error"` \| `"deviceDiscovery"`

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| event | `K` | Event name. |
| listener | [`NurDeviceDiscoveryEvents`](#nurdevicediscoveryevents)\[`K`\] | Callback invoked once when the event fires. |

**Returns** `this`

###### emit()

> **emit**\<`K`\>(`event`, ...`args`): `void`


Emit an event, calling all subscribed listeners.

###### Type Parameters

###### K

`K` *extends* `"error"` \| `"deviceDiscovery"`

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| event | `K` | Event name. |
| args | ...`Parameters`\<[`NurDeviceDiscoveryEvents`](#nurdevicediscoveryevents)\[`K`\]\> | Arguments forwarded to each listener. |

**Returns** `void`

###### removeAllListeners()

> **removeAllListeners**(`event?`): `this`


Remove all listeners, optionally scoped to a single event.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| event? | `"error"` \| `"deviceDiscovery"` | If provided, only remove listeners for this event. |

**Returns** `this`

###### listenerCount()

> **listenerCount**(`event`): `number`


Return the number of listeners for a given event.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| event | `"error"` \| `"deviceDiscovery"` | Event name. |

**Returns** `number`

###### start()

> **start**(`options?`): `void`


Start discovering devices.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| options? | [`DiscoveryOptions`](#discoveryoptions) | Optional discovery options (scheme filter, polling interval) |

**Returns** `void`

###### stop()

> **stop**(): `void`


Stop discovering devices.

All tracked devices are emitted as disappeared.

**Returns** `void`

***

#### BootEvent


Emitted when the reader module boots or resets.

##### Properties

###### message

> **message**: `string`


Boot message string from the reader (e.g. "APP", "LOADER").

***

#### IOChangeEvent


Emitted when a GPIO pin or sensor state changes.

##### Properties

###### sensor

> **sensor**: `boolean`


True if the source is a sensor, false if GPIO.

###### source

> **source**: `number`


###### direction

> **direction**: `number`


Change direction: 1 = rising edge, 0 = falling edge.

***

#### InventoryStreamEvent


Emitted during streaming inventory operations.

##### Properties

###### stopped

> **stopped**: `boolean`


True when streaming has stopped (app must restart if desired).

###### roundsDone

> **roundsDone**: `number`


Number of full Q rounds completed.

###### collisions

> **collisions**: `number`


Number of collisions during inventory.

###### Q

> **Q**: `number`


Q parameter value used for anti-collision.

###### tagsAdded

> **tagsAdded**: `number`


Number of new tags added to storage in this notification round.

###### tags

> **tags**: [`TagEntry`](#tagentry)[]


Tags parsed from this notification's IDBUF data.

***

#### TraceTagEvent


Emitted during tag tracing operations.

##### Properties

###### rssi

> **rssi**: `number`


Tag RSSI in dBm (signed). -127 if tag not found.

###### scaledRssi

> **scaledRssi**: `number`


Tag RSSI scaled to 0–100%.

###### antennaId

> **antennaId**: `number`


Antenna ID where the tag was detected.

###### epc

> **epc**: `Uint8Array`


Tag EPC data.

***

#### TriggerReadEvent


Emitted when a GPIO/sensor-triggered tag read completes.

##### Properties

###### sensor

> **sensor**: `boolean`


True if triggered by a sensor, false if GPIO.

###### source

> **source**: `number`


Trigger source number (GPIO pin or sensor index).

###### antennaId

> **antennaId**: `number`


Antenna ID where the tag was read.

###### rssi

> **rssi**: `number`


Tag RSSI in dBm (signed). -127 if tag not found.

###### scaledRssi

> **scaledRssi**: `number`


Tag RSSI scaled to 0–100%.

###### epc

> **epc**: `Uint8Array`


Tag EPC data.

***

#### HopEvent


Emitted on frequency hop changes.

##### Properties

###### hopTableId

> **hopTableId**: `number`


Current hop table region ID.

###### freqIdx

> **freqIdx**: `number`


Index of frequency within the hop table.

###### freqKhz

> **freqKhz**: `number`


Frequency in kHz.

***

#### DebugMessageEvent


Emitted when the reader sends a debug/log message.

##### Properties

###### level

> **level**: [`DebugLevel`](#debuglevel)


Log level parsed from the `<X>` prefix.

###### message

> **message**: `string`


Message text (with CR/LF stripped).

***

#### NxpAlarmEvent


Emitted during NXP EAS alarm stream.

##### Properties

###### armed

> **armed**: `boolean`


True if an EAS alarm is active.

###### stopped

> **stopped**: `boolean`


True if the alarm stream has stopped.

***

#### EpcEnumEvent


Emitted during EPC enumeration.

##### Properties

###### epc

> **epc**: `Uint8Array`


Raw EPC data.

***

#### TuneEvent


Emitted during antenna auto-tuning.

##### Properties

###### cap1

> **cap1**: `number`


Tuning capacitor 1 value.

###### cap2

> **cap2**: `number`


Tuning capacitor 2 value.

###### reflPowerDbm

> **reflPowerDbm**: `number`


Reflected power in dBm × 1000 (signed).

###### antenna

> **antenna**: `number`


Antenna ID being tuned.

###### freqKhz

> **freqKhz**: `number`


Frequency in kHz.

***

#### DiagReportEvent


Emitted when a diagnostic report is received from the reader.

##### Properties

###### flags

> **flags**: `number`


Report flags.

###### uptimeMs

> **uptimeMs**: `number`


Module uptime in milliseconds.

###### rfActiveTimeMs

> **rfActiveTimeMs**: `number`


Total RF on-time in milliseconds.

###### temperature

> **temperature**: `number`


Temperature in Celsius. 1000 if not supported.

###### bytesIn

> **bytesIn**: `number`


Total bytes received by the module.

###### bytesOut

> **bytesOut**: `number`


Total bytes sent by the module.

###### bytesIgnored

> **bytesIgnored**: `number`


Number of ignored (invalid) bytes.

###### antennaErrors

> **antennaErrors**: `number`


Number of bad antenna errors.

###### hwErrors

> **hwErrors**: `number`


Number of automatically recovered hardware failures.

###### invTags

> **invTags**: `number`


Number of successfully inventoried tags.

###### invCollisions

> **invCollisions**: `number`


Number of inventory collisions.

###### readTags

> **readTags**: `number`


Number of successful tag read operations.

###### readErrors

> **readErrors**: `number`


Number of failed tag read operations.

###### writeTags

> **writeTags**: `number`


Number of successful tag write operations.

###### writeErrors

> **writeErrors**: `number`


Number of failed tag write operations.

###### errorConds

> **errorConds**: `number`


Number of temporary error conditions (over-temp, low voltage).

###### setupErrors

> **setupErrors**: `number`


Number of invalid setup errors.

###### invalidCmds

> **invalidCmds**: `number`


Number of invalid (unsupported) commands received.

***

#### WlanSearchEvent


Emitted during WLAN network search operations.

##### Properties

###### data

> **data**: `Uint8Array`


Raw notification data.

***

#### GeneralEvent


Emitted for general-purpose notifications (raw data).

##### Properties

###### data

> **data**: `Uint8Array`


Raw notification data.

***

#### AccBarcodeEvent


Barcode scan result from accessory device.

##### Properties

###### status

> **status**: `number`


Status of the barcode read operation (BarcodeReadStatus).

###### barcode

> **barcode**: `string`


Decoded barcode string (empty if status is not SUCCESS).

***

#### AccSensorChangedEvent


Accessory sensor added or removed.

##### Properties

###### source

> **source**: `number`


Sensor source identifier (AccSensorSource).

###### removed

> **removed**: `boolean`


True if sensor was removed, false if added.

***

#### AccSensorRangeDataEvent


Range sensor data from accessory.

##### Properties

###### source

> **source**: `number`


Sensor source identifier (AccSensorSource).

###### range

> **range**: `number`


Range reading in millimeters.

***

#### AccSensorToFFrBfaRawDataEvent


ToF FR BFA raw sensor data from accessory (16-element array).

##### Properties

###### source

> **source**: `number`


Sensor source identifier (AccSensorSource).

###### items

> **items**: [`AccSensorToFFrBfaRawDataItem`](#accsensortoffrbfarawdataitem)[]


Array of 16 ToF sensor readings.

### Diagnostics

#### DiagReport


Diagnostic report from the reader module.

Contains cumulative statistics about module uptime, RF activity,
tag operations, and error counters.

##### Properties

###### flags

> **flags**: `number`


Report flags.

###### uptimeMs

> **uptimeMs**: `number`


Module uptime in milliseconds.

###### rfActiveTimeMs

> **rfActiveTimeMs**: `number`


Total RF-on time in milliseconds.

###### temperature

> **temperature**: `number`


Module temperature in Celsius (1000 if not supported).

###### bytesIn

> **bytesIn**: `number`


Number of bytes received by module.

###### bytesOut

> **bytesOut**: `number`


Number of bytes sent by module.

###### bytesIgnored

> **bytesIgnored**: `number`


Number of ignored (invalid) bytes received.

###### antennaErrors

> **antennaErrors**: `number`


Number of bad antenna errors.

###### hwErrors

> **hwErrors**: `number`


Number of automatically recovered internal HW failures.

###### invTags

> **invTags**: `number`


Number of successfully inventoried tags.

###### invCollisions

> **invCollisions**: `number`


Number of collisions during inventory.

###### readTags

> **readTags**: `number`


Number of successful tag read commands.

###### readErrors

> **readErrors**: `number`


Number of failed tag read commands.

###### writeTags

> **writeTags**: `number`


Number of successful tag write commands.

###### writeErrors

> **writeErrors**: `number`


Number of failed tag write commands.

###### errorConds

> **errorConds**: `number`


Number of temporary error conditions (over-temp, low voltage).

###### setupErrors

> **setupErrors**: `number`


Number of invalid setup errors.

###### invalidCmds

> **invalidCmds**: `number`


Number of invalid (unsupported) commands received.

***

#### DiagConfig


Diagnostic notification configuration.

##### Properties

###### flags

> **flags**: `number`


Configuration flags.

###### interval

> **interval**: `number`


Reporting interval in seconds.

### Antenna & RF

#### TuneAntennaParams


Parameters for antenna tuning.

##### Properties

###### type?

> `optional` **type?**: `number`


Tune type: 0 = narrow, 2 = wide.

###### antenna?

> `optional` **antenna?**: `number`


Antenna index to tune.

###### band?

> `optional` **band?**: `number`


Band to tune (0xFFFFFFFF for all bands).

###### save?

> `optional` **save?**: `boolean`


Whether to save results to flash.

###### goodEnough?

> `optional` **goodEnough?**: `number`


Good-enough threshold (dBm × 1000).

***

#### TuneAntennaResult


Full antenna tune response.

##### Properties

###### antenna

> **antenna**: `number`


Antenna index that was tuned.

###### bands

> **bands**: [`TuneResult`](#tuneresult)[]


Tune results per frequency band (I, Q, dBm).

***

#### CustomHopTable


Custom frequency hopping table.

##### See

 - [NurApi.getCustomHoptable](#getcustomhoptable)
 - [NurApi.setCustomHoptable](#setcustomhoptable)

##### Properties

###### count

> **count**: `number`


Number of channels in this table.

###### chTime

> **chTime**: `number`


Channel time in milliseconds.

###### silentTime

> **silentTime**: `number`


Pause time in milliseconds between channel changes.

###### maxBLF

> **maxBLF**: `number`


Maximum link frequency (BLF).

###### tari

> **tari**: `number`


Tari value: 1 = 12.5 µs, 2 = 25 µs.

###### lbtThresh

> **lbtThresh**: `number`


LBT (Listen Before Talk) threshold. Minimum value is -90.

###### maxTxLevel

> **maxTxLevel**: `number`


Maximum TX level (0–19).

###### freqs

> **freqs**: `number`[]


Channel frequencies in kHz. Length matches [count](#count-1).

***

#### RefPowerResult


Reflected power measurement result.

Compute dBm: when `div === 0`, use `iPart / 1000.0`;
otherwise `20 * log10(sqrt(iPart² + qPart²) / div)`.

##### Properties

###### iPart

> **iPart**: `number`


I part of reflected power measurement.

###### qPart

> **qPart**: `number`


Q part of reflected power measurement.

###### div

> **div**: `number`


Divisor for power calculation.

###### freqKhz?

> `optional` **freqKhz?**: `number`


Frequency in kHz (only present in GETREFPOWEREX response).

***

#### ScanChannelInfo


Channel scan result — RSSI measurement for a single frequency channel.

##### Properties

###### frequency

> **frequency**: `number`


Channel frequency in kHz.

###### rssi

> **rssi**: `number`


Received signal strength indicator (dBm, signed).

###### rawIQ

> **rawIQ**: `number`


Raw I+Q data value.

### Utility

#### bytesToHex()

> **bytesToHex**(`bytes`): `string`


Convert a byte array to uppercase hex string.

##### Parameters

###### bytes

`Uint8Array`

**Returns** `string`

### Transport

#### NurTransportRegistry


URI-based transport registry.

Maps URI schemes (e.g., 'ws', 'ser', 'tcp', 'ble') to factory functions
that create the appropriate transport implementation.

All methods are static — there is a single global registry.

##### Example

```typescript
// Register a custom transport
NurTransportRegistry.register('custom', (uri) => new MyTransport());
// Now you can connect via custom://
await reader.connect('custom://device1');
```

##### Constructors

###### Constructor

> **new NurTransportRegistry**(): [`NurTransportRegistry`](#nurtransportregistry)

**Returns** [`NurTransportRegistry`](#nurtransportregistry)

##### Methods

###### register()

> `static` **register**(`scheme`, `factory`): `void`


Register a transport factory for a URI scheme.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| scheme | `string` | URI scheme without '://' (e.g., 'ws', 'ser', 'tcp') |
| factory | [`NurTransportFactory`](#nurtransportfactory) | Factory function that creates a transport for the scheme |

**Returns** `void`

**Throws** Error if scheme is already registered

###### remove()

> `static` **remove**(`scheme`): `boolean`


Remove a registered transport scheme.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| scheme | `string` | URI scheme to remove |

**Returns** `boolean` — true if the scheme was registered and removed, false if not found

###### has()

> `static` **has**(`scheme`): `boolean`


Check if a transport scheme is registered.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| scheme | `string` | URI scheme to check |

**Returns** `boolean`

###### create()

> `static` **create**(`uri`): [`NurTransport`](#nurtransport)


Create a transport instance for the given URI.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| uri | `string` \| `URL` | URI string or URL object (e.g., 'ws://192.168.1.100:1300') |

**Returns** [`NurTransport`](#nurtransport) — A new transport instance for the URI's scheme

**Throws** Error if the URI scheme is not registered

###### schemes()

> `static` **schemes**(): `string`[]


List all registered URI schemes.

**Returns** `string`[] — Array of registered scheme strings (e.g., ['ws', 'wss', 'ser'])

###### parseUri()

> `static` **parseUri**(`uri`): `URL`


Parse a URI string into a URL object.

Handles special cases for NUR URIs (e.g., `ser://COM3` where COM3 is the host).

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| uri | `string` \| `URL` | URI string or URL object |

**Returns** `URL` — Parsed URL object

**Throws** Error if URI is invalid

###### clear()

> `static` **clear**(): `void`


Clear all registered transports.
Primarily useful for testing.

**Returns** `void`

***

#### NurTransportFlags


Transport capability flags — bitfield matching C# NurTransportFlags.

Used by the connection layer to determine behavior during connect
(e.g., whether to send HOSTFLAGS_EN_UNSOL_ACK in the initial ping).

##### Enumeration Members

###### None

> **None**: `0`


###### PreferAck

> **PreferAck**: `1`


Transport prefers ACK on unsolicited packets (e.g., TCP socket).

***

#### NurTransport


Transport interface that all NUR transport implementations must satisfy.

The transport is responsible for:
- Establishing a connection to the reader module
- Sending binary data to the reader
- Receiving binary data and forwarding via the `onData` callback
- Detecting disconnection and forwarding via the `onDisconnect` callback

##### Example

```typescript
// Custom transport implementation
class MyTransport implements NurTransport {
  readonly type = 'custom';
  connected = false;
  onData: ((data: Uint8Array) => void) | null = null;
  onDisconnect: ((error?: Error) => void) | null = null;
  async connect(uri: URL) { ... }
  async disconnect() { ... }
  async write(data: Uint8Array) { ... }
}
```

##### Methods

###### connect()

> **connect**(`uri`): `Promise`\<`void`\>


Connect to a NUR reader module at the given URI.
The URI was already parsed and dispatched by the transport registry.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| uri | `URL` | Parsed URL with scheme, host, port, path, query params |

**Returns** `Promise`\<`void`\>

**Throws** Error if connection fails

###### disconnect()

> **disconnect**(): `Promise`\<`void`\>


Disconnect from the reader module.
Must be safe to call even if not connected.

**Returns** `Promise`\<`void`\>

###### write()

> **write**(`data`): `Promise`\<`void`\>


Send binary data to the reader module.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| data | `Uint8Array` | Raw bytes to send |

**Returns** `Promise`\<`void`\>

**Throws** Error if not connected or write fails

##### Properties

###### connected

> `readonly` **connected**: `boolean`


Whether the transport is currently connected.

###### onData

> **onData**: ((`data`) => `void`) \| `null`


Callback invoked when binary data is received from the reader.
Set by the consumer (e.g., NurApi) before calling `connect()`.

###### onDisconnect

> **onDisconnect**: ((`error?`) => `void`) \| `null`


Callback invoked when the transport disconnects unexpectedly.
Not called on explicit `disconnect()` — only on unplanned disconnection.

###### type

> `readonly` **type**: `string`


Human-readable transport type identifier (e.g., 'websocket', 'serial', 'tcp').

###### flags?

> `readonly` `optional` **flags?**: [`NurTransportFlags`](#nurtransportflags)


Transport capability flags.

When `NurTransportFlags.PreferAck` is set, the connection layer sends
`HOSTFLAGS_EN_UNSOL_ACK` during the initial ping so the module includes
ACK requests with unsolicited packets.

Defaults to `NurTransportFlags.None` when not provided.

***

#### NurTransportFactory

> **NurTransportFactory** = (`uri`) => [`NurTransport`](#nurtransport)


Factory function that creates a transport instance for a given URI.
Registered with the transport registry for a specific URI scheme.

##### Parameters

###### uri

`URL`

**Returns** [`NurTransport`](#nurtransport)

***

#### WebSocketTransport


WebSocket-based transport for NUR reader communication.

Uses the platform's native WebSocket API (browser or Node.js 22+).
Binary message mode is used for raw packet data.

##### Example

```typescript
// Auto-registered for ws:// and wss:// schemes:
await reader.connect('ws://192.168.1.100:8080');
await reader.connect('wss://secure-host/nur');
```

##### Implements

- [`NurTransport`](#nurtransport)

##### Accessors

###### connected

###### Get Signature

> **get** **connected**(): `boolean`


Whether the transport is currently connected

**Returns** `boolean` — Whether the transport is currently connected.

##### Constructors

###### Constructor

> **new WebSocketTransport**(): [`WebSocketTransport`](#websockettransport)

**Returns** [`WebSocketTransport`](#websockettransport)

##### Methods

###### connect()

> **connect**(`uri`): `Promise`\<`void`\>


Connect to a NUR reader via WebSocket.
Times out after 10 seconds if the connection cannot be established.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| uri | `URL` | WebSocket URL (ws://host:port or wss://host:port) |

**Returns** `Promise`\<`void`\>

###### disconnect()

> **disconnect**(): `Promise`\<`void`\>


Disconnect from the WebSocket.

**Returns** `Promise`\<`void`\>

###### write()

> **write**(`data`): `Promise`\<`void`\>


Send binary data to the reader via WebSocket.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| data | `Uint8Array` | Raw packet bytes to send |

**Returns** `Promise`\<`void`\>

##### Properties

###### type

> `readonly` **type**: `"websocket"` = `'websocket'`


Human-readable transport type identifier (e.g., 'websocket', 'serial', 'tcp').

###### onData

> **onData**: ((`data`) => `void`) \| `null` = `null`


Callback for received data

###### onDisconnect

> **onDisconnect**: ((`error?`) => `void`) \| `null` = `null`


Callback for unexpected disconnection

### Protocol

#### CommandDispatcher


Sends commands and correlates responses over the NUR protocol.

##### Accessors

###### started

###### Get Signature

> **get** **started**(): `boolean`


Whether the dispatcher is actively processing packets.

**Returns** `boolean`

##### Constructors

###### Constructor

> **new CommandDispatcher**(`transport`, `options?`): [`CommandDispatcher`](#commanddispatcher)


**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| transport | [`NurTransport`](#nurtransport) | Transport to send/receive packets over. |
| options? |  |  |
| defaultTimeout? | `number` |  |
| logger? | [`Logger`](#logger) |  |

**Returns** [`CommandDispatcher`](#commanddispatcher)

##### Methods

###### start()

> **start**(): `void`


Start processing incoming data from the transport.
Wires `transport.onData` to the internal PacketHandler.

**Returns** `void`

###### stop()

> **stop**(): `void`


Stop processing. Flushes any pending/queued commands with a disconnect error.

**Returns** `void`

###### execute()

> **execute**(`cmd`, `payload?`, `timeout?`): `Promise`\<[`ParsedPacket`](#parsedpacket)\>


Send a command and wait for its response.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| cmd | `number` | Command byte (e.g., NurCmd.PING) |
| payload? | `Uint8Array` = `...` | Command-specific data (default: empty) |
| timeout? | `number` | Per-command timeout in ms (default: `defaultTimeout`) |

**Returns** `Promise`\<[`ParsedPacket`](#parsedpacket)\> — Parsed response packet

**Throws** On timeout, error response, or transport failure

###### flush()

> **flush**(`error`): `void`


Reject all pending and queued commands with the given error.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| error | `Error` |  |

**Returns** `void`

##### Properties

###### onNotification

> **onNotification**: ((`packet`) => `void`) \| `null` = `null`


Callback invoked for every unsolicited (notification) packet.
Set by the NurApi class to dispatch notifications.

###### onActivity

> **onActivity**: (() => `void`) \| `null` = `null`


Callback invoked whenever a valid packet is received (command response or notification).
Used by NurApi to reset the keepalive timer on incoming traffic.

***

#### packetByte()

> **packetByte**(`buf`, `value`, `offset`): `number`


Write a uint8 value at offset. Returns new offset (offset + 1).

##### Parameters

###### buf

`Uint8Array`

###### value

`number`

###### offset

`number`

**Returns** `number`

***

#### packetWord()

> **packetWord**(`buf`, `value`, `offset`): `number`


Write a uint16 LE value at offset. Returns new offset (offset + 2).

##### Parameters

###### buf

`Uint8Array`

###### value

`number`

###### offset

`number`

**Returns** `number`

***

#### packetDword()

> **packetDword**(`buf`, `value`, `offset`): `number`


Write a uint32 LE value at offset. Returns new offset (offset + 4).

##### Parameters

###### buf

`Uint8Array`

###### value

`number`

###### offset

`number`

**Returns** `number`

***

#### packetQword()

> **packetQword**(`buf`, `value`, `offset`): `number`


Write a uint64 LE value at offset (as BigInt). Returns new offset (offset + 8).

##### Parameters

###### buf

`Uint8Array`

###### value

`bigint`

###### offset

`number`

**Returns** `number`

***

#### packetBytes()

> **packetBytes**(`buf`, `src`, `offset`): `number`


Copy source bytes into buf at offset. Returns new offset (offset + src.length).

##### Parameters

###### buf

`Uint8Array`

###### src

`Uint8Array`

###### offset

`number`

**Returns** `number`

***

#### bytesToByte()

> **bytesToByte**(`buf`, `offset`): `number`


Read a uint8 value at offset.

##### Parameters

###### buf

`Uint8Array`

###### offset

`number`

**Returns** `number`

***

#### bytesToWord()

> **bytesToWord**(`buf`, `offset`): `number`


Read a uint16 LE value at offset.

##### Parameters

###### buf

`Uint8Array`

###### offset

`number`

**Returns** `number`

***

#### bytesToSignedWord()

> **bytesToSignedWord**(`buf`, `offset`): `number`


Read an int16 LE value at offset.

##### Parameters

###### buf

`Uint8Array`

###### offset

`number`

**Returns** `number`

***

#### bytesToDword()

> **bytesToDword**(`buf`, `offset`): `number`


Read a uint32 LE value at offset.

##### Parameters

###### buf

`Uint8Array`

###### offset

`number`

**Returns** `number`

***

#### bytesToSignedDword()

> **bytesToSignedDword**(`buf`, `offset`): `number`


Read an int32 LE value at offset.

##### Parameters

###### buf

`Uint8Array`

###### offset

`number`

**Returns** `number`

***

#### bytesToQword()

> **bytesToQword**(`buf`, `offset`): `bigint`


Read a uint64 LE value at offset (returns BigInt).

##### Parameters

###### buf

`Uint8Array`

###### offset

`number`

**Returns** `bigint`

***

#### NurCmd


NUR module basic commands (0x01-0x1E).

##### Enumeration Members

###### PING

> **PING**: `1`


###### ACK

> **ACK**: `2`


###### RESET

> **RESET**: `3`


###### GETMODE

> **GETMODE**: `4`


###### CLEARIDBUF

> **CLEARIDBUF**: `5`


###### GETIDBUF

> **GETIDBUF**: `6`


###### GETMETABUF

> **GETMETABUF**: `7`


###### GETSYSTEM

> **GETSYSTEM**: `8`


###### GETREADERINFO

> **GETREADERINFO**: `9`


###### MCUARCH

> **MCUARCH**: `10`


###### DEVCAPS

> **DEVCAPS**: `11`


###### VERSIONEX

> **VERSIONEX**: `12`


###### BEEP

> **BEEP**: `13`


###### STOPALLCONT

> **STOPALLCONT**: `14`


###### CONFIGGPIO

> **CONFIGGPIO**: `15`


###### GETGPIO

> **GETGPIO**: `16`


###### SETGPIO

> **SETGPIO**: `17`


###### SENSORS

> **SENSORS**: `18`


###### FACTORYRESET

> **FACTORYRESET**: `19`


###### RESTART

> **RESTART**: `20`


###### GETETHCONFIG

> **GETETHCONFIG**: `21`


###### SETETHCONFIG

> **SETETHCONFIG**: `22`


###### TITLE\_SET

> **TITLE\_SET**: `23`


###### TITLE\_GET

> **TITLE\_GET**: `24`


###### GETFWINFO

> **GETFWINFO**: `30`


###### SETBDR

> **SETBDR**: `32`


###### ANTIDTRANSLATION

> **ANTIDTRANSLATION**: `33`


###### LOADSETUP2

> **LOADSETUP2**: `34`


###### INVREADCONFIG

> **INVREADCONFIG**: `35`


###### GETREGIONINFO

> **GETREGIONINFO**: `36`


###### ANTENNAMAP

> **ANTENNAMAP**: `37`


###### ANTPOWER

> **ANTPOWER**: `38`


###### ANTENNA

> **ANTENNA**: `39`


###### STORESETUP

> **STORESETUP**: `40`


###### CUSTOMHOP

> **CUSTOMHOP**: `41`


###### CUSTOMHOP\_EX

> **CUSTOMHOP\_EX**: `42`


###### DIAG

> **DIAG**: `43`


###### SCANSINGLE

> **SCANSINGLE**: `48`


###### INVENTORY

> **INVENTORY**: `49`


###### INVENTORYSEL

> **INVENTORYSEL**: `50`


###### READ

> **READ**: `51`


###### WRITE

> **WRITE**: `52`


###### BLWRITE

> **BLWRITE**: `53`


###### LOCK

> **LOCK**: `54`


###### KILL

> **KILL**: `55`


###### TRACETAG

> **TRACETAG**: `56`


###### INVENTORYSTREAM

> **INVENTORYSTREAM**: `57`


###### RESETTARGET

> **RESETTARGET**: `58`


###### INVENTORYEX

> **INVENTORYEX**: `59`


###### CUSTREAD

> **CUSTREAD**: `60`


###### CUSTWRITE

> **CUSTWRITE**: `61`


###### CUSTBLWRITE

> **CUSTBLWRITE**: `62`


###### CUSTOMEXCHANGE

> **CUSTOMEXCHANGE**: `63`


###### BLKERASE

> **BLKERASE**: `64`


###### INVENTORYREAD

> **INVENTORYREAD**: `65`


###### BLWRITE\_EX

> **BLWRITE\_EX**: `66`


###### EPCENUM

> **EPCENUM**: `67`


###### PERMALOCK

> **PERMALOCK**: `68`


###### TAGTRACKING\_STREAM

> **TAGTRACKING\_STREAM**: `69`


###### GEN2V2

> **GEN2V2**: `70`


###### GEN2X\_CFG

> **GEN2X\_CFG**: `71`


###### NXP\_RDPROTECT

> **NXP\_RDPROTECT**: `80`


###### NXP\_EAS

> **NXP\_EAS**: `81`


###### NXP\_EASALARM

> **NXP\_EASALARM**: `82`


###### MZ4\_QT

> **MZ4\_QT**: `83`


###### NXP\_EASALARMSTREAM

> **NXP\_EASALARMSTREAM**: `84`


###### ACC\_EXT

> **ACC\_EXT**: `85`


###### EXT

> **EXT**: `86`


###### GETREFPOWER

> **GETREFPOWER**: `96`


###### CONTCARR

> **CONTCARR**: `97`


###### CARRIER

> **CARRIER**: `98`


###### SCANCHANNELS

> **SCANCHANNELS**: `99`


###### RFSETTINGS

> **RFSETTINGS**: `100`


###### RFRESERVED1

> **RFRESERVED1**: `101`


###### TUNEANTENNA

> **TUNEANTENNA**: `102`


###### GETREFPOWEREX

> **GETREFPOWEREX**: `103`


###### GRIDANTENNA\_DEPRECATED

> **GRIDANTENNA\_DEPRECATED**: `104`


###### NOTCHFILTER

> **NOTCHFILTER**: `105`


###### SETCHANNEL

> **SETCHANNEL**: `106`


###### SIMULATE\_ERR\_RESP

> **SIMULATE\_ERR\_RESP**: `107`


###### ANTPOWEREX\_TESTING\_NOTINUSE

> **ANTPOWEREX\_TESTING\_NOTINUSE**: `108`


###### MEASURE\_RAW\_BLF

> **MEASURE\_RAW\_BLF**: `109`


###### UNLOCKALL

> **UNLOCKALL**: `112`


###### PAGEWRITE

> **PAGEWRITE**: `113`


###### PAGEREAD

> **PAGEREAD**: `114`


###### ENTERBOOT

> **ENTERBOOT**: `115`


###### APPVALIDATE

> **APPVALIDATE**: `116`


###### QUERYCRC

> **QUERYCRC**: `117`


###### PRODUCTION\_CFG

> **PRODUCTION\_CFG**: `118`


###### BLVALIDATE

> **BLVALIDATE**: `119`


###### CRYPTOBYPASS

> **CRYPTOBYPASS**: `120`


###### SCRATCHDATA

> **SCRATCHDATA**: `121`


###### READREG

> **READREG**: `144`


###### WRITEREG

> **WRITEREG**: `145`


###### MAKEPERMANENT

> **MAKEPERMANENT**: `146`


###### WRITELONG

> **WRITELONG**: `147`


###### REGDUMP

> **REGDUMP**: `148`


###### GENSETUP

> **GENSETUP**: `149`


###### READCONT

> **READCONT**: `150`


###### READALL

> **READALL**: `151`


###### NUR3\_CAL

> **NUR3\_CAL**: `152`


###### FR\_EXT

> **FR\_EXT**: `153`


###### STANDALONE\_GET\_1

> **STANDALONE\_GET\_1**: `160`


###### STANDALONE\_SET\_1

> **STANDALONE\_SET\_1**: `161`


###### STANDALONE\_GET\_2

> **STANDALONE\_GET\_2**: `162`


###### STANDALONE\_SET\_2

> **STANDALONE\_SET\_2**: `163`


###### EXTIO

> **EXTIO**: `164`


###### ETHCLOCK

> **ETHCLOCK**: `165`


###### ALLOW\_NOTIFY

> **ALLOW\_NOTIFY**: `166`


###### GET\_HCR

> **GET\_HCR**: `167`


###### GET\_BUFFEREDDATA

> **GET\_BUFFEREDDATA**: `168`


###### ACK\_BUFFEREDDATA

> **ACK\_BUFFEREDDATA**: `169`


###### NASS\_DATA

> **NASS\_DATA**: `176`


***

#### NurNotify


NUR module notification types -- unsolicited events from the reader.

##### Enumeration Members

###### BOOT

> **BOOT**: `128`


###### IOCHANGE

> **IOCHANGE**: `129`


###### INVENTORY

> **INVENTORY**: `130`


###### TT\_INVENTORY

> **TT\_INVENTORY**: `131`


###### TRACETAG

> **TRACETAG**: `132`


###### TRIGGERREAD

> **TRIGGERREAD**: `133`


###### HOPEVENT

> **HOPEVENT**: `134`


###### DEBUGMSG

> **DEBUGMSG**: `135`


###### INVENTORYEX

> **INVENTORYEX**: `136`


###### NXPALARM

> **NXPALARM**: `137`


###### EPCENUM

> **EPCENUM**: `138`


###### EXTIN

> **EXTIN**: `139`


###### GENERAL

> **GENERAL**: `140`


###### AUTOTUNE

> **AUTOTUNE**: `141`


###### WLAN\_SEARCH

> **WLAN\_SEARCH**: `142`


###### DIAG

> **DIAG**: `143`


###### ACCESSORY

> **ACCESSORY**: `144`


***

#### NurDiagSubCmd


NUR_CMD_DIAG sub commands.

##### Enumeration Members

###### GETREPORT

> **GETREPORT**: `1`


###### CFG

> **CFG**: `2`


***

#### NurError


NUR API error codes.

##### Enumeration Members

###### SUCCESS

> **SUCCESS**: `0`


###### NO\_ERROR

> **NO\_ERROR**: `0`


###### INVALID\_COMMAND

> **INVALID\_COMMAND**: `1`


###### INVALID\_LENGTH

> **INVALID\_LENGTH**: `2`


###### PARAMETER\_OUT\_OF\_RANGE

> **PARAMETER\_OUT\_OF\_RANGE**: `3`


###### RECEIVE\_TIMEOUT

> **RECEIVE\_TIMEOUT**: `4`


###### INVALID\_PARAMETER

> **INVALID\_PARAMETER**: `5`


###### PROGRAM\_FAILED

> **PROGRAM\_FAILED**: `6`


###### PARAMETER\_MISMATCH

> **PARAMETER\_MISMATCH**: `7`


###### HW\_MISMATCH

> **HW\_MISMATCH**: `8`


###### RESERVED1

> **RESERVED1**: `9`


###### PAGE\_PROGRAM

> **PAGE\_PROGRAM**: `10`


###### CRC\_CHECK

> **CRC\_CHECK**: `11`


###### CRC\_MISMATCH

> **CRC\_MISMATCH**: `12`


###### NOT\_READY

> **NOT\_READY**: `13`


###### APP\_NOT\_PRESENT

> **APP\_NOT\_PRESENT**: `14`


###### GENERAL

> **GENERAL**: `16`


###### RESEND\_PACKET

> **RESEND\_PACKET**: `17`


###### NO\_TAG

> **NO\_TAG**: `32`


###### RESP\_AIR

> **RESP\_AIR**: `33`


###### G2\_SELECT

> **G2\_SELECT**: `34`


###### MISSING\_SELDATA

> **MISSING\_SELDATA**: `35`


###### G2\_ACCESS

> **G2\_ACCESS**: `36`


###### G2\_READ

> **G2\_READ**: `48`


###### G2\_RD\_PART

> **G2\_RD\_PART**: `49`


###### G2\_WRITE

> **G2\_WRITE**: `64`


###### G2\_WR\_PART

> **G2\_WR\_PART**: `65`


###### G2\_TAG\_RESP

> **G2\_TAG\_RESP**: `66`


###### G2\_SPECIAL

> **G2\_SPECIAL**: `80`


###### READER\_HW

> **READER\_HW**: `96`


###### BAD\_ANTENNA

> **BAD\_ANTENNA**: `97`


###### LOW\_VOLTAGE

> **LOW\_VOLTAGE**: `98`


###### OVER\_TEMP

> **OVER\_TEMP**: `99`


###### INVALID\_HANDLE

> **INVALID\_HANDLE**: `4096`


###### TRANSPORT

> **TRANSPORT**: `4097`


###### TR\_NOT\_CONNECTED

> **TR\_NOT\_CONNECTED**: `4098`


###### TR\_TIMEOUT

> **TR\_TIMEOUT**: `4099`


###### BUFFER\_TOO\_SMALL

> **BUFFER\_TOO\_SMALL**: `4100`


###### NOT\_SUPPORTED

> **NOT\_SUPPORTED**: `4101`


###### NO\_PAYLOAD

> **NO\_PAYLOAD**: `4102`


###### INVALID\_PACKET

> **INVALID\_PACKET**: `4103`


###### PACKET\_TOO\_LONG

> **PACKET\_TOO\_LONG**: `4104`


###### PACKET\_CS\_ERROR

> **PACKET\_CS\_ERROR**: `4105`


###### NOT\_WORD\_BOUNDARY

> **NOT\_WORD\_BOUNDARY**: `4106`


###### FILE\_NOT\_FOUND

> **FILE\_NOT\_FOUND**: `4107`


###### FILE\_INVALID

> **FILE\_INVALID**: `4108`


###### MCU\_ARCH

> **MCU\_ARCH**: `4109`


###### G2\_TAG\_MEM\_OVERRUN

> **G2\_TAG\_MEM\_OVERRUN**: `4110`


###### G2\_TAG\_MEM\_LOCKED

> **G2\_TAG\_MEM\_LOCKED**: `4111`


###### G2\_TAG\_INSUF\_POWER

> **G2\_TAG\_INSUF\_POWER**: `4112`


###### G2\_TAG\_NON\_SPECIFIC

> **G2\_TAG\_NON\_SPECIFIC**: `4113`


###### G2\_TAG\_OTHER\_ERROR

> **G2\_TAG\_OTHER\_ERROR**: `4117`


###### G2\_TAG\_NOT\_SUPPORTED

> **G2\_TAG\_NOT\_SUPPORTED**: `4118`


###### G2\_TAG\_INSUF\_PRIVILEDGE

> **G2\_TAG\_INSUF\_PRIVILEDGE**: `4119`


###### G2\_TAG\_CRYPTO\_SUITE

> **G2\_TAG\_CRYPTO\_SUITE**: `4120`


###### G2\_TAG\_NOT\_ENCAPSULATED

> **G2\_TAG\_NOT\_ENCAPSULATED**: `4121`


###### G2\_TAG\_RESPBUFFER\_OVF

> **G2\_TAG\_RESPBUFFER\_OVF**: `4122`


###### G2\_TAG\_SEC\_TIMEOUT

> **G2\_TAG\_SEC\_TIMEOUT**: `4123`


###### TR\_SUSPENDED

> **TR\_SUSPENDED**: `4114`


###### SERVER

> **SERVER**: `4115`


***

#### translateTagError()

> **translateTagError**(`tagErrorByte`): [`NurError`](#nurerror)


Translate a raw Gen2 tag error byte into a specific NurError code.

##### Parameters

###### tagErrorByte

`number`

Raw error byte from the tag response (0x00-0xFF)

**Returns** [`NurError`](#nurerror) — Specific NurError code for the tag error

***

#### getErrorMessage()

> **getErrorMessage**(`code`): `string`


Get a human-readable error message for a NUR error code.

##### Parameters

###### code

`number`

**Returns** `string`

***

#### NurApiError


Custom error class for NUR API errors.

##### Example

```typescript
try {
  await reader.inventory();
} catch (e) {
  if (e instanceof NurApiError) {
    console.log(`NUR error ${e.code}: ${e.message}`);
  }
}
```

##### Extends

- `Error`

##### Constructors

###### Constructor

> **new NurApiError**(`code`, `message?`, `payload?`): [`NurApiError`](#nurapierror)


**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| code | [`NurError`](#nurerror) | NUR error code from the protocol response. |
| message? | `string` | Optional human-readable message (defaults to code lookup). |
| payload? | `Uint8Array`\<`ArrayBufferLike`\> | Optional raw response payload. |

**Returns** [`NurApiError`](#nurapierror)

##### Methods

###### captureStackTrace()

> `static` **captureStackTrace**(`targetObject`, `constructorOpt?`): `void`


Creates a `.stack` property on `targetObject`, which when accessed returns
a string representing the location in the code at which
`Error.captureStackTrace()` was called.

```js
const myObject = {};
Error.captureStackTrace(myObject);
myObject.stack;  // Similar to `new Error().stack`
```

The first line of the trace will be prefixed with
`${myObject.name}: ${myObject.message}`.

The optional `constructorOpt` argument accepts a function. If given, all frames
above `constructorOpt`, including `constructorOpt`, will be omitted from the
generated stack trace.

The `constructorOpt` argument is useful for hiding implementation
details of error generation from the user. For instance:

```js
function a() {
  b();
}

function b() {
  c();
}

function c() {
  // Create an error without stack trace to avoid calculating the stack trace twice.
  const { stackTraceLimit } = Error;
  Error.stackTraceLimit = 0;
  const error = new Error();
  Error.stackTraceLimit = stackTraceLimit;

  // Capture the stack trace above function b
  Error.captureStackTrace(error, b); // Neither function c, nor b is included in the stack trace
  throw error;
}

a();
```

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| targetObject | `object` |  |
| constructorOpt? | `Function` |  |

**Returns** `void`

###### prepareStackTrace()

> `static` **prepareStackTrace**(`err`, `stackTraces`): `any`


**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| err | `Error` |  |
| stackTraces | `CallSite`[] |  |

**Returns** `any`

###### See

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

##### Properties

###### payload?

> `readonly` `optional` **payload?**: `Uint8Array`\<`ArrayBufferLike`\>


The raw response packet from the reader, if available.

Some commands (e.g., LOADSETUP2) return valid data even on error.
The .NET API treats `INVALID_PARAMETER` as partial success for
module setup — the payload contains data for supported flags.

###### code

> `readonly` **code**: [`NurError`](#nurerror)


NUR error code from the protocol response.

###### stackTraceLimit

> `static` **stackTraceLimit**: `number`


The `Error.stackTraceLimit` property specifies the number of stack frames
collected by a stack trace (whether generated by `new Error().stack` or
`Error.captureStackTrace(obj)`).

The default value is `10` but may be set to any valid JavaScript number. Changes
will affect any stack trace captured _after_ the value has been changed.

If set to a non-number value, or set to a negative number, stack traces will
not capture any frames.

###### name

> **name**: `string`


###### message

> **message**: `string`


###### stack?

> `optional` **stack?**: `string`


***

#### ParsedPacket


A fully parsed and validated NUR protocol packet.

##### Properties

###### command

> **command**: `number`


Echo of the command byte

###### status

> **status**: `number`


Status/error code from the module (0 = success)

###### flags

> **flags**: `number`


Raw packet flags

###### isUnsolicited

> **isUnsolicited**: `boolean`


True if this is an unsolicited notification

###### payload

> **payload**: `Uint8Array`


Response data (after cmd and status, excluding CRC)

***

#### NurHeader


NUR packet header -- 6 bytes on the wire.

##### Properties

###### start

> **start**: `number`


###### payloadLen

> **payloadLen**: `number`


###### flags

> **flags**: `number`


###### checksum

> **checksum**: `number`


***

#### NurTagEntry


Tag data returned from inventory or tag reads.

##### Properties

###### rssi

> **rssi**: `number`


###### scaledRssi

> **scaledRssi**: `number`


###### timestamp

> **timestamp**: `number`


###### freq

> **freq**: `number`


###### dataLen

> **dataLen**: `number`


###### pc

> **pc**: `number`


###### channel

> **channel**: `number`


###### antennaId

> **antennaId**: `number`


###### epcLen

> **epcLen**: `number`


###### epcData

> **epcData**: `Uint8Array`


###### xpcW1?

> `optional` **xpcW1?**: `number`


###### xpcW2?

> `optional` **xpcW2?**: `number`


***

#### InventoryParams


##### Properties

###### Q

> **Q**: `number`


###### session

> **session**: `number`


###### rounds

> **rounds**: `number`


***

#### ScanSingleParams


##### Properties

###### timeout

> **timeout**: `number`


***

#### SingulationBlock


##### Properties

###### bytesToFollow

> **bytesToFollow**: `number`


###### bank

> **bank**: `number`


###### address32

> **address32**: `number`


###### address64?

> `optional` **address64?**: `bigint`


###### maskBitLen

> **maskBitLen**: `number`


###### maskData

> **maskData**: `Uint8Array`


***

#### ReadBlock


##### Properties

###### bytesToFollow

> **bytesToFollow**: `number`


###### bank

> **bank**: `number`


###### address32

> **address32**: `number`


###### address64?

> `optional` **address64?**: `bigint`


###### wordCount

> **wordCount**: `number`


***

#### WriteBlock


##### Properties

###### bytesToFollow

> **bytesToFollow**: `number`


###### bank

> **bank**: `number`


###### address32

> **address32**: `number`


###### address64?

> `optional` **address64?**: `bigint`


###### wordCount

> **wordCount**: `number`


###### data

> **data**: `Uint8Array`


***

#### ReadParams


##### Properties

###### flags

> **flags**: `number`


###### passwd

> **passwd**: `number`


###### sb

> **sb**: [`SingulationBlock`](#singulationblock)


###### rb

> **rb**: [`ReadBlock`](#readblock)


***

#### WriteParams


##### Properties

###### flags

> **flags**: `number`


###### passwd

> **passwd**: `number`


###### sb

> **sb**: [`SingulationBlock`](#singulationblock)


###### wb

> **wb**: [`WriteBlock`](#writeblock)


***

#### LockBlock


##### Properties

###### bytesToFollow

> **bytesToFollow**: `number`


###### mask

> **mask**: `number`


###### action

> **action**: `number`


***

#### LockParams


##### Properties

###### flags

> **flags**: `number`


###### passwd

> **passwd**: `number`


###### sb

> **sb**: [`SingulationBlock`](#singulationblock)


###### lb

> **lb**: [`LockBlock`](#lockblock)


***

#### KillParams


##### Properties

###### flags

> **flags**: `number`


###### passwd

> **passwd**: `number`


###### sb

> **sb**: [`SingulationBlock`](#singulationblock)


***

#### BeepParams


##### Properties

###### freq

> **freq**: `number`


###### time

> **time**: `number`


###### duty

> **duty**: `number`


***

#### ResetTargetParams


##### Properties

###### session

> **session**: `number`


###### targetIsA

> **targetIsA**: `number`


***

#### RssiFilter


##### Properties

###### min

> **min**: `number`


###### max

> **max**: `number`


***

#### AutotuneSetup


##### Properties

###### mode

> **mode**: `number`


###### thresholdDbm

> **thresholdDbm**: `number`


***

#### ModuleSetupParams


##### Properties

###### flags

> **flags**: `number`


###### linkFreq

> **linkFreq**: `number`


###### rxDecoding

> **rxDecoding**: `number`


###### txLevel

> **txLevel**: `number`


###### txModulation

> **txModulation**: `number`


###### regionId

> **regionId**: `number`


###### inventoryQ

> **inventoryQ**: `number`


###### inventorySession

> **inventorySession**: `number`


###### inventoryRounds

> **inventoryRounds**: `number`


###### scanSingleTriggerTimeout

> **scanSingleTriggerTimeout**: `number`


###### inventoryTriggerTimeout

> **inventoryTriggerTimeout**: `number`


###### selectedAntenna

> **selectedAntenna**: `number`


###### opFlags

> **opFlags**: `number`


###### inventoryTarget

> **inventoryTarget**: `number`


###### inventoryEpcLength

> **inventoryEpcLength**: `number`


###### readRssiFilter

> **readRssiFilter**: [`RssiFilter`](#rssifilter)


###### writeRssiFilter

> **writeRssiFilter**: [`RssiFilter`](#rssifilter)


###### inventoryRssiFilter

> **inventoryRssiFilter**: [`RssiFilter`](#rssifilter)


###### readTO

> **readTO**: `number`


###### writeTO

> **writeTO**: `number`


###### lockTO

> **lockTO**: `number`


###### killTO

> **killTO**: `number`


###### periodSetup

> **periodSetup**: `number`


###### antennaMaskEx

> **antennaMaskEx**: `number`


###### autotune

> **autotune**: [`AutotuneSetup`](#autotunesetup)


###### antPowerEx

> **antPowerEx**: `number`[]


###### rxSensitivity

> **rxSensitivity**: `number`


###### rfProfile

> **rfProfile**: `number`


###### toSleepTime

> **toSleepTime**: `number`


***

#### GpioSetup


##### Properties

###### enabled

> **enabled**: `number`


###### type

> **type**: `number`


###### edge

> **edge**: `number`


###### action

> **action**: `number`


***

#### ConfigGpioParams


##### Properties

###### flags

> **flags**: `number`


###### config

> **config**: [`GpioSetup`](#gpiosetup)[]


***

#### IrConfigParams


##### Properties

###### active

> **active**: `number`


###### type

> **type**: `number`


###### bank

> **bank**: `number`


###### wAddress

> **wAddress**: `number`


###### wLength

> **wLength**: `number`


***

#### CustomHopParamsEx


##### Properties

###### count

> **count**: `number`


###### chTime

> **chTime**: `number`


###### silentTime

> **silentTime**: `number`


###### maxBLF

> **maxBLF**: `number`


###### tari

> **tari**: `number`


###### lbtThresh

> **lbtThresh**: `number`


###### maxTxLevel

> **maxTxLevel**: `number`


###### freqs

> **freqs**: `number`[]


***

#### EthDevParams


##### Properties

###### titleLength

> **titleLength**: `number`


###### title

> **title**: `string`


###### mask

> **mask**: `Uint8Array`


###### gw

> **gw**: `Uint8Array`


###### addrType

> **addrType**: `number`


###### staticIp

> **staticIp**: `Uint8Array`


###### serverPort

> **serverPort**: `number`


###### hostMode

> **hostMode**: `number`


###### hostIp

> **hostIp**: `Uint8Array`


###### hostPort

> **hostPort**: `number`


###### reserved

> **reserved**: `Uint8Array`


***

#### DiagCfgParams


##### Properties

###### flags

> **flags**: `number`


###### interval

> **interval**: `number`


***

#### PermalockBlock


##### Properties

###### lock

> **lock**: `number`


###### bank

> **bank**: `number`


###### addr

> **addr**: `number`


###### range

> **range**: `number`


###### wMask

> **wMask**: `number`[]


***

#### PermalockParams


##### Properties

###### flags

> **flags**: `number`


###### passwd

> **passwd**: `number`


###### sb

> **sb**: [`SingulationBlock`](#singulationblock)


###### plb

> **plb**: [`PermalockBlock`](#permalockblock)


***

#### EpcEnumParams


##### Properties

###### ant

> **ant**: `number`


###### twAddr

> **twAddr**: `number`


###### twLen

> **twLen**: `number`


###### useBlWrite

> **useBlWrite**: `number`


###### startVal

> **startVal**: `Uint8Array`


###### epcLen

> **epcLen**: `number`


###### modAddr

> **modAddr**: `number`


###### bitLen

> **bitLen**: `number`


###### bReset

> **bReset**: `number`


###### baseEpc

> **baseEpc**: `Uint8Array`


***

#### AntennaMapping


##### Properties

###### antennaId

> **antennaId**: `number`


###### name

> **name**: `string`


***

#### Gen2XConfig


##### Properties

###### flags

> **flags**: `number`


###### inventoryMode

> **inventoryMode**: `number`


###### scanCodeType

> **scanCodeType**: `number`


###### scanCRType

> **scanCRType**: `number`


###### scanProtectionType

> **scanProtectionType**: `number`


###### scanIdType

> **scanIdType**: `number`


###### scanCrypto

> **scanCrypto**: `number`


###### scanIdAppSize

> **scanIdAppSize**: `number`


###### scanIdAppId

> **scanIdAppId**: `number`


###### protectedModePin

> **protectedModePin**: `number`


***

#### PingResponse


##### Properties

###### status

> **status**: `string`


***

#### VersionResponse


##### Properties

###### mode

> **mode**: `number`


###### vMajor

> **vMajor**: `number`


###### vMinor

> **vMinor**: `number`


###### vBuild

> **vBuild**: `number`


###### otherMajor

> **otherMajor**: `number`


###### otherMinor

> **otherMinor**: `number`


###### otherBuild

> **otherBuild**: `number`


***

#### GetModeResponse


##### Properties

###### type

> **type**: `string`


***

#### ScanSingleResponse


##### Properties

###### antennaId

> **antennaId**: `number`


###### rssi

> **rssi**: `number`


###### scaledRssi

> **scaledRssi**: `number`


###### epcData

> **epcData**: `Uint8Array`


###### epcLen

> **epcLen**: `number`


***

#### InventoryResponse


##### Properties

###### numTagsFound

> **numTagsFound**: `number`


###### numTagsMem

> **numTagsMem**: `number`


###### roundsDone

> **roundsDone**: `number`


###### collisions

> **collisions**: `number`


###### Q

> **Q**: `number`


***

#### TraceTagResponse


##### Properties

###### rssi

> **rssi**: `number`


###### scaledRssi

> **scaledRssi**: `number`


###### antennaId

> **antennaId**: `number`


###### epcData

> **epcData**: `Uint8Array`


###### epcLen

> **epcLen**: `number`


***

#### ReaderInfoResponse


##### Properties

###### version

> **version**: `number`


###### serialLen

> **serialLen**: `number`


###### serial

> **serial**: `string`


###### altSerialLen

> **altSerialLen**: `number`


###### altSerial

> **altSerial**: `string`


###### nameLen

> **nameLen**: `number`


###### name

> **name**: `string`


###### fccIdLen

> **fccIdLen**: `number`


###### fccId

> **fccId**: `string`


###### hwVersionLen

> **hwVersionLen**: `number`


###### hwVersion

> **hwVersion**: `string`


###### swVersion

> **swVersion**: \[`number`, `number`, `number`\]


###### numGpio

> **numGpio**: `number`


###### numSensors

> **numSensors**: `number`


###### numRegions

> **numRegions**: `number`


###### numAntennas

> **numAntennas**: `number`


###### maxAntennas

> **maxAntennas**: `number`


***

#### DevCapsResponse


##### Properties

###### dwSize

> **dwSize**: `number`


###### flagSet1

> **flagSet1**: `number`


###### flagSet2

> **flagSet2**: `number`


###### maxTxdBm

> **maxTxdBm**: `number`


###### txAttnStep

> **txAttnStep**: `number`


###### maxTxmW

> **maxTxmW**: `number`


###### txSteps

> **txSteps**: `number`


###### szTagBuffer

> **szTagBuffer**: `number`


###### curCfgMaxAnt

> **curCfgMaxAnt**: `number`


###### curCfgMaxGPIO

> **curCfgMaxGPIO**: `number`


###### chipVersion

> **chipVersion**: `number`


###### moduleType

> **moduleType**: `number`


###### moduleConfigFlags

> **moduleConfigFlags**: `number`


###### ver2Level

> **ver2Level**: `number`


###### secChipMajorVersion

> **secChipMajorVersion**: `number`


###### secChipMinorVersion

> **secChipMinorVersion**: `number`


###### secChipMaintenanceVersion

> **secChipMaintenanceVersion**: `number`


###### secChipReleaseVersion

> **secChipReleaseVersion**: `number`


***

#### RegionInfoResponse


##### Properties

###### regionId

> **regionId**: `number`


###### baseFreq

> **baseFreq**: `number`


###### channelSpacing

> **channelSpacing**: `number`


###### channelCount

> **channelCount**: `number`


###### channelTime

> **channelTime**: `number`


###### nameLen

> **nameLen**: `number`


###### name

> **name**: `string`


***

#### RefPowerResponse


##### Properties

###### iPart

> **iPart**: `number`


###### qPart

> **qPart**: `number`


###### div

> **div**: `number`


***

#### RefPowerExResponse


##### Properties

###### iPart

> **iPart**: `number`


###### qPart

> **qPart**: `number`


###### div

> **div**: `number`


###### freqKhz

> **freqKhz**: `number`


***

#### TuneResult


##### Properties

###### I

> **I**: `number`


###### Q

> **Q**: `number`


###### dBm

> **dBm**: `number`


***

#### TuneAntennaResponse


##### Properties

###### antenna

> **antenna**: `number`


###### reserved

> **reserved**: \[`number`, `number`, `number`\]


###### bands

> **bands**: [`TuneResult`](#tuneresult)[]


***

#### BaudrateResponse


##### Properties

###### setting

> **setting**: `number`


***

#### Mz4Response


##### Properties

###### qtParam

> **qtParam**: `number`


***

#### EthDevConfigResponse


##### Properties

###### titleLen

> **titleLen**: `number`


###### title

> **title**: `string`


###### version

> **version**: `number`


###### ip

> **ip**: `Uint8Array`


###### mask

> **mask**: `Uint8Array`


###### gw

> **gw**: `Uint8Array`


###### addrType

> **addrType**: `number`


###### staticIp

> **staticIp**: `Uint8Array`


###### mac

> **mac**: `Uint8Array`


###### serverPort

> **serverPort**: `number`


###### hostMode

> **hostMode**: `number`


###### hostIp

> **hostIp**: `Uint8Array`


###### hostPort

> **hostPort**: `number`


###### reserved

> **reserved**: `Uint8Array`


***

#### IoChangeData


##### Properties

###### source

> **source**: `number`


###### dir

> **dir**: `number`


***

#### TriggerReadData


##### Properties

###### source

> **source**: `number`


###### antennaId

> **antennaId**: `number`


###### rssi

> **rssi**: `number`


###### scaledRssi

> **scaledRssi**: `number`


###### epcData

> **epcData**: `Uint8Array`


***

#### HopEventData


##### Properties

###### hopTableId

> **hopTableId**: `number`


###### freqIdx

> **freqIdx**: `number`


###### freqKhz

> **freqKhz**: `number`


***

#### TuneEventData


##### Properties

###### cap1

> **cap1**: `number`


###### cap2

> **cap2**: `number`


###### reflPowerDbm

> **reflPowerDbm**: `number`


###### antenna

> **antenna**: `number`


###### freqKhz

> **freqKhz**: `number`


***

#### NxpAlarmData


##### Properties

###### armed

> **armed**: `boolean`


###### stopped

> **stopped**: `boolean`


***

#### NurBank


##### Enumeration Members

###### PASSWD

> **PASSWD**: `0`


###### EPC

> **EPC**: `1`


###### TID

> **TID**: `2`


###### USER

> **USER**: `3`


***

#### NurLockAction


##### Enumeration Members

###### OPEN

> **OPEN**: `0`


###### PERMAWRITE

> **PERMAWRITE**: `1`


###### SECURED

> **SECURED**: `2`


###### PERMALOCK

> **PERMALOCK**: `3`


***

#### NurLockMem


##### Enumeration Members

###### USERMEM

> **USERMEM**: `1`


###### TIDMEM

> **TIDMEM**: `2`


###### EPCMEM

> **EPCMEM**: `4`


###### ACCESSPWD

> **ACCESSPWD**: `8`


###### KILLPWD

> **KILLPWD**: `16`


***

#### NurBaudrate


##### Enumeration Members

###### BR\_115200

> **BR\_115200**: `0`


###### BR\_230400

> **BR\_230400**: `1`


###### BR\_500000

> **BR\_500000**: `2`


###### BR\_1000000

> **BR\_1000000**: `3`


###### BR\_1500000

> **BR\_1500000**: `4`


###### BR\_38400

> **BR\_38400**: `5`


###### BR\_9600

> **BR\_9600**: `6`


***

#### NurRegionId


##### Enumeration Members

###### EU

> **EU**: `0`


###### FCC

> **FCC**: `1`


###### PRC

> **PRC**: `2`


###### MALAYSIA

> **MALAYSIA**: `3`


###### BRAZIL

> **BRAZIL**: `4`


###### AUSTRALIA

> **AUSTRALIA**: `5`


###### NEWZEALAND

> **NEWZEALAND**: `6`


###### JA250MW

> **JA250MW**: `7`


###### JA500MW

> **JA500MW**: `8`


###### KOREA\_LBT

> **KOREA\_LBT**: `9`


###### INDIA

> **INDIA**: `10`


###### RUSSIA

> **RUSSIA**: `11`


###### VIETNAM

> **VIETNAM**: `12`


###### SINGAPORE

> **SINGAPORE**: `13`


###### THAILAND

> **THAILAND**: `14`


###### PHILIPPINES

> **PHILIPPINES**: `15`


###### MOROCCO

> **MOROCCO**: `16`


###### PERU

> **PERU**: `17`


###### ISRAEL

> **ISRAEL**: `18`


###### HONGKONG

> **HONGKONG**: `19`


###### CUSTOM

> **CUSTOM**: `254`


***

#### NurRxDecoding


##### Enumeration Members

###### FM0

> **FM0**: `0`


###### M2

> **M2**: `1`


###### M4

> **M4**: `2`


###### M8

> **M8**: `3`


***

#### NurTxModulation


##### Enumeration Members

###### ASK

> **ASK**: `0`


###### PRASK

> **PRASK**: `1`


***

#### NurAntennaId


##### Enumeration Members

###### AUTOSELECT

> **AUTOSELECT**: `-1`


###### ANT1

> **ANT1**: `0`


###### ANT2

> **ANT2**: `1`


###### ANT3

> **ANT3**: `2`


###### ANT4

> **ANT4**: `3`


***

#### NurGpioAction


##### Enumeration Members

###### NONE

> **NONE**: `0`


###### NOTIFY

> **NOTIFY**: `1`


###### SCANTAG

> **SCANTAG**: `2`


###### INVENTORY

> **INVENTORY**: `3`


***

#### NurGpioEdge


##### Enumeration Members

###### FALLING

> **FALLING**: `0`


###### RISING

> **RISING**: `1`


###### BOTH

> **BOTH**: `2`


***

#### NurGpioType


##### Enumeration Members

###### OUTPUT

> **OUTPUT**: `0`


###### INPUT

> **INPUT**: `1`


###### RFIDON

> **RFIDON**: `2`


###### RFIDREAD

> **RFIDREAD**: `3`


###### BEEPER

> **BEEPER**: `4`


###### ANTCTL1

> **ANTCTL1**: `5`


###### ANTCTL2

> **ANTCTL2**: `6`


###### DCE\_RTS

> **DCE\_RTS**: `7`


###### EXT\_RX

> **EXT\_RX**: `8`


***

#### NurInventoryTarget


##### Enumeration Members

###### A

> **A**: `0`


###### B

> **B**: `1`


###### AB

> **AB**: `2`


***

#### NurInventorySelState


##### Enumeration Members

###### ALL

> **ALL**: `0`


###### NOTSL

> **NOTSL**: `2`


###### SL

> **SL**: `3`


***

#### NurInventorySession


##### Enumeration Members

###### S0

> **S0**: `0`


###### S1

> **S1**: `1`


###### S2

> **S2**: `2`


###### S3

> **S3**: `3`


###### SL

> **SL**: `4`


***

#### NurFilterAction


##### Enumeration Members

###### FACTION\_0

> **FACTION\_0**: `0`


###### FACTION\_1

> **FACTION\_1**: `1`


###### FACTION\_2

> **FACTION\_2**: `2`


###### FACTION\_3

> **FACTION\_3**: `3`


###### FACTION\_4

> **FACTION\_4**: `4`


###### FACTION\_5

> **FACTION\_5**: `5`


###### FACTION\_6

> **FACTION\_6**: `6`


###### FACTION\_7

> **FACTION\_7**: `7`


***

#### NurRfProfile


##### Enumeration Members

###### ROBUST

> **ROBUST**: `0`


###### NOMINAL

> **NOMINAL**: `1`


###### HIGHSPEED

> **HIGHSPEED**: `2`


###### HIGHSPEED\_2

> **HIGHSPEED\_2**: `3`


###### FAST

> **FAST**: `4`


###### AUTOSET

> **AUTOSET**: `5`


***

#### NurModuleSetupFlags


##### Enumeration Members

###### LINKFREQ

> **LINKFREQ**: `1`


###### RXDEC

> **RXDEC**: `2`


###### TXLEVEL

> **TXLEVEL**: `4`


###### TXMOD

> **TXMOD**: `8`


###### REGION

> **REGION**: `16`


###### INVQ

> **INVQ**: `32`


###### INVSESSION

> **INVSESSION**: `64`


###### INVROUNDS

> **INVROUNDS**: `128`


###### ANTMASK

> **ANTMASK**: `256`


###### SCANSINGLETO

> **SCANSINGLETO**: `512`


###### INVENTORYTO

> **INVENTORYTO**: `1024`


###### SELECTEDANT

> **SELECTEDANT**: `2048`


###### OPFLAGS

> **OPFLAGS**: `4096`


###### INVTARGET

> **INVTARGET**: `8192`


###### INVEPCLEN

> **INVEPCLEN**: `16384`


###### READRSSIFILTER

> **READRSSIFILTER**: `32768`


###### WRITERSSIFILTER

> **WRITERSSIFILTER**: `65536`


###### INVRSSIFILTER

> **INVRSSIFILTER**: `131072`


###### READTIMEOUT

> **READTIMEOUT**: `262144`


###### WRITETIMEOUT

> **WRITETIMEOUT**: `524288`


###### LOCKTIMEOUT

> **LOCKTIMEOUT**: `1048576`


###### KILLTIMEOUT

> **KILLTIMEOUT**: `2097152`


###### AUTOPERIOD

> **AUTOPERIOD**: `4194304`


###### PERANTPOWER

> **PERANTPOWER**: `8388608`


###### PERANTOFFSET

> **PERANTOFFSET**: `16777216`


###### ANTMASKEX

> **ANTMASKEX**: `33554432`


###### AUTOTUNE

> **AUTOTUNE**: `67108864`


###### PERANTPOWER\_EX

> **PERANTPOWER\_EX**: `134217728`


###### RXSENS

> **RXSENS**: `268435456`


###### RFPROFILE

> **RFPROFILE**: `536870912`


###### TO\_SLEEP\_TIME

> **TO\_SLEEP\_TIME**: `1073741824`


###### ALL

> **ALL**: `2147483647`


***

#### NurOpFlags


##### Enumeration Members

###### EN\_HOPEVENTS

> **EN\_HOPEVENTS**: `1`


###### INVSTREAM\_ZEROS

> **INVSTREAM\_ZEROS**: `2`


###### INVENTORY\_TID

> **INVENTORY\_TID**: `4`


###### INVENTORY\_READ

> **INVENTORY\_READ**: `8`


###### SCANSINGLE\_KBD

> **SCANSINGLE\_KBD**: `16`


###### STANDALONE\_APP1

> **STANDALONE\_APP1**: `32`


###### STANDALONE\_APP2

> **STANDALONE\_APP2**: `64`


###### EXTIN\_EVENTS

> **EXTIN\_EVENTS**: `128`


###### STATE\_EXTOUT\_0

> **STATE\_EXTOUT\_0**: `256`


###### STATE\_EXTOUT\_1

> **STATE\_EXTOUT\_1**: `512`


###### STATE\_EXTOUT\_2

> **STATE\_EXTOUT\_2**: `1024`


###### STATE\_EXTOUT\_3

> **STATE\_EXTOUT\_3**: `2048`


###### EN\_TUNEEVENTS

> **EN\_TUNEEVENTS**: `4096`


###### EN\_EXACT\_BLF

> **EN\_EXACT\_BLF**: `8192`


###### EN\_TAG\_PHASE

> **EN\_TAG\_PHASE**: `16384`


###### EN\_NXP\_BID

> **EN\_NXP\_BID**: `32768`


###### EN\_IR\_MEM\_OVERRUN

> **EN\_IR\_MEM\_OVERRUN**: `65536`


###### EN\_PHASE\_DIFF

> **EN\_PHASE\_DIFF**: `131072`


***

#### NurTraceTagFlags


##### Enumeration Members

###### NO\_EPC

> **NO\_EPC**: `1`


###### START\_CONTINUOUS

> **START\_CONTINUOUS**: `2`


###### STOP\_CONTINUOUS

> **STOP\_CONTINUOUS**: `8`


***

#### NurChipVersion


##### Enumeration Members

###### AS3992

> **AS3992**: `1`


###### AS3993

> **AS3993**: `2`


###### R2000

> **R2000**: `3`


###### R2000D

> **R2000D**: `4`


###### E310

> **E310**: `5`


###### E510

> **E510**: `6`


###### E710

> **E710**: `7`


###### E910

> **E910**: `8`


***

#### NurModuleType


##### Enumeration Members

###### NUR05W

> **NUR05W**: `1`


###### NUR05WL

> **NUR05WL**: `2`


###### NUR05WL2

> **NUR05WL2**: `3`


###### NUR10W

> **NUR10W**: `4`


###### NUR2\_1W

> **NUR2\_1W**: `5`


###### NUR2\_01W

> **NUR2\_01W**: `6`


###### NUR3IE\_1W

> **NUR3IE\_1W**: `7`


###### NUR3FR\_1W

> **NUR3FR\_1W**: `8`


###### NUR3MOD\_1W

> **NUR3MOD\_1W**: `9`


###### NUR3IR\_1W

> **NUR3IR\_1W**: `10`


###### NUR3MOD\_0W1

> **NUR3MOD\_0W1**: `11`


###### NUR3MOD\_0W5

> **NUR3MOD\_0W5**: `12`


###### NUR3IOLINK\_1W

> **NUR3IOLINK\_1W**: `13`


###### NUR3FR26\_1W

> **NUR3FR26\_1W**: `14`


***

#### NurDevCapsF1


##### Enumeration Members

###### RXDECFM0

> **RXDECFM0**: `1`


###### RXDECM2

> **RXDECM2**: `2`


###### RXDECM4

> **RXDECM4**: `4`


###### RXDECM8

> **RXDECM8**: `8`


###### RXLF40K

> **RXLF40K**: `16`


###### RXLF80K

> **RXLF80K**: `32`


###### RXLF160K

> **RXLF160K**: `64`


###### RXLF256K

> **RXLF256K**: `128`


###### RXLF320K

> **RXLF320K**: `256`


###### RXLF640K

> **RXLF640K**: `512`


###### RXLFres1

> **RXLFres1**: `1024`


###### RXLFres2

> **RXLFres2**: `2048`


###### HASBEEP

> **HASBEEP**: `4096`


###### HASLIGHT

> **HASLIGHT**: `8192`


###### HASTAP

> **HASTAP**: `16384`


###### ANTTUNE

> **ANTTUNE**: `32768`


###### CHSCANNER

> **CHSCANNER**: `65536`


###### INVREAD

> **INVREAD**: `131072`


###### ANTPOWER

> **ANTPOWER**: `262144`


###### POWEROFS

> **POWEROFS**: `524288`


###### BEAMANTENNA

> **BEAMANTENNA**: `1048576`


###### FETCHSINGLE

> **FETCHSINGLE**: `2097152`


###### ANTENNAMAP

> **ANTENNAMAP**: `4194304`


###### GEN2VER2

> **GEN2VER2**: `8388608`


###### RFPROFILE

> **RFPROFILE**: `16777216`


###### DIAG

> **DIAG**: `33554432`


###### TAGPHAS

> **TAGPHAS**: `67108864`


###### SLEEP

> **SLEEP**: `134217728`


###### PHASEDIFF

> **PHASEDIFF**: `268435456`


###### GEN2X

> **GEN2X**: `536870912`


***

#### NurEasAlarmFlags


##### Enumeration Members

###### ARMED

> **ARMED**: `1`


###### STOPPED

> **STOPPED**: `2`


***

#### NurDiagCfgFlags


##### Enumeration Members

###### NOTIFY\_NONE

> **NOTIFY\_NONE**: `0`


###### NOTIFY\_PERIODIC

> **NOTIFY\_PERIODIC**: `1`


###### NOTIFY\_WARN

> **NOTIFY\_WARN**: `2`


###### FW\_ERROR\_LOG

> **FW\_ERROR\_LOG**: `4`


###### FW\_DEBUG\_LOG

> **FW\_DEBUG\_LOG**: `8`


***

#### NurDiagReportFlags


##### Enumeration Members

###### PERIODIC

> **PERIODIC**: `1`


###### TEMP\_HIGH

> **TEMP\_HIGH**: `2`


###### TEMP\_OVER

> **TEMP\_OVER**: `4`


###### LOWVOLT

> **LOWVOLT**: `8`


***

#### NurDiagGetReportFlags


##### Enumeration Members

###### NONE

> **NONE**: `0`


###### RESET\_STATS

> **RESET\_STATS**: `1`


***

#### NurGen2XFlags


##### Enumeration Members

###### ENABLE\_SCANID

> **ENABLE\_SCANID**: `1`


###### ENABLE\_TAGFOCUS

> **ENABLE\_TAGFOCUS**: `2`


###### ENABLE\_FASTID

> **ENABLE\_FASTID**: `4`


###### ACCEPT\_CRC5\_CRC5PLUS

> **ACCEPT\_CRC5\_CRC5PLUS**: `8`


###### POWER\_BOOST

> **POWER\_BOOST**: `16`


###### ENABLE\_PROTECTED\_MODE

> **ENABLE\_PROTECTED\_MODE**: `32`


###### ALL\_FLAGS

> **ALL\_FLAGS**: `63`


***

#### Monza4QtBits


##### Enumeration Members

###### QT\_MEM

> **QT\_MEM**: `16384`


###### QT\_SR

> **QT\_SR**: `32768`


***

#### NurStoreFlags


##### Enumeration Members

###### RF

> **RF**: `1`


###### GPIO

> **GPIO**: `2`


###### BAUDRATE

> **BAUDRATE**: `4`


###### OPFLAGS

> **OPFLAGS**: `8`


###### ALL

> **ALL**: `15`


***

#### NurCustExchFlags


##### Enumeration Members

###### ASWRITE

> **ASWRITE**: `1`


###### USEHANDLE

> **USEHANDLE**: `2`


###### XORRN16

> **XORRN16**: `4`


###### TXONLY

> **TXONLY**: `8`


###### NOTXCRC

> **NOTXCRC**: `16`


###### NORXCRC

> **NORXCRC**: `32`


###### CRC5

> **CRC5**: `64`


###### NORXLEN

> **NORXLEN**: `128`


###### STRIPHND

> **STRIPHND**: `256`


###### SKIPRESEL

> **SKIPRESEL**: `512`


***

#### NurAutoPeriod


Auto-inventory periodic power saving mode.

Controls RF duty cycling during inventory streaming to reduce power
consumption. CYCLE values set a maximum off-time; FORCE values
guarantee the specified sleep duration between rounds.

##### Enumeration Members

###### OFF

> **OFF**: `0`


Auto-inventory off — no duty cycling.

###### CYCLE\_25

> **CYCLE\_25**: `1`


Max ~1000 ms off time between inventory rounds (~25% duty cycle).

###### CYCLE\_33

> **CYCLE\_33**: `2`


Max ~500 ms off time between inventory rounds (~33% duty cycle).

###### CYCLE\_50

> **CYCLE\_50**: `3`


Max ~100 ms off time between inventory rounds (~50% duty cycle).

###### FORCE\_1000MS

> **FORCE\_1000MS**: `4`


Forced 1000 ms sleep between inventory rounds.

###### FORCE\_500MS

> **FORCE\_500MS**: `5`


Forced 500 ms sleep between inventory rounds.

###### FORCE\_100MS

> **FORCE\_100MS**: `6`


Forced 100 ms sleep between inventory rounds.

***

#### NurAntennaMask


##### Enumeration Members

###### ANT1

> **ANT1**: `1`


###### ANT2

> **ANT2**: `2`


###### ANT3

> **ANT3**: `4`


###### ANT4

> **ANT4**: `8`


###### ALL

> **ALL**: `15`


***

#### NurIrType


##### Enumeration Members

###### EPCDATA

> **EPCDATA**: `0`


###### DATAONLY

> **DATAONLY**: `1`


###### EPCXTID

> **EPCXTID**: `2`


###### XTIDONLY

> **XTIDONLY**: `3`


***

#### NurRxSensitivity


Receiver sensitivity level.

##### Enumeration Members

###### NOMINAL

> **NOMINAL**: `0`


Nominal sensitivity (default).

###### LOW

> **LOW**: `1`


Low sensitivity — reduces range, improves near-field performance.

###### HIGH

> **HIGH**: `2`


High sensitivity — maximizes read range.

### Other

#### AccExtCmd


Accessory extension sub-command IDs.

##### Enumeration Members

###### GET\_FWVERSION

> **GET\_FWVERSION**: `0`


###### GET\_CFG

> **GET\_CFG**: `1`


###### SET\_CFG

> **SET\_CFG**: `2`


###### GET\_BATT

> **GET\_BATT**: `3`


###### READ\_BARCODE

> **READ\_BARCODE**: `4`


###### RESTART

> **RESTART**: `5`


###### READ\_BARCODE\_ASYNC

> **READ\_BARCODE\_ASYNC**: `6`


###### SET\_LED\_OP

> **SET\_LED\_OP**: `7`


###### BEEP\_ASYNC

> **BEEP\_ASYNC**: `8`


###### GET\_BATT\_INFO

> **GET\_BATT\_INFO**: `9`


###### ENTER\_TESTMODE

> **ENTER\_TESTMODE**: `10`


###### GET\_HEALTHSTATE

> **GET\_HEALTHSTATE**: `11`


###### WIRELESS\_CHARGE

> **WIRELESS\_CHARGE**: `12`


###### IMAGER

> **IMAGER**: `13`


###### VIBRATE

> **VIBRATE**: `14`


###### CLEAR\_PAIRS

> **CLEAR\_PAIRS**: `15`


###### GET\_MODEL\_INFORMATION

> **GET\_MODEL\_INFORMATION**: `16`


###### GET\_CONNECTION\_INFO

> **GET\_CONNECTION\_INFO**: `18`


###### SENSOR\_ENUMERATE

> **SENSOR\_ENUMERATE**: `19`


###### SENSOR\_SET\_CONFIG

> **SENSOR\_SET\_CONFIG**: `20`


###### SENSOR\_GET\_CONFIG

> **SENSOR\_GET\_CONFIG**: `21`


###### SENSOR\_SET\_FILTER

> **SENSOR\_SET\_FILTER**: `22`


###### SENSOR\_GET\_FILTER

> **SENSOR\_GET\_FILTER**: `23`


###### SENSOR\_GET\_VALUE

> **SENSOR\_GET\_VALUE**: `24`


###### SENSOR\_SET\_SETTINGS

> **SENSOR\_SET\_SETTINGS**: `25`


###### SENSOR\_GET\_SETTINGS

> **SENSOR\_GET\_SETTINGS**: `26`


###### MCUMGR

> **MCUMGR**: `28`


###### HID

> **HID**: `29`


###### PRODUCTION

> **PRODUCTION**: `99`


###### IMAGER\_DIAGNOSTICS

> **IMAGER\_DIAGNOSTICS**: `100`


***

#### AccEventType


Accessory notification event types (first byte of NUR_NOTIFY_ACCESSORY payload).

##### Enumeration Members

###### NONE

> **NONE**: `0`


###### BARCODE

> **BARCODE**: `1`


###### SENSOR\_CHANGED

> **SENSOR\_CHANGED**: `2`


###### SENSOR\_RANGE\_DATA

> **SENSOR\_RANGE\_DATA**: `3`


###### SENSOR\_TOF\_FR\_BFA\_RAW\_DATA

> **SENSOR\_TOF\_FR\_BFA\_RAW\_DATA**: `4`


###### SPEED\_TEST

> **SPEED\_TEST**: `144`


***

#### AccLedMode


LED operation modes.

##### Enumeration Members

###### UNSET

> **UNSET**: `0`


###### OFF

> **OFF**: `1`


###### ON

> **ON**: `2`


###### BLINK

> **BLINK**: `3`


***

#### AccHidMode


HID output modes.

##### Enumeration Members

###### DISABLED

> **DISABLED**: `0`


###### BARCODE

> **BARCODE**: `1`


###### RFID

> **RFID**: `2`


###### RFID\_BARCODE

> **RFID\_BARCODE**: `3`


***

#### AccSensorType


Sensor type identifiers.

##### Enumeration Members

###### ULTRASONIC

> **ULTRASONIC**: `0`


###### GPIO

> **GPIO**: `1`


###### TAP

> **TAP**: `2`


###### TOF

> **TOF**: `3`


###### EXT\_TOF\_FR\_BFA

> **EXT\_TOF\_FR\_BFA**: `4`


***

#### AccSensorFeature


Feature flags reported per sensor.

##### Enumeration Members

###### RANGE

> **RANGE**: `1`


###### STREAM\_VALUE

> **STREAM\_VALUE**: `2`


***

#### AccSensorMode


Sensor reporting mode flags.

##### Enumeration Members

###### GPIO

> **GPIO**: `1`


###### STREAM

> **STREAM**: `2`


***

#### AccSensorFilterFlag


Sensor filter enable flags.

##### Enumeration Members

###### RANGE

> **RANGE**: `1`


###### TIME

> **TIME**: `2`


***

#### ImagerCmd


Imager sub-command identifiers.

##### Enumeration Members

###### TRIGGER\_PRE\_SET

> **TRIGGER\_PRE\_SET**: `1`


###### TRIGGER\_CANCEL

> **TRIGGER\_CANCEL**: `2`


###### CENTRAL\_READING

> **CENTRAL\_READING**: `3`


###### RAW\_CMD

> **RAW\_CMD**: `4`


###### POWER

> **POWER**: `5`


###### AIM

> **AIM**: `6`


***

#### AccSensorSource


Accessory sensor source identifiers.

##### Enumeration Members

###### GPIO\_PIN1

> **GPIO\_PIN1**: `0`


###### GPIO\_PIN2

> **GPIO\_PIN2**: `1`


###### GPIO\_PIN3

> **GPIO\_PIN3**: `2`


###### GPIO\_PIN4

> **GPIO\_PIN4**: `3`


###### BUTTON\_TRIGGER

> **BUTTON\_TRIGGER**: `100`


###### BUTTON\_POWER

> **BUTTON\_POWER**: `101`


###### BUTTON\_UNPAIR

> **BUTTON\_UNPAIR**: `102`


###### TAP\_SENSOR

> **TAP\_SENSOR**: `128`


###### USB1\_SENSOR

> **USB1\_SENSOR**: `130`


###### USB2\_SENSOR

> **USB2\_SENSOR**: `131`


###### USB3\_SENSOR

> **USB3\_SENSOR**: `132`


###### USB4\_SENSOR

> **USB4\_SENSOR**: `133`


###### TOF\_SENSOR

> **TOF\_SENSOR**: `134`


###### TOF\_SENSOR\_FR\_BFA

> **TOF\_SENSOR\_FR\_BFA**: `135`


***

#### BarcodeReadStatus


Status of barcode read operation.

##### Enumeration Members

###### SUCCESS

> **SUCCESS**: `0`


###### HARDWARE\_NOT\_AVAILABLE

> **HARDWARE\_NOT\_AVAILABLE**: `1`


###### NO\_BARCODE

> **NO\_BARCODE**: `2`


###### CANCELLED

> **CANCELLED**: `3`


###### UNKNOWN

> **UNKNOWN**: `4`


***

#### AccWirelessChargeStatus


Wireless charging status.

##### Enumeration Members

###### OFF

> **OFF**: `0`


###### ON

> **ON**: `1`


###### REFUSED

> **REFUSED**: `-1`


###### FAIL

> **FAIL**: `-2`


###### NOT\_SUPPORTED

> **NOT\_SUPPORTED**: `-3`


***

#### PairingMode


BLE pairing mode.

##### Enumeration Members

###### DISABLED

> **DISABLED**: `0`


###### ENABLED

> **ENABLED**: `1`


***

#### ACC\_BATT\_FL\_CHARGING

> `const` **ACC\_BATT\_FL\_CHARGING**: `number`


Battery flags.

***

#### ACC\_FL\_HID\_BARCODE

> `const` **ACC\_FL\_HID\_BARCODE**: `number`


Config operation flags.

***

#### ACC\_FL\_HID\_RFID

> `const` **ACC\_FL\_HID\_RFID**: `number`


***

#### ACC\_FL\_NO\_CENTRAL\_READ

> `const` **ACC\_FL\_NO\_CENTRAL\_READ**: `number`


***

#### ACC\_FL\_NO\_BATT\_IND

> `const` **ACC\_FL\_NO\_BATT\_IND**: `number`


***

#### ACC\_FL\_ACDE

> `const` **ACC\_FL\_ACDE**: `number`


***

#### ACC\_FL\_USE\_PEERMGR

> `const` **ACC\_FL\_USE\_PEERMGR**: `number`


***

#### ACC\_CFG\_ACD

> `const` **ACC\_CFG\_ACD**: `number`


Config device capability flags (AccConfig.config field).

***

#### ACC\_CFG\_WEARABLE

> `const` **ACC\_CFG\_WEARABLE**: `number`


***

#### ACC\_CFG\_IMAGER

> `const` **ACC\_CFG\_IMAGER**: `number`


***

#### ACC\_CFG\_WIRELESS\_CHG

> `const` **ACC\_CFG\_WIRELESS\_CHG**: `number`


***

#### ACC\_CFG\_VIBRATOR

> `const` **ACC\_CFG\_VIBRATOR**: `number`


***

#### CONFIG\_FLAG\_EXA51

> `const` **CONFIG\_FLAG\_EXA51**: `number`


***

#### CONFIG\_FLAG\_EXA31

> `const` **CONFIG\_FLAG\_EXA31**: `number`


***

#### ACC\_FL\_HID\_USB

> `const` **ACC\_FL\_HID\_USB**: `number`


***

#### DeviceDiscoveryCallback

> **DeviceDiscoveryCallback** = (`device`) => `void`


Callback invoked when a discoverer finds/loses a device.

##### Parameters

###### device

[`DiscoveredDevice`](#discovereddevice)

**Returns** `void`

***

#### INurDeviceDiscovery


Contract for transport-specific discoverers.

Each discoverer handles a single URI scheme (e.g., 'ser' for serial, 'tcp' for mDNS).
The orchestrator manages multiple discoverers and deduplicates events.

##### Methods

###### start()

> **start**(): `void`


Start discovering devices.

**Returns** `void`

###### stop()

> **stop**(): `void`


Stop discovering devices.

**Returns** `void`

###### periodicCheck()

> **periodicCheck**(): `void` \| `Promise`\<`void`\>


Called periodically by the orchestrator to poll for devices.

**Returns** `void` \| `Promise`\<`void`\>

##### Properties

###### scheme

> `readonly` **scheme**: `string`


URI scheme this discoverer handles (e.g., 'ser', 'tcp')

###### isActive

> `readonly` **isActive**: `boolean`


Whether this discoverer is currently active.

###### onDeviceDiscovery

> **onDeviceDiscovery**: [`DeviceDiscoveryCallback`](#devicediscoverycallback) \| `null`


Callback for reporting discovered/lost devices to the orchestrator.

***

#### DiscoveryFactory

> **DiscoveryFactory** = () => [`INurDeviceDiscovery`](#inurdevicediscovery)


Factory function that creates a discoverer for a given scheme.

**Returns** [`INurDeviceDiscovery`](#inurdevicediscovery)

***

#### NurDiscoveryRegistry


URI-based discovery registry.

Maps URI schemes (e.g., 'ser', 'tcp') to factory functions
that create the appropriate discoverer implementation.

All methods are static — there is a single global registry.

##### Constructors

###### Constructor

> **new NurDiscoveryRegistry**(): [`NurDiscoveryRegistry`](#nurdiscoveryregistry)

**Returns** [`NurDiscoveryRegistry`](#nurdiscoveryregistry)

##### Methods

###### register()

> `static` **register**(`scheme`, `factory`): `void`


Register a discoverer factory for a URI scheme.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| scheme | `string` | URI scheme without '://' (e.g., 'ser', 'tcp') |
| factory | [`DiscoveryFactory`](#discoveryfactory) | Factory function that creates a discoverer |

**Returns** `void`

**Throws** Error if scheme is already registered

###### remove()

> `static` **remove**(`scheme`): `boolean`


Remove a registered discovery scheme.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| scheme | `string` | URI scheme to remove |

**Returns** `boolean` — true if the scheme was registered and removed, false if not found

###### has()

> `static` **has**(`scheme`): `boolean`


Check if a discovery scheme is registered.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| scheme | `string` | URI scheme to check |

**Returns** `boolean`

###### create()

> `static` **create**(`scheme`): [`INurDeviceDiscovery`](#inurdevicediscovery)


Create a discoverer for the given scheme.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| scheme | `string` | URI scheme (e.g., 'ser', 'tcp') |

**Returns** [`INurDeviceDiscovery`](#inurdevicediscovery) — A new discoverer instance

**Throws** Error if the scheme is not registered

###### schemes()

> `static` **schemes**(): `string`[]


List all registered discovery schemes.

**Returns** `string`[] — Array of registered scheme strings (e.g., ['ser', 'tcp'])

###### getDiscoverers()

> `static` **getDiscoverers**(`schemes?`): [`INurDeviceDiscovery`](#inurdevicediscovery)[]


Get discoverers for the specified schemes, or all if none specified.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| schemes? | `string`[] | Optional array of schemes to filter by |

**Returns** [`INurDeviceDiscovery`](#inurdevicediscovery)[] — Array of newly created discoverer instances

###### clear()

> `static` **clear**(): `void`


Clear all registered discoverers.
Primarily useful for testing.

**Returns** `void`

***

#### DiscoveredDevice


Represents a discovered NUR RFID reader.

##### Properties

###### uri

> **uri**: `string`


Ready-to-use URI for `api.connect()` (e.g., 'ser://COM3', 'tcp://192.168.1.10:4333')

###### scheme

> **scheme**: `string`


URI scheme ('ser', 'tcp')

###### name

> **name**: `string`


Device/port name (e.g., 'EXA51234', 'COM3')

###### visible

> **visible**: `boolean`


true = device appeared, false = device disappeared

###### metadata

> **metadata**: `Record`\<`string`, `string`\>


Transport-specific metadata (vendorId, hostname, etc.)

***

#### NurDeviceDiscoveryEvents

> **NurDeviceDiscoveryEvents** = `object`


Events emitted by NurDeviceDiscovery orchestrator.

##### Properties

###### deviceDiscovery

> **deviceDiscovery**: (`device`) => `void`


**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| device | [`DiscoveredDevice`](#discovereddevice) |  |

**Returns** `void`

###### error

> **error**: (`error`) => `void`


**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| error | `Error` |  |

**Returns** `void`

***

#### DiscoveryOptions


Options for `discovery.start()`.

##### Properties

###### schemes?

> `optional` **schemes?**: `string`[]


Filter to specific URI schemes (default: all registered)

###### intervalMs?

> `optional` **intervalMs?**: `number`


Polling interval in ms (default: 5000)

***

#### DebugLevel

> **DebugLevel** = `"error"` \| `"warning"` \| `"info"` \| `"verbose"` \| `"unknown"`


Log level extracted from debug message prefix.

***

#### PACKET\_START

> `const` **PACKET\_START**: `165` = `0xa5`


Packet start marker byte

***

#### CS\_STARTBYTE

> `const` **CS\_STARTBYTE**: `255` = `0xff`


XOR seed for header checksum

***

#### HDR\_SIZE

> `const` **HDR\_SIZE**: `6` = `6`


Header size in bytes (start + payloadLen:u16 + flags:u16 + checksum:u8)

***

#### PACKET\_FLAG\_UNSOL

> `const` **PACKET\_FLAG\_UNSOL**: `number`


Unsolicited notification packet

***

#### PACKET\_FLAG\_IRDATA

> `const` **PACKET\_FLAG\_IRDATA**: `number`


IR data present in packet

***

#### PACKET\_FLAG\_ACK

> `const` **PACKET\_FLAG\_ACK**: `number`


ACK requested

***

#### PACKET\_FLAG\_ECHO1

> `const` **PACKET\_FLAG\_ECHO1**: `number`


Echo flag (bit 7)

***

#### PACKET\_FLAG\_ECHO\_INTERNAL

> `const` **PACKET\_FLAG\_ECHO\_INTERNAL**: `number`


Internal echo

***

#### PACKET\_FLAG\_ECHO\_INTERNAL\_EXTERNAL

> `const` **PACKET\_FLAG\_ECHO\_INTERNAL\_EXTERNAL**: `number`


Internal-external echo

***

#### PACKET\_FLAG\_ECHO

> `const` **PACKET\_FLAG\_ECHO**: `number`


Combined echo flags

***

#### PACKET\_FLAG\_SEQNUM

> `const` **PACKET\_FLAG\_SEQNUM**: `number`


Sequence number mask (bits 15-12)

***

#### NUR\_MAX\_SEND\_SZ

> `const` **NUR\_MAX\_SEND\_SZ**: `number`


Maximum send buffer size in bytes

***

#### NUR\_MAX\_RCV\_SZ

> `const` **NUR\_MAX\_RCV\_SZ**: `number`


Maximum receive buffer size in bytes

***

#### NUR\_MAX\_EPC\_LENGTH

> `const` **NUR\_MAX\_EPC\_LENGTH**: `62` = `62`


Maximum EPC data length in bytes

***

#### NUR\_MAX\_EPC\_LENGTH\_EX

> `const` **NUR\_MAX\_EPC\_LENGTH\_EX**: `64` = `64`


Maximum EPC data length (extended) in bytes

***

#### NUR\_MAX\_IRDATA\_LENGTH

> `const` **NUR\_MAX\_IRDATA\_LENGTH**: `64` = `64`


Maximum inventory read data length

***

#### MAX\_EE\_EPCLEN

> `const` **MAX\_EE\_EPCLEN**: `16` = `16`


Maximum EPC enumeration response EPC length

***

#### MAX\_EE\_TIDLEN

> `const` **MAX\_EE\_TIDLEN**: `16` = `16`


Maximum EPC enumeration response TID length

***

#### NUR\_MAX\_MAPPINGLEN

> `const` **NUR\_MAX\_MAPPINGLEN**: `16` = `16`


Maximum antenna mapping name length

***

#### NUR\_MAX\_SELMASK

> `const` **NUR\_MAX\_SELMASK**: `62` = `62`


Maximum select mask length in bytes

***

#### NUR\_MAX\_SELMASKBITS

> `const` **NUR\_MAX\_SELMASKBITS**: `number`


Maximum select mask length in bits

***

#### ISEL\_INVERT

> `const` **ISEL\_INVERT**: `number`


Invert selection

***

#### ISEL\_64ADDR

> `const` **ISEL\_64ADDR**: `number`


64-bit address mode

***

#### RW\_SEC

> `const` **RW\_SEC**: `number`


Read/write secured access

***

#### RW\_SBP

> `const` **RW\_SBP**: `number`


Read/write select before parameters

***

#### RW\_EA1

> `const` **RW\_EA1**: `number`


Read/write extended address 1

***

#### RW\_EA2

> `const` **RW\_EA2**: `number`


Read/write extended address 2

***

#### NUR\_MAX\_SENSORS

> `const` **NUR\_MAX\_SENSORS**: `2` = `2`


Maximum number of sensors

***

#### NUR\_SZ\_SENSOR\_CONF

> `const` **NUR\_SZ\_SENSOR\_CONF**: `2` = `2`


Sensor config size

***

#### NUR\_SENSOR\_TAP

> `const` **NUR\_SENSOR\_TAP**: `number`


Tap sensor bit

***

#### NUR\_SENSOR\_LIGHT

> `const` **NUR\_SENSOR\_LIGHT**: `number`


Light sensor bit

***

#### NUR\_SENSOR\_EVENT\_FLAG

> `const` **NUR\_SENSOR\_EVENT\_FLAG**: `number`


Sensor event flag

***

#### NUR\_SENSOR\_EVENT\_MASK

> `const` **NUR\_SENSOR\_EVENT\_MASK**: `number`


Sensor event mask

***

#### NUR\_TAP\_EVENT\_VALUE

> `const` **NUR\_TAP\_EVENT\_VALUE**: `0` = `0`


Tap event value

***

#### NUR\_LIGHT\_EVENT\_VALUE

> `const` **NUR\_LIGHT\_EVENT\_VALUE**: `1` = `1`


Light event value

***

#### NUR\_SENSOR\_EVENT\_TAP

> `const` **NUR\_SENSOR\_EVENT\_TAP**: `128` = `0x80`


Composite tap event (SENSOR_EVENT_FLAG | TAP_EVENT_VALUE)

***

#### NUR\_SENSOR\_EVENT\_LIGHT

> `const` **NUR\_SENSOR\_EVENT\_LIGHT**: `129` = `0x81`


Composite light event (SENSOR_EVENT_FLAG | LIGHT_EVENT_VALUE)

***

#### NUR\_MAX\_GPIO

> `const` **NUR\_MAX\_GPIO**: `8` = `8`


Maximum number of GPIOs (matches C host API NUR_MAX_GPIO)

***

#### NUR\_MAX\_ANTENNAS

> `const` **NUR\_MAX\_ANTENNAS**: `4` = `4`


Maximum number of antennas (legacy)

***

#### NUR\_MAX\_ANTENNAS\_EX

> `const` **NUR\_MAX\_ANTENNAS\_EX**: `32` = `32`


Maximum number of antennas (extended, up to 32)

***

#### NUR\_MAX\_CONFIG\_REGIONS

> `const` **NUR\_MAX\_CONFIG\_REGIONS**: `20` = `20`


Maximum number of config regions

***

#### NUR\_MAX\_CUSTOM\_FREQS

> `const` **NUR\_MAX\_CUSTOM\_FREQS**: `100` = `100`


Maximum number of custom frequencies

***

#### NUR\_MAX\_FILTERS

> `const` **NUR\_MAX\_FILTERS**: `8` = `8`


Maximum number of inventory extended filters

***

#### NUR\_MAX\_BITS\_IN\_STREAM

> `const` **NUR\_MAX\_BITS\_IN\_STREAM**: `1024` = `1024`


Maximum number of TX bits in custom bit stream

***

#### NR\_TUNEBANDS

> `const` **NR\_TUNEBANDS**: `6` = `6`


Number of antenna tuning bands

***

#### NUR\_READERINFO\_VERSION1

> `const` **NUR\_READERINFO\_VERSION1**: `1380206849` = `0x52444901`


Reader info version 1 magic number

***

#### NUR\_MAX\_SERIAL\_LENGTH

> `const` **NUR\_MAX\_SERIAL\_LENGTH**: `16` = `16`


Maximum serial number length

***

#### NUR\_MAX\_NAME\_LENGTH

> `const` **NUR\_MAX\_NAME\_LENGTH**: `16` = `16`


Maximum reader name length

***

#### NUR\_MAX\_FCCID\_LENGTH

> `const` **NUR\_MAX\_FCCID\_LENGTH**: `48` = `48`


Maximum FCC ID length

***

#### NUR\_MAX\_HWVER\_LENGTH

> `const` **NUR\_MAX\_HWVER\_LENGTH**: `8` = `8`


Maximum HW version length

***

#### RINFO\_NAME\_LENGTH

> `const` **RINFO\_NAME\_LENGTH**: `16` = `16`


Reader info name field length

***

#### RINFO\_SERIAL\_LEN

> `const` **RINFO\_SERIAL\_LEN**: `16` = `16`


Reader info serial field length

***

#### RINFO\_ALTSERIAL\_LEN

> `const` **RINFO\_ALTSERIAL\_LEN**: `16` = `16`


Reader info alt serial field length

***

#### RINFO\_HWVERSION\_LEN

> `const` **RINFO\_HWVERSION\_LEN**: `8` = `8`


Reader info HW version field length

***

#### RINFO\_FCCID\_LEN

> `const` **RINFO\_FCCID\_LEN**: `48` = `48`


Reader info FCC ID field length

***

#### SZ\_DEVCAPS

> `const` **SZ\_DEVCAPS**: `128` = `128`


Size of device capabilities structure

***

#### SZ\_NUR\_DEVCAPS

> `const` **SZ\_NUR\_DEVCAPS**: `128` = `128`


***

#### DEF\_TIMEOUT

> `const` **DEF\_TIMEOUT**: `3000` = `3000`


Default command timeout (ms)

***

#### DEF\_LONG\_TIMEOUT

> `const` **DEF\_LONG\_TIMEOUT**: `10000` = `10000`


Default long command timeout (ms) — for inventory, tuning, etc.

***

#### NUR\_DEFAULT\_BAUDRATE

> `const` **NUR\_DEFAULT\_BAUDRATE**: `115200` = `115200`


Default NUR module baudrate

***

#### NUR\_FLASH\_PAGE\_SIZE

> `const` **NUR\_FLASH\_PAGE\_SIZE**: `256` = `256`


Internal FLASH page size in bytes

***

#### NUR\_FLASH\_PAGE\_SIZE\_DW

> `const` **NUR\_FLASH\_PAGE\_SIZE\_DW**: `number`


Internal FLASH page size in uint32s

***

#### MIN\_SCRATCHBYTES

> `const` **MIN\_SCRATCHBYTES**: `1` = `1`


Minimum scratch bytes

***

#### MAX\_SCRATCHBYTES

> `const` **MAX\_SCRATCHBYTES**: `256` = `256`


Maximum scratch bytes

***

#### CRYPTO\_PERMISSION\_LENGTH

> `const` **CRYPTO\_PERMISSION\_LENGTH**: `32` = `32`


Crypto permission length

***

#### PRODUCTION\_TUNE\_MAGICLEN

> `const` **PRODUCTION\_TUNE\_MAGICLEN**: `8` = `8`


Production tune magic code length

***

#### XPC\_W1\_MASK

> `const` **XPC\_W1\_MASK**: `512` = `0x0200`


If PC-word ANDed with this is nonzero, XPC_W1 is present

***

#### XPC\_EXT\_MASK

> `const` **XPC\_EXT\_MASK**: `32768` = `0x8000`


If XPC_W1 ANDed with this is nonzero, XPC_W2 is present

***

#### NUR\_RXSENS\_NOMINAL

> `const` **NUR\_RXSENS\_NOMINAL**: `0` = `0`


Receiver sensitivity: nominal

***

#### NUR\_RXSENS\_LOW

> `const` **NUR\_RXSENS\_LOW**: `1` = `1`


Receiver sensitivity: low

***

#### NUR\_RXSENS\_HIGH

> `const` **NUR\_RXSENS\_HIGH**: `2` = `2`


Receiver sensitivity: high

***

#### AUTOTUNE\_MODE\_ENABLE

> `const` **AUTOTUNE\_MODE\_ENABLE**: `number`


Enable run-time automatic tuning

***

#### AUTOTUNE\_MODE\_THRESHOLD\_ENABLE

> `const` **AUTOTUNE\_MODE\_THRESHOLD\_ENABLE**: `number`


Use threshold in run-time automatic tuning

***

#### HOSTFLAGS\_EN\_UNSOL\_ACK

> `const` **HOSTFLAGS\_EN\_UNSOL\_ACK**: `number`


When set, module sends ACK request with unsolicited packets.

***

#### NUR\_VARIANT\_FLAG\_NONE

> `const` **NUR\_VARIANT\_FLAG\_NONE**: `0` = `0`


***

#### NUR\_VARIANT\_FLAG\_USB\_TABLE

> `const` **NUR\_VARIANT\_FLAG\_USB\_TABLE**: `number`


***

#### NUR\_VARIANT\_FLAG\_ETH\_TABLE

> `const` **NUR\_VARIANT\_FLAG\_ETH\_TABLE**: `number`


***

#### NUR\_VARIANT\_FLAG\_STIX

> `const` **NUR\_VARIANT\_FLAG\_STIX**: `number`


***

#### NUR\_VARIANT\_FLAG\_ONEWATT

> `const` **NUR\_VARIANT\_FLAG\_ONEWATT**: `number`


***

#### NUR\_VARIANT\_FLAG\_BEAMANT

> `const` **NUR\_VARIANT\_FLAG\_BEAMANT**: `number`


***

#### NUR\_VARIANT\_FLAG\_MULTIPORT

> `const` **NUR\_VARIANT\_FLAG\_MULTIPORT**: `number`


***

#### NUR\_VARIANT\_BEAM\_READER\_EB

> `const` **NUR\_VARIANT\_BEAM\_READER\_EB**: `number`


***

#### NUR\_VARIANT\_BEAM\_READER\_EB2

> `const` **NUR\_VARIANT\_BEAM\_READER\_EB2**: `number`


***

#### NUR\_VARIANT\_AR\_LOWGAIN

> `const` **NUR\_VARIANT\_AR\_LOWGAIN**: `number`


***

#### NUR\_VARIANT\_4PORT

> `const` **NUR\_VARIANT\_4PORT**: `number`


***

#### NUR\_VARIANT\_HAS\_TEMPSENSOR

> `const` **NUR\_VARIANT\_HAS\_TEMPSENSOR**: `number`


***

#### NUR\_VARIANT\_ZUMTOBEL\_READER

> `const` **NUR\_VARIANT\_ZUMTOBEL\_READER**: `number`


***

#### MockTransport


Mock transport implementation for testing.

##### Example

```typescript
const transport = new MockTransport();
transport.onData = (data) => { ... };
await transport.connect(new URL('mock://test'));

// Inspect what was sent
await transport.write(packetBytes);
console.log(transport.writtenData);

// Simulate incoming data
transport.simulateReceive(responseBytes);

// Simulate disconnection
transport.simulateDisconnect();
```

##### Implements

- [`NurTransport`](#nurtransport)

##### Accessors

###### connected

###### Get Signature

> **get** **connected**(): `boolean`


Whether the transport is currently connected

**Returns** `boolean` — Whether the transport is currently connected.

###### uri

###### Get Signature

> **get** **uri**(): `URL` \| `null`


The URI used for the last connect() call

**Returns** `URL` \| `null`

##### Constructors

###### Constructor

> **new MockTransport**(): [`MockTransport`](#mocktransport)

**Returns** [`MockTransport`](#mocktransport)

##### Methods

###### connect()

> **connect**(`uri`): `Promise`\<`void`\>


Connect to a NUR reader module at the given URI.
The URI was already parsed and dispatched by the transport registry.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| uri | `URL` | Parsed URL with scheme, host, port, path, query params |

**Returns** `Promise`\<`void`\>

**Throws** Error if connection fails

###### disconnect()

> **disconnect**(): `Promise`\<`void`\>


Disconnect from the reader module.
Must be safe to call even if not connected.

**Returns** `Promise`\<`void`\>

###### write()

> **write**(`data`): `Promise`\<`void`\>


Send binary data to the reader module.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| data | `Uint8Array` | Raw bytes to send |

**Returns** `Promise`\<`void`\>

**Throws** Error if not connected or write fails

###### simulateReceive()

> **simulateReceive**(`data`): `void`


Simulate incoming data from the reader module.
Invokes the onData callback as if data was received from the transport.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| data | `Uint8Array` | Raw bytes to inject |

**Returns** `void`

###### simulateDisconnect()

> **simulateDisconnect**(`error?`): `void`


Simulate an unexpected disconnection from the reader module.
Invokes the onDisconnect callback as if the connection was lost.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| error? | `Error` | Optional error describing the disconnection cause |

**Returns** `void`

###### reset()

> **reset**(): `void`


Reset the mock transport state for reuse between tests.

**Returns** `void`

##### Properties

###### type

> `readonly` **type**: `"mock"` = `'mock'`


Human-readable transport type identifier (e.g., 'websocket', 'serial', 'tcp').

###### flags

> **flags**: [`NurTransportFlags`](#nurtransportflags) = `NurTransportFlags.None`


Transport capability flags.

When `NurTransportFlags.PreferAck` is set, the connection layer sends
`HOSTFLAGS_EN_UNSOL_ACK` during the initial ping so the module includes
ACK requests with unsolicited packets.

Defaults to `NurTransportFlags.None` when not provided.

###### onData

> **onData**: ((`data`) => `void`) \| `null` = `null`


Callback for received data — set by consumer

###### onDisconnect

> **onDisconnect**: ((`error?`) => `void`) \| `null` = `null`


Callback for unexpected disconnection — set by consumer

###### writtenData

> **writtenData**: `Uint8Array`\<`ArrayBufferLike`\>[] = `[]`


All data written via write() — for test inspection

###### connectCount

> **connectCount**: `number` = `0`


Number of times connect() was called

###### disconnectCount

> **disconnectCount**: `number` = `0`


Number of times disconnect() was called

###### connectError

> **connectError**: `Error` \| `null` = `null`


If set, connect() will reject with this error

###### writeError

> **writeError**: `Error` \| `null` = `null`


If set, write() will reject with this error

### Accessory

#### NurAccessoryExt


Accessory device extension API for Nordic ID handheld devices.

Wraps a [NurApi](#nurapi) instance and provides methods for device-specific
features: LED, vibration, beep, barcode scanning, battery, sensors, etc.

##### Example

```typescript
const reader = new NurApi();
const acc = new NurAccessoryExt(reader);
await reader.connect('ble://request');

console.log(await acc.getFwVersion());
console.log(await acc.getBatteryInfo());
await acc.setLed(AccLedMode.BLINK);
await acc.vibrate(200, 2);
```

##### Constructors

###### Constructor

> **new NurAccessoryExt**(`api`): [`NurAccessoryExt`](#nuraccessoryext)


**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| api | [`NurApi`](#nurapi) |  |

**Returns** [`NurAccessoryExt`](#nuraccessoryext)

##### Methods

###### getFwVersion()

> **getFwVersion**(): `Promise`\<`string`\>


Get accessory device firmware version string.

**Returns** `Promise`\<`string`\>

###### getFwInfo()

> **getFwInfo**(): `Promise`\<[`AccessoryFWInfo`](#accessoryfwinfo)\>


Get structured accessory firmware version info.

**Returns** `Promise`\<[`AccessoryFWInfo`](#accessoryfwinfo)\>

###### getModelInfo()

> **getModelInfo**(): `Promise`\<`string`\>


Get accessory device model information string.

**Returns** `Promise`\<`string`\>

###### getConnectionInfo()

> **getConnectionInfo**(): `Promise`\<`string`\>


Get accessory connection information string.

**Returns** `Promise`\<`string`\>

###### getHealthState()

> **getHealthState**(): `Promise`\<`string`\>


Get accessory device health state string.

**Returns** `Promise`\<`string`\>

###### getHwHealth()

> **getHwHealth**(): `Promise`\<`string`[][]\>


Get structured HW health info as key-value pairs.

**Returns** `Promise`\<`string`[][]\> — Array of [key, value] string pairs (e.g. [["NUR", "OK"], ["Imager", "OK"]])

###### restart()

> **restart**(`mode?`): `Promise`\<`void`\>


Restart the accessory device.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| mode? | `"reboot"` \| `"dfu"` \| `"poweroff"` | 'reboot' (default), 'dfu' (firmware upgrade), or 'poweroff' |

**Returns** `Promise`\<`void`\>

###### clearPairings()

> **clearPairings**(): `Promise`\<`void`\>


Clear all BLE pairing information from the accessory device.

**Returns** `Promise`\<`void`\>

###### getConfig()

> **getConfig**(): `Promise`\<[`AccConfig`](#accconfig)\>


Get accessory device configuration.

**Returns** `Promise`\<[`AccConfig`](#accconfig)\>

###### setConfig()

> **setConfig**(`config`): `Promise`\<`void`\>


Set accessory device configuration.

First call [getConfig](#getconfig) to read the current config, modify
desired fields, then pass the full config to this method.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| config | [`AccConfig`](#accconfig) | Accessory device configuration to apply. |

**Returns** `Promise`\<`void`\>

###### getBatteryVoltage()

> **getBatteryVoltage**(): `Promise`\<`number`\>


Get accessory device battery voltage in millivolts.

**Returns** `Promise`\<`number`\>

###### getBatteryInfo()

> **getBatteryInfo**(): `Promise`\<[`AccBatteryInfo`](#accbatteryinfo)\>


Get detailed accessory device battery information.

**Returns** `Promise`\<[`AccBatteryInfo`](#accbatteryinfo)\>

###### setLed()

> **setLed**(`mode`): `Promise`\<`void`\>


Set the accessory device programmable LED mode.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| mode | [`AccLedMode`](#accledmode) | LED operating mode to set. |

**Returns** `Promise`\<`void`\>

###### vibrate()

> **vibrate**(`durationMs?`, `count?`): `Promise`\<`void`\>


Activate the accessory device vibration motor.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| durationMs? | `number` | Vibration on time in ms (default 300). Pause between is the same. |
| count? | `number` | Number of times to repeat (default 1). Total must not exceed 2000ms. |

**Returns** `Promise`\<`void`\>

###### beep()

> **beep**(`durationMs?`): `Promise`\<`void`\>


Generate a beep sound on the accessory device.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| durationMs? | `number` | Beep duration in ms (default 500, range 1-5000) |

**Returns** `Promise`\<`void`\>

###### readBarcodeAsync()

> **readBarcodeAsync**(`timeoutMs?`): `Promise`\<`void`\>


Start asynchronous barcode reading. Result arrives via notification.

While barcode reading is active, no other commands should be sent.
Listen for the `accBarcode` event on the NurApi instance.
Use [cancelBarcode](#cancelbarcode) to cancel an in-progress scan.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| timeoutMs? | `number` | Reading timeout in ms (range 500-20000, default 5000) |

**Returns** `Promise`\<`void`\>

###### cancelBarcode()

> **cancelBarcode**(): `Promise`\<`void`\>


Cancel an in-progress asynchronous barcode read.

Sends 0xFF byte directly to transport (matches C# AccBarcodeCancel).
Note: Requires the reader to be connected.

**Returns** `Promise`\<`void`\>

###### imagerPower()

> **imagerPower**(`on`): `Promise`\<`void`\>


Turn the imager (barcode scanner) power on or off.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| on | `boolean` | Whether to enable imager power. |

**Returns** `Promise`\<`void`\>

###### imagerAim()

> **imagerAim**(`on`): `Promise`\<`void`\>


Turn the imager aiming laser on or off.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| on | `boolean` | Whether to enable the aiming laser. |

**Returns** `Promise`\<`void`\>

###### imagerTrigger()

> **imagerTrigger**(): `Promise`\<`void`\>


Trigger the imager to start scanning.

**Returns** `Promise`\<`void`\>

###### imagerCancel()

> **imagerCancel**(): `Promise`\<`void`\>


Cancel an in-progress imager scan.

**Returns** `Promise`\<`void`\>

###### setWirelessCharging()

> **setWirelessCharging**(`enabled`): `Promise`\<`void`\>


Enable or disable wireless charging.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| enabled | `boolean` | Whether to enable wireless charging. |

**Returns** `Promise`\<`void`\>

###### getWirelessCharging()

> **getWirelessCharging**(): `Promise`\<`boolean`\>


Get current wireless charging status (simple boolean check).

**Returns** `Promise`\<`boolean`\>

###### getWirelessChargeStatus()

> **getWirelessChargeStatus**(): `Promise`\<[`AccWirelessChargeStatus`](#accwirelesschargestatus)\>


Get wireless charging status with detailed result.

Returns AccWirelessChargeStatus enum value:
OFF(0), ON(1), REFUSED(-1), FAIL(-2), NOT_SUPPORTED(-3).

**Returns** `Promise`\<[`AccWirelessChargeStatus`](#accwirelesschargestatus)\>

###### setWirelessCharge()

> **setWirelessCharge**(`isOn`): `Promise`\<[`AccWirelessChargeStatus`](#accwirelesschargestatus)\>


Set wireless charging and return status.

Returns AccWirelessChargeStatus indicating the result.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| isOn | `boolean` | Whether to enable wireless charging. |

**Returns** `Promise`\<[`AccWirelessChargeStatus`](#accwirelesschargestatus)\>

###### getHidMode()

> **getHidMode**(): `Promise`\<[`AccHidMode`](#acchidmode)\>


Get current HID mode via config flags.

**Returns** `Promise`\<[`AccHidMode`](#acchidmode)\>

###### setHidMode()

> **setHidMode**(`mode`): `Promise`\<`void`\>


Set HID mode via config flags.

Reads the current config, modifies the HID flags, and writes back.
Note: USE_PEERMGR (pairing) is managed separately via setPairingMode().

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| mode | [`AccHidMode`](#acchidmode) | HID mode to set. |

**Returns** `Promise`\<`void`\>

###### getPairingMode()

> **getPairingMode**(): `Promise`\<[`PairingMode`](#pairingmode)\>


Get current BLE pairing mode.

**Returns** `Promise`\<[`PairingMode`](#pairingmode)\>

###### setPairingMode()

> **setPairingMode**(`mode`): `Promise`\<`void`\>


Set BLE pairing mode.

Note: Accessory restart required after changing pairing mode.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| mode | [`PairingMode`](#pairingmode) | BLE pairing mode to set. |

**Returns** `Promise`\<`void`\>

###### isDeviceEXA51()

> **isDeviceEXA51**(`config`): `boolean`


Check if device is an EXA51.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| config | [`AccConfig`](#accconfig) | Accessory device configuration object. |

**Returns** `boolean`

###### isDeviceEXA31()

> **isDeviceEXA31**(`config`): `boolean`


Check if device is an EXA31.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| config | [`AccConfig`](#accconfig) | Accessory device configuration object. |

**Returns** `boolean`

###### isDeviceEXA81()

> **isDeviceEXA81**(`config`): `boolean`


Check if device is an EXA81 (has imager, not EXA51 or EXA31).

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| config | [`AccConfig`](#accconfig) | Accessory device configuration object. |

**Returns** `boolean`

###### isDeviceEXA21()

> **isDeviceEXA21**(`config`): `boolean`


Check if device is an EXA21 (no imager).

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| config | [`AccConfig`](#accconfig) | Accessory device configuration object. |

**Returns** `boolean`

###### getDeviceType()

> **getDeviceType**(`config`): `string`


Get device type name from config.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| config | [`AccConfig`](#accconfig) | Accessory device configuration object. |

**Returns** `string` — "EXA21", "EXA31", "EXA51", "EXA81", or "N/A"

###### hasImagerScanner()

> **hasImagerScanner**(`config`): `boolean`


Check if accessory has 1D/2D imager scanner.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| config | [`AccConfig`](#accconfig) | Accessory device configuration object. |

**Returns** `boolean`

###### hasWirelessCharging()

> **hasWirelessCharging**(`config`): `boolean`


Check if accessory has wireless charging.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| config | [`AccConfig`](#accconfig) | Accessory device configuration object. |

**Returns** `boolean`

###### hasVibrator()

> **hasVibrator**(`config`): `boolean`


Check if accessory has built-in vibrator.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| config | [`AccConfig`](#accconfig) | Accessory device configuration object. |

**Returns** `boolean`

###### sensorEnumerate()

> **sensorEnumerate**(): `Promise`\<[`AccSensorConfig`](#accsensorconfig)[]\>


Enumerate all sensors attached to the accessory device.

**Returns** `Promise`\<[`AccSensorConfig`](#accsensorconfig)[]\>

###### sensorGetConfig()

> **sensorGetConfig**(`source`): `Promise`\<[`AccSensorConfig`](#accsensorconfig)\>


Get configuration for a specific sensor.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| source | `number` | Sensor source identifier. |

**Returns** `Promise`\<[`AccSensorConfig`](#accsensorconfig)\>

###### sensorSetConfig()

> **sensorSetConfig**(`source`, `mode`): `Promise`\<[`AccSensorConfig`](#accsensorconfig)\>


Set reporting mode for a specific sensor.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| source | `number` | Sensor source number |
| mode | `number` | Reporting mode bitmask (use AccSensorMode values) |

**Returns** `Promise`\<[`AccSensorConfig`](#accsensorconfig)\>

###### sensorGetFilter()

> **sensorGetFilter**(`source`): `Promise`\<[`AccSensorFilter`](#accsensorfilter)\>


Get filter configuration for a specific sensor.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| source | `number` | Sensor source identifier. |

**Returns** `Promise`\<[`AccSensorFilter`](#accsensorfilter)\>

###### sensorSetFilter()

> **sensorSetFilter**(`source`, `filter`): `Promise`\<[`AccSensorFilter`](#accsensorfilter)\>


Set filter configuration for a specific sensor.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| source | `number` | Sensor source identifier. |
| filter | [`AccSensorFilter`](#accsensorfilter) | Filter configuration to apply. |

**Returns** `Promise`\<[`AccSensorFilter`](#accsensorfilter)\>

###### sensorGetValue()

> **sensorGetValue**(`source`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>


Get the latest value from a sensor.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| source | `number` | Sensor source identifier. |

**Returns** `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\> — Raw sensor value data (format depends on sensor type)

###### sensorGetTypedValue()

> **sensorGetTypedValue**(`source`): `Promise`\<[`AccSensorRangeData`](#accsensorrangedata-1) \| [`AccSensorToFFrBfaRawData`](#accsensortoffrbfarawdata-1)\>


Get the latest typed value from a sensor.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| source | `number` | Sensor source identifier. |

**Returns** `Promise`\<[`AccSensorRangeData`](#accsensorrangedata-1) \| [`AccSensorToFFrBfaRawData`](#accsensortoffrbfarawdata-1)\> — AccSensorRangeData for range sensors, AccSensorToFFrBfaRawData for ToF sensors.

###### sensorGetSettings()

> **sensorGetSettings**(`source`, `type`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>


Get sensor-specific settings.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| source | `number` | Sensor source identifier. |
| type | `number` | Settings type identifier. |

**Returns** `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

###### sensorSetSettings()

> **sensorSetSettings**(`source`, `type`, `data`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>


Set sensor-specific settings.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| source | `number` | Sensor source identifier. |
| type | `number` | Settings type identifier. |
| data | `Uint8Array` | Settings data to write. |

**Returns** `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

***

#### AccConfig


Accessory device configuration.

##### See

 - [NurAccessoryExt.getConfig](#getconfig)
 - [NurAccessoryExt.setConfig](#setconfig)

##### Properties

###### signature

> **signature**: `number`


Configuration signature — pass back unchanged when setting.

###### config

> **config**: `number`


Device configuration flags (ACD, wearable, imager).

###### flags

> **flags**: `number`


Device operation flags (HID barcode, HID RFID, etc.).

###### deviceName

> **deviceName**: `string`


BLE visible device name (max 31 chars).

###### hidBarcodeTimeout

> **hidBarcodeTimeout**: `number`


HID mode barcode scanner read timeout in milliseconds.

###### hidRfidTimeout

> **hidRfidTimeout**: `number`


HID mode RFID read timeout in milliseconds.

###### hidRfidMaxtags

> **hidRfidMaxtags**: `number`


HID mode RFID read max tags.

***

#### AccBatteryInfo


Accessory device battery information.

##### See

[NurAccessoryExt.getBatteryInfo](#getbatteryinfo)

##### Properties

###### charging

> **charging**: `boolean`


Whether the device is currently charging.

###### percentage

> **percentage**: `number`


Battery percentage level (0-100, -1 if unknown).

###### voltage\_mV

> **voltage\_mV**: `number`


Battery voltage level in mV (-1 if unknown).

###### current\_mA

> **current\_mA**: `number`


Current battery current draw in mA.

###### capacity\_mA

> **capacity\_mA**: `number`


Battery capacity in mAh (-1 if unknown).

***

#### AccSensorConfig


Accessory sensor configuration.

##### See

 - [NurAccessoryExt.sensorEnumerate](#sensorenumerate)
 - [NurAccessoryExt.sensorGetConfig](#sensorgetconfig)

##### Properties

###### source

> **source**: `number`


Sensor source number (assigned by reader).

###### type

> **type**: `number`


Sensor type. Use AccSensorType enum values.

###### feature

> **feature**: `number`


Features supported by this sensor (bitmask). Use AccSensorFeature enum values.

###### mode

> **mode**: `number`


Reporting mode bitmask. Use AccSensorMode enum values.

***

#### AccSensorFilter


Accessory sensor filter configuration.

##### See

 - [NurAccessoryExt.sensorGetFilter](#sensorgetfilter)
 - [NurAccessoryExt.sensorSetFilter](#sensorsetfilter)

##### Properties

###### flags

> **flags**: `number`


Enabled filter flags. Use AccSensorFilterFlag enum values.

###### rangeLo

> **rangeLo**: `number`


Range threshold low (mm). Triggers when sensor reads less than this.

###### rangeHi

> **rangeHi**: `number`


Range threshold high (mm). Triggers when sensor reads more than this.

###### timeLo

> **timeLo**: `number`


Time threshold low (ms). Triggers on high-to-low for this duration.

###### timeHi

> **timeHi**: `number`


Time threshold high (ms). Triggers on low-to-high for this duration.

***

#### AccessoryFWInfo


Parsed accessory firmware version information.

##### Properties

###### applicationVersion

> **applicationVersion**: `string`


Application firmware version (digits and dots only).

###### fullAppVersion

> **fullAppVersion**: `string`


Full application version string including details.

###### bootloaderVersion

> **bootloaderVersion**: `string`


Bootloader version string.

***

#### AccBarcodeResult


Barcode scan result from accessory notification.

##### Properties

###### status

> **status**: `number`


Status of the barcode read operation.

###### barcode

> **barcode**: `string`


Decoded barcode string (empty if status is not SUCCESS).

***

#### AccSensorChanged


Accessory sensor changed notification data.

##### Properties

###### source

> **source**: `number`


Sensor source identifier.

###### removed

> **removed**: `boolean`


True if sensor was removed, false if added.

***

#### AccSensorRangeData


Accessory range sensor data.

##### Properties

###### source

> **source**: `number`


Sensor source identifier.

###### range

> **range**: `number`


Range reading in millimeters.

***

#### AccSensorToFFrBfaRawDataItem


Single item from a ToF FR BFA sensor array reading.

##### Properties

###### distCm

> **distCm**: `number`


Distance in centimeters (12-bit value).

###### status

> **status**: `number`


Measurement validity status (4-bit value).
5 = Range valid, 6 = Wrap around not performed, 9 = Range valid with large pulse.
Status 6 or 9 has ~50% confidence. Others are below 50%.

***

#### AccSensorToFFrBfaRawData


ToF FR BFA raw sensor data (16-element array).

##### Properties

###### source

> **source**: `number`


Sensor source identifier.

###### items

> **items**: [`AccSensorToFFrBfaRawDataItem`](#accsensortoffrbfarawdataitem)[]


Array of 16 ToF sensor readings.

### Gen2v2

#### Gen2v2SubCmd


GEN2V2 sub-command IDs.

##### Enumeration Members

###### AUTH

> **AUTH**: `213`


###### UNTRACE

> **UNTRACE**: `57856`


###### RDBUF

> **RDBUF**: `210`


***

#### Gen2v2Flags


GEN2V2 sub-command header flags.

##### Enumeration Members

###### RX\_ATTN

> **RX\_ATTN**: `1`


Request attenuation on RX.

###### RESELECT

> **RESELECT**: `2`


Re-select tag before command.

***

#### Gen2v2TidOp


TID hide operation for Untraceable.

##### Enumeration Members

###### HIDE\_NONE

> **HIDE\_NONE**: `0`


###### HIDE\_SOME

> **HIDE\_SOME**: `1`


###### HIDE\_ALL

> **HIDE\_ALL**: `2`


***

#### Gen2v2RangeOp


Range operation for Untraceable.

##### Enumeration Members

###### NORMAL

> **NORMAL**: `0`


###### TOGGLE

> **TOGGLE**: `1`


###### REDUCE

> **REDUCE**: `2`


***

#### Gen2v2AuthStatus


Authenticate response status codes.

##### Enumeration Members

###### OK

> **OK**: `0`


###### NO\_RESPONSE

> **NO\_RESPONSE**: `1`


###### TAG\_ERROR

> **TAG\_ERROR**: `2`


###### BUFFER\_ERROR

> **BUFFER\_ERROR**: `3`


***

#### Gen2v2AuthParams


Parameters for GEN2V2 Authenticate.

##### Properties

###### password?

> `optional` **password?**: `number`


Access password. Omit or 0 for unsecured.

###### singulation?

> `optional` **singulation?**: [`Singulation`](#singulation-13)


Full singulation parameters (mutually exclusive with epc).

###### epc?

> `optional` **epc?**: `Uint8Array`\<`ArrayBufferLike`\>


EPC for tag singulation (shortcut — mutually exclusive with singulation).

###### csi

> **csi**: `number`


Cryptographic Suite Indicator.

###### rxLengthBits?

> `optional` **rxLengthBits?**: `number`


Expected RX bit length (0 if unknown).

###### rxAttn?

> `optional` **rxAttn?**: `boolean`


Request attenuation on RX.

###### reSelect?

> `optional` **reSelect?**: `boolean`


Re-select tag before command.

###### timeout?

> `optional` **timeout?**: `number`


Response timeout ms (20–50). Default 25.

###### preTxWait?

> `optional` **preTxWait?**: `number`


Pre-TX wait microseconds (0–50000). Default 0.

###### message

> **message**: `Uint8Array`


Message data bytes.

###### messageBitLength

> **messageBitLength**: `number`


Message length in bits.

***

#### Gen2v2AuthResult


Result from GEN2V2 Authenticate.

##### Properties

###### status

> **status**: [`Gen2v2AuthStatus`](#gen2v2authstatus)


Response status.

###### tagBitLength

> **tagBitLength**: `number`


Tag-reported bit length.

###### actualBitLength

> **actualBitLength**: `number`


Actual received bit length.

###### data

> **data**: `Uint8Array`


Response data bytes.

***

#### Gen2v2ReadBufferParams


Parameters for GEN2V2 ReadBuffer.

##### Properties

###### password?

> `optional` **password?**: `number`


Access password. Omit or 0 for unsecured.

###### singulation?

> `optional` **singulation?**: [`Singulation`](#singulation-13)


Full singulation parameters (mutually exclusive with epc).

###### epc?

> `optional` **epc?**: `Uint8Array`\<`ArrayBufferLike`\>


EPC for tag singulation (shortcut — mutually exclusive with singulation).

###### bitAddress

> **bitAddress**: `number`


Bit address in tag buffer (0–MAX_RDBUF_ADDR).

###### bitCount

> **bitCount**: `number`


Number of bits to read.

###### timeout?

> `optional` **timeout?**: `number`


Timeout ms. Default 25.

***

#### Gen2v2ReadBufferResult


Result from GEN2V2 ReadBuffer.

##### Properties

###### bitLength

> **bitLength**: `number`


Number of bits in data.

###### data

> **data**: `Uint8Array`


Data bytes (ceil(bitLength/8)).

***

#### Gen2v2UntraceableParams


Parameters for GEN2V2 Untraceable.

##### Properties

###### password

> **password**: `number`


Access password (required for Untraceable).

###### singulation?

> `optional` **singulation?**: [`Singulation`](#singulation-13)


Full singulation parameters (mutually exclusive with epc).

###### epc?

> `optional` **epc?**: `Uint8Array`\<`ArrayBufferLike`\>


EPC for tag singulation (shortcut — mutually exclusive with singulation).

###### rxAttn?

> `optional` **rxAttn?**: `boolean`


Request attenuation on RX.

###### assertU

> **assertU**: `boolean`


Assert U bit in XPC_W1 (true=assert, false=de-assert).

###### hideEpc

> **hideEpc**: `boolean`


Hide EPC (true=hide).

###### epcWordLength?

> `optional` **epcWordLength?**: `number`


New EPC word length (PC L-bits). Default 0.

###### tidOp

> **tidOp**: [`Gen2v2TidOp`](#gen2v2tidop)


TID hide operation.

###### hideUser

> **hideUser**: `boolean`


Hide User memory (true=hide).

###### rangeOp

> **rangeOp**: [`Gen2v2RangeOp`](#gen2v2rangeop)


Range operation.

***

#### TamMemoryProfile


TAM Memory Profile Indicator — selects which memory bank to read in TAM2.

##### Enumeration Members

###### EPC

> **EPC**: `0`


###### TID

> **TID**: `1`


###### USER

> **USER**: `2`


***

#### Tam1Params


Parameters for TAM1 (simple authentication, no custom data).

##### Properties

###### keyNum

> **keyNum**: `number`


Key number to use (0-255).

###### key?

> `optional` **key?**: `Uint8Array`\<`ArrayBufferLike`\>


16-byte AES-128 key. If provided, response is decrypted and validated.

###### singulation?

> `optional` **singulation?**: [`Singulation`](#singulation-13)


Full singulation parameters (mutually exclusive with epc).

###### epc?

> `optional` **epc?**: `Uint8Array`\<`ArrayBufferLike`\>


EPC for tag singulation (shortcut — mutually exclusive with singulation).

***

#### Tam2Params


Parameters for TAM2 (authentication with custom data).

##### Properties

###### keyNum

> **keyNum**: `number`


Key number to use (0-255).

###### key?

> `optional` **key?**: `Uint8Array`\<`ArrayBufferLike`\>


16-byte AES-128 key. If provided, response is decrypted and validated.

###### mpi

> **mpi**: `number`


Memory Profile Indicator: 0=EPC, 1=TID, 2=user memory (0-15).

###### offset

> **offset**: `number`


Block offset in memory (0-0xFFF).

###### blockCount

> **blockCount**: `number`


Number of custom data blocks to read (1-4).

###### protMode

> **protMode**: `number`


Encipherment protection mode (0-15).

###### singulation?

> `optional` **singulation?**: [`Singulation`](#singulation-13)


Full singulation parameters (mutually exclusive with epc).

###### epc?

> `optional` **epc?**: `Uint8Array`\<`ArrayBufferLike`\>


EPC for tag singulation (shortcut — mutually exclusive with singulation).

***

#### TamResult


Result from TAM1 or TAM2 authentication.

##### Properties

###### response

> **response**: `boolean`


Whether the tag responded at all.

###### ok

> **ok**: `boolean`


Whether decryption succeeded and C_TAM + challenge were valid.

###### cTam

> **cTam**: `number`


The 16-bit C_TAM constant from decrypted first block (should be 0x96C5).

###### tRnd32

> **tRnd32**: `number`


The 32-bit tag random value from decrypted first block.

###### firstBlock

> **firstBlock**: `Uint8Array`


Decrypted (or raw) first 16 bytes of response.

###### blockData

> **blockData**: `Uint8Array`


Custom data blocks (TAM2 only, empty for TAM1).

###### cmac

> **cmac**: `Uint8Array`


CMAC data for protection modes 2/3 (empty if not applicable).

###### challenge

> **challenge**: `Uint8Array`


The challenge that was sent to the tag.

***

#### NurGen2v2


Gen2 Version 2 extension API for advanced tag security and privacy.

Wraps a [NurApi](#nurapi) instance and provides methods for Gen2v2 operations:
Authenticate, ReadBuffer, and Untraceable.

##### Example

```typescript
const reader = new NurApi();
const gen2v2 = new NurGen2v2(reader);
await reader.connect('tcp://192.168.1.100');
const result = await gen2v2.authenticate({
  csi: 1,
  message: new Uint8Array([0x01]),
  messageBitLength: 8,
});
```

##### Constructors

###### Constructor

> **new NurGen2v2**(`api`): [`NurGen2v2`](#nurgen2v2)


Create a new Gen2v2 extension instance.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| api | [`NurApi`](#nurapi) | NurApi instance. |

**Returns** [`NurGen2v2`](#nurgen2v2)

##### Methods

###### authenticate()

> **authenticate**(`params`): `Promise`\<[`Gen2v2AuthResult`](#gen2v2authresult)\>


Perform Gen2v2 Authenticate command.

Sends a cryptographic challenge to the tag and receives its response.
The authentication protocol and message format depend on the Cryptographic
Suite Indicator (CSI).

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params | [`Gen2v2AuthParams`](#gen2v2authparams) | Authentication parameters (CSI, message, singulation, etc.) |

**Returns** `Promise`\<[`Gen2v2AuthResult`](#gen2v2authresult)\> — Authentication result with status and tag response data

###### readBuffer()

> **readBuffer**(`params`): `Promise`\<[`Gen2v2ReadBufferResult`](#gen2v2readbufferresult)\>


Read data from the tag's internal response buffer.

Used after Authenticate or other commands that leave data in the tag's
buffer. Reads a range of bits from the specified address.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params | [`Gen2v2ReadBufferParams`](#gen2v2readbufferparams) | ReadBuffer parameters (bitAddress, bitCount, singulation) |

**Returns** `Promise`\<[`Gen2v2ReadBufferResult`](#gen2v2readbufferresult)\> — Buffer contents with actual bit length

###### untraceable()

> **untraceable**(`params`): `Promise`\<`void`\>


Configure tag privacy using the Gen2v2 Untraceable command.

Controls what information the tag reveals: EPC visibility, TID hiding,
user memory hiding, and range reduction. Always requires an access password.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params | [`Gen2v2UntraceableParams`](#gen2v2untraceableparams) | Untraceable parameters (password, hide options, range policy) |

**Returns** `Promise`\<`void`\>

###### tam1()

> **tam1**(`params`): `Promise`\<[`TamResult`](#tamresult)\>


Perform ISO 29167-10 Tag Authentication Method 1 (TAM1).

TAM1 is a simple challenge-response authentication: a random challenge is
sent to the tag, which encrypts it with its internal AES key. If a key is
provided, the response is decrypted and the C_TAM constant (0x96C5) and
challenge echo are validated.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params | [`Tam1Params`](#tam1params) | TAM1 parameters (keyNum, optional key for decryption, singulation) |

**Returns** `Promise`\<[`TamResult`](#tamresult)\> — TAM result with authentication status and decrypted data

###### Example

```typescript
// Simple authentication check (decrypted locally)
const result = await gen2v2.tam1({
  keyNum: 0,
  key: new Uint8Array(16), // AES-128 key
});
console.log(`Authenticated: ${result.ok}`);

// Raw response (no local decryption)
const raw = await gen2v2.tam1({ keyNum: 0 });
console.log(`Tag responded: ${raw.response}`);
```

###### tam2()

> **tam2**(`params`): `Promise`\<[`TamResult`](#tamresult)\>


Perform ISO 29167-10 Tag Authentication Method 2 (TAM2).

TAM2 extends TAM1 with custom data retrieval: in addition to
authentication, the tag returns encrypted blocks from the specified
memory region (EPC, TID, or user memory).

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| params | [`Tam2Params`](#tam2params) | TAM2 parameters (keyNum, key, mpi, offset, blockCount, protMode, singulation) |

**Returns** `Promise`\<[`TamResult`](#tamresult)\> — TAM result with authentication status, decrypted first block, and custom data

###### Example

```typescript
const result = await gen2v2.tam2({
  keyNum: 0,
  key: new Uint8Array(16),
  mpi: TamMemoryProfile.TID,
  offset: 0,
  blockCount: 2,
  protMode: 0,
});
if (result.ok) {
  console.log(`TID data: ${result.blockData}`);
}
```

### Logging

#### LogLevel

> **LogLevel** = `"error"` \| `"warning"` \| `"info"` \| `"verbose"`


Log severity levels, ordered from most to least severe.

***

#### LogEntry


A single log entry emitted by the library.

##### Properties

###### level

> **level**: [`LogLevel`](#loglevel-2)


Severity level.

###### message

> **message**: `string`


Human-readable message.

###### context?

> `optional` **context?**: `Record`\<`string`, `unknown`\>


Optional structured context (e.g., `{ cmd: 0x01, timeout: 3000 }`).

***

#### Logger


Lightweight logger with level-based filtering.

Messages at or below the configured level are forwarded to `onLog`.
By default only `'error'` messages pass the filter.

##### Accessors

###### level

###### Get Signature

> **get** **level**(): [`LogLevel`](#loglevel-2)


Current minimum log level. Messages above this severity are suppressed.

**Returns** [`LogLevel`](#loglevel-2)

###### Set Signature

> **set** **level**(`value`): `void`


**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| value | [`LogLevel`](#loglevel-2) | New minimum log level. |

**Returns** `void`

##### Constructors

###### Constructor

> **new Logger**(): [`Logger`](#logger)

**Returns** [`Logger`](#logger)

##### Methods

###### shouldLog()

> **shouldLog**(`level`): `boolean`


Returns true if a message at `level` would pass the current filter.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| level | [`LogLevel`](#loglevel-2) | Severity level to test. |

**Returns** `boolean`

###### log()

> **log**(`level`, `message`, `context?`): `void`


Emit a log entry if it passes the level filter.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| level | [`LogLevel`](#loglevel-2) | Severity level. |
| message | `string` | Human-readable message. |
| context? | `Record`\<`string`, `unknown`\> | Optional structured data. |

**Returns** `void`

###### error()

> **error**(`message`, `context?`): `void`


Log an error-level message.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| message | `string` | Human-readable message. |
| context? | `Record`\<`string`, `unknown`\> | Optional structured data. |

**Returns** `void`

###### warning()

> **warning**(`message`, `context?`): `void`


Log a warning-level message.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| message | `string` | Human-readable message. |
| context? | `Record`\<`string`, `unknown`\> | Optional structured data. |

**Returns** `void`

###### info()

> **info**(`message`, `context?`): `void`


Log an info-level message.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| message | `string` | Human-readable message. |
| context? | `Record`\<`string`, `unknown`\> | Optional structured data. |

**Returns** `void`

###### verbose()

> **verbose**(`message`, `context?`): `void`


Log a verbose-level message.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| message | `string` | Human-readable message. |
| context? | `Record`\<`string`, `unknown`\> | Optional structured data. |

**Returns** `void`

##### Properties

###### onLog

> **onLog**: ((`entry`) => `void`) \| `null` = `null`


Callback invoked for every message that passes the level filter.
Set by NurApi to bridge into the event system.
