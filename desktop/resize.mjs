import { clampBounds, resizedBounds } from "./window-bounds.mjs";

export function createResizeController({
  getBounds,
  getCursor,
  getArea,
  applyBounds,
}) {
  let start;
  let timer;
  let timeout;
  const apply = (bounds) => applyBounds(clampBounds(bounds, getArea()));
  const update = () => {
    if (start) applyBounds(resizedBounds(start, getCursor(), getArea()));
  };
  const end = () => {
    clearInterval(timer);
    clearTimeout(timeout);
    start = undefined;
  };
  return {
    begin() {
      end();
      start = { bounds: getBounds(), cursor: getCursor() };
      timer = setInterval(update, 16);
      timeout = setTimeout(end, 15000); // Recover if a pointer-up event is lost.
    },
    update,
    end,
    resizeBy(dx, dy) {
      if (
        ![dx, dy].every(Number.isFinite) ||
        Math.abs(dx) > 200 ||
        Math.abs(dy) > 200
      )
        return;
      const bounds = getBounds();
      apply({
        ...bounds,
        width: bounds.width + dx,
        height: bounds.height + dy,
      });
    },
  };
}
