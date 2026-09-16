/**
 * Palette access over the bundled data tables (Tailwind, Material, presets,
 * gradients). Every color is normalized to `{ name, label, hex, value,
 * notation }` so callers — the panel and the exporters — do not need to care
 * which notation the source table uses.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./color.js"),
      require("./data/tailwind.js"),
      require("./data/material.js"),
      require("./data/presets.js"),
    );
  } else {
    root.PiPalette = factory(
      root.PiColor,
      root.PiDataTailwind,
      root.PiDataMaterial,
      root.PiDataPresets,
    );
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  color,
  tailwind,
  material,
  presets,
) {
  const cache = new Map();

  /** `deepPurple` → `deep-purple`; `A100` → `a100`. */
  function slug(name) {
    return String(name)
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase()
      .replace(/^-|-$/g, "");
  }

  /** `deepPurple` → `Deep Purple`; `mint-fizz` → `Mint Fizz`. */
  function titleCase(name) {
    return slug(name)
      .split("-")
      .filter(Boolean)
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(" ");
  }

  function isChinese(locale) {
    return String(locale || "").toLowerCase().startsWith("zh");
  }

  /** `{ en, zh }` (or a plain string) in the requested locale. */
  function localized(label, locale) {
    if (typeof label === "string") return label;
    if (!label) return "";
    return isChinese(locale) ? label.zh || label.en : label.en || label.zh;
  }

  function table(sourceId) {
    if (sourceId === tailwind.id) return tailwind;
    if (sourceId === material.id) return material;
    return null;
  }

  /** The four browsable sources, in panel order. */
  function sources() {
    return [
      { id: tailwind.id, label: tailwind.label, kind: "ramps" },
      { id: material.id, label: material.label, kind: "ramps" },
      { id: presets.id, label: presets.label, kind: "palettes" },
      { id: "gradients", label: presets.gradientLabel, kind: "gradients" },
    ];
  }

  /** Entries of one source: ramps, preset palettes, or gradients. */
  function entries(sourceId, locale) {
    const data = table(sourceId);
    if (data) {
      return Object.keys(data.ramps).map((id) => ({
        id,
        label: titleCase(id),
        stops: Object.keys(data.ramps[id]),
      }));
    }
    if (sourceId === presets.id) {
      return presets.palettes.map((palette) => ({
        id: palette.id,
        label: localized(palette.name, locale),
        size: palette.colors.length,
      }));
    }
    if (sourceId === "gradients") {
      return presets.gradients.map((gradient) => ({
        id: gradient.id,
        label: localized(gradient.name, locale),
        angle: gradient.angle,
        stops: gradient.stops,
      }));
    }
    return [];
  }

  /** Black and white, where the source table carries them. */
  function singles(sourceId) {
    const data = table(sourceId);
    if (!data) return [];
    return Object.keys(data.singles).map((id) => ({
      name: slug(id),
      label: titleCase(id),
      hex: data.singles[id],
      value: data.singles[id],
      notation: /^#/.test(data.singles[id]) ? "hex" : data.notation,
    }));
  }

  /** Normalized colors of one entry; `[]` for unknown source/entry. */
  function colors(sourceId, entryId) {
    const key = `${sourceId}:${entryId}`;
    if (cache.has(key)) return cache.get(key);

    const data = table(sourceId);
    let result = [];
    if (data && data.ramps[entryId]) {
      const ramp = data.ramps[entryId];
      result = Object.keys(ramp).map((stop) => {
        const value = ramp[stop];
        const parsed = color.parse(value);
        return {
          name: `${slug(entryId)}-${slug(stop)}`,
          label: `${titleCase(entryId)} ${stop}`,
          stop,
          hex: parsed ? parsed.hex : null,
          value,
          notation: data.notation,
        };
      });
    } else if (sourceId === presets.id) {
      const palette = presets.palettes.find((item) => item.id === entryId);
      if (palette) {
        result = palette.colors.map((hex, index) => ({
          name: `${slug(palette.id)}-${index + 1}`,
          label: `${titleCase(palette.id)} ${index + 1}`,
          hex: color.normalizeHex(hex),
          value: hex,
          notation: "hex",
        }));
      }
    } else if (sourceId === "gradients") {
      const gradient = presets.gradients.find((item) => item.id === entryId);
      if (gradient) {
        result = gradient.stops.map((hex, index) => ({
          name: `${slug(gradient.id)}-${index + 1}`,
          label: `${titleCase(gradient.id)} ${index + 1}`,
          hex: color.normalizeHex(hex),
          value: hex,
          notation: "hex",
        }));
      }
    }
    cache.set(key, result);
    return result;
  }

  /** Substring match over names and hex values, capped for the panel. */
  function search(query, options) {
    const limit = options?.limit ?? 24;
    const needle = String(query || "").trim().toLowerCase();
    if (!needle) return [];
    const results = [];
    for (const source of sources()) {
      for (const entry of entries(source.id)) {
        if (results.length >= limit) return results;
        for (const item of colors(source.id, entry.id)) {
          if (results.length >= limit) return results;
          if (
            item.name.includes(needle) ||
            item.label.toLowerCase().includes(needle) ||
            (item.hex && item.hex.includes(needle))
          ) {
            results.push({ source: source.id, entry: entry.id, ...item });
          }
        }
      }
    }
    return results;
  }

  return { sources, entries, colors, singles, search, slug, titleCase, localized };
});
