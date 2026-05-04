# @nordicid/example-web

Browser demo application for the `@nordicid/nurapi` RFID reader library. Demonstrates all three transports (Web Serial, Web Bluetooth, WebSocket) and core RFID operations using vanilla TypeScript — no framework required.

## Prerequisites

- **Chrome or Edge** (Chromium-based) — Web Serial and Web Bluetooth are not available in Firefox/Safari
- **Nordic ID NUR RFID reader** connected via USB, Bluetooth LE, or a WebSocket bridge
- Node.js 18+ (for the dev server)

## Quick Start

From the monorepo root:

```bash
npm install
npm run dev --workspace=packages/example-web
```

Or from this directory:

```bash
npm run dev
```

The app opens at **http://localhost:5173**.

## Connecting to a Reader

The **Connect** panel offers three transport options:

| Transport | URI | Notes |
|---|---|---|
| **Web Serial** | `ser://request?baudrate=115200` | USB-connected reader. Opens the browser port picker on click. |
| **Web Bluetooth** | `ble://request` | BLE-capable reader. Opens the device chooser on click. |
| **WebSocket** | `wss://192.168.1.100/wsp/4333` | Reader with WebSocket gateway or a TCP-to-WS bridge. |

Web Serial and Web Bluetooth require a **user gesture** (button click) — the connect call must originate from a click handler. The app handles this correctly; just click the Connect button.

The default WebSocket port `4333` matches the NUR reader's standard TCP port. If your reader is on another host, change the URL in the input field (e.g., `ws://192.168.1.100:4333`).

## UI Panels

### Connection
Select a transport, configure options (baud rate, URL), and connect or disconnect. The status bar at the top shows connection state and reader name.

### Reader Info
Auto-populates on connect with reader name, serial number, firmware version, hardware version, antenna count, GPIO count, regions, max TX power, and tag buffer size. Includes **Ping** (with latency), **Beep**, and **Refresh** buttons.

### Inventory
- **Single Inventory** — runs one inventory round and displays results
- **Start/Stop Stream** — continuous streaming inventory with auto-restart when the reader completes a round
- **Clear Tags** — clears the tag table and reader's tag buffer
- Configurable **Q**, **Session**, and **Rounds** parameters
- Tag table with EPC, RSSI, signal bar, antenna, seen count, and last-updated timestamp
- Efficient DOM updates using `Map`-based row diffing and `requestAnimationFrame` throttling

### Tag Operations
- **Scan Single** — find one tag with configurable timeout
- **Read Memory** — read from any memory bank (Reserved, EPC, TID, User) at a specific word address
- **Write Memory** — write hex data to a memory bank with confirmation dialog and word-alignment validation
- Optional EPC filter for targeted read/write

### GPIO
Displays GPIO pin states (HIGH/LOW) with toggle buttons for output pins. Updates in real time via `ioChange` events.

### Event Log
Scrollable, filterable log of all NUR reader events. Filter by category (Connection, Inventory, IO, Boot, Debug, Other), toggle auto-scroll, and clear. Capped at 500 entries.

## Key API Patterns

This app demonstrates the recommended usage of `@nordicid/nurapi`:

```typescript
// 1. Side-effect import registers browser transports
import '@nordicid/nurapi-web';

// 2. Create the API instance
import { NurApi } from '@nordicid/nurapi';
const api = new NurApi();

// 3. Connect using a URI — transport is resolved automatically
await api.connect('wss://192.168.1.100/wsp/4333');

// 4. Subscribe to typed events
api.on('connected', () => console.log('Connected!'));
api.on('inventoryStream', (event) => {
  console.log(`${event.tags.length} tags, stopped=${event.stopped}`);
});

// 5. Run commands
const info = await api.getReaderInfo();
const result = await api.inventory();
const tags = await api.fetchTags(true);

// 6. Streaming with auto-restart
await api.startInventoryStream({ Q: 4, session: 1, rounds: 5 });
api.on('inventoryStream', (event) => {
  // Tags are automatically accumulated in api.tagStorage
  const allTags = api.tagStorage.toArray();

  // Restart when the reader stops (app's responsibility)
  if (event.stopped) {
    api.startInventoryStream();
  }
});

// 7. Tag memory operations
const data = await api.readTag({ bank: 2, address: 0, wordCount: 6 }); // Read TID
await api.writeTag({ bank: 3, address: 0, data: new Uint8Array([0xAA, 0xBB]) }); // Write USER

// 8. Disconnect
await api.disconnect();
```

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server on port 5173 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build |

## Project Structure

```
src/
├── main.ts             Entry point: create NurApi, wire status bar, init panels
├── state.ts            Shared NurApi instance accessor
├── helpers.ts          DOM utilities, hex formatting, time helpers
├── style.css           All styles (~515 lines): CSS grid, variables, responsive
└── ui/
    ├── connection.ts   Transport selection and disconnect
    ├── reader-info.ts  Reader identification and capabilities
    ├── inventory.ts    Single + streaming inventory with tag table
    ├── tag-ops.ts      Scan, read memory, write memory
    ├── event-log.ts    Filterable event log with auto-scroll
    ├── gpio.ts         GPIO pin states and toggle controls
    └── toast.ts        Non-blocking toast notifications
```

## Browser Compatibility

| Feature | Chrome | Edge | Firefox | Safari |
|---|---|---|---|---|
| WebSocket | Yes | Yes | Yes | Yes |
| Web Serial | Yes | Yes | No | No |
| Web Bluetooth | Yes | Yes | No | No |

The app detects available transports at startup and disables unsupported options with an explanatory message. WebSocket works in all modern browsers.
