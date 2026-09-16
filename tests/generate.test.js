const test = require("node:test");
const assert = require("node:assert/strict");

const color = require("../lib/color.js");
const generate = require("../lib/generate.js");

test("shades() anchors stop 500 on the base color", () => {
  for (const base of ["#3b82f6", "#fbbf24", "#111827", "#ef4444", "#808080"]) {
    const scale = generate.shades(base);
    assert.deepEqual(
      scale.map((item) => item.stop),
      ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"],
    );
    const mid = scale.find((item) => item.stop === "500");
    assert.equal(mid.hex, color.parse(base).hex, `${base} must be the 500 stop`);
  }
});

test("shade lightness decreases monotonically for ordinary and extreme bases", () => {
  for (const base of ["#3b82f6", "#fbbf24", "#111827", "#ebebeb", "#020617"]) {
    const lightness = generate.shades(base).map((item) => item.oklch.l);
    for (let index = 1; index < lightness.length; index += 1) {
      assert.ok(
        lightness[index] <= lightness[index - 1] + 1e-9,
        `${base}: stop ${index} got lighter (${lightness[index]} > ${lightness[index - 1]})`,
      );
    }
  }
});

test("shades() keeps hue and tapers chroma toward the ends", () => {
  const scale = generate.shades("#3b82f6");
  const base = color.hexToOklch("#3b82f6");
  for (const item of scale) {
    assert.equal(Math.round(item.oklch.h), Math.round(base.h), `${item.stop} hue`);
  }
  const middle = scale.find((item) => item.stop === "500").oklch.c;
  const darkEnd = scale.find((item) => item.stop === "950").oklch.c;
  const lightEnd = scale.find((item) => item.stop === "50").oklch.c;
  assert.ok(darkEnd < middle && lightEnd < middle, "ends must be less chromatic");
});

test("grays stay gray and invalid input yields an empty scale", () => {
  for (const item of generate.shades("#808080")) {
    const parsed = color.parse(item.hex);
    assert.equal(parsed.rgb.r, parsed.rgb.g, `${item.stop} should be neutral`);
    assert.equal(parsed.rgb.g, parsed.rgb.b, `${item.stop} should be neutral`);
  }
  assert.deepEqual(generate.shades("not a color"), []);
  assert.deepEqual(generate.shades(null), []);
});

test("shades() output is always a valid hex color", () => {
  for (const item of generate.shades("#00ff00")) {
    assert.equal(color.normalizeHex(item.hex), item.hex, `${item.stop} hex`);
  }
});

test("harmony rules carry the base and rotate the hue in OKLCH", () => {
  const base = color.parse("#3b82f6");
  const expectations = {
    complementary: [0, 180],
    analogous: [0, -30, 30],
    triadic: [0, 120, 240],
    "split-complementary": [0, 150, 210],
  };
  for (const [rule, deltas] of Object.entries(expectations)) {
    const colors = generate.harmony("#3b82f6", rule);
    assert.deepEqual(colors.map((item) => item.delta), deltas, `${rule} deltas`);
    assert.equal(colors[0].hex, base.hex, `${rule} includes the base`);
    for (const item of colors) {
      assert.equal(Math.round(item.oklch.l * 10000), Math.round(base.oklch.l * 10000));
      assert.equal(item.oklch.h, ((base.oklch.h + item.delta) % 360 + 360) % 360);
    }
  }
});

test("harmony() rejects unknown rules and unusable input", () => {
  assert.deepEqual(generate.harmony("#3b82f6", "tetradic"), []);
  assert.deepEqual(generate.harmony("nope", "complementary"), []);
});

test("HARMONY_RULES is bilingual and complete", () => {
  assert.equal(generate.HARMONY_RULES.length, 4);
  for (const rule of generate.HARMONY_RULES) {
    assert.ok(rule.label.en && rule.label.zh, `${rule.id} labels`);
  }
});
