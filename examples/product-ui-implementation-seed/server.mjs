import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const mimeTypes = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(rootDir, relativePath);
  if (filePath !== rootDir && !filePath.startsWith(`${rootDir}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    if (!(await stat(filePath)).isFile()) throw new Error("NOT_A_FILE");
    response.writeHead(200, { "content-type": mimeTypes[path.extname(filePath)] ?? "application/octet-stream" });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`Seed preview listening on http://127.0.0.1:${port}`));