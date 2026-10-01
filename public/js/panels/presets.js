// 프리셋 패널: 오버뷰 프리셋(표시할 유형/그룹, 상태 필터)을 편집한다.
import { store, clone } from '../store.js';
import { h, toast, confirmDialog, promptDialog, makeSortable, gripHandle, moveItem, debounce } from '../ui.js';
import {
  STATES, STATE_KINDS, ALL_STATE_IDS, stateName, stateNameEn, colorCss,
  OVERVIEW_CATEGORIES, getGroupData,
} from '../data.js';

// ---- 패널 전체에서 유지되는 화면 설정 (render 가 여러 번 불려도 유지) ----
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 무시 */ } };
const prefs = { q: '', onlySel: false, showAll: false };
let selName = lsGet('presets.sel');
let subtab = lsGet('presets.sub') === 'states' ? 'states' : 'groups';

const numAsc = (a, b) => a - b;
const koCmp = (a, b) => a.localeCompare(b, 'ko');

// ---- 그룹 색인 (그룹 데이터가 바뀌지 않으므로 한 번만 계산) ----
let idxFor = null, idxCache = null;
function groupIndex() {
  const gd = getGroupData();
  if (idxFor === gd && idxCache) return idxCache;
  const byCat = new Map();
  for (const [sid, g] of Object.entries(gd.groups)) {
    const id = Number(sid);
    if (!byCat.has(g.cat)) byCat.set(g.cat, []);
    byCat.get(g.cat).push({ id, ko: g.ko || g.en || '', en: g.en || '', search: `${g.ko || ''} ${g.en || ''} ${id}`.toLowerCase() });
  }
  for (const list of byCat.values()) list.sort((a, b) => koCmp(a.ko, b.ko) || a.id - b.id);
  const catName = (c) => gd.categories[c] ?? { ko: `#${c}`, en: `#${c}` };
  const rest = [...byCat.keys()].filter((c) => !OVERVIEW_CATEGORIES.includes(c))
    .sort((a, b) => koCmp(catName(a).ko, catName(b).ko));
  const order = [...OVERVIEW_CATEGORIES.filter((c) => byCat.has(c)), ...rest];
  idxFor = gd;
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
        h('p', {}, '프리셋이 하나도 없습니다.'),
        h('p', { class: 'hint' }, '프리셋은 오버뷰 탭이 어떤 유형(그룹)을 보여줄지 정합니다. 새로 만들어 시작하세요.'),
        h('div', { class: 'toolbar', style: { marginTop: '10px' } },
          h('button', { class: 'btn primary', onclick: async () => { if (await addPreset()) render(root); } }, '새 프리셋'))),
    );
    return;
  }

  // ---------- 선택 상태 ----------
  let selIdx = Math.max(0, model.presets.findIndex((p) => p.name === selName));
  selName = model.presets[selIdx].name;
  const cur = () => model.presets[selIdx];
  const remember = () => { selName = cur().name; lsSet('presets.sel', selName); };

  // ---------- 목록 ----------
  const listEl = h('div', { class: 'list pr-list', role: 'listbox', 'aria-label': '프리셋 목록' });
  const editorHost = h('div', { class: 'pr-editor' });
  let rowEls = [];

  const btnRename = h('button', { class: 'btn', onclick: () => renameCur() }, '이름 변경');
  const btnDup = h('button', { class: 'btn', onclick: () => dupCur() }, '복제');
  const btnDel = h('button', { class: 'btn danger', onclick: () => delCur() }, '삭제');
  const side = h('div', { class: 'card pr-side' },
    h('div', { class: 'toolbar' },
      h('button', { class: 'btn primary', onclick: () => addNew() }, '+ 새 프리셋'),
      btnDup, btnRename, btnDel),
    listEl,
    h('p', { class: 'hint' }, '⋮⋮ 를 끌어 순서를 바꿉니다. 이름을 더블클릭하면 이름 변경.'),
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
      h('span', { class: 'badge pr-cnt', title: '선택된 그룹 수' }, uniqueCount(p.groups)));
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
    np.name = store.uniquePresetName(`${src.name} 복사`);
    model.presets.splice(selIdx + 1, 0, np);
    store.commit('dup-preset');
    selIdx++; remember(); drawList(); renderEditor();
    toast(`'${np.name}' 을(를) 만들었습니다.`, 'ok', 1800);
  }
  async function renameCur() {
    const p = cur();
    const v = await promptDialog('프리셋 이름 변경', p.name, { ok: '변경' });
    if (v === null) return;
    const nn = v.trim();
    if (nn === p.name) return;
    if (!nn) { toast('이름을 비워 둘 수 없습니다.', 'warn'); return; }
    if (model.presets.some((q, i) => i !== selIdx && q.name === nn)) { toast(`'${nn}' 이름의 프리셋이 이미 있습니다.`, 'warn'); return; }
    const used = store.tabsUsingPreset(p.name).length;
    if (!store.renamePreset(selIdx, nn)) { toast('이름을 바꾸지 못했습니다.', 'error'); return; }
    remember(); drawList();
    editorHost.querySelector('.pr-title')?.replaceChildren(nn);
    toast(used ? `이름을 바꿨습니다. (${used}개 탭의 참조도 함께 변경)` : '이름을 바꿨습니다.', 'ok', 2200);
  }
  async function delCur() {
    const p = cur();
    const tabs = store.tabsUsingPreset(p.name);
    let msg = `프리셋 '${p.name}' 을(를) 삭제할까요?`;
    if (tabs.length) {
      msg += `\n\n다음 탭이 이 프리셋을 사용 중입니다:\n` +
        tabs.map(({ t, i }) => ` • 탭 ${i + 1} ${t.name ? `'${t.name.replace(/<[^>]*>/g, '')}'` : ''} (${[t.overview === p.name ? '표시 대상' : null, t.bracket === p.name ? '브래킷' : null].filter(Boolean).join(', ')})`).join('\n') +
        `\n\n삭제하면 이 탭들은 존재하지 않는 프리셋을 가리키게 됩니다. (되돌리기 가능)`;
    }
    if (!(await confirmDialog(msg, { ok: '삭제', danger: true }))) return;
    model.presets.splice(selIdx, 1);
    store.commit('delete-preset');
    if (!model.presets.length) { render(root); return; }
    selIdx = Math.min(selIdx, model.presets.length - 1); remember();
    drawList(); renderEditor();
  }

  // ---------- 오른쪽 편집기 ----------
  function renderEditor() {
    const p = cur();
    const tabBtns = [['groups', '유형 (그룹)'], ['states', '상태 필터']].map(([id, label]) =>
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
    const v = await promptDialog('새 프리셋 이름', store.uniquePresetName('새 프리셋'), { ok: '만들기' });
    if (v === null) return false;
    const nn = v.trim();
    if (!nn) { toast('이름을 비워 둘 수 없습니다.', 'warn'); return false; }
    if (model.presets.some((q) => q.name === nn)) { toast(`'${nn}' 이름의 프리셋이 이미 있습니다.`, 'warn'); return false; }
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
    h('h2', {}, '프리셋 (표시 대상)'),
    h('p', {}, '오버뷰 탭이 보여줄 유형(그룹)과 상태 필터를 정합니다.'));
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
    totalEl.textContent = `총 ${sel.size}개 선택`;
    const counts = new Map();
    let unknown = 0;
    for (const id of sel) {
      const g = gd.groups[id];
      if (!g) { unknown++; continue; }
      counts.set(g.cat, (counts.get(g.cat) || 0) + 1);
    }
    unkNote.textContent = unknown ? `· 알 수 없는 그룹 ${unknown}개 포함` : '';
    chipsEl.replaceChildren(...order.filter((c) => counts.has(c)).map((c) =>
      h('button', { type: 'button', class: 'chip pr-chip', title: `${catName(c).en} — 클릭하면 해당 카테고리로 이동`, dataset: { cat: c } },
        catName(c).ko, h('b', {}, counts.get(c)))));
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
  const emptyEl = h('p', { class: 'muted pr-empty hidden' }, '조건에 맞는 항목이 없습니다.');
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
        h('span', { class: 'pr-ko' }, g.ko),
        g.en && g.en !== g.ko ? h('span', { class: 'pr-en' }, g.en) : null,
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
      const cb = h('input', { type: 'checkbox', dataset: { catcb: c }, 'aria-label': `${nm.ko} 카테고리 전체 선택/해제` });
      const countEl = h('span', { class: 'pr-cat-count' });
      const body = h('div', { class: 'pr-cat-body' });
      const details = h('details', { class: 'pr-cat', dataset: { cat: c } },
        h('summary', { class: 'pr-cat-head' }, cb,
          h('span', { class: 'pr-cat-name' }, nm.ko, nm.en && nm.en !== nm.ko ? h('span', { class: 'pr-en' }, nm.en) : null,
            h('span', { class: 'pr-id mono' }, `#${c}`)),
          countEl),
        body);
      const rec = { id: c, list, cb, countEl, body, details, built: false, auto: false, nameHit: false, nameSearch: `${nm.ko} ${nm.en}`.toLowerCase() };
      if (wasOpen.has(c)) details.open = true;
      cats.set(c, rec);
      return details;
    });
    tree.replaceChildren(...nodes);
    for (const rec of cats.values()) refreshCat(rec);
    catInfo.textContent = prefs.showAll ? `카테고리 ${visible.length}개 (전체)` : `카테고리 ${visible.length}개 / 전체 ${order.length}개`;
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
    statusEl.textContent = filtering ? `${matched}개 그룹 · ${shown}개 카테고리 표시 중` : '';
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
        h('strong', { class: 'warn' }, `알 수 없는 그룹 ${ids.length}개`),
        h('span', { class: 'hint' }, '현재 게임 데이터에 없는(삭제된) 그룹입니다. 남겨 둬도 되지만 보통은 제거해도 무방합니다.'),
        h('button', { type: 'button', class: 'btn small danger', dataset: { rmAll: '' } }, '모두 제거')),
      h('div', { class: 'pr-unk-list' }, ids.map((id) =>
        h('span', { class: 'chip pr-unk' },
          h('span', { class: 'mono' }, `#${id}`), ' (알 수 없음/삭제된 그룹)',
          h('button', { type: 'button', class: 'btn ghost small', 'aria-label': `#${id} 제거`, title: '제거', dataset: { rm: id } }, '✕')))));
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
  const search = h('input', { type: 'search', class: 'input grow pr-search', placeholder: '검색: 한글/영문 이름 또는 ID', 'aria-label': '그룹 검색', value: prefs.q });
  search.addEventListener('input', debounce(() => { prefs.q = search.value; applyFilter(); }, 120));
  const onlySel = h('input', { type: 'checkbox', checked: prefs.onlySel });
  onlySel.addEventListener('change', () => { prefs.onlySel = onlySel.checked; applyFilter(); });
  const showAll = h('input', { type: 'checkbox', checked: prefs.showAll });
  showAll.addEventListener('change', () => { prefs.showAll = showAll.checked; buildTree(); });
  const catInfo = h('span', { class: 'hint' });

  const others = model.presets.map((o, i) => ({ o, i })).filter(({ o }) => o !== p);
  const srcSel = h('select', { 'aria-label': '가져올 프리셋' }, others.map(({ o, i }) => h('option', { value: i }, `${o.name} (${uniqueCount(o.groups)})`)));
  const modeSel = h('select', { 'aria-label': '가져오기 방식' },
    h('option', { value: 'merge' }, '합치기 (합집합)'), h('option', { value: 'intersect' }, '교집합만 남기기'),
    h('option', { value: 'subtract' }, '빼기 (차집합)'), h('option', { value: 'replace' }, '완전히 교체'));
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
      toast(`'${src.name}' ${modeSel.selectedOptions[0].textContent.split(' ')[0]}: ${before}개 → ${next.size}개`, 'ok', 2500);
      rebuild();
    },
  }, '적용');
  const clearBtn = h('button', {
    type: 'button', class: 'btn danger',
    onclick: () => {
      if (!sel.size) return;
      const n = sel.size;
      p.groups = [];
      store.commit('preset-clear');
      onChanged();
      toast(`${n}개 선택을 모두 해제했습니다. (되돌리기 가능)`, 'ok', 2200);
      rebuild();
    },
  }, '전체 해제');

  const el = h('div', { class: 'pr-groups-tab' },
    h('div', { class: 'pr-summary' }, h('div', { class: 'pr-summary-line' }, totalEl, unkNote), chipsEl),
    h('div', { class: 'toolbar' }, search,
      h('label', { class: 'check' }, onlySel, '선택된 것만 보기'),
      h('label', { class: 'check' }, showAll, '모든 카테고리 표시'),
      h('button', { type: 'button', class: 'btn small', onclick: () => { for (const r of cats.values()) if (!r.details.classList.contains('hidden')) { r.details.open = true; fillBody(r); } } }, '모두 펼치기'),
      h('button', { type: 'button', class: 'btn small', onclick: () => { for (const r of cats.values()) { r.details.open = false; r.auto = false; } } }, '모두 접기')),
    h('div', { class: 'toolbar pr-bulk' },
      h('span', { class: 'muted small' }, '다른 프리셋에서 가져오기'), srcSel, modeSel, importBtn,
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
  const OPTS = [['default', '기본'], ['hide', '숨김'], ['show', '항상 표시']];

  const sumEl = h('div', { class: 'pr-summary-line' });
  function updateSummary() {
    const nf = uniqueCount(p.filteredStates), na = uniqueCount(p.alwaysShownStates);
    sumEl.replaceChildren(h('strong', {}, `숨김 ${nf}개`), ' · ', h('strong', {}, `항상 표시 ${na}개`),
      ' ', h('span', { class: 'muted small' }, '(나머지는 기본)'));
  }

  function rowFor(id) {
    const known = STATES[id];
    const row = h('div', { class: 'pr-state', dataset: { sid: id } },
      h('div', { class: 'pr-state-name' },
        known && colorCss(known.color) ? h('span', { class: 'swatch', style: { background: colorCss(known.color) }, title: `기본 색: ${known.color}` }) : null,
        h('div', {},
          h('div', {}, stateName(id), ' ',
            known?.filterOnly ? h('span', { class: 'badge', title: '36/37 은 프리셋 필터에서만 쓰이는 잔해 상태이며 깃발/배경 색상에는 사용할 수 없습니다.' }, '필터 전용 · 잔해 상태') : null,
            h('span', { class: 'pr-conflict warn small hidden' }, ' ⚠ 숨김과 항상 표시에 모두 들어 있음 — 하나를 고르세요')),
          h('div', { class: 'pr-en' }, known ? stateNameEn(id) : '게임 데이터에 없는 상태 (값은 그대로 유지됩니다)', ' · ', h('span', { class: 'mono' }, `#${id}`)))),
      h('div', { class: 'pr-seg', role: 'radiogroup', 'aria-label': `${stateName(id)} 표시 방식` },
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
  for (const [kind, label] of Object.entries(STATE_KINDS)) {
    const ids = ALL_STATE_IDS.filter((id) => STATES[id].kind === kind);
    if (!ids.length) continue;
    wrap.append(h('section', { class: 'pr-kind' }, h('h4', {}, label), ids.map(rowFor)));
  }
  const unk = [...new Set([...p.filteredStates, ...p.alwaysShownStates])].filter((id) => !STATES[id]).sort(numAsc);
  if (unk.length) wrap.append(h('section', { class: 'pr-kind' }, h('h4', {}, '알 수 없는 상태'), unk.map(rowFor)));

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
  const srcSel = h('select', { 'aria-label': '상태 설정을 복사할 프리셋' }, others.map((o) => h('option', { value: model.presets.indexOf(o) }, o.name)));
  const copyBtn = h('button', {
    type: 'button', class: 'btn', disabled: !others.length,
    onclick: () => {
      const src = model.presets[Number(srcSel.value)];
      if (!src) return;
      p.filteredStates = [...src.filteredStates];
      p.alwaysShownStates = [...src.alwaysShownStates];
      store.commit('preset-states-copy');
      toast(`'${src.name}' 의 상태 설정을 복사했습니다.`, 'ok', 2000);
      rebuild();
    },
  }, '상태 설정 복사');
  const resetBtn = h('button', {
    type: 'button', class: 'btn danger',
    onclick: () => {
      if (!p.filteredStates.length && !p.alwaysShownStates.length) return;
      p.filteredStates = []; p.alwaysShownStates = [];
      store.commit('preset-states-reset');
      toast('모든 상태를 기본으로 되돌렸습니다. (되돌리기 가능)', 'ok', 2000);
      rebuild();
    },
  }, '모두 기본으로');

  updateSummary();
  return h('div', { class: 'pr-states-tab' },
    h('p', { class: 'hint pr-explain' },
      h('b', {}, '숨김'), '(filteredStates): 이 상태에 해당하는 대상은 오버뷰에서 숨겨집니다. ',
      h('b', {}, '항상 표시'), '(alwaysShownStates): 그룹 선택과 무관하게 항상 표시됩니다. 한 상태는 둘 중 하나에만 넣을 수 있습니다.'),
    h('div', { class: 'pr-summary' }, sumEl),
    h('div', { class: 'toolbar pr-bulk' },
      h('span', { class: 'muted small' }, '다른 프리셋에서 복사'), srcSel, copyBtn,
      h('span', { class: 'spacer-grow' }), resetBtn),
    wrap);
}
