# Agent API

The 0.5 API adds optional capabilities to authenticated protocol 1. Existing ref-based actions remain available. A desktop host must embed this runtime to provide the new features; installing a new CLI alone does not update the host. `create` and `ping` report runtime capabilities. `brizo capabilities` describes the installed client and explicitly does not claim to have probed the host.

The SDK recognizes an old host whose `create` response has neither capabilities nor an observation. It obtains the initial observation and refreshes refs after legacy screenshots. Basic ref-based operations continue to work; advanced methods fail locally with `CAPABILITY_UNAVAILABLE`, before dispatch. The Skill uses the same compatibility rule, so installing the new client does not require restarting a user's current browser mid-task.

## JSON commands

`create` returns `sessionId`, `state`, `capabilities` and the initial `observation`. If login or a site check pauses initial observation, the session is still returned with its actual paused state. Resume that session after user control is returned.

`act` accepts a fresh `snapshotId` and either an observed `ref` or `target`. A target combines `role`, `name`, `text`, `fieldName`, `href` and `frameRef`; matching is exact unless `exact:false` is explicit. A non-unique target fails before input is dispatched. Targets are resolved in a fresh observation, including accessible same-origin frames and open shadow roots. Cross-origin frames remain explicit boundaries.

```json
{"snapshotId":"CURRENT","action":"fill","target":{"role":"textbox","name":"Search"},"value":"Brizo"}
```

`batch` accepts 1–20 actions. Refs are permitted only in the first step. Later steps use semantic targets so DOM changes cannot silently retarget an old index. The entire plan is validated before dispatch. Each step is observed and subject to the same navigation, login and action policy as a single action. The final observation is returned once; intermediate observations stay inside the runtime.

```json
{"snapshotId":"CURRENT","actions":[
  {"action":"fill","target":{"fieldName":"q"},"value":"Brizo"},
  {"action":"click","target":{"role":"button","name":"Search"},"wait":{"text":"Results","timeoutMs":10000}}
]}
```

Failure returns `error.details.completed`, `failedIndex`, `mayHaveEffects`, and, when still under Agent control, a new `observation`. A failed step may already have dispatched input. Inspect the evidence; never replay the entire batch. The request has a 25-second execution deadline, and each condition wait is limited to 20 seconds.

## Waiting and observation budgets

`wait` and an action's `wait` field accept `text`, `url` (substring), `target`, `value`, `checked`, `state` (`visible`, `hidden`, `enabled`, `disabled`), `stableMs` and `timeoutMs`. Conditions combine with AND. Stable time measures observed page/control state, not network idleness. `CONDITION_TIMEOUT` does not hand the browser to the user and does not repeat input.

Observation options apply to `observe`, an action/batch's `observe`, a wait's `observe`, or a screenshot's `observe`:

```json
{"filter":{"role":"button","text":"Search"},"maxChars":500,"maxElements":10}
```

The default compact view omits empty optional fields. Omitted booleans are false; `detail:"full"` retains empty values and validity information. `format:"text"` returns line-based `controls` instead of `elements`, with the same original refs, roles, names, field values and constraints. Control names are JSON-quoted so page text cannot inject another apparent control line. `create.observe.format` sets the session's output default; per-call format overrides remain available. Programmatic clients retain the default JSON format. `truncated` and `counts` disclose output limits. Filtering preserves original `@eN` refs; it does not renumber controls. `since` produces a delta from one of the last four observations in the same tab. Removed refs are historical; actions always need the newest snapshot ID and either a fresh ref or a semantic target. A delta cache miss returns `SNAPSHOT_UNKNOWN`.

## Screenshots and canvas

`screenshot` returns a local `path`, `observation`, `snapshotId`, `viewport`, `imageSize`, and `imageScale`. The client preserves the metadata when it saves PNG bytes. The returned observation is the starting point for the next action. Capture uses Electron's `stayHidden:true` and `stayAwake:true`; it never activates a native window.

The default `scale:"css"` returns an image at viewport CSS resolution. Use `scale:"device"` to retain device-resolution pixels. The SDK accepts `task.screenshot({scale:"device",format:"text"})`. Metadata reflects the actual saved PNG. Drag uses two movement segments by default; `steps` accepts 1–60 for applications that need a finer path.

Coordinate `click`, `hover`, `double-click` and `drag` use viewport CSS pixels. Divide image pixels by the corresponding `imageScale` component before acting. Coordinates must be inside the observed viewport and on the same visible canvas. Ordinary DOM controls use refs or semantic targets. Drag emits pressed-button movement and releases the pointer on cancellation. Input receipts explicitly state that visual application success is unverified; inspect a screenshot or wait for an application-visible result.

```json
{"snapshotId":"FROM_SCREENSHOT","action":"drag","from":{"x":70,"y":300},"to":{"x":220,"y":350},"wait":{"text":"Card dragged"}}
```

An embedding host that needs a fully hidden native renderer can set trusted `host.offscreenRendering:true`. This changes the page renderer to Electron offscreen rendering; it is not a remote-client option. Normal desktop hosts retain native views by default.

## JavaScript SDK

Save UTF-8 scripts to `.mjs` files to avoid shell quoting and Unicode differences:

```js
import { createAgentSession } from 'brizo/agent';
const task = await createAgentSession({
  goal: 'Search for Brizo', client: 'Codex', url: 'https://www.example.com/',
});
console.log(task.observation);
// Choose targets from actual observation before writing the next round.
await task.act({ action: 'fill', target: { fieldName: 'q' }, value: 'Brizo' });
console.log(task.observation);
await task.finish('Filled the observed search field.', { keep: false });
```

`AgentSession` also supports `observe`, `batch`, `wait`, `screenshot`, `open`, `switch`, `diagnostics` and `close`. It tracks snapshot IDs and retains partial batch evidence. It never creates a replacement task or retries actions after an error. To resume in a later process, construct `new AgentSession(sessionId)`, then observe. The CLI retains the session capability in its protected local state; do not copy it into scripts.

`diagnostics` returns aggregate calls, observations, actions, failures and elapsed request time, together with state and runtime capabilities. It does not collect page console contents, cookies or network bodies. Read `error.recovery` for the suggested next operation and whether user intervention is needed.

The SDK reuses a validated runtime connection within its client-options lifetime, avoiding a redundant handshake for each operation. Session credentials are still read on every call and checked by the server. Transport failures invalidate the connection cache and are returned without replaying the action. The cache is module-private and never appears in command output.

Local help is available through `brizo help act|batch|wait|observe|screenshot|visual|agent`. `brizo skill` prints the installed guide without opening a browser.


### 观察范围与连续任务

默认 `scope:"viewport"` 只采集当前视口正文，不再重复文档开头。`full_page` 采集整页已渲染 DOM；`regions` 最多提供 32 个区域入口。`subtree` 的 `root` 使用最新观察中的 `@rN` 区域、`@eN` 控件或同源 `@fN` iframe。SDK 自动带入最新观察 ID，CLI 同时传 `snapshotId`。过期根引用会报错，跨域 frame 继续保持边界。

默认正文 6000 字符、控件 140 项；单次最多 10000 字符、1000 个控件。根据 `pagination.nextOffset` 与 `nextTextOffset` 分页。`counts.elements` 是本次缓存的控件数，不是整页总数；`truncated` 表示采集或输出仍有剩余。页面尚未加载的内容不在 DOM 观察范围内。

```js
const full = await session.observe({scope:"full_page", maxElements:100, maxChars:2000});
const main = full.regions.find(region => region.role === "main");
if (main) await session.observe({scope:"subtree", root:main.ref, maxChars:2000});
```

填值在 Shadow DOM 组件定义及其 `updateComplete` 完成后才执行，再重新核对控件。组件就绪等待上限为 10 秒，仍受外层请求截止时间约束；`CONTROL_NOT_READY` 不会写入或自动重试。`CONDITION_TIMEOUT` 提供当前观察供调用方继续。直接构造 `AgentSession` 接续任务时，应保留首次创建的 `capabilities`。

公共 Runtime 保留遮挡点击检查、提交授权与登录接管。普通章节片段可见，认证片段隐藏；区域和 iframe 的内部 DOM 标记不返回客户端。
