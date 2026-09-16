/**
 * Panel / view UI. Runs in a sandboxed page: no Node, no Electron — every host
 * call goes through `window.pluginBridge`, and only the channels the host
 * forwards are available here.
 *
 * This is the stage-1 skeleton: pick a color and copy its notation. The full
 * palette data, harmony rules and AI schemes arrive in later stages.
 */
(function () {
  "use strict";

  const bridge = window.pluginBridge;
  const color = window.PiColor;

  if (!bridge || !color) {
    document.body.textContent =
      "Open this panel inside PI-Desktop — the plugin bridge is unavailable here.";
    return;
  }

  /** Starter set only; the full Tailwind / Material data lands in stage 2. */
  const STARTER_SWATCHES = [
    { hex: "#ef4444", label: "red-500" },
    { hex: "#f97316", label: "orange-500" },
    { hex: "#f59e0b", label: "amber-500" },
    { hex: "#eab308", label: "yellow-500" },
    { hex: "#84cc16", label: "lime-500" },
    { hex: "#22c55e", label: "green-500" },
    { hex: "#14b8a6", label: "teal-500" },
    { hex: "#06b6d4", label: "cyan-500" },
    { hex: "#3b82f6", label: "blue-500" },
    { hex: "#6366f1", label: "indigo-500" },
    { hex: "#a855f7", label: "purple-500" },
    { hex: "#ec4899", label: "pink-500" },
  ];

  const LABELS = {
    en: {
      preview: "Current color",
      copyHint: "Click a value to copy that notation.",
      copy: "Copy",
      pick: "Pick a color",
      swatches: "Starter swatches",
      copied: "Copied",
      copyFailed: "Copy failed",
    },
    zh: {
      preview: "当前颜色",
      copyHint: "点击任意一行即可复制该格式。",
      copy: "复制",
      pick: "选择颜色",
      swatches: "预设色板",
      copied: "已复制",
      copyFailed: "复制失败",
    },
  };

  const state = {
    hex: "#3b82f6",
    /** Copy notation from `contributes.settings`; the host owns the value. */
    format: "hex",
    locale: "en",
    base: "dark",
  };

  const elements = {
    preview: document.getElementById("preview"),
    valueHex: document.getElementById("value-hex"),
    valueRgb: document.getElementById("value-rgb"),
    valueHsl: document.getElementById("value-hsl"),
    picker: document.getElementById("native-picker"),
    grid: document.getElementById("swatch-grid"),
  };

  function labels() {
    return String(state.locale || "").toLowerCase().startsWith("zh") ? LABELS.zh : LABELS.en;
  }

  function renderLabels() {
    const text = labels();
    for (const node of document.querySelectorAll("[data-label]")) {
      const value = text[node.dataset.label];
      if (typeof value === "string") node.textContent = value;
    }
  }

  function render() {
    const parsed = color.parse(state.hex);
    if (!parsed) return;
    elements.preview.style.background = parsed.hex;
    elements.valueHex.textContent = parsed.hex;
    elements.valueRgb.textContent = color.format(parsed, "rgb");
    elements.valueHsl.textContent = color.format(parsed, "hsl");
    elements.picker.value = parsed.hex;
    for (const button of elements.grid.querySelectorAll(".swatch")) {
      button.setAttribute(
        "aria-pressed",
        color.normalizeHex(button.dataset.hex) === parsed.hex ? "true" : "false",
      );
    }
  }

  function setColor(next) {
    const normalized = color.normalizeHex(next);
    if (!normalized) return;
    state.hex = normalized;
    render();
  }

  async function toast(message, level) {
    try {
      await bridge.invoke("ui.showToast", level ? { message, level } : { message });
    } catch {
      // A toast is cosmetic; a failed one must not break the interaction.
    }
  }

  async function copy(text) {
    try {
      await bridge.invoke("clipboard.writeText", { text });
      await toast(`${labels().copied}: ${text}`);
    } catch (error) {
      await toast(`${labels().copyFailed}: ${error?.code || error?.message || "unknown"}`, "error");
    }
  }

  async function readSettings() {
    try {
      const settings = await bridge.invoke("plugin.getSettings");
      const notation = settings?.format;
      if (notation === "hex" || notation === "rgb" || notation === "hsl") {
        state.format = notation;
      }
    } catch {
      // Keep the declared default when the host cannot answer.
    }
  }

  function applyAppearance(appearance) {
    const base = appearance?.base;
    state.base =
      base === "light" || base === "dark"
        ? base
        : window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
    document.documentElement.dataset.base = state.base;
    if (typeof appearance?.locale === "string" && appearance.locale) {
      state.locale = appearance.locale;
    }
    renderLabels();
    render();
  }

  function buildSwatches() {
    for (const swatch of STARTER_SWATCHES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "swatch";
      button.dataset.hex = swatch.hex;
      button.style.background = swatch.hex;
      button.title = swatch.label;
      button.setAttribute("aria-label", swatch.label);
      button.addEventListener("click", () => setColor(swatch.hex));
      elements.grid.append(button);
    }
  }

  function bindEvents() {
    for (const row of document.querySelectorAll(".value-row")) {
      row.addEventListener("click", () => {
        const parsed = color.parse(state.hex);
        const text = color.format(parsed, row.dataset.notation);
        if (text) void copy(text);
      });
    }
    elements.picker.addEventListener("input", () => setColor(elements.picker.value));
    // Panels are not notified when settings change, so refresh when we are shown.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) void readSettings();
    });
  }

  bridge.on("appearance:changed", applyAppearance);
  buildSwatches();
  bindEvents();
  applyAppearance(null);
  bridge
    .invoke("app.getAppearance")
    .then(applyAppearance)
    .catch(() => applyAppearance(null));
  void readSettings();
})();
