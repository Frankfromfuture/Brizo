# MDN 输入根因、观察范围与三站复测 · 2026-10-25

MDN 输入丢失已定位并修复：输入框所在的声明式 Shadow DOM 在组件定义前就可见，Brizo 过早写入，随后组件初始化用空状态覆盖了值。修复后，真实 MDN 流程只填一次就完成，没有进入补填恢复。

整页和子树观察已补齐。默认正文只返回所选范围的文本，去掉了当前视口与文档开头的重复拼接。同名检查点的观察正文比上一轮少约 24%–49%。

## 根因证据

最初“控件被替换”的假设没有成立。只读诊断用 WeakMap 标记节点，在同一次旧版运行中，输入前后始终是节点 1：

| 页面内时间 | 控件状态 | 输入值 | 组件 query |
| --- | --- | --- | --- |
| 2078 ms | 普通 HTMLElement，组件尚未定义 | 空 | 不存在 |
| 2296 ms | Brizo 派发 input/change | Promise | 不存在 |
| 2383 ms | 升级为 MDNSidebarFilter，首次更新完成 | 空 | 空 |

[MDN 页面](https://developer.mozilla.org/en-US/docs/Web/JavaScript)中可读取的组件定义显示，构造时 `query` 初始化为空，渲染将输入值绑定到 `query`，输入监听负责更新它。旧版动作赶在定义前执行，监听尚未安装；初始化随后覆盖了输入值。单纯把 120 ms 的后置检查延长，只会更早发现失败，不能保证正确填值。

修复在输入前等待 Shadow DOM 宿主的真实组件定义，以及存在时的 `updateComplete`；随后重新观察、核对控件，再填值。等待上限 10 秒，仍受外层请求截止时间约束。未就绪或控件发生变化时返回明确错误，不排队写入、不自动重放。输入事件也补上了跨 Shadow DOM 边界的 `composed` 属性。

修复版诊断中，组件在 2864 ms 完成升级，填值发生在 2899 ms；2912 ms 时输入值和 `query` 均保持为 `Promise`。这两个运行的时间来自各自的页面时钟，用于判断事件顺序，不用于比较加载速度。

[旧版事件记录](./agent-evidence/mdn-scopes-2026-10-25/trace-before.json)、[修复版事件记录](./agent-evidence/mdn-scopes-2026-10-25/trace-after.json)及[只读探针](./agent-evidence/mdn-scopes-2026-10-25/input-probe.js)均已保留。探针仅用于独立 MDN 页面和固定测试词；公开记录不含账号数据。

## 观察范围与输出

`viewport` 默认只采集当前视口；`full_page` 采集整页已渲染 DOM；`subtree` 根据最新观察中的区域、控件或同源 frame 引用选择根节点。`regions` 提供区域入口，子树请求绑定当前观察编号。根已失效时返回错误；跨域 frame 保持边界。MDN 本页没有可用的 main/article 区域入口，实测选择了 banner 子树，未冒称已定位正文区域。

控件默认返回 140 项，单次最多 1000 项；正文默认 6000 字符，单次最多 10000 字符。`pagination.nextOffset` 继续控件列表，`nextTextOffset` 继续正文，`truncated` 表示还有内容。整页模式不是无限转储，尚未加载到 DOM 的内容也不会凭空出现。

本次真实页面的范围检查：

| 页面 | 默认视口观察 | 整页受限观察 | 子树受限观察 |
| --- | ---: | ---: | ---: |
| Wikipedia 搜索后的文章 | 9815 字节 | 4323 字节，返回 30 项，有下一页 | main，3692 字节 |
| MDN Promise 文档 | 6982 字节 | 4269 字节，返回 30 项，有下一页 | banner，1726 字节 |
| GitHub Tags，定点复测 | 5768 字节 | 3730 字节，返回 30 项，有下一页 | main，3851 字节 |

整页与子树检查使用 500 字符、30 个控件的显式预算；因此表中的大小差异不能解释为“信息完全相同时的压缩率”。默认检查点的前后对照另列如下：

| 检查点 | 上一轮 Brizo | 当前 Brizo | 减少 | 当前 Ego |
| --- | ---: | ---: | ---: | ---: |
| Wikipedia Ethics | 14497 | 7828 | 46.0% | 11534 |
| MDN 过滤 Promise 后 | 12687 | 6456 | 49.1% | 7659 |
| GitHub 分支菜单 | 16546 | 12585 | 23.9% | 18421 |

单位为最终语义观察正文的 UTF-8 字节，不含图片、完整动作回执或轮询，亦不等于 token。上一轮 MDN 使用其补填成功后的同名检查点。页面是动态网站，两端结构和控件集合也不同；这里展示输出体积，不能据此推导语义质量相同或模型费用。原始对照见 [output-comparison.json](./agent-evidence/mdn-scopes-2026-10-25/output-comparison.json)。

## 三站流程结果

最终源码的一轮完整测试中，Wikipedia 与 MDN 通过，GitHub 在打开 release 时等待导航超时，结果为 2/3。随后只对 GitHub 做定点复测，六步流程通过。没有把这些运行合成一次 3/3：

| 连续任务 | 当前 Brizo | 当前 Ego |
| --- | --- | --- |
| Wikipedia：Ethics → History → 顶部 → 搜索 | 通过，6 次内部 API 调用 | 通过，16 次 |
| MDN：过滤 → Promise → Static methods → allSettled → 返回 | 一次填值通过，5 次调用，无补填 | 通过，17 次 |
| GitHub：分支过滤 → Tags → release → 返回 | 完整轮次超时；定点复测通过，6 次调用 | 通过，19 次，含一次整页观察 |

首次定点确认没有到达 GitHub：旧脚本即使选择 `--sites github`，仍先初始化 Wikipedia，恰逢该页加载超时。脚本现从所选站点开始，原记录写入审计。中间版本曾三站全部通过，该数据也保留，但没有替代最终源码的失败样本。

[最终 Brizo 记录](./agent-evidence/mdn-scopes-2026-10-25/brizo-final.json)、[GitHub 定点记录](./agent-evidence/mdn-scopes-2026-10-25/github-targeted.json)、[Ego 记录](./agent-evidence/mdn-scopes-2026-10-25/ego-final.json)和[运行审计](./agent-evidence/mdn-scopes-2026-10-25/run-audit.json)包含动作、检查、错误、耗时和源码哈希。每站单次流程及限定的复测不足以发布整体速度或稳定性排名。

两端视口为 1348×802 CSS 像素、DPR 2。Brizo 使用 Electron 44.2.0／Chromium 152.0.7977.76；Ego 保留运行版本 0.6.0.20、Skill 2.1.0，在本次独立 Space 52 后台执行。没有登录账号或操作日常标签。环境与当前源码哈希见[环境记录](./agent-evidence/mdn-scopes-2026-10-25/environment.json)。

## 功能验证

126 项项目测试通过。公共隐藏 Chromium 验收 22 个场景，桌面集成 23 个场景；覆盖延迟组件定义、输入只派发一次、未就绪不写入、整页分页、子树隔离及过期根、同源与跨域 frame 边界，并保留原有批处理、Canvas、登录接管和追问继续执行。一次生产构建与镜像检查通过，日常应用未重启。

复现真实流程仍使用仓库的 `scripts/agent-real-sites-host.mjs` 和 `scripts/benchmark-real-sites.mjs`，命令见[上一轮报告](./real-sites-comparison-2026-10-25.md)。当前脚本会在每个成功流程后记录三个观察范围，并在目标不在视口时使用整页观察；本轮使用普通执行模式，未启用补填恢复。固定组件场景可通过 `npm run verify:agent` 在后台复现。
