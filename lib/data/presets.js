/**
 * Curated preset palettes and gradients, authored in this repository.
 *
 * Hand-written on purpose: unlike the Tailwind and Material tables these are
 * editorial, so they live in the source instead of a generator.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PiDataPresets = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  return {
    id: "presets",
    label: { en: "Presets", zh: "预设配色" },
    gradientLabel: { en: "Gradients", zh: "渐变" },
    palettes: [
      {
        id: "sunset",
        name: { en: "Sunset", zh: "日落" },
        colors: ["#2b1055", "#7c3aed", "#f97362", "#ffb03a", "#ffe29a"],
      },
      {
        id: "ocean",
        name: { en: "Ocean", zh: "海洋" },
        colors: ["#0b3954", "#087e8b", "#2ec4b6", "#7fdbda", "#d6f5f5"],
      },
      {
        id: "forest",
        name: { en: "Forest", zh: "森林" },
        colors: ["#1b4332", "#2d6a4f", "#40916c", "#74c69d", "#d8f3dc"],
      },
      {
        id: "blossom",
        name: { en: "Blossom", zh: "樱花" },
        colors: ["#7d2e46", "#c25b7c", "#f19cbb", "#ffd6e0", "#fff0f5"],
      },
      {
        id: "desert",
        name: { en: "Desert", zh: "沙漠" },
        colors: ["#7f4f24", "#a68a64", "#c9ada7", "#e6ccb2", "#f5ebe0"],
      },
      {
        id: "midnight",
        name: { en: "Midnight", zh: "午夜" },
        colors: ["#0d1b2a", "#1b263b", "#415a77", "#778da9", "#c9d6e3"],
      },
      {
        id: "neon",
        name: { en: "Neon", zh: "霓虹" },
        colors: ["#0d0221", "#7700ff", "#ff2a6d", "#05d9e8", "#d1f7ff"],
      },
      {
        id: "macaron",
        name: { en: "Macaron", zh: "马卡龙" },
        colors: ["#ffd1dc", "#ffe5b4", "#d4f0c0", "#b5ead7", "#c7ceea"],
      },
      {
        id: "coffee",
        name: { en: "Coffee", zh: "咖啡" },
        colors: ["#2f1b12", "#6f4e37", "#a67c52", "#d9b08c", "#f3e9dc"],
      },
      {
        id: "nordic",
        name: { en: "Nordic", zh: "北欧" },
        colors: ["#2e3440", "#4c566a", "#88c0d0", "#d8dee9", "#eceff4"],
      },
      {
        id: "citrus",
        name: { en: "Citrus", zh: "柑橘" },
        colors: ["#386641", "#6a994e", "#a7c957", "#f7d002", "#f9a03f"],
      },
      {
        id: "berry",
        name: { en: "Berry", zh: "浆果" },
        colors: ["#4a0e2e", "#7b2d5e", "#a64d79", "#d291bc", "#f1c0e8"],
      },
      {
        id: "ember",
        name: { en: "Ember", zh: "余烬" },
        colors: ["#03071e", "#370617", "#6a040f", "#dc2f02", "#f48c06"],
      },
      {
        id: "mint",
        name: { en: "Mint", zh: "薄荷" },
        colors: ["#004643", "#0a8754", "#3fb68b", "#9fd8cb", "#e8f5ee"],
      },
      {
        id: "mono",
        name: { en: "Monochrome", zh: "单色" },
        colors: ["#111111", "#444444", "#777777", "#aaaaaa", "#eeeeee"],
      },
    ],
    gradients: [
      {
        id: "aurora",
        name: { en: "Aurora", zh: "极光" },
        angle: 135,
        stops: ["#00c9ff", "#92fe9d"],
      },
      {
        id: "dusk",
        name: { en: "Dusk", zh: "暮色" },
        angle: 135,
        stops: ["#2b5876", "#4e4376"],
      },
      {
        id: "sunrise",
        name: { en: "Sunrise", zh: "朝霞" },
        angle: 120,
        stops: ["#f6d365", "#fda085"],
      },
      {
        id: "peach",
        name: { en: "Peach", zh: "蜜桃" },
        angle: 135,
        stops: ["#ffecd2", "#fcb69f"],
      },
      {
        id: "grape",
        name: { en: "Grape", zh: "葡萄" },
        angle: 135,
        stops: ["#7f00ff", "#e100ff"],
      },
      {
        id: "mint-fizz",
        name: { en: "Mint fizz", zh: "薄荷气泡" },
        angle: 135,
        stops: ["#43e97b", "#38f9d7"],
      },
      {
        id: "ember-glow",
        name: { en: "Ember glow", zh: "炭火" },
        angle: 135,
        stops: ["#f12711", "#f5af19"],
      },
      {
        id: "deep-sea",
        name: { en: "Deep sea", zh: "深海" },
        angle: 180,
        stops: ["#000046", "#1cb5e0"],
      },
      {
        id: "orchid",
        name: { en: "Orchid", zh: "兰花" },
        angle: 135,
        stops: ["#a18cd1", "#fbc2eb"],
      },
      {
        id: "steel",
        name: { en: "Steel", zh: "冷钢" },
        angle: 135,
        stops: ["#bdc3c7", "#2c3e50"],
      },
      {
        id: "sand",
        name: { en: "Sand", zh: "暖沙" },
        angle: 135,
        stops: ["#e6d3a3", "#b08d57"],
      },
      {
        id: "berry-sorbet",
        name: { en: "Berry sorbet", zh: "莓果雪酪" },
        angle: 135,
        stops: ["#ff9a9e", "#fecfef"],
      },
    ],
  };
});
