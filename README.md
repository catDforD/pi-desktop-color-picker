# 色卡选择器 · Color Picker

面向前端与设计工作的 PI-Desktop 插件:浏览色板、从图片取色、AI 生成配色,并可直接把配色装成 PI-Desktop 主题。

> **状态:规划阶段,尚未实现。** 开发规划见 [PLAN.md](./PLAN.md)。
>
> Planned plugin id: `io.github.catdford.color-picker`(尚未发布,发布前仍可调整)

## 它解决什么问题

写前端、做设计时反复遇到两件小事:这个颜色是多少号,以及这份配色该怎么搭。这个插件把这两件事放进 PI-Desktop 里,不用再切到浏览器查色值。

## 计划的功能

**一期(基于现有插件 API)**

- 色板浏览:预设配色、渐变、Tailwind / Material 色系
- 取色:从项目里的设计稿、截图、素材图上点选取色;也支持剪贴板历史里的图片
- AI 配色:按主色或风格描述生成整套搭配并实时预览
- 一键复制:HEX / RGB / HSL、CSS 变量、Tailwind 配置
- 生成并一键换主题:把配色装成 PI-Desktop 主题

**二期(需要宿主新增屏幕采集能力)**

- 屏幕放大镜吸色:快捷键唤起,放大镜跟随光标,点击取色

## 权限

插件按最小权限原则申报,当前计划使用的权限:

| 权限 | 用途 |
| --- | --- |
| `ui.view` | 在右侧工作面板提供界面 |
| `ui.settings` | 插件自身的设置项 |
| `clipboard.read` | 读取剪贴板历史中的图片用于取色 |
| `clipboard.write` | 复制色值 |
| `ui.theme` | 生成并安装 PI-Desktop 主题 |
| `agent.complete` | 调用宿主模型生成配色方案(宿主解析凭据,插件不接触密钥) |
| `keyboard.globalShortcut` | 全局快捷键唤起取色(二期) |
| `fs.read` | 读取用户主动选择的图片用于取色(仅 `userSelected` 目录) |

不申请任何文件写入权限(主题由 `pi.themes` 管理,不需要写盘);不内置原生二进制。

## 开发

本地调试:启动 PI-Desktop 开发版,进入「插件 → Load development plugin」选择本目录。插件主进程改动会热重载(新增权限会中断重载并要求重新授权)。

## English

A PI-Desktop plugin for front-end and design work: browse palettes, pick colors from images, generate schemes with AI, and install the result as a PI-Desktop theme. Planning stage — see [PLAN.md](./PLAN.md).

## License

MIT
