/**
 * Panel / view UI. Runs in a sandboxed page: no Node, no Electron — every host
 * call goes through `window.pluginBridge`, and only the channels the host
 * forwards are available here.
 *
 * Everything else is local: the palette tables, the conversion math, the
 * generators, contrast checks and the exporters all come from lib/*.js, which
 * the page loads as classic scripts (a `file://` origin rejects ES modules).
 */
(function () {
  "use strict";

  const bridge = window.pluginBridge;
  const color = window.PiColor;
  const paletteApi = window.PiPalette;
  const generate = window.PiGenerate;
  const contrastApi = window.PiContrast;
  const exporter = window.PiExport;

  if (!bridge || !color || !paletteApi || !generate || !contrastApi || !exporter) {
    document.body.textContent =
      "Open this panel inside PI-Desktop — the plugin bridge is unavailable here.";
    return;
  }

  const LABELS = {
    en: {
      preview: "Current color",
      copyCurrent: "Click the swatch to copy",
      copy: "Copy",
      pick: "Pick a color",
      tabPalettes: "Palettes",
      tabHarmony: "Harmony",
      tabContrast: "Contrast",
      tabExport: "Export",
      shadesTitle: "Scale from this color",
      harmonyTitle: "Harmony",
      contrastTitle: "Text contrast",
      cvdTitle: "Color blindness",
      exportScope: "Source",
      exportFormat: "Format",
      copyExport: "Copy export",
      scopeCurrent: "Current color",
      scopeShades: "Generated scale",
      scopeSet: "Last palette",
      onWhite: "On white",
      onBlack: "On black",
      sampleLabel: "Sample text",
      gradientCopy: "Copy CSS",
      copied: "Copied",
      copyFailed: "Copy failed",
    },
    zh: {
      preview: "当前颜色",
      copyCurrent: "点击色块复制",
      copy: "复制",
      pick: "选择颜色",
      tabPalettes: "色板",
      tabHarmony: "配色",
      tabContrast: "对比度",
      tabExport: "导出",
      shadesTitle: "由当前色生成色阶",
      harmonyTitle: "和谐配色",
      contrastTitle: "文字对比度",
      cvdTitle: "色盲模拟",
      exportScope: "导出范围",
      exportFormat: "导出格式",
      copyExport: "复制导出内容",
      scopeCurrent: "当前颜色",
      scopeShades: "生成的色阶",
      scopeSet: "最近的色板",
      onWhite: "对白色",
      onBlack: "对黑色",
      sampleLabel: "示例文字",
      gradientCopy: "复制 CSS",
      copied: "已复制",
      copyFailed: "复制失败",
    },
  };

  const state = {
    hex: "#3b82f6",
    /** Copy notation from `contributes.settings`; the host owns the value. */
    format: "hex",
    /**
     * The source's own oklch() string when the current color came from a table
     * that stores one. Re-deriving it from the hex would lose the canonical
     * value (rounding differs: 63.7% upstream vs 63.8% after a round trip).
     */
    sourceValue: null,
    locale: "en",
    base: "dark",
    tab: "palettes",
    source: "tailwind",
    scope: "current",
    exportFormat: "css",
    /** The palette entry the current color came from, for the export tab. */
    lastSet: null,
  };

  const elements = {
    preview: document.getElementById("preview"),
    previewHint: document.getElementById("preview-hint"),
    valueHex: document.getElementById("value-hex"),
    valueRgb: document.getElementById("value-rgb"),
    valueHsl: document.getElementById("value-hsl"),
    valueOklch: document.getElementById("value-oklch"),
    picker: document.getElementById("native-picker"),
    sourceTabs: document.getElementById("source-tabs"),
    paletteBody: document.getElementById("palette-body"),
    shadeRow: document.getElementById("shade-row"),
    harmonyBody: document.getElementById("harmony-body"),
    contrastBody: document.getElementById("contrast-body"),
    cvdBody: document.getElementById("cvd-body"),
    exportScope: document.getElementById("export-scope"),
    exportFormat: document.getElementById("export-format"),
    exportPreview: document.getElementById("export-preview"),
    exportCopy: document.getElementById("export-copy"),
  };

  function labels() {
    return String(state.locale || "").toLowerCase().startsWith("zh") ? LABELS.zh : LABELS.en;
  }

  /** `{ en, zh }` from the libs in the panel's current language. */
  function localized(label) {
    return paletteApi.localized(label, state.locale);
  }

  function renderLabels() {
    const text = labels();
    for (const node of document.querySelectorAll("[data-label]")) {
      const value = text[node.dataset.label];
      if (typeof value === "string") node.textContent = value;
    }
  }

  // --- current color ---------------------------------------------------------

  /** The current color in `notation`, preferring the palette's own string. */
  function currentText(notation) {
    const parsed = color.parse(state.hex);
    if (!parsed) return null;
    if (notation === "oklch" && state.sourceValue) return state.sourceValue;
    return color.format(parsed, notation);
  }

  function renderHeader() {
    const parsed = color.parse(state.hex);
    if (!parsed) return;
    elements.preview.style.background = parsed.hex;
    elements.preview.title = currentText(state.format);
    elements.valueHex.textContent = parsed.hex;
    elements.valueRgb.textContent = color.format(parsed, "rgb");
    elements.valueHsl.textContent = color.format(parsed, "hsl");
    elements.valueOklch.textContent = currentText("oklch");
    elements.picker.value = parsed.hex;
    elements.previewHint.textContent = `${labels().copyCurrent} · ${state.format.toUpperCase()}`;
  }

  function renderSelection() {
    for (const button of document.querySelectorAll(".swatch[data-hex]")) {
      const match = color.normalizeHex(button.dataset.hex) === state.hex;
      button.setAttribute("aria-pressed", match ? "true" : "false");
    }
  }

  /** `pick` is a hex string or a palette color entry (which carries `value`). */
  function setColor(pick, set) {
    const source = typeof pick === "string" ? { hex: pick } : pick || {};
    const normalized = color.normalizeHex(source.hex);
    if (!normalized) return;
    state.hex = normalized;
    state.sourceValue =
      typeof source.value === "string" && source.value.startsWith("oklch(") ? source.value : null;
    if (set) state.lastSet = set;
    renderHeader();
    renderShades();
    renderHarmony();
    renderContrast();
    renderCvd();
    renderExport();
    renderSelection();
  }

  // --- host calls ------------------------------------------------------------

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
      if (notation === "hex" || notation === "rgb" || notation === "hsl" || notation === "oklch") {
        state.format = notation;
        renderHeader();
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
    renderAll();
  }

  // --- DOM helpers -----------------------------------------------------------

  /**
   * A clickable color chip; `onPick` receives the color entry. The selection
   * ring's two strokes are coloured here because only the fill knows which one
   * will read against it — see `.swatch[aria-pressed]` in styles.css.
   */
  function swatch(item, onPick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "swatch";
    button.style.background = item.hex;
    button.dataset.hex = item.hex;
    const ringInner = contrastApi.bestText(item.hex) || "#000000";
    button.style.setProperty("--ring-inner", ringInner);
    button.style.setProperty("--ring-outer", ringInner === "#000000" ? "#ffffff" : "#000000");
    button.title = item.label ? `${item.label} · ${item.hex}` : item.hex;
    button.setAttribute("aria-label", button.title);
    button.addEventListener("click", () => onPick(item));
    return button;
  }

  function rampRow(labelText, items, onPick) {
    const row = document.createElement("div");
    row.className = "ramp";
    const label = document.createElement("span");
    label.className = "ramp-label";
    label.textContent = labelText;
    label.title = labelText;
    const swatches = document.createElement("div");
    swatches.className = "ramp-swatches";
    let lastWasAccent = false;
    for (const item of items) {
      const isAccent = /^A\d+$/.test(item.stop || "");
      if (isAccent && !lastWasAccent) {
        const gap = document.createElement("span");
        gap.className = "ramp-gap";
        swatches.append(gap);
      }
      lastWasAccent = isAccent;
      swatches.append(swatch(item, onPick));
    }
    row.append(label, swatches);
    return row;
  }

  // --- palette tab -----------------------------------------------------------

  /** Swatches emit the whole entry so the export tab can reuse it. */
  function pickFrom(source, entryId) {
    const colors = paletteApi.colors(source, entryId);
    const entry = paletteApi.entries(source).find((item) => item.id === entryId);
    return (item) =>
      setColor(item, {
        name: paletteApi.slug(entryId),
        label: entry ? entry.label : entryId,
        colors,
      });
  }

  function renderSourceTabs() {
    elements.sourceTabs.replaceChildren();
    for (const source of paletteApi.sources()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "segment";
      button.dataset.source = source.id;
      button.textContent = localized(source.label);
      button.setAttribute("aria-selected", source.id === state.source ? "true" : "false");
      button.addEventListener("click", () => {
        state.source = source.id;
        renderSourceTabs();
        renderPaletteBody();
      });
      elements.sourceTabs.append(button);
    }
  }

  function renderPaletteBody() {
    elements.paletteBody.replaceChildren();
    const source = paletteApi.sources().find((item) => item.id === state.source);
    if (!source) return;

    if (source.kind === "ramps") {
      const singles = paletteApi.singles(state.source);
      if (singles.length) {
        elements.paletteBody.append(
          rampRow(
            "—",
            singles,
            (item) => setColor(item, { name: item.name, label: item.label, colors: singles }),
          ),
        );
      }
      for (const entry of paletteApi.entries(state.source)) {
        const items = paletteApi.colors(state.source, entry.id);
        elements.paletteBody.append(rampRow(entry.label, items, pickFrom(state.source, entry.id)));
      }
      return;
    }

    if (source.kind === "palettes") {
      for (const entry of paletteApi.entries(state.source, state.locale)) {
        elements.paletteBody.append(rampRow(entry.label, paletteApi.colors(state.source, entry.id), pickFrom(state.source, entry.id)));
      }
      return;
    }

    for (const gradient of paletteApi.entries("gradients", state.locale)) {
      const item = document.createElement("div");
      item.className = "gradient-item";

      const head = document.createElement("div");
      head.className = "gradient-head";
      const label = document.createElement("span");
      label.className = "ramp-label";
      label.textContent = gradient.label;
      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = "link-button";
      copyButton.textContent = labels().gradientCopy;
      copyButton.addEventListener("click", () => {
        const stops = gradient.stops.join(", ");
        void copy(`background-image: linear-gradient(${gradient.angle}deg, ${stops});`);
      });
      head.append(label, copyButton);

      const bar = document.createElement("div");
      bar.className = "gradient-bar";
      bar.style.background = `linear-gradient(${gradient.angle}deg, ${gradient.stops.join(", ")})`;

      const stops = document.createElement("div");
      stops.className = "gradient-stops";
      const colors = paletteApi.colors("gradients", gradient.id);
      for (const stop of colors) stops.append(swatch(stop, pickFrom("gradients", gradient.id)));

      item.append(head, bar, stops);
      elements.paletteBody.append(item);
    }
  }

  // --- harmony tab -----------------------------------------------------------

  function renderShades() {
    elements.shadeRow.replaceChildren();
    const scale = generate.shades(state.hex);
    if (!scale.length) return;
    elements.shadeRow.append(
      rampRow(
        state.hex,
        scale,
        (item) =>
          setColor(item, {
            name: `scale-${state.hex.replace("#", "")}`,
            label: "Scale",
            colors: scale.map((entry) => ({ name: `scale-${entry.stop}`, hex: entry.hex })),
          }),
      ),
    );
  }

  function renderHarmony() {
    elements.harmonyBody.replaceChildren();
    const heading = document.createElement("h3");
    heading.textContent = labels().harmonyTitle;
    elements.harmonyBody.append(heading);
    for (const rule of generate.HARMONY_RULES) {
      const colors = generate.harmony(state.hex, rule.id);
      const items = colors.map((item) => ({
        ...item,
        label: `${localized(rule.label)} ${item.delta > 0 ? "+" : ""}${item.delta}`,
      }));
      elements.harmonyBody.append(rampRow(localized(rule.label), items, (item) => setColor(item)));
    }
  }

  // --- contrast tab ----------------------------------------------------------

  function gradeChips(value, options) {
    const container = document.createElement("span");
    container.className = "grades";
    for (const level of ["AA", "AAA"]) {
      const chip = document.createElement("span");
      chip.className = "grade";
      const pass = contrastApi.grade(value, { large: options?.large }) === level;
      chip.dataset.pass = pass ? "true" : "false";
      chip.textContent = level;
      container.append(chip);
    }
    return container;
  }

  function renderContrast() {
    elements.contrastBody.replaceChildren();
    const pairs = [
      { label: labels().onWhite, other: "#ffffff" },
      { label: labels().onBlack, other: "#000000" },
    ];
    for (const pair of pairs) {
      const row = document.createElement("div");
      row.className = "pair-row";
      const chip = document.createElement("span");
      chip.className = "pair-chip";
      chip.style.background = pair.other;
      const label = document.createElement("span");
      label.className = "pair-label";
      label.textContent = pair.label;
      const ratio = document.createElement("span");
      ratio.className = "ratio";
      const value = contrastApi.ratio(state.hex, pair.other);
      ratio.textContent = `${value}:1`;
      row.append(chip, label, ratio, gradeChips(value));
      elements.contrastBody.append(row);
    }

    const sample = document.createElement("div");
    sample.className = "sample";
    sample.style.background = state.hex;
    const sampleText = document.createElement("span");
    sampleText.textContent = labels().sampleLabel;
    sampleText.style.color = contrastApi.bestText(state.hex) || "#000000";
    const sampleRatio = document.createElement("span");
    sampleRatio.className = "ratio";
    sampleRatio.textContent = `${contrastApi.ratio(state.hex, contrastApi.bestText(state.hex))}:1`;
    sample.append(sampleText, sampleRatio);
    elements.contrastBody.append(sample);
  }

  function renderCvd() {
    elements.cvdBody.replaceChildren();
    for (const type of contrastApi.CVD_TYPES) {
      const hex = contrastApi.simulate(state.hex, type.id);
      const item = document.createElement("div");
      item.className = "cvd-item";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cvd-swatch";
      button.style.background = hex;
      button.title = hex;
      button.addEventListener("click", () => void copy(hex));
      const label = document.createElement("span");
      label.className = "cvd-label";
      label.textContent = localized(type.label);
      const value = document.createElement("span");
      value.className = "cvd-hex";
      value.textContent = hex;
      item.append(button, label, value);
      elements.cvdBody.append(item);
    }
  }

  // --- export tab ------------------------------------------------------------

  function exportDoc() {
    if (state.scope === "shades") {
      const scale = generate.shades(state.hex);
      return {
        name: `scale-${state.hex.replace("#", "")}`,
        colors: scale.map((item) => ({ name: `scale-${item.stop}`, hex: item.hex })),
      };
    }
    if (state.scope === "set" && state.lastSet) {
      return {
        name: state.lastSet.name,
        colors: state.lastSet.colors.map((item) => ({
          name: item.name,
          hex: item.hex,
          value: item.value,
        })),
      };
    }
    return { name: "color", colors: [{ name: "current", hex: state.hex }] };
  }

  function renderScopes() {
    const scopes = [
      { id: "current", label: labels().scopeCurrent },
      { id: "shades", label: labels().scopeShades },
    ];
    if (state.lastSet) scopes.push({ id: "set", label: labels().scopeSet });
    if (!scopes.some((scope) => scope.id === state.scope)) state.scope = "current";
    elements.exportScope.replaceChildren();
    for (const scope of scopes) {
      const option = document.createElement("option");
      option.value = scope.id;
      option.textContent = scope.label;
      option.selected = scope.id === state.scope;
      elements.exportScope.append(option);
    }
  }

  function renderFormats() {
    elements.exportFormat.replaceChildren();
    for (const format of exporter.FORMATS) {
      const option = document.createElement("option");
      option.value = format.id;
      option.textContent = localized(format.label);
      option.selected = format.id === state.exportFormat;
      elements.exportFormat.append(option);
    }
  }

  function renderExport() {
    renderScopes();
    renderFormats();
    const format = exporter.FORMATS.find((item) => item.id === state.exportFormat) || exporter.FORMATS[0];
    elements.exportPreview.textContent = format.render(exportDoc());
  }

  // --- wiring ----------------------------------------------------------------

  function renderAll() {
    renderHeader();
    renderSourceTabs();
    renderPaletteBody();
    renderShades();
    renderHarmony();
    renderContrast();
    renderCvd();
    renderExport();
    renderSelection();
  }

  function setTab(tab) {
    state.tab = tab;
    for (const button of document.querySelectorAll(".tab")) {
      button.setAttribute("aria-selected", button.dataset.tab === tab ? "true" : "false");
    }
    for (const panel of document.querySelectorAll(".panel")) {
      panel.hidden = panel.id !== `panel-${tab}`;
    }
  }

  function bindEvents() {
    for (const row of document.querySelectorAll(".value-row")) {
      row.addEventListener("click", () => {
        const text = currentText(row.dataset.notation);
        if (text) void copy(text);
      });
    }
    for (const button of document.querySelectorAll(".tab")) {
      button.addEventListener("click", () => setTab(button.dataset.tab));
    }
    elements.preview.addEventListener("click", () => {
      const text = currentText(state.format);
      if (text) void copy(text);
    });
    elements.picker.addEventListener("input", () => setColor(elements.picker.value));
    elements.exportScope.addEventListener("change", () => {
      state.scope = elements.exportScope.value;
      renderExport();
    });
    elements.exportFormat.addEventListener("change", () => {
      state.exportFormat = elements.exportFormat.value;
      renderExport();
    });
    elements.exportCopy.addEventListener("click", () => void copy(elements.exportPreview.textContent));
    // Panels are not notified when settings change, so refresh when we are shown.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) void readSettings();
    });
  }

  bridge.on("appearance:changed", applyAppearance);
  renderSourceTabs();
  bindEvents();
  applyAppearance(null);
  setTab(state.tab);
  bridge
    .invoke("app.getAppearance")
    .then(applyAppearance)
    .catch(() => applyAppearance(null));
  void readSettings();
})();
