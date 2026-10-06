// 파일 · 고급: 오버뷰 폴더, 백업 복원, 정리 도구, 기타 설정, 변경 요약, YAML 직접 보기/적용.
import { parseOverview, serializeOverview } from '../model.js';
import { store } from '../store.js';
import { getGroupData } from '../data.js';
import { t, formatDate } from '../i18n.js';
import { h, toast, confirmDialog, promptDialog } from '../ui.js';
import { serverApi, shell, errMessage } from '../app.js';

export default async function render(root) {
  const m = store.model;
  root.replaceChildren(
    h('div', { class: 'panel-head' }, h('h2', {}, t('advanced.title')), h('p', {}, t('advanced.subtitle'))),
    folderCard(), changesCard(m), cleanupCard(m, root), settingsCard(m), backupsCard(), yamlCard(m),
  );
}

function folderCard() {
  const dirEl = h('span', { class: 'mono' }, shell.getDir());
  return h('section', { class: 'card' },
    h('h3', {}, t('advanced.folder.title')),
    h('p', { class: 'hint' }, t('advanced.folder.hint')),
    h('div', { class: 'toolbar', style: { marginTop: '8px' } }, dirEl,
      h('button', { class: 'btn', onclick: async () => {
        const d = await promptDialog(t('advanced.folder.prompt'), shell.getDir());
        if (!d) return;
        try { const r = await serverApi('/api/dir', { method: 'POST', body: JSON.stringify({ dir: d.trim() }) }); await shell.refreshFiles(); dirEl.textContent = r.dir; toast(t('advanced.folder.changed'), 'ok'); }
        catch (e) { toast(errMessage(e), 'error', 5000); }
      } }, t('advanced.folder.change'))));
}

// ---- 변경 요약 ----
function diffSummary(a, b) {
  const rows = [];
  const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const names = new Set([...a.presets.map((p) => p.name), ...b.presets.map((p) => p.name)]);
  for (const name of names) {
    const pa = a.presets.find((p) => p.name === name), pb = b.presets.find((p) => p.name === name);
    if (!pa) rows.push(t('advanced.diff.presetAdded', { name }));
    else if (!pb) rows.push(t('advanced.diff.presetRemoved', { name }));
    else {
      const sa = new Set(pa.groups), sb = new Set(pb.groups);
      const add = [...sb].filter((x) => !sa.has(x)).length, del = [...sa].filter((x) => !sb.has(x)).length;
      const bits = [];
      if (add || del) bits.push(t('advanced.diff.groups', { add, del }));
      if (!eq(pa.filteredStates, pb.filteredStates)) bits.push(t('advanced.diff.hiddenStates'));
      if (!eq(pa.alwaysShownStates, pb.alwaysShownStates)) bits.push(t('advanced.diff.alwaysStates'));
      if (bits.length) rows.push(t('advanced.diff.presetChanged', { name, details: bits.join(t('advanced.listSep')) }));
    }
  }
  if (!eq(a.presets.map((p) => p.name), b.presets.map((p) => p.name)) && a.presets.length === b.presets.length) rows.push(t('advanced.diff.presetOrder'));
  if (!eq(a.tabs, b.tabs)) rows.push(t('advanced.diff.tabs'));
  if (!eq([a.flagOrder, a.flagStates, a.backgroundOrder, a.backgroundStates, a.stateColors, a.stateBlinks],
    [b.flagOrder, b.flagStates, b.backgroundOrder, b.backgroundStates, b.stateColors, b.stateBlinks])) rows.push(t('advanced.diff.appearance'));
  if (!eq([a.overviewColumns, a.columnOrder], [b.overviewColumns, b.columnOrder])) rows.push(t('advanced.diff.columns'));
  if (!eq([a.shipLabelOrder, a.shipLabels], [b.shipLabelOrder, b.shipLabels])) rows.push(t('advanced.diff.labels'));
  if (!eq(a.userSettings, b.userSettings)) rows.push(t('advanced.diff.settings'));
  return rows;
}
function changesCard(m) {
  const saved = store.savedModel;
  const rows = saved ? diffSummary(saved, m) : [];
  return h('section', { class: 'card' },
    h('h3', {}, t('advanced.changes.title')),
    rows.length ? h('ul', { class: 'ad-list' }, rows.map((r) => h('li', {}, r))) : h('p', { class: 'muted' }, t('advanced.changes.none')));
}

// ---- 정리 도구 ----
const plainTabName = (s) => String(s ?? '').replace(/<[^>]*>/g, '');
function cleanupCard(m, root) {
  const groups = getGroupData()?.groups ?? {};
  const unknown = new Set();
  for (const p of m.presets) for (const g of p.groups) if (!groups[g]) unknown.add(g);
  const used = new Set(m.tabs.flatMap((tab) => [tab.overview, tab.bracket]));
  const unused = m.presets.filter((p) => !used.has(p.name)).map((p) => p.name);
  const names = new Set(m.presets.map((p) => p.name));
  const broken = m.tabs.map((tab, i) => ({ tab, i })).filter(({ tab }) => (tab.overview && !names.has(tab.overview)) || (tab.bracket !== '_BracketFilterShowAll' && tab.bracket && !names.has(tab.bracket)));
  return h('section', { class: 'card' },
    h('h3', {}, t('advanced.cleanup.title')),
    h('div', { class: 'ad-row' },
      h('span', {}, t('advanced.cleanup.unknownGroups', { n: unknown.size }), unknown.size ? h('span', { class: 'muted mono small' }, ` ( ${[...unknown].join(', ')} )`) : null),
      h('button', { class: 'btn small', disabled: !unknown.size, onclick: async () => {
        if (!(await confirmDialog(t('advanced.cleanup.confirmRemove', { n: unknown.size }), { ok: t('advanced.cleanup.remove') }))) return;
        for (const p of m.presets) p.groups = p.groups.filter((g) => groups[g]);
        store.commit('cleanup-groups'); toast(t('advanced.cleanup.removed'), 'ok'); render(root);
      } }, t('advanced.cleanup.removeAll'))),
    h('div', { class: 'ad-row' }, t('advanced.cleanup.unusedPresets', { list: unused.length ? unused.join(', ') : t('advanced.cleanup.none') })),
    h('div', { class: 'ad-row' }, broken.length
      ? h('span', { class: 'warn' }, t('advanced.cleanup.brokenTabs', { list: broken.map(({ tab, i }) => `#${i} ${plainTabName(tab.name)}`).join(', ') }))
      : t('advanced.cleanup.noBroken')));
}

function settingsCard(m) {
  const cb = h('input', { type: 'checkbox', checked: !!m.userSettings.applyToOtherObjects, onchange: () => {
    m.userSettings.applyToOtherObjects = cb.checked; store.commit('user-settings');
  } });
  return h('section', { class: 'card' },
    h('h3', {}, t('advanced.settings.title')),
    h('label', { class: 'check' }, cb, h('span', {}, 'applyToOtherObjects'),
      h('span', { class: 'muted small' }, ` — ${t('advanced.settings.applyToOthers')}`)));
}

// ---- 백업 ----
const formatSize = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
function backupsCard() {
  const box = h('div', {}, h('p', { class: 'muted' }, t('advanced.backups.loading')));
  const draw = () => serverApi('/api/backups').then(({ backups }) => {
    if (!backups.length) { box.replaceChildren(h('p', { class: 'muted' }, t('advanced.backups.none'))); return; }
    const total = backups.reduce((sum, b) => sum + (b.size || 0), 0);
    box.replaceChildren(
      h('div', { class: 'toolbar' },
        h('span', { class: 'chip' }, t('advanced.backups.count', { n: backups.length, size: formatSize(total) })),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn danger small', onclick: async () => {
          if (!(await confirmDialog(t('advanced.backups.confirmDeleteAll', { n: backups.length }), { ok: t('advanced.backups.deleteAll'), danger: true }))) return;
          try { const r = await serverApi('/api/backups', { method: 'DELETE' }); toast(t('advanced.backups.deletedAll', { n: r.deleted }), 'ok'); draw(); }
          catch (e) { toast(errMessage(e), 'error', 5000); }
        } }, t('advanced.backups.deleteAll'))),
      h('table', { class: 'grid' }, h('tbody', {}, backups.slice(0, 50).map((b) => h('tr', {},
        h('td', { class: 'mono small' }, b.name), h('td', { class: 'muted small' }, formatDate(b.mtime)),
        h('td', { class: 'muted small' }, formatSize(b.size || 0)),
        h('td', { class: 'ad-actions' },
          h('button', { class: 'btn small', onclick: async () => {
            if (store.dirty && !(await confirmDialog(t('advanced.backups.confirmLoad'), { ok: t('advanced.backups.load'), danger: true }))) return;
            try {
              const r = await serverApi(`/api/backup?name=${encodeURIComponent(b.name)}`);
              store.load(parseOverview(r.text), null);
              toast(t('advanced.backups.loaded'), 'info', 5000);
            } catch (e) { toast(errMessage(e), 'error', 5000); }
          } }, t('advanced.backups.load')),
          h('button', { class: 'btn small danger', title: t('advanced.backups.delete'), onclick: async () => {
            if (!(await confirmDialog(t('advanced.backups.confirmDelete', { name: b.name }), { ok: t('advanced.backups.delete'), danger: true }))) return;
            try { await serverApi(`/api/backup?name=${encodeURIComponent(b.name)}`, { method: 'DELETE' }); toast(t('advanced.backups.deleted'), 'ok', 2000); draw(); }
            catch (e) { toast(errMessage(e), 'error', 5000); }
          } }, t('advanced.backups.delete'))))))),
      ...(backups.length > 50 ? [h('p', { class: 'hint' }, `… +${backups.length - 50}`)] : []));
  }).catch((e) => box.replaceChildren(h('p', { class: 'warn' }, errMessage(e))));
  draw();
  return h('section', { class: 'card' }, h('h3', {}, t('advanced.backups.title')), box);
}

// ---- YAML ----
function yamlCard(m) {
  const ta = h('textarea', { class: 'mono', rows: 14, spellcheck: 'false', value: serializeOverview(m), style: { fontSize: '12px' } });
  return h('section', { class: 'card' },
    h('h3', {}, t('advanced.yaml.title')),
    h('p', { class: 'hint' }, t('advanced.yaml.hint')),
    h('div', { class: 'toolbar', style: { marginTop: '8px' } },
      h('button', { class: 'btn', onclick: () => { ta.value = serializeOverview(store.model); } }, t('advanced.yaml.refresh')),
      h('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(ta.value); toast(t('advanced.yaml.copied'), 'ok', 1500); } catch { ta.select(); } } }, t('advanced.yaml.copy')),
      h('button', { class: 'btn primary', onclick: () => {
        try { store.replaceModel(parseOverview(ta.value), 'yaml-text'); toast(t('advanced.yaml.applied'), 'ok'); }
        catch (e) { toast(t('advanced.yaml.error', { msg: errMessage(e) }), 'error', 7000); }
      } }, t('advanced.yaml.apply'))),
    ta);
}
