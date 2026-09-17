/**
 * A PI-Desktop host theme generated from one seed color.
 *
 * The shell publishes its palette as CSS custom properties in
 * `apps/desktop/src/styles/tokens.css`, in two layers: a raw scale
 * (`--gray-*`, `--accent-*`) and semantic tokens (`--ds-*`). A **dark** theme
 * can move the raw scale alone, because the dark semantic tokens either
 * reference it (`--ds-bg-primary: var(--gray-900)`) or are mixed from it
 * (`--ds-bg-hover: color-mix(in oklab, var(--gray-0) 6%, transparent)`). The
 * built-in **light** theme takes the other route — it writes `--ds-*` literals
 * and never touches the scale — so a generated light theme mirrors that. The
 * two token maps below are shaped after those two blocks, which is why they
 * look asymmetric: it is the shell's asymmetry, not ours.
 *
 * The host sanitizes whatever we hand `pi.themes.upsert` (no `@import`, no
 * markup, no `url()` beyond `data:`), so every value here is built from hex or
 * `color-mix` and assembled by this module alone — user text never reaches the
 * sheet. Only the theme label carries the user's color name, and it is not CSS.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./color.js"), require("./contrast.js"));
  } else {
    root.PiTheme = factory(root.PiColor, root.PiContrast);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (color, contrast) {
  /**
   * OKLCH lightness and chroma ceiling per `--gray-*` stop.
   *
   * Lightness replicates the built-in ladder exactly (white ink down to the
   * inset plate), so a generated theme sits on the same tonal rhythm as the
   * stock one. Chroma is the *ceiling* at full saturation — dark plates take
   * more tint than the near-white ink, which would look sickly well before
   * that.
   */
  const DARK_LADDER = [
    { stop: "0", l: 1, chroma: 0.006 },
    { stop: "50", l: 0.98, chroma: 0.008 },
    { stop: "75", l: 0.96, chroma: 0.009 },
    { stop: "100", l: 0.94, chroma: 0.01 },
    { stop: "300", l: 0.74, chroma: 0.02 },
    { stop: "500", l: 0.49, chroma: 0.03 },
    { stop: "550", l: 0.44, chroma: 0.032 },
    { stop: "600", l: 0.38, chroma: 0.035 },
    { stop: "700", l: 0.32, chroma: 0.038 },
    { stop: "750", l: 0.28, chroma: 0.04 },
    { stop: "800", l: 0.245, chroma: 0.042 },
    { stop: "900", l: 0.21, chroma: 0.045 },
    { stop: "1000", l: 0.14, chroma: 0.04 },
  ];

  /** The legacy raw accent scale; nothing in the shell reads it today. */
  const ACCENT_LADDER = [
    { stop: "50", l: 0.96, chroma: 0.06 },
    { stop: "100", l: 0.92, chroma: 0.1 },
    { stop: "300", l: 0.78, chroma: 0.16 },
    { stop: "400", l: 0.7, chroma: 0.19 },
    { stop: "900", l: 0.3, chroma: 0.1 },
  ];

  /**
   * Chroma at or above this in the seed counts as fully saturated. It sits
   * just under a vivid blue (`#3b82f6` ≈ 0.19), so a saturated seed reaches
   * the ladder ceilings and a muted one keeps its restraint.
   */
  const FULL_CHROMA = 0.16;

  /** A theme is one slot per base, so regenerating replaces instead of piling up. */
  const THEME_SLOTS = { dark: "pi-theme-dark", light: "pi-theme-light" };

  /** WCAG AA for the accent, which the shell also paints as link and icon ink. */
  const ACCENT_TARGET_RATIO = 4.5;

  /** Our own ceiling, far below the host's 256 KiB; the maps are ~50 declarations. */
  const MAX_THEME_CSS_BYTES = 8192;

  const TOKEN_NAME_PATTERN = /^--[a-z][a-z0-9-]{0,63}$/;

  /**
   * Hue families, bounded by where the names actually sit on the OKLCH wheel
   * rather than by even 30° sectors — pure red is at 29° and pink at 2°, while
   * the blue-to-violet stretch is wide, so an even grid calls red "orange" and
   * purple "indigo". Each entry owns the hues up to its `max`; the last band
   * wraps to 360°. Boundaries were placed from the measured hues of the
   * reference colors (`#ff0000` 29°, `#00ff00` 143°, `#00ffff` 195°,
   * `#3b82f6` 260°, `#8b5cf6` 293°, `#ff00ff` 328°).
   */
  const HUE_BANDS = [
    { max: 15, en: "Pink", zh: "粉" },
    { max: 40, en: "Red", zh: "红" },
    { max: 65, en: "Orange", zh: "橙" },
    { max: 95, en: "Amber", zh: "琥珀" },
    { max: 120, en: "Yellow", zh: "黄" },
    { max: 140, en: "Lime", zh: "黄绿" },
    { max: 165, en: "Green", zh: "绿" },
    { max: 192, en: "Teal", zh: "青绿" },
    { max: 225, en: "Cyan", zh: "青" },
    { max: 252, en: "Azure", zh: "天蓝" },
    { max: 280, en: "Blue", zh: "蓝" },
    { max: 299, en: "Indigo", zh: "靛" },
    { max: 325, en: "Purple", zh: "紫" },
    { max: 345, en: "Magenta", zh: "品红" },
  ];

  /** The family a hue belongs to; bands are ordered, so the first match wins. */
  function hueName(hue) {
    const degrees = ((hue % 360) + 360) % 360;
    for (const band of HUE_BANDS) {
      if (degrees < band.max) return band;
    }
    return HUE_BANDS[0];
  }

  /** Below this the seed is a gray, and naming its hue would be a lie. */
  const NEUTRAL_CHROMA = 0.02;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  /** 0 for a white/black/gray seed, 1 at {@link FULL_CHROMA} and beyond. */
  function saturationOf(oklch) {
    return clamp(oklch.c / FULL_CHROMA, 0, 1);
  }

  function hexAt(lightness, chroma, hue) {
    return color.oklchToHex({ l: lightness, c: chroma, h: hue });
  }

  /** `color-mix` of an ink over whatever is behind it, as the shell writes it. */
  function inkMix(inkHex, percent) {
    return `color-mix(in oklab, ${inkHex} ${percent}%, transparent)`;
  }

  /** `color-mix` of an ink over an opaque plate. */
  function inkOver(inkHex, percent, plateHex) {
    return `color-mix(in oklab, ${inkHex} ${percent}%, ${plateHex})`;
  }

  /**
   * A hex for `oklch` once it reads against `backgroundHex` at `target`.
   *
   * The accent is also link ink and the send-button plate, so "pretty" is not
   * enough — a dark seed on a dark shell would be invisible. Lightness moves
   * away from the background (up on a dark plate, down on a pale one) until the
   * ratio clears, and a seed that cannot get there at all falls back to plain
   * black or white.
   */
  function ensureRatio(oklch, backgroundHex, target) {
    const background = color.hexToOklch(backgroundHex);
    if (!background) return oklch.l >= 0.5 ? "#ffffff" : "#000000";
    const direction = background.l < 0.5 ? 1 : -1;
    let lightness = oklch.l;
    let candidate = hexAt(lightness, oklch.c, oklch.h);
    for (let step = 0; step < 100; step += 1) {
      if (contrast.ratio(candidate, backgroundHex) >= target) return candidate;
      lightness = clamp(lightness + direction * 0.01, 0.04, 1);
      candidate = hexAt(lightness, oklch.c, oklch.h);
      if ((direction > 0 && lightness >= 1) || (direction < 0 && lightness <= 0.04)) break;
    }
    return contrast.bestText(backgroundHex) || candidate;
  }

  /** `fromHex` shifted `amount` in lightness toward `towardHex`; the hover step. */
  function shiftToward(fromHex, towardHex, amount) {
    const from = color.hexToOklch(fromHex);
    const toward = color.hexToOklch(towardHex);
    if (!from || !toward) return fromHex;
    const direction = toward.l >= from.l ? 1 : -1;
    return hexAt(clamp(from.l + direction * amount, 0.04, 1), from.c, from.h);
  }

  /**
   * Every declaration a dark shell needs beyond the raw scale: the three
   * surfaces that are literals there, and the accent trio the shell ties to the
   * ink instead of to a hue.
   */
  function darkTokens(oklch) {
    const saturation = saturationOf(oklch);
    const tokens = {};
    for (const step of DARK_LADDER) {
      tokens[`--gray-${step.stop}`] = hexAt(step.l, step.chroma * saturation, oklch.h);
    }
    for (const step of ACCENT_LADDER) {
      tokens[`--accent-${step.stop}`] = hexAt(step.l, step.chroma * saturation, oklch.h);
    }
    // Deeper than `--gray-1000`, which is the inset plate; the sidebar sits on
    // this one and `#000000` reads as a hole next to a tinted theme.
    const under = hexAt(0.1, 0.035 * saturation, oklch.h);
    tokens["--ds-bg-under"] = under;
    tokens["--ds-settings-rail-bg"] = under;
    tokens["--ds-settings-field-bg"] = tokens["--gray-800"];
    return withAccent(tokens, oklch, tokens["--gray-900"], saturation);
  }

  /**
   * The light base sheet writes `--ds-*` literals and never the raw scale, so
   * a light theme has to do the same: surfaces, ink, the mixes between them,
   * and the same accent trio.
   */
  function lightTokens(oklch) {
    const saturation = saturationOf(oklch);
    const tint = (lightness, chroma) => hexAt(lightness, chroma * saturation, oklch.h);
    const primary = tint(0.998, 0.0025);
    const sidebar = tint(0.965, 0.005);
    const secondary = tint(0.982, 0.004);
    const tertiary = tint(0.965, 0.005);
    const inset = tint(0.938, 0.007);
    const ink = tint(0.235, 0.02);
    const muted = tint(0.49, 0.012);
    const faint = tint(0.74, 0.008);
    const tokens = {
      "--ds-bg-primary": primary,
      "--ds-bg-sidebar": sidebar,
      "--ds-bg-secondary": secondary,
      "--ds-bg-tertiary": tertiary,
      "--ds-bg-inset": inset,
      "--ds-bg-under": secondary,
      "--ds-bg-dock": tint(0.988, 0.003),
      "--ds-bg-dock-raised": primary,
      "--ds-bg-elevated": inkMix(primary, 70),
      "--ds-bg-elevated-opaque": primary,
      "--ds-bg-elevated-primary": inkMix(primary, 70),
      "--ds-bg-hover": inkMix(ink, 5),
      "--ds-bg-active": inkMix(ink, 8),
      "--ds-bg-composer": primary,
      "--ds-bg-chip": inkMix(ink, 4),
      "--ds-sidebar-glass-tint": inkMix(sidebar, 55),
      "--ds-sidebar-glass-sheen-top": "color-mix(in oklab, #ffffff 45%, transparent)",
      "--ds-sidebar-glass-sheen-bottom": "color-mix(in oklab, #ffffff 30%, transparent)",
      "--ds-text-primary": ink,
      "--ds-text-secondary": inkMix(ink, 74),
      "--ds-text-muted": muted,
      "--ds-text-faint": faint,
      "--ds-placeholder-ink": tint(0.42, 0.014),
      "--ds-prose-kbd-fg": tint(0.32, 0.016),
      "--ds-border-default": inkMix(ink, 8),
      "--ds-border-subtle": inkMix(ink, 5),
      "--ds-border-strong": inkMix(ink, 12),
      "--ds-tile": inkMix(ink, 3.5),
      "--ds-tile-hover": inkMix(ink, 6),
      "--ds-tile-deep": inkMix(ink, 8),
      "--ds-raised": primary,
      "--ds-settings-rail-bg": tint(0.955, 0.006),
      "--ds-settings-field-bg": primary,
      "--ds-settings-nav-active": inkOver(ink, 12, primary),
      "--ds-field-inset-bg": tint(0.955, 0.006),
      "--ds-field-inset-focus-bg": primary,
      "--ds-thinking-code-bg": tint(0.945, 0.007),
      "--ds-mermaid-canvas": primary,
      "--ds-code-head-bg": inkMix(ink, 3.5),
      "--ds-code-hover-bg": inkMix(ink, 6),
      // Scrims and veils stay ink-based; the shell uses them to dim, not to tint.
      "--ds-scrim": inkMix(ink, 28),
      "--ds-modal-veil": inkMix(ink, 32),
      "--ds-tool-row-bg": inkMix(ink, 2),
      "--ds-switch-track-off": inkMix(ink, 10),
      "--ds-switch-track-off-hover": inkMix(ink, 18),
      "--ds-switch-ring-off": inkMix(ink, 20),
      "--ds-switch-knob-off": "#ffffff",
      "--ds-switch-knob-on": "#ffffff",
      "--ds-elevation-stroke": `0 0 0 0.5px ${inkMix(ink, 12)}`,
    };
    return withAccent(tokens, oklch, primary, saturation);
  }

  /** The accent trio, shared by both maps so their semantics cannot drift. */
  function withAccent(tokens, oklch, backgroundHex, saturation) {
    const accent = ensureRatio(oklch, backgroundHex, ACCENT_TARGET_RATIO);
    return {
      ...tokens,
      "--ds-accent": accent,
      // Hover moves toward the plate in both built-in themes, so the shift
      // direction follows the background rather than a fixed sign.
      "--ds-accent-hover": shiftToward(accent, backgroundHex, 0.06),
      "--ds-accent-soft": hexAt(
        color.hexToOklch(backgroundHex).l < 0.5 ? 0.74 : 0.49,
        0.02 * saturation,
        oklch.h,
      ),
    };
  }

  /**
   * The token map for one seed and base, or null when the seed is not a color.
   * `meta` carries what the panel shows next to the preview and what the tests
   * assert on; it is not part of the CSS.
   */
  function buildTheme(input) {
    const parsed = color.parse(input?.seed);
    if (!parsed) return null;
    const base = input?.base === "light" ? "light" : "dark";
    const tokens = base === "dark" ? darkTokens(parsed.oklch) : lightTokens(parsed.oklch);
    const background = base === "dark" ? tokens["--gray-900"] : tokens["--ds-bg-primary"];
    return {
      base,
      seed: parsed.hex,
      tokens,
      meta: {
        id: themeIdFor(base),
        hue: parsed.oklch.h,
        chroma: parsed.oklch.c,
        neutral: parsed.oklch.c < NEUTRAL_CHROMA,
        background,
        // The accent is the one token with a contrast promise attached.
        accentRatio: contrast.ratio(tokens["--ds-accent"], background),
      },
    };
  }

  function themeIdFor(base) {
    return base === "light" ? THEME_SLOTS.light : THEME_SLOTS.dark;
  }

  /** The label the host's theme picker shows; localized, never user-authored CSS. */
  function themeLabel({ seed, base, locale }) {
    const parsed = color.parse(seed);
    const localized = String(locale || "").toLowerCase().startsWith("zh");
    const baseName = base === "light" ? (localized ? "浅色" : "Light") : localized ? "深色" : "Dark";
    let family = localized ? "中性" : "Neutral";
    if (parsed && parsed.oklch.c >= NEUTRAL_CHROMA) {
      const band = hueName(parsed.oklch.h);
      family = localized ? band.zh : band.en;
    }
    return `${family} · ${baseName}`;
  }

  /**
   * The sheet handed to `pi.themes.upsert`.
   *
   * The selector is namespaced with the id the host stamps on `<html>`, and
   * carries a bare `[data-theme]` so it outranks the light base block's
   * `:root[data-theme="light"]` by specificity rather than by stylesheet order
   * — the host appends the sheet last today, and this does not depend on it.
   */
  function themeCss({ pluginId, themeId, tokens }) {
    const id = `plugin:${pluginId}:${themeId}`;
    const selector = `:root[data-plugin-theme=${JSON.stringify(id)}][data-theme]`;
    const body = Object.entries(tokens)
      .map(([name, value]) => `${name}: ${value};`)
      .join(" ");
    return `/* ${id} */\n${selector} { ${body} }\n`;
  }

  /**
   * Whether a sheet is something the host's sanitizer will accept, checked
   * here so a bug fails in our tests rather than in the user's app. The host
   * still sanitizes; this only covers the ways *our* generator could misbehave.
   */
  function validateThemeCss(css) {
    const bytes = new TextEncoder().encode(css).length;
    if (bytes > MAX_THEME_CSS_BYTES) return { ok: false, error: `css exceeds ${MAX_THEME_CSS_BYTES} bytes (${bytes})` };
    if (!/\S/.test(css)) return { ok: false, error: "css is empty" };
    for (const forbidden of ["@import", "url(", "<", "javascript:", "expression("]) {
      if (css.toLowerCase().includes(forbidden)) return { ok: false, error: `css contains ${forbidden}` };
    }
    if (!/--[a-z0-9-]+\s*:/i.test(css)) {
      return { ok: false, error: "css declares no custom properties" };
    }
    return { ok: true, bytes };
  }

  /** A token map is only usable if every name and every value is inert. */
  function validateTokens(tokens) {
    for (const [name, value] of Object.entries(tokens)) {
      if (!TOKEN_NAME_PATTERN.test(name)) return { ok: false, error: `bad token name: ${name}` };
      const text = String(value);
      if (/[;{}<>]/.test(text)) return { ok: false, error: `token ${name} contains a delimiter` };
      if (!/^(#[0-9a-f]{6}|color-mix\(in oklab, [#a-z0-9-]+ [0-9.]+%, (transparent|#[0-9a-f]{6})\)|0 0 0 0\.5px color-mix\(in oklab, .+\))$/.test(text)) {
        return { ok: false, error: `token ${name} is not a plain value: ${text}` };
      }
    }
    return { ok: true };
  }

  /**
   * Opaque tokens worth previewing, ordered dark to light so the strip reads as
   * the ramp the theme actually paints. Every value is a hex, so the panel can
   * assign it to `background` without a computed-style round trip. The accent
   * closes the strip: it is the one chip that is a hue rather than a lightness
   * step, which is also why it is not part of the ordering.
   */
  function previewSwatches(tokens, base) {
    const names = base === "light"
      ? ["--ds-text-primary", "--ds-text-muted", "--ds-bg-inset", "--ds-bg-sidebar",
         "--ds-bg-secondary", "--ds-bg-primary", "--ds-accent"]
      : ["--gray-1000", "--gray-900", "--gray-800", "--gray-700", "--gray-300",
         "--gray-0", "--ds-accent"];
    return names
      .filter((name) => typeof tokens[name] === "string")
      .map((name) => ({ name, value: tokens[name] }));
  }

  return {
    buildTheme,
    themeCss,
    themeIdFor,
    themeLabel,
    previewSwatches,
    validateThemeCss,
    validateTokens,
    THEME_SLOTS,
    MAX_THEME_CSS_BYTES,
    ACCENT_TARGET_RATIO,
    NEUTRAL_CHROMA,
  };
});
