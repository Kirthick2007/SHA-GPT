const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.PORT || 5173);
const FRONTEND_DIR = path.join(__dirname, "frontend");
const PUBLIC_DIR = path.join(FRONTEND_DIR, "public");
const API_TARGET = "http://127.0.0.1:8000";

const mimeTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function send(res, code, body, type = "text/plain") {
  res.writeHead(code, { "Content-Type": type });
  res.end(body);
}

function serveStatic(req, res) {
  const requestedPath = new URL(req.url, `http://127.0.0.1:${PORT}`).pathname;
  const safePath = requestedPath === "/" ? "/index.html" : requestedPath;
  let filePath = path.normalize(path.join(FRONTEND_DIR, safePath));

  if (!filePath.startsWith(FRONTEND_DIR)) {
    return send(res, 403, "Forbidden");
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
      if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, "Forbidden");
      return fs.readFile(filePath, (publicError, publicContent) => {
        if (publicError) return send(res, 404, "Not found");
        send(res, 200, publicContent, mimeTypes[path.extname(filePath)] || "application/octet-stream");
      });
    }
    send(res, 200, content, mimeTypes[path.extname(filePath)] || "application/octet-stream");
  });
}

function proxyApi(req, res) {
  const targetUrl = new URL(req.url.replace(/^\/api/, ""), API_TARGET);
  const proxyReq = http.request(
    targetUrl,
    {
      method: req.method,
      headers: req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", () => {
    send(res, 502, JSON.stringify({ detail: "Backend is not running on port 8000" }), "application/json");
  });

  req.pipe(proxyReq);
}

http.createServer((req, res) => {
  if (req.url.startsWith("/api")) return proxyApi(req, res);
  serveStatic(req, res);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`ClaimShield AI frontend running at http://localhost:${PORT}`);
});
