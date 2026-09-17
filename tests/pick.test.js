"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const pick = require("../lib/pick.js");

/** A synthetic RGBA buffer wide enough to exercise edges. */
function buffer(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      data[index] = x;
      data[index + 1] = y;
      data[index + 2] = 0;
      data[index + 3] = 255;
    }
  }
  return data;
}

test("isPickableImage accepts the host's image types and rejects the rest", () => {
  for (const name of ["a.png", "b.JPG", "c.jpeg", "d.webp", "e.gif", "f.bmp", "g.avif", "h.svg"]) {
    assert.equal(pick.isPickableImage(name), true, name);
  }
  for (const name of ["notes.md", "art.tiff", "archive.zip", "noextension", ""]) {
    assert.equal(pick.isPickableImage(name), false, name);
  }
});

test("pickableFiles drops directories and non-images", () => {
  const entries = [
    { name: "shots", path: "shots", isDirectory: true },
    { name: "logo.png", path: "logo.png", isDirectory: false },
    { name: "readme.md", path: "readme.md", isDirectory: false },
    { name: "shot.JPEG", path: "shot.JPEG", isDirectory: false },
  ];
  assert.deepEqual(
    pick.pickableFiles(entries).map((entry) => entry.name),
    ["logo.png", "shot.JPEG"],
  );
  assert.deepEqual(pick.pickableFiles(null), []);
});

test("fitScale fits inside the box and never blows past the zoom cap", () => {
  assert.equal(pick.fitScale(1000, 500, 400, 400), 0.4);
  assert.equal(pick.fitScale(500, 1000, 400, 400), 0.4);
  // A 16px icon is enlarged for aiming, but only up to MAX_ZOOM.
  assert.equal(pick.fitScale(16, 16, 400, 400), pick.MAX_ZOOM);
  assert.equal(pick.fitScale(100, 100, 400, 400), 4);
  // A large image is never enlarged to fill the box.
  assert.equal(pick.fitScale(2000, 1000, 400, 400), 0.2);
  // Degenerate input falls back to 1:1 instead of NaN/Infinity.
  assert.equal(pick.fitScale(0, 10, 400, 400), 1);
  assert.equal(pick.fitScale(10, 10, 0, 400), 1);
});

test("displayToImage maps client points to pixels and clamps outside the canvas", () => {
  const box = { left: 100, top: 50, width: 20, height: 10, scale: 2 };
  assert.deepEqual(pick.displayToImage({ x: 100, y: 50 }, box), { x: 0, y: 0 });
  assert.deepEqual(pick.displayToImage({ x: 139, y: 69 }, box), { x: 19, y: 9 });
  // Half a pixel into a cell still resolves to that cell.
  assert.deepEqual(pick.displayToImage({ x: 103, y: 55 }, box), { x: 1, y: 2 });
  // Outside the canvas on any side clamps to the nearest real pixel.
  assert.deepEqual(pick.displayToImage({ x: 0, y: 0 }, box), { x: 0, y: 0 });
  assert.deepEqual(pick.displayToImage({ x: 9999, y: 9999 }, box), { x: 19, y: 9 });
});

test("loupeRect keeps the window inside the image and reports the centre cell", () => {
  const size = pick.LOUPE_SIZE;
  const middle = pick.loupeRect(50, 40, size, 100, 80);
  assert.deepEqual(middle, { x: 45, y: 35, size, cx: 5, cy: 5 });

  // Top-left corner: the window is flush with the image, the pixel sits at 0.
  const corner = pick.loupeRect(0, 0, size, 100, 80);
  assert.deepEqual(corner, { x: 0, y: 0, size, cx: 0, cy: 0 });

  // Bottom-right corner: the pixel sits at the last cell.
  const far = pick.loupeRect(99, 79, size, 100, 80);
  assert.deepEqual(far, { x: 100 - size, y: 80 - size, size, cx: size - 1, cy: size - 1 });

  // An image smaller than the loupe still yields a valid, in-bounds window.
  const tiny = pick.loupeRect(1, 1, size, 4, 3);
  assert.deepEqual(tiny, { x: 0, y: 0, size, cx: 1, cy: 1 });
});

test("pixelColor reads RGBA and refuses out-of-bounds coordinates", () => {
  const width = 8;
  const data = buffer(width, 4);
  assert.deepEqual(pick.pixelColor(data, width, 3, 2), { r: 3, g: 2, b: 0, hex: "#030200" });
  assert.equal(pick.pixelColor(data, width, -1, 0), null);
  assert.equal(pick.pixelColor(data, width, 0, -1), null);
  assert.equal(pick.pixelColor(data, width, width, 0), null);
  assert.equal(pick.pixelColor(data, width, 0, 4), null);
  assert.equal(pick.pixelColor(null, width, 0, 0), null);
});

test("nearestImageEntry takes the newest image and skips text entries", () => {
  const image = { type: "image", format: "png", data: new Uint8Array([1]), width: 2, height: 3 };
  const history = [
    { type: "text", text: "copied a string", capturedAt: "2026-09-17T10:00:00Z" },
    image,
    { type: "image", format: "png", data: new Uint8Array([2]), width: 9, height: 9 },
  ];
  const found = pick.nearestImageEntry(history);
  assert.equal(found.format, "png");
  assert.equal(found.width, 2);
  assert.equal(found.height, 3);
  assert.deepEqual(Array.from(found.bytes), [1]);

  assert.equal(pick.nearestImageEntry([{ type: "text", text: "x" }]), null);
  assert.equal(pick.nearestImageEntry([]), null);
  assert.equal(pick.nearestImageEntry(null), null);
  // An entry without usable bytes is skipped rather than returned empty.
  assert.equal(pick.nearestImageEntry([{ type: "image", width: 2, height: 2 }]), null);
  assert.equal(pick.nearestImageEntry([{ type: "image", data: new Uint8Array(0) }]), null);
});

test("toBytes normalises the shapes image bytes arrive in", () => {
  const typed = new Uint8Array([1, 2, 3]);
  assert.equal(pick.toBytes(typed), typed);
  assert.deepEqual(Array.from(pick.toBytes([4, 5])), [4, 5]);
  assert.deepEqual(Array.from(pick.toBytes({ type: "Buffer", data: [6, 7] })), [6, 7]);
  assert.equal(pick.toBytes({ type: "image", width: 1 }), null);
  assert.equal(pick.toBytes("nope"), null);
  assert.equal(pick.toBytes(null), null);
});

test("nearestImageEntry accepts a JSON-bridged byte envelope", () => {
  const history = [
    { type: "image", format: "jpeg", data: { type: "Buffer", data: [9, 8, 7] }, width: 4, height: 4 },
  ];
  const found = pick.nearestImageEntry(history);
  assert.equal(found.format, "jpeg");
  assert.deepEqual(Array.from(found.bytes), [9, 8, 7]);
});
