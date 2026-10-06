// 앱 셸: 상단 바(파일 열기/저장/되돌리기/언어), 좌측 내비게이션, 패널 로딩.
import { parseOverview, serializeOverview } from './model.js';
import { store } from './store.js';
import './locales/index.js';
import { t, tOrNull, LANGUAGES, getPref, setLang, onLangChange } from './i18n.js';
import { loadGroupData } from './data.js';
import { h, toast, confirmDialog, promptDialog } from './ui.js';

const PANELS = [
  { id: 'presets', count: () => store.model.presets.length },
  { id: 'tabs', count: () => store.model.tabs.length },
  { id: 'appearance' },
  { id: 'columns' },
  { id: 'labels' },
  { id: 'advanced' },
];

const api = async (path, opts = {}) => {
  const r = await fetch(path, { ...opts, headers: { 'X-Requested-With': 'overview-editor', ...(opts.headers || {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.error || `HTTP ${r.status}`), { code: body.code });
  return body;
};
export const serverApi = api;
/** 서버/모델 오류를 현재 언어 문구로 (코드가 있으면 번역, 없으면 원문) */
export const errMessage = (e) => (e?.code && tOrNull(`core.err.${e.code}`)) || e?.message || String(e);

let files = [], dir = '';
let activeId = (() => { try { return localStorage.getItem('panel') || 'presets'; } catch { return 'presets'; } })();
const els = {};

function buildShell() {
  const app = document.getElementById('app');
  app.replaceChildren();
  document.body.dataset.drop = t('core.dropHint');
  els.fileSelect = h('select', { class: 'input', title: t('core.fileSelectTitle'), 'aria-label': t('core.fileSelectTitle'), onchange: () => openFromServer(els.fileSelect.value) });
  els.dirty = h('span', { class: 'dirty-dot hidden', title: t('core.dirtyTitle') });
  els.undo = h('button', { class: 'btn', title: t('core.undo'), 'aria-label': t('core.undo'), onclick: () => store.undo() }, '↶');
  els.redo = h('button', { class: 'btn', title: t('core.redo'), 'aria-label': t('core.redo'), onclick: () => store.redo() }, '↷');
  els.save = h('button', { class: 'btn primary', title: t('core.saveTitle'), onclick: () => save() }, t('core.save'));
  els.lang = h('select', { class: 'input lang-select', title: t('core.language'), 'aria-label': t('core.language'), onchange: () => setLang(els.lang.value) },
    h('option', { value: 'auto', selected: getPref() === 'auto' }, `🌐 ${t('core.langAuto')}`),
    LANGUAGES.map((l) => h('option', { value: l.code, selected: getPref() === l.code }, l.label)));
  els.nav = h('nav', { class: 'nav' });
  els.main = h('main', { class: 'main' });
  app.append(
    h('header', { class: 'topbar' },
      h('span', { class: 'brand' }, t('core.appName')),
      h('div', { class: 'filebox' }, els.fileSelect, els.dirty),
      h('button', { class: 'btn ghost', title: t('core.refreshList'), 'aria-label': t('core.refreshList'), onclick: refreshFiles }, '⟳'),
      h('span', { class: 'spacer' }),
      els.undo, els.redo, els.save,
      h('button', { class: 'btn', onclick: saveAs }, t('core.saveAs')),
      h('button', { class: 'btn', onclick: download }, t('core.download')),
      h('label', { class: 'btn' }, t('core.openFile'),
        h('input', { type: 'file', accept: '.yaml,.yml', class: 'hidden', onchange: (e) => { openLocalFile(e.target.files[0]); e.target.value = ''; } })),
      els.lang,
    ),
    h('div', { class: 'shell' }, els.nav, els.main),
  );
}

function renderNav() {
  els.nav.replaceChildren(...PANELS.map((p) =>
    h('button', { class: p.id === activeId ? 'active' : '', onclick: () => showPanel(p.id) },
      h('span', {}, t(`core.nav.${p.id}`)), p.count && store.model ? h('span', { class: 'count' }, p.count()) : null)));
}

const loaded = {};
async function showPanel(id) {
  activeId = id;
  try { localStorage.setItem('panel', id); } catch {}
  renderNav();
  els.main.replaceChildren();
  if (!store.model) {
    els.main.append(h('p', { class: 'muted' }, t('core.noFile')));
    return;
  }
  try {
    loaded[id] ??= (await import(`./panels/${id}.js`)).default;
    await loaded[id](els.main);
  } catch (e) {
    console.error(e);
    els.main.replaceChildren(h('div', { class: 'card' },
      h('h3', {}, t('core.panelLoadFailed')), h('p', { class: 'muted mono small' }, String(e.message || e))));
  }
}

function updateChrome() {
  els.dirty.classList.toggle('hidden', !store.dirty);
  els.undo.disabled = !store.canUndo; els.redo.disabled = !store.canRedo;
  els.undo.classList.toggle('disabled', !store.canUndo);
  els.save.disabled = !store.model;
  document.title = `${store.dirty ? '● ' : ''}${store.fileName ?? t('core.untitled')} - ${t('core.appName')}`;
  if (store.model) renderNav();
}

function renderFileSelect() {
  const cur = store.fileName;
  const opts = files.map((f) => h('option', { value: f.name, selected: f.name === cur }, f.name));
  if (cur && !files.some((f) => f.name === cur)) opts.unshift(h('option', { value: cur, selected: true }, t('core.unsavedSuffix', { name: cur })));
  if (!opts.length) opts.push(h('option', { value: '' }, t('core.noYaml')));
  els.fileSelect.replaceChildren(...opts);
}

async function refreshFiles() {
  const s = await api('/api/state');
  files = s.files; dir = s.dir;
  renderFileSelect();
  return s;
}

async function confirmDiscard() {
  return !store.dirty || confirmDialog(t('core.discardConfirm'), { ok: t('core.discardOk'), danger: true });
}

async function openFromServer(name) {
  if (!name) return;
  if (!(await confirmDiscard())) { renderFileSelect(); return; }
  try {
    const f = await api(`/api/file?name=${encodeURIComponent(name)}`);
    store.load(parseOverview(f.text), name);
    toast(t('core.opened', { name }), 'ok', 1800);
  } catch (e) { toast(t('core.openFailed', { msg: errMessage(e) }), 'error', 6000); renderFileSelect(); }
}

async function openLocalFile(file) {
  if (!file || !(await confirmDiscard())) return;
  try { store.load(parseOverview(await file.text()), file.name); toast(t('core.openedLocal', { name: file.name }), 'info', 4500); renderFileSelect(); }
  catch (e) { toast(t('core.openFailed', { msg: errMessage(e) }), 'error', 6000); }
}

async function writeFile(name) {
  const res = await api(`/api/file?name=${encodeURIComponent(name)}`, { method: 'PUT', body: serializeOverview(store.model) });
  files = res.files;
  store.markSaved(name);
  renderFileSelect();
  toast(res.backup ? t('core.savedBackup', { name, backup: res.backup }) : t('core.saved', { name }), 'ok', 3500);
}

async function save() {
  if (!store.model) return;
  if (!store.fileName) return saveAs();
  try { await writeFile(store.fileName); } catch (e) { toast(t('core.saveFailed', { msg: errMessage(e) }), 'error', 6000); }
}
async function saveAs() {
  if (!store.model) return;
  let name = await promptDialog(t('core.saveAsPrompt'), store.fileName || 'overview.yaml');
  if (!name) return;
  name = name.trim();
  if (!/\.ya?ml$/i.test(name)) name += '.yaml';
  if (files.some((f) => f.name === name) && name !== store.fileName &&
    !(await confirmDialog(t('core.overwriteConfirm', { name }), { ok: t('core.overwrite'), danger: true }))) return;
  try { await writeFile(name); } catch (e) { toast(t('core.saveFailed', { msg: errMessage(e) }), 'error', 6000); }
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
  // 언어가 바뀌면 상단 바/내비게이션/활성 패널을 새 언어로 다시 그린다 (편집 중인 내용은 그대로 유지)
  onLangChange(() => { buildShell(); renderFileSelect(); updateChrome(); showPanel(activeId); });
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
    if (!s.exists) toast(t('core.folderMissing', { dir: s.dir }), 'warn', 8000);
    const first = files.find((f) => f.name === '1.yaml') || files[0];
    if (first) { await openFromServer(first.name); return; }
  } catch (e) { toast(t('core.serverFailed', { msg: errMessage(e) }), 'error', 6000); }
  showPanel(activeId);
}
init();
