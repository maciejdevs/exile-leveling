// Keep editing possible when the user clicks the overlay from PoE. Moving focus
// to any other application ends that session and hides the overlay immediately.
export function updateGameFocus(previous, foreground) {
  if (foreground === "game") return true;
  if (foreground === "overlay") return previous;
  return false;
}

export function shouldShowOverlay({ gameActive, manuallyHidden }) {
  return gameActive && !manuallyHidden;
}
