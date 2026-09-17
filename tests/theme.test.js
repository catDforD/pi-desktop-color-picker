"use strict";

/**
 * The generated host theme: the token maps, the sheet, and the promises the
 * panel makes to the user about them (an accent that reads, a sheet the host
 * will not reject, a name Settings can show).
 *
 * The two name lists below are the contract with the shell. A typo in a token
 * name is not a crash — the theme simply stops recoloring that surface — so it
 * has to fail here instead, which is what pinning the exact keys does.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const theme = require("../lib/theme.js");
const color = require("../lib/color.js");
const contrast = require("../lib/contrast.js");

const PLUGIN_ID = "io.github.catdford.color-picker";

/** Every token `apps/desktop/src/styles/tokens.css` defines that we move. */
const DARK_TOKENS = [
  "--gray-0", "--gray-50", "--gray-75", "--gray-100", "--gray-300", "--gray-500",
  "--gray-550", "--gray-600", "--gray-700", "--gray-750", "--gray-800", "--gray-900",
  "--gray-1000",
  "--accent-50", "--accent-100", "--accent-300", "--accent-400", "--accent-900",
  "--ds-bg-under", "--ds-settings-rail-bg", "--ds-settings-field-bg",
  "--ds-accent", "--ds-accent-hover", "--ds-accent-soft",
];

const LIGHT_TOKENS = [
  "--ds-bg-primary", "--ds-bg-sidebar", "--ds-bg-secondary", "--ds-bg-tertiary",
  "--ds-bg-inset", "--ds-bg-under", "--ds-bg-dock", "--ds-bg-dock-raised",
  "--ds-bg-elevated", "--ds-bg-elevated-opaque", "--ds-bg-elevated-primary",
  "--ds-bg-hover", "--ds-bg-active", "--ds-bg-composer", "--ds-bg-chip",
  "--ds-sidebar-glass-tint", "--ds-sidebar-glass-sheen-top", "--ds-sidebar-glass-sheen-bottom",
  "--ds-text-primary", "--ds-text-secondary", "--ds-text-muted", "--ds-text-faint",
  "--ds-placeholder-ink", "--ds-prose-kbd-fg",
  "--ds-border-default", "--ds-border-subtle", "--ds-border-strong",
  "--ds-tile", "--ds-tile-hover", "--ds-tile-deep", "--ds-raised",
  "--ds-settings-rail-bg", "--ds-settings-field-bg", "--ds-settings-nav-active",
  "--ds-field-inset-bg", "--ds-field-inset-focus-bg", "--ds-thinking-code-bg",
  "--ds-mermaid-canvas", "--ds-code-head-bg", "--ds-code-hover-bg",
  "--ds-scrim", "--ds-modal-veil", "--ds-tool-row-bg",
  "--ds-switch-track-off", "--ds-switch-track-off-hover", "--ds-switch-ring-off",
  "--ds-switch-knob-off", "--ds-switch-knob-on", "--ds-elevation-stroke",
  "--ds-accent", "--ds-accent-hover", "--ds-accent-soft",
];

/** Seeds a user can plausibly arrive with, including the degenerate ones. */
const SEEDS = [
  "#3b82f6", "#0b1f33", "#f97362", "#ffb03a", "#10b981", "#7c3aed",
  "#ffffff", "#000000", "#808080", "#7f1d1d",
  "oklch(62.3% 0.188 259.81)", "rgb(255, 0, 0)",
];

function sheetFor(seed, base) {
  const built = theme.buildTheme({ seed, base });
  return { built, css: theme.themeCss({ pluginId: PLUGIN_ID, themeId: built.meta.id, tokens: built.tokens }) };
}

test("the dark map moves the raw scale the dark shell derives from", () => {
  const { built } = sheetFor("#3b82f6", "dark");
  assert.deepEqual(Object.keys(built.tokens).sort(), [...DARK_TOKENS].sort());
  // The shell reads `--gray-0` as ink and `--gray-900` as the page, so the two
  // must stay far apart whatever the seed does to them.
  assert.ok(contrast.ratio(built.tokens["--gray-0"], built.tokens["--gray-900"]) >= 7);
});

test("the light map writes the semantic tokens the light block writes", () => {
  const { built } = sheetFor("#3b82f6", "light");
  assert.deepEqual(Object.keys(built.tokens).sort(), [...LIGHT_TOKENS].sort());
  assert.ok(
    contrast.ratio(built.tokens["--ds-text-primary"], built.tokens["--ds-bg-primary"]) >= 7,
  );
});

test("the gray ladder runs light to dark in the shell's own order", () => {
  const { built } = sheetFor("#0ea5e9", "dark");
  const stops = DARK_TOKENS.filter((name) => name.startsWith("--gray-"));
  const lightness = stops.map((name) => color.hexToOklch(built.tokens[name]).l);
  for (let index = 1; index < lightness.length; index += 1) {
    assert.ok(
      lightness[index] < lightness[index - 1],
      `${stops[index]} (${lightness[index]}) should be darker than ${stops[index - 1]} (${lightness[index - 1]})`,
    );
  }
});

test("the accent stays readable on the plate it lands on", () => {
  for (const seed of SEEDS) {
    for (const base of ["dark", "light"]) {
      const { built } = sheetFor(seed, base);
      const plate = base === "dark" ? built.tokens["--gray-900"] : built.tokens["--ds-bg-primary"];
      const ratio = contrast.ratio(built.tokens["--ds-accent"], plate);
      assert.ok(
        ratio >= theme.ACCENT_TARGET_RATIO - 0.01,
        `${seed} on ${base}: accent ${built.tokens["--ds-accent"]} is ${ratio.toFixed(2)}:1 against ${plate}`,
      );
    }
  }
});

test("a seed that cannot reach the target falls back to black or white", () => {
  // A near-black seed on the darkest plate has no ratio to give: the ladder
  // walks the lightness up until it clears, so the accent is nothing like the
  // seed textually, but it is still a color that reads.
  const { built } = sheetFor("#000000", "dark");
  assert.match(built.tokens["--ds-accent"], /^#[0-9a-f]{6}$/);
  assert.ok(contrast.ratio(built.tokens["--ds-accent"], built.tokens["--gray-900"]) >= 4.49);
});

test("a neutral seed produces a neutral theme", () => {
  const { built } = sheetFor("#808080", "dark");
  for (const [name, value] of Object.entries(built.tokens)) {
    const chroma = color.hexToOklch(value).c;
    assert.ok(chroma < 0.01, `${name} (${value}) kept a chroma of ${chroma}`);
  }
  assert.equal(built.meta.neutral, true);
});

test("the sheet namespaces its selector and passes our own gate", () => {
  const { built, css } = sheetFor("#3b82f6", "dark");
  assert.match(css, /:root\[data-plugin-theme="plugin:io\.github\.catdford\.color-picker:pi-theme-dark"\]/);
  // The extra attribute is what makes the rule outrank the light base block on
  // specificity rather than on stylesheet order.
  assert.match(css, /\[data-theme\]/);
  assert.deepEqual(theme.validateThemeCss(css), { ok: true, bytes: css.length });
  assert.deepEqual(theme.validateTokens(built.tokens), { ok: true });
  assert.ok(css.length < theme.MAX_THEME_CSS_BYTES);
});

test("every declaration in the sheet is a custom property with an inert value", () => {
  for (const base of ["dark", "light"]) {
    const { css } = sheetFor("#3b82f6", base);
    const body = css.slice(css.indexOf("{") + 1, css.lastIndexOf("}"));
    const declarations = body.split(";").map((piece) => piece.trim()).filter(Boolean);
    assert.ok(declarations.length > 20, `${base}: expected a full token map, got ${declarations.length}`);
    for (const declaration of declarations) {
      const match = /^(--[a-z0-9-]+): (.+)$/.exec(declaration);
      assert.ok(match, `${base}: not a declaration: ${declaration}`);
      assert.ok(!/[;{}<>]/.test(match[2]), `${base}: value escapes the rule: ${declaration}`);
    }
    // What the host's sanitizer refuses, and what would let a value break out.
    for (const forbidden of ["@import", "url(", "<", "javascript:", "expression(", "!important"]) {
      assert.ok(!css.includes(forbidden), `${base}: sheet contains ${forbidden}`);
    }
  }
});

test("generation is deterministic", () => {
  const first = sheetFor("#3b82f6", "dark").css;
  const second = sheetFor("#3b82f6", "dark").css;
  assert.equal(first, second);
  // Two notations for the same color are the same theme.
  assert.equal(sheetFor("rgb(59, 130, 246)", "dark").css, first);
  assert.equal(sheetFor("#3B82F6", "dark").css, first);
});

test("a seed that is not a color yields no theme", () => {
  for (const seed of ["", "  ", "not-a-color", undefined, null, "#12345"]) {
    assert.equal(theme.buildTheme({ seed, base: "dark" }), null);
  }
});

test("validateTokens refuses a value that could escape the rule", () => {
  assert.deepEqual(theme.validateTokens({ "--ds-bg-primary": "#ffffff" }), { ok: true });
  assert.equal(theme.validateTokens({ "--ds-bg-primary": "red; } body { display: none" }).ok, false);
  assert.equal(theme.validateTokens({ "--ds-bg-primary": "url(https://example.com/x.png)" }).ok, false);
  assert.equal(theme.validateTokens({ "not-a-token": "#ffffff" }).ok, false);
});

test("validateThemeCss refuses what the host would refuse", () => {
  assert.equal(theme.validateThemeCss(":root { --x: red; @import 'a.css'; }").ok, false);
  assert.equal(theme.validateThemeCss(":root { --x: url(http://x/y.png); }").ok, false);
  assert.equal(theme.validateThemeCss(":root { --x: #fff; } <style>").ok, false);
  assert.equal(theme.validateThemeCss("").ok, false);
  assert.equal(theme.validateThemeCss(`:root { --x: ${"a".repeat(theme.MAX_THEME_CSS_BYTES)}; }`).ok, false);
});

test("the preview strip is opaque hex in ramp order, accent last", () => {
  for (const base of ["dark", "light"]) {
    const { built } = sheetFor("#3b82f6", base);
    const swatches = theme.previewSwatches(built.tokens, base);
    assert.equal(swatches.length, 7);
    for (const swatch of swatches) {
      assert.match(swatch.value, /^#[0-9a-f]{6}$/, `${base}: ${swatch.name} is not opaque`);
      assert.ok(built.tokens[swatch.name] === swatch.value);
    }
    // The accent closes the strip rather than continuing the ramp: it is the
    // one chip that is a hue, not a lightness step.
    assert.equal(swatches.at(-1).name, "--ds-accent");
    const lightness = swatches.slice(0, -1).map((swatch) => color.hexToOklch(swatch.value).l);
    for (let index = 1; index < lightness.length; index += 1) {
      assert.ok(lightness[index] > lightness[index - 1], `${base}: preview is not ordered`);
    }
  }
});

test("the theme id is one slot per base, so a regeneration replaces", () => {
  assert.equal(theme.themeIdFor("dark"), "pi-theme-dark");
  assert.equal(theme.themeIdFor("light"), "pi-theme-light");
  assert.equal(theme.themeIdFor(undefined), "pi-theme-dark");
  assert.equal(theme.buildTheme({ seed: "#fff", base: "light" }).meta.id, "pi-theme-light");
});

test("the label names the seed's hue family in the panel's language", () => {
  const cases = [
    ["#ff0000", "红", "Red"],
    ["#ff0080", "粉", "Pink"],
    ["#ff6600", "橙", "Orange"],
    ["#f59e0b", "琥珀", "Amber"],
    ["#ffff00", "黄", "Yellow"],
    ["#80ff00", "黄绿", "Lime"],
    ["#00ff00", "绿", "Green"],
    ["#14b8a6", "青绿", "Teal"],
    ["#00ffff", "青", "Cyan"],
    ["#0ea5e9", "天蓝", "Azure"],
    ["#3b82f6", "蓝", "Blue"],
    ["#8b5cf6", "靛", "Indigo"],
    ["#a855f7", "紫", "Purple"],
    ["#ff00ff", "品红", "Magenta"],
    ["#808080", "中性", "Neutral"],
  ];
  for (const [seed, zh, en] of cases) {
    assert.equal(theme.themeLabel({ seed, base: "dark", locale: "zh-CN" }), `${zh} · 深色`);
    assert.equal(theme.themeLabel({ seed, base: "light", locale: "en" }), `${en} · Light`);
  }
});

test("a theme label is never the user's text", () => {
  // The label is the one string that travels to the host's Settings list, so it
  // has to be built from our own vocabulary even for an odd locale.
  const label = theme.themeLabel({ seed: "#3b82f6", base: "dark", locale: "" });
  assert.equal(label, "Blue · Dark");
  assert.equal(theme.themeLabel({ seed: "#3b82f6", base: "dark", locale: "fr" }), "Blue · Dark");
  assert.equal(theme.themeLabel({ seed: "", base: "dark", locale: "en" }), "Neutral · Dark");
});
