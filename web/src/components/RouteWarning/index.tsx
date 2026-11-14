import { useAtomValue } from "jotai";
import { Data } from "common";
import { routeDeviationAtom } from "../../state/route";

export function RouteWarning() {
  const deviation = useAtomValue(routeDeviationAtom);
  if (!deviation) return null;
  const name = (id: string) => Data.Areas[id]?.name || id;
  return (
    <div
      className="route-detour-border"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="route-detour-message">
        Unexpected area: {name(deviation.detectedAreaId)}. The guide is waiting
        for {name(deviation.expectedAreaId)}.
      </span>
    </div>
  );
}
