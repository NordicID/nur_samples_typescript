# NUR API TypeScript — Samples

Sample applications for the [@nordicid/nurapi](https://github.com/NordicID/nur_nurapi_typescript) TypeScript library.

## Packages

- **[example-web](packages/example-web)** — Browser sample using Web Serial / Web Bluetooth (Chromium only)
- **[example-node](packages/example-node)** — Node.js console sample using `serialport` and TCP

## Quick start

```bash
npm install

# Browser sample (Chromium)
npm run dev:web

# Node.js sample
npm run demo:node
```

## How dependencies are wired

The samples consume `@nordicid/nurapi`, `@nordicid/nurapi-web`, and `@nordicid/nurapi-node` from
vendored tarballs in [`vendor/`](vendor/) until the libraries are published to npm.

Each example's `package.json` references the tarballs via `file:` paths:

```json
"dependencies": {
  "@nordicid/nurapi": "file:../../vendor/nordicid-nurapi-0.9.0.tgz",
  "@nordicid/nurapi-web": "file:../../vendor/nordicid-nurapi-web-0.9.0.tgz"
}
```

When the libraries publish to npm, these will switch to standard semver ranges and the
`vendor/` directory will be removed.

## License

MIT — see [LICENSE](LICENSE).
