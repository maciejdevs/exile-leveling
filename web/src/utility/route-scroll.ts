// The act header remains sticky when the toolbar/navigation are hidden. Measure
// both visible headers instead of deriving their height from the toolbar mode.
export function scrollToRouteEntry(
  element: HTMLElement,
  behavior: ScrollBehavior,
) {
  const viewport = document.getElementById("app-scroll");
  if (!viewport?.contains(element)) return;
  const navigation = document.querySelector<HTMLElement>(
    "[data-overlay-navigation]",
  );
  const header = element
    .closest("[data-route-section]")
    ?.querySelector<HTMLElement>("[data-route-header]");
  const offset =
    (navigation?.getBoundingClientRect().height ?? 0) +
    (header?.getBoundingClientRect().height ?? 0) +
    4;
  const top =
    viewport.scrollTop +
    element.getBoundingClientRect().top -
    viewport.getBoundingClientRect().top -
    offset;
  viewport.scrollTo({ top: Math.max(0, top), behavior });
}
