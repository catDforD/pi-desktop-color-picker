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
  const pick = window.PiPick;
  const ai = window.PiAi;

  if (!bridge || !color || !paletteApi || !generate || !contrastApi || !exporter || !pick || !ai) {
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
      pickImage: "Eyedropper",
      pickTitle: "Eyedropper",
      pickClose: "Close",
      pickUse: "Use this color",
      pickSourceFolder: "Folder",
      pickSourceClipboard: "Clipboard",
      pickSourceScreen: "Screen",
      pickSourceSoon: "Not available yet — the host has to expose screen capture first.",
      pickChooseFolder: "Choose folder…",
      pickFolderHint: "Folder access lasts until restart.",
      pickNoFolder: "Choose a folder to list the images in it.",
      pickEmptyFolder: "No PNG, JPEG, WebP, GIF, BMP, AVIF or SVG directly in that folder.",
      pickListTruncated: "Only the first 1000 entries were listed.",
      pickLoading: "Opening…",
      pickNoClipboard: "No image in the clipboard history — the host records images pasted into a session, not everything you copy.",
      pickNoHistory: "The host did not return a clipboard history",
      pickTooLarge: "Over the host's 5 MiB preview limit. Shrink the image and try again.",
      pickTooManyPixels: "Too large to sample (over 64 megapixels).",
      pickNotAnImage: "The host cannot preview that file as an image.",
      pickDecodeFailed: "That image could not be decoded.",
      pickRequestFailed: "Request failed",
      permissionMissing: "Missing permission",
      permissionFix: "reload the plugin (or disable and enable it) and grant the new permissions",
      pickApplied: "Picked",
      pickHintIdle: "Pick a file to start.",
      pickHint: "Arrows nudge · Shift for 10 · click to take the color",
      aiTitle: "AI palette",
      aiModel: "Model",
      aiModelAuto: "Host default",
      aiStyle: "Style description (optional): tech, dark, slightly purple",
      aiRun: "Generate",
      aiRunning: "Generating…",
      aiDone: "Generated",
      aiApplySet: "Use as a set",
      aiNoModel: "No model is available — configure a provider in Settings first.",
      aiRateLimited: "Too many calls in a minute (the host allows 8). Try again shortly.",
      aiTimeout: "The panel stops waiting after 30 seconds. Try again, or ask for fewer colors.",
      aiUnparsable: "The model answered without a usable palette:",
      aiEmptyOutput: "The model returned no text.",
      aiFailed: "Generation failed",
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
      pickImage: "取色器",
      pickTitle: "取色器",
      pickClose: "关闭",
      pickUse: "使用此颜色",
      pickSourceFolder: "文件夹",
      pickSourceClipboard: "剪贴板",
      pickSourceScreen: "屏幕取色",
      pickSourceSoon: "暂未开放——需要宿主先开放屏幕采集能力",
      pickChooseFolder: "选择文件夹…",
      pickFolderHint: "目录授权仅本次运行有效",
      pickNoFolder: "选择一个文件夹，这里会列出其中的图片。",
      pickEmptyFolder: "这个文件夹里没有 PNG / JPEG / WebP / GIF / BMP / AVIF / SVG。",
      pickListTruncated: "只列出了前 1000 项。",
      pickLoading: "正在打开…",
      pickNoClipboard: "剪贴板历史里没有图片——宿主记录的是粘贴进会话的图片，不是所有复制的内容。",
      pickNoHistory: "宿主没有返回剪贴板历史",
      pickTooLarge: "超过宿主 5 MiB 的预览上限，请先缩小图片。",
      pickTooManyPixels: "图片太大（超过 6400 万像素），无法取样。",
      pickNotAnImage: "宿主无法把这个文件当图片预览。",
      pickDecodeFailed: "这张图片无法解码。",
      pickRequestFailed: "请求失败",
      permissionMissing: "缺少权限",
      permissionFix: "请重新加载插件（或禁用后重新启用）并授予新权限",
      pickApplied: "已取色",
      pickHintIdle: "先选一张图片。",
      pickHint: "方向键微调 · 按住 Shift 一次 10 像素 · 点击取色",
      aiTitle: "AI 配色",
      aiModel: "模型",
      aiModelAuto: "宿主默认",
      aiStyle: "风格描述（可选）：科技感、深色、偏紫",
      aiRun: "生成",
      aiRunning: "生成中…",
      aiDone: "已生成",
      aiApplySet: "整套用作导出",
      aiNoModel: "没有可用的模型——请先在设置里配置提供商。",
      aiTimeout: "面板等待上限 30 秒。可以重试，或要求更少的颜色。",
      aiRateLimited: "一分钟内调用次数已达上限（宿主限制 8 次），请稍后再试。",
      aiUnparsable: "模型没有返回可用的配色：",
      aiEmptyOutput: "模型没有返回内容。",
      aiFailed: "生成失败",
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
    /** Model key chosen in the harmony tab; the host stores it for next time. */
    modelKey: "",
    models: [],
    /** Last successful AI palette, kept for the session only. */
    ai: null,
    aiError: null,
    aiBusy: false,
    /** Why `models.list` failed, when it did — usually a missing permission. */
    modelsError: null,
    /** Whether the last `models.list` gave anything to spend. */
    aiUsable: false,
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
    pickOpen: document.getElementById("pick-open"),
    pickOverlay: document.getElementById("pick-overlay"),
    pickClose: document.getElementById("pick-close"),
    pickSources: document.getElementById("pick-sources"),
    pickStatus: document.getElementById("pick-status"),
    pickFolder: document.getElementById("pick-folder"),
    pickFiles: document.getElementById("pick-files"),
    pickStage: document.getElementById("pick-stage"),
    pickCanvas: document.getElementById("pick-canvas"),
    pickLoupe: document.getElementById("pick-loupe"),
    pickLoupeCanvas: document.getElementById("pick-loupe-canvas"),
    pickLoupeValue: document.getElementById("pick-loupe-value"),
    pickHint: document.getElementById("pick-hint"),
    pickUse: document.getElementById("pick-use"),
    aiModel: document.getElementById("ai-model"),
    aiStyle: document.getElementById("ai-style"),
    aiRun: document.getElementById("ai-run"),
    aiStatus: document.getElementById("ai-status"),
    aiResult: document.getElementById("ai-result"),
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
    for (const node of document.querySelectorAll("[data-placeholder]")) {
      const value = text[node.dataset.placeholder];
      if (typeof value === "string") node.placeholder = value;
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
      if (typeof settings?.modelKey === "string") {
        state.modelKey = settings.modelKey;
        renderAiModel();
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

  /**
   * A panel sees raw IPC rejections ("Error invoking remote method ..."), but a
   * missing permission is a state the user can fix: name the permission and the
   * remedy instead of echoing Electron's wrapper.
   */
  function describeFailure(error) {
    const message = String(error?.message || error || "");
    const missing = /missing permission:\s*([a-z][a-z0-9.]*)/i.exec(message);
    if (missing) return `${labels().permissionMissing}: ${missing[1]} — ${labels().permissionFix}`;
    return `${labels().pickRequestFailed}: ${error?.code || message}`;
  }

  // --- pick from image -------------------------------------------------------

  /** fs.list stops at 1000 entries, so a folder listing can be incomplete. */
  const PICK_LIST_MAX = 1000;

  /** Same ceiling the host applies to clipboard images, in pixels. */
  const MAX_PICK_PIXELS = 64_000_000;

  /** CSS pixels per source pixel inside the loupe. */
  const LOUPE_CELL = 10;

  const PICK_SOURCES = [
    { id: "folder", label: "pickSourceFolder" },
    { id: "clipboard", label: "pickSourceClipboard" },
    // Reserved for the screen magnifier: the host has to expose screen capture
    // first, so the slot is visible but not selectable.
    { id: "screen", label: "pickSourceScreen", disabled: true, hint: "pickSourceSoon" },
  ];

  const pickState = {
    source: "folder",
    dirName: "",
    files: [],
    filePath: null,
    /** `{ source, context, width, height, label }` — the image at natural size. */
    image: null,
    point: { x: 0, y: 0 },
    color: null,
    busy: false,
  };

  function pickSetStatus(text) {
    elements.pickStatus.textContent = text || "";
  }

  function pickSetBusy(busy) {
    pickState.busy = busy;
    elements.pickFolder.disabled = busy;
    elements.pickUse.disabled = busy || !pickState.color;
  }

  function renderPickSources() {
    elements.pickSources.replaceChildren();
    for (const source of PICK_SOURCES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "segment";
      button.dataset.pickSource = source.id;
      button.textContent = labels()[source.label];
      button.setAttribute("aria-selected", source.id === pickState.source ? "true" : "false");
      if (source.disabled) {
        button.disabled = true;
        button.setAttribute("aria-disabled", "true");
        if (source.hint) button.title = labels()[source.hint];
      } else {
        button.addEventListener("click", () => void pickSwitchSource(source.id));
      }
      elements.pickSources.append(button);
    }
  }

  function renderPickFiles() {
    elements.pickFiles.replaceChildren();
    const show = pickState.source === "folder" && pickState.files.length > 0;
    elements.pickFiles.hidden = !show;
    if (!show) return;
    for (const file of pickState.files) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pick-file";
      button.setAttribute("aria-current", file.path === pickState.filePath ? "true" : "false");
      const name = document.createElement("span");
      name.className = "pick-file-name";
      name.textContent = file.name;
      const size = document.createElement("span");
      size.className = "pick-file-size";
      size.textContent = file.size ? `${Math.max(1, Math.round(file.size / 1024))} KB` : "";
      button.append(name, size);
      button.addEventListener("click", () => void pickOpenFile(file));
      elements.pickFiles.append(button);
    }
  }

  /** Size the display canvas to the stage, then draw the image into it. */
  function renderPickStage() {
    const image = pickState.image;
    if (!image) {
      elements.pickStage.hidden = true;
      return;
    }
    elements.pickStage.hidden = false;
    const padding = 2;
    const box = {
      width: Math.max(elements.pickStage.clientWidth - padding, 40),
      height: Math.max(elements.pickStage.clientHeight - padding, 40),
    };
    const scale = pick.fitScale(image.width, image.height, box.width, box.height);
    const cssWidth = Math.max(1, Math.round(image.width * scale));
    const cssHeight = Math.max(1, Math.round(image.height * scale));
    const ratio = window.devicePixelRatio || 1;
    const canvas = elements.pickCanvas;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = scale < 1;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    renderPickLoupe();
  }

  /**
   * The loupe shows true source pixels, so it draws from the natural-size
   * canvas — never from the scaled display, where a sample would be an
   * interpolation of its neighbours.
   */
  function renderPickLoupe() {
    const image = pickState.image;
    const sampled = pickState.color;
    if (!image || !sampled) {
      elements.pickLoupe.hidden = true;
      return;
    }
    elements.pickLoupe.hidden = false;
    const size = pick.LOUPE_SIZE;
    const window_ = pick.loupeRect(pickState.point.x, pickState.point.y, size, image.width, image.height);
    const ratio = window.devicePixelRatio || 1;
    const cssSize = size * LOUPE_CELL;
    const canvas = elements.pickLoupeCanvas;
    canvas.style.width = `${cssSize}px`;
    canvas.style.height = `${cssSize}px`;
    canvas.width = Math.round(cssSize * ratio);
    canvas.height = Math.round(cssSize * ratio);
    const context = canvas.getContext("2d");
    const cell = canvas.width / size;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      image.source,
      window_.x,
      window_.y,
      window_.size,
      window_.size,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    context.lineWidth = 1;
    context.strokeStyle = "rgb(0 0 0 / 16%)";
    for (let i = 1; i < size; i += 1) {
      const offset = Math.round(i * cell) + 0.5;
      context.beginPath();
      context.moveTo(offset, 0);
      context.lineTo(offset, canvas.height);
      context.stroke();
      context.beginPath();
      context.moveTo(0, offset);
      context.lineTo(canvas.width, offset);
      context.stroke();
    }
    // The sampled cell's outline and crosshair go down twice — white under
    // black — so they read on artwork of any lightness.
    const left = window_.cx * cell;
    const top = window_.cy * cell;
    const centre = left + cell / 2;
    const middle = top + cell / 2;
    const mark = (lineWidth, strokeStyle) => {
      context.lineWidth = lineWidth;
      context.strokeStyle = strokeStyle;
      context.strokeRect(left + 0.5, top + 0.5, cell - 1, cell - 1);
      context.beginPath();
      context.moveTo(centre, 0);
      context.lineTo(centre, top);
      context.moveTo(centre, top + cell);
      context.lineTo(centre, canvas.height);
      context.moveTo(0, middle);
      context.lineTo(left, middle);
      context.moveTo(left + cell, middle);
      context.lineTo(canvas.width, middle);
      context.stroke();
    };
    mark(3, "rgb(255 255 255 / 85%)");
    mark(1, "rgb(0 0 0 / 80%)");
    elements.pickLoupeValue.textContent = sampled.hex;

    // Follow the cursor, on the first side of it that fits inside the stage —
    // the one thing it must never do is cover the pixel being aimed at.
    const stage = elements.pickStage.getBoundingClientRect();
    const shown = elements.pickCanvas.getBoundingClientRect();
    const scale = image.width > 0 ? shown.width / image.width : 1;
    const cursorX = shown.left - stage.left + (pickState.point.x + 0.5) * scale;
    const cursorY = shown.top - stage.top + (pickState.point.y + 0.5) * scale;
    const gap = 12;
    const loupe = elements.pickLoupe;
    const width = loupe.offsetWidth;
    const height = loupe.offsetHeight;
    const spots = [
      { x: cursorX + gap, y: cursorY + gap },
      { x: cursorX - gap - width, y: cursorY + gap },
      { x: cursorX + gap, y: cursorY - gap - height },
      { x: cursorX - gap - width, y: cursorY - gap - height },
    ];
    const fits = (spot) =>
      spot.x >= 0 && spot.y >= 0 && spot.x + width <= stage.width && spot.y + height <= stage.height;
    const spot = spots.find(fits) || {
      x: cursorX - width / 2,
      y: cursorY - height / 2,
    };
    loupe.style.left = `${Math.max(0, Math.min(spot.x, Math.max(stage.width - width, 0)))}px`;
    loupe.style.top = `${Math.max(0, Math.min(spot.y, Math.max(stage.height - height, 0)))}px`;
  }

  function renderPickOverlay() {
    renderPickSources();
    elements.pickFolder.hidden = pickState.source !== "folder";
    renderPickFiles();
    elements.pickHint.textContent = pickState.image
      ? labels().pickHint
      : pickState.source === "folder"
        ? labels().pickFolderHint
        : labels().pickHintIdle;
    renderPickStage();
  }

  /** Sample one source pixel, in image coordinates. */
  function pickSamplePoint(x, y) {
    const image = pickState.image;
    if (!image) return;
    const point = {
      x: Math.min(Math.max(Math.round(x), 0), image.width - 1),
      y: Math.min(Math.max(Math.round(y), 0), image.height - 1),
    };
    pickState.point = point;
    const rgba = image.context.getImageData(point.x, point.y, 1, 1).data;
    pickState.color = {
      r: rgba[0],
      g: rgba[1],
      b: rgba[2],
      hex: color.rgbToHex({ r: rgba[0], g: rgba[1], b: rgba[2] }),
    };
    elements.pickUse.disabled = pickState.busy;
    renderPickLoupe();
  }

  function pickSampleFromClient(clientX, clientY) {
    const image = pickState.image;
    if (!image) return;
    const shown = elements.pickCanvas.getBoundingClientRect();
    const scale = image.width > 0 ? shown.width / image.width : 1;
    const point = pick.displayToImage(
      { x: clientX, y: clientY },
      {
        left: shown.left,
        top: shown.top,
        width: image.width,
        height: image.height,
        scale,
      },
    );
    pickSamplePoint(point.x, point.y);
  }

  /** Draw a loaded image into a natural-size canvas and start sampling it. */
  async function pickUseImage(source, label) {
    const width = source.naturalWidth || source.width || 0;
    const height = source.naturalHeight || source.height || 0;
    if (!(width > 0) || !(height > 0)) {
      pickSetStatus(labels().pickDecodeFailed);
      return false;
    }
    if (width * height > MAX_PICK_PIXELS) {
      pickSetStatus(labels().pickTooManyPixels);
      return false;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    // The flag keeps reads on the CPU, which is what per-pointer sampling needs.
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(source, 0, 0);
    pickState.image = { source: canvas, context, width, height, label };
    pickState.color = null;
    pickSetStatus("");
    pickSamplePoint(Math.floor(width / 2), Math.floor(height / 2));
    renderPickOverlay();
    return true;
  }

  async function pickResetImage() {
    pickState.image = null;
    pickState.color = null;
    pickState.filePath = null;
    elements.pickStage.hidden = true;
    elements.pickLoupe.hidden = true;
    elements.pickUse.disabled = true;
  }

  async function pickSwitchSource(id) {
    if (id === pickState.source) return;
    pickState.source = id;
    await pickResetImage();
    renderPickOverlay();
    if (id === "clipboard") {
      await pickLoadFromClipboard();
      return;
    }
    pickSetStatus(
      pickState.files.length ? "" : labels().pickNoFolder,
    );
  }

  async function pickChooseFolder() {
    pickSetBusy(true);
    try {
      const directory = await bridge.invoke("fs.requestDirectory");
      if (!directory) {
        pickSetStatus(labels().pickNoFolder);
        return;
      }
      pickState.dirName = directory.name || directory.path || "";
      const entries = await bridge.invoke("fs.list", { path: "" });
      pickState.files = pick.pickableFiles(entries);
      const truncated = Array.isArray(entries) && entries.length >= PICK_LIST_MAX;
      await pickResetImage();
      renderPickOverlay();
      if (!pickState.files.length) {
        pickSetStatus(labels().pickEmptyFolder);
      } else if (truncated) {
        pickSetStatus(labels().pickListTruncated);
      } else {
        pickSetStatus(pickState.dirName);
      }
    } catch (error) {
      pickSetStatus(describeFailure(error));
    } finally {
      pickSetBusy(false);
    }
  }

  async function pickOpenFile(file) {
    pickSetBusy(true);
    pickSetStatus(labels().pickLoading);
    try {
      const preview = await bridge.invoke("fs.readPreview", { path: file.path });
      if (!preview || typeof preview !== "object") {
        pickSetStatus(labels().pickNotAnImage);
        return;
      }
      if (preview.kind === "tooLarge") {
        pickSetStatus(labels().pickTooLarge);
        return;
      }
      if (preview.kind !== "image" || typeof preview.dataUrl !== "string") {
        pickSetStatus(labels().pickNotAnImage);
        return;
      }
      const image = new Image();
      image.src = preview.dataUrl;
      await image.decode();
      if (await pickUseImage(image, file.name)) pickState.filePath = file.path;
    } catch (error) {
      pickSetStatus(describeFailure(error));
    } finally {
      pickSetBusy(false);
      renderPickFiles();
    }
  }

  async function pickLoadFromClipboard() {
    pickSetBusy(true);
    pickSetStatus(labels().pickLoading);
    let url = null;
    try {
      const history = await bridge.invoke("clipboard.getHistory");
      if (!Array.isArray(history)) {
        // A host without this panel channel answers with the plugin's own
        // envelope instead, so "no array" is not the same as "no image".
        const code = history && typeof history === "object" && history.code ? ` (${history.code})` : "";
        pickSetStatus(`${labels().pickNoHistory}${code}`);
        return;
      }
      const entry = pick.nearestImageEntry(history);
      if (!entry) {
        pickSetStatus(labels().pickNoClipboard);
        return;
      }
      const blob = new Blob([entry.bytes], { type: `image/${entry.format}` });
      url = URL.createObjectURL(blob);
      const image = new Image();
      image.src = url;
      await image.decode();
      await pickUseImage(image, `${entry.format.toUpperCase()} ${entry.width}×${entry.height}`);
    } catch (error) {
      pickSetStatus(describeFailure(error));
    } finally {
      if (url) URL.revokeObjectURL(url);
      pickSetBusy(false);
    }
  }

  function pickApply() {
    const sampled = pickState.color;
    if (!sampled) return;
    setColor(sampled.hex);
    closePickOverlay();
    void toast(`${labels().pickApplied} ${sampled.hex}`);
  }

  function openPickOverlay() {
    elements.pickOverlay.hidden = false;
    void pickResetImage();
    pickSetBusy(false);
    renderPickOverlay();
    // A folder chosen earlier in this session is still granted, so keep it.
    pickSetStatus(
      pickState.source === "clipboard"
        ? ""
        : pickState.files.length
          ? pickState.dirName
          : labels().pickNoFolder,
    );
    elements.pickOverlay.focus();
    if (pickState.source === "clipboard") void pickLoadFromClipboard();
  }

  function closePickOverlay() {
    elements.pickOverlay.hidden = true;
    void pickResetImage();
    elements.pickOpen.focus();
  }

  // --- AI palette ------------------------------------------------------------

  /** Model rows the host reports as ready; empty means nothing to spend. */
  async function loadModels() {
    try {
      const models = await bridge.invoke("models.list");
      state.models = Array.isArray(models) ? models : [];
      state.modelsError = null;
    } catch (error) {
      state.models = [];
      state.modelsError = describeFailure(error);
      console.warn(`models.list failed: ${error?.code || error?.message || error}`);
    }
    renderAiModel();
    renderAiResult();
  }

  function renderAiModel() {
    elements.aiModel.replaceChildren();
    const auto = document.createElement("option");
    auto.value = "";
    auto.textContent = labels().aiModelAuto;
    elements.aiModel.append(auto);
    for (const model of state.models) {
      const option = document.createElement("option");
      option.value = String(model.key || "");
      // Compact on the control and in the list, complete on hover: a host label
      // like "gpt-5.3-codex-spark (OpenAI (ChatGPT Plus/Pro))" does not fit the
      // panel's width, and the control cannot ellipsize it.
      option.textContent = ai.compactModelLabel(model.label || model.modelId || model.key || "");
      option.title = [model.label, model.providerName, model.key].filter(Boolean).join(" · ");
      elements.aiModel.append(option);
    }
    // A stored key the host no longer reports falls back to the default rather
    // than sending a completion to a model that is gone.
    const known = state.models.some((model) => model.key === state.modelKey);
    elements.aiModel.value = known ? state.modelKey : "";
    // Nothing to spend: say so next to the button instead of failing a call.
    // The panel renders once before `models.list` answers, so the hint has to
    // come back off when the list arrives.
    const wasUsable = state.aiUsable;
    const usable = state.models.length > 0;
    state.aiUsable = usable;
    elements.aiRun.disabled = !usable || state.aiBusy;
    if (state.modelsError) aiSetStatus(state.modelsError);
    else if (!usable) aiSetStatus(labels().aiNoModel);
    else if (!wasUsable) aiSetStatus("");
  }

  function aiSetStatus(text) {
    elements.aiStatus.textContent = text || "";
  }

  /**
   * Host messages can be a wall of provider JSON with no break opportunities.
   * Collapse and clip it for the status line; the full text goes to the raw
   * block below when it is long enough to matter.
   */
  function clipMessage(value, max = 160) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max).trimEnd()}…`;
  }

  function aiErrorMessage(error) {
    const text = labels();
    if (/missing permission:/i.test(String(error?.message || ""))) return describeFailure(error);
    switch (error?.code) {
      case "RATE_LIMITED":
        return text.aiRateLimited;
      case "TIMEOUT":
        return text.aiTimeout;
      case "NO_MODEL":
        return text.aiNoModel;
      case "UNPARSABLE":
        return text.aiUnparsable;
      case "PLUGIN_API_FAILED": {
        // The host collapses provider failures into this one code, so the
        // message is the only clue — and "the model returned no text" is only
        // one of the ways it happens.
        const message = String(error.message || "");
        if (/returned no text|empty (completion|output)/i.test(message)) return text.aiEmptyOutput;
        return message ? `${text.aiFailed}: ${clipMessage(message)}` : `${text.aiFailed}: ${error.code}`;
      }
      case "PERMISSION_DENIED":
        return `${text.aiFailed}: ${error.message || error.code}`;
      default:
        return `${text.aiFailed}: ${error?.code || "UNKNOWN"}${error?.message ? ` · ${error.message}` : ""}`;
    }
  }

  function renderAiResult() {
    elements.aiResult.replaceChildren();
    const result = state.ai;
    if (state.aiError) {
      const note = document.createElement("p");
      note.className = "pick-status";
      note.textContent = aiErrorMessage(state.aiError);
      elements.aiResult.append(note);
      // Showing what the host or the model actually said beats asking the user
      // to trust a summary. Long messages are clipped above, so pass the
      // original through here rather than losing it.
      const detail =
        state.aiError.text || (state.aiError.message && state.aiError.message.length > 160 ? state.aiError.message : "");
      if (detail) {
        const raw = document.createElement("pre");
        raw.className = "code ai-raw";
        raw.textContent = detail;
        elements.aiResult.append(raw);
      }
    }
    if (!result) return;
    const document_ = ai.toDocument(result);
    if (!document_) return;

    const head = document.createElement("div");
    head.className = "ai-result-head";
    const name = document.createElement("span");
    name.className = "ai-result-name";
    name.textContent = document_.name;
    name.title = document_.name;
    const use = document.createElement("button");
    use.type = "button";
    use.className = "link-button";
    use.textContent = labels().aiApplySet;
    use.addEventListener("click", () => {
      // Hands the whole palette to the export tab as "Last palette".
      state.lastSet = { name: document_.name, label: document_.name, colors: document_.colors };
      state.scope = "set";
      setTab("export");
      renderExport();
    });
    head.append(name, use);
    elements.aiResult.append(head);

    const items = document_.colors.map((entry) => ({
      ...color.parse(entry.hex),
      label: entry.name,
    }));
    elements.aiResult.append(
      rampRow(
        document_.name,
        items,
        (item) =>
          setColor(item, {
            name: paletteApi.slug(document_.name),
            label: document_.name,
            colors: document_.colors,
          }),
      ),
    );
  }

  async function runAi() {
    if (state.aiBusy) return;
    state.aiBusy = true;
    state.aiError = null;
    elements.aiRun.disabled = true;
    aiSetStatus(labels().aiRunning);
    try {
      const response = await bridge.invoke("colorPicker.ai.suggest", {
        baseHex: state.hex,
        style: elements.aiStyle.value,
        locale: state.locale,
        modelKey: state.modelKey,
      });
      if (response?.ok) {
        state.ai = { ok: true, name: response.name, colors: response.colors };
        const tokens = response.usage?.totalTokens;
        aiSetStatus(tokens ? `${labels().aiDone} · ${tokens} tokens` : labels().aiDone);
      } else {
        state.aiError = {
          code: response?.code || "PLUGIN_API_FAILED",
          message: response?.message || "",
          text: typeof response?.text === "string" ? response.text : "",
        };
        aiSetStatus("");
      }
    } catch (error) {
      state.aiError = { code: error?.code || "PLUGIN_API_FAILED", message: String(error?.message || error) };
      aiSetStatus("");
    } finally {
      state.aiBusy = false;
      elements.aiRun.disabled = state.models.length === 0;
      renderAiResult();
    }
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
    renderAiModel();
    renderAiResult();
    if (!elements.pickOverlay.hidden) renderPickOverlay();
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

    elements.aiRun.addEventListener("click", () => void runAi());
    elements.aiModel.addEventListener("change", () => {
      state.modelKey = elements.aiModel.value;
      void bridge
        .invoke("colorPicker.ai.setModel", { modelKey: state.modelKey })
        .then((response) => {
          if (response && response.ok === false) {
            void toast(`${labels().aiFailed}: ${response.code || "UNKNOWN"}`, "error");
          }
        })
        .catch((error) =>
          toast(`${labels().aiFailed}: ${error?.code || error?.message || error}`, "error"),
        );
    });

    elements.pickOpen.addEventListener("click", openPickOverlay);
    elements.pickClose.addEventListener("click", closePickOverlay);
    elements.pickFolder.addEventListener("click", () => void pickChooseFolder());
    elements.pickUse.addEventListener("click", pickApply);
    elements.pickCanvas.addEventListener("pointermove", (event) =>
      pickSampleFromClient(event.clientX, event.clientY),
    );
    elements.pickCanvas.addEventListener("click", (event) => {
      pickSampleFromClient(event.clientX, event.clientY);
      pickApply();
    });
    document.addEventListener("keydown", (event) => {
      if (elements.pickOverlay.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closePickOverlay();
        return;
      }
      if (event.key === "Enter") {
        if (!pickState.color) return;
        event.preventDefault();
        pickApply();
        return;
      }
      const step = event.shiftKey ? 10 : 1;
      const moves = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const move = moves[event.key];
      if (!move || !pickState.image) return;
      // The panel is a scroll container; a nudge must not scroll it instead.
      event.preventDefault();
      pickSamplePoint(pickState.point.x + move[0], pickState.point.y + move[1]);
    });
    // A docked view follows the host window, so the fit has to be recomputed.
    window.addEventListener("resize", () => {
      if (!elements.pickOverlay.hidden) renderPickStage();
    });

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
  void readSettings().then(loadModels);
})();
