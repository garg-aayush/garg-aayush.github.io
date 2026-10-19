import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)), process.env.SITE_OUTPUT_DIR ?? '_site');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.xml': 'application/xml', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
await stat(join(root, 'index.html'));

createServer(async (request, response) => {
  try {
    let path = resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (relative(root, path).startsWith('..')) { response.writeHead(403).end(); return; }
    if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
    await stat(path);
    response.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    createReadStream(path).pipe(response);
  } catch { response.writeHead(404).end('Not found'); }
}).listen(Number(process.env.SITE_TEST_PORT ?? 4173), '127.0.0.1');
