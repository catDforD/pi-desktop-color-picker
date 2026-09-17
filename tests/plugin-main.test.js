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
  const calls = { completed: [], settings: [], tools: [], upserts: [], removals: [], setThemes: [] };
  // The host remembers the active theme preference across calls, so a test can
  // follow what `apply` and `restore` do to it. Settings persist the same way,
  // because a second apply has to read back what the first one stored.
  const live = { preference: "system", settings: {} };
  const host = {
    calls,
    live,
    commands: {
      register: async () => {},
      unregister: async () => {},
    },
    app: {
      getLocale: async () => "zh-CN",
      getAppearance: async () => ({ theme: live.preference, base: "dark", locale: "zh-CN", pluginTheme: null }),
      setTheme: async (themeId) => {
        calls.setThemes.push(themeId);
        live.preference = themeId;
      },
    },
    themes: {
      upsert: async (input) => {
        calls.upserts.push(input);
      },
      remove: async (themeId) => {
        calls.removals.push(themeId);
      },
      list: async () => [],
    },
    ui: { openPanel: async () => {} },
    plugin: {
      getId: () => "io.github.catdford.color-picker",
      getSettings: async () => ({ ...live.settings }),
      setSettings: async (values) => {
        calls.settings.push(values);
        Object.assign(live.settings, values);
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

test("onLoad registers the agent tool and the command", async () => {
  const host = fakeHost();
  await plugin.onLoad();

  // Nothing here registers an accelerator: `keyboard.globalShortcut` is not
  // declared, and the fake host has no keyboard API to catch a stray call.
  assert.equal(host.calls.tools.length, 1);
  assert.equal(host.calls.tools[0].name, "suggest_palette");
  assert.equal(host.calls.tools[0].risk, "low");
  assert.equal(typeof host.calls.tools[0].execute, "function");
  assert.deepEqual(Object.keys(host.calls.tools[0].schema.properties), ["base", "style", "count"]);
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

// --- host themes -----------------------------------------------------------

const STORED_DARK = {
  label: "蓝 · 深色",
  base: "dark",
  seed: "#3b82f6",
  css: ':root[data-plugin-theme="plugin:io.github.catdford.color-picker:pi-theme-dark"][data-theme] { --gray-900: #0b182d; }\n',
};

test("theme status reports the store, the preference and the plugin id", async () => {
  const host = fakeHost({
    plugin: {
      getId: () => "io.github.catdford.color-picker",
      getSettings: async () => ({ generatedThemes: { "pi-theme-dark": STORED_DARK }, previousTheme: "dark" }),
      setSettings: async () => {},
    },
  });
  host.live.preference = "plugin:io.github.catdford.color-picker:pi-theme-dark";
  const response = await plugin.onPanelInvoke("colorPicker.theme", { action: "status" });
  assert.equal(response.ok, true);
  assert.equal(response.supported, true);
  assert.equal(response.pluginId, "io.github.catdford.color-picker");
  assert.equal(response.previousTheme, "dark");
  assert.equal(response.preference, "plugin:io.github.catdford.color-picker:pi-theme-dark");
  assert.deepEqual(response.themes, [
    { id: "pi-theme-dark", label: "蓝 · 深色", base: "dark", seed: "#3b82f6" },
  ]);
});

test("theme apply registers first, then switches, then stores", async () => {
  const host = fakeHost();
  const response = await plugin.onPanelInvoke("colorPicker.theme", {
    action: "apply",
    base: "dark",
    seed: "#3b82f6",
  });

  assert.equal(response.ok, true);
  assert.equal(response.id, "pi-theme-dark");
  assert.equal(response.label, "蓝 · 深色"); // the host locale (zh-CN), not the panel's
  assert.equal(response.base, "dark");
  assert.equal(response.persisted, true);
  assert.equal(response.previousTheme, "system");
  assert.ok(response.tokens["--gray-900"]);
  assert.equal(host.calls.upserts.length, 1);
  assert.equal(host.calls.upserts[0].id, "pi-theme-dark");
  assert.equal(host.calls.upserts[0].label, "蓝 · 深色");
  assert.match(host.calls.upserts[0].css, /--gray-900:/);
  // Registering before switching is the contract: an unregistered id is refused.
  assert.deepEqual(host.calls.setThemes, ["plugin:io.github.catdford.color-picker:pi-theme-dark"]);
  const stored = host.calls.settings.at(-1);
  assert.equal(stored.generatedThemes["pi-theme-dark"].css, host.calls.upserts[0].css);
  assert.equal(stored.previousTheme, "system");
});

test("regenerating keeps the preference the user actually came from", async () => {
  const host = fakeHost();
  await plugin.onPanelInvoke("colorPicker.theme", { action: "apply", base: "dark", seed: "#3b82f6" });
  // The host is now on our theme; a second apply must not record it as the place
  // to come back to, or "revert" would revert to ourselves.
  const second = await plugin.onPanelInvoke("colorPicker.theme", { action: "apply", base: "dark", seed: "#10b981" });
  assert.equal(second.previousTheme, "system");
  assert.equal(host.calls.settings.at(-1).previousTheme, "system");
  assert.equal(host.calls.upserts.length, 2);
});

test("a light theme is a second slot, not a replacement", async () => {
  fakeHost({
    plugin: {
      getId: () => "io.github.catdford.color-picker",
      getSettings: async () => ({ generatedThemes: { "pi-theme-dark": STORED_DARK }, previousTheme: "system" }),
      setSettings: async (values) => {
        fakeHost.lastSettings = values;
      },
    },
  });
  const response = await plugin.onPanelInvoke("colorPicker.theme", { action: "apply", base: "light", seed: "#3b82f6" });
  assert.equal(response.id, "pi-theme-light");
  const stored = fakeHost.lastSettings.generatedThemes;
  assert.deepEqual(Object.keys(stored).sort(), ["pi-theme-dark", "pi-theme-light"]);
  // The dark sheet is carried through untouched.
  assert.equal(stored["pi-theme-dark"].css, STORED_DARK.css);
});

test("theme apply refuses a seed that is not a color", async () => {
  const host = fakeHost();
  const response = await plugin.onPanelInvoke("colorPicker.theme", { action: "apply", base: "dark", seed: "chartreuse-ish" });
  assert.equal(response.ok, false);
  assert.equal(response.code, "INVALID_ARGUMENT");
  assert.deepEqual(host.calls.upserts, []);
  assert.deepEqual(host.calls.setThemes, []);
});

test("an unknown base falls back to dark rather than reaching the host", async () => {
  const host = fakeHost();
  const response = await plugin.onPanelInvoke("colorPicker.theme", { action: "apply", base: "sepia", seed: "#3b82f6" });
  assert.equal(response.base, "dark");
  assert.equal(host.calls.upserts[0].base, "dark");
});

test("a host without the theme API answers UNSUPPORTED instead of throwing", async () => {
  const host = fakeHost({ themes: undefined });
  const status = await plugin.onPanelInvoke("colorPicker.theme", { action: "status" });
  assert.equal(status.ok, true);
  assert.equal(status.supported, false);

  for (const action of ["apply", "restore", "remove"]) {
    const response = await plugin.onPanelInvoke("colorPicker.theme", { action, seed: "#3b82f6" });
    assert.equal(response.ok, false);
    assert.equal(response.code, "UNSUPPORTED");
  }
  assert.deepEqual(host.calls.upserts, []);
  assert.deepEqual(host.calls.setThemes, []);
});

test("theme restore goes back to the remembered preference", async () => {
  const host = fakeHost({
    plugin: {
      getId: () => "io.github.catdford.color-picker",
      getSettings: async () => ({ previousTheme: "light" }),
      setSettings: async () => {},
    },
  });
  const response = await plugin.onPanelInvoke("colorPicker.theme", { action: "restore" });
  assert.deepEqual(response, { ok: true, theme: "light", fellBack: false });
  assert.deepEqual(host.calls.setThemes, ["light"]);
});

test("theme restore lands on system when the remembered theme is gone", async () => {
  // The remembered preference can name another plugin's theme whose plugin has
  // since been disabled; the host refuses it and the user still needs a way out.
  const host = fakeHost();
  host.app.setTheme = async (themeId) => {
    host.calls.setThemes.push(themeId);
    if (themeId !== "system") {
      const error = new Error(`unknown theme id: ${themeId}`);
      error.code = "INVALID_ARGUMENT";
      throw error;
    }
  };
  host.plugin.getSettings = async () => ({ previousTheme: "plugin:other.theme:midnight" });
  const response = await plugin.onPanelInvoke("colorPicker.theme", { action: "restore" });
  assert.equal(response.ok, true);
  assert.equal(response.theme, "system");
  assert.equal(response.fellBack, true);
  assert.deepEqual(host.calls.setThemes, ["plugin:other.theme:midnight", "system"]);
});

test("theme remove forgets the theme and steps off it first", async () => {
  const host = fakeHost({
    plugin: {
      getId: () => "io.github.catdford.color-picker",
      getSettings: async () => ({
        generatedThemes: { "pi-theme-dark": STORED_DARK },
        previousTheme: "system",
      }),
      setSettings: async (values) => {
        host.calls.settings.push(values);
      },
    },
  });
  host.live.preference = "plugin:io.github.catdford.color-picker:pi-theme-dark";
  const response = await plugin.onPanelInvoke("colorPicker.theme", { action: "remove", base: "dark" });
  assert.equal(response.ok, true);
  assert.equal(response.id, "pi-theme-dark");
  assert.equal(response.restored, "system");
  assert.deepEqual(host.calls.removals, ["pi-theme-dark"]);
  // Off the theme before the registry forgets it, and out of the store.
  assert.deepEqual(host.calls.setThemes, ["system"]);
  assert.deepEqual(host.calls.settings.at(-1).generatedThemes, {});
});

test("theme remove leaves an unrelated active theme alone", async () => {
  const host = fakeHost({
    plugin: {
      getId: () => "io.github.catdford.color-picker",
      getSettings: async () => ({ generatedThemes: { "pi-theme-dark": STORED_DARK } }),
      setSettings: async () => {},
    },
  });
  host.live.preference = "plugin:other.theme:midnight";
  const response = await plugin.onPanelInvoke("colorPicker.theme", { action: "remove", base: "dark" });
  assert.equal(response.restored, "");
  assert.deepEqual(host.calls.setThemes, []);
});

test("theme remove tolerates a store that disagrees with the registry", async () => {
  const host = fakeHost({
    plugin: {
      getId: () => "io.github.catdford.color-picker",
      getSettings: async () => ({ generatedThemes: { "pi-theme-dark": STORED_DARK } }),
      setSettings: async () => {},
    },
  });
  host.themes.remove = async () => {
    const error = new Error("theme not found: pi-theme-dark");
    error.code = "NOT_FOUND";
    throw error;
  };
  const response = await plugin.onPanelInvoke("colorPicker.theme", { action: "remove", base: "dark" });
  assert.equal(response.ok, true);
});

test("onLoad re-registers every stored theme", async () => {
  // The host's registry is per-load: without this, an installed theme would be
  // gone after a restart even though its preference survived.
  const host = fakeHost({
    plugin: {
      getId: () => "io.github.catdford.color-picker",
      getSettings: async () => ({
        generatedThemes: {
          "pi-theme-dark": STORED_DARK,
          "pi-theme-light": { label: "蓝 · 浅色", base: "light", seed: "#3b82f6", css: ":root[data-theme] { --ds-bg-primary: #ffffff; }" },
        },
      }),
      setSettings: async () => {},
    },
  });
  await plugin.onLoad();
  assert.deepEqual(host.calls.upserts.map((entry) => entry.id), ["pi-theme-dark", "pi-theme-light"]);
  assert.deepEqual(host.calls.upserts.map((entry) => entry.label), ["蓝 · 深色", "蓝 · 浅色"]);
  assert.equal(host.calls.upserts[0].css, STORED_DARK.css);
  // Re-registering must not switch anything: the host re-binds the preference
  // that is already in AppSettings.theme.
  assert.deepEqual(host.calls.setThemes, []);
});

test("onLoad skips a corrupt store entry and survives a rejected theme", async () => {
  const host = fakeHost({
    plugin: {
      getId: () => "io.github.catdford.color-picker",
      getSettings: async () => ({
        generatedThemes: {
          broken: "not an object",
          empty: { label: "x", base: "dark", css: "" },
          "pi-theme-dark": STORED_DARK,
        },
      }),
      setSettings: async () => {},
    },
  });
  host.themes.upsert = async (input) => {
    host.calls.upserts.push(input);
    const error = new Error("theme css must not use @import");
    error.code = "INVALID_ARGUMENT";
    throw error;
  };
  await plugin.onLoad();
  assert.deepEqual(host.calls.upserts.map((entry) => entry.id), ["pi-theme-dark"]);
  // The command and the tool still registered: a bad theme is not fatal.
  assert.equal(host.calls.tools.length, 1);
});

test("an unknown theme action is refused", async () => {
  fakeHost();
  const response = await plugin.onPanelInvoke("colorPicker.theme", { action: "install-everything" });
  assert.equal(response.ok, false);
  assert.equal(response.code, "UNSUPPORTED");
});
