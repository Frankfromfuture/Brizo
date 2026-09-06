# Brizo Use

Brizo is an open-source browser Use runtime and Agent integration toolkit. It connects local AI harnesses such as Claude Code, Cursor, TRAE, Qwen Code, Codex, and others to isolated Brizo browser sessions.

This repository contains only the Use layer: the CLI client, local bridge protocol, isolated task sandbox, page observation and actions, safety policies, result auditing, site adapters, and harness installers. Site flows currently cover Ctrip, Taobao, Xiaohongshu, Douban, Bilibili, and Weibo. The Brizo Browse window, tabs, bookmarks, downloads, passwords, search, and other product code remain in a private repository.

## Install

Node.js 20.11 or newer is required. The first npm registry release is not live yet; npm can install the package directly from GitHub:

```sh
npm install -g github:Frankfromfuture/Brizo
brizo install
```

Once the registry release is available, use `npm install -g brizo`. Running browser tasks also requires a Brizo Browse desktop build that supports protocol 1. Its source is outside this repository.

Install every integration or select specific harnesses:

```sh
brizo install --target trae,claude-code,cursor
brizo install --app "/Applications/Brizo.app"
brizo platforms
brizo doctor
```

The installer supports Agent Skills, Codex, Claude Code, Cursor, TRAE and TraeCode, CodeBuddy and WorkBuddy, Lingma, Qoder, Qwen Code, Kimi Code CLI, Gemini CLI, Antigravity, OpenCode, Windsurf, Copilot CLI, Kiro, Junie, Roo Code, and Cline. Run `brizo platforms` for exact invocation names.

## Direct CLI use

```sh
brizo create --json '{"goal":"Read the current page title","client":"Cursor"}'
brizo observe SESSION_ID
brizo act SESSION_ID --json '{"snapshotId":"SNAPSHOT_ID","action":"click","ref":"@e1"}'
brizo status SESSION_ID
```

`--json` works in POSIX shells and PowerShell. Use `--input request.json` for long or quoting-heavy payloads. Browser commands emit one JSON line each. See [skill/SKILL.md](./skill/SKILL.md) for the complete interaction contract.

## Runtime API

The CLI has no Electron dependency. Electron is an optional peer used only by native host entry points.

```js
import { startAgentBridge } from "brizo/runtime/bridge";
import { runBrowserCommandAgent } from "brizo/runtime/command";
import { assertBrowserNavigationUrl } from "brizo/runtime/policies";
```

Read [Runtime API](./docs/runtime-api.md), [architecture](./ARCHITECTURE.md), [security policy](./SECURITY.md), and [contribution guide](./CONTRIBUTING.md) before embedding the runtime.

## Repository boundary

This public repository is the canonical source for Brizo Use. The private Brizo-Browse product stores a hash-verified snapshot under `packages/brizo` and loads the runtime from it. Sync is one-way from this repository to the private product, which prevents private browser code from entering the public history and prevents the two Use implementations from drifting.

## Development

```sh
npm ci
npm run check
```

The MIT license covers the contents of this repository. It does not apply to the separately distributed Brizo Browse product.
