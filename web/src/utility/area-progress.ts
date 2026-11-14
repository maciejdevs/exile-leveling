export interface AreaProgress {
  index: number;
  reason: "advanced" | "current" | "unexpected";
}

// Anchor progress to the guide, not to the last physical area visited. Detours
// never skip route visits, even if the destination appears only once later on.
export function resolveAreaProgress(
  edges: string[],
  current: number,
  area: string,
): AreaProgress {
  if (edges[current + 1] === area)
    return { index: current + 1, reason: "advanced" };
  if (edges[current] === area) return { index: current, reason: "current" };
  return { index: current, reason: "unexpected" };
}

export function routeDeviation(
  edges: string[],
  current: number,
  detectedAreaId: string | null,
) {
  const expectedAreaId = edges[current + 1];
  if (
    detectedAreaId === null ||
    expectedAreaId === undefined ||
    detectedAreaId === edges[current] ||
    detectedAreaId === expectedAreaId
  )
    return null;
  return { detectedAreaId, expectedAreaId };
}
