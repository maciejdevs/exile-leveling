import { useEffect, useState } from "react";
import { desktop, type DesktopState } from "../../desktop";
import { shortcutFromKey, shortcutLabel } from "../../utility/shortcut";
import styles from "./styles.module.css";

export default function Settings() {
  const [saved, setSaved] = useState("");
  const [draft, setDraft] = useState("");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const update = (state: DesktopState) => {
      setSaved(state.clickThroughShortcut || "");
      if (!state.shortcutRecording) setRecording(false);
      if (state.shortcutError) setNotice(state.shortcutError);
    };
    const unsubscribe = desktop.onState(update);
    void desktop.getState().then((state) => {
      update(state);
      setDraft(state.clickThroughShortcut || "");
    });
    return () => {
      unsubscribe();
      void desktop.recordShortcut(false).catch(() => {});
    };
  }, []);

  return (
    <section
      className={styles.panel}
      onKeyDown={(event) => {
        if (!recording) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Escape") {
          setRecording(false);
          void desktop.recordShortcut(false);
          return;
        }
        const value = shortcutFromKey(event);
        if (value) {
          setDraft(value);
          setRecording(false);
          void desktop.recordShortcut(false);
        }
      }}
    >
      <h1>Settings</h1>
      <h2>Click-through shortcut</h2>
      <p>
        This key toggles between editing the overlay and sending clicks to the
        game beneath it.
      </p>
      <p>
        Current shortcut: <strong>{shortcutLabel(saved)}</strong>
      </p>
      <div className={styles.buttons}>
        <button
          disabled={busy}
          onClick={async () => {
            setNotice("");
            await desktop.recordShortcut(true);
            setRecording(true);
          }}
        >
          {recording ? "Press a key… (Esc cancels)" : "Record shortcut"}
        </button>
        <button disabled={busy || recording} onClick={() => setDraft(saved)}>
          Reset changes
        </button>
      </div>
      <label>
        New shortcut
        <input
          aria-label="Click-through shortcut"
          value={draft}
          disabled={recording || busy}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <small>
        Use Record shortcut and press your preferred key, such as the backtick
        (`), or a key combination.
      </small>
      <div className={styles.buttons}>
        <button
          disabled={busy || recording || !draft || draft === saved}
          onClick={async () => {
            setBusy(true);
            setNotice("");
            try {
              const state = await desktop.saveShortcut(draft);
              setSaved(state.clickThroughShortcut || "");
              setDraft(state.clickThroughShortcut || "");
              setNotice("Shortcut saved.");
            } catch (error) {
              setNotice(
                error instanceof Error
                  ? error.message.replace(
                      /^Error invoking remote method '[^']+': Error: /,
                      "",
                    )
                  : "Could not save shortcut.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Save shortcut
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
      <h2>Click-through view</h2>
      <p>
        While locked, the top controls and scrollbar are hidden. The guide text
        and area highlights remain visible. Press your shortcut again to restore
        the clickable interface.
      </p>
      <small>
        Shortcuts are active only during a PoE/overlay session, so ordinary
        typing in other apps is unaffected. Your selection is saved across
        restarts.
      </small>
    </section>
  );
}
