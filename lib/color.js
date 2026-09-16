/**
 * Color math shared by the view and the tests.
 *
 * Loaded two ways, so it must stay dependency-free and work as a classic
 * script: the sandboxed panel reads it with `<script src>` (ES modules do not
 * load from a `file://` origin), and `node --test` requires it directly.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PiColor = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
  const RGB_PATTERN =
    /^rgba?\(\s*([0-9.]+%?)\s*[,\s]\s*([0-9.]+%?)\s*[,\s]\s*([0-9.]+%?)\s*(?:[,/]\s*[0-9.]+%?\s*)?\)$/i;
  const HSL_PATTERN =
    /^hsla?\(\s*(-?[0-9.]+)(?:deg)?\s*[,\s]\s*([0-9.]+)%\s*[,\s]\s*([0-9.]+)%\s*(?:[,/]\s*[0-9.]+%?\s*)?\)$/i;
  // C may be a number or a percentage (100% = 0.4, per CSS Color 4), and any
  // component may be `none` — Tailwind's achromatic stops use `oklch(98.5% 0 none)`.
  const OKLCH_PATTERN =
    /^oklch\(\s*([0-9.]+|none)(%?)\s+([0-9.]+|none)(%?)\s+(-?[0-9.]+|none)(?:deg)?\s*(?:\/\s*[0-9.]+%?\s*)?\)$/i;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  /** sRGB transfer function, channel in [0, 1]. Also WCAG's linearization. */
  function srgbToLinear(channel) {
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }

  function linearToSrgb(channel) {
    return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
  }

  function normalizeHex(input) {
    if (typeof input !== "string") return null;
    const match = HEX_PATTERN.exec(input.trim());
    if (!match) return null;
    const body = match[1].toLowerCase();
    if (body.length === 3) {
      return `#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`;
    }
    return `#${body}`;
  }

  function hexToRgb(input) {
    const hex = normalizeHex(input);
    if (!hex) return null;
    return {
      r: Number.parseInt(hex.slice(1, 3), 16),
      g: Number.parseInt(hex.slice(3, 5), 16),
      b: Number.parseInt(hex.slice(5, 7), 16),
    };
  }

  function rgbToHex(rgb) {
    if (!rgb || typeof rgb !== "object") return null;
    const channels = [rgb.r, rgb.g, rgb.b].map((value) =>
      clamp(Math.round(Number(value)), 0, 255),
    );
    if (channels.some((value) => !Number.isFinite(value))) return null;
    return `#${channels.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  }

  /** Hue in [0, 360), saturation and lightness in [0, 100]. */
  function rgbToHsl(rgb) {
    if (!rgb) return null;
    const r = clamp(Number(rgb.r), 0, 255) / 255;
    const g = clamp(Number(rgb.g), 0, 255) / 255;
    const b = clamp(Number(rgb.b), 0, 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const lightness = (max + min) / 2;

    let hue = 0;
    if (delta !== 0) {
      if (max === r) hue = ((g - b) / delta) % 6;
      else if (max === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;
      hue *= 60;
      if (hue < 0) hue += 360;
    }

    const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
    return {
      h: round(hue, 1),
      s: round(saturation * 100, 1),
      l: round(lightness * 100, 1),
    };
  }

  function hslToRgb(hsl) {
    if (!hsl) return null;
    const h = ((Number(hsl.h) % 360) + 360) % 360;
    const s = clamp(Number(hsl.s), 0, 100) / 100;
    const l = clamp(Number(hsl.l), 0, 100) / 100;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;

    let rgb;
    if (h < 60) rgb = [c, x, 0];
    else if (h < 120) rgb = [x, c, 0];
    else if (h < 180) rgb = [0, c, x];
    else if (h < 240) rgb = [0, x, c];
    else if (h < 300) rgb = [x, 0, c];
    else rgb = [c, 0, x];

    return {
      r: Math.round((rgb[0] + m) * 255),
      g: Math.round((rgb[1] + m) * 255),
      b: Math.round((rgb[2] + m) * 255),
    };
  }

  // --- OKLab / OKLCH (Björn Ottosson's matrices, CSS Color 4) -----------------

  function linearSrgbToOklab(r, g, b) {
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return {
      L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    };
  }

  function oklabToLinearSrgb(L, a, b) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return {
      r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    };
  }

  function oklchToOklab(oklch) {
    const radians = (Number(oklch.h) * Math.PI) / 180;
    const chroma = Math.max(0, Number(oklch.c));
    return {
      L: Number(oklch.l),
      a: chroma * Math.cos(radians),
      b: chroma * Math.sin(radians),
    };
  }

  /**
   * `{ l, c, h }` (l 0–1, h degrees) to `{ r, g, b }`.
   *
   * Out-of-sRGB colors are clipped per channel, which is what Blink actually
   * does with `oklch()`: verified against Chromium 144, both canvas readback
   * and a screenshot of a CSS-painted element. The CSS Color 4 §13.2
   * chroma-reduction mapping would give a different hex for those colors than
   * the panel renders, so matching the engine beats matching the letter of
   * the spec here.
   *
   * Across all 288 Tailwind v4 values, 280 match Chromium bit for bit and 8
   * differ by one step in a single channel — boundary rounding, both
   * directions. Treat ±1 per channel as the accuracy of any 8-bit conversion.
   */
  function oklchToRgb(oklch) {
    if (!oklch) return null;
    const values = [Number(oklch.l), Number(oklch.c), Number(oklch.h)];
    if (values.some((value) => !Number.isFinite(value))) return null;
    const lab = oklchToOklab({ l: values[0], c: values[1], h: values[2] });
    const linear = oklabToLinearSrgb(lab.L, lab.a, lab.b);
    return {
      r: clamp(Math.round(linearToSrgb(clamp(linear.r, 0, 1)) * 255), 0, 255),
      g: clamp(Math.round(linearToSrgb(clamp(linear.g, 0, 1)) * 255), 0, 255),
      b: clamp(Math.round(linearToSrgb(clamp(linear.b, 0, 1)) * 255), 0, 255),
    };
  }

  function oklchToHex(oklch) {
    return rgbToHex(oklchToRgb(oklch));
  }

  /** `{ r, g, b }` to `{ l, c, h }`; l 0–1, c 0–~0.4, h in [0, 360). */
  function rgbToOklch(rgb) {
    if (!rgb) return null;
    const channels = [rgb.r, rgb.g, rgb.b].map((value) => Number(value));
    if (channels.some((value) => !Number.isFinite(value))) return null;
    const [r, g, b] = channels.map((value) =>
      srgbToLinear(clamp(value, 0, 255) / 255),
    );
    const lab = linearSrgbToOklab(r, g, b);
    const chroma = Math.hypot(lab.a, lab.b);
    // Below the rounding precision there is no meaningful hue; report 0
    // instead of the float noise in atan2.
    let hue = chroma < 1e-6 ? 0 : (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
    if (hue < 0) hue += 360;
    return {
      l: round(lab.L, 4),
      c: round(chroma, 4),
      h: round(hue, 2),
    };
  }

  function hexToOklch(input) {
    const rgb = hexToRgb(input);
    return rgb ? rgbToOklch(rgb) : null;
  }

  // --- CSS string parsing -----------------------------------------------------

  function parseChannel(token) {
    if (token.endsWith("%")) return (Number.parseFloat(token) / 100) * 255;
    return Number.parseFloat(token);
  }

  /** CSS `none` behaves as 0 when a color is converted. */
  function numberOrZero(token) {
    return token === "none" ? 0 : Number.parseFloat(token);
  }

  /** `rgb()`, `hsl()` or `oklch()` text to `{ r, g, b }`; null when unparseable. */
  function cssToRgb(input) {
    if (typeof input !== "string") return null;
    const text = input.trim();

    const rgbMatch = RGB_PATTERN.exec(text);
    if (rgbMatch) {
      const channels = [rgbMatch[1], rgbMatch[2], rgbMatch[3]].map(parseChannel);
      if (channels.some((value) => !Number.isFinite(value))) return null;
      return {
        r: clamp(Math.round(channels[0]), 0, 255),
        g: clamp(Math.round(channels[1]), 0, 255),
        b: clamp(Math.round(channels[2]), 0, 255),
      };
    }

    const hslMatch = HSL_PATTERN.exec(text);
    if (hslMatch) {
      return hslToRgb({
        h: Number.parseFloat(hslMatch[1]),
        s: Number.parseFloat(hslMatch[2]),
        l: Number.parseFloat(hslMatch[3]),
      });
    }

    const oklchMatch = OKLCH_PATTERN.exec(text);
    if (oklchMatch) {
      const lightness = numberOrZero(oklchMatch[1]) / (oklchMatch[2] === "%" ? 100 : 1);
      const chroma =
        (numberOrZero(oklchMatch[3]) / (oklchMatch[4] === "%" ? 100 : 1)) *
        (oklchMatch[4] === "%" ? 0.4 : 1);
      return oklchToRgb({
        l: lightness,
        c: chroma,
        h: numberOrZero(oklchMatch[5]),
      });
    }

    return null;
  }

  /** Any accepted input — hex, `rgb()`, `hsl()`, `oklch()`, or an rgb object. */
  function resolveRgb(input) {
    if (typeof input === "string") {
      return hexToRgb(input) || cssToRgb(input);
    }
    return input && typeof input === "object" ? input : null;
  }

  /** Any supported notation to `{ hex, rgb, hsl, oklch }`; null when unparseable. */
  function parse(input) {
    const rgb = resolveRgb(input);
    if (!rgb) return null;
    const hex = rgbToHex(rgb);
    if (!hex) return null;
    const canonical = hexToRgb(hex);
    return {
      hex,
      rgb: canonical,
      hsl: rgbToHsl(canonical),
      oklch: rgbToOklch(canonical),
    };
  }

  /** Render a parsed color as the notation the user asked to copy. */
  function format(input, notation) {
    const color = typeof input === "string" ? parse(input) : input;
    if (!color || !color.rgb) return null;
    if (notation === "rgb") return `rgb(${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b})`;
    if (notation === "hsl") return `hsl(${color.hsl.h}, ${color.hsl.s}%, ${color.hsl.l}%)`;
    if (notation === "oklch") {
      const oklch = color.oklch || rgbToOklch(color.rgb);
      return `oklch(${round(oklch.l * 100, 1)}% ${round(oklch.c, 3)} ${round(oklch.h, 2)})`;
    }
    return color.hex;
  }

  return {
    normalizeHex,
    hexToRgb,
    rgbToHex,
    rgbToHsl,
    hslToRgb,
    rgbToOklch,
    oklchToRgb,
    oklchToHex,
    hexToOklch,
    cssToRgb,
    srgbToLinear,
    linearToSrgb,
    parse,
    format,
  };
});
