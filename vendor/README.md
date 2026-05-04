# Vendored NUR API tarballs

These `.tgz` files are produced by `npm run pack:all` in the
`nur_nurapi_typescript` repo and committed here so the samples build
standalone, without access to the (private) library repo.

When the libraries publish to npm, this directory will be removed and the
samples will depend on the npm-published packages directly.

## Refreshing tarballs

In the libs repo:

```bash
npm run pack:all
cp dist-pack/*.tgz ../nur_samples_typescript/vendor/
```

Then in the samples repo, bump the version in each example's `package.json`
`file:` path to match, run `npm install`, and verify builds.
