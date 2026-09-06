# Runtime API

Brizo ships the CLI and the embeddable Use runtime in one package. Import only the layer your program owns.

## Pure Node entry points

These entry points do not import Electron:

```js
import { executeBrowserCommand } from "brizo/client";
import {
  BRIZO_PROTOCOL_VERSION,
  BRIDGE_METHOD_NAMES,
} from "brizo/protocol";
import { startAgentBridgeCore } from "brizo/runtime/bridge-core";
import { runBrowserCommandAgent } from "brizo/runtime/command";
import { assertBrowserNavigationUrl } from "brizo/runtime/policies";
```

`startAgentBridgeCore` requires a `createSandbox(options)` function. A sandbox must implement:

```js
{
  state(),
  request(method, args, signal),
  control(action, payload),
  destroy()
}
```

The bridge passes `id`, `goal`, `client`, `url`, `host`, `installNetworkPolicy`, `validateTarget`, and `onClose` into the factory. The host must call `onClose(id)` when the session ends.

## Electron entry points

Install Electron in the host application and import:

```js
import { startAgentBridge } from "brizo/runtime/bridge";
import { createAgentSandbox } from "brizo/runtime/sandbox";
```

`startAgentBridge(options)` uses the bundled Electron sandbox factory. `options.host` supplies the application window operations used by that sandbox. `installNetworkPolicy(session)` must install the host's outbound request policy before a page loads. `validateTarget(url)` may apply stricter product rules in addition to Brizo's built-in public-network policy.

Do not expose the bridge socket, token, capability, Electron debugger, or `WebContents` to page JavaScript. Keep Node integration disabled, context isolation enabled, sandboxing enabled, and remote permission requests denied unless the host implements an explicit user decision.

## Command engine

`runBrowserCommandAgent` accepts the user's original `command`, a `webContents`-compatible page, and `planNextAction({ command, history, snapshot, step })`. The planner returns one JSON action at a time. Supported actions are `click`, `fill`, `select`, `press`, `scroll`, `navigate`, `back`, `forward`, `reload`, and `done`.

The engine limits the run, tracks document changes, rejects stale element references, pauses on login or site security checks, and verifies an observable postcondition after each action. A planner's `done` response succeeds only when the evidence ledger matches the user's requested intent.

Use `snapshotBrowserPage` and `executeBrowserCommandAction` directly only when the host already owns the loop. An `@eN` reference is valid for its observation only; never reuse it after a page change.

## Results and usage

`brizo/runtime/result` exports deterministic evidence preparation, formatting, and Markdown audit helpers. `brizo/runtime/usage` exports a per-run provider usage collector. Provider input and output totals must come from real response metadata; callers must not estimate missing token counts.

`brizo/runtime/adapters` contains the current deterministic Ctrip flight and Taobao price flows. These adapters still use the same navigation, security-block, observation, and postcondition rules as the general engine.

## Compatibility

The package version and bridge protocol are separate. Patch and minor package releases may add exports or adapters without changing the wire protocol. A host should reject descriptors outside the client's declared protocol range with `PROTOCOL_MISMATCH` rather than retrying blindly.
