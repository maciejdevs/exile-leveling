export interface LogStatus {
  state: "waiting" | "watching";
  message: string;
  path: string | null;
  mode?: "auto" | "manual";
  lastArea?: string | null;
  lastAreaId?: string | null;
  lastAreaAt?: number | null;
  areaEvents?: number;
  fileSize?: number | null;
  modifiedAt?: number | null;
}

export interface DesktopState {
  locked: boolean;
  gameActive: boolean;
  manuallyHidden: boolean;
  focusError: string | null;
  log: LogStatus;
  clickThroughShortcut?: string;
  shortcutRecording?: boolean;
  shortcutError?: string | null;
}

export interface DesktopApi {
  getState(): Promise<DesktopState>;
  saveShortcut(value: string): Promise<DesktopState>;
  recordShortcut(recording: boolean): Promise<DesktopState>;
  refreshLogs(): Promise<LogStatus>;
  detectLogs(): Promise<LogStatus>;
  chooseLog(): Promise<LogStatus>;
  revealLog(): Promise<void>;
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
