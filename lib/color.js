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

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  /** Normalize `#abc`, `abc`, `#AABBCC` to lowercase `#aabbcc`; null when invalid. */
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

  /** Any supported notation to `{ hex, rgb, hsl }`; null when unparseable. */
  function parse(input) {
    const rgb = typeof input === "string" ? hexToRgb(input) : input;
    if (!rgb) return null;
    const hex = rgbToHex(rgb);
    if (!hex) return null;
    return { hex, rgb: hexToRgb(hex), hsl: rgbToHsl(hexToRgb(hex)) };
  }

  /** Render a parsed color as the notation the user asked to copy. */
  function format(input, notation) {
    const color = typeof input === "string" && input.startsWith("#") ? parse(input) : input;
    if (!color) return null;
    if (notation === "rgb") return `rgb(${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b})`;
    if (notation === "hsl") return `hsl(${color.hsl.h}, ${color.hsl.s}%, ${color.hsl.l}%)`;
    return color.hex;
  }

  return { normalizeHex, hexToRgb, rgbToHex, rgbToHsl, hslToRgb, parse, format };
});
