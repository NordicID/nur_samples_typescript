---
description: "Update @nordicid/nurapi, @nordicid/nurapi-web, and @nordicid/nurapi-node packages and API docs to the latest version from the Nordic ID release site"
agent: "agent"
---

# Update NurApi Dependencies

Update the `@nordicid/nurapi`, `@nordicid/nurapi-web`, and `@nordicid/nurapi-node` packages and their API documentation to the latest version.

## Source

All releases and docs are published at: https://nordicid.github.io/nur_nurapi_typescript/

## Steps

### 1. Check current versions

Read `packages/example-web/package.json` and `packages/example-node/package.json` and note the current `.tgz` filenames and versions in the `dependencies` section (look for `file:../../nurapi/` entries).

### 2. Fetch the latest version

Use `curl` to download https://nordicid.github.io/nur_nurapi_typescript/releases.json (the HTML page loads versions dynamically via JS, so fetch the JSON directly). It returns:

```json
{ "tag": "v0.1.0", "files": [{ "name": "nordicid-nurapi-0.1.0.tgz", "size": 0 }, ...] }
```

Extract the version number (strip the `v` prefix from `tag`) and build download URLs as:
`https://nordicid.github.io/nur_nurapi_typescript/releases/<filename>`

If the version matches what's already in the package.json files, report "already up to date" and stop.

### 3. Download new packages

Download the new `.tgz` files into the `nurapi/` folder:

```bash
curl -L -o nurapi/nordicid-nurapi-<version>.tgz <nurapi-url>
curl -L -o nurapi/nordicid-nurapi-web-<version>.tgz <nurapi-web-url>
curl -L -o nurapi/nordicid-nurapi-node-<version>.tgz <nurapi-node-url>
```

### 4. Remove old packages

Delete the previous `.tgz` files from `nurapi/` (only the old versions — do not delete the `.api.md` files).

### 5. Update package.json files

Update the `file:` paths in both workspace package.json files to point to the new filenames, and bump each package's own `"version"` field to match the new NurApi version (samples track NurApi version 1:1):

**packages/example-web/package.json:**
```json
"version": "<version>",
"@nordicid/nurapi": "file:../../nurapi/nordicid-nurapi-<version>.tgz",
"@nordicid/nurapi-web": "file:../../nurapi/nordicid-nurapi-web-<version>.tgz"
```

**packages/example-node/package.json:**
```json
"version": "<version>",
"@nordicid/nurapi": "file:../../nurapi/nordicid-nurapi-<version>.tgz",
"@nordicid/nurapi-node": "file:../../nurapi/nordicid-nurapi-node-<version>.tgz"
```

### 6. Update API documentation

Download fresh API docs, replacing the existing ones:

```bash
curl -L -o nurapi/nurapi.api.md https://nordicid.github.io/nur_nurapi_typescript/nurapi.api.md
curl -L -o nurapi/nurapi-web.api.md https://nordicid.github.io/nur_nurapi_typescript/nurapi-web.api.md
curl -L -o nurapi/nurapi-node.api.md https://nordicid.github.io/nur_nurapi_typescript/nurapi-node.api.md
```

### 7. Install

Run `npm install` from the workspace root to update `node_modules` and regenerate `package-lock.json`.

### 8. Verify build

Run `npm run build` to confirm the project still compiles with the new packages.

### 9. Summary

Report what changed:
- Previous version → new version
- Files replaced
- Build result (pass/fail)
- Any API breaking changes visible in the updated `.api.md` files
