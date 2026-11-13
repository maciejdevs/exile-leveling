export {};

declare global {
  interface Window {
    exileOverlay?: {
      autoProgressUrl: string;
      getState(): Promise<{ locked: boolean }>;
      toggleLock(): Promise<{ locked: boolean }>;
      hide(): Promise<void>;
      quit(): Promise<void>;
      resize(width: number, height: number): void;
      onState(callback: (state: { locked: boolean }) => void): () => void;
    };
  }
}
