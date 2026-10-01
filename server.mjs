// 로컬 전용 서버: 정적 파일 + 오버뷰 폴더 읽기/쓰기 API. 의존성 없음.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const BACKUPS = path.join(ROOT, 'backups');
const CONFIG = path.join(ROOT, 'config.json');
const PORT = Number(process.env.PORT) || 5173;
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
};

function defaultDir() {
  const home = os.homedir();
  const cands = [
    path.join(home, 'Documents', 'EVE', 'Overview'),
    path.join(home, 'OneDrive', 'Documents', 'EVE', 'Overview'),
    path.join(home, 'OneDrive', '문서', 'EVE', 'Overview'),
    path.join(home, '문서', 'EVE', 'Overview'),
  ];
  return cands.find((c) => fs.existsSync(c)) || cands[0];
}
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch { return {}; }
}
let dir = loadConfig().dir || defaultDir();

const isYamlName = (n) => typeof n === 'string' && n === path.basename(n) && /\.ya?ml$/i.test(n) && !n.startsWith('.');
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function listFiles() {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(isYamlName)
    .map((name) => { const s = fs.statSync(path.join(dir, name)); return { name, size: s.size, mtime: s.mtimeMs }; })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

async function api(req, res, url) {
  const q = url.searchParams;
  // 변경 요청은 같은 출처의 우리 앱에서만 허용 (다른 웹페이지가 로컬 서버를 두드리는 것 방지)
  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'overview-editor') return json(res, 403, { error: 'forbidden' });

  if (url.pathname === '/api/state') return json(res, 200, { dir, exists: fs.existsSync(dir), files: listFiles() });

  if (url.pathname === '/api/dir' && req.method === 'POST') {
    const { dir: d } = JSON.parse(await readBody(req));
    if (!d || !path.isAbsolute(d) || !fs.existsSync(d) || !fs.statSync(d).isDirectory()) return json(res, 400, { error: '존재하지 않는 폴더입니다.' });
    dir = path.resolve(d);
    fs.writeFileSync(CONFIG, JSON.stringify({ dir }, null, 2));
    return json(res, 200, { dir, files: listFiles() });
  }

  if (url.pathname === '/api/file') {
    const name = q.get('name');
    if (!isYamlName(name)) return json(res, 400, { error: '잘못된 파일 이름입니다.' });
    const p = path.join(dir, name);
    if (req.method === 'GET') {
      if (!fs.existsSync(p)) return json(res, 404, { error: '파일이 없습니다.' });
      return json(res, 200, { name, text: fs.readFileSync(p, 'utf8'), mtime: fs.statSync(p).mtimeMs });
    }
    if (req.method === 'PUT') {
      let text = await readBody(req);
      // 기존 파일이 CRLF 면 CRLF 로 (새 파일은 윈도우 기본값인 CRLF)
      const prev = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
      const crlf = prev === null ? process.platform === 'win32' : prev.includes('\r\n');
      text = text.replace(/\r\n/g, '\n');
      if (crlf) text = text.replace(/\n/g, '\r\n');
      let backup = null;
      if (fs.existsSync(p)) {
        fs.mkdirSync(BACKUPS, { recursive: true });
        backup = `${name.replace(/\.ya?ml$/i, '')}_${stamp()}.yaml`;
        fs.copyFileSync(p, path.join(BACKUPS, backup));
      }
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, text, 'utf8');
      return json(res, 200, { ok: true, backup, mtime: fs.statSync(p).mtimeMs, files: listFiles() });
    }
  }

  if (url.pathname === '/api/backups') {
    if (!fs.existsSync(BACKUPS)) return json(res, 200, { backups: [] });
    const backups = fs.readdirSync(BACKUPS).filter(isYamlName)
      .map((name) => ({ name, mtime: fs.statSync(path.join(BACKUPS, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return json(res, 200, { backups });
  }
  if (url.pathname === '/api/backup') {
    const name = q.get('name');
    if (!isYamlName(name) || !fs.existsSync(path.join(BACKUPS, name))) return json(res, 404, { error: 'not found' });
    return json(res, 200, { name, text: fs.readFileSync(path.join(BACKUPS, name), 'utf8') });
  }
  return json(res, 404, { error: 'not found' });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const p = path.normalize(path.join(PUBLIC, rel));
  if (!p.startsWith(PUBLIC + path.sep) || !fs.existsSync(p) || !fs.statSync(p).isFile()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(p).pipe(res);
}

http.createServer(async (req, res) => {
  try {
    // DNS rebinding 방지: localhost 계열 Host 만 허용
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) { res.writeHead(403); return res.end(); }
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    serveStatic(req, res, url);
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
}).listen(PORT, HOST, () => {
  console.log(`EVE 오버뷰 편집기: http://localhost:${PORT}`);
  console.log(`오버뷰 폴더: ${dir}`);
});
