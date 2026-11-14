import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

export const APP_URL = "exile://app/";
export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

// A private Electron scheme, not an HTTP server. Only bundled assets are exposed.
export function createAssetHandler(directory) {
  const root = resolve(directory);
  const headers = {
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  };
  return async (request) => {
    try {
      if (!["GET", "HEAD"].includes(request.method))
        return new Response(null, { status: 405, headers });
      const url = new URL(request.url);
      if (
        url.protocol !== "exile:" ||
        url.host !== "app" ||
        url.username ||
        url.password
      )
        return new Response(null, { status: 403, headers });
      const name = decodeURIComponent(url.pathname).slice(1) || "index.html";
      if (name.includes("\\") || name.includes("\0"))
        return new Response(null, { status: 403, headers });
      const file = resolve(root, name);
      if (!file.startsWith(root + sep))
        return new Response(null, { status: 403, headers });
      const body = await readFile(file);
      return new Response(request.method === "HEAD" ? null : body, {
        headers: {
          ...headers,
          "Content-Type": types[extname(file)] || "application/octet-stream",
        },
      });
    } catch {
      return new Response(null, { status: 404, headers });
    }
  };
}

export function isAppUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "exile:" &&
      parsed.host === "app" &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}
