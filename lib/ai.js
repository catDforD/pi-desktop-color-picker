/**
 * AI palette requests and responses, with no host or DOM dependency: the
 * prompt that asks for strict JSON, the tolerant parser that turns whatever
 * the model actually said into usable colors, and the document shape the
 * exporters already eat.
 *
 * The host has no JSON mode, so structure comes from the prompt plus the
 * validation here — a model that answers in prose, wraps the object in a code
 * fence or invents a color name is expected, not exceptional.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./color.js"));
  } else {
    root.PiAi = factory(root.PiColor);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (color) {
  const MIN_COLORS = 2;
  const MAX_COLORS = 8;
  const DEFAULT_COUNT = 5;

  /** Long descriptions buy nothing and eat the completion's size budget. */
  const MAX_STYLE_CHARS = 400;
  const MAX_NAME_CHARS = 60;
  const MAX_COLOR_NAME_CHARS = 40;

  function clampCount(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return DEFAULT_COUNT;
    return Math.min(Math.max(Math.round(number), MIN_COLORS), MAX_COLORS);
  }

  function languageName(locale) {
    return String(locale || "").toLowerCase().startsWith("zh") ? "Simplified Chinese" : "English";
  }

  /** The model that names the colors should name them in the user's language. */
  function buildRequest(input) {
    // parse() rather than normalizeHex(): a base color can arrive in any of the
    // four notations, and only the model-facing hex matters here.
    const parsed = typeof input?.baseHex === "string" ? color.parse(input.baseHex) : null;
    const base = parsed ? parsed.hex : null;
    const style = typeof input?.style === "string" ? input.style.trim().slice(0, MAX_STYLE_CHARS) : "";
    if (!base && !style) return null;
    const count = clampCount(input?.count);
    const language = languageName(input?.locale);

    const system = [
      "You are a color palette assistant. Reply with one JSON object and nothing else.",
      'Schema: {"name": string, "colors": [{"name": string, "hex": "#rrggbb"}]}',
      `Rules: ${MIN_COLORS} to ${MAX_COLORS} colors, each a 6-digit hex;`,
      `"name" is a short palette name in ${language}, and every color gets a short`,
      `role or descriptive name in ${language} (for example background, accent, warning).`,
      "No prose, no markdown fences, no comments, no trailing text.",
    ].join(" ");

    const lines = [];
    if (base) lines.push(`Base color: ${base}`);
    if (style) lines.push(`Style: ${style}`);
    lines.push(`Return exactly ${count} colors.`);

    return { system, messages: [{ role: "user", content: lines.join("\n") }] };
  }

  /**
   * The first complete JSON object in the text: fenced blocks are unwrapped and
   * trailing prose is ignored, with brace matching that respects strings so a
   * `}` inside a color name does not end the object early.
   */
  function extractJsonObject(text) {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
    const body = fenced ? fenced[1] : text;
    const start = body.indexOf("{");
    if (start < 0) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < body.length; index += 1) {
      const character = body[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) return body.slice(start, index + 1);
      }
    }
    return null;
  }

  function trimmedName(value, fallback, max) {
    if (typeof value !== "string") return fallback;
    const text = value.trim();
    return text ? text.slice(0, max) : fallback;
  }

  /**
   * Whatever the model said, as a usable palette. Unusable colors are dropped
   * one at a time rather than failing the whole answer; `reason` tells the UI
   * what to say when nothing usable is left.
   */
  function parseSuggestion(text) {
    if (typeof text !== "string" || !text.trim()) return { ok: false, reason: "empty" };
    const json = extractJsonObject(text);
    if (!json) return { ok: false, reason: "no-json" };
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      return { ok: false, reason: "bad-json" };
    }
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.colors)) {
      return { ok: false, reason: "no-colors" };
    }

    const colors = [];
    for (const entry of parsed.colors) {
      const parsedEntry = color.parse(typeof entry === "string" ? entry : entry?.hex);
      if (!parsedEntry) continue;
      const hex = parsedEntry.hex;
      if (colors.some((existing) => existing.hex === hex)) continue;
      colors.push({
        name: trimmedName(entry?.name, `color-${colors.length + 1}`, MAX_COLOR_NAME_CHARS),
        hex,
      });
      if (colors.length >= MAX_COLORS) break;
    }
    if (colors.length < MIN_COLORS) return { ok: false, reason: "too-few" };

    return {
      ok: true,
      name: trimmedName(parsed.name, "AI palette", MAX_NAME_CHARS),
      colors,
    };
  }

  /**
   * The host's model labels carry the provider in a parenthetical
   * ("gpt-5.3-codex-spark (OpenAI (ChatGPT Plus/Pro))"), which is far longer
   * than the panel's control can show. Cut at the first parenthetical and keep
   * the model name; the full label belongs in a tooltip.
   */
  function compactModelLabel(label) {
    const text = String(label || "").trim();
    if (!text) return "";
    const cut = text.indexOf(" (");
    const stripped = cut > 0 ? text.slice(0, cut).trim() : text;
    return stripped || text;
  }

  /** The palette as `{ name, colors }`, the shape the exporters and the export tab take. */
  function toDocument(suggestion) {
    if (!suggestion?.ok || !Array.isArray(suggestion.colors) || !suggestion.colors.length) return null;
    return {
      name: suggestion.name,
      colors: suggestion.colors.map((entry) => ({ name: entry.name, hex: entry.hex })),
    };
  }

  return {
    MIN_COLORS,
    MAX_COLORS,
    DEFAULT_COUNT,
    MAX_STYLE_CHARS,
    buildRequest,
    compactModelLabel,
    extractJsonObject,
    parseSuggestion,
    toDocument,
  };
});
