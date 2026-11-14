import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { desktop } from "../../desktop";
import { activeEdgeAtom } from "../../state/route";

// Progress always runs in the desktop process; no renderer network connection.
export function useAutoProgress() {
  const write = useSetAtom(activeEdgeAtom);
  useEffect(
    () =>
      desktop.onArea((message) => {
        void write(message);
      }),
    [write],
  );
}
