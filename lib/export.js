/**
 * Exporters: turn a named set of colors into CSS variables, a Tailwind v4
 * `@theme` block, a Tailwind v3 config snippet, or JSON.
 *
 * A document is `{ name, colors: [{ name, hex, value? }] }` — exactly what
 * `lib/palette.js` hands back, plus the generated shade scales. CSS and the
 * v4 theme prefer `value` (the source notation, e.g. an `oklch()` string) so
 * exported colors keep their full precision; the v3 config and JSON carry hex
 * because those formats outlive the browser that wrote them.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PiExport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  /** camelCase and spaced names become kebab-case: `deepPurple` → `deep-purple`. */
  function slug(name) {
    return String(name)
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase()
      .replace(/^-|-$/g, "");
  }

  function cssValue(item) {
    return item.value || item.hex;
  }

  function hexValue(item) {
    return item.hex || item.value;
  }

  function entries(doc) {
    return (doc?.colors || []).map((item) => ({
      name: slug(item.name),
      css: cssValue(item),
      hex: hexValue(item),
    }));
  }

  /** `:root` custom properties, prefixed for namespacing. */
  function cssVariables(doc, options) {
    const prefix = slug(options?.prefix || "color");
    const lines = entries(doc).map((item) => `  --${prefix}-${item.name}: ${item.css};`);
    return `:root {\n${lines.join("\n")}${lines.length ? "\n" : ""}}\n`;
  }

  /** Tailwind CSS v4 `@theme` block — variables land in the `--color-*` namespace. */
  function tailwindTheme(doc) {
    const lines = entries(doc).map((item) => `  --color-${item.name}: ${item.css};`);
    return `@theme {\n${lines.join("\n")}${lines.length ? "\n" : ""}}\n`;
  }

  /** Tailwind CSS v3 `tailwind.config.js` snippet. */
  function tailwindConfig(doc) {
    const lines = entries(doc).map(
      (item) => `        "${item.name}": "${item.hex}",`,
    );
    return [
      "/** @type {import('tailwindcss').Config} */",
      "module.exports = {",
      "  theme: {",
      "    extend: {",
      "      colors: {",
      ...lines,
      "      },",
      "    },",
      "  },",
      "};",
      "",
    ].join("\n");
  }

  /** `{ name, colors: { "red-500": "#ef4444" } }` as pretty JSON. */
  function json(doc) {
    const colors = {};
    for (const item of entries(doc)) colors[item.name] = item.hex;
    return `${JSON.stringify({ name: doc?.name || "", colors }, null, 2)}\n`;
  }

  const FORMATS = [
    { id: "css", label: { en: "CSS variables", zh: "CSS 变量" }, render: cssVariables },
    { id: "tailwind-v4", label: { en: "Tailwind v4 @theme", zh: "Tailwind v4 @theme" }, render: tailwindTheme },
    { id: "tailwind-v3", label: { en: "Tailwind v3 config", zh: "Tailwind v3 配置" }, render: tailwindConfig },
    { id: "json", label: { en: "JSON", zh: "JSON" }, render: json },
  ];

  return { cssVariables, tailwindTheme, tailwindConfig, json, slug, FORMATS };
});
