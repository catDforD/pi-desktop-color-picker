/**
 * Generation algorithms: a 50–950 shade scale from one base color, and the
 * classic harmony rules. Everything works in OKLCH, so lightness steps look
 * even and hue rotations stay perceptually stable.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./color.js"));
  } else {
    root.PiGenerate = factory(root.PiColor);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (color) {
  const SHADE_STOPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];

  /**
   * Target OKLCH lightness per stop, following the shape of the Tailwind
   * scale (50 near-white, 950 near-black, 500 in the middle). The scale is
   * then re-anchored on the base color: 500 is exactly the input, and the
   * light/dark halves are compressed when the base is extreme, so the ramp
   * never leaves a usable lightness range.
   */
  const SHADE_LIGHTNESS = {
    50: 0.971,
    100: 0.936,
    200: 0.885,
    300: 0.808,
    400: 0.714,
    500: 0.637,
    600: 0.577,
    700: 0.505,
    800: 0.444,
    900: 0.396,
    950: 0.258,
  };

  /** Fraction of the base chroma kept at each stop; ends taper to stay in gamut. */
  const SHADE_CHROMA = {
    50: 0.22,
    100: 0.36,
    200: 0.6,
    300: 0.79,
    400: 0.93,
    500: 1,
    600: 1,
    700: 0.95,
    800: 0.86,
    900: 0.74,
    950: 0.52,
  };

  const LIGHTEST = 0.99;
  const DARKEST = 0.05;

  const HARMONY_RULES = [
    { id: "complementary", label: { en: "Complementary", zh: "互补色" }, deltas: [0, 180] },
    { id: "analogous", label: { en: "Analogous", zh: "类似色" }, deltas: [0, -30, 30] },
    { id: "triadic", label: { en: "Triadic", zh: "三角配色" }, deltas: [0, 120, 240] },
    {
      id: "split-complementary",
      label: { en: "Split complementary", zh: "分裂互补" },
      deltas: [0, 150, 210],
    },
  ];

  function toOklch(input) {
    const parsed = color.parse(input);
    return parsed ? parsed.oklch : null;
  }

  function rotateHue(hue, delta) {
    return ((hue + delta) % 360 + 360) % 360;
  }

  /** Lightness of every stop, anchored so 500 is exactly the base color. */
  function shadeLightness(baseLightness) {
    const lightSpan = SHADE_LIGHTNESS[50] - SHADE_LIGHTNESS[500];
    const darkSpan = SHADE_LIGHTNESS[500] - SHADE_LIGHTNESS[950];
    const lightFactor = Math.max(0, Math.min(1, (LIGHTEST - baseLightness) / lightSpan));
    const darkFactor = Math.max(0, Math.min(1, (baseLightness - DARKEST) / darkSpan));
    const targets = {};
    for (const stop of SHADE_STOPS) {
      const offset = SHADE_LIGHTNESS[stop] - SHADE_LIGHTNESS[500];
      targets[stop] = offset >= 0
        ? baseLightness + offset * lightFactor
        : baseLightness + offset * darkFactor;
    }
    return targets;
  }

  /** Eleven stops (50–950) derived from one base color, keys in scale order. */
  function shades(input) {
    const base = toOklch(input);
    if (!base) return [];
    const targets = shadeLightness(base.l);
    return SHADE_STOPS.map((stop) => {
      const oklch = {
        l: targets[stop],
        c: base.c * SHADE_CHROMA[stop],
        h: base.h,
      };
      return { stop, hex: color.oklchToHex(oklch), oklch };
    });
  }

  /** One harmony rule applied to the base hue; includes the base as delta 0. */
  function harmony(input, ruleId) {
    const rule = HARMONY_RULES.find((item) => item.id === ruleId);
    const base = toOklch(input);
    if (!rule || !base) return [];
    return rule.deltas.map((delta) => {
      const oklch = { l: base.l, c: base.c, h: rotateHue(base.h, delta) };
      return { delta, hex: color.oklchToHex(oklch), oklch };
    });
  }

  return { shades, harmony, rotateHue, SHADE_STOPS, HARMONY_RULES };
});
