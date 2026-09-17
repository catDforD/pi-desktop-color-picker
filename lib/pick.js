/**
 * Image picking geometry and sampling, kept free of the DOM so it can be
 * tested like the rest of lib/. The magnifier only ever talks to a pixel
 * source — `{ width, height, pixelAt(x, y) }` — so a future screen picker can
 * swap the implementation (an image bitmap today, host-captured pixels later)
 * without touching the loupe or the readout.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./color.js"));
  } else {
    root.PiPick = factory(root.PiColor);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (color) {
  /** Extensions the host can hand back as an image preview. */
  const PICKABLE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif", "svg"];

  /** Source pixels across the loupe's width; odd so one pixel sits dead centre. */
  const LOUPE_SIZE = 11;

  /** How far a tiny image may be blown up for aiming. */
  const MAX_ZOOM = 8;

  function extensionOf(name) {
    const match = /\.([a-z0-9]+)$/i.exec(String(name || ""));
    return match ? match[1].toLowerCase() : "";
  }

  function isPickableImage(name) {
    return PICKABLE_EXTENSIONS.includes(extensionOf(name));
  }

  /** Files from `fs.list` that can be opened as a pixel source. */
  function pickableFiles(entries) {
    return (entries || []).filter(
      (entry) => entry && !entry.isDirectory && isPickableImage(entry.name),
    );
  }

  /** Scale that fits the image inside a box, enlarging small images up to MAX_ZOOM. */
  function fitScale(width, height, maxWidth, maxHeight) {
    if (!(width > 0) || !(height > 0) || !(maxWidth > 0) || !(maxHeight > 0)) return 1;
    return Math.min(maxWidth / width, maxHeight / height, MAX_ZOOM);
  }

  /**
   * Client coordinates to the image pixel under them. `box` carries the
   * displayed canvas' client rect plus the source image's pixel size, so the
   * result is clamped to real pixels even when the pointer leaves the canvas.
   */
  function displayToImage(point, box) {
    const scale = box.scale > 0 ? box.scale : 1;
    const x = Math.floor((point.x - box.left) / scale);
    const y = Math.floor((point.y - box.top) / scale);
    return {
      x: Math.min(Math.max(x, 0), Math.max(box.width - 1, 0)),
      y: Math.min(Math.max(y, 0), Math.max(box.height - 1, 0)),
    };
  }

  /**
   * The source rectangle a loupe shows around a pixel. The window stops at the
   * image edges, so the sampled pixel walks to the loupe's border instead of the
   * loupe sampling outside the image — `cx`/`cy` are its cell inside the grid.
   */
  function loupeRect(x, y, size, width, height) {
    const span = Math.max(1, Math.floor(size));
    const half = Math.floor(span / 2);
    const startX = Math.min(Math.max(x - half, 0), Math.max(width - span, 0));
    const startY = Math.min(Math.max(y - half, 0), Math.max(height - span, 0));
    return { x: startX, y: startY, size: span, cx: x - startX, cy: y - startY };
  }

  /**
   * RGBA at a pixel of an ImageData-like buffer; null outside the bounds. The
   * height comes from the buffer, and both axes are range-checked: an
   * out-of-range x would otherwise wrap into the next row and quietly return
   * the wrong color.
   */
  function pixelColor(data, width, x, y) {
    if (!data || !(width > 0)) return null;
    const height = Math.floor(data.length / (width * 4));
    if (!(height > 0) || x < 0 || y < 0 || x >= width || y >= height) return null;
    const index = (y * width + x) * 4;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    return { r, g, b, hex: color.rgbToHex({ r, g, b }) };
  }

  /**
   * Clipboard image bytes as a Uint8Array. They cross Electron IPC, so accept
   * the shapes that can arrive: a typed array, a plain byte array, or Node's
   * `{ type: "Buffer", data: [...] }` envelope.
   */
  function toBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (Array.isArray(value)) return Uint8Array.from(value);
    if (value && typeof value === "object" && value.type === "Buffer" && Array.isArray(value.data)) {
      return Uint8Array.from(value.data);
    }
    return null;
  }

  /** Newest usable image in the host's clipboard history, or null. */
  function nearestImageEntry(history) {
    if (!Array.isArray(history)) return null;
    for (const item of history) {
      if (!item || item.type !== "image") continue;
      const bytes = toBytes(item.data);
      if (!bytes || !bytes.length) continue;
      return {
        format: item.format || "png",
        bytes,
        width: item.width || 0,
        height: item.height || 0,
      };
    }
    return null;
  }

  return {
    PICKABLE_EXTENSIONS,
    LOUPE_SIZE,
    MAX_ZOOM,
    isPickableImage,
    pickableFiles,
    fitScale,
    displayToImage,
    loupeRect,
    pixelColor,
    toBytes,
    nearestImageEntry,
  };
});
