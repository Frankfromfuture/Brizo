# 真实网站连续任务：Brizo 与 Ego · 2026-10-25

这轮测试发现，Brizo 的单步调用较少，但复杂页面上的观察质量和接续可靠性仍有差距。Ego 在最终流程中直接完成三个网站的任务；Brizo 也能完成，但 MDN 需要一次明确补填，GitHub 需要额外滚动和等待。所有恢复动作都保留了记录。

| 网站与任务 | Ego 本次结果 | Brizo 本次结果 | Brizo 额外操作 |
| --- | --- | --- | --- |
| [Wikipedia](https://en.wikipedia.org/wiki/Artificial_intelligence)：Ethics → 收起目录 → History → 顶部 → 搜索 Machine learning | 直接完成，16 次内部 API 调用 | 修复点击与观察后直接完成，6 次调用 | 无 |
| [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript)：侧栏过滤 Promise → 文档 → Static methods → allSettled → 返回 | 直接完成，17 次调用 | 首次等待超时；确认字段为空后重填，完成五步，合计 6 次调用 | 一次明确补填；首次等待耗时仍计入 |
| [GitHub](https://github.com/microsoft/playwright)：分支菜单 → 过滤 main → 取消 → Tags → 当前可见 release → 返回 | 直接完成，18 次调用 | 补充存在性等待修复后完成，8 次调用 | 滚动一次，再等 release 链接出现 |

这里的调用数是一个外层脚本内部的 SDK／运行时调用，不能换算成大模型工具轮数。结果描述包含代码修复和有记录的恢复过程，不是“三站首次全通过”。

## 确实不如 Ego 的地方

MDN 的输入可靠性仍未解决。在 Brizo 的失败记录中，侧栏输入的短期后置检查通过，随后观察却发现字段为空，Promise 链接没有出现；Ego 的这次流程没有发生这一问题。初始化或控件重建覆盖输入是目前的主假设，尚未定位到唯一站点原因。本轮通过超时附带的当前观察确认空值，再显式重填一次，才完成任务。SDK 没有自动重放动作。

Brizo 的正文仍偏冗长。Wikipedia 的 Ethics 检查点中，Brizo 返回 14,497 字节，Ego 为 11,560 字节，前者约大 25%。两者都显示了目标段落，但 Brizo 的扁平控件列表、元数据和补充正文占了更多空间。这一字节口径只计最终观察正文，不含图片、动作回执或轮询，也不等于 token 数。

观察范围与结构也有差距。Brizo 当前只能从视口中采集最多 140 个控件，缺少 Ego 的完整页面／子树观察接口；GitHub 需要 Agent 主动滚动，才能找到后续 release。Ego 的快照保留层级，定位关系更直观。其完整页面快照也可能很大：本轮探查 Wikipedia 曾得到约 985 KB，使用时仍要按任务选择范围。

Ego 同样需要正确的调用方式。探查阶段的宽泛名称出现过多个匹配，完整快照后的引用也失效过。最终脚本依据已观察到的链接构造稳定定位，按可见结果等待；这些探查失败没有混入最终直接完成记录。

## 已修复的问题

Brizo 之前只返回整页开头的正文。Wikipedia 滚到约 14,000 像素后，Agent 仍读到文章开头。现在先采集当前视口文本，再补文档开头。桌面宿主此前已有相关处理，本轮把公共 Runtime 补齐，并保留桌面已有的敏感值隐藏逻辑。

URL 清理之前会删掉所有章节片段，目录链接与当前地址失去了区分。现在保留普通章节 ID，带参数的认证片段继续隐藏。控件名称新增 `aria-labelledby` 支持，可见文字优先于 title，交互控件里的装饰子节点不再重复占用名额；底层采集到上限时也会正确设置 `truncated`。

公共 Runtime 点击前会把已观察到的目标滚入视图，并检查实际命中位置。被遮挡的控件返回 `TARGET_OCCLUDED`，不会派发点击。桌面宿主原有更完整的命中检查保持不变。Wikipedia 的目录切换在这项修复后完成。

等待超时现在附带当前观察，Agent 可以查看字段值并接续，避免先多花一次调用找状态。GitHub 又发现了一个等待语义问题：等待某类 release 链接出现时，11 个匹配被当成歧义错误。存在性等待现允许多个匹配；点击、值验证和选中状态验证仍要求唯一目标。随后 GitHub 的六步任务完成。

## 数据如何读

[首次流程记录](./agent-evidence/real-sites-2026-10-25/brizo-first-pass.json)中，Brizo 为 1/3 完成：Wikipedia 通过，MDN 输入丢失，GitHub 缺少后续目标。对应的 [Ego 最终流程](./agent-evidence/real-sites-2026-10-25/ego-first-pass.json)为 3/3。Brizo 随后的[明确恢复记录](./agent-evidence/real-sites-2026-10-25/brizo-explicit-recovery.json)保留了 MDN 补填成功和 GitHub 多匹配错误；[等待修复后的 GitHub 记录](./agent-evidence/real-sites-2026-10-25/brizo-github-wait-fix.json)保留了最后的完成证据。每份文件都有对应源码哈希，不能把不同阶段的数据当成同一版代码的一次成功率统计。

[诊断探针](./agent-evidence/real-sites-2026-10-25/baseline-probes.json)用于复现公共 Runtime 的正文与章节片段缺陷；早期脚本的名称歧义、缺少等待和失效引用见[运行审计](./agent-evidence/real-sites-2026-10-25/run-audit.json)。它们不用于性能排名。各步耗时保留在原始记录中，本轮每站仅一次流程及限定的修复验证，网络、缓存和页面更新都会影响结果，因此不发布平均速度胜负。

两边视口为 1348×802 CSS 像素，DPR 为 2。Brizo 使用 Electron 44.2.0／Chromium 152.0.7977.76；Ego 使用运行版本 0.6.0.20、Skill 2.1.0，页面 UA 为 Chrome 154。Brizo 为隔离 Electron Runtime，Ego 为本次独立 Space 51；没有使用账号登录或日常标签。Ego 的更新提示没有在测试中途执行。版本、计量范围及最终源码哈希见[环境记录](./agent-evidence/real-sites-2026-10-25/environment.json)。

完整页面文本只保存在本机诊断目录。公开数据保留动作、URL、检查结果、错误、字节数与源码哈希，不转载网站正文。

## 功能验证与复现

124 项项目测试通过，覆盖多匹配存在性等待和动作唯一性边界。公共隐藏 Chromium 验收为 18 个场景，新增长页面当前正文、章节片段、标签解析、截断标记和遮挡拦截；桌面使用当前生产构建与嵌入 Runtime 验证 19 个场景，保留原有过程记录与追问继续执行。桌面宿主前台激活 API 调用为 0，日常应用没有重启。

复现时先创建属于当前任务的 Ego Space，保持后台；为 Brizo 提供独立连接目录和当前桌面构建。脚本会导航并重置指定页面。

```sh
# 终端一：独立隐藏 Brizo 宿主，使用自己的目录与当前构建
/path/to/Electron scripts/agent-real-sites-host.mjs \
  --directory=/short/owned/bridge --shell=/path/to/current/dist/client/index.html

# 终端二：分别采集；Ego 的 Space 必须属于当前任务
node scripts/benchmark-real-sites.mjs --engine brizo --phase release \
  --directory /short/owned/bridge --output /path/to/brizo.json
node scripts/benchmark-real-sites.mjs --engine ego --phase release \
  --ego-space YOUR_SPACE_ID --ego-page YOUR_PAGE --output /path/to/ego.json

# 只对实际失败的两个场景执行明确恢复策略
node scripts/benchmark-real-sites.mjs --engine brizo --phase recovery --sites mdn,github \
  --directory /short/owned/bridge --output /path/to/recovery.json
```

恢复模式仅在当前观察确认 MDN 字段为空时补填一次；链接未被观察到时，最多滚动一次并等待。结束后由调用方停止自己的宿主，并按 Ego Skill 完成 Space 清理。该测试依赖实时网站及本地浏览器，不放入通用 CI。
