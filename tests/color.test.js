const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeHex,
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  parse,
  format,
} = require("../lib/color.js");

test("normalizeHex expands shorthand and lowercases", () => {
  assert.equal(normalizeHex("#ABC"), "#aabbcc");
  assert.equal(normalizeHex("3B82F6"), "#3b82f6");
  assert.equal(normalizeHex("  #3b82f6  "), "#3b82f6");
});

test("normalizeHex rejects malformed input", () => {
  for (const value of ["", "#", "#12", "#12345", "#gggggg", "#1234567", null, 42]) {
    assert.equal(normalizeHex(value), null, `expected null for ${String(value)}`);
  }
});

test("hexToRgb reads the three channels", () => {
  assert.deepEqual(hexToRgb("#3b82f6"), { r: 59, g: 130, b: 246 });
  assert.deepEqual(hexToRgb("#000000"), { r: 0, g: 0, b: 0 });
  assert.deepEqual(hexToRgb("#ffffff"), { r: 255, g: 255, b: 255 });
  assert.equal(hexToRgb("not a color"), null);
});

test("rgbToHex clamps and rounds out-of-range channels", () => {
  assert.equal(rgbToHex({ r: 59, g: 130, b: 246 }), "#3b82f6");
  assert.equal(rgbToHex({ r: -10, g: 300, b: 128.6 }), "#00ff81");
  assert.equal(rgbToHex({ r: Number.NaN, g: 0, b: 0 }), null);
});

test("rgbToHsl matches the known anchors", () => {
  assert.deepEqual(rgbToHsl({ r: 255, g: 0, b: 0 }), { h: 0, s: 100, l: 50 });
  assert.deepEqual(rgbToHsl({ r: 0, g: 255, b: 0 }), { h: 120, s: 100, l: 50 });
  assert.deepEqual(rgbToHsl({ r: 0, g: 0, b: 255 }), { h: 240, s: 100, l: 50 });
  assert.deepEqual(rgbToHsl({ r: 0, g: 0, b: 0 }), { h: 0, s: 0, l: 0 });
  assert.deepEqual(rgbToHsl({ r: 255, g: 255, b: 255 }), { h: 0, s: 0, l: 100 });
  assert.deepEqual(rgbToHsl({ r: 128, g: 128, b: 128 }), { h: 0, s: 0, l: 50.2 });
});

test("hsl round-trips through rgb within rounding tolerance", () => {
  for (const hex of ["#3b82f6", "#0f172a", "#f8fafc", "#ef4444", "#22c55e", "#a855f7"]) {
    const rgb = hexToRgb(hex);
    const back = hslToRgb(rgbToHsl(rgb));
    for (const channel of ["r", "g", "b"]) {
      assert.ok(
        Math.abs(back[channel] - rgb[channel]) <= 1,
        `${hex} channel ${channel}: ${back[channel]} vs ${rgb[channel]}`,
      );
    }
  }
});

test("hslToRgb normalizes hue outside one turn", () => {
  assert.deepEqual(hslToRgb({ h: 360, s: 100, l: 50 }), { r: 255, g: 0, b: 0 });
  assert.deepEqual(hslToRgb({ h: -120, s: 100, l: 50 }), { r: 0, g: 0, b: 255 });
});

test("parse returns every notation for one color", () => {
  const color = parse("#3b82f6");
  assert.equal(color.hex, "#3b82f6");
  assert.deepEqual(color.rgb, { r: 59, g: 130, b: 246 });
  assert.deepEqual(color.hsl, { h: 217.2, s: 91.2, l: 59.8 });
  assert.equal(parse("#zzzzzz"), null);
});

test("format renders the requested notation", () => {
  const color = parse("#3b82f6");
  assert.equal(format(color, "hex"), "#3b82f6");
  assert.equal(format(color, "rgb"), "rgb(59, 130, 246)");
  assert.equal(format(color, "hsl"), "hsl(217.2, 91.2%, 59.8%)");
  assert.equal(format(color, "unknown"), "#3b82f6");
  assert.equal(format(parse("#zzzzzz"), "hex"), null);
});
