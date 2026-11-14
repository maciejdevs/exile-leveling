export interface DesktopState {
  locked: boolean;
  gameActive: boolean;
  manuallyHidden: boolean;
  focusError: string | null;
  log: { state: "waiting" | "watching"; message: string; path: string | null };
}

export interface DesktopApi {
  getState(): Promise<DesktopState>;
  previousStorage(): Promise<Record<string, string>>;
  toggleLock(): Promise<DesktopState>;
  hide(): Promise<void>;
  quit(): Promise<void>;
  beginResize(): void;
  updateResize(): void;
  endResize(): void;
  resizeBy(dx: number, dy: number): void;
  onState(callback: (state: DesktopState) => void): () => void;
  onArea(callback: (message: string) => void): () => void;
}

export const desktop = window.exileOverlay;
