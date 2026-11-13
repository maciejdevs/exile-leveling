import { useEffect, useRef, useState } from "react";

export function OverlayControls() {
  const api = window.exileOverlay;
  const [locked, setLocked] = useState(false);
  const resizeStart = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (!api) return;
    const update = (state: { locked: boolean }) => {
      setLocked(state.locked);
      document.documentElement.dataset.overlayLocked = String(state.locked);
    };
    const unsubscribe = api.onState(update);
    void api.getState().then(update);
    return unsubscribe;
  }, [api]);

  if (!api) return null;

  return (
    <>
      <div className="overlay-toolbar">
        <span
          className="overlay-drag"
          title="Drag to position below your status icons"
        >
          Exile Leveling
        </span>
        <button
          title="Toggle click-through (Ctrl+Alt+I)"
          onClick={() => void api.toggleLock()}
        >
          {locked ? "Locked · Ctrl+Alt+I" : "Lock"}
        </button>
        <button
          title="Hide overlay (Ctrl+Alt+O to show again)"
          aria-label="Hide overlay"
          onClick={() => void api.hide()}
        >
          −
        </button>
        <button
          title="Quit overlay"
          aria-label="Quit overlay"
          onClick={() => void api.quit()}
        >
          ×
        </button>
      </div>
      {!locked && (
        <div
          className="overlay-resize"
          role="button"
          tabIndex={0}
          aria-label="Resize overlay"
          title="Drag to resize"
          onKeyDown={(event) => {
            const delta = {
              ArrowLeft: [-20, 0],
              ArrowRight: [20, 0],
              ArrowUp: [0, -20],
              ArrowDown: [0, 20],
            }[event.key];
            if (delta) {
              event.preventDefault();
              api.resize(
                window.innerWidth + delta[0],
                window.innerHeight + delta[1],
              );
            }
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            resizeStart.current = {
              x: event.screenX,
              y: event.screenY,
              width: window.innerWidth,
              height: window.innerHeight,
            };
          }}
          onPointerMove={(event) => {
            const start = resizeStart.current;
            if (start)
              api.resize(
                start.width + event.screenX - start.x,
                start.height + event.screenY - start.y,
              );
          }}
          onPointerUp={() => {
            resizeStart.current = null;
          }}
          onPointerCancel={() => {
            resizeStart.current = null;
          }}
        >
          ◢
        </div>
      )}
    </>
  );
}
