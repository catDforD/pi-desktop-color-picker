"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const ai = require("../lib/ai.js");
const exporter = require("../lib/export.js");

test("buildRequest asks for strict JSON and carries the base color", () => {
  const request = ai.buildRequest({ baseHex: "#3b82f6", style: "dark and techy", locale: "zh-CN" });
  assert.match(request.system, /one JSON object and nothing else/);
  assert.match(request.system, /Simplified Chinese/);
  assert.equal(request.messages.length, 1);
  assert.equal(request.messages[0].role, "user");
  assert.match(request.messages[0].content, /Base color: #3b82f6/);
  assert.match(request.messages[0].content, /Style: dark and techy/);
  assert.match(request.messages[0].content, /Return exactly 5 colors/);
  // The base color is normalized, so oklch() and RGB input work too.
  assert.match(ai.buildRequest({ baseHex: "rgb(59, 130, 246)" }).messages[0].content, /#3b82f6/);
});

test("buildRequest refuses to call the model with nothing to work from", () => {
  assert.equal(ai.buildRequest({}), null);
  assert.equal(ai.buildRequest({ baseHex: "not a color", style: "   " }), null);
  assert.equal(ai.buildRequest(null), null);
});

test("buildRequest clamps the count and trims the style", () => {
  assert.match(ai.buildRequest({ style: "x", count: 1 }).messages[0].content, /Return exactly 2 colors/);
  assert.match(ai.buildRequest({ style: "x", count: 99 }).messages[0].content, /Return exactly 8 colors/);
  assert.match(ai.buildRequest({ style: "x", count: "abc" }).messages[0].content, /Return exactly 5 colors/);
  const long = ai.buildRequest({ style: "y".repeat(1000) });
  const style = long.messages[0].content.split("\n")[0];
  assert.equal(style.length, "Style: ".length + ai.MAX_STYLE_CHARS);
});

test("parseSuggestion reads a clean answer", () => {
  const text = JSON.stringify({
    name: "Harbour",
    colors: [
      { name: "deep water", hex: "#0b1f33" },
      { name: "accent", hex: "#3b82f6" },
      { name: "sand", hex: "#f5e2c8" },
    ],
  });
  const result = ai.parseSuggestion(text);
  assert.equal(result.ok, true);
  assert.equal(result.name, "Harbour");
  assert.deepEqual(
    result.colors.map((entry) => entry.hex),
    ["#0b1f33", "#3b82f6", "#f5e2c8"],
  );
});

test("parseSuggestion unwraps a fence and ignores surrounding prose", () => {
  const text = [
    "Sure! Here is a palette that fits:",
    "```json",
    '{"name":"Dusk","colors":[{"name":"bg","hex":"#101014"},{"name":"accent","hex":"#ff8a3d"}]}',
    "```",
    "Let me know if you want it lighter.",
  ].join("\n");
  const result = ai.parseSuggestion(text);
  assert.equal(result.ok, true);
  assert.equal(result.name, "Dusk");
  assert.equal(result.colors.length, 2);
});

test("parseSuggestion survives a brace inside a string", () => {
  const text = '{"name":"Odd","colors":[{"name":"a } brace","hex":"#112233"},{"name":"b","hex":"#445566"}]}';
  const result = ai.parseSuggestion(text);
  assert.equal(result.ok, true);
  assert.equal(result.colors[0].name, "a } brace");
});

test("parseSuggestion drops unusable entries one at a time", () => {
  const text = JSON.stringify({
    name: "Mixed",
    colors: [
      { name: "ok", hex: "#123456" },
      { name: "bad hex", hex: "not-a-color" },
      { name: "", hex: "#abcdef" },
      " #998877 ",
      { name: "dupe", hex: "#123456" },
      { name: "missing" },
    ],
  });
  const result = ai.parseSuggestion(text);
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.colors.map((entry) => [entry.name, entry.hex]),
    [
      ["ok", "#123456"],
      ["color-2", "#abcdef"],
      ["color-3", "#998877"],
    ],
  );
});

test("parseSuggestion names the reason when there is nothing usable", () => {
  assert.equal(ai.parseSuggestion("").reason, "empty");
  assert.equal(ai.parseSuggestion("   ").reason, "empty");
  assert.equal(ai.parseSuggestion("I cannot help with that.").reason, "no-json");
  assert.equal(ai.parseSuggestion("{ not json }").reason, "bad-json");
  assert.equal(ai.parseSuggestion('{"name":"x"}').reason, "no-colors");
  assert.equal(
    ai.parseSuggestion('{"name":"x","colors":[{"name":"a","hex":"#123456"}]}').reason,
    "too-few",
  );
  assert.equal(
    ai.parseSuggestion('{"name":"x","colors":[{"name":"a","hex":"nope"},{"hex":"also nope"}]}').reason,
    "too-few",
  );
  assert.equal(ai.parseSuggestion(null).reason, "empty");
});

test("parseSuggestion caps a runaway list at the maximum", () => {
  const colors = Array.from({ length: 30 }, (unused, index) => ({
    name: `c${index}`,
    hex: `#${(index * 7 + 16).toString(16).padStart(2, "0")}0000`,
  }));
  const result = ai.parseSuggestion(JSON.stringify({ name: "Many", colors }));
  assert.equal(result.ok, true);
  assert.equal(result.colors.length, ai.MAX_COLORS);
});

test("toDocument matches what the exporters take", () => {
  const suggestion = ai.parseSuggestion(
    '{"name":"Harbour","colors":[{"name":"deep water","hex":"#0b1f33"},{"name":"accent","hex":"#3b82f6"}]}',
  );
  const document = ai.toDocument(suggestion);
  assert.deepEqual(document, {
    name: "Harbour",
    colors: [
      { name: "deep water", hex: "#0b1f33" },
      { name: "accent", hex: "#3b82f6" },
    ],
  });

  // The export tab feeds this straight to the exporters, so the round trip has
  // to produce usable output rather than, say, undefined values.
  const css = exporter.cssVariables(document);
  assert.match(css, /--color-deep-water: #0b1f33;/);
  assert.match(css, /--color-accent: #3b82f6;/);
  const json = JSON.parse(exporter.json(document));
  assert.deepEqual(json, { name: "Harbour", colors: { "deep-water": "#0b1f33", accent: "#3b82f6" } });

  assert.equal(ai.toDocument({ ok: false, reason: "no-json" }), null);
  assert.equal(ai.toDocument({ ok: true, colors: [] }), null);
  assert.equal(ai.toDocument(null), null);
});

test("compactModelLabel keeps the model name and drops the provider aside", () => {
  assert.equal(ai.compactModelLabel("gpt-5.3-codex-spark (OpenAI (ChatGPT Plus/Pro))"), "gpt-5.3-codex-spark");
  assert.equal(ai.compactModelLabel("Claude Sonnet 4.5 (Anthropic)"), "Claude Sonnet 4.5");
  assert.equal(ai.compactModelLabel("Alpha 4"), "Alpha 4");
  assert.equal(ai.compactModelLabel("  Beta 2  "), "Beta 2");
  // A label that is only a parenthetical keeps its text rather than losing it.
  assert.equal(ai.compactModelLabel("(preview)"), "(preview)");
  assert.equal(ai.compactModelLabel(""), "");
  assert.equal(ai.compactModelLabel(null), "");
});
