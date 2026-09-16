#!/usr/bin/env node
/**
 * Regenerates lib/data/tailwind.js and lib/data/material.js from pinned
 * upstream packages. Development-time only — the plugin itself never runs
 * this and never touches the network.
 *
 *   node tools/gen-palettes.mjs
 *
 * Downloads each package tarball into a temp directory with `npm pack`
 * (registry access required), extracts the palette, and writes deterministic
 * output: stable key order, LF endings, no timestamps. Re-running with the
 * same pins must leave `git diff` empty.
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const TAILWIND = { package: "tailwindcss", version: "4.3.3", license: "MIT" };
const MATERIAL = { package: "material-colors", version: "1.2.6", license: "ISC" };

/** Keys in tailwindcss/colors that are not palette ramps. */
const TAILWIND_NON_RAMPS = ["inherit", "current", "transparent"];

/** Keys in material-colors' colors.json that are not color families. */
const MATERIAL_NON_RAMPS = ["dark-text", "light-text", "dark-icons", "light-icons"];

const workDir = mkdtempSync(join(tmpdir(), "color-picker-palettes-"));

try {
  const tailwind = extractTailwind();
  const material = extractMaterial();

  const tailwindFile = join(ROOT, "lib/data/tailwind.js");
  const materialFile = join(ROOT, "lib/data/material.js");
  mkdirSync(dirname(tailwindFile), { recursive: true });
  writeFileSync(tailwindFile, renderTailwind(tailwind), "utf8");
  writeFileSync(materialFile, renderMaterial(material), "utf8");

  console.log(
    `wrote lib/data/tailwind.js (${countStops(tailwind.ramps)} stops across ${
      Object.keys(tailwind.ramps).length
    } ramps)`,
  );
  console.log(
    `wrote lib/data/material.js (${countStops(material.ramps)} stops across ${
      Object.keys(material.ramps).length
    } ramps)`,
  );
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

function unpack({ package: name, version }) {
  const tarball = execFileSync(
    "npm",
    ["pack", `${name}@${version}`, "--pack-destination", workDir, "--silent"],
    { cwd: workDir, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .pop();
  const dest = join(workDir, `${name}-${version}`);
  mkdirSync(dest, { recursive: true });
  execFileSync("tar", ["-xzf", join(workDir, tarball), "-C", dest]);
  return dest;
}

function extractTailwind() {
  const dest = unpack(TAILWIND);
  const colors = require(join(dest, "package/dist/colors.js"));

  const ramps = {};
  const singles = {};
  for (const key of Object.keys(colors)) {
    if (TAILWIND_NON_RAMPS.includes(key)) continue;
    const value = colors[key];
    if (value && typeof value === "object") {
      ramps[key] = sortStops(value, (color) => color);
    } else if (typeof value === "string") {
      singles[key] = normalizeHex(value);
    }
  }
  return { ...TAILWIND, ramps, singles };
}

function extractMaterial() {
  const dest = unpack(MATERIAL);
  const colors = JSON.parse(readFileSync(join(dest, "package/dist/colors.json"), "utf8"));

  const ramps = {};
  const singles = {};
  for (const key of Object.keys(colors)) {
    if (MATERIAL_NON_RAMPS.includes(key)) continue;
    const value = colors[key];
    if (value && typeof value === "object") {
      ramps[camelCase(key)] = sortStops(value, normalizeHex);
    } else if (typeof value === "string") {
      singles[camelCase(key)] = normalizeHex(value);
    }
  }
  return { ...MATERIAL, ramps, singles };
}

/**
 * Numeric stops ascending (50 … 900), then accent stops (A100, A200, A400,
 * A700). `normalize` rewrites shorthand hex to six digits — the Material
 * source uses `a100`-style keys and full hex, but both are cheap to pin down.
 */
function sortStops(ramp, normalize) {
  const keys = Object.keys(ramp);
  const numeric = keys.filter((key) => /^\d+$/.test(key)).sort((a, b) => Number(a) - Number(b));
  const accents = keys
    .filter((key) => !/^\d+$/.test(key))
    .sort((a, b) => Number(a.replace(/^a/i, "")) - Number(b.replace(/^a/i, "")));
  const sorted = {};
  for (const key of [...numeric, ...accents]) {
    const stop = /^\d+$/.test(key) ? key : `A${key.replace(/^a/i, "")}`;
    sorted[stop] = normalize(ramp[key]);
  }
  return sorted;
}

/** `deep-purple` → `deepPurple`; `white` → `white`. */
function camelCase(key) {
  return key.replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase());
}

/** `#000` → `#000000`, `#fff` → `#ffffff`; anything else is returned as-is. */
function normalizeHex(value) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return value;
  const body = match[1].toLowerCase();
  return body.length === 3
    ? `#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`
    : `#${body}`;
}

function countStops(ramps) {
  return Object.values(ramps).reduce((total, ramp) => total + Object.keys(ramp).length, 0);
}

function renderHeader({ package: name, version, license }, note) {
  return `/**
 * ${note}
 *
 * Generated by tools/gen-palettes.mjs — do not edit by hand.
 * Source: ${name}@${version} (${license}).
 */
`;
}

function renderSource(data) {
  return [
    "{",
    `      package: ${JSON.stringify(data.package)},`,
    `      version: ${JSON.stringify(data.version)},`,
    `      license: ${JSON.stringify(data.license)},`,
    "    }",
  ].join("\n");
}

function renderTailwind(data) {
  const header = renderHeader(
    data,
    "Tailwind CSS v4 palette. Values are the upstream oklch() strings, kept\n * verbatim so the plugin can show and copy the canonical notation.",
  );
  return `${header}(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PiDataTailwind = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  return {
    id: "tailwind",
    label: { en: "Tailwind CSS", zh: "Tailwind CSS" },
    notation: "oklch",
    source: ${renderSource(data)},
    ramps: ${renderObject(data.ramps, 4)},
    singles: ${renderObject(data.singles, 4)},
  };
});
`;
}

function renderMaterial(data) {
  const header = renderHeader(
    data,
    "Material Design 2014 palette. Values are the upstream sRGB hex codes;\n * chromatic families carry A100/A200/A400/A700 accents.",
  );
  return `${header}(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PiDataMaterial = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  return {
    id: "material",
    label: { en: "Material Design", zh: "Material Design" },
    notation: "hex",
    source: ${renderSource(data)},
    ramps: ${renderObject(data.ramps, 4)},
    singles: ${renderObject(data.singles, 4)},
  };
});
`;
}

function renderObject(object, indent) {
  const pad = " ".repeat(indent);
  const lines = Object.entries(object).map(([key, value]) => {
    if (value && typeof value === "object") {
      const inner = Object.entries(value)
        .map(([stop, color]) => `"${stop}": ${JSON.stringify(color)},`)
        .join(`\n${pad}  `);
      return `${pad}${key}: {\n${pad}  ${inner}\n${pad}},`;
    }
    return `${pad}${key}: ${JSON.stringify(value)},`;
  });
  return `{\n${lines.join("\n")}\n${" ".repeat(indent - 2)}}`;
}
