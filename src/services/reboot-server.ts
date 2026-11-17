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
    resourcesPath ? path.join(resourcesPath, 'start') : '',
    path.join(baseDir, '../public/start'),
    path.join(baseDir, '../dist/start'),
    path.join(process.cwd(), 'public/start')
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }
  return candidates[0] ?? path.join(baseDir, '../public/start');
}

const ALLOWED_HOSTNAMES = new Set(['127.0.0.1', 'localhost']);

function sendPlain(res: http.ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

/**
 * Resolves a request path inside rootDir. Returns null for traversal attempts,
 * malformed percent-encoding, NUL bytes or anything outside the root.
 */
export function resolveSafeStaticPath(rootDir: string, rawUrl: string): string | null {
  let pathname: string;
  try {
    pathname = decodeURIComponent((rawUrl.split('?')[0] ?? '/').split('#')[0] ?? '/');
  } catch {
    return null;
  }
  if (pathname.includes('\0')) {
    return null;
  }
  const relativePath =
    pathname === '/' || pathname === '/reference.html' || pathname === '/start' || pathname === '/start/'
      ? 'index.html'
      : pathname.replace(/^\/start\//, '').replace(/^\/+/, '');
  const normalizedRoot = path.resolve(rootDir);
  const resolvedFile = path.resolve(normalizedRoot, relativePath);
  if (resolvedFile !== normalizedRoot && !resolvedFile.startsWith(normalizedRoot + path.sep)) {
    return null;
  }
  return resolvedFile;
}

/** Rejects DNS-rebinding style requests whose Host header is not loopback. */
export function isLoopbackHostHeader(hostHeader: string | undefined): boolean {
  if (!hostHeader) {
    return false;
  }
  const hostname = hostHeader.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  return ALLOWED_HOSTNAMES.has(hostname);
}

function handleStaticRequest(
  rootDir: string,
  req: http.IncomingMessage,
  res: http.ServerResponse
): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendPlain(res, 405, 'Method Not Allowed');
    return;
  }
  if (!isLoopbackHostHeader(req.headers.host)) {
    sendPlain(res, 403, 'Forbidden');
    return;
  }
  const resolvedFile = resolveSafeStaticPath(rootDir, req.url ?? '/');
  if (!resolvedFile || !fs.existsSync(resolvedFile)) {
    sendPlain(res, 404, 'Not Found');
    return;
  }

  try {
    const stat = fs.statSync(resolvedFile);
    const targetFile = stat.isDirectory() ? path.join(resolvedFile, 'index.html') : resolvedFile;
    const ext = path.extname(targetFile).toLowerCase();
    const contentType = MIME_BY_EXT[ext] ?? 'application/octet-stream';
    const content = fs.readFileSync(targetFile);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch {
    sendPlain(res, 500, 'Internal Server Error');
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
      const url = `http://127.0.0.1:${port}/index.html`;
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
        resolve(`http://127.0.0.1:${port}/index.html`);
      });
    });

    server.listen(preferredPort, '127.0.0.1', onListening);
  });
}
