# 色卡选择器插件 — 开发规划

> 状态:阶段 0-5 已完成(阶段 2 含面板接线,阶段 3 含取色覆盖层,阶段 4 含 Agent 集成,阶段 5 含宿主主题);阶段 6(上架)未开工;**二期屏幕取色已定型为宿主一次性截图方案,等待宿主提供 `screen.capture`**
> 最后更新:2026-09-17

## 1. 背景

- 来源:[vastsa/PI-Desktop issue #87「插件征集(第一期)」](https://github.com/vastsa/PI-Desktop/issues/87)方向 **2️⃣ 色卡选择器**。
- 认领状态:截至 2026-09-16,该 issue 评论仅两条——muzimu217 的会话导入(清单外方向)、Tioit-Wang 的文件编辑器(方向 1️⃣)。**方向 2 无人认领**,官方市场 `catalog.json` 22 个插件中也没有取色/配色类工具。
- 目标:面向写前端和做设计的人,提供一个"取色 + 配色"工具。一期用现有插件 API 就能完成;二期的屏幕取色需要宿主新增一项能力——**只申请一张一次性截屏,放大镜仍在插件里**(见 §5)。

## 2. 现状核对:能力可用性

以下基于 2026-09-16 的 `vastsa/PI-Desktop` main 与 `vastsa/pi-desktop-plugins` 核对。

### 可直接使用

| 能力 | 说明 |
| --- | --- |
| 工作面板视图 | `contributes.views` + `ui.view`,停靠在右侧工作面板;与面板共用同一套 `pluginBridge`,可接收宿主推送(`appearance:changed` / `workspace:changed` / `view:open`) |
| 独立面板 | `ui.panel` + `pi.ui.openPanel({ title })`;尺寸只能由 manifest `ui.width/height` 声明(默认 480×360,下限 360×280),无边框、带宿主三键胶囊;**每个插件只有一个面板窗**,`window.open` 被拒绝 |
| 命令面板 | `contributes.commands` 出现在全局搜索的命令区(Ctrl/Cmd+Shift+P) |
| **全局快捷键** | `contributes.globalShortcuts`(≤8 条)+ 权限 `keyboard.globalShortcut`,运行时 `pi.keyboard.registerGlobalShortcut`。宿主持有 Electron `globalShortcut`,插件只能把加速键映射到自己的命令;冲突被拒绝而非抢占(`SHORTCUT_CONFLICT`),`Alt+Space` 与 `Mod+Shift+W` 已被宿主占用。**来自 PR #409 / ADR 0257,注意本地旧检出里没有** |
| 插件设置 | `contributes.settings`,类型含 `string`/`number`/`boolean`/`select`/`json`/`shortcut`;其中 `shortcut` 类型仅在应用窗口聚焦时生效 |
| 图片读取 | `pi.fs.readPreview` 返回 `{ kind: "image", dataUrl }`(≤5 MiB),`pi.fs.readRange` 返回原始字节(≤8 MiB);需 `fs.read` |
| 用户自选目录 | `pi.fs.requestDirectory()` 配合 `root: "userSelected"`(无需 scope、仅内存授权),**一期可不申报任何 fs 写权限** |
| 剪贴板读取 | `pi.clipboard.readText` / `getHistory()`(历史条目含 `{ type: "image", data, width, height }`) |
| AI 补全 | `pi.agent.complete`,宿主解析凭据、`tools: []` 一次性补全;每插件 60 秒 8 次(`RATE_LIMITED`)、90 秒预算(`TIMEOUT`)、空输出为 `INVALID_ARGUMENT` |
| Agent 集成 | `pi.agent.registerTool`、`agent.prompt.inject`(技能) |
| 宿主主题 | `pi.themes.upsert/remove/list` + `pi.app.setTheme`(ADR 0260,upsert 后正在使用的主题立即生效、无需重载;id 由宿主拼成 `plugin:<pluginId>:<themeId>`)、`contributes.themes`(静态 `.css` + `base: light/dark`);需 `ui.theme`。**实测**:`setVariables` 的变量名保留 `--pi-` / `--ds-` / `--font-` / `--text-` / `--motion-` 前缀,所以它只能调插件自己的旋钮,**够不到宿主设计令牌**;宿主每个主题一套键值,upsert 的 CSS 不在宿主侧落盘 |
| 通知 | `ui.showToast`(无权限)、`ui.notify` / 原生通知(需 `notify`) |

### 当前不可用

| 缺口 | 说明 |
| --- | --- |
| **屏幕像素** | 无权限、无 API。main 上 `desktopCapturer` / `getDisplayMedia` / `display-capture` / `setDisplayMediaRequestHandler` 全部 0 命中;面板的权限处理器只放行 audio-only 的 `media`(配合 `ui.microphone`)。**我们申请的是"一次性截图"这一最小形态,见 §5(方案 B)** |
| **全屏 / 透明 / 置顶窗口** | 面板窗口形态固定(无边框 + 宿主胶囊),不存在位置、尺寸、透明、置顶、全屏、多窗口能力 |
| **从命令打开工作面板视图** | 没有 `openView` API,`pi.ui` 只有 `openPanel` / `closePanel`。官方 `pi.terminal` 的 open 命令也只能弹一句"请按 Mod+J 手动选择"。**因此本插件同时声明面板与视图,共用同一个 HTML 入口**——命令与全局快捷键打开的是面板 |
| **剪贴板写图片** | `pi.clipboard` 只有 `writeText`,没有 `writeImage`;导出只能走文本格式(CSS / JSON / Tailwind 配置) |
| 色卡 PNG 导出 | 同上,`fs.writeText` 只写文本,没有二进制写入 |

> 自包含路线(插件主进程是未沙箱化的 Node `utilityProcess`,可用 `child_process` + 自带原生 helper,先例为官方 `pi.terminal` 的 Go PTY helper)技术上可行,但审核要求 capability/data-flow 矩阵、负路径测试、依赖来源说明,以及**两位 maintainer 独立签字**。本规划默认不走这条路。

## 3. 交付范围

### 一期:现有能力就能做完

- **色板浏览**:预设配色、渐变、Tailwind / Material 色系,在工作面板里直接翻看
- **取色**:打开项目里的设计稿、截图、素材图,在上面点一下取到颜色;也支持从剪贴板历史图片取色(目录由用户自己选,不申请任何文件权限)
- **AI 配色**:给一个主色或一句风格描述,生成整套搭配并实时预览;也可以让 Agent 直接调用
- **一键复制**:HEX / RGB / HSL、CSS 变量、Tailwind 配置
- **生成并一键换主题**:配色满意后,把 PI-Desktop 界面本身换成这套颜色

### 二期:需要宿主新增能力

- **屏幕取色**:宿主返回一张一次性截屏,插件用自己的放大镜在图上取色(方案 B,见 §5)。插件的取色器里已预留「屏幕取色」来源位(当前置灰),宿主 API 到位后启用即可,不需要新增插件 UI

## 4. 轨道 A:插件本体

### 阶段 0 — 立项与工程约束(0.5 天)✅ 已完成

**决策记录(2026-09-16 确认)**

| 决策 | 结论 |
| --- | --- |
| 仓库 | `github.com/catDforD/pi-desktop-color-picker`(公开,MIT) |
| 插件 id | `io.github.catdford.color-picker` |
| 名称 | 中文「色卡选择器」/ 英文「Color Picker」 |
| 技术选型 | 纯 JS + 原生 DOM,零构建;需要时再引 esbuild |
| 一期范围 | 色板浏览 + 取色 + 复制导出;AI 配色与主题生成随后 |

产出:仓库、id、构建与测试策略。

- **插件 id**:`io.github.catdford.color-picker`。id 发布后永久稳定——设置、数据、授权、包名都以它为键;上架时官方仓库的目录名必须与它逐字一致。
- **语言与构建**:宿主加载插件时**不编译 TypeScript、不安装依赖**,插件目录内必须是可直接执行的 JS/HTML/CSS。要么直接用 JS,要么自接 esbuild/vite 把产物 build 进目录;第三方库必须 bundle。
- **面板技术栈**:面板是沙箱 Chromium(无 Node、contextIsolation、sandbox),宿主调用走 `window.pluginBridge.invoke/on`;Node 只在插件主进程可用。
- **通信边界**:面板直连的通道是固定的一组(`fs.*`、`clipboard.*`、`themes.*`、`net.fetch`、`app.getAppearance` 等);`agent.complete` 不在其中,面板需经转发机制交给插件主进程的 `onPanelInvoke` 再调用。
- **起步方式**:应用内「插件 → 从模板新建插件」选 `panel-basic`,或 `cp -R plugins/demo.workspace-summary plugins/<id>`(官方仓库模板)。
- **测试策略**:颜色转换、色阶生成、对比度、导出文案等纯逻辑抽成不依赖宿主的模块,用 `node:test` 写 `.mjs`——官方仓库 `tests/` 就是这个风格(一个插件一个文件)。

### 阶段 1 — 骨架与入口(1-2 天)✅ 已完成

已完成:`manifest.json`(面板 + 视图 + 命令 + 全局快捷键 + `format` / `modelKey` 设置项)、`main.js`(命令与快捷键注册)、`renderer/`(面板与视图共用一个入口,跟随宿主明暗与语言)、`lib/color.js`(转换与格式化)与单元测试;`pi-plugin check` 通过。

**全局快捷键(2026-09-17 补,原计划等吸色笔一起做)**:`Alt+Shift+C`,在 `onLoad` 里显式注册并带降级链 `Alt+Shift+C` → `Ctrl+Alt+C` → `Alt+Shift+P`。宿主的冲突回应是 `{ registered: false, error }` 而不是异常,所以逐条试、成功即停并写日志。声明式默认值由宿主在 `onLoad` 之后注册;同 id 同加速键重复注册等价;若因冲突退到了备用键,宿主那次冲突检查发生在释放旧绑定**之前**,备用绑定会保留。不在 `onUnload` 里注销——宿主在 unload / disable / 崩溃时统一释放,写了是死代码。

⚠️ **运行宿主必须晚于宿主 PR #409**:`keyboard.globalShortcut` 权限与 `contributes.globalShortcuts` 由该 PR 引入(plan 的 §2 早已注明本地旧检出没有)。本机 `PI-Desktop-worktrees/settings-select-controls` 就早于它——插件在那里能正常加载、只是快捷键不生效(日志会记 `UNSUPPORTED`);要真正生效需要从 main 起的构建。

**待实机验证**:快捷键能唤起面板;重新授权后目录选择器能打开;AI 生成能拿到真实模型的返回。

- `manifest.json`:id / name / i18n(必须同时含 `en` 与 `zh-CN`)/ `main` / `engines.piDesktop`
- `contributes.views` 工作面板视图;`contributes.commands` 命令;`contributes.globalShortcuts` 全局快捷键;`contributes.settings` 设置项
- 跟随宿主明暗与语言(`appearance:changed`)
- 权限最小集:`ui.view`、`ui.settings`、`clipboard.write`

> ⚠️ 每次新增权限都会中断热重载并要求用户重新授权,权限清单尽量一次想清楚。

完成标准:`Load development plugin` 可加载;面板能在工作面板打开;改名改色即时热重载;日志按 pluginId 可见。

### 阶段 2 — 色彩数据与算法(3-5 天,纯逻辑)✅ 已完成(含面板接线)

**决策记录(2026-09-16 确认)**

| 决策 | 结论 |
| --- | --- |
| Tailwind 数据 | 取 v4 规范值(oklch 字符串),pin `tailwindcss@4.3.3`,共 26 色系 × 11 档 + 黑/白 |
| Material 数据 | 取经典 2014 色板,pin `material-colors@1.2.6`(ISC),19 色系,色系含 A100/A200/A400/A700 |
| 数据生成方式 | `tools/gen-palettes.mjs` 从 npm 取固定版本包抽取,产物提交进仓库;运行时零依赖、不联网 |
| 预设与渐变 | 本仓库手工维护(15 套配色 + 12 条渐变),不引入第三方数据集 |
| 超色域处理 | 按 Blink 实际行为逐通道裁剪,不做 CSS Color 4 §13.2 降 chroma 映射 |
| 交付范围 | 逻辑 + 面板接线:四个标签页(色板 / 配色 / 对比度 / 导出),做出可演示版本 |

已完成:

- `lib/data/` 三份数据:Tailwind v4(286 档色值,保留官方 oklch 原值)、Material(254 档)、预设配色与渐变
- `lib/color.js` 扩展:OKLab/OKLCH ↔ sRGB、`rgb()` / `hsl()` / `oklch()` 字符串解析(含 CSS `none` 分量)、oklch 输出格式;原有的 HEX/RGB/HSL 行为不变
- `lib/generate.js`:色阶生成(500 档精确等于基色,明度单调、色相保持)与四条和谐规则
- `lib/contrast.js`:WCAG 相对亮度/对比度/AA-AAA 分级/最佳文字色,以及三型色盲模拟(Machado 2009)
- `lib/export.js`:CSS 变量、Tailwind v4 `@theme`、Tailwind v3 配置、JSON
- 面板接线:`renderer/` 改为「头部常驻当前色 + 色板/配色/对比度/导出」四标签页;`manifest.json` 升到 0.2.0、`format` 设置项增加 OKLCH;全程未新增权限
- 测试:46 条 `node --test` 用例,覆盖数据完整性、转换黄金值、色阶不变量、对比度阈值、导出确定性与边界输入

**转换正确性的验证方式**:用无头 Chromium 144(与面板同为 Blink 内核)对全部 288 个 Tailwind 色值做像素级回读比对——280 个逐位一致,8 个单通道差 1(舍入边界,两个方向都有);超色域颜色的处理据此定为裁剪。这些黄金值固化在 `tests/oklch.test.js` 里。

完成标准:单测齐全,含边界用例(纯黑纯白、极值、舍入)。✅

### 阶段 3 — 取色与放大镜组件(3-5 天)✅ 已完成

**决策记录(2026-09-17 确认)**

| 决策 | 结论 |
| --- | --- |
| 目录来源 | `fs.read` + `fs.read.root: "userSelected"`:目录由用户自己选,不申报 workspace 范围、不申报任何写权限;授权是内存级、一次只记一个目录、重载即失效 |
| 通道 | `fs.requestDirectory` / `fs.list` / `fs.readPreview` / `clipboard.getHistory` **都是面板直连通道**(宿主 `invokePanelWithoutToolContext` 的 switch 里有),不需要 `onPanelInvoke` 转发——阶段 3 是纯 renderer 工作 |
| 界面形态 | 头部「从图片取色」按钮 + 覆盖整块面板的取色层;不新增第 5 个标签(368px 宽放不下五个标签,且取色是模态操作) |
| 组件与来源解耦 | 放大镜只认像素源接口 `{ width, height, pixelAt(x, y) }`;今天由图片 canvas 实现,二期接屏幕吸色时只换实现 |

已完成:`lib/pick.js` + 测试(取色几何、边界夹取、RGBA 取样、剪贴板字节归一);覆盖层的两条来源(文件夹 / 剪贴板最新图片)、离屏 canvas 按原始像素取样、11×11 放大镜(像素网格 + 白再黑的倍描准星 + 实时 HEX)、方向键 1px / Shift 10px 微调(带边界夹取)、点击或 Enter 取色、Esc 退出、窗口缩放重排;放大镜的硬保证是**不遮挡正在瞄准的那个像素**且不出舞台边界(已用无头浏览器断言)。

负路径都有明确文案:取消选目录、空目录、非图片文件、`{kind:"tooLarge"}`(>5 MiB,是返回值不是异常)、解码失败、剪贴板历史里没有图片(并说明只有粘贴进会话的图片会进历史)。

### 阶段 4 — AI 配色(2-3 天)✅ 已完成(含 Agent 集成)

**决策记录(2026-09-17 确认)**

| 决策 | 结论 |
| --- | --- |
| 调用路径 | 面板不能直连 `agent.complete`,经 `onPanelInvoke` 两个通道转发(`colorPicker.ai.suggest` / `colorPicker.ai.setModel`);统一返回 `{ ok, ... }` 信封——错误对象的 `code` 过不了两层 IPC,只有 message 能留下 |
| 结构化输出 | 宿主没有 JSON 模式,靠提示词 + 本地校验:提示词要求严格 JSON 且不要围栏;`lib/ai.js` 剥围栏、括号配平(尊重字符串里的 `}`)、逐项丢弃非法与重复颜色、下限 2 色上限 8 色,失败时给出原因并保留模型原文供人判断 |
| 模型选择 | `models.list` 是面板直连通道,下拉在面板里做;选择经 `colorPicker.ai.setModel` 落到插件设置;解析顺序是面板选择 → 存储值 → 宿主默认;没有可用模型时禁用生成并就地说明。**2026-09-17 修订:`modelKey` 不再写进 `contributes.settings`**——宿主的设置对话框会把声明过的字段原样列出来,于是把一串 provider key(形如 `7543d34f-…/model`)暴露成一个文本框,而模型本来就在面板里有带名字的下拉。撤销声明后对话框只剩「复制记法」;存取不受影响(插件的 `getSettings`/`setSettings` 走插件数据目录的 `settings.json`,**不按 manifest 校验**;宿主对话框的保存路径只校验它自己渲染的字段并与当前记录合并,不会清掉未声明键)。**观察项**:若将来宿主收紧 `plugin.setSettings` 的校验,这里要改回声明式,并优先采用宿主若提供的"动态选项"能力 |
| Agent 集成 | `suggest_palette` 工具(权限 `agent.tool.register`,schema 与 `contributes.agentTools` 成对)+ `skills/palette-suggestions.md`(权限 `agent.prompt.inject`);工具与面板共用 `lib/ai.js` 同一条核心路径 |
| 缓存 | 只做面板会话内的内存缓存,不为持久化引入 json 设置与重放逻辑 |

已完成:配色页底部的 AI 区块(风格描述 + 模型下拉 + 生成 + 状态行 + 结果色带;点色块取用、可「整套用作导出」直接接上现有导出范围)、`lib/ai.js` 与测试、`main.js` 的 `onPanelInvoke` 与 `registerTool`、skill 文档。

**设置项文案的宿主限制(2026-09-17 记录)**:宿主把 `contributes.settings[].title` / `description` **原样渲染**,不走任何本地化(只有宿主自己的界面文案经 `t()`);SDK 类型也是 `string`,两个内置插件都没声明设置项可参照。因此插件只能二选一:写单一语言,或把两种语言写在同一行。现阶段选了后者(`复制记法 / Copy format`)。**如果将来宿主接受 `PluginLocalizedString`**(`ui.title` / `views[].title` 已有现成机制,扩展过去应该不大),这里就换成 `{ "en": …, "zh-CN": … }` 并删掉内联英文;这条值得作为一个独立的、所有带设置项的插件都受益的小改动提给宿主。

**限制(已写进 README)**:面板转发上限 **30 秒** < `agent.complete` 自身的 90 秒预算;每分钟 8 次且失败的调用照样计入;模型空输出走 `PLUGIN_API_FAILED` 而不是文档说的 `INVALID_ARGUMENT`(broker 只透传 `.code`),所以 UI 不按后者分支;工具在 Plan/Goal 模式下被宿主禁用。

### 阶段 5 — 生成并安装宿主主题 ✅ 已完成(0.4.0)

**决策记录(2026-09-17 确认,均以宿主源码核实,非仅 ADR 文本)**

| 决策 | 结论 |
| --- | --- |
| 通道 | `themes.upsert/remove/list` 与 `app.setTheme` **都是面板直连通道**(宿主 `invokePanelWithoutToolContext` 的 switch 里有),但统一走主进程一个通道 `colorPicker.theme`(四个动作:`status` / `apply` / `restore` / `remove`)。理由:持久化只有主进程能做(`plugin.setSettings`),面板直接 upsert 会变成"注册成功但没存下"的半步状态;一个地方管 id、label 与存储,避免两处漂移 |
| 令牌映射 | **明暗两套策略不对称,是宿主自己的不对称**:暗色块的语义令牌全部由原始色阶派生(`--ds-bg-primary: var(--gray-900)`、`--ds-bg-hover: color-mix(… var(--gray-0) 6% …)`)→ 只改 13 档 `--gray-*` + 5 档 `--accent-*` + 3 个字面量的暗色面 + accent 三件套,共 24 条;浅色块写的是 49 个 `--ds-*` 字面量、完全不碰色阶 → 生成浅色主题就照着写,共 52 条。`--ds-bg-sidebar` 保持颜色值(渐变会打断 `color-mix`/玻璃层消费者),`windowBackground` 与状态色不碰 |
| 色相命名 | 按 OKLCH 色相**实测锚点**分带(纯红 29°、纯品红 328°、`#8b5cf6` 293°),不用均匀 30° 分格——均匀分格会把纯红叫成"橙"。12 个色族 + 中性,中英各一套,主题名形如「蓝 · 深色」 |
| 对比度承诺 | accent 同时是链接与图标的墨色,所以强制 `--ds-accent` 对底色 ≥ 4.5:1(在 OKLCH 明度上朝远离底色的方向走,极端种子退化为纯黑/纯白);文本三档 ≥ 7:1 |
| 持久化 | 宿主主题注册表**是 per-load 的**:卸载/禁用/崩溃走 `clearContributions`,该插件的主题全部删除,且 upsert 的 CSS 不落盘;只有 `AppSettings.theme` 偏好字符串持久。所以安装 = 把 CSS 存进插件自己的 `settings.json` + **每次 `onLoad` 重新 upsert**,偏好由宿主自动重新绑上(主题不在时宿主渲染层干净回退 `system`) |
| 幂等 | 每个底色一个固定槽位(`pi-theme-dark` / `pi-theme-light`),重新生成是覆盖而不是堆积;两个槽位可共存(深色套主题不影响浅色那套) |
| 预览 | 面板用**同一个 `lib/theme.js`** 本地生成预览色带,不靠宿主回传令牌——面板显示的就是将要应用的值。另给一个「复制 CSS」,生成物可审计、可分享 |
| 降级 | `pi.themes`/`app.setTheme` 特性检测 + 明确文案。**这两个 API 还没有进任何发布 tag**(v0.14.8 在 ADR 0260 之前),所以旧宿主上这一块只显示"需要更新 PI-Desktop",其余功能不受影响 |
| 没做 | 原生窗口底色 `windowBackground` 只有静态 `contributes.themes` 能给(要在打包时就存在 `.css`),纯运行期方案拿不到——在明暗底色与宿主一致时不构成问题;宿主主题只改外壳,插件面板自身外观不变(面板是独立沙箱文档、自带一套 CSS 变量),这一点写进了面板文案与 README |

已完成:`lib/theme.js`(令牌映射 + CSS 生成 + 自校验)、`main.js` 的 `colorPicker.theme` 与 onLoad 重新注册、导出页主题区块(底色选择 + 预览色带 + 生成并应用 / 还原 / 卸载 / 复制 CSS + 状态行)、`tests/theme.test.js` 16 条与 `plugin-main` 主题用例 15 条。

**验证方式(不只是单测)**:① 生成的全部 16 张表(8 个种子 × 明暗)喂给**宿主自己的 `sanitizeThemeCss`**,全部通过且原样不改写;② 级联探针——把宿主的真实 `tokens.css` 与生成的表一起加载,读回计算值:暗色下 `--ds-bg-primary` 解析成我们给的 `#0b182d`、`--ds-text-primary` 解析成我们的 `--gray-0`(证明宿主的 `var()` 派生链确实跟着走),浅色下 `--ds-bg-primary` 是我们的 `#fdfeff` 而不是内置的 `#ffffff`(证明 `:root[data-plugin-theme=…][data-theme]` 的特异性胜出,不依赖样式表顺序);③ 无头浏览器跑完应用 → 还原 → 切底色 → 复制 CSS 全流程与三条负路径(未授权、旧宿主、失败),并断言面板宽度不被撑开。

### 阶段 6 — 上架(1-2 天 + 审核等待)

- README 讲清 what / why / permissions
- `python3 scripts/pack_plugin.py plugins/<id>` → `python3 scripts/rebuild_catalog.py` → `python3 scripts/security_audit.py --check-packages`
- PR 到 `vastsa/pi-desktop-plugins`;检查清单:唯一 id、语义化版本、catalog 中 sha256 与 `.piplug` 一致
- 一期不涉及原生二进制或系统级能力,预期走常规审核
- `plugins.aiuo.net` 尚未上线,客户端直接从 GitHub raw 拉 `catalog.json`;每次迭代都是 pack → 重建 catalog → PR

## 5. 轨道 B:宿主屏幕取色 API(方案 B:一次性截图)

**决策(2026-09-17)**:选 **B(宿主返回一张截屏,插件自己取色)**,不选 A(宿主画全屏放大镜覆盖窗)。判据是"对宿主的改动最小":

| | 共有成本 | 独有成本 |
| --- | --- | --- |
| A 宿主覆盖窗 | 权限登记(SDK/Rust/devkit/八语言/权限矩阵)、`pi` API 与 allowlist、`assertPermission`、审计、面板通道、规范与 E2E | **造一项全新宿主 UI**:全屏覆盖窗(跨显示器、各自 DPI、置顶、点击与键盘、Esc)、放大镜渲染、光标跨屏跟随、macOS 授权引导,并长期维护 |
| B 一次性截图 | 同上 | 只有采集:显示器列表 → `capturePage` → PNG 编码 → 按需隐藏/恢复宿主窗口。**没有新窗口、没有新 UI**;返回形状照 `browser.screenshot` 的现成先例 |

插件侧同样是 B 更省:屏幕取色变成**第三个像素来源**,与文件夹/剪贴板共用同一条管线与同一套放大镜(已实现并逐像素验证),新增代码只有"向宿主取一张图"。区域选择(清单方向 3️⃣)将来也是插件里裁剪图片,仍不动宿主。

代价(如实记录):插件会拿到整屏像素,隐私面高于"只回传一个颜色"——缓解事实是本插件**不申报任何网络权限**(没有 `net.fetch`),像素无法离开本机;另外取色 UI 必须可见才能选像素,面板覆盖的区域要么在截图里挡住、要么被宿主隐藏后留空洞,插件把空洞画成明确的"不可用"块。

- **B0** 在 issue #87 提需求(见附录 A)→ 等维护者确认设计,**不要提前写代码**
- **B1** 在 PI-Desktop 建 worktree(一个请求 = 一个分支 + 一个 worktree,从 `origin/main` 起),写 ADR;新模块建议 `plugin-screen-capture.ts`(不 import electron、依赖注入以便单测)
- **B2** 实现:`plugin-runtime.ts` 接线(allowlist / dispatch / `assertPermission` / 审计)、`plugin-host-process.mjs` 暴露 API、SDK 权限与类型、Rust 侧校验、devkit 映射、渲染层风险映射、八语言文案、规范四篇(`02`/`03`/`04`/`13`)+ zh-CN 镜像 + `decisions-log`
- **B3** 桩驱动测试(参照 `apps/desktop/test/plugin-shortcuts.test.mjs` 的形状)+ 验证命令:`pnpm build:js`、`pnpm --filter @pi-desktop/desktop typecheck`、`pnpm lint`、`pnpm -r --if-present test`、`cargo fmt --check`、`cargo test -p host-core --locked`、`cargo clippy -p host-core --all-targets`
- **B4** PR → 合并 → **合并后在 main 上跑对应 E2E**(场景 ID 必须语义化,如 `E2E-PLUGIN-screen-capture-hides-host-windows`)

模板参考:PR #409(host-mediated real-time capabilities)是同类改动的现成范本。

### 5.1 插件侧待办(宿主 API 到位后)

> 现在就可以做的部分已经做完了:取色器里的「屏幕取色」来源位已占位并置灰,提示"暂未开放——需要宿主先开放屏幕采集能力"。

- [ ] manifest 增加 `screen.capture` 权限(高危,安装时需显式授权),README 权限表与安全声明同步。**注意授权是每次加载记录一次的**:0.4.0 已经用掉了一轮(为 `ui.theme`),这一项到位时又是一轮"禁用后重新启用并授权",无法与已发生的合并
- [ ] 第三个来源启用;点击后调面板直连通道 `screen.capture`,拿到的 `Uint8Array` + mime 走现有 `pickUseImage` 路径(与剪贴板来源同一段代码)
- [ ] 遮挡处理:若宿主在采集时隐藏了自身窗口,把截图里的缺失区域渲染成明确的"不可用"块(复用棋盘格样式),而不是让用户对着空洞猜
- [ ] `hideHostWindow` 用默认值(true);取消/拒绝返回 `null` 时保持当前色并提示"已取消"
- [ ] 负路径文案:宿主不支持该通道 / 权限未授 / 采集被系统拒绝(macOS 屏幕录制)/ 多显示器选择
- [ ] 测试:`tests/pick.test.js` 补"截图来源"的纯逻辑;假 bridge 环境里端到端跑一遍(用一张现成 PNG 冒充截图)
- [ ] 若宿主同时开放"命令触发也能采集",再加一条可改绑的快捷键「立即屏幕取色」(当前 `Alt+Shift+C` 只负责开面板)

## 6. 关键路径与风险

- 阶段 0-6 不依赖任何人,可立即开工;唯一外部依赖是轨道 B,所以"先提需求、再开发"的顺序很重要。
- 建议节奏:先用阶段 1+2 做出"能翻色板、能检查对比度、能一键复制"的可演示版本,拿实物去喂需求讨论。
- 风险点:
  - ~~阶段 5 的宿主主题令牌映射需要先摸清变量清单,可能超预期。~~ 已结案:变量清单摸清了(暗色 90 个 `--ds-*` 里绝大多数是宽度/圆角/阴影,颜色面只有 18 个原始档位 + 少量字面量),工作量落在"两套不对称策略"上而不是"变量太多",见阶段 5 决策表。
  - 阶段 4 的模型输出稳定性依赖 JSON 校验与兜底。
  - 若轨道 B 被拒,屏幕取色降级为"图片取色 + 剪贴板历史图片取色"(两者都已实现),一期功能不受影响;取色器里预留的来源位保持置灰即可。

## 附录 A:需求评论草稿(二期:屏幕取色,方案 B)

> 可直接贴到 issue #87。这是一份**进展更新 + 剩余请求**:一期已全部完成,唯一还需要宿主能力的是一次性截屏(方案 B);方案 A(宿主画全屏放大镜覆盖窗)在正文里明确作废并说明了原因。贴出去时若又改了口径,记得回来同步这一段。

```markdown
更新进展:**交付范围里的五项都已完成**,清单之外还做了几件事;现在只剩一项需要宿主支持。

仓库:https://github.com/catDforD/pi-desktop-color-picker(plugin id `io.github.catdford.color-picker`;尚未上架,当前按开发插件加载。打包与校验已按 devkit 跑通,准备走 `pi-desktop-plugins` 的上架流程)

## 已完成

- **色板浏览**:Tailwind CSS v4 全部 26 个色系(50–950,官方 OKLCH 原值)、Material Design 19 个色系、15 套预设配色、12 条渐变
- **取色**:打开文件夹里的图片,或直接用剪贴板历史里的最新图片;放大镜给出真实像素(像素网格 + 十字准星 + 实时色值),方向键 1px 微调(Shift 一次 10px),点击取色
- **AI 配色**:给一个主色或一句风格描述,生成整套带名字的配色;模型在面板里选,凭据由宿主解析,插件碰不到
- **一键复制**:HEX / RGB / HSL / OKLCH、CSS 变量、Tailwind v4 `@theme`、Tailwind v3 配置、JSON
- **生成并一键换主题**:配色满意后一键装成 PI-Desktop 主题,侧栏 / 编辑器 / 设置页一起换色,可随时切换或卸载(用 ADR 0260 的 `pi.themes.upsert` + `pi.app.setTheme`,不需要新增宿主能力)
- 清单之外还有:和谐配色与 50–950 色阶生成、WCAG 对比度与三种色盲模拟、`suggest_palette` 工具 + skill、`Alt+Shift+C` 全局快捷键

## 还需要宿主开放的能力(只剩一项)

**一次性截屏 `screen.capture`**——插件侧只差"拿到屏幕像素"这一步。

我上次提的是"宿主提供全屏放大镜覆盖窗,插件只拿一个颜色值"。**改主意的原因是它对宿主的改动大得多**:

| | 共有成本 | 独有成本 |
| --- | --- | --- |
| 全屏覆盖窗 | 权限登记、`pi` API 与 allowlist、`assertPermission`、审计、面板通道、规范与 E2E | 造一项全新宿主 UI:跨显示器覆盖窗(各自 DPI、置顶、点击与键盘、Esc)、放大镜渲染、光标跨屏跟随、macOS 授权引导,并长期维护 |
| 一次性截图 | 同上 | 只有采集:显示器列表 → `capturePage` → PNG 编码 → 按需隐藏/恢复宿主窗口 |

放大镜那一层插件里已经写好并逐像素验证过,复用不需要宿主写任何渲染代码。另外截图是冻结画面,在静止图上用方向键精确取色本来就比活动画面更准;将来要做清单里的"区域选择",也只是插件里对这张图裁剪,仍然不需要动宿主。

### 期望的 API 形状

```ts
// 新权限:screen.capture(高危、默认拒绝、每次调用进审计)
pi.screen.capture(input?: {
  hideHostWindow?: boolean      // 默认 true:采集前隐藏宿主窗口(含发起调用的面板)
  display?: "active" | "all"    // 默认 "active":只采面板所在的那块显示器
}): Promise<{
  mimeType: "image/png"
  data: Uint8Array
  width: number
  height: number
  displayId?: string
} | null>                        // null = 采集被拒绝或取消
```

形状照 `browser.screenshot` 的现成先例;权限名与通道名你们定,我这里只是提案。希望一起定下来的几点:

- **面板直连**:请放进 `invokePanelWithoutToolContext` 的 switch(和 `fs.readPreview` 一样),不要走 `onPanelInvoke` 转发——用户盯着屏幕挑颜色可能超过转发通道的 30 秒上限
- **隐藏宿主窗口是宿主的事**:插件没有窗口 API,`hideHostWindow` 之外没有办法让面板不挡住要取的颜色
- **并发**:同一时刻只允许一个采集会话,重复调用返回 `BUSY`;采集完成或失败后宿主必须恢复被隐藏的窗口
- **多显示器与混合 DPI**:至少支持"只采面板所在显示器";`displayId` 能对上宿主自己的显示器标识即可
- **限流与审计**:每次调用记录(插件、显示器、耗时),不记录像素;不需要常驻服务
- **macOS**:屏幕录制授权归 PI-Desktop 应用本身,一次授权对所有插件生效——麻烦在文档里写明,审核时会问到

### 隐私权衡(请一并判断是否可接受)

插件会拿到整屏像素,隐私面比"只回传一个颜色"大一档。我这一侧能承诺并已验证的缓解措施是:插件**不申报任何网络权限**(权限清单里没有 `net.fetch`),像素不可能离开本机;采集是一次性的、没有流式 API,取色在面板的本地 canvas 里算完只剩一个 hex;「屏幕取色」这个来源只有用户主动点击才会触发采集。

如果你们更希望走"宿主只回传一个颜色值"的路线,我也可以按那个方向做,只是宿主侧要多造一个覆盖窗——选择权在你们。

### 我打算怎么做

确认设计后,宿主侧我可以自己实现并提 PR:参照 PR #409 的形状(模块不 import electron、依赖注入以便单测),同步 SDK / Rust 校验 / devkit / 渲染层风险映射 / 八语言文案 / 规范四篇 + zh-CN 镜像 / decisions-log,并按仓库规范跑完整验证。插件侧接上去,是启用现在置灰的「屏幕取色」来源位、复用已有的取色管线,并补齐负路径文案与测试。

最后附上插件当前声明的权限清单,方便评估这个插件的授权面:`ui.panel`、`ui.view`、`ui.theme`、`clipboard.write`、`clipboard.read`、`fs.read`(root 为 `userSelected`,不申报 workspace 范围也没有写权限)、`keyboard.globalShortcut`、`agent.complete`、`models.list`、`agent.tool.register`、`agent.prompt.inject`。
```
## 附录 B:参考坐标

- 插件开发指南:https://github.com/vastsa/PI-Desktop/blob/main/docs/zh-CN/plugin-development.md
- 插件规范:`docs/spec/07-plugins/`(01 系统 / 02 manifest / 03 API / 04 安全 / 06 打包 / 07 市场 / 10 devex / 13 权限矩阵)
- 全局快捷键与实时能力:PR #409、`docs/adr/0257-plugin-real-time-capabilities.md`
- 运行时隔离目标与已知缺口:`docs/adr/0008-plugin-runtime-isolation-target.md`
- 官方插件仓库与发布流程:`vastsa/pi-desktop-plugins` 的 `README.md` 与 `CONTRIBUTING.md`
- 社区先例:文件编辑器(`Tioit-Wang/pi-desktop-plugin-file-manager`,其 issue 评论给出了实测的 API 缺口清单)、会话导入(`muzimu217/pi-desktop-session-import`)、官方终端插件 `pi.terminal`(自带 Go helper,非白名单路线)
