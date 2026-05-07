# NUR API TypeScript Samples — Agent Guidelines

Monorepo with two sample apps for Nordic ID NUR RFID readers. Vanilla TypeScript, no framework.

## Build & Run

```bash
npm install
npm run dev:web       # Browser sample (Chromium) → http://localhost:5173
npm run demo:node     # Node.js console demo
npm run build         # Build all packages
```

No test framework. No linter. TypeScript strict mode is the primary safety net.

## Architecture

- **Monorepo**: npm workspaces with `packages/example-web` and `packages/example-node`
- **example-web**: Single-page app, vanilla TypeScript, direct DOM manipulation, Vite bundler
- **example-node**: Console app with interactive REPL, runs via `tsx`
- **State**: Pure getter/setter module in `src/state.ts` — no reactivity
- **NurApi singleton**: Created once in entry point, stored via `setApi()`/`getApi()`
- **API docs**: See [docs/nurapi.api.md](docs/nurapi.api.md), [docs/nurapi-web.api.md](docs/nurapi-web.api.md), and [docs/nurapi-node.api.md](docs/nurapi-node.api.md)

## Code Style

### Naming
- Functions: `camelCase` — `initInventory`, `formatHex`, `printTag`
- Types/interfaces: `PascalCase` — `StoredTag`, `DeviceCaps`
- Constants: `UPPER_SNAKE_CASE`
- CSS classes: `kebab-case` — `.tag-table`, `.status-bar`

### Imports
- Order: npm packages → `@nordicid/*` → relative paths
- Use `import type` for type-only imports
- Side-effect imports on their own line (e.g., `import '@nordicid/nurapi-web'`)

### TypeScript
- Strict mode with `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
- Target: ES2020. Module resolution: `bundler`

## UI Module Pattern (example-web)

Each panel lives in `src/ui/<name>.ts` and follows this structure:
1. Export an `init<Panel>()` function called once from `main.ts`
2. Build DOM elements using helpers from `src/helpers.ts`: `$()` (query), `el()` (create element), `btn()` (create button)
3. Subscribe to NurApi events for live updates — no reactivity layer
4. Use `requestAnimationFrame` throttling for high-frequency updates (e.g., inventory streaming)

## Error Handling

- Catch `NurApiError` (from `@nordicid/nurapi`) and inspect `.code` against `NurError` enum
- Catch `DOMException` with `NotAllowedError`/`AbortError` for user-cancelled browser prompts (serial/BLE picker)
- Fallback: `err instanceof Error ? err.message : String(err)`
- Web UI: show errors via `showToast(message, 'error')` from `src/ui/toast.ts`

## Pitfalls

- **Never create a second `NurApi` instance** — always use `getApi()` from `src/state.ts`
- **Filter addresses are in bits, not bytes** — EPC content starts at bit 32 (after CRC+PC)
- **Browser transports need user gesture** — `ser://request` and `ble://request` must be triggered by click
- **Side-effect import required** — `import '@nordicid/nurapi-web'` (or `-node`) registers transport schemes; without it, `connect()` fails

## Skills & Prompts

- NurApi operations → use skill [nurapi](.github/skills/nurapi/SKILL.md)
- Package upgrades → use prompt [update-nurapi](.github/prompts/update-nurapi.prompt.md)

## Dependencies

- `@nordicid/nurapi` + `@nordicid/nurapi-web` + `@nordicid/nurapi-node` — from npm registry (`latest`)
- API docs: local copies in `docs/`, online at https://nordicid.github.io/nur_nurapi_typescript/
