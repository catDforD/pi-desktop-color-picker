"use strict";

/**
 * The plugin's main-process surface, exercised against a fake host `pi`. The
 * panel cannot see any of this — it only gets the envelope back over IPC — so
 * the contract worth pinning here is the envelope itself: a coded error from
 * the host has to arrive as `{ ok: false, code }`, never as a rejection.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const PALETTE = JSON.stringify({
  name: "Harbour",
  colors: [
    { name: "deep water", hex: "#0b1f33" },
    { name: "accent", hex: "#3b82f6" },
  ],
});

/** A host stub; each test overrides only what it cares about. */
function fakeHost(overrides = {}) {
  const calls = { registered: [], completed: [], settings: [], tools: [] };
  const host = {
    calls,
    commands: {
      register: async () => {},
      unregister: async () => {},
    },
    keyboard: {
      registerGlobalShortcut: async (input) => {
        calls.registered.push(input);
        return { ...input, registered: true };
      },
    },
    app: { getLocale: async () => "zh-CN" },
    ui: { openPanel: async () => {} },
    plugin: {
      getSettings: async () => ({}),
      setSettings: async (values) => {
        calls.settings.push(values);
      },
    },
    models: {
      list: async () => [
        { key: "demo/alpha", label: "Alpha", isDefault: true },
        { key: "demo/beta", label: "Beta", isDefault: false },
      ],
    },
    agent: {
      complete: async (input) => {
        calls.completed.push(input);
        return { text: PALETTE, modelKey: input.modelKey, usage: { totalTokens: 12 } };
      },
      registerTool: async (tool) => {
        calls.tools.push(tool);
      },
    },
    ...overrides,
  };
  globalThis.pi = host;
  return host;
}

const plugin = require("../main.js");

test("onLoad registers the command, a shortcut and the agent tool", async () => {
  // The first accelerator is taken by something else: the plugin must ask for
  // the next one instead of giving up.
  const host = fakeHost({
    keyboard: {
      registerGlobalShortcut: async (input) => {
        host.calls.registered.push(input);
        if (input.accelerator === "Alt+Shift+C") {
          return { ...input, registered: false, error: "SHORTCUT_CONFLICT" };
        }
        return { ...input, registered: true };
      },
    },
  });
  await plugin.onLoad();

  assert.deepEqual(
    host.calls.registered.map((entry) => entry.accelerator),
    ["Alt+Shift+C", "Ctrl+Alt+C"],
  );
  for (const entry of host.calls.registered) assert.equal(entry.command, "color-picker.open");
  assert.equal(host.calls.tools.length, 1);
  assert.equal(host.calls.tools[0].name, "suggest_palette");
  assert.equal(host.calls.tools[0].risk, "low");
  assert.equal(typeof host.calls.tools[0].execute, "function");
  assert.deepEqual(Object.keys(host.calls.tools[0].schema.properties), ["base", "style", "count"]);
});

test("a thrown shortcut error is caught, not fatal", async () => {
  const host = fakeHost({
    keyboard: {
      registerGlobalShortcut: async (input) => {
        host.calls.registered.push(input);
        const error = new Error("no shortcut registry in this host");
        error.code = "UNSUPPORTED";
        throw error;
      },
    },
  });
  await plugin.onLoad();
  assert.equal(host.calls.registered.length, 3);
});

test("ai.suggest returns the parsed palette in an ok envelope", async () => {
  const host = fakeHost();
  const response = await plugin.onPanelInvoke("colorPicker.ai.suggest", {
    baseHex: "#3b82f6",
    style: "dark harbour",
    locale: "zh-CN",
  });
  assert.equal(response.ok, true);
  assert.equal(response.name, "Harbour");
  assert.deepEqual(
    response.colors.map((entry) => entry.hex),
    ["#0b1f33", "#3b82f6"],
  );
  assert.equal(response.usage.totalTokens, 12);
  // The stored default model wins when the panel did not name one.
  assert.equal(host.calls.completed[0].modelKey, "demo/alpha");
  assert.match(host.calls.completed[0].system, /JSON object/);
});

test("ai.suggest keeps a prose answer as UNPARSABLE with the raw text", async () => {
  fakeHost({
    agent: {
      complete: async () => ({ text: "I would go with a calm blue.", modelKey: "demo/alpha" }),
      registerTool: async () => {},
    },
  });
  const response = await plugin.onPanelInvoke("colorPicker.ai.suggest", { style: "calm" });
  assert.equal(response.ok, false);
  assert.equal(response.code, "UNPARSABLE");
  assert.match(response.text, /calm blue/);
});

test("ai.suggest surfaces host error codes instead of throwing", async () => {
  fakeHost({
    agent: {
      complete: async () => {
        const error = new Error("plugin completion rate exceeded");
        error.code = "RATE_LIMITED";
        throw error;
      },
      registerTool: async () => {},
    },
  });
  const response = await plugin.onPanelInvoke("colorPicker.ai.suggest", { style: "calm" });
  assert.equal(response.ok, false);
  assert.equal(response.code, "RATE_LIMITED");
});

test("ai.suggest refuses without a base color, a style or a model", async () => {
  fakeHost();
  assert.equal((await plugin.onPanelInvoke("colorPicker.ai.suggest", {})).code, "INVALID_ARGUMENT");

  fakeHost({
    models: { list: async () => [] },
    plugin: { getSettings: async () => ({ modelKey: "" }), setSettings: async () => {} },
  });
  assert.equal((await plugin.onPanelInvoke("colorPicker.ai.suggest", { style: "x" })).code, "NO_MODEL");
});

test("the panel's model choice wins and is stored", async () => {
  const host = fakeHost();
  const stored = await plugin.onPanelInvoke("colorPicker.ai.setModel", { modelKey: "demo/beta" });
  assert.deepEqual(stored, { ok: true, modelKey: "demo/beta" });
  assert.deepEqual(host.calls.settings, [{ modelKey: "demo/beta" }]);

  await plugin.onPanelInvoke("colorPicker.ai.suggest", { style: "x", modelKey: "demo/beta" });
  assert.equal(host.calls.completed.at(-1).modelKey, "demo/beta");
});

test("a stored model key is used when the panel does not name one", async () => {
  const host = fakeHost({
    plugin: {
      getSettings: async () => ({ modelKey: "demo/beta" }),
      setSettings: async () => {},
    },
  });
  await plugin.onPanelInvoke("colorPicker.ai.suggest", { style: "x" });
  assert.equal(host.calls.completed.at(-1).modelKey, "demo/beta");
});

test("the agent tool runs the same request path as the panel", async () => {
  const host = fakeHost();
  await plugin.onLoad();
  const tool = host.calls.tools.at(-1);
  const result = await tool.execute({ base: "rgb(59, 130, 246)", style: "calm", count: 3 });
  assert.equal(result.ok, true);
  assert.equal(host.calls.completed.at(-1).modelKey, "demo/alpha");
  assert.match(host.calls.completed.at(-1).messages[0].content, /Base color: #3b82f6/);
  assert.match(host.calls.completed.at(-1).messages[0].content, /Return exactly 3 colors/);
});

test("unknown panel channels are refused with a code", async () => {
  fakeHost();
  const response = await plugin.onPanelInvoke("colorPicker.whatever", {});
  assert.equal(response.ok, false);
  assert.equal(response.code, "UNSUPPORTED");
});

test("onUnload unregisters the command and leaves the shortcut to the host", async () => {
  const calls = [];
  fakeHost({
    commands: {
      register: async () => {},
      unregister: async (id) => calls.push(id),
    },
  });
  await plugin.onUnload();
  assert.deepEqual(calls, ["color-picker.open"]);
});
