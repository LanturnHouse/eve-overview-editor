// 프리셋 패널: 오버뷰 프리셋(표시할 유형/그룹, 상태 필터)을 편집한다.
import { store, clone } from '../store.js';
import { h, toast, confirmDialog, promptDialog, makeSortable, gripHandle, moveItem, debounce } from '../ui.js';
import { t, nameOf, getLang, getLocale } from '../i18n.js';
import {
  STATES, STATE_KIND_IDS, ALL_STATE_IDS, stateName, stateNameEn, kindName, colorCss, colorLabel,
  OVERVIEW_CATEGORIES, getGroupData,
} from '../data.js';

// ---- 패널 전체에서 유지되는 화면 설정 (render 가 여러 번 불려도 유지) ----
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 무시 */ } };
const prefs = { q: '', onlySel: false, showAll: false };
let selName = lsGet('presets.sel');
let subtab = lsGet('presets.sub') === 'states' ? 'states' : 'groups';

const numAsc = (a, b) => a - b;
const nameCmp = (a, b) => a.localeCompare(b, getLocale());
const LANG_CODES = ['en', 'ko', 'ja', 'ru', 'zh'];
/** 모든 언어 이름을 합친 검색 문자열 (어느 언어로 검색해도 찾히게) */
const searchText = (entry, ...extra) => [...LANG_CODES.map((c) => entry?.[c]), ...extra].filter(Boolean).join(' ').toLowerCase();
/** 영어 이름이 보조 표기로 필요한가 (현재 언어가 영어가 아니고 이름이 다를 때) */
const enAlt = (entry, main) => (getLang() !== 'en' && entry?.en && entry.en !== main ? entry.en : null);

// ---- 그룹 색인 (그룹 데이터가 바뀌지 않으므로 한 번만 계산) ----
let idxFor = null, idxLang = null, idxCache = null;
function groupIndex() {
  const gd = getGroupData();
  const lang = getLang();
  if (idxFor === gd && idxLang === lang && idxCache) return idxCache;
  const byCat = new Map();
  for (const [sid, g] of Object.entries(gd.groups)) {
    const id = Number(sid);
    if (!byCat.has(g.cat)) byCat.set(g.cat, []);
    const name = nameOf(g) || String(id);
    byCat.get(g.cat).push({ id, name, alt: enAlt(g, name), search: searchText(g, String(id)) });
  }
  for (const list of byCat.values()) list.sort((a, b) => nameCmp(a.name, b.name) || a.id - b.id);
  const catEntry = (c) => gd.categories[c] ?? { en: `#${c}` };
  const catName = (c) => { const e = catEntry(c); const name = nameOf(e) || `#${c}`; return { name, alt: enAlt(e, name), search: searchText(e) }; };
  const rest = [...byCat.keys()].filter((c) => !OVERVIEW_CATEGORIES.includes(c))
    .sort((a, b) => nameCmp(catName(a).name, catName(b).name));
  const order = [...OVERVIEW_CATEGORIES.filter((c) => byCat.has(c)), ...rest];
  idxFor = gd; idxLang = lang;
  idxCache = { gd, byCat, order, catName };
  return idxCache;
}

const presetLabel = (p) => p.name;
const uniqueCount = (arr) => new Set(arr).size;

export default async function render(root) {
  const model = store.model;
  root.replaceChildren();

  if (!model.presets.length) {
    root.append(
      panelHead(),
      h('div', { class: 'card' },
        h('p', {}, t('presets.emptyNone')),
        h('p', { class: 'hint' }, t('presets.emptyHint')),
        h('div', { class: 'toolbar', style: { marginTop: '10px' } },
          h('button', { class: 'btn primary', onclick: async () => { if (await addPreset()) render(root); } }, t('presets.emptyNew')))),
    );
    return;
  }

  // ---------- 선택 상태 ----------
  let selIdx = Math.max(0, model.presets.findIndex((p) => p.name === selName));
  selName = model.presets[selIdx].name;
  const cur = () => model.presets[selIdx];
  const remember = () => { selName = cur().name; lsSet('presets.sel', selName); };

  // ---------- 목록 ----------
  const listEl = h('div', { class: 'list pr-list', role: 'listbox', 'aria-label': t('presets.listAria') });
  const editorHost = h('div', { class: 'pr-editor' });
  let rowEls = [];

  const btnRename = h('button', { class: 'btn', onclick: () => renameCur() }, t('presets.btnRename'));
  const btnDup = h('button', { class: 'btn', onclick: () => dupCur() }, t('presets.btnDup'));
  const btnDel = h('button', { class: 'btn danger', onclick: () => delCur() }, t('presets.btnDel'));
  const side = h('div', { class: 'card pr-side' },
    h('div', { class: 'toolbar' },
      h('button', { class: 'btn primary', onclick: () => addNew() }, t('presets.btnAdd')),
      btnDup, btnRename, btnDel),
    listEl,
    h('p', { class: 'hint' }, t('presets.listHint')),
  );

  function drawList() {
    rowEls = model.presets.map((p, i) => {
      const row = h('div', {
        class: `list-item pr-item${i === selIdx ? ' active' : ''}`, role: 'option', tabindex: '0',
        'aria-selected': i === selIdx ? 'true' : 'false', draggable: 'true', dataset: { sortable: '' },
        onclick: () => select(i),
        ondblclick: () => { select(i); renameCur(); },
        onkeydown: (e) => {
          if (e.target !== row) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); }
          else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const n = i + (e.key === 'ArrowDown' ? 1 : -1);
            if (n >= 0 && n < model.presets.length) { select(n); rowEls[n].focus(); }
          }
        },
      },
      gripHandle(),
      h('span', { class: 'grow', title: presetLabel(p) }, presetLabel(p)),
      h('span', { class: 'badge pr-cnt', title: t('presets.cntTitle') }, uniqueCount(p.groups)));
      return row;
    });
    listEl.replaceChildren(...rowEls);
  }
  makeSortable(listEl, (from, to) => {
    moveItem(model.presets, from, to);
    if (selIdx === from) selIdx = to;
    else if (from < selIdx && to >= selIdx) selIdx--;
    else if (from > selIdx && to <= selIdx) selIdx++;
    store.commit('reorder-preset');
    drawList();
  });

  function refreshBadge() {
    const b = rowEls[selIdx]?.querySelector('.pr-cnt');
    if (b) b.textContent = uniqueCount(cur().groups);
  }

  function select(i) {
    if (i === selIdx) return;
    selIdx = i; remember();
    rowEls.forEach((r, k) => { r.classList.toggle('active', k === i); r.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
    renderEditor();
  }

  async function addNew() {
    if (await addPreset()) { selIdx = model.presets.length - 1; remember(); drawList(); renderEditor(); rowEls[selIdx].scrollIntoView({ block: 'nearest' }); }
  }
  function dupCur() {
    const src = cur();
    const np = clone(src);
    np.name = store.uniquePresetName(t('presets.dupName', { name: src.name }));
    model.presets.splice(selIdx + 1, 0, np);
    store.commit('dup-preset');
    selIdx++; remember(); drawList(); renderEditor();
    toast(t('presets.dupDone', { name: np.name }), 'ok', 1800);
  }
  async function renameCur() {
    const p = cur();
    const v = await promptDialog(t('presets.renameTitle'), p.name, { ok: t('presets.renameOk') });
    if (v === null) return;
    const nn = v.trim();
    if (nn === p.name) return;
    if (!nn) { toast(t('presets.errEmpty'), 'warn'); return; }
    if (model.presets.some((q, i) => i !== selIdx && q.name === nn)) { toast(t('presets.errExists', { name: nn }), 'warn'); return; }
    const used = store.tabsUsingPreset(p.name).length;
    if (!store.renamePreset(selIdx, nn)) { toast(t('presets.renameFail'), 'error'); return; }
    remember(); drawList();
    editorHost.querySelector('.pr-title')?.replaceChildren(nn);
    toast(used ? t('presets.renameDoneRefs', { n: used }) : t('presets.renameDone'), 'ok', 2200);
  }
  async function delCur() {
    const p = cur();
    const tabs = store.tabsUsingPreset(p.name);
    let msg = t('presets.delConfirm', { name: p.name });
    if (tabs.length) {
      msg += `\n\n${t('presets.delUsedBy')}\n` +
        tabs.map(({ t: tab, i }) => t('presets.delTabLine', {
          n: i + 1,
          label: tab.name ? `'${tab.name.replace(/<[^>]*>/g, '')}'` : '',
          uses: [tab.overview === p.name ? t('presets.delUseShow') : null, tab.bracket === p.name ? t('presets.delUseBracket') : null].filter(Boolean).join(', '),
        })).join('\n') +
        `\n\n${t('presets.delTail')}`;
    }
    if (!(await confirmDialog(msg, { ok: t('presets.delOk'), danger: true }))) return;
    model.presets.splice(selIdx, 1);
    store.commit('delete-preset');
    if (!model.presets.length) { render(root); return; }
    selIdx = Math.min(selIdx, model.presets.length - 1); remember();
    drawList(); renderEditor();
  }

  // ---------- 오른쪽 편집기 ----------
  function renderEditor() {
    const p = cur();
    const tabBtns = [['groups', t('presets.subGroups')], ['states', t('presets.subStates')]].map(([id, label]) =>
      h('button', {
        type: 'button', role: 'tab', class: id === subtab ? 'active' : '', 'aria-selected': id === subtab ? 'true' : 'false',
        onclick: () => { subtab = id; lsSet('presets.sub', id); tabBtns.forEach((b, k) => { const on = (k === 0) === (id === 'groups'); b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); }); drawTab(); },
      }, label));
    const body = h('div', { class: 'pr-tabbody' });
    const keepScroll = (fn) => { const y = root.scrollTop; fn(); root.scrollTop = y; };
    function drawTab() {
      body.replaceChildren(subtab === 'groups'
        ? groupsTab(p, { onChanged: refreshBadge, rebuild: () => keepScroll(drawTab) })
        : statesTab(p, { rebuild: () => keepScroll(drawTab) }));
    }
    editorHost.replaceChildren(
      h('div', { class: 'pr-head' },
        h('h3', { class: 'pr-title' }, p.name)),
      h('div', { class: 'subtabs', role: 'tablist' }, ...tabBtns),
      body);
    drawTab();
  }

  async function addPreset() {
    const v = await promptDialog(t('presets.addTitle'), store.uniquePresetName(t('presets.addDefault')), { ok: t('presets.addOk') });
    if (v === null) return false;
    const nn = v.trim();
    if (!nn) { toast(t('presets.errEmpty'), 'warn'); return false; }
    if (model.presets.some((q) => q.name === nn)) { toast(t('presets.errExists', { name: nn }), 'warn'); return false; }
    model.presets.push({ name: nn, groups: [], filteredStates: [], alwaysShownStates: [], extra: {} });
    store.commit('add-preset');
    selName = nn; lsSet('presets.sel', nn);
    return true;
  }

  root.append(panelHead(), h('div', { class: 'split' }, side, editorHost));
  drawList();
  renderEditor();
}

function panelHead() {
  return h('div', { class: 'panel-head' },
    h('h2', {}, t('presets.headTitle')),
    h('p', {}, t('presets.headDesc')));
}

// =====================================================================
// 유형(그룹) 탭
// =====================================================================
function groupsTab(p, { onChanged, rebuild }) {
  const model = store.model;
  const { gd, byCat, order, catName } = groupIndex();
  const sel = new Set(p.groups);
  let q = '';
  /** @type {Map<number, any>} */
  const cats = new Map();

  const setIds = (ids, on) => {
    if (on) {
      for (const id of ids) if (!sel.has(id)) { sel.add(id); p.groups.push(id); }
    } else {
      const rm = new Set(ids.filter((id) => sel.has(id)));
      if (!rm.size) return;
      rm.forEach((id) => sel.delete(id));
      p.groups = p.groups.filter((x) => !rm.has(x));
    }
  };
  const afterChange = () => { store.commit('preset-groups'); updateSummary(); updateUnknown(); onChanged(); };

  // ----- 요약 -----
  const totalEl = h('strong', {});
  const unkNote = h('span', { class: 'warn small' });
  const chipsEl = h('div', { class: 'pr-chips' });
  function updateSummary() {
    totalEl.textContent = t('presets.total', { n: sel.size });
    const counts = new Map();
    let unknown = 0;
    for (const id of sel) {
      const g = gd.groups[id];
      if (!g) { unknown++; continue; }
      counts.set(g.cat, (counts.get(g.cat) || 0) + 1);
    }
    unkNote.textContent = unknown ? t('presets.unkNote', { n: unknown }) : '';
    chipsEl.replaceChildren(...order.filter((c) => counts.has(c)).map((c) => {
      const nm = catName(c);
      return h('button', { type: 'button', class: 'chip pr-chip', title: nm.alt ? `${nm.alt} — ${t('presets.chipTitle')}` : t('presets.chipTitle'), dataset: { cat: c } },
        nm.name, h('b', {}, counts.get(c)));
    }));
    for (const rec of cats.values()) refreshCat(rec);
  }
  chipsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.pr-chip');
    if (!b) return;
    let rec = cats.get(Number(b.dataset.cat));
    if (!rec || rec.details.classList.contains('hidden')) return;
    rec.details.open = true; fillBody(rec);
    rec.details.scrollIntoView({ block: 'start' });
  });

  // ----- 카테고리 트리 -----
  const tree = h('div', { class: 'pr-tree' });
  const emptyEl = h('p', { class: 'muted pr-empty hidden' }, t('presets.emptyMatch'));
  const statusEl = h('span', { class: 'hint pr-status' });

  const passes = (g, rec) => {
    if (prefs.onlySel && !sel.has(g.id)) return false;
    if (!q) return true;
    return rec.nameHit || g.search.includes(q);
  };

  function refreshCat(rec) {
    let n = 0;
    for (const g of rec.list) if (sel.has(g.id)) n++;
    const total = rec.list.length;
    rec.cb.checked = n === total && total > 0;
    rec.cb.indeterminate = n > 0 && n < total;
    rec.countEl.textContent = `${n}/${total}`;
    rec.details.classList.toggle('has-sel', n > 0);
  }

  function fillBody(rec) {
    if (rec.built) return;
    const frag = document.createDocumentFragment();
    for (const g of rec.list) {
      if (!passes(g, rec)) continue;
      frag.append(h('label', { class: 'pr-row' },
        h('input', { type: 'checkbox', dataset: { gid: g.id }, checked: sel.has(g.id) }),
        h('span', { class: 'pr-ko', title: g.name }, g.name),
        g.alt ? h('span', { class: 'pr-en', title: g.alt }, g.alt) : null,
        h('span', { class: 'pr-id mono' }, g.id)));
    }
    rec.body.replaceChildren(frag);
    rec.built = true;
  }

  function buildTree() {
    const wasOpen = new Set([...cats].filter(([, r]) => r.details.open).map(([id]) => id));
    cats.clear();
    const used = new Set();
    for (const pr of model.presets) for (const id of pr.groups) { const g = gd.groups[id]; if (g) used.add(g.cat); }
    const visible = order.filter((c) => prefs.showAll || OVERVIEW_CATEGORIES.includes(c) || used.has(c));
    const nodes = visible.map((c) => {
      const nm = catName(c);
      const list = byCat.get(c);
      const cb = h('input', { type: 'checkbox', dataset: { catcb: c }, 'aria-label': t('presets.catAria', { name: nm.name }) });
      const countEl = h('span', { class: 'pr-cat-count' });
      const body = h('div', { class: 'pr-cat-body' });
      const details = h('details', { class: 'pr-cat', dataset: { cat: c } },
        h('summary', { class: 'pr-cat-head' }, cb,
          h('span', { class: 'pr-cat-name' }, nm.name, nm.alt ? h('span', { class: 'pr-en' }, nm.alt) : null,
            h('span', { class: 'pr-id mono' }, `#${c}`)),
          countEl),
        body);
      const rec = { id: c, list, cb, countEl, body, details, built: false, auto: false, nameHit: false, nameSearch: nm.search };
      if (wasOpen.has(c)) details.open = true;
      cats.set(c, rec);
      return details;
    });
    tree.replaceChildren(...nodes);
    for (const rec of cats.values()) refreshCat(rec);
    catInfo.textContent = prefs.showAll ? t('presets.catInfoAll', { n: visible.length }) : t('presets.catInfoSome', { n: visible.length, total: order.length });
    applyFilter();
  }

  function applyFilter() {
    q = prefs.q.trim().toLowerCase();
    const filtering = !!q || prefs.onlySel;
    let shown = 0, matched = 0;
    for (const rec of cats.values()) {
      rec.nameHit = !!q && rec.nameSearch.includes(q);
      let n = rec.list.length;
      if (filtering) { n = 0; for (const g of rec.list) if (passes(g, rec)) n++; }
      matched += n;
      const hide = filtering && n === 0;
      rec.details.classList.toggle('hidden', hide);
      rec.built = false;
      if (hide) { rec.body.replaceChildren(); continue; }
      shown++;
      if (filtering) {
        if (!rec.details.open) { rec.details.open = true; rec.auto = true; }
        fillBody(rec);
      } else {
        if (rec.auto) { rec.details.open = false; rec.auto = false; }
        if (rec.details.open) fillBody(rec); else rec.body.replaceChildren();
      }
    }
    emptyEl.classList.toggle('hidden', shown > 0);
    statusEl.textContent = filtering ? t('presets.status', { groups: matched, cats: shown }) : '';
  }

  // 펼칠 때 지연 생성 (toggle 은 버블링되지 않으므로 캡처로 받는다)
  tree.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!d.classList?.contains('pr-cat') || !d.open) return;
    const rec = cats.get(Number(d.dataset.cat));
    if (rec) fillBody(rec);
  }, true);

  // 체크 변경 (이벤트 위임)
  tree.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.gid !== undefined) {
      const id = Number(t.dataset.gid);
      setIds([id], t.checked);
      const g = gd.groups[id];
      if (g && cats.get(g.cat)) refreshCat(cats.get(g.cat));
      afterChange();
    } else if (t.dataset.catcb !== undefined) {
      const rec = cats.get(Number(t.dataset.catcb));
      // 검색 중이면 일치하는 항목만, 아니면 카테고리 전체
      const ids = (q ? rec.list.filter((g) => rec.nameHit || g.search.includes(q)) : rec.list).map((g) => g.id);
      setIds(ids, t.checked);
      rec.body.querySelectorAll('input[data-gid]').forEach((i) => { i.checked = sel.has(Number(i.dataset.gid)); });
      afterChange();
    }
  });

  // ----- 알 수 없는 그룹 -----
  const unkBox = h('div', { class: 'pr-unknown hidden' });
  function updateUnknown() {
    const ids = [...sel].filter((id) => !gd.groups[id]).sort(numAsc);
    unkBox.classList.toggle('hidden', !ids.length);
    if (!ids.length) { unkBox.replaceChildren(); return; }
    unkBox.replaceChildren(
      h('div', { class: 'pr-unk-head' },
        h('strong', { class: 'warn' }, t('presets.unkHead', { n: ids.length })),
        h('span', { class: 'hint' }, t('presets.unkDesc')),
        h('button', { type: 'button', class: 'btn small danger', dataset: { rmAll: '' } }, t('presets.unkRemoveAll'))),
      h('div', { class: 'pr-unk-list' }, ids.map((id) =>
        h('span', { class: 'chip pr-unk' },
          h('span', { class: 'mono' }, `#${id}`), t('presets.unkChip'),
          h('button', { type: 'button', class: 'btn ghost small', 'aria-label': t('presets.unkRemoveAria', { id }), title: t('presets.unkRemoveTitle'), dataset: { rm: id } }, '✕')))));
  }
  unkBox.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.rm !== undefined) setIds([Number(b.dataset.rm)], false);
    else if (b.dataset.rmAll !== undefined) setIds([...sel].filter((id) => !gd.groups[id]), false);
    else return;
    afterChange();
  });

  // ----- 도구 막대 -----
  const search = h('input', { type: 'search', class: 'input grow pr-search', placeholder: t('presets.searchPh'), 'aria-label': t('presets.searchAria'), value: prefs.q });
  search.addEventListener('input', debounce(() => { prefs.q = search.value; applyFilter(); }, 120));
  const onlySel = h('input', { type: 'checkbox', checked: prefs.onlySel });
  onlySel.addEventListener('change', () => { prefs.onlySel = onlySel.checked; applyFilter(); });
  const showAll = h('input', { type: 'checkbox', checked: prefs.showAll });
  showAll.addEventListener('change', () => { prefs.showAll = showAll.checked; buildTree(); });
  const catInfo = h('span', { class: 'hint' });

  const others = model.presets.map((o, i) => ({ o, i })).filter(({ o }) => o !== p);
  const srcSel = h('select', { 'aria-label': t('presets.importSrcAria') }, others.map(({ o, i }) => h('option', { value: i }, `${o.name} (${uniqueCount(o.groups)})`)));
  const modeSel = h('select', { 'aria-label': t('presets.importModeAria') },
    h('option', { value: 'merge' }, t('presets.modeMerge')), h('option', { value: 'intersect' }, t('presets.modeIntersect')),
    h('option', { value: 'subtract' }, t('presets.modeSubtract')), h('option', { value: 'replace' }, t('presets.modeReplace')));
  const importBtn = h('button', {
    type: 'button', class: 'btn', disabled: !others.length,
    onclick: () => {
      const src = model.presets[Number(srcSel.value)];
      if (!src) return;
      const o = new Set(src.groups), before = sel.size, mode = modeSel.value;
      let next;
      if (mode === 'merge') next = new Set([...sel, ...o]);
      else if (mode === 'intersect') next = new Set([...sel].filter((x) => o.has(x)));
      else if (mode === 'subtract') next = new Set([...sel].filter((x) => !o.has(x)));
      else next = o;
      p.groups = [...next];
      store.commit('preset-import');
      onChanged();
      toast(t('presets.importDone', {
        name: src.name,
        mode: t(`presets.mode${mode[0].toUpperCase()}${mode.slice(1)}Short`),
        before, n: next.size,
      }), 'ok', 2500);
      rebuild();
    },
  }, t('presets.importApply'));
  const clearBtn = h('button', {
    type: 'button', class: 'btn danger',
    onclick: () => {
      if (!sel.size) return;
      const n = sel.size;
      p.groups = [];
      store.commit('preset-clear');
      onChanged();
      toast(t('presets.clearDone', { n }), 'ok', 2200);
      rebuild();
    },
  }, t('presets.clearAll'));

  const el = h('div', { class: 'pr-groups-tab' },
    h('div', { class: 'pr-summary' }, h('div', { class: 'pr-summary-line' }, totalEl, unkNote), chipsEl),
    h('div', { class: 'toolbar' }, search,
      h('label', { class: 'check' }, onlySel, t('presets.onlySel')),
      h('label', { class: 'check' }, showAll, t('presets.showAll')),
      h('button', { type: 'button', class: 'btn small', onclick: () => { for (const r of cats.values()) if (!r.details.classList.contains('hidden')) { r.details.open = true; fillBody(r); } } }, t('presets.expandAll')),
      h('button', { type: 'button', class: 'btn small', onclick: () => { for (const r of cats.values()) { r.details.open = false; r.auto = false; } } }, t('presets.collapseAll'))),
    h('div', { class: 'toolbar pr-bulk' },
      h('span', { class: 'muted small' }, t('presets.importFrom')), srcSel, modeSel, importBtn,
      h('span', { class: 'spacer-grow' }), clearBtn),
    h('div', { class: 'pr-metaline' }, catInfo, statusEl),
    tree, emptyEl, unkBox);

  updateSummary();
  updateUnknown();
  buildTree();
  return el;
}

// =====================================================================
// 상태 필터 탭
// =====================================================================
function statesTab(p, { rebuild }) {
  const model = store.model;
  const valueOf = (id) => {
    const f = p.filteredStates.includes(id), a = p.alwaysShownStates.includes(id);
    return f && a ? 'both' : f ? 'hide' : a ? 'show' : 'default';
  };
  const OPTS = [['default', t('presets.optDefault')], ['hide', t('presets.optHide')], ['show', t('presets.optShow')]];

  const sumEl = h('div', { class: 'pr-summary-line' });
  function updateSummary() {
    const nf = uniqueCount(p.filteredStates), na = uniqueCount(p.alwaysShownStates);
    sumEl.replaceChildren(h('strong', {}, t('presets.sumHide', { n: nf })), ' · ', h('strong', {}, t('presets.sumShow', { n: na })),
      ' ', h('span', { class: 'muted small' }, t('presets.sumRest')));
  }

  function rowFor(id) {
    const known = STATES[id];
    const row = h('div', { class: 'pr-state', dataset: { sid: id } },
      h('div', { class: 'pr-state-name' },
        known && colorCss(known.color) ? h('span', { class: 'swatch', style: { background: colorCss(known.color) }, title: t('presets.defaultColor', { color: colorLabel(known.color) }) }) : null,
        h('div', {},
          h('div', {}, stateName(id), ' ',
            known?.filterOnly ? h('span', { class: 'badge', title: t('presets.filterOnlyTitle') }, t('presets.filterOnly')) : null,
            h('span', { class: 'pr-conflict warn small hidden' }, ` ${t('presets.conflict')}`)),
          h('div', { class: 'pr-en' }, known ? (getLang() !== 'en' && stateNameEn(id) !== stateName(id) ? [stateNameEn(id), ' · '] : '') : [t('presets.unknownState'), ' · '], h('span', { class: 'mono' }, `#${id}`)))),
      h('div', { class: 'pr-seg', role: 'radiogroup', 'aria-label': t('presets.stateAria', { name: stateName(id) }) },
        OPTS.map(([v, label]) => h('label', { class: `pr-seg-${v}` },
          h('input', { type: 'radio', name: `pr-st-${p.name}-${id}`, value: v }), h('span', {}, label)))));
    paintRow(row);
    return row;
  }
  function paintRow(row) {
    const id = Number(row.dataset.sid), v = valueOf(id);
    row.className = `pr-state is-${v}`;
    row.querySelectorAll('input[type=radio]').forEach((r) => { r.checked = r.value === v; });
    row.querySelector('.pr-conflict').classList.toggle('hidden', v !== 'both');
  }

  const wrap = h('div', { class: 'pr-states' });
  for (const kind of STATE_KIND_IDS) {
    const ids = ALL_STATE_IDS.filter((id) => STATES[id].kind === kind);
    if (!ids.length) continue;
    wrap.append(h('section', { class: 'pr-kind' }, h('h4', {}, kindName(kind)), ids.map(rowFor)));
  }
  const unk = [...new Set([...p.filteredStates, ...p.alwaysShownStates])].filter((id) => !STATES[id]).sort(numAsc);
  if (unk.length) wrap.append(h('section', { class: 'pr-kind' }, h('h4', {}, t('presets.unknownStates')), unk.map(rowFor)));

  wrap.addEventListener('change', (e) => {
    const t = e.target;
    if (t.type !== 'radio') return;
    const row = t.closest('.pr-state');
    const id = Number(row.dataset.sid);
    p.filteredStates = p.filteredStates.filter((x) => x !== id);
    p.alwaysShownStates = p.alwaysShownStates.filter((x) => x !== id);
    if (t.value === 'hide') p.filteredStates.push(id);
    else if (t.value === 'show') p.alwaysShownStates.push(id);
    store.commit('preset-states');
    paintRow(row);
    updateSummary();
  });

  const others = model.presets.filter((o) => o !== p);
  const srcSel = h('select', { 'aria-label': t('presets.copyAria') }, others.map((o) => h('option', { value: model.presets.indexOf(o) }, o.name)));
  const copyBtn = h('button', {
    type: 'button', class: 'btn', disabled: !others.length,
    onclick: () => {
      const src = model.presets[Number(srcSel.value)];
      if (!src) return;
      p.filteredStates = [...src.filteredStates];
      p.alwaysShownStates = [...src.alwaysShownStates];
      store.commit('preset-states-copy');
      toast(t('presets.copyDone', { name: src.name }), 'ok', 2000);
      rebuild();
    },
  }, t('presets.copyBtn'));
  const resetBtn = h('button', {
    type: 'button', class: 'btn danger',
    onclick: () => {
      if (!p.filteredStates.length && !p.alwaysShownStates.length) return;
      p.filteredStates = []; p.alwaysShownStates = [];
      store.commit('preset-states-reset');
      toast(t('presets.resetDone'), 'ok', 2000);
      rebuild();
    },
  }, t('presets.resetAll'));

  updateSummary();
  return h('div', { class: 'pr-states-tab' },
    h('p', { class: 'hint pr-explain' },
      h('b', {}, t('presets.optHide')), ' (filteredStates)', t('presets.explainHide'), ' ',
      h('b', {}, t('presets.optShow')), ' (alwaysShownStates)', t('presets.explainShow'), ' ', t('presets.explainOne')),
    h('div', { class: 'pr-summary' }, sumEl),
    h('div', { class: 'toolbar pr-bulk' },
      h('span', { class: 'muted small' }, t('presets.copyFrom')), srcSel, copyBtn,
      h('span', { class: 'spacer-grow' }), resetBtn),
    wrap);
}
