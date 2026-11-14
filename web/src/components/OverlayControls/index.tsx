import { useEffect, useState } from "react";
import { desktop, type DesktopState } from "../../desktop";

export function OverlayControls() {
  const [state, setState] = useState<DesktopState>({
    locked: false,
    gameActive: false,
    manuallyHidden: false,
    focusError: null,
    log: {
      state: "waiting",
      message: "Waiting for the PoE game log",
      path: null,
    },
  });
  useEffect(() => {
    const update = (value: DesktopState) => {
      setState(value);
      document.documentElement.dataset.overlayLocked = String(value.locked);
    };
    const unsubscribe = desktop.onState(update);
    void desktop.getState().then(update);
    return unsubscribe;
  }, []);

  return (
    <>
      <div className="overlay-toolbar">
        <span
          className="overlay-drag"
          title="Drag to position below your status icons"
        >
          Exile Leveling
        </span>
        <span
          className={`overlay-log-status ${state.log.state}`}
          role="status"
          aria-label={state.log.message}
          title={[state.log.message, state.log.path].filter(Boolean).join("\n")}
        >
          ●
        </span>
        <button
          title="Toggle click-through (Ctrl+Alt+I)"
          onClick={() => void desktop.toggleLock()}
        >
          {state.locked ? "Locked · Ctrl+Alt+I" : "Lock"}
        </button>
        <button
          title="Hide overlay (Ctrl+Alt+O to show while PoE is focused)"
          aria-label="Hide overlay"
          onClick={() => void desktop.hide()}
        >
          −
        </button>
        <button
          title="Quit overlay"
          aria-label="Quit overlay"
          onClick={() => void desktop.quit()}
        >
          ×
        </button>
      </div>
      {!state.locked && (
        <div
          className="overlay-resize"
          role="button"
          tabIndex={0}
          aria-label="Resize overlay"
          title="Drag to resize; arrow keys also adjust size"
          onKeyDown={(event) => {
            const delta = {
              ArrowLeft: [-20, 0],
              ArrowRight: [20, 0],
              ArrowUp: [0, -20],
              ArrowDown: [0, 20],
            }[event.key];
            if (delta) {
              event.preventDefault();
              desktop.resizeBy(delta[0], delta[1]);
            }
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            desktop.beginResize();
          }}
          onPointerMove={() => desktop.updateResize()}
          onPointerUp={() => {
            desktop.updateResize();
            desktop.endResize();
          }}
          onPointerCancel={() => desktop.endResize()}
          onLostPointerCapture={() => desktop.endResize()}
        >
          ◢
        </div>
      )}
    </>
  );
}
