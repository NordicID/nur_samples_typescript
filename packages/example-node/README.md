# @nordicid/example-node

Node.js console demo for the `@nordicid/nurapi` RFID reader library. Supports device discovery, automated demo sequences, and an interactive REPL.

## Prerequisites

- **Node.js 18+**
- **Nordic ID NUR RFID reader** connected via USB serial, TCP network, or WebSocket bridge

## Quick Start

Install dependencies once from the repo root:

```bash
npm install
```

Run from the **repo root** using workspace scripts:

```bash
# Discover readers automatically
npm run demo:node

# Connect directly with a URI
npm run demo:node -- ser://COM3
npm run demo:node -- tcp://192.168.1.100:4333
npm run demo:node -- wss://192.168.1.100/wsp/4333

# Interactive REPL mode
npm run demo:node:i -- ser://COM3
npm run demo:node:i -- tcp://192.168.1.100
```

Or from **inside this package** (`packages/example-node/`):

```bash
npm start                              # discover
npm start -- ser://COM3                # connect & run demo
npm start -- tcp://192.168.1.100 -i    # interactive REPL

# Or invoke tsx directly
npx tsx src/demo.ts ser://COM3
npx tsx src/demo.ts tcp://192.168.1.100 -i
```

## Usage

### Device Discovery (no arguments)

When run without a URI, the demo scans for NUR readers on serial ports (by VID/PID) and the local network (via mDNS). Discovered devices are listed as they appear:

```
NUR Device Discovery
Scanning for NUR readers... (press Ctrl+C to cancel)

  [1] COM3 (Nordic ID)  ser://COM3
  [2] EXA51234           tcp://192.168.1.10:4333

Enter number to connect, or type a URI directly:
```

Type a number to connect to that device, or type a full URI.

### Automated Demo Sequence (default)

Connects and runs a standard sequence:

1. **Ping** with latency measurement
2. **Reader info** — name, serial, firmware, hardware, antennas, capabilities
3. **Single inventory** — one round, display found tags
4. **Streaming inventory** — 5 seconds of continuous reading with auto-restart
5. **Read TID** — read Tag ID memory of the first found tag
6. **Disconnect**

### Interactive REPL (`-i` / `--interactive`)

Full command-line interface for ad-hoc reader operations.

| Command | Description |
|---|---|
| `ping` | Ping the reader with latency |
| `info` | Display reader information |
| `inventory` / `inv` | Single inventory round |
| `stream start` | Start continuous inventory |
| `stream stop` | Stop streaming |
| `tags` | Show accumulated tags |
| `clear` | Clear tag storage |
| `read <bank> <addr> <words> [epc]` | Read tag memory |
| `scan [timeout]` | Scan for single tag |
| `setup` | Show module setup (RF profile, antenna, Q, session, target, rounds) |
| `beep` | Beep the reader |
| `help` | Show commands |
| `quit` / `exit` | Disconnect and exit |

## URI Schemes

| Scheme | Transport | Example |
|---|---|---|
| `ser://` | USB Serial | `ser://COM3?baudrate=115200` |
| `tcp://` | TCP Socket | `tcp://192.168.1.100:4333` |
| `ws://` | WebSocket | `ws://localhost:4333` |
| `wss://` | WebSocket (TLS) | `wss://192.168.1.100/wsp/4333` |

## Project Structure

```
src/
├── demo.ts       Unified entry point — discovery, demo, or interactive
└── utils.ts      Shared: colors, formatting, reader info, demo harness, REPL
```
