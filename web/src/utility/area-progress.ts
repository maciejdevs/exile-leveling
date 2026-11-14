export interface AreaProgress {
  index: number;
  reason: "advanced" | "current" | "ambiguous" | "earlier" | "off-route";
}

// Follow the expected transition first. A unique later visit can recover from
// skipped optional steps, but repeated visits (especially towns) need a choice.
export function resolveAreaProgress(
  edges: string[],
  current: number,
  area: string,
): AreaProgress {
  if (edges[current + 1] === area)
    return { index: current + 1, reason: "advanced" };
  if (edges[current] === area) return { index: current, reason: "current" };
  const later = edges
    .map((id, index) => (id === area && index > current ? index : -1))
    .filter((index) => index >= 0);
  if (later.length === 1) return { index: later[0], reason: "advanced" };
  if (later.length > 1) return { index: current, reason: "ambiguous" };
  return {
    index: current,
    reason: edges.includes(area) ? "earlier" : "off-route",
  };
}
