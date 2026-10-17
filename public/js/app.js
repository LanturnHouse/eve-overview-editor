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
// 열린 파일이 폴더 밖에서 바뀌었는지 알아내기 위한 상태. 게임에서 같은 이름으로 다시 내보낸 파일을 편집기의 오래된 내용이 덮어쓰면 안 된다.
let diskMtime = null;      // 편집기가 이 파일을 마지막으로 읽거나 쓴 때의 수정 시각 (폴더 밖에서 연 파일이면 null)
let latestMtime = null;    // 가장 최근에 확인한 디스크의 수정 시각
let diskChanged = false;   // 저장하지 않은 변경이 있는데 파일이 밖에서 바뀌었다 (알림 줄을 보인다)
let checkingDisk = false;
let saving = false;          // 저장하는 중에 또 저장이 시작되지 않게 한다 (연타, 대화상자가 떠 있는 동안의 Ctrl+S)
let noticeKey = '';        // 알림 줄을 마지막으로 그린 상태 (같으면 다시 그리지 않는다)
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
  els.notice = h('div', { class: 'notice hidden', role: 'alert' });
  app.append(
    h('header', { class: 'topbar' },
      h('span', { class: 'brand' }, t('core.appName')),
      h('div', { class: 'filebox' }, els.fileSelect, els.dirty),
      h('button', { class: 'btn ghost', title: t('core.refreshList'), 'aria-label': t('core.refreshList'), onclick: () => refreshAndOpen() }, '⟳'),
      h('span', { class: 'spacer' }),
      els.undo, els.redo, els.save,
      h('button', { class: 'btn', onclick: saveAs }, t('core.saveAs')),
      h('button', { class: 'btn', onclick: download }, t('core.download')),
      h('label', { class: 'btn' }, t('core.openFile'),
        h('input', { type: 'file', accept: '.yaml,.yml', class: 'hidden', onchange: (e) => { openLocalFile(e.target.files[0]); e.target.value = ''; } })),
      els.lang,
      els.notice,
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
  if (!store.model && id !== 'advanced') {   // 파일 · 고급은 파일이 없어도 열려야 한다 (오버뷰 폴더를 못 찾았을 때 폴더를 바꿀 수 있도록)
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
  renderNotice();
  if (diskChanged && !store.dirty) checkDiskChange();   // 되돌리기 등으로 변경이 없어졌으면 알림 대신 조용히 다시 불러온다
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

/** 열린 파일이 없을 때(첫 실행, 폴더를 바꾼 직후, 새로 내보낸 뒤 새로고침)만 목록의 첫 파일을 연다. 1.yaml 이 있으면 그것을 우선한다 */
async function openFirstIfNone() {
  if (store.model) return;
  const first = files.find((f) => f.name === '1.yaml') || files[0];
  if (first) await openFromServer(first.name);
}
async function refreshAndOpen() {
  try { await refreshFiles(); await openFirstIfNone(); }
  catch (e) { toast(t('core.serverFailed', { msg: errMessage(e) }), 'error', 6000); }
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
    diskMtime = latestMtime = f.mtime; diskChanged = false; renderNotice(); renderFileSelect();
    toast(t('core.opened', { name }), 'ok', 1800);
  } catch (e) { toast(t('core.openFailed', { msg: errMessage(e) }), 'error', 6000); renderFileSelect(); }
}

/** 디스크의 파일을 다시 읽어 편집기 내용을 바꾼다 (저장하지 않은 변경은 사라진다) */
async function reloadFromDisk(name, { ifClean = false } = {}) {
  const f = await api(`/api/file?name=${encodeURIComponent(name)}`);
  // 조용한 재로드는, 읽어 오는 사이에 사용자가 편집했거나 다른 파일을 열었다면 하지 않는다 (편집 내용을 잃지 않도록)
  if (ifClean && (store.dirty || store.fileName !== name)) return { loaded: false, mtime: f.mtime };
  store.load(parseOverview(f.text), name);
  diskMtime = latestMtime = f.mtime; diskChanged = false; renderNotice();
  return { loaded: true, mtime: f.mtime };
}

/**
 * 창으로 돌아왔을 때(게임에서 다시 내보내고 오는 경우) 열린 파일이 디스크에서 바뀌었는지 본다.
 * 저장하지 않은 변경이 없으면 조용히 다시 불러오고, 있으면 알림 줄로 알린다 (저장할 때도 한 번 더 막는다).
 */
async function checkDiskChange() {
  if (checkingDisk || !store.model || !store.fileName || diskMtime === null) return;
  checkingDisk = true;
  try {
    const s = await api('/api/state');
    files = s.files; dir = s.dir;   // 드롭다운은 여기서 다시 그리지 않는다 (파일을 고르는 중일 수 있다)
    const f = s.files.find((x) => x.name === store.fileName);
    if (!f || Math.abs(f.mtime - diskMtime) <= 1) { diskChanged = false; renderNotice(); return; }
    latestMtime = f.mtime;
    if (store.dirty) { diskChanged = true; renderNotice(); return; }
    const name = store.fileName;
    const r = await reloadFromDisk(name, { ifClean: true });
    if (r.loaded) toast(t('core.reloadedFromDisk', { name }), 'info', 6000);
    else if (store.fileName === name) { latestMtime = r.mtime; diskChanged = true; renderNotice(); }   // 읽는 사이에 편집이 생겼다: 덮어쓰지 말고 알린다
  } catch { /* 서버에 닿지 않으면 다음 기회에 */ } finally { checkingDisk = false; }
}

function renderNotice() {
  if (!els.notice) return;
  const show = diskChanged && !!store.fileName && diskMtime !== null;
  const key = show ? `${store.fileName}|${t('core.save')}` : '';   // 파일 이름이나 언어가 바뀐 경우만 다시 그린다 (편집할 때마다 다시 그리지 않는다)
  els.notice.classList.toggle('hidden', !show);
  if (key === noticeKey && els.notice.childElementCount === (show ? 3 : 0)) return;
  noticeKey = key;
  if (!show) { els.notice.replaceChildren(); return; }
  els.notice.replaceChildren(
    h('span', { class: 'notice-text' }, t('core.diskChangedBanner', { name: store.fileName })),
    h('button', { class: 'btn small', onclick: async () => {
      if (!(await confirmDialog(t('core.diskLoadConfirm', { name: store.fileName }), { ok: t('core.diskLoadOk'), danger: true }))) return;
      try { await reloadFromDisk(store.fileName); toast(t('core.reloadedFromDisk', { name: store.fileName }), 'info', 4000); }
      catch (e) { toast(t('core.openFailed', { msg: errMessage(e) }), 'error', 6000); }
    } }, t('core.diskLoadIt')),
    h('button', { class: 'btn small', onclick: () => { diskMtime = latestMtime; diskChanged = false; renderNotice(); } }, t('core.diskKeepMine')));
}

async function openLocalFile(file) {
  if (!file || !(await confirmDiscard())) return;
  try { store.load(parseOverview(await file.text()), file.name); diskMtime = null; diskChanged = false; renderNotice(); toast(t('core.openedLocal', { name: file.name }), 'info', 4500); renderFileSelect(); }
  catch (e) { toast(t('core.openFailed', { msg: errMessage(e) }), 'error', 6000); }
}

async function writeFile(name, { force = false } = {}) {
  // 열어 둔 파일과 같은 이름으로 저장할 때는, 그 사이에 디스크에서 바뀌지 않았는지 서버가 확인하게 한다
  const guard = !force && name === store.fileName && diskMtime !== null ? `&base=${diskMtime}` : '';
  const res = await api(`/api/file?name=${encodeURIComponent(name)}${guard}`, { method: 'PUT', body: serializeOverview(store.model) });
  files = res.files;
  diskMtime = latestMtime = res.mtime; diskChanged = false;
  store.markSaved(name);
  renderFileSelect();
  toast(res.backup ? t('core.savedBackup', { name, backup: res.backup }) : t('core.saved', { name }), 'ok', 3500);
}

/** 저장하고, 파일이 그 사이에 밖에서 바뀌었으면 덮어쓸지 묻는다 */
async function writeChecked(name) {
  if (saving) return;   // 이미 저장 중이거나 확인창이 떠 있다
  saving = true;
  try {
    try { await writeFile(name); }
    catch (e) {
      if (e.code !== 'changed_on_disk') { toast(t('core.saveFailed', { msg: errMessage(e) }), 'error', 6000); return; }
      if (await confirmDialog(t('core.changedOnDiskSave', { name }), { ok: t('core.saveAnyway'), danger: true })) {
        try { await writeFile(name, { force: true }); } catch (e2) { toast(t('core.saveFailed', { msg: errMessage(e2) }), 'error', 6000); }
      } else { saving = false; await checkDiskChange(); }   // 저장하지 않은 변경이 있으면 알림 줄이 떠서 디스크의 파일을 불러올 수 있고, 없으면 조용히 다시 불러온다
    }
  } finally { saving = false; }
}
async function save() {
  if (!store.model) return;
  if (!store.fileName) return saveAs();
  await writeChecked(store.fileName);
}
async function saveAs() {
  if (!store.model) return;
  let name = await promptDialog(t('core.saveAsPrompt'), store.fileName || 'overview.yaml');
  if (!name) return;
  name = name.trim();
  if (!/\.ya?ml$/i.test(name)) name += '.yaml';
  if (files.some((f) => f.name === name) && name !== store.fileName &&
    !(await confirmDialog(t('core.overwriteConfirm', { name }), { ok: t('core.overwrite'), danger: true }))) return;
  await writeChecked(name);
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
  window.addEventListener('focus', checkDiskChange);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDiskChange(); });
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
export const shell = { refreshFiles: refreshAndOpen, openFromServer, getDir: () => dir, getFiles: () => files, save, saveAs };

async function init() {
  buildShell();
  wireGlobal();
  await loadGroupData();
  updateChrome();
  try {
    const s = await refreshFiles();
    if (!s.exists) toast(t('core.folderMissing', { dir: s.dir }), 'warn', 8000);
    await openFirstIfNone();
    if (store.model) return;
  } catch (e) { toast(t('core.serverFailed', { msg: errMessage(e) }), 'error', 6000); }
  showPanel(activeId);
}
init();
