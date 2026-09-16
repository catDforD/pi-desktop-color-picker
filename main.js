/**
 * 色卡选择器 / Color Picker — PI-Desktop plugin entry.
 *
 * Runs in the plugin host process (Node). The host injects the global `pi`
 * object, and every call is gated by the permissions declared in
 * manifest.json — widening what this file does usually means widening
 * `permissions` too. All UI lives in renderer/.
 */

const COMMAND_ID = "color-picker.open";

const PANEL_TITLE = { en: "Color Picker", "zh-CN": "色卡选择器" };

/**
 * A contributed view cannot be opened from a command — there is no `openView`
 * API, and `pi.ui` only exposes openPanel / closePanel. The detached panel is
 * therefore the surface a command (and later a global shortcut) can bring up;
 * both surfaces render the same renderer/index.html.
 */
async function openPanel() {
  let locale = "en";
  try {
    locale = await pi.app.getLocale();
  } catch (error) {
    console.warn(`[color-picker] app.getLocale failed: ${error?.message || error}`);
  }
  const title = String(locale || "").toLowerCase().startsWith("zh")
    ? PANEL_TITLE["zh-CN"]
    : PANEL_TITLE.en;
  await pi.ui.openPanel({ title });
}

async function onLoad() {
  await pi.commands.register({
    id: COMMAND_ID,
    title: "Color Picker: Open",
    keywords: ["color", "picker", "palette", "swatch", "hex", "rgb", "hsl", "色卡", "取色", "配色", "颜色"],
    category: "Design",
    run: () => openPanel(),
  });
}

async function onUnload() {
  try {
    await pi.commands.unregister(COMMAND_ID);
  } catch (error) {
    console.warn(`[color-picker] commands.unregister failed: ${error?.message || error}`);
  }
}

module.exports = { onLoad, onUnload };
