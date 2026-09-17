---
name: Color palette suggestions (配色建议)
description: the user asks for a color scheme, palette or theme colors, or colors that go with a brand color - 配色, 色板, 色卡, 主题色, 调色
---

# Suggesting palettes

Use the `suggest_palette` tool when the user asks for colors rather than values:
"give me a palette for a fintech dashboard", "what goes with #3b82f6", "I need a
dark theme's accent colors". Pass the base color in `base` when they named one
and their wording in `style`; both are optional but at least one should be set.

The tool spends the user's model quota through the host and returns named hex
colors. For anything past a first draft, point the user at the color picker
panel instead: it shows the same suggestion next to the harmony rules, contrast
ratios and color-blindness simulation, and can hand the result to the CSS /
Tailwind / JSON exporters.

Two limits worth knowing before you promise anything:

- The tool is hidden in Plan and Goal modes, so it is unavailable until the user
  leaves those modes.
- A panel-triggered generation is capped at 30 seconds of forwarded work, while
  an agent-triggered one gets the full completion budget. Prefer the tool for
  larger requests and the panel for quick iterations.
