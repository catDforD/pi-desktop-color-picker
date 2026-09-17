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
 */

const ai = require("./lib/ai.js");

const COMMAND_ID = "color-picker.open";

/** Panel → main channels. Anything else is refused rather than ignored. */
const AI_CHANNEL = "colorPicker.ai.suggest";
const MODEL_CHANNEL = "colorPicker.ai.setModel";

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

/**
 * Accelerators to try in order. The host owns Electron's globalShortcut and a
 * refusal is an answer rather than an exception (`{ registered: false, error }`),
 * so a chord another plugin or the OS already holds costs the user a preferred
 * shortcut, not the feature.
 */
const SHORTCUT_CANDIDATES = ["Alt+Shift+C", "Ctrl+Alt+C", "Alt+Shift+P"];

let locale = "en";

/**
 * The manifest's `default` is registered by the host right after `onLoad`;
 * registering the same id and accelerator here is equivalent and gives us the
 * refusal code to report. If this call falls back to another accelerator, the
 * host's later attempt on the declared default fails its conflict check before
 * releasing the previous entry, so the fallback binding survives.
 */
async function registerGlobalShortcut() {
  const keyboard = pi.keyboard;
  if (!keyboard?.registerGlobalShortcut) return;
  for (const accelerator of SHORTCUT_CANDIDATES) {
    try {
      const result = await keyboard.registerGlobalShortcut({
        id: COMMAND_ID,
        accelerator,
        command: COMMAND_ID,
      });
      if (result?.registered) {
        if (accelerator !== SHORTCUT_CANDIDATES[0]) {
          console.warn(
            `[color-picker] ${SHORTCUT_CANDIDATES[0]} was refused, using ${accelerator}`,
          );
        }
        return;
      }
      console.warn(
        `[color-picker] shortcut ${accelerator} refused: ${result?.error || "UNKNOWN"}`,
      );
    } catch (error) {
      // PERMISSION_DENIED, INVALID_ARGUMENT and UNSUPPORTED are thrown, not returned.
      console.warn(
        `[color-picker] shortcut ${accelerator} failed: ${error?.code || error?.message || error}`,
      );
    }
  }
  console.warn("[color-picker] no global shortcut could be registered");
}

/**
 * A contributed view cannot be opened from a command — there is no `openView`
 * API, and `pi.ui` only exposes openPanel / closePanel. The detached panel is
 * therefore the surface a command (and the global shortcut) can bring up; both
 * surfaces render the same renderer/index.html.
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

/** Fixed channels for the plugin's own panel. */
async function onPanelInvoke(channel, payload) {
  if (channel === AI_CHANNEL) return suggestPalette(payload);
  if (channel === MODEL_CHANNEL) return setModel(payload);
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
  await registerGlobalShortcut();
  await registerPaletteTool();
}

async function onUnload() {
  try {
    await pi.commands.unregister(COMMAND_ID);
  } catch (error) {
    console.warn(`[color-picker] commands.unregister failed: ${error?.message || error}`);
  }
  // No unregisterGlobalShortcut here: the host releases every accelerator the
  // plugin owns on unload, disable and crash.
}

module.exports = { onLoad, onUnload, onPanelInvoke };
