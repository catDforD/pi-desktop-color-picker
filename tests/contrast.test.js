const test = require("node:test");
const assert = require("node:assert/strict");

const contrast = require("../lib/contrast.js");

test("luminance hits the endpoints and rejects garbage", () => {
  assert.equal(contrast.luminance("#ffffff"), 1);
  assert.equal(contrast.luminance("#000000"), 0);
  assert.equal(contrast.luminance("nope"), null);
  assert.ok(Math.abs(contrast.luminance("#808080") - 0.2159) < 0.0005);
});

test("ratio spans 1 to 21 and matches known pairs", () => {
  assert.equal(contrast.ratio("#000000", "#ffffff"), 21);
  assert.equal(contrast.ratio("#ffffff", "#000000"), 21);
  assert.equal(contrast.ratio("#3b82f6", "#3b82f6"), 1);
  assert.equal(contrast.ratio("#3b82f6", "#ffffff"), 3.68);
  assert.equal(contrast.ratio("#3b82f6", "#000000"), 5.71);
  assert.equal(contrast.ratio("nope", "#ffffff"), null);
});

test("grade applies the AA and AAA thresholds for both text sizes", () => {
  assert.equal(contrast.grade(21), "AAA");
  assert.equal(contrast.grade(7), "AAA");
  assert.equal(contrast.grade(6.99), "AA");
  assert.equal(contrast.grade(4.5), "AA");
  assert.equal(contrast.grade(4.49), "fail");

  assert.equal(contrast.grade(4.5, { large: true }), "AAA");
  assert.equal(contrast.grade(3, { large: true }), "AA");
  assert.equal(contrast.grade(2.99, { large: true }), "fail");

  assert.equal(contrast.grade(Number.NaN), "fail");
  assert.equal(contrast.grade(null), "fail");
});

test("bestText picks the higher-contrast of black and white", () => {
  assert.equal(contrast.bestText("#ffffff"), "#000000");
  assert.equal(contrast.bestText("#000000"), "#ffffff");
  assert.equal(contrast.bestText("#3b82f6"), "#000000");
  assert.equal(contrast.bestText("#0b1220"), "#ffffff");
  assert.equal(contrast.bestText("nope"), null);
});

test("simulate leaves neutrals untouched and shifts the dichromacies apart", () => {
  assert.equal(contrast.simulate("#808080", "deuteranopia"), "#808080");
  assert.equal(contrast.simulate("#ffffff", "protanopia"), "#ffffff");
  assert.equal(contrast.simulate("#ff0000", "protanopia"), "#6d5f00");
  assert.equal(contrast.simulate("#ff0000", "deuteranopia"), "#a39000");
  assert.equal(contrast.simulate("#ff0000", "tritanopia"), "#ff000f");
  assert.equal(contrast.simulate("#ff0000", "achromatopsia"), null);
  assert.equal(contrast.simulate("nope", "protanopia"), null);
});

test("CVD_TYPES lists the three simulated dichromacies bilingually", () => {
  assert.deepEqual(
    contrast.CVD_TYPES.map((type) => type.id),
    ["protanopia", "deuteranopia", "tritanopia"],
  );
  for (const type of contrast.CVD_TYPES) {
    assert.ok(type.label.en && type.label.zh, `${type.id} labels`);
    assert.equal(contrast.simulate("#3b82f6", type.id).length, 7);
  }
});
