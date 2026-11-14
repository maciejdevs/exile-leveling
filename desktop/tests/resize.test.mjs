import assert from "node:assert/strict";
import test from "node:test";
import { createResizeController } from "../resize.mjs";
import { clampBounds, defaultBounds } from "../window-bounds.mjs";

test("dragging can grow and shrink repeatedly without accumulating renderer-scale errors", (t) => {
  const area = { x: 0, y: 0, width: 1920, height: 1080 };
  let bounds = defaultBounds(area);
  let cursor = { x: 400, y: 600 };
  const resize = createResizeController({
    getBounds: () => bounds,
    getCursor: () => cursor,
    getArea: () => area,
    applyBounds: (value) => {
      bounds = value;
    },
  });
  t.after(resize.end);
  resize.begin();
  cursor = { x: 500, y: 700 };
  resize.update();
  assert.equal(bounds.width, 560);
  assert.equal(bounds.height, 670);
  cursor = { x: 350, y: 550 };
  resize.update();
  assert.equal(bounds.width, 410);
  assert.equal(bounds.height, 520);
  resize.end();
  cursor = { x: 999, y: 999 };
  resize.update();
  assert.equal(bounds.width, 410);
  resize.resizeBy(-100, -100);
  assert.equal(bounds.width, 310);
  assert.equal(bounds.height, 420);
  resize.resizeBy(NaN, Infinity);
  assert.equal(bounds.width, 310);
});

test("size limits and saved positions remain usable on small or moved monitors", () => {
  const area = { x: -1280, y: 0, width: 1280, height: 720 };
  const bounds = clampBounds(
    { x: 9000, y: -9000, width: 9000, height: 9000 },
    area,
  );
  assert.deepEqual(bounds, { x: -1280, y: 0, width: 1280, height: 720 });
  const small = clampBounds({ x: 0, y: 0, width: 1, height: 1 }, area);
  assert.equal(small.width, 300);
  assert.equal(small.height, 220);
});
