export const MIN_WIDTH = 300;
export const MIN_HEIGHT = 220;

export function clampBounds(bounds, area) {
  const width = Math.round(
    Math.min(area.width, Math.max(MIN_WIDTH, bounds.width)),
  );
  const height = Math.round(
    Math.min(area.height, Math.max(MIN_HEIGHT, bounds.height)),
  );
  return {
    width,
    height,
    x: Math.round(
      Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
    ),
    y: Math.round(
      Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
    ),
  };
}

export function defaultBounds(area) {
  return clampBounds(
    { x: area.x + 12, y: area.y + 140, width: 460, height: 570 },
    area,
  );
}

// Cursor positions and window bounds both use desktop DIP coordinates. Renderer
// screenX/innerWidth can use different scales and drift when a window is resized.
export function resizedBounds(start, cursor, area) {
  return clampBounds(
    {
      ...start.bounds,
      width: start.bounds.width + cursor.x - start.cursor.x,
      height: start.bounds.height + cursor.y - start.cursor.y,
    },
    area,
  );
}
