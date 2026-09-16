/**
 * Readability helpers: WCAG 2.x contrast ratios, the AA/AAA thresholds, and
 * dichromacy simulation so a palette can be sanity-checked before it ships.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./color.js"));
  } else {
    root.PiContrast = factory(root.PiColor);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (color) {
  /**
   * Machado, Oliveira & Fernandes (2009), severity 1.0, applied in linear
   * RGB. Rows map to the three dichromacies most tools simulate.
   */
  const CVD_MATRICES = {
    protanopia: [
      [0.152286, 1.052583, -0.204868],
      [0.114503, 0.786281, 0.099216],
      [-0.003882, -0.048116, 1.051998],
    ],
    deuteranopia: [
      [0.367322, 0.860646, -0.227968],
      [0.280085, 0.672501, 0.047413],
      [-0.01182, 0.04294, 0.968881],
    ],
    tritanopia: [
      [1.255528, -0.076749, -0.178779],
      [-0.078411, 0.930809, 0.147602],
      [0.004733, 0.691367, 0.3039],
    ],
  };

  const CVD_TYPES = [
    { id: "protanopia", label: { en: "Protanopia", zh: "红色盲" } },
    { id: "deuteranopia", label: { en: "Deuteranopia", zh: "绿色盲" } },
    { id: "tritanopia", label: { en: "Tritanopia", zh: "蓝色盲" } },
  ];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  /** WCAG relative luminance of any accepted notation; 0–1, or null. */
  function luminance(input) {
    const parsed = color.parse(input);
    if (!parsed) return null;
    const [r, g, b] = [parsed.rgb.r, parsed.rgb.g, parsed.rgb.b].map((value) =>
      color.srgbToLinear(value / 255),
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /** WCAG contrast ratio between two colors, 1–21, rounded to 2 decimals. */
  function ratio(a, b) {
    const first = luminance(a);
    const second = luminance(b);
    if (first === null || second === null) return null;
    const lighter = Math.max(first, second);
    const darker = Math.min(first, second);
    return round((lighter + 0.05) / (darker + 0.05), 2);
  }

  /** "AAA", "AA", or "fail" — pass `{ large: true }` for large text. */
  function grade(value, options) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "fail";
    const large = options?.large === true;
    if (value >= (large ? 4.5 : 7)) return "AAA";
    if (value >= (large ? 3 : 4.5)) return "AA";
    return "fail";
  }

  /** Black or white, whichever reads better on the given background. */
  function bestText(input) {
    const parsed = color.parse(input);
    if (!parsed) return null;
    return ratio(parsed.hex, "#000000") >= ratio(parsed.hex, "#ffffff")
      ? "#000000"
      : "#ffffff";
  }

  /** The color as seen with one dichromacy; hex, or null. */
  function simulate(input, type) {
    const matrix = CVD_MATRICES[type];
    const parsed = color.parse(input);
    if (!matrix || !parsed) return null;
    const linear = [parsed.rgb.r, parsed.rgb.g, parsed.rgb.b].map((value) =>
      color.srgbToLinear(value / 255),
    );
    const mapped = matrix.map((row) =>
      clamp(row[0] * linear[0] + row[1] * linear[1] + row[2] * linear[2], 0, 1),
    );
    return color.rgbToHex({
      r: Math.round(color.linearToSrgb(mapped[0]) * 255),
      g: Math.round(color.linearToSrgb(mapped[1]) * 255),
      b: Math.round(color.linearToSrgb(mapped[2]) * 255),
    });
  }

  return { luminance, ratio, grade, bestText, simulate, CVD_TYPES };
});
