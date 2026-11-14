import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Data } from "common";
import { desktop, type LogStatus } from "../../desktop";
import { activeEdgeAtom, nextEdgeAtom, routeSelector } from "../../state/route";
import { resolveAreaProgress } from "../../utility/area-progress";
import styles from "./styles.module.css";

const name = (id: string | null | undefined) =>
  id ? Data.Areas[id]?.name || id : "Not detected yet";
const time = (value: number | null | undefined) =>
  value ? new Date(value).toLocaleString() : "—";

export default function LogTracking() {
  const [log, setLog] = useState<LogStatus>({
    state: "waiting",
    message: "Checking log tracking",
    path: null,
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [visit, setVisit] = useState("");
  const route = useAtomValue(routeSelector);
  const [current] = useAtomValue(activeEdgeAtom);
  const navigate = useNavigate();
  useEffect(() => {
    const unsubscribe = desktop.onState((state) => setLog(state.log));
    void desktop.getState().then((state) => setLog(state.log));
    return unsubscribe;
  }, []);
  useEffect(() => setVisit(""), [log.lastAreaId]);
  const choices = route.edges
    .map((id, index) => ({ id, index }))
    .filter((entry) => entry.id === log.lastAreaId);
  const selected =
    choices.length === 1
      ? choices[0].index
      : visit !== "" && choices.some((entry) => entry.index === Number(visit))
        ? Number(visit)
        : null;
  const syncGuide = useSetAtom(nextEdgeAtom(selected));
  const labels = new Map<number, string>();
  for (const section of route.sections)
    section.steps.forEach((step, index) => {
      if (step.type === "fragment_step" && step.edgeIndex !== null)
        labels.set(step.edgeIndex, `${section.name}, step ${index + 1}`);
    });
  const progress = log.lastAreaId
    ? resolveAreaProgress(route.edges, current, log.lastAreaId)
    : null;
  let explanation = "Waiting for an area entry in the game log.";
  if (log.state !== "watching")
    explanation =
      "No readable log selected. Try automatic detection, or choose the client log from your PoE installation.";
  else if (progress?.reason === "current")
    explanation = "The guide matches the latest area detected in the log.";
  else if (progress?.reason === "advanced")
    explanation =
      "The detected area is ahead of the guide. Sync below if you started mid-campaign. New transitions catch up automatically when the route visit is unambiguous.";
  else if (progress?.reason === "ambiguous")
    explanation =
      "This area has multiple later visits in the route. Choose the correct visit below so the guide does not jump to the wrong point.";
  else if (progress?.reason === "earlier")
    explanation =
      "The latest detected area is earlier than the guide. Choose its visit below if you want to move the guide back.";
  else if (progress?.reason === "off-route")
    explanation =
      "The detected area is not in the selected route. Tracking can work without advancing the guide for an off-route area.";

  async function run(action: () => Promise<LogStatus | void>) {
    setBusy(true);
    setNotice("");
    try {
      const status = await action();
      if (status) setLog(status);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message.replace(
              /^Error invoking remote method '[^']+': Error: /,
              "",
            )
          : "Unable to update log tracking.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.panel}>
      <h1>Log tracking</h1>
      <p className={log.state === "watching" ? styles.active : styles.waiting}>
        {log.message}
      </p>
      <dl>
        <dt>Detection</dt>
        <dd>{log.mode === "manual" ? "Selected file" : "Automatic"}</dd>
        <dt>Log file</dt>
        <dd className={styles.path}>{log.path || "No file found"}</dd>
        <dt>File last updated</dt>
        <dd>{time(log.modifiedAt)}</dd>
        <dt>Latest area in log</dt>
        <dd>
          {name(log.lastAreaId)}
          {log.lastAreaId && <small>{log.lastAreaId}</small>}
        </dd>
        <dt>New area changes received</dt>
        <dd>{log.areaEvents ?? 0}</dd>
        <dt>Guide's current area</dt>
        <dd>{name(route.edges[current])}</dd>
        <dt>Guide's next area</dt>
        <dd>{name(route.edges[current + 1])}</dd>
      </dl>
      <div className={styles.buttons}>
        <button disabled={busy} onClick={() => void run(desktop.detectLogs)}>
          Detect automatically
        </button>
        <button disabled={busy} onClick={() => void run(desktop.chooseLog)}>
          Choose log file…
        </button>
        <button disabled={busy} onClick={() => void run(desktop.refreshLogs)}>
          Check now
        </button>
        <button
          disabled={busy || !log.path}
          onClick={() => void run(desktop.revealLog)}
        >
          Open log folder
        </button>
      </div>
      <p>{explanation}</p>
      {choices.length > 1 && (
        <label>
          Route visit
          <select
            value={visit}
            onChange={(event) => setVisit(event.target.value)}
          >
            <option value="">Choose a visit…</option>
            {choices.map((entry) => (
              <option key={entry.index} value={entry.index}>
                {labels.get(entry.index) || `Route visit ${entry.index + 1}`}
                {entry.index === current ? " (current)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className={styles.buttons}>
        <button
          disabled={busy || selected === null || log.state !== "watching"}
          onClick={() =>
            void run(async () => {
              const latest = await desktop.refreshLogs();
              if (latest.lastAreaId !== log.lastAreaId) {
                setNotice(
                  "The detected area changed. Check the new area before synchronizing.",
                );
                return latest;
              }
              syncGuide();
              navigate("/");
            })
          }
        >
          Sync guide to this area
        </button>
        <button onClick={() => navigate("/")}>Back to route</button>
      </div>
      {notice && (
        <p role="alert" className={styles.waiting}>
          {notice}
        </p>
      )}
      <small>
        Automatic detection checks the running game, standard Steam/standalone
        locations, and configured Steam libraries. Only the game log is read.
      </small>
    </div>
  );
}
