// 앱 셸: 상단 바(파일 열기/저장/되돌리기), 좌측 내비게이션, 패널 로딩.
import { parseOverview, serializeOverview } from './model.js';
import { store } from './store.js';
import { loadGroupData } from './data.js';
import { h, toast, confirmDialog, promptDialog } from './ui.js';

const PANELS = [
  { id: 'presets', title: '프리셋 (표시 대상)', count: () => store.model.presets.length },
  { id: 'tabs', title: '오버뷰 탭', count: () => store.model.tabs.length },
  { id: 'appearance', title: '깃발 · 배경 색상' },
  { id: 'columns', title: '컬럼' },
  { id: 'labels', title: '선박 라벨' },
  { id: 'advanced', title: '파일 · 고급' },
];

const api = async (path, opts = {}) => {
  const r = await fetch(path, { ...opts, headers: { 'X-Requested-With': 'overview-editor', ...(opts.headers || {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
  return body;
};
export const serverApi = api;

let files = [], dir = '';
let activeId = localStorage.getItem('panel') || 'presets';
const els = {};

function buildShell() {
  const app = document.getElementById('app');
  els.fileSelect = h('select', { class: 'input', title: '오버뷰 폴더의 YAML 파일', onchange: () => openFromServer(els.fileSelect.value) });
  els.dirty = h('span', { class: 'dirty-dot hidden', title: '저장되지 않은 변경 사항' });
  els.undo = h('button', { class: 'btn', title: '되돌리기 (Ctrl+Z)', onclick: () => store.undo() }, '↶');
  els.redo = h('button', { class: 'btn', title: '다시 실행 (Ctrl+Y)', onclick: () => store.redo() }, '↷');
  els.save = h('button', { class: 'btn primary', title: '저장 (Ctrl+S)', onclick: () => save() }, '저장');
  els.nav = h('nav', { class: 'nav' });
  els.main = h('main', { class: 'main' });
  app.append(
    h('header', { class: 'topbar' },
      h('span', { class: 'brand' }, 'EVE 오버뷰 편집기'),
      h('div', { class: 'filebox' }, els.fileSelect, els.dirty),
      h('button', { class: 'btn ghost', title: '폴더 목록 새로고침', onclick: refreshFiles }, '⟳'),
      h('span', { class: 'spacer' }),
      els.undo, els.redo, els.save,
      h('button', { class: 'btn', onclick: saveAs }, '다른 이름으로…'),
      h('button', { class: 'btn', onclick: download }, '다운로드'),
      h('label', { class: 'btn' }, '파일 열기…',
        h('input', { type: 'file', accept: '.yaml,.yml', class: 'hidden', onchange: (e) => { openLocalFile(e.target.files[0]); e.target.value = ''; } })),
    ),
    h('div', { class: 'shell' }, els.nav, els.main),
  );
}

function renderNav() {
  els.nav.replaceChildren(...PANELS.map((p) =>
    h('button', { class: p.id === activeId ? 'active' : '', onclick: () => showPanel(p.id) },
      h('span', {}, p.title), p.count && store.model ? h('span', { class: 'count' }, p.count()) : null)));
}

const loaded = {};
async function showPanel(id) {
  activeId = id;
  try { localStorage.setItem('panel', id); } catch {}
  renderNav();
  els.main.replaceChildren();
  if (!store.model) {
    els.main.append(h('p', { class: 'muted' }, '열린 파일이 없습니다. 위에서 파일을 선택하거나, YAML 파일을 이 창에 끌어다 놓으세요.'));
    return;
  }
  try {
    loaded[id] ??= (await import(`./panels/${id}.js`)).default;
    await loaded[id](els.main);
  } catch (e) {
    console.error(e);
    els.main.replaceChildren(h('div', { class: 'card' },
      h('h3', {}, '이 패널을 불러오지 못했습니다'), h('p', { class: 'muted mono small' }, String(e.message || e))));
  }
}

function updateChrome() {
  els.dirty.classList.toggle('hidden', !store.dirty);
  els.undo.disabled = !store.canUndo; els.redo.disabled = !store.canRedo;
  els.undo.classList.toggle('disabled', !store.canUndo);
  els.save.disabled = !store.model;
  document.title = `${store.dirty ? '● ' : ''}${store.fileName ?? '새 파일'} - EVE 오버뷰 편집기`;
  if (store.model) renderNav();
}

function renderFileSelect() {
  const cur = store.fileName;
  const opts = files.map((f) => h('option', { value: f.name, selected: f.name === cur }, f.name));
  if (cur && !files.some((f) => f.name === cur)) opts.unshift(h('option', { value: cur, selected: true }, `${cur} (저장 안 됨)`));
  if (!opts.length) opts.push(h('option', { value: '' }, '(YAML 파일 없음)'));
  els.fileSelect.replaceChildren(...opts);
}

async function refreshFiles() {
  const s = await api('/api/state');
  files = s.files; dir = s.dir;
  renderFileSelect();
  return s;
}

async function confirmDiscard() {
  return !store.dirty || confirmDialog('저장하지 않은 변경 사항이 있습니다. 버리고 계속할까요?', { ok: '버리고 계속', danger: true });
}

async function openFromServer(name) {
  if (!name) return;
  if (!(await confirmDiscard())) { renderFileSelect(); return; }
  try {
    const f = await api(`/api/file?name=${encodeURIComponent(name)}`);
    store.load(parseOverview(f.text), name);
    toast(`${name} 을(를) 열었습니다.`, 'ok', 1800);
  } catch (e) { toast(`열기 실패: ${e.message}`, 'error', 6000); renderFileSelect(); }
}

async function openLocalFile(file) {
  if (!file || !(await confirmDiscard())) return;
  try { store.load(parseOverview(await file.text()), file.name); toast(`${file.name} 을(를) 열었습니다. (저장하면 오버뷰 폴더에 같은 이름으로 기록됩니다)`, 'info', 4500); renderFileSelect(); }
  catch (e) { toast(`열기 실패: ${e.message}`, 'error', 6000); }
}

async function writeFile(name) {
  const res = await api(`/api/file?name=${encodeURIComponent(name)}`, { method: 'PUT', body: serializeOverview(store.model) });
  files = res.files;
  store.markSaved(name);
  renderFileSelect();
  toast(res.backup ? `${name} 저장 완료 (이전 버전 백업: ${res.backup})` : `${name} 저장 완료`, 'ok', 3500);
}

async function save() {
  if (!store.model) return;
  if (!store.fileName) return saveAs();
  try { await writeFile(store.fileName); } catch (e) { toast(`저장 실패: ${e.message}`, 'error', 6000); }
}
async function saveAs() {
  if (!store.model) return;
  let name = await promptDialog('저장할 파일 이름 (오버뷰 폴더 안)', store.fileName || 'overview.yaml');
  if (!name) return;
  name = name.trim();
  if (!/\.ya?ml$/i.test(name)) name += '.yaml';
  if (files.some((f) => f.name === name) && name !== store.fileName &&
    !(await confirmDialog(`${name} 이(가) 이미 있습니다. 덮어쓸까요? (이전 버전은 백업됩니다)`, { ok: '덮어쓰기', danger: true }))) return;
  try { await writeFile(name); } catch (e) { toast(`저장 실패: ${e.message}`, 'error', 6000); }
}
function download() {
  if (!store.model) return;
  const url = URL.createObjectURL(new Blob([serializeOverview(store.model)], { type: 'text/yaml' }));
  const a = h('a', { href: url, download: store.fileName || 'overview.yaml' });
  document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function wireGlobal() {
  store.on('change', updateChrome);
  store.on('reload', () => showPanel(activeId));
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
    const inText = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName) && document.activeElement.type !== 'checkbox';
    if (mod && !inText && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? store.redo() : store.undo(); }
    if (mod && !inText && e.key.toLowerCase() === 'y') { e.preventDefault(); store.redo(); }
  });
  window.addEventListener('beforeunload', (e) => { if (store.dirty) { e.preventDefault(); e.returnValue = ''; } });
  let depth = 0;
  window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types?.includes('Files')) { depth++; document.body.classList.add('dropzone-active'); } });
  window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; document.body.classList.remove('dropzone-active'); } });
  window.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    depth = 0; document.body.classList.remove('dropzone-active');
    const f = e.dataTransfer?.files?.[0];
    if (f) { e.preventDefault(); openLocalFile(f); }
  });
}

/** 다른 패널(고급)이 쓰는 진입점 */
export const shell = { refreshFiles, openFromServer, getDir: () => dir, getFiles: () => files, save, saveAs };

async function init() {
  buildShell();
  wireGlobal();
  await loadGroupData();
  updateChrome();
  try {
    const s = await refreshFiles();
    if (!s.exists) toast(`오버뷰 폴더를 찾지 못했습니다: ${s.dir}\n'파일 · 고급' 탭에서 폴더를 지정하세요.`, 'warn', 8000);
    const first = files.find((f) => f.name === '1.yaml') || files[0];
    if (first) { await openFromServer(first.name); return; }
  } catch (e) { toast(`서버 연결 실패: ${e.message}`, 'error', 6000); }
  showPanel(activeId);
}
init();
