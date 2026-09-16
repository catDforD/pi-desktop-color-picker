const test = require("node:test");
const assert = require("node:assert/strict");

const color = require("../lib/color.js");
const palette = require("../lib/palette.js");
const tailwind = require("../lib/data/tailwind.js");
const material = require("../lib/data/material.js");
const presets = require("../lib/data/presets.js");

const TAILWIND_STOPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];

test("the Tailwind table is complete and parseable", () => {
  const ramps = Object.keys(tailwind.ramps);
  assert.equal(ramps.length, 26);
  for (const name of ramps) {
    assert.deepEqual(Object.keys(tailwind.ramps[name]), TAILWIND_STOPS, `${name} stops`);
    for (const value of Object.values(tailwind.ramps[name])) {
      assert.ok(color.parse(value), `${name} value ${value} should parse`);
      assert.ok(value.startsWith("oklch("), `${name} should keep the source notation`);
    }
  }
  assert.deepEqual(tailwind.singles, { black: "#000000", white: "#ffffff" });
});

test("the Material table carries every family, stop and accent", () => {
  assert.equal(Object.keys(material.ramps).length, 19);
  const numeric = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"];
  const accents = ["A100", "A200", "A400", "A700"];
  const achromatic = ["brown", "grey", "blueGrey"];

  for (const [name, ramp] of Object.entries(material.ramps)) {
    const expected = achromatic.includes(name) ? numeric : [...numeric, ...accents];
    assert.deepEqual(Object.keys(ramp), expected, `${name} stops`);
    for (const value of Object.values(ramp)) {
      assert.equal(color.normalizeHex(value), value, `${name} value ${value}`);
    }
  }
  assert.equal(material.ramps.red["500"], "#f44336");
  assert.equal(material.ramps.deepPurple["50"], "#ede7f6");
  assert.equal(material.ramps.red["A700"], "#d50000");
});

test("the preset palettes and gradients are well formed", () => {
  assert.equal(presets.palettes.length, 15);
  for (const item of presets.palettes) {
    assert.ok(item.id && item.name.en && item.name.zh, `palette ${item.id} needs bilingual names`);
    assert.equal(item.colors.length, 5, `${item.id} colors`);
    for (const hex of item.colors) assert.equal(color.normalizeHex(hex), hex, `${item.id} ${hex}`);
  }
  assert.equal(presets.gradients.length, 12);
  for (const item of presets.gradients) {
    assert.ok(item.id && item.name.en && item.name.zh, `gradient ${item.id} needs bilingual names`);
    assert.ok(Number.isFinite(item.angle), `${item.id} angle`);
    assert.ok(item.stops.length >= 2, `${item.id} stops`);
    for (const hex of item.stops) assert.equal(color.normalizeHex(hex), hex, `${item.id} ${hex}`);
  }
  const ids = [...presets.palettes, ...presets.gradients].map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("sources() lists the four browsable tables", () => {
  assert.deepEqual(
    palette.sources().map((source) => source.id),
    ["tailwind", "material", "presets", "gradients"],
  );
  assert.deepEqual(
    palette.sources().map((source) => source.kind),
    ["ramps", "ramps", "palettes", "gradients"],
  );
});

test("entries() describes ramps, palettes and gradients", () => {
  const tailwindEntries = palette.entries("tailwind");
  assert.equal(tailwindEntries.length, 26);
  assert.deepEqual(
    tailwindEntries.find((entry) => entry.id === "blueGrey" || entry.id === "deepPurple"),
    undefined,
  );
  assert.equal(tailwindEntries.find((entry) => entry.id === "slate").label, "Slate");
  assert.equal(tailwindEntries.find((entry) => entry.id === "red").stops.length, 11);

  const materialEntries = palette.entries("material");
  assert.equal(materialEntries.find((entry) => entry.id === "deepPurple").label, "Deep Purple");
  assert.equal(materialEntries.find((entry) => entry.id === "blueGrey").label, "Blue Grey");

  assert.equal(palette.entries("presets").length, 15);
  assert.equal(palette.entries("gradients").length, 12);
  assert.equal(palette.entries("nope").length, 0);
});

test("entries() localizes preset names", () => {
  const english = palette.entries("presets", "en").find((entry) => entry.id === "sunset");
  const chinese = palette.entries("presets", "zh-CN").find((entry) => entry.id === "sunset");
  assert.equal(english.label, "Sunset");
  assert.equal(chinese.label, "日落");
});

test("colors() normalizes names, hex and notation", () => {
  const red = palette.colors("tailwind", "red");
  assert.equal(red.length, 11);
  const red500 = red.find((item) => item.name === "red-500");
  assert.deepEqual(red500, {
    name: "red-500",
    label: "Red 500",
    stop: "500",
    hex: "#fb2c36",
    value: "oklch(63.7% 0.237 25.331)",
    notation: "oklch",
  });

  const deepPurple50 = palette.colors("material", "deepPurple")[0];
  assert.equal(deepPurple50.name, "deep-purple-50");
  assert.equal(deepPurple50.hex, "#ede7f6");
  assert.equal(deepPurple50.notation, "hex");

  // Accent stops keep their A-label so the panel can group them apart.
  const accents = palette.colors("material", "red").filter((item) => /^A/.test(item.stop));
  assert.deepEqual(
    accents.map((item) => item.stop),
    ["A100", "A200", "A400", "A700"],
  );

  const sunset = palette.colors("presets", "sunset");
  assert.equal(sunset.length, 5);
  assert.equal(sunset[0].name, "sunset-1");

  assert.deepEqual(palette.colors("tailwind", "missing"), []);
  assert.deepEqual(palette.colors("nope", "red"), []);
});

test("singles() exposes black and white with the right notation", () => {
  assert.deepEqual(palette.singles("tailwind"), [
    { name: "black", label: "Black", hex: "#000000", value: "#000000", notation: "hex" },
    { name: "white", label: "White", hex: "#ffffff", value: "#ffffff", notation: "hex" },
  ]);
  assert.deepEqual(palette.singles("presets"), []);
});

test("search() matches names, labels and hex values", () => {
  const byName = palette.search("rose-500");
  assert.equal(byName.length, 1);
  assert.equal(byName[0].hex, "#ff2056");

  const byHex = palette.search("#f44336");
  assert.deepEqual(
    byHex.map((item) => item.name),
    ["red-500"],
  );

  const capped = palette.search("a", { limit: 5 });
  assert.equal(capped.length, 5);
  assert.deepEqual(palette.search(""), []);
});

test("slug() and titleCase() agree with the panel's naming", () => {
  assert.equal(palette.slug("deepPurple"), "deep-purple");
  assert.equal(palette.slug("A100"), "a100");
  assert.equal(palette.titleCase("blueGrey"), "Blue Grey");
  assert.equal(palette.titleCase("mint-fizz"), "Mint Fizz");
});
