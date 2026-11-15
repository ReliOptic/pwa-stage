import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { logStructured } from '../utils/logger.util';

const MIME_BY_EXT: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
};

export function resolveRebootStaticRoot(baseDir: string, resourcesPath?: string): string {
  const candidates = [
    resourcesPath ? path.join(resourcesPath, 'reboot') : '',
    path.join(baseDir, '../public/reboot'),
    path.join(baseDir, '../dist/reboot'),
    path.join(process.cwd(), 'public/reboot')
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'reference.html'))) {
      return candidate;
    }
  }
  return candidates[0] ?? path.join(baseDir, '../public/reboot');
}

function handleStaticRequest(
  rootDir: string,
  req: http.IncomingMessage,
  res: http.ServerResponse
): void {
  const rawUrl = req.url ?? '/';
  const pathname = decodeURIComponent(rawUrl.split('?')[0] ?? '/');
  const relativePath =
    pathname === '/' || pathname === '/reboot' || pathname === '/reboot/'
      ? 'reference.html'
      : pathname.replace(/^\/reboot\//, '').replace(/^\/+/, '');

  const normalizedRoot = path.resolve(rootDir);
  const resolvedFile = path.resolve(normalizedRoot, relativePath);

  if (!resolvedFile.startsWith(normalizedRoot) || !fs.existsSync(resolvedFile)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  try {
    const stat = fs.statSync(resolvedFile);
    const targetFile = stat.isDirectory() ? path.join(resolvedFile, 'reference.html') : resolvedFile;
    const ext = path.extname(targetFile).toLowerCase();
    const contentType = MIME_BY_EXT[ext] ?? 'application/octet-stream';
    const content = fs.readFileSync(targetFile);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store'
    });
    res.end(content);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
}

export function startEmbeddedRebootServer(
  rootDir: string,
  preferredPort: number = 18765
): Promise<string> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => handleStaticRequest(rootDir, req, res));

    const onListening = (): void => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : preferredPort;
      const url = `http://127.0.0.1:${port}/reference.html`;
      logStructured('info', 'reboot.server', 'embedded_reboot_server_started', {
        rootDir,
        url
      });
      resolve(url);
    };

    server.once('error', () => {
      const fallbackServer = http.createServer((req, res) => handleStaticRequest(rootDir, req, res));
      fallbackServer.listen(0, '127.0.0.1', () => {
        const addr = fallbackServer.address();
        const port = typeof addr === 'object' && addr ? addr.port : preferredPort;
        resolve(`http://127.0.0.1:${port}/reference.html`);
      });
    });

    server.listen(preferredPort, '127.0.0.1', onListening);
  });
}
