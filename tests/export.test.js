const test = require("node:test");
const assert = require("node:assert/strict");

const exporter = require("../lib/export.js");

const DOC = {
  name: "demo",
  colors: [
    { name: "brand-500", hex: "#3b82f6", value: "oklch(62.3% 0.188 259.81)" },
    { name: "brand-950", hex: "#172554" },
  ],
};

test("slug() normalizes the ways a color name can arrive", () => {
  assert.equal(exporter.slug("deepPurple"), "deep-purple");
  assert.equal(exporter.slug("Moss green"), "moss-green");
  assert.equal(exporter.slug("red_500"), "red-500");
  assert.equal(exporter.slug("A100"), "a100");
  assert.equal(exporter.slug("  Slate  "), "slate");
});

test("cssVariables renders :root, honoring the source notation", () => {
  assert.equal(
    exporter.cssVariables(DOC),
    [
      ":root {",
      "  --color-brand-500: oklch(62.3% 0.188 259.81);",
      "  --color-brand-950: #172554;",
      "}",
      "",
    ].join("\n"),
  );
  assert.equal(
    exporter.cssVariables(DOC, { prefix: "palette" }),
    [
      ":root {",
      "  --palette-brand-500: oklch(62.3% 0.188 259.81);",
      "  --palette-brand-950: #172554;",
      "}",
      "",
    ].join("\n"),
  );
});

test("tailwindTheme emits a v4 @theme block with the source notation", () => {
  assert.equal(
    exporter.tailwindTheme(DOC),
    [
      "@theme {",
      "  --color-brand-500: oklch(62.3% 0.188 259.81);",
      "  --color-brand-950: #172554;",
      "}",
      "",
    ].join("\n"),
  );
});

test("tailwindConfig and json always carry hex", () => {
  const config = exporter.tailwindConfig(DOC);
  assert.ok(config.includes('"brand-500": "#3b82f6",'));
  assert.ok(config.includes('"brand-950": "#172554",'));
  assert.ok(config.startsWith("/** @type {import('tailwindcss').Config} */"));
  assert.ok(config.endsWith("};\n"));

  const data = JSON.parse(exporter.json(DOC));
  assert.deepEqual(data, {
    name: "demo",
    colors: { "brand-500": "#3b82f6", "brand-950": "#172554" },
  });
});

test("empty documents still produce valid output", () => {
  assert.equal(exporter.cssVariables({}), ":root {\n}\n");
  assert.equal(exporter.tailwindTheme({}), "@theme {\n}\n");
  assert.equal(exporter.json({}), '{\n  "name": "",\n  "colors": {}\n}\n');
  assert.ok(exporter.tailwindConfig({}).endsWith("};\n"));
  assert.equal(exporter.cssVariables(null), ":root {\n}\n");
});

test("FORMATS exposes four renderers that accept the same document", () => {
  assert.deepEqual(
    exporter.FORMATS.map((format) => format.id),
    ["css", "tailwind-v4", "tailwind-v3", "json"],
  );
  for (const format of exporter.FORMATS) {
    assert.ok(format.label.en && format.label.zh, `${format.id} labels`);
    const output = format.render(DOC);
    assert.equal(typeof output, "string");
    assert.ok(output.endsWith("\n"), `${format.id} ends with a newline`);
    assert.ok(output.includes("brand-500"), `${format.id} includes the color`);
  }
});
