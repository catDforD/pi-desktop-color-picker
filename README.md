# 色卡选择器 · Color Picker

面向前端与设计工作的 PI-Desktop 插件:浏览色板、从图片取色、做配色与对比度检查、导出可直接使用的颜色代码,并能让 Agent 直接调用配色。

> **状态:阶段 0-3 已完成,阶段 4 含 Agent 集成已完成** —— 面板里可浏览 Tailwind v4 / Material / 预设配色 / 渐变,从图片或剪贴板取色(带放大镜),做和谐配色、色阶生成、AI 配色、对比度与色盲检查,并导出 CSS 变量、Tailwind v4 `@theme`、Tailwind v3 配置或 JSON;`Alt+Shift+C` 可在任何应用里唤起面板;`suggest_palette` 工具与 skill 让 Agent 也能取用。完整规划见 [PLAN.md](./PLAN.md)。
>
> 插件 id:`io.github.catdford.color-picker`(尚未发布)

## 它解决什么问题

写前端、做设计时反复遇到两件小事:这个颜色是多少号,以及这份配色该怎么搭。这个插件把这两件事放进 PI-Desktop 里,不用再切到浏览器查色值。

## 现在能做什么

- **色板浏览**:Tailwind CSS v4 全部 26 个色系(50–950,OKLCH 源值)、Material Design 19 个色系(含 A100–A700 强调色)、15 套预设配色、12 条渐变
- **色值复制**:HEX / RGB / HSL / OKLCH 四种记法,点哪行复制哪行;点当前色块按设置里的记法复制。Tailwind 色值复制的是官方 OKLCH 原值,不是转换后的近似值
- **从图片取色**:选择文件夹后列出其中的图片,或直接取剪贴板历史里的最新图片;放大镜跟随光标显示真实像素(网格 + 十字准星 + 实时色值),方向键 1px 微调(Shift 一次 10px),点击取色
- **和谐配色**:互补、类似、三角、分裂互补,以 OKLCH 色相旋转计算
- **色阶生成**:由当前色生成 50–950 十一道色阶,500 档精确等于基色
- **AI 配色**:给一句风格描述(或只用当前色),让宿主拥有的模型生成整套命名配色,结果可单点取用、可整套送去导出;模型在面板的「AI 配色」区块里选择(带真实名称的下拉)并记住——插件设置对话框里不再有那一项,因为宿主把声明过的设置原样列出,只会暴露一串 provider key
- **对比度检查**:对白/对黑的 WCAG 对比度与 AA/AAA 判定,以及示例文字预览
- **色盲模拟**:红色盲 / 绿色盲 / 蓝色盲三种模拟结果
- **导出**:CSS 变量、Tailwind v4 `@theme` 块、Tailwind v3 配置、JSON
- **全局快捷键**:`Alt+Shift+C` 唤起面板(被占用时自动降级到 `Ctrl+Alt+C`、`Alt+Shift+P`)
- **Agent 集成**:`suggest_palette` 工具 + `palette-suggestions` skill,Agent 可直接要一套配色

## 计划中(见 PLAN.md)

- 阶段 5:生成并一键安装 PI-Desktop 主题
- 阶段 6:上架
- 二期:屏幕取色(取色器里已预留「屏幕取色」来源位,当前置灰)——需要宿主提供一次性截屏能力 `screen.capture`,方案与理由见 [PLAN.md](./PLAN.md) §5

## 权限

插件按最小权限原则申报,全部权限及用途:

| 权限 | 用途 |
| --- | --- |
| `ui.panel` | 命令与全局快捷键打开独立面板 |
| `ui.view` | 在右侧工作面板提供界面 |
| `clipboard.write` | 复制色值 |
| `clipboard.read` | 读取剪贴板历史以取色(只读,且只在面板里发生) |
| `fs.read` | 读取**你自己选择**的文件夹里的图片;`fs.read.root` 为 `userSelected`,不申报 workspace 范围、不申报任何写权限 |
| `keyboard.globalShortcut` | 申请 `Alt+Shift+C` 作为唤起面板的系统级快捷键 |
| `agent.complete` | 让宿主用**你已配置的模型**做一次性的配色生成 |
| `models.list` | 列出可用模型,供面板里的模型选择器使用 |
| `agent.tool.register` | 注册 `suggest_palette` 工具供 Agent 调用 |
| `agent.prompt.inject` | 通过 `contributes.skills` 提供配色 skill 文档 |

**数据流**:色板浏览、算法、取色与导出全部在本地面板完成。取色只读取你主动选择的目录与剪贴板历史;AI 调用只把你输入的主色/风格描述发给宿主选定的模型,模型凭据在宿主主进程解析,插件拿不到;不访问网络、不写入文件、无常驻后台服务。

Agent 工具在 Plan / Goal 模式下被宿主禁用(这是宿主对所有插件工具的规则)。

## 已知限制

- **AI 生成有 30 秒上限**:面板→主进程的转发通道是 30 秒,而 `agent.complete` 自身允许 90 秒,所以面板里的生成要快;超时会明确提示并保留重试
- **每分钟 8 次**:宿主的调用配额,失败的调用同样计入
- **剪贴板历史不是系统剪贴板**:只有粘贴进会话的图片会进入历史,复制到别处的截图看不到;也没有变更事件,所以只在打开取色层时读一次
- **目录授权是内存级的**:一次只记一个目录,插件重载或应用重启后需要重新选择
- **图片预览上限 5 MiB**:超过会明确提示,不会静默失败
- **全局快捷键需要宿主支持**:该能力来自宿主 PR #409 之后的版本;更早的构建里插件会正常加载但快捷键不生效(日志里有记录)

## 开发

本地调试:启动 PI-Desktop 开发版,进入「插件 → Load development plugin」选择本目录。插件主进程改动会热重载(新增权限会中断重载并要求重新授权)。

```
main.js                    插件入口(主进程,CommonJS):命令、全局快捷键、AI 通道、Agent 工具
renderer/                  面板 / 工作面板视图共用的界面(沙箱页面,走 window.pluginBridge)
  index.html               当前色头部 + 四标签页 + 取色覆盖层
  app.js                   标签控制器、取色覆盖层、AI 区块与全部交互
lib/color.js               HEX/RGB/HSL/OKLCH 转换、CSS 颜色字符串解析
lib/palette.js             色板数据访问(统一命名与色值格式)
lib/generate.js            色阶生成与和谐配色规则
lib/contrast.js            WCAG 对比度与色盲模拟
lib/export.js              CSS 变量 / Tailwind / JSON 导出
lib/pick.js                取色几何与取样(与像素来源解耦,放大镜只认 { width, height, pixelAt })
lib/ai.js                  配色提示词、模型输出的容错解析、导出文档转换
skills/palette-suggestions.md  Agent 用的 skill 文档
lib/data/*.js              色板数据(tailwind / material 为生成产物,勿手改)
tools/gen-palettes.mjs     从 npm 固定版本包重新生成色板数据
tests/                     node --test 用例(65 条)
```

浏览器里 `lib/*.js` 以经典脚本加载(`file://` 源不允许 ES module),因此每个模块都写成 UMD:浏览器挂全局(`PiColor` / `PiPalette` / …),Node 里 `require` 即可——`main.js` 也因此能复用 `lib/ai.js`。

跑测试:

```bash
node --test
```

重新生成色板数据(需要网络,npm 取 `tailwindcss@4.3.3` 与 `material-colors@1.2.6`;产物已提交,日常开发不需要跑):

```bash
node tools/gen-palettes.mjs
```

打包与校验(需要 PI-Desktop 仓库里的 devkit):

```bash
node <PI-Desktop>/packages/plugin-devkit/dist/cli.js check .
```

> 注意:`check` 会报三条 `permission.unused` 误报——`clipboard.write`、`clipboard.read`、`fs.read` 都"未在 main.js 里调用"。原因是静态检查只读 `main.js`,而这三个权限的调用发生在面板里(`renderer/app.js` 经 `window.pluginBridge` 调用 `fs.requestDirectory` / `fs.list` / `fs.readPreview` / `clipboard.getHistory` / `clipboard.writeText`),这正是宿主给面板设计的正常通道。
>
> 另外它会提示 `agent.tool.register`、`agent.prompt.inject` 是高风险权限——这是事实,安装时需你显式授权。

## English

A PI-Desktop plugin for front-end and design work: browse Tailwind v4, Material, preset and gradient palettes, pick colors out of an image or the clipboard history with a pixel loupe, generate harmony schemes, 50–950 scales and AI palettes through the host's own models, check WCAG contrast and color-blindness simulation, and export CSS variables, a Tailwind theme or JSON. `Alt+Shift+C` opens the panel from anywhere, and a `suggest_palette` tool plus skill let the agent ask for a palette directly. Theme installation and marketplace publishing are still to come; see [PLAN.md](./PLAN.md).

## License

MIT
