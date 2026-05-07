---
description: "Update @nordicid/nurapi, @nordicid/nurapi-web, and @nordicid/nurapi-node API docs to the latest version"
agent: "agent"
---

# Update NurApi API Docs

Update the local API documentation in `docs/` to match the latest published version.

The npm packages use `"latest"` dist-tag and are updated automatically on `npm install`. This prompt only updates the local `.api.md` reference files.

## Source

All docs are published at: https://nordicid.github.io/nur_nurapi_typescript/

## Steps

### 1. Check installed version

Run `npm ls @nordicid/nurapi` to see the currently installed version.

### 2. Update API documentation

Download fresh API docs, replacing the existing ones:

```bash
curl -L -o docs/nurapi.api.md https://nordicid.github.io/nur_nurapi_typescript/nurapi.api.md
curl -L -o docs/nurapi-web.api.md https://nordicid.github.io/nur_nurapi_typescript/nurapi-web.api.md
curl -L -o docs/nurapi-node.api.md https://nordicid.github.io/nur_nurapi_typescript/nurapi-node.api.md
```

### 3. Install latest packages

Run `npm install` from the workspace root to pull the latest versions from npm.

### 4. Update example versions

Update the `"version"` field in `packages/example-web/package.json` and `packages/example-node/package.json` to match the installed `@nordicid/nurapi` version (samples track NurApi version 1:1).

### 5. Verify build

Run `npm run build` to confirm the project still compiles.

### 6. Summary

Report what changed:
- Previous version → new version (from `npm ls`)
- Build result (pass/fail)
- Any API breaking changes visible in the updated `.api.md` files
