# Contributing

Brizo accepts changes to the Use runtime, local protocol, CLI, harness adapters, tests, and public documentation. Browser chrome, tabs, bookmarks, downloads, password storage, search providers, and other Brizo Browse product features do not belong in this repository.

## Development

Use Node.js 20.11 or newer:

```sh
npm ci
npm run check
```

Keep the CLI dependency-free. Electron may only remain an optional peer and must not be imported by the CLI or pure Node entry points. Prefer host callbacks over adding product state, credentials, or window logic to the Runtime.

Tests should cover behavior and security boundaries. For page actions, assert the observed postcondition rather than only checking that an input event was sent. Never place real account data, tokens, cookies, API keys, or private page content in fixtures.

## Repository boundary

Tracked paths are checked by the synchronizer allowlist. A new top-level directory needs an explicit review of whether it is public Use code. Do not weaken the allowlist to accommodate unrelated browser files.

Public changes land here first. After checks pass, a maintainer syncs the exact tree into the private Brizo-Browse checkout:

```sh
npm run sync:browse -- --browse "/absolute/path/to/Brizo-Browse"
npm run check:browse -- --browse "/absolute/path/to/Brizo-Browse"
```

Do not edit `packages/brizo` inside Brizo-Browse. The synchronizer treats that as drift and stops.

## Pull requests

Explain the concrete trigger, behavior change, and validation. Protocol changes must update `lib/protocol.mjs`, client and bridge tests, Runtime documentation, and the compatibility notes in the changelog. New harness adapters should cite the platform's official directory or command documentation.
