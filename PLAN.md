# 色卡选择器插件 — 开发规划

> 状态:规划阶段(尚未开工)
> 最后更新:2026-09-16

## 1. 背景

- 来源:[vastsa/PI-Desktop issue #87「插件征集(第一期)」](https://github.com/vastsa/PI-Desktop/issues/87)方向 **2️⃣ 色卡选择器**。
- 认领状态:截至 2026-09-16,该 issue 评论仅两条——muzimu217 的会话导入(清单外方向)、Tioit-Wang 的文件编辑器(方向 1️⃣)。**方向 2 无人认领**,官方市场 `catalog.json` 22 个插件中也没有取色/配色类工具。
- 目标:面向写前端和做设计的人,提供一个"取色 + 配色"工具。一期用现有插件 API 就能完成;二期的屏幕放大镜吸色需要宿主新增一项能力。

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
| 宿主主题 | `pi.themes.upsert/remove/list`(ADR 0260,upsert 后正在使用的主题立即生效、无需重载)、`contributes.themes`(静态 `.css` + `base: light/dark`);需 `ui.theme` |
| 通知 | `ui.showToast`(无权限)、`ui.notify` / 原生通知(需 `notify`) |

### 当前不可用

| 缺口 | 说明 |
| --- | --- |
| **屏幕像素** | 无权限、无 API。main 上 `desktopCapturer` / `getDisplayMedia` / `display-capture` / `setDisplayMediaRequestHandler` 全部 0 命中;面板的权限处理器只放行 audio-only 的 `media`(配合 `ui.microphone`) |
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

- **屏幕放大镜吸色**:按快捷键唤起,放大镜跟随光标移动,点击取色并复制色值

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

### 阶段 1 — 骨架与入口(1-2 天)🟡 骨架已完成

已完成:`manifest.json`(面板 + 视图 + 命令 + `format` 设置项)、`main.js`(`color-picker.open` 命令打开面板)、`renderer/`(面板与视图共用一个入口,跟随宿主明暗与语言,色值三格式显示与点击复制)、`lib/color.js`(转换与格式化)与 9 条 `node --test` 用例;`pi-plugin check` 通过。**未做:全局快捷键**(等吸色笔一起做,避免为空操作占用系统级加速键),应用内实机加载待验证。

- `manifest.json`:id / name / i18n(必须同时含 `en` 与 `zh-CN`)/ `main` / `engines.piDesktop`
- `contributes.views` 工作面板视图;`contributes.commands` 命令;`contributes.globalShortcuts` 全局快捷键;`contributes.settings` 设置项
- 跟随宿主明暗与语言(`appearance:changed`)
- 权限最小集:`ui.view`、`ui.settings`、`clipboard.write`

> ⚠️ 每次新增权限都会中断热重载并要求用户重新授权,权限清单尽量一次想清楚。

完成标准:`Load development plugin` 可加载;面板能在工作面板打开;改名改色即时热重载;日志按 pluginId 可见。

### 阶段 2 — 色彩数据与算法(3-5 天,纯逻辑)

- Tailwind 全系色板、Material 色系、预设配色、渐变的静态数据(注意包体积)
- 颜色转换与格式化:HEX / RGB / HSL(建议加 OKLCH)
- 色阶生成(50~950)、和谐规则(互补 / 类似 / 三角 / 分裂互补)
- WCAG 对比度检查,可选色盲模拟
- 导出:CSS 变量、Tailwind 配置片段、JSON

完成标准:单测齐全,含边界用例(纯黑纯白、极值、舍入)。

### 阶段 3 — 取色与放大镜组件(3-5 天)

**放大镜在这里先做出来**,它和将来的屏幕取色复用同一套 UI,只是像素来源不同。

- 文件来源:`fs.requestDirectory()` + `fs.list` / `fs.glob`
- 图片读取:`fs.readPreview` → canvas
- 剪贴板历史图片:`clipboard.getHistory()`(权限 `clipboard.read`)
- 放大镜组件:缩放视图 + 十字准星 + 像素网格 + 方向键微调 + 实时色值读数
- 关键设计:**组件与像素来源解耦**,接口是"给我某坐标的颜色";屏幕取色接入时只换实现
- 反向用例:超大图、非图片文件、权限被拒

### 阶段 4 — AI 配色(2-3 天)

- `pi.agent.complete`(权限 `agent.complete`),提示词要求返回结构化 JSON,本地校验 + 兜底
- 明确处理 `RATE_LIMITED` / `TIMEOUT`,提供手动重试,结果本地缓存
- 可选:`agent.tool.register` 注册配色工具;`agent.prompt.inject` 提供技能
- 设置项支持选模型(需 `models.list`)

### 阶段 5 — 生成并安装宿主主题(3-5 天)

- 两条路:`contributes.themes`(静态 `.css` + `base`)或 `pi.themes.upsert({ id, label, base, css })`(运行时,立即生效)
- CSS 会过 `sanitizeThemeCss`;另有 `pi.themes.setVariables` 只接受已声明变量、不接受 CSS 文本
- 主要工作量:**把配色映射到宿主的设计令牌变量**,明暗两套
- 完成标准:生成 → 预览 → 应用 → 卸载全链路可用(权限 `ui.theme`)

### 阶段 6 — 上架(1-2 天 + 审核等待)

- README 讲清 what / why / permissions
- `python3 scripts/pack_plugin.py plugins/<id>` → `python3 scripts/rebuild_catalog.py` → `python3 scripts/security_audit.py --check-packages`
- PR 到 `vastsa/pi-desktop-plugins`;检查清单:唯一 id、语义化版本、catalog 中 sha256 与 `.piplug` 一致
- 一期不涉及原生二进制或系统级能力,预期走常规审核
- `plugins.aiuo.net` 尚未上线,客户端直接从 GitHub raw 拉 `catalog.json`;每次迭代都是 pack → 重建 catalog → PR

## 5. 轨道 B:宿主取色 API(与 A 并行)

- **B0** 在 issue #87 提需求(见附录 A)→ 等维护者确认设计,**不要提前写代码**
- **B1** 在 PI-Desktop 建 worktree(一个请求 = 一个分支 + 一个 worktree,从 `origin/main` 起),写 ADR
- **B2** 实现:新建 `plugin-screen-picker.ts`(不 import electron、依赖注入以便单测)、`plugin-runtime.ts` 接线(allowlist / dispatch / `assertPermission` / 审计)、`plugin-host-process.mjs` 暴露 API、SDK 权限与类型、Rust 侧校验、devkit 映射、渲染层风险映射、八语言文案、规范四篇(`02`/`03`/`04`/`13`)+ zh-CN 镜像 + `decisions-log`
- **B3** 桩驱动测试(`apps/desktop/test/plugin-screen-picker.test.mjs`,参照 `plugin-shortcuts.test.mjs`)+ 验证命令:`pnpm build:js`、`pnpm --filter @pi-desktop/desktop typecheck`、`pnpm lint`、`pnpm -r --if-present test`、`cargo fmt --check`、`cargo test -p host-core --locked`、`cargo clippy -p host-core --all-targets`
- **B4** PR → 合并 → **合并后在 main 上跑对应 E2E**(场景 ID 必须语义化,如 `E2E-PLUGIN-screen-picker-follows-cursor-across-displays`)

模板参考:PR #409(host-mediated real-time capabilities)是同类改动的现成范本。

## 6. 关键路径与风险

- 阶段 0-6 不依赖任何人,可立即开工;唯一外部依赖是轨道 B,所以"先提需求、再开发"的顺序很重要。
- 建议节奏:先用阶段 1+2 做出"能翻色板、能检查对比度、能一键复制"的可演示版本,拿实物去喂需求讨论。
- 风险点:
  - 阶段 5 的宿主主题令牌映射需要先摸清变量清单,可能超预期。
  - 阶段 4 的模型输出稳定性依赖 JSON 校验与兜底。
  - 若轨道 B 被拒,吸色笔降级为"图片取色 + 剪贴板历史图片取色",一期功能不受影响。

## 附录 A:认领评论草稿

```markdown
认领 **2️⃣ 色卡选择器**。评论区目前只有会话导入(清单外)和文件编辑器两条,这个方向暂时还没人做。

📦 仓库:https://github.com/catDforD/pi-desktop-color-picker(开发中)

## 交付范围

**一期:现有能力就能做完**
- **色板浏览**:预设配色、渐变、Tailwind / Material 色系,在工作面板里直接翻看,不用再开浏览器查色值
- **取色**:打开项目里的设计稿、截图、素材图,在上面点一下就能取到颜色;也支持从剪贴板历史里的图片取色(目录由用户自己选,不申请任何文件权限)
- **AI 配色**:给一个主色或一句风格描述,生成整套搭配并实时预览;也可以让 Agent 直接调用
- **一键复制**:HEX / RGB / HSL、CSS 变量、Tailwind 配置
- **生成并一键换主题**:配色满意后,可以把 PI-Desktop 界面本身换成这套颜色

**二期:需要开放下面那项能力**
- **屏幕放大镜吸色**:按快捷键唤起,放大镜跟随光标移动,点击取色并复制色值

> 可行性依据:一期全部基于现有 API——图片读取用 `pi.fs.readPreview`(图片以 data URL 返回)、剪贴板图片用 `pi.clipboard.getHistory`、AI 用 `pi.agent.complete`、复制导出用 `clipboard.write` 与 `fs.writeText`、主题用 `pi.themes.upsert`。目录通过 `fs.requestDirectory()` 由用户选定,一期不申报任何 fs 写权限。

## 需要开放的能力

请宿主提供一个**放大镜取色窗口**,插件只拿到一个颜色值;屏幕像素和窗口都由宿主自己管。

```ts
// 新权限:screen.capture(high,默认拒绝,调用进审计)
pi.screen.pickColor(input?: {
  hideHostWindow?: boolean   // 默认 true:取色期间隐藏 PI-Desktop 自身
}): Promise<{
  hex: string
  rgb: { r: number; g: number; b: number }
  hsl: { h: number; s: number; l: number }
  position: { x: number; y: number }
} | null>                     // null = 用户按 Esc 取消
```

实测依据:当前 main 中 `PLUGIN_PERMISSIONS` 无屏幕相关条目;`plugin-panel-host.ts` 的 `setPermissionRequestHandler` 只放行 audio-only 的 `media`;全仓库 `desktopCapturer` / `getDisplayMedia` / `setDisplayMediaRequestHandler` 均无命中。

设计理由:
- 插件只拿到颜色值,不需要"全屏透明置顶窗口"这类能力——给插件开这种窗口等于允许任何插件覆盖全屏,是 UI 欺骗面,我也不认为该开。
- 符合 ADR 0257 的既有原则:设备与传输由宿主拥有,插件只交换类型化数据(参考 `keyboard.*` / `audio.*`)。
- 同一个窗体稍加扩展就是方向 3️⃣ 需要的区域选择器,一次实现可服务两个方向;`browser.screenshot` 返回 `{ mimeType, data }` 也已有先例。
- 光标位置不需要单独开口子:覆盖窗页面自身的 `mousemove` 事件即携带屏幕坐标。
- macOS 的屏幕录制授权会归属 PI-Desktop 应用本身,一次授权对所有插件生效。

## 实施计划

- M1 一期功能(不依赖任何新 API)
- M2 接入 `pi.screen.pickColor`,打通放大镜取色
- 明确不做:插件自己的置顶/透明窗口、原生二进制 helper、`fs.write` 全树范围

我可以自己实现宿主侧这部分并提 PR(借鉴 PR #409 的形状:模块不 import electron、依赖注入以便单测,SDK / Rust 校验 / devkit / i18n / 规范 / ADR / E2E 同步更新),按仓库规范走完整验证流程。等你们确认设计再动手,避免方向不一致返工。
```

## 附录 B:参考坐标

- 插件开发指南:https://github.com/vastsa/PI-Desktop/blob/main/docs/zh-CN/plugin-development.md
- 插件规范:`docs/spec/07-plugins/`(01 系统 / 02 manifest / 03 API / 04 安全 / 06 打包 / 07 市场 / 10 devex / 13 权限矩阵)
- 全局快捷键与实时能力:PR #409、`docs/adr/0257-plugin-real-time-capabilities.md`
- 运行时隔离目标与已知缺口:`docs/adr/0008-plugin-runtime-isolation-target.md`
- 官方插件仓库与发布流程:`vastsa/pi-desktop-plugins` 的 `README.md` 与 `CONTRIBUTING.md`
- 社区先例:文件编辑器(`Tioit-Wang/pi-desktop-plugin-file-manager`,其 issue 评论给出了实测的 API 缺口清单)、会话导入(`muzimu217/pi-desktop-session-import`)、官方终端插件 `pi.terminal`(自带 Go helper,非白名单路线)
