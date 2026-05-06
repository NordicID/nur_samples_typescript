# NUR API TypeScript — Samples

Sample applications for the [`@nordicid/nurapi`](https://nordicid.github.io/nur_nurapi_typescript) TypeScript library, showing how to connect to [Nordic ID](https://www.nordicid.com/) NUR UHF RFID readers and perform common operations — inventory, tag read/write, GPIO, and more.

## What's Inside

| Package | Description |
|---|---|
| **[example-web](packages/example-web)** | Browser app (Chromium) — connects via Web Serial, Web Bluetooth, or WebSocket |
| **[example-node](packages/example-node)** | Node.js console app — connects via USB serial, TCP, or WebSocket with interactive REPL |

Both samples demonstrate the same core workflow:

1. **Connect** to a reader using a URI scheme (`ser://`, `ble://`, `tcp://`, `ws://`)
2. **Read device info** — firmware version, capabilities, antenna configuration
3. **Run inventory** — single-shot or continuous streaming to discover tags in the field
4. **Read/write tag memory** — access EPC, TID, User, and Reserved memory banks
5. **Disconnect** cleanly

## Prerequisites

- **Node.js 18+**
- **Nordic ID NUR RFID reader** (e.g. FR22, Stix, EXA51e, EXA21, HH85, or any NUR-based module)
- For the web sample: **Chrome or Edge** (Web Serial / Web Bluetooth require Chromium)

## Quick Start

```bash
npm install

# Browser sample — opens at http://localhost:5173
npm run dev:web

# Node.js console demo
npm run demo:node
```

## NurApi Documentation

The API packages and full documentation are published at:\
**https://nordicid.github.io/nur_nurapi_typescript/**

Local copies of the API reference are included in [`nurapi/`](nurapi/) for offline use and AI assistant integration:

| File | Contents |
|---|---|
| [`nurapi.api.md`](nurapi/nurapi.api.md) | Core API — `NurApi` class, types, enums, events |
| [`nurapi-web.api.md`](nurapi/nurapi-web.api.md) | Browser transports — Web Serial, Web Bluetooth |
| [`nurapi-node.api.md`](nurapi/nurapi-node.api.md) | Node.js transports — serialport, TCP |

### Key Concepts

```typescript
import '@nordicid/nurapi-web';               // registers browser transports (side-effect)
import { NurApi } from '@nordicid/nurapi';

const api = new NurApi();
await api.connect('ser://request');           // opens browser port picker

const result = await api.inventory();         // scan for tags
const tags = await api.fetchTags();           // retrieve found tags
for (const tag of tags) {
  console.log(tag.epcHex, tag.rssi);          // E200... -45
}

await api.disconnect();
```

### Updating Packages

Use the [update-nurapi](.github/prompts/update-nurapi.prompt.md) prompt to upgrade `@nordicid/nurapi` packages and API docs to the latest version.

## Project Structure

```
nurapi/                  ← NurApi packages (.tgz) and API docs (.api.md)
packages/
  example-web/           ← Browser sample (Vite + vanilla TypeScript)
    src/
      main.ts            ← Entry point — creates NurApi, wires events
      state.ts           ← Shared NurApi singleton (getApi/setApi)
      ui/                ← UI panels (connection, inventory, tag-ops, …)
  example-node/          ← Node.js sample (tsx)
    src/
      demo.ts            ← Entry point — discovery, demo, REPL modes
      utils.ts           ← Console output helpers and demo logic
```

## License

MIT — see [LICENSE](LICENSE).
