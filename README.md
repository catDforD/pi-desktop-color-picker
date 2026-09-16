# 色卡选择器 · Color Picker

面向前端与设计工作的 PI-Desktop 插件:浏览色板、做配色与对比度检查、导出可直接使用的颜色代码。取色(图片/剪贴板)与 AI 配色在后续阶段接入。

> **状态:阶段 2 已完成** —— 面板里可浏览 Tailwind v4 / Material / 预设配色 / 渐变,做和谐配色与色阶生成,检查对比度与色盲模拟,并导出 CSS 变量、Tailwind v4 `@theme`、Tailwind v3 配置或 JSON。完整规划见 [PLAN.md](./PLAN.md)。
>
> 插件 id:`io.github.catdford.color-picker`(尚未发布)

## 它解决什么问题

写前端、做设计时反复遇到两件小事:这个颜色是多少号,以及这份配色该怎么搭。这个插件把这两件事放进 PI-Desktop 里,不用再切到浏览器查色值。

## 现在能做什么

- **色板浏览**:Tailwind CSS v4 全部 26 个色系(50–950,OKLCH 源值)、Material Design 19 个色系(含 A100–A700 强调色)、15 套预设配色、12 条渐变
- **色值复制**:HEX / RGB / HSL / OKLCH 四种记法,点哪行复制哪行;点当前色块按设置里的记法复制。Tailwind 色值复制的是官方 OKLCH 原值,不是转换后的近似值
- **和谐配色**:互补、类似、三角、分裂互补,以 OKLCH 色相旋转计算
- **色阶生成**:由当前色生成 50–950 十一道色阶,500 档精确等于基色
- **对比度检查**:对白/对黑的 WCAG 对比度与 AA/AAA 判定,以及示例文字预览
- **色盲模拟**:红色盲 / 绿色盲 / 蓝色盲三种模拟结果
- **导出**:CSS 变量、Tailwind v4 `@theme` 块、Tailwind v3 配置、JSON

## 计划中(见 PLAN.md)

- 阶段 3:从图片取色(用户自选目录)与剪贴板历史图片取色,放大镜组件
- 阶段 4:AI 配色(`pi.agent.complete`)
- 阶段 5:生成并一键安装 PI-Desktop 主题
- 二期:屏幕放大镜吸色(需宿主开放屏幕采集能力)

## 权限

插件按最小权限原则申报,当前使用的权限:

| 权限 | 用途 |
| --- | --- |
| `ui.panel` | 命令与后续快捷键打开独立面板 |
| `ui.view` | 在右侧工作面板提供界面 |
| `clipboard.write` | 复制色值 |

色板浏览、算法与导出全部在本地面板里完成,不访问网络、不读写文件。

## 开发

本地调试:启动 PI-Desktop 开发版,进入「插件 → Load development plugin」选择本目录。插件主进程改动会热重载(新增权限会中断重载并要求重新授权)。

```
main.js                    插件入口(主进程,CommonJS),注册命令
renderer/                  面板 / 工作面板视图共用的界面(沙箱页面,走 window.pluginBridge)
  index.html               头部常驻当前色 + 四个标签页(色板/配色/对比度/导出)
  app.js                   标签控制器与全部交互
lib/color.js               HEX/RGB/HSL/OKLCH 转换、CSS 颜色字符串解析
lib/palette.js             色板数据访问(统一命名与色值格式)
lib/generate.js            色阶生成与和谐配色规则
lib/contrast.js            WCAG 对比度与色盲模拟
lib/export.js              CSS 变量 / Tailwind / JSON 导出
lib/data/tailwind.js       Tailwind v4 色板(生成产物,勿手改)
lib/data/material.js       Material 色板(生成产物,勿手改)
lib/data/presets.js        手工维护的预设配色与渐变
tools/gen-palettes.mjs     从 npm 固定版本包重新生成上面两个数据文件
tests/                     node --test 用例
```

浏览器里 `lib/*.js` 以经典脚本加载(`file://` 源不允许 ES module),因此每个模块都写成 UMD:浏览器挂全局(`PiColor` / `PiPalette` / …),Node 里 `require` 即可。

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

> 注意:`check` 会报一条 `permission.unused: clipboard.write ... main.js never calls
> clipboard.writeText`。这是静态检查只读 `main.js` 导致的误报——本插件的剪贴板写入发生在
> 面板里(`renderer/app.js` 经 `window.pluginBridge` 调用),这是宿主给面板设计的正常通道。

## English

A PI-Desktop plugin for front-end and design work: browse Tailwind v4, Material, preset and gradient palettes, generate harmony schemes and 50–950 scales, check WCAG contrast and color-blindness simulation, and export CSS variables, a Tailwind theme or JSON — all computed locally in the panel. Image picking, AI schemes and theme installation are planned; see [PLAN.md](./PLAN.md).

## License

MIT
