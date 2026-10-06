// 단일 실행 파일(exe) 만들기: Node.js SEA(Single Executable Application).
// node.exe 복사본에 앱(server.mjs + public/)을 심어서, exe 하나만 받으면 Node.js 없이 실행되게 한다.
// 사용: node tools/make-exe.mjs [--out dist] [--node <node.exe 경로>] [--no-test]
// 필요: Windows x64, Node.js 22 이상(SEA 의 assets 기능). 심는 도구는 npm 의 postject(Node 공식 프로젝트)를 npx 로 받아 쓴다.
// 결과: dist/EVE-Overview-Editor.exe  (만든 뒤 바로 실행해서 서버가 응답하는지 확인한다)
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn, spawnSync } from 'node:child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`--${name} needs a value`);
  return v;
};
const flag = (name) => process.argv.includes(`--${name}`);
const nodeExe = path.resolve(arg('node', process.execPath));
const outDir = path.resolve(arg('out', path.join(ROOT, 'dist')));
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';        // Node 문서에 정해진 값
const POSTJECT = 'postject@1.0.0-alpha.6';

if (!(process.platform === 'win32' && process.arch === 'x64')) throw new Error('The exe has to be built on Windows x64 (it runs node.exe to prepare the blob).');
const major = +execFileSync(nodeExe, ['-p', 'process.versions.node.split(".")[0]'], { encoding: 'utf8' }).trim();
if (major < 22) throw new Error(`Node.js 22 or newer is needed to build the exe (found ${major}).`);

// ---- 1) server.mjs 를 CommonJS 한 파일로 바꾼다 (SEA 의 main 은 CommonJS 만 된다) ----
function toCommonJs(src) {
  let s = src;
  s = s.replace(/^import \{ createRequire \} from 'node:module';\r?\n/m, '');
  s = s.replace(/^const require = createRequire\(import\.meta\.url\);\r?\n/m, '');
  s = s.replace(/^import (\w+) from '(node:[\w/]+)';/gm, "const $1 = require('$2');");
  s = s.replace(/^import \{([^}]+)\} from '(node:[\w/]+)';/gm, "const {$1} = require('$2');");
  s = s.replace('fileURLToPath(import.meta.url)', '__filename');
  if (/^\s*import[\s{]/m.test(s) || /import\.meta/.test(s)) throw new Error('server.mjs still has ESM syntax after conversion; update tools/make-exe.mjs');
  return s;
}
const work = path.join(outDir, 'exe-build');
await fs.promises.rm(work, { recursive: true, force: true });       // (fs.rmSync 는 한글 경로에서 문제가 되는 Node 버전이 있어 promises 판을 쓴다)
fs.mkdirSync(work, { recursive: true });
const mainFile = path.join(work, 'main.cjs');
fs.writeFileSync(mainFile, toCommonJs(fs.readFileSync(path.join(ROOT, 'server.mjs'), 'utf8')));

// ---- 2) public/ 의 모든 파일을 SEA 자산으로 ----
const assets = {};
(function walk(rel) {
  for (const ent of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
    if (/^(\.DS_Store|Thumbs\.db)$/i.test(ent.name)) continue;
    const r = `${rel}/${ent.name}`;
    ent.isDirectory() ? walk(r) : (assets[r] = path.join(ROOT, r));
  }
})('public');
const blob = path.join(work, 'app.blob');
const seaConfig = path.join(work, 'sea-config.json');
// main/output 은 상대 경로로 적는다 (절대 경로가 exe 안에 들어가 만든 사람의 폴더 이름이 새지 않게). 자산 경로는 만들 때만 쓰인다.
fs.writeFileSync(seaConfig, JSON.stringify({ main: 'main.cjs', output: 'app.blob', disableExperimentalSEAWarning: true, useCodeCache: false, assets }, null, 1));
execFileSync(nodeExe, ['--experimental-sea-config', 'sea-config.json'], { stdio: 'inherit', cwd: work });

// ---- 3) node.exe 복사 + 디지털 서명 제거 (심고 나면 서명이 맞지 않으므로 깨끗하게 서명 없는 파일로 만든다) ----
function stripSignature(buf) {
  if (buf.toString('latin1', 0, 2) !== 'MZ') throw new Error('not a PE file');
  const pe = buf.readUInt32LE(0x3c);
  if (buf.toString('latin1', pe, pe + 4) !== 'PE\0\0' || buf.readUInt16LE(pe + 24) !== 0x20b) throw new Error('not a PE32+ (x64) file');
  const dd = pe + 24 + 112 + 4 * 8;                       // 데이터 디렉터리 4번: 인증서 표(파일 오프셋)
  const off = buf.readUInt32LE(dd), size = buf.readUInt32LE(dd + 4);
  if (!off || !size) return buf;
  if (off + size < buf.length - 8) throw new Error('certificate table is not at the end of the file');
  buf.writeUInt32LE(0, dd); buf.writeUInt32LE(0, dd + 4);
  buf.writeUInt32LE(0, pe + 24 + 64);                     // 체크섬(검사하지 않는 값)
  return buf.subarray(0, off);
}
fs.mkdirSync(outDir, { recursive: true });
const exe = path.join(outDir, 'EVE-Overview-Editor.exe');
const tmpExe = exe + '.tmp';                               // 완성될 때까지는 임시 이름 (실패해도 반쪽짜리 exe 나 지워진 예전 exe 가 남지 않게)
try {
  fs.writeFileSync(tmpExe, stripSignature(fs.readFileSync(nodeExe)));
  // ---- 4) blob 심기 (postject) ----
  const npxCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
  const postjectArgs = ['--yes', POSTJECT, tmpExe, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', FUSE];
  const quote = (a) => (/[\s&()^]/.test(a) ? `"${a}"` : a);   // shell 을 거칠 때 공백이 든 경로가 쪼개지지 않게
  const r = fs.existsSync(npxCli) ? spawnSync(process.execPath, [npxCli, ...postjectArgs], { stdio: 'inherit' }) : spawnSync('npx', postjectArgs.map(quote), { stdio: 'inherit', shell: true });
  if (r.status !== 0) throw new Error('postject failed');
  fs.renameSync(tmpExe, exe);
} finally {
  await fs.promises.rm(work, { recursive: true, force: true });
  await fs.promises.rm(tmpExe, { force: true });
}
const size = fs.statSync(exe).size;
console.log(`${exe}: ${(size / 1e6).toFixed(1)} MB, ${Object.keys(assets).length} embedded files`);

// ---- 5) 바로 실행해서 확인 (브라우저는 열지 않는다) ----
async function smokeTest() {
  const dataDir = path.join(path.dirname(exe), 'EVE-Overview-Editor-data');   // 시험 실행이 exe 옆에 만드는 폴더는 배포물(dist/)에 남기지 않는다
  const dataDirExisted = fs.existsSync(dataDir);
  const port = await new Promise((res) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  const child = spawn(exe, [], { env: { ...process.env, PORT: String(port), EVE_NO_OPEN: '1' }, stdio: 'ignore', windowsHide: true });
  const get = (p) => new Promise((resolve, reject) => {
    const rq = http.get({ host: '127.0.0.1', port, path: p, timeout: 3000 }, (res) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => resolve({ code: res.statusCode, body: Buffer.concat(c) })); });
    rq.on('timeout', () => rq.destroy(new Error('timeout')));    // 응답이 없으면 포기한다 (끝없이 기다리지 않게)
    rq.on('error', reject);
  });
  try {
    let up = false;
    for (let i = 0; i < 40 && !up; i++) { try { up = (await get('/')).code === 200; } catch { await new Promise((x) => setTimeout(x, 300)); } }
    if (!up) throw new Error('the exe did not start serving');
    const checks = [['/', /<title>/], ['/js/app.js', /showPanel/], ['/vendor/js-yaml.mjs', /yaml/i], ['/img/regions/blue.webp', null], ['/api/state', /"files"/]];
    for (const [p, re] of checks) {
      const { code, body } = await get(p);
      if (code !== 200 || (re && !re.test(body.toString('utf8', 0, 200000)))) throw new Error(`smoke test failed for ${p} (${code})`);
    }
    if ((await get('/definitely-not-there.js')).code !== 404) throw new Error('smoke test: missing file should be 404');
    console.log('smoke test passed: the exe serves the editor on its own');
  } finally {
    child.kill();
    if (!dataDirExisted) { await new Promise((x) => setTimeout(x, 500)); await fs.promises.rm(dataDir, { recursive: true, force: true }).catch(() => {}); }
  }
}
if (!flag('no-test')) await smokeTest();
console.log(`sha256: ${crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex')}`);
