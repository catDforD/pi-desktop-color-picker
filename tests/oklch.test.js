const test = require("node:test");
const assert = require("node:assert/strict");

const color = require("../lib/color.js");
const tailwind = require("../lib/data/tailwind.js");

test("oklchToHex matches Chromium for the Tailwind anchors", () => {
  // Golden values read back from Chromium 144 (canvas readback on the same
  // oklch() strings — Blink is the engine the plugin panel renders in).
  const cases = {
    "oklch(64.5% 0.246 16.439)": "#ff2056", // rose-500
    "oklch(63.7% 0.237 25.331)": "#fb2c36", // red-500
    "oklch(62.3% 0.214 259.815)": "#2b7fff", // blue-500
    "oklch(55.4% 0.046 257.417)": "#62748e", // slate-500
    "oklch(69.6% 0.17 162.48)": "#00bc7d", // emerald-500
    "oklch(66.7% 0.295 322.15)": "#e12afb", // fuchsia-500
    "oklch(97.1% 0.013 17.38)": "#fef2f2", // red-50
    "oklch(12.9% 0.042 264.695)": "#020618", // slate-950
    "oklch(98.5% 0 none)": "#fafafa", // zinc-50, achromatic form
    "oklch(100% 0 0)": "#ffffff",
    "oklch(0% 0 0)": "#000000",
  };
  for (const [value, hex] of Object.entries(cases)) {
    assert.equal(color.parse(value).hex, hex, `${value} should be ${hex}`);
  }
});

test("out-of-gamut oklch clips per channel, exactly like Chromium", () => {
  // Chromium does not run the CSS Color 4 chroma-reduction mapping; it clamps
  // the linear-sRGB channels. These are the values it paints, not guesses.
  assert.equal(color.parse("oklch(70% 0.4 30)").hex, "#ff0000");
  assert.equal(color.parse("oklch(50% 0.3 140)").hex, "#008300");
  assert.equal(color.parse("oklch(80% 0.25 200)").hex, "#00e8fc");
});

test("rgbToOklch matches the reference values for pure colors", () => {
  assert.deepEqual(color.rgbToOklch({ r: 255, g: 0, b: 0 }), { l: 0.628, c: 0.2577, h: 29.23 });
  assert.deepEqual(color.rgbToOklch({ r: 255, g: 255, b: 255 }), { l: 1, c: 0, h: 0 });
  assert.deepEqual(color.rgbToOklch({ r: 0, g: 0, b: 0 }), { l: 0, c: 0, h: 0 });
  // Achromatic colors report hue 0, not the float noise from atan2.
  assert.equal(color.rgbToOklch({ r: 128, g: 128, b: 128 }).h, 0);
  assert.equal(color.rgbToOklch({ r: Number.NaN, g: 0, b: 0 }), null);
});

test("every bundled Tailwind stop survives a hex round trip", () => {
  let checked = 0;
  for (const ramp of Object.values(tailwind.ramps)) {
    for (const value of Object.values(ramp)) {
      const once = color.parse(value).hex;
      const twice = color.oklchToHex(color.hexToOklch(once));
      assert.equal(twice, once, `${value} round-tripped to ${twice}, expected ${once}`);
      checked += 1;
    }
  }
  assert.equal(checked, 286);
});

test("cssToRgb parses rgb(), hsl() and oklch() strings", () => {
  const expected = "#3b82f6";
  assert.equal(color.parse("rgb(59, 130, 246)").hex, expected);
  assert.equal(color.parse("rgb(59 130 246)").hex, expected);
  assert.equal(color.parse("rgb(23.1% 51% 96.5%)").hex, expected);
  assert.equal(color.parse("hsl(217.2, 91.2%, 59.8%)").hex, expected);
  assert.equal(color.parse("hsl(217.2 91.2% 59.8% / 0.5)").hex, expected);
  assert.equal(color.parse("oklch(62.3% 0.188 259.81)").hex, expected);
  assert.equal(color.parse("oklch(0.623 0.188 259.81)").hex, expected);
  assert.equal(color.parse("oklch(62.3% 47% 259.81)").hex, expected); // C as percentage
  assert.equal(color.parse("not a color"), null);
  assert.equal(color.parse("rgb(1 2)"), null);
});

test("format renders oklch from both parsed colors and raw strings", () => {
  const parsed = color.parse("#3b82f6");
  assert.equal(color.format(parsed, "oklch"), "oklch(62.3% 0.188 259.81)");
  assert.equal(color.format("#3b82f6", "oklch"), "oklch(62.3% 0.188 259.81)");
  assert.equal(color.format("oklch(62.3% 0.188 259.81)", "oklch"), "oklch(62.3% 0.188 259.81)");
  assert.equal(color.format("nonsense", "oklch"), null);
});

test("parse exposes all four notations for one color", () => {
  const parsed = color.parse("#3b82f6");
  assert.deepEqual(Object.keys(parsed).sort(), ["hex", "hsl", "oklch", "rgb"]);
  assert.equal(parsed.oklch.h, 259.81);
  assert.ok(Math.abs(parsed.oklch.l - 0.6231) < 0.0005);
});
