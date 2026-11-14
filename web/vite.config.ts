import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// This bundle is the Electron renderer. There is no browser/PWA mode.
export default defineConfig({ base: "/", plugins: [react()] });
