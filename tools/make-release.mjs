// Windows 휴대용 배포본(zip) 만들기: 앱 파일 + 공식 Node.js 런타임(node.exe) + 안내문.
// 받는 사람은 Node.js 를 설치하지 않고, 압축을 풀어 start.bat 만 실행하면 된다.
// 사용: node tools/make-release.mjs [--version v1.0.0] [--node <node.exe 경로>] [--out dist]
// 런타임은 이 스크립트를 실행한 node.exe 를 그대로 복사한다(Windows x64 에서 실행). GitHub Actions 에서는
// actions/setup-node 가 설치한 공식 빌드가 쓰이므로 서명된 원본이 들어간다. 의존성 없이 zip 도 직접 만든다.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`--${name} needs a value`);
  return v;
};
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = arg('version', process.env.GITHUB_REF_NAME || `v${pkg.version}`);
const nodeExe = path.resolve(arg('node', process.execPath));
const outDir = path.resolve(arg('out', path.join(ROOT, 'dist')));   // 상대 경로는 --node 와 마찬가지로 현재 작업 폴더 기준
const TOP = 'EVE-Overview-Editor';                       // 압축을 풀면 이 이름의 폴더가 생긴다
const zipName = `${TOP}-${version.replace(/[^\w.+-]+/g, '-')}-windows-x64.zip`;   // 파일 이름에 쓸 수 없는 글자는 '-' 로

// ---- 런타임 확인 (Windows 용 node.exe 여야 한다) ----
if (!arg('node') && !(process.platform === 'win32' && process.arch === 'x64')) throw new Error('Run this on Windows x64, or pass --node <path to a Windows x64 node.exe>.');
const nodeBuf = fs.readFileSync(nodeExe);
const peAt = nodeBuf.length > 0x40 && nodeBuf.toString('latin1', 0, 2) === 'MZ' ? nodeBuf.readUInt32LE(0x3c) : -1;   // PE 헤더 위치
if (nodeBuf.length < 20e6 || peAt < 0 || peAt + 6 > nodeBuf.length || nodeBuf.toString('latin1', peAt, peAt + 4) !== 'PE\0\0' || nodeBuf.readUInt16LE(peAt + 4) !== 0x8664)
  throw new Error(`Not a Windows x64 node.exe: ${nodeExe}`);

// ---- 넣을 파일 모으기 ----
const entries = [];                                       // { name, data, mtime }
const add = (name, data, mtime = new Date()) => entries.push({ name: `${TOP}/${name}`, data: Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'), mtime });
const addFile = (rel, as = rel) => {
  const p = path.join(ROOT, rel); let data = fs.readFileSync(p);
  if (/\.bat$/i.test(rel)) data = Buffer.from(data.toString('utf8').replace(/\r?\n/g, '\r\n'), 'utf8');   // 배치 파일은 항상 CRLF
  add(as, data, fs.statSync(p).mtime);
};
const addDir = (rel) => {
  for (const ent of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
    if (/^(\.DS_Store|Thumbs\.db)$/i.test(ent.name)) continue;
    const r = `${rel}/${ent.name}`;
    ent.isDirectory() ? addDir(r) : addFile(r);
  }
};
for (const f of ['start.bat', 'server.mjs', 'LICENSE', 'README.md', 'README.ko.md']) addFile(f);
addDir('public');
addDir('docs');                                            // README 의 스크린샷
add('runtime/node.exe', nodeBuf);
const nodeLicense = path.join(path.dirname(nodeExe), 'LICENSE');
add('runtime/NODE-LICENSE.txt', fs.existsSync(nodeLicense) ? fs.readFileSync(nodeLicense) :
  'This folder contains the unmodified, official Node.js runtime (node.exe), copied from the Node.js distribution (https://nodejs.org).\r\nNode.js is MIT licensed, with third-party components. The full license text: https://github.com/nodejs/node/blob/main/LICENSE\r\n');

const crlf = (s) => s.replace(/\r?\n/g, '\r\n');
add('README-FIRST.txt', '﻿' + crlf(`EVE Overview Editor ${version}  (Windows portable edition)
=====================================================================

HOW TO START
  1. Double-click  start.bat
     (Node.js is already included in the "runtime" folder - there is nothing to install.)
  2. Your browser opens http://localhost:5173 . If it does not, open that address yourself.
  3. Keep the black console window open while you edit. Close it to stop the editor.

  * If Windows shows a security warning for start.bat, choose "More info" -> "Run anyway".
    (The files are not code-signed. To verify your download, compare it with SHA256SUMS.txt on the release page.)
  * Extract the zip to a normal folder (for example your Desktop or Documents), not into "Program Files".
  * To update: extract the new version to a new folder. To keep your backups and the folder setting,
    copy the "backups" folder and "config.json" from the old folder into the new one.

Full guide: README.md (English) / README.ko.md (Korean) in this folder, or
https://github.com/LanturnHouse/eve-overview-editor

---------------------------------------------------------------------

사용 방법 (한국어)
  1. start.bat 을 더블클릭하세요.
     (Node.js 가 "runtime" 폴더에 들어 있어 따로 설치할 것이 없습니다.)
  2. 브라우저에서 http://localhost:5173 이 열립니다. 열리지 않으면 이 주소를 직접 여세요.
  3. 편집하는 동안 검은 콘솔 창은 닫지 마세요. 끝내려면 그 창을 닫으면 됩니다.

  * start.bat 실행 시 Windows 보안 경고가 뜨면 "추가 정보" -> "실행" 을 누르세요.
    (파일에 코드 서명이 없어서 나오는 경고입니다. 받은 파일은 릴리스 페이지의 SHA256SUMS.txt 와 비교해 확인할 수 있습니다.)
  * 압축은 바탕화면이나 문서 같은 일반 폴더에 푸세요. "Program Files" 안에는 풀지 마세요.
  * 업데이트: 새 버전을 새 폴더에 푸세요. 백업과 폴더 설정을 이어 쓰려면
    예전 폴더의 "backups" 폴더와 "config.json" 을 새 폴더로 복사하세요.

자세한 안내: 이 폴더의 README.ko.md (한국어) / README.md (영어), 또는
https://github.com/LanturnHouse/eve-overview-editor
`));
add('VERSION.txt', `${version}\r\n`);

// ---- zip 쓰기 (store/deflate, UTF-8 이름, 의존성 없음) ----
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const dos = (d) => ({ time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() });

function writeZip(file, list) {
  const fd = fs.openSync(file, 'w');
  let offset = 0;
  const write = (buf) => { fs.writeSync(fd, buf); offset += buf.length; };
  const central = [];
  for (const e of list) {
    const name = Buffer.from(e.name, 'utf8'), crc = crc32(e.data), packed = zlib.deflateRawSync(e.data, { level: 6 });
    const deflated = packed.length < e.data.length, body = deflated ? packed : e.data, { time, date } = dos(e.mtime);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(deflated ? 8 : 0, 8);
    h.writeUInt16LE(time, 10); h.writeUInt16LE(date, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(e.data.length, 22);
    h.writeUInt16LE(name.length, 26);
    central.push({ name, crc, method: deflated ? 8 : 0, time, date, csize: body.length, usize: e.data.length, offset });
    write(h); write(name); write(body);
  }
  const cdStart = offset;
  for (const c of central) {
    const h = Buffer.alloc(46);
    h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(20, 6); h.writeUInt16LE(0x0800, 8); h.writeUInt16LE(c.method, 10);
    h.writeUInt16LE(c.time, 12); h.writeUInt16LE(c.date, 14); h.writeUInt32LE(c.crc, 16); h.writeUInt32LE(c.csize, 20); h.writeUInt32LE(c.usize, 24);
    h.writeUInt16LE(c.name.length, 28); h.writeUInt32LE(c.offset, 42);
    write(h); write(c.name);
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(offset - cdStart, 12); end.writeUInt32LE(cdStart, 16);
  write(end);
  fs.closeSync(fd);
}

fs.mkdirSync(outDir, { recursive: true });
const zipPath = path.join(outDir, zipName);
writeZip(zipPath, entries);
const sha = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
fs.writeFileSync(path.join(outDir, 'SHA256SUMS.txt'), `${sha}  ${zipName}\n`);
console.log(`${zipName}: ${entries.length} files, ${(fs.statSync(zipPath).size / 1e6).toFixed(1)} MB`);
console.log(`runtime: ${nodeExe}${arg('node', null) ? '' : ` (${process.version})`}, sha256 ${crypto.createHash('sha256').update(nodeBuf).digest('hex').slice(0, 16)}…`);
console.log(`sha256: ${sha}`);
