import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { activeEdgeAtom } from "../../state/route";
import { type Id, toast } from "react-toastify";
import useWebSocket, { ReadyState } from "react-use-websocket-lite";
import React from "react";

const AUTO_PROGRESS_URL =
  window.exileOverlay?.autoProgressUrl ?? "ws://127.0.0.1:6754";

export function useAutoProgress() {
  const write = useSetAtom(activeEdgeAtom);
  const { readyState } = useWebSocket({
    url: AUTO_PROGRESS_URL,
    shouldReconnect: true,
    reconnectInterval: 1000,
    onMessage(event) {
      if (typeof event.data === "string") {
        write(event.data);
      }
    },
  });

  const toastId = React.useRef<Id | null>(null);

  useEffect(() => {
    if (readyState !== ReadyState.OPEN) {
      if (toastId.current === null || !toast.isActive(toastId.current)) {
        toastId.current = toast("");
      }

      toast.update(toastId.current, {
        render:
          "Auto-progress offline — run npm run dev or npm run auto-progress",
        type: "info",
        onClick: () => {
          toast.info(
            'Run npm run dev in the repo. For a custom game location, add -- --log-path "path/to/logs/LatestClient.txt".',
            { autoClose: false },
          );
        },
        style: { cursor: "pointer" },
        autoClose: false,
        closeOnClick: false,
        closeButton: null,
      });
    } else {
      if (toastId.current === null || !toast.isActive(toastId.current)) {
        toastId.current = toast("");
      }

      toast.update(toastId.current, {
        render: "Auto-Progress Connected",
        type: "success",
        onClick: null,
        autoClose: null,
        closeOnClick: null,
        closeButton: null,
      });
    }
  }, [readyState]);
}
