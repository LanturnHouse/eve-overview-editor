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

function json(res, code, obj) {  // 오류 응답은 { error: 영어 메시지, code: 기계용 코드 } — UI 가 code 로 번역한다
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
  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'overview-editor') return json(res, 403, { error: 'forbidden', code: 'forbidden' });

  if (url.pathname === '/api/state') return json(res, 200, { dir, exists: fs.existsSync(dir), files: listFiles() });

  if (url.pathname === '/api/dir' && req.method === 'POST') {
    const { dir: d } = JSON.parse(await readBody(req));
    if (!d || !path.isAbsolute(d) || !fs.existsSync(d) || !fs.statSync(d).isDirectory()) return json(res, 400, { error: 'Directory does not exist', code: 'dir_not_found' });
    dir = path.resolve(d);
    fs.writeFileSync(CONFIG, JSON.stringify({ dir }, null, 2));
    return json(res, 200, { dir, files: listFiles() });
  }

  if (url.pathname === '/api/file') {
    const name = q.get('name');
    if (!isYamlName(name)) return json(res, 400, { error: 'Invalid file name', code: 'bad_filename' });
    const p = path.join(dir, name);
    if (req.method === 'GET') {
      if (!fs.existsSync(p)) return json(res, 404, { error: 'File not found', code: 'not_found' });
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

  // 자동 백업: 목록(GET) / 전체 삭제(DELETE). backups/ 폴더 안의 .yaml 파일만 다룬다.
  if (url.pathname === '/api/backups') {
    const names = fs.existsSync(BACKUPS) ? fs.readdirSync(BACKUPS).filter(isYamlName) : [];
    if (req.method === 'DELETE') {
      let deleted = 0;
      for (const name of names) { try { fs.unlinkSync(path.join(BACKUPS, name)); deleted++; } catch { /* 사용 중이면 건너뜀 */ } }
      return json(res, 200, { deleted });
    }
    const backups = names
      .map((name) => { const st = fs.statSync(path.join(BACKUPS, name)); return { name, mtime: st.mtimeMs, size: st.size }; })
      .sort((a, b) => b.mtime - a.mtime);
    return json(res, 200, { backups });
  }
  // 백업 한 개: 내용 읽기(GET) / 삭제(DELETE)
  if (url.pathname === '/api/backup') {
    const name = q.get('name');
    if (!isYamlName(name)) return json(res, 400, { error: 'Invalid file name', code: 'bad_filename' });
    const bp = path.join(BACKUPS, name);
    if (!fs.existsSync(bp)) return json(res, 404, { error: 'File not found', code: 'not_found' });
    if (req.method === 'DELETE') { fs.unlinkSync(bp); return json(res, 200, { deleted: 1 }); }
    return json(res, 200, { name, text: fs.readFileSync(bp, 'utf8') });
  }
  return json(res, 404, { error: 'Not found', code: 'not_found' });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const p = path.normalize(path.join(PUBLIC, rel));
  if (!p.startsWith(PUBLIC + path.sep) || !fs.existsSync(p) || !fs.statSync(p).isFile()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(p).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    // DNS rebinding 방지: localhost 계열 Host 만 허용
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) { res.writeHead(403); return res.end(); }
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    serveStatic(req, res, url);
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is already in use - the editor is probably already running.`);
    console.log(`Open http://localhost:${PORT} in your browser (or set PORT=xxxx to use another port).`);
    process.exit(0);
  }
  throw e;
});
server.listen(PORT, HOST, () => {
  console.log(`EVE overview editor: http://localhost:${PORT}`);
  console.log(`Overview folder: ${dir}`);
});
