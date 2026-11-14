import type { DesktopApi } from "./desktop";

declare global {
  interface Window {
    exileOverlay: DesktopApi;
  }
}
