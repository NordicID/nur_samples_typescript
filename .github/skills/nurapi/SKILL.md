---
name: nurapi
description: "NUR RFID reader API reference and patterns. Use when: implementing NurApi operations, connecting to readers, running inventories, reading/writing tags, configuring reader settings, handling NUR events, using Gen2X or Gen2v2 features, filtering inventory, tag authentication."
argument-hint: "Describe what NurApi operation you need (e.g., 'read TID memory from a specific tag')"
---

# NurApi Operations

Reference skill for working with `@nordicid/nurapi`, `@nordicid/nurapi-web`, and `@nordicid/nurapi-node` in this project.

## When to Use

- Implementing any NUR reader operation (connect, inventory, read, write, configure)
- Adding new features that interact with the reader
- Debugging NurApi errors or connection issues
- Working with Gen2X, Gen2v2, or TAM features

## Quick Reference

Full API docs: [docs/nurapi.api.md](../../../docs/nurapi.api.md), [docs/nurapi-web.api.md](../../../docs/nurapi-web.api.md), and [docs/nurapi-node.api.md](../../../docs/nurapi-node.api.md). Consult these for complete type signatures, enums, and advanced features.

Online docs: https://nordicid.github.io/nur_nurapi_typescript/

## Project Setup

This is a **monorepo** with two sample packages:

- **example-web**: Browser transports (`@nordicid/nurapi-web`) — Web Serial, Web Bluetooth
- **example-node**: Node.js transports (`@nordicid/nurapi-node`) — serialport, TCP

Packages are installed from npm (`latest`). API docs are in `docs/` at the repo root.

### Web (browser)

```typescript
// Side-effect import registers ser:// and ble:// schemes
import '@nordicid/nurapi-web';
import { NurApi } from '@nordicid/nurapi';
import type { StoredTag, DeviceCaps } from '@nordicid/nurapi'; // type-only imports
```

### Node.js

```typescript
// Side-effect import registers ser:// and tcp:// schemes
import '@nordicid/nurapi-node';
import { NurApi } from '@nordicid/nurapi';
```

The `NurApi` instance is a **singleton** — created once in entry points, stored via `setApi()` in state, retrieved via `getApi()`.

**Never create a second `NurApi` instance.** Always use `getApi()`:

```typescript
import { getApi } from '../state';
const api = getApi();
```

## Connection Patterns

### URI Schemes (browser)

| Scheme | Transport | Notes |
|---|---|---|
| `ser://request` | Web Serial | Browser port picker. Requires user gesture. |
| `ble://request` | Web Bluetooth | Browser device picker. Requires user gesture + HTTPS. |
| `ws://host:port` / `wss://` | WebSocket | Built into core. No gesture needed. |

### URI Schemes (Node.js)

| Scheme | Transport | Notes |
|---|---|---|
| `ser:///dev/ttyUSB0` | serialport | Direct path. Auto-detected baud. |
| `ser://request` | serialport | Interactive picker (if supported). |
| `tcp://host:port` | TCP socket | Raw NUR protocol over TCP. |
| `ws://host:port` / `wss://` | WebSocket | Built into core. |

### Feature Detection (browser)

```typescript
import { isWebSerialSupported, isWebBluetoothSupported } from '@nordicid/nurapi-web';
```

### Connection Events

```typescript
api.on('connecting',    () => { /* ... */ });
api.on('connected',     () => { /* ... */ });
api.on('disconnected',  () => { /* ... */ });
```

Auto-reconnect is enabled by default. Explicit `disconnect()` stops it.

## Inventory

### Simple (single-shot)

```typescript
await api.clearTags();
const result = await api.inventory();          // uses global setup
const tags = await api.fetchTags();
for (const tag of tags) {
  console.log(`${tag.epcHex}  RSSI: ${tag.rssi}  Ant: ${tag.antennaId}`);
}
```

### Streaming (continuous)

```typescript
api.on('inventoryStream', (event) => {
  const allTags = api.tagStorage.toArray();
  if (event.stopped) api.startInventoryStream();  // restart on pause
});
await api.startInventoryStream();

// Stop:
await api.stopInventoryStream();
```

### Advanced with Filters (`inventoryEx`)

```typescript
import { NurBank, NurFilterAction, NurInventoryTarget, NurInventorySelState } from '@nordicid/nurapi';

const result = await api.inventoryEx({
  Q: 0,               // 0 = auto
  session: 0,
  rounds: 0,          // 0 = auto
  inventoryTarget: NurInventoryTarget.A,
  inventorySelState: NurInventorySelState.SL,
  filters: [{
    target: 4,         // SL flag
    action: NurFilterAction.FACTION_0,
    bank: NurBank.EPC,
    address: 32,       // bits! First 32 bits = CRC+PC
    maskBitLen: 32,
    maskData: new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD]),
  }],
});
```

**Key gotcha**: Filter `address` is in **bits**, not bytes. EPC content starts at bit 32 (after CRC+PC).

## Tag Memory Access

### Memory Banks

| Bank | Enum | Contents |
|---|---|---|
| Reserved | `NurBank.PASSWD` (0) | Kill + access passwords |
| EPC | `NurBank.EPC` (1) | CRC, PC, EPC data |
| TID | `NurBank.TID` (2) | Tag ID (usually read-only) |
| User | `NurBank.USER` (3) | User-defined memory |

### Read

```typescript
import { NurBank } from '@nordicid/nurapi';

// Read 4 words from TID bank
const tid = await api.readTag({ bank: NurBank.TID, address: 0, wordCount: 4 });

// Read singulated by EPC
const data = await api.readTag({
  bank: NurBank.USER, address: 0, wordCount: 8,
  epc: new Uint8Array([0xE2, 0x00, ...]),
});
```

### Write

```typescript
await api.writeTag({
  bank: NurBank.USER, address: 0,
  data: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
  epc: targetEpc,  // optional singulation
});
```

### Write EPC

```typescript
await api.writeEpc({ currentEpc: oldEpc, newEpc: newEpcBytes });
```

## Reader Configuration

Read-modify-write pattern:

```typescript
const setup = await api.getModuleSetup();
await api.setModuleSetup({
  txLevel: 0,            // 0 = max power (attenuation index)
  inventoryQ: 4,
  inventorySession: 0,
  rfProfile: 1,          // 0=ROBUST, 1=NOMINAL, 2=HIGHSPEED
  antennaMaskEx: 0x03,   // bitmask: bit 0 = antenna 1
  selectedAntenna: -1,   // -1 = auto (round-robin)
});
await api.storeSetup();  // persist to flash (optional)
```

## Error Handling

```typescript
import { NurApiError, NurError } from '@nordicid/nurapi';

try {
  await api.readTag({ bank: NurBank.TID, address: 0, wordCount: 4 });
} catch (e) {
  if (e instanceof NurApiError) {
    if (e.code === NurError.NO_TAG) { /* no tag in field */ }
    else if (e.code === NurError.G2_READ) { /* read failed */ }
  }
}
```
