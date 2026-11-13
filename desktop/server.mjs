import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

// Serve only the built app, on loopback. No file writes or command endpoints.
export async function startAppServer(directory, port = 5179) {
  const root = resolve(directory);
  const server = createServer(async (request, response) => {
    const headers = {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' ws://127.0.0.1:6755 https:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    };
    try {
      if (!["GET", "HEAD"].includes(request.method)) {
        response.writeHead(405, headers).end();
        return;
      }
      const pathname = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname,
      );
      if (!pathname.startsWith("/exile-leveling/")) {
        response.writeHead(404, headers).end();
        return;
      }
      const relative =
        pathname.slice("/exile-leveling/".length) || "index.html";
      const file = resolve(root, relative);
      if (!file.startsWith(root + sep)) {
        response.writeHead(403, headers).end();
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, {
        ...headers,
        "Content-Type": types[extname(file)] || "application/octet-stream",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(404, headers).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}/exile-leveling/`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}
