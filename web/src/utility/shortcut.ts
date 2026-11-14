export const shortcutLabel = (key?: string) =>
  key?.replaceAll("Control", "Ctrl") || "Not set";

export function shortcutFromKey(event: {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}) {
  if (["Control", "Alt", "Shift", "Meta", "AltGraph"].includes(event.key))
    return null;
  const special: Record<string, string> = {
    " ": "Space",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    "+": "Plus",
  };
  const key =
    event.code === "Backquote" && event.key === "Dead"
      ? "`"
      : special[event.key] ||
        (event.key.length === 1 ? event.key.toUpperCase() : event.key);
  return [
    event.ctrlKey && "Control",
    event.altKey && "Alt",
    event.shiftKey && "Shift",
    event.metaKey && "Super",
    key,
  ]
    .filter(Boolean)
    .join("+");
}
