import { exec } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host ?? '127.0.0.1'}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    const filePath = path.join(root, pathname);
    if (!filePath.startsWith(root + path.sep)) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('403');
      return;
    }

    const data = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const noCache = extension === '.html'
      || extension === '.js'
      || extension === '.css'
      || extension === '.webmanifest';

    response.writeHead(200, {
      'Content-Type': MIME[extension] ?? 'application/octet-stream',
      'Cache-Control': noCache ? 'no-cache' : 'public, max-age=300',
    });
    response.end(data);
  } catch (error) {
    const status = error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 500;
    response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(String(status));
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Порт ${port} уже занят. Запустите с другим портом, например: set PORT=8081 && node serve.mjs`);
    process.exitCode = 1;
    return;
  }
  throw error;
});

server.listen(port, '127.0.0.1', () => {
  const address = `http://127.0.0.1:${port}/`;
  console.log(`Buckshot запущен: ${address}`);
  console.log('Остановить сервер: Ctrl+C');

  if (process.platform === 'win32' && !process.env.NO_OPEN) {
    exec(`start "" "${address}"`, () => {});
  }
});
