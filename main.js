/**
 * 色卡选择器 / Color Picker — PI-Desktop plugin entry.
 *
 * Runs in the plugin host process (Node). The host injects the global `pi`
 * object, and every call is gated by the permissions declared in
 * manifest.json — widening what this file does usually means widening
 * `permissions` too. All UI lives in renderer/.
 *
 * The panel is sandboxed and cannot reach `agent.complete`, so palette
 * generation arrives here over `onPanelInvoke`; the agent tool calls the same
 * function, which is why both go through lib/ai.js.
 *
 * Host themes (ADR 0260) are the other half of that split: the panel *can*
 * call `pi.themes.*` directly, but a generated theme has to survive the plugin
 * unloading, and only this process can write the plugin's stored copy. Both
 * ends therefore go through one channel here — one place that owns the ids,
 * the labels and the store, instead of two that can drift.
 */

const ai = require("./lib/ai.js");
const theme = require("./lib/theme.js");

const COMMAND_ID = "color-picker.open";

/** Panel → main channels. Anything else is refused rather than ignored. */
const AI_CHANNEL = "colorPicker.ai.suggest";
const MODEL_CHANNEL = "colorPicker.ai.setModel";
const THEME_CHANNEL = "colorPicker.theme";

/**
 * Plugin-private settings keys. The host stores these verbatim in
 * `~/.pi-desktop/plugins/data/<pluginId>/settings.json` (no key whitelist, no
 * size cap) and only ever renders the keys declared in `contributes.settings`,
 * so generated themes stay out of the Settings UI.
 */
const THEME_STORE_KEY = "generatedThemes";
const PREVIOUS_THEME_KEY = "previousTheme";


/** Must match `contributes.agentTools[0].name` in the manifest. */
const TOOL_NAME = "suggest_palette";

/** Kept in step with `contributes.agentTools[0].schema`. */
const TOOL_SCHEMA = {
  type: "object",
  properties: {
    base: {
      type: "string",
      description: "Base color in any CSS notation, e.g. #3b82f6 or oklch(62.3% 0.188 259.81). Optional.",
    },
    style: { type: "string", description: 'Style description, e.g. "tech, dark, slightly purple". Optional.' },
    count: { type: "integer", minimum: 2, maximum: 8, description: "How many colors to return. Defaults to 5." },
  },
};

const PANEL_TITLE = { en: "Color Picker", "zh-CN": "色卡选择器" };

let locale = "en";

/*
 * There is no global shortcut in this build.
 *
 * `Alt+Shift+C` needs `keyboard.globalShortcut` plus a `contributes.globalShortcuts`
 * entry, and that permission arrived with PI-Desktop PR #409 — it is in no release
 * yet, so the plugin center's permission catalog does not know it and refuses the
 * package (MAN013), and no installable host could grant it either. Rather than
 * declare a permission nothing can honour, the feature ships when the host does;
 * PLAN.md records what to restore, and `git show v0.4.0:main.js` has the code.
 * Opening the panel from the command palette is unaffected.
 */

/**
 * A contributed view cannot be opened from a command — there is no `openView`
 * API, and `pi.ui` only exposes openPanel / closePanel. The detached panel is
 * therefore the surface a command can bring up; both surfaces render the same
 * renderer/index.html.
 */
async function openPanel() {
  const title = String(locale || "").toLowerCase().startsWith("zh")
    ? PANEL_TITLE["zh-CN"]
    : PANEL_TITLE.en;
  await pi.ui.openPanel({ title });
}

async function readSettings() {
  try {
    const values = await pi.plugin.getSettings();
    return values && typeof values === "object" ? values : {};
  } catch (error) {
    console.warn(`[color-picker] plugin.getSettings failed: ${error?.message || error}`);
    return {};
  }
}

/**
 * The model to spend a completion on: what the panel asked for, then the stored
 * choice, then whatever the host reports as its default. Empty string means the
 * user has no usable model configured.
 */
async function resolveModelKey(preferred) {
  const settings = await readSettings();
  for (const candidate of [preferred, settings.modelKey]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  try {
    const models = await pi.models.list();
    const fallback = models.find((model) => model.isDefault) || models[0];
    return fallback ? fallback.key : "";
  } catch (error) {
    console.warn(`[color-picker] models.list failed: ${error?.message || error}`);
    return "";
  }
}

/**
 * One palette completion. Returns an envelope rather than throwing: an error's
 * `code` does not survive the two IPC hops back to the panel, and a rate limit
 * or a timeout is something the UI has to name, not swallow.
 */
async function suggestPalette(payload) {
  const request = ai.buildRequest({
    baseHex: typeof payload?.baseHex === "string" ? payload.baseHex : "",
    style: typeof payload?.style === "string" ? payload.style : "",
    locale: typeof payload?.locale === "string" && payload.locale ? payload.locale : locale,
    count: payload?.count,
  });
  if (!request) {
    return { ok: false, code: "INVALID_ARGUMENT", message: "a base color or a style description is required" };
  }
  const modelKey = await resolveModelKey(payload?.modelKey);
  if (!modelKey) {
    return { ok: false, code: "NO_MODEL", message: "no model is configured" };
  }
  try {
    const result = await pi.agent.complete({
      modelKey,
      system: request.system,
      messages: request.messages,
    });
    const suggestion = ai.parseSuggestion(result?.text);
    if (!suggestion.ok) {
      // The model answered, just not with a palette the exporters can use.
      return {
        ok: false,
        code: "UNPARSABLE",
        message: `the model did not return a palette (${suggestion.reason})`,
        text: String(result?.text ?? "").slice(0, 400),
      };
    }
    return {
      ok: true,
      name: suggestion.name,
      colors: suggestion.colors,
      modelKey: result?.modelKey || modelKey,
      usage: result?.usage,
    };
  } catch (error) {
    // RATE_LIMITED / TIMEOUT / PLUGIN_API_FAILED and friends arrive here.
    return { ok: false, code: error?.code || "PLUGIN_API_FAILED", message: String(error?.message || error) };
  }
}

async function setModel(payload) {
  const modelKey = typeof payload?.modelKey === "string" ? payload.modelKey.trim() : "";
  try {
    await pi.plugin.setSettings({ modelKey });
    return { ok: true, modelKey };
  } catch (error) {
    return { ok: false, code: error?.code || "PLUGIN_API_FAILED", message: String(error?.message || error) };
  }
}

/** Whether the running host ships the runtime theme APIs (ADR 0260). */
function hostSupportsThemes() {
  return (
    typeof pi?.themes?.upsert === "function" &&
    typeof pi?.themes?.remove === "function" &&
    typeof pi?.app?.setTheme === "function"
  );
}

/** `plugin:<pluginId>:<themeId>`; the host validates and namespaces this itself. */
function fullThemeId(themeId) {
  return `plugin:${pi.plugin.getId()}:${themeId}`;
}

/**
 * The stored themes, defensively: settings.json is a plain file a user can
 * edit, and one malformed entry must not take the panel down with it.
 */
function readThemeStore(settings) {
  const raw = settings?.[THEME_STORE_KEY];
  const themes = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [id, entry] of Object.entries(raw)) {
      if (!entry || typeof entry !== "object" || typeof entry.css !== "string" || !entry.css) continue;
      themes[id] = {
        label: typeof entry.label === "string" && entry.label ? entry.label : id,
        base: entry.base === "light" ? "light" : "dark",
        seed: typeof entry.seed === "string" ? entry.seed : "",
        css: entry.css,
      };
    }
  }
  return {
    themes,
    previousTheme: typeof settings?.[PREVIOUS_THEME_KEY] === "string" ? settings[PREVIOUS_THEME_KEY] : "",
  };
}

/** The active theme preference, or "" when the host will not say. */
async function readThemePreference() {
  try {
    const appearance = await pi.app.getAppearance();
    return typeof appearance?.theme === "string" ? appearance.theme : "";
  } catch (error) {
    console.warn(`[color-picker] app.getAppearance failed: ${error?.message || error}`);
    return "";
  }
}

/**
 * The themes this plugin registered before, re-registered on every load.
 *
 * The host's registry is per-load — unloading, disabling or crashing drops
 * every theme the plugin owned, and the CSS is never persisted host-side. The
 * *preference* in `AppSettings.theme` does survive, and the shell re-binds it
 * as soon as a matching theme reappears, so re-upserting here is the whole
 * durability story. Labels come from the store, so this runs before the locale
 * is known.
 */
async function restoreThemes() {
  if (!hostSupportsThemes()) return;
  const store = readThemeStore(await readSettings());
  for (const [id, entry] of Object.entries(store.themes)) {
    try {
      await pi.themes.upsert({ id, label: entry.label, base: entry.base, css: entry.css });
    } catch (error) {
      // A theme rejected here (a stricter host, a hand-edited store) must not
      // stop the others, and must not stop the plugin loading.
      console.warn(
        `[color-picker] theme ${id} could not be restored: ${error?.code || error?.message || error}`,
      );
    }
  }
}

async function themeStatus() {
  const store = readThemeStore(await readSettings());
  return {
    ok: true,
    supported: hostSupportsThemes(),
    themes: Object.entries(store.themes).map(([id, entry]) => ({
      id,
      label: entry.label,
      base: entry.base,
      seed: entry.seed,
    })),
    previousTheme: store.previousTheme,
    preference: await readThemePreference(),
    pluginId: pi.plugin.getId(),
  };
}

/**
 * Generate the theme for one base from the seed color, register it, make it the
 * active theme, and store the CSS. Registering before switching matters: the
 * host refuses a preference that names a theme nobody has registered.
 */
async function applyTheme(payload) {
  if (!hostSupportsThemes()) {
    return { ok: false, code: "UNSUPPORTED", message: "this PI-Desktop build has no runtime theme API" };
  }
  const base = payload?.base === "light" ? "light" : "dark";
  const built = theme.buildTheme({ seed: payload?.seed, base });
  if (!built) {
    return { ok: false, code: "INVALID_ARGUMENT", message: "a seed color is required" };
  }
  const tokens = theme.validateTokens(built.tokens);
  if (!tokens.ok) return { ok: false, code: "INTERNAL", message: tokens.error };
  const css = theme.themeCss({ pluginId: pi.plugin.getId(), themeId: built.meta.id, tokens: built.tokens });
  const sheet = theme.validateThemeCss(css);
  if (!sheet.ok) return { ok: false, code: "INTERNAL", message: sheet.error };

  const label = theme.themeLabel({ seed: built.seed, base, locale });
  const store = readThemeStore(await readSettings());
  const themes = {
    ...store.themes,
    [built.meta.id]: { label, base, seed: built.seed, css },
  };
  // Remember where to come back to. Regenerating while our own theme is active
  // must not overwrite the user's original choice with our own id.
  const preference = await readThemePreference();
  const isOurs = preference.startsWith(`plugin:${pi.plugin.getId()}:`);
  const previousTheme = preference && !isOurs ? preference : store.previousTheme;

  let persisted = true;
  let warning = "";
  try {
    await pi.themes.upsert({ id: built.meta.id, label, base, css });
    await pi.app.setTheme(fullThemeId(built.meta.id));
  } catch (error) {
    return { ok: false, code: error?.code || "PLUGIN_API_FAILED", message: String(error?.message || error) };
  }
  try {
    await pi.plugin.setSettings({ [THEME_STORE_KEY]: themes, [PREVIOUS_THEME_KEY]: previousTheme });
  } catch (error) {
    // Applied and visible, but it will not come back after a restart.
    persisted = false;
    warning = String(error?.message || error);
    console.warn(`[color-picker] theme not stored: ${error?.code || warning}`);
  }
  return {
    ok: true,
    id: built.meta.id,
    label,
    base,
    seed: built.seed,
    tokens: built.tokens,
    meta: built.meta,
    previousTheme,
    persisted,
    warning,
  };
}

/** Switch back to whatever was active before the first install. */
async function restoreTheme() {
  if (!hostSupportsThemes()) {
    return { ok: false, code: "UNSUPPORTED", message: "this PI-Desktop build has no runtime theme API" };
  }
  const store = readThemeStore(await readSettings());
  const target = store.previousTheme || "system";
  try {
    await pi.app.setTheme(target);
    return { ok: true, theme: target, fellBack: false };
  } catch (error) {
    // The remembered theme can be gone: another plugin's theme whose plugin was
    // since disabled or uninstalled. Landing on `system` beats an error here.
    try {
      await pi.app.setTheme("system");
      return {
        ok: true,
        theme: "system",
        fellBack: true,
        message: `${target} is no longer available (${error?.code || error?.message || error})`,
      };
    } catch (fallbackError) {
      return { ok: false, code: fallbackError?.code || "PLUGIN_API_FAILED", message: String(fallbackError?.message || fallbackError) };
    }
  }
}

/** Drop one generated theme, and step off it first when it is the active one. */
async function removeTheme(payload) {
  if (!hostSupportsThemes()) {
    return { ok: false, code: "UNSUPPORTED", message: "this PI-Desktop build has no runtime theme API" };
  }
  const base = payload?.base === "light" ? "light" : "dark";
  const id = theme.themeIdFor(base);
  const store = readThemeStore(await readSettings());
  const themes = { ...store.themes };
  delete themes[id];

  try {
    await pi.themes.remove(id);
  } catch (error) {
    // NOT_FOUND means the store and the registry disagreed (a stale entry after
    // a hand edit); the intent — "make sure it is not registered" — still holds.
    if (error?.code !== "NOT_FOUND") {
      return { ok: false, code: error?.code || "PLUGIN_API_FAILED", message: String(error?.message || error) };
    }
  }

  // Leaving the preference pointing at a removed theme would make it come back
  // the next time the same slot is generated, which is not what "removed" means.
  let restored = "";
  if ((await readThemePreference()) === fullThemeId(id)) {
    const fallback = await restoreTheme();
    restored = fallback.ok ? fallback.theme : "system";
  }
  try {
    await pi.plugin.setSettings({ [THEME_STORE_KEY]: themes });
  } catch (error) {
    console.warn(`[color-picker] theme store not updated: ${error?.code || error?.message || error}`);
  }
  return { ok: true, id, removed: true, restored };
}

async function handleTheme(payload) {
  const action = typeof payload?.action === "string" ? payload.action : "";
  if (action === "status") return themeStatus();
  if (action === "apply") return applyTheme(payload);
  if (action === "restore") return restoreTheme();
  if (action === "remove") return removeTheme(payload);
  return { ok: false, code: "UNSUPPORTED", message: `unknown theme action: ${action}` };
}

/** Fixed channels for the plugin's own panel. */
async function onPanelInvoke(channel, payload) {
  if (channel === AI_CHANNEL) return suggestPalette(payload);
  if (channel === MODEL_CHANNEL) return setModel(payload);
  if (channel === THEME_CHANNEL) return handleTheme(payload);
  return { ok: false, code: "UNSUPPORTED", message: `unknown channel: ${channel}` };
}

/** The agent-facing tool: same request, same parser, no panel in the middle. */
async function registerPaletteTool() {
  if (!pi.agent?.registerTool) return;
  try {
    await pi.agent.registerTool({
      name: TOOL_NAME,
      description:
        "Suggest a color palette (配色, 色板, 主题色) from a base color or a style description; returns named hex colors.",
      risk: "low",
      schema: TOOL_SCHEMA,
      execute: (args) =>
        suggestPalette({
          baseHex: typeof args?.base === "string" ? args.base : "",
          style: typeof args?.style === "string" ? args.style : "",
          count: args?.count,
        }),
    });
  } catch (error) {
    console.warn(`[color-picker] agent.registerTool failed: ${error?.code || error?.message || error}`);
  }
}

async function onLoad() {
  try {
    const reported = await pi.app.getLocale();
    if (typeof reported === "string" && reported) locale = reported;
  } catch (error) {
    console.warn(`[color-picker] app.getLocale failed: ${error?.message || error}`);
  }
  await pi.commands.register({
    id: COMMAND_ID,
    title: "Color Picker: Open",
    keywords: ["color", "picker", "palette", "swatch", "hex", "rgb", "hsl", "色卡", "取色", "配色", "颜色"],
    category: "Design",
    run: () => openPanel(),
  });
  await registerPaletteTool();
  await restoreThemes();
}

async function onUnload() {
  try {
    await pi.commands.unregister(COMMAND_ID);
  } catch (error) {
    console.warn(`[color-picker] commands.unregister failed: ${error?.message || error}`);
  }
}

module.exports = { onLoad, onUnload, onPanelInvoke };
