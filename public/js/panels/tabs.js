// 오버뷰 탭 패널: 탭 이름(마크업), 사용하는 프리셋, 브래킷 필터, 탭 전용 컬럼.
import { h, confirmDialog, makeSortable, moveItem, gripHandle } from '../ui.js';
import { store, clone } from '../store.js';
import { BRACKET_SHOW_ALL } from '../model.js';
import { ALL_COLUMNS, columnName } from '../data.js';
import { renderMarkup, parseMarkup, plainText as atomsText } from '../markup.js';
import { createMarkupEditor, createMarkupToolbar } from '../markup-editor.js';
import { t as tr } from '../i18n.js';

let selected = 0;
try { selected = parseInt(localStorage.getItem('tabs.selected'), 10) || 0; } catch { /* 저장소 사용 불가 */ }

const plainText = (s) => atomsText(parseMarkup(s));
const nameHtml = (name) => renderMarkup(name) || `<span class="muted">${tr('tabs.unnamed')}</span>`;

export default async function render(root) {
  root.replaceChildren();
  const m = store.model;
  if (selected >= m.tabs.length) selected = m.tabs.length - 1;
  if (selected < 0) selected = 0;
  let focusAfter = null;

  const bar = h('div', { class: 'preview tb-bar', role: 'tablist', 'aria-label': tr('tabs.barAria') });
  const list = h('div', { class: 'list tb-list', role: 'listbox', 'aria-label': tr('tabs.listAria') });
  const editor = h('div', { class: 'tb-editor' });
  const btn = {};

  const select = (i, { focus = false } = {}) => {
    selected = i;
    try { localStorage.setItem('tabs.selected', String(i)); } catch { /* 무시 */ }
    drawBar(); drawList(); drawEditor();
    if (focus) list.children[i]?.focus();
  };

  // ---------- 상단 탭 바 미리보기 ----------
  function drawBar() {
    bar.replaceChildren(...m.tabs.map((t, i) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': i === selected ? 'true' : 'false',
      class: 'tb-bar-item' + (i === selected ? ' active' : ''), title: tr('tabs.barItemTitle', { n: i }),
      html: nameHtml(t.name), onclick: () => select(i),
    })));
    if (!m.tabs.length) bar.append(h('span', { class: 'muted' }, tr('tabs.noTabsBar')));
  }

  // ---------- 왼쪽 목록 ----------
  function listItem(t, i) {
    const grip = gripHandle();
    const r = h('div', {
      class: 'list-item tb-item' + (i === selected ? ' active' : ''), dataset: { sortable: '' },
      role: 'option', 'aria-selected': i === selected ? 'true' : 'false', tabindex: 0,
      onclick: () => select(i),
      onkeydown: (e) => {
        if (e.target !== r) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); }
        else if (e.key === 'ArrowDown' && i < m.tabs.length - 1) { e.preventDefault(); select(i + 1, { focus: true }); }
        else if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); select(i - 1, { focus: true }); }
      },
    });
    grip.addEventListener('mousedown', () => {
      r.draggable = true;
      window.addEventListener('mouseup', () => { r.draggable = false; }, { once: true });
    });
    r.addEventListener('dragend', () => { r.draggable = false; });
    r.append(grip, h('span', { class: 'badge tb-idx', title: tr('tabs.idxTitle') }, i),
      h('span', { class: 'grow tb-li-name', html: nameHtml(t.name) }));
    return r;
  }
  function drawList() {
    list.replaceChildren(...m.tabs.map(listItem));
    const n = m.tabs.length;
    btn.up.disabled = selected <= 0 || !n;
    btn.down.disabled = selected >= n - 1 || !n;
    btn.dup.disabled = !n;
    btn.del.disabled = n <= 1;
    if (focusAfter) { btn[focusAfter]?.disabled ? btn[focusAfter].blur() : btn[focusAfter]?.focus(); focusAfter = null; }
  }
  makeSortable(list, (from, to) => reorder(from, to));

  function reorder(from, to, focusBtn) {
    if (to < 0 || to >= m.tabs.length) return;
    const cur = m.tabs[selected];
    moveItem(m.tabs, from, to);
    selected = m.tabs.indexOf(cur);
    try { localStorage.setItem('tabs.selected', String(selected)); } catch { /* 무시 */ }
    store.commit('tab-order');
    focusAfter = focusBtn || null;
    drawBar(); drawList();
  }

  btn.add = h('button', { class: 'btn', type: 'button', onclick: () => {
    m.tabs.push({ bracket: BRACKET_SHOW_ALL, color: null, name: tr('tabs.newName'), overview: store.presetNames()[0] ?? '', extra: {} });
    store.commit('tab-add');
    select(m.tabs.length - 1);
  } }, tr('tabs.add'));
  btn.dup = h('button', { class: 'btn', type: 'button', onclick: () => {
    const copy = clone(m.tabs[selected]);
    copy.name = tr('tabs.copyName', { name: copy.name });
    m.tabs.splice(selected + 1, 0, copy);
    store.commit('tab-duplicate');
    select(selected + 1);
  } }, tr('tabs.dup'));
  btn.del = h('button', { class: 'btn danger', type: 'button', onclick: async () => {
    const t = m.tabs[selected];
    if (m.tabs.length <= 1) return;
    if (!(await confirmDialog(tr('tabs.confirmDelete', { n: selected, name: plainText(t.name) }), { ok: tr('tabs.del'), danger: true }))) return;
    m.tabs.splice(selected, 1);
    store.commit('tab-delete');
    select(Math.min(selected, m.tabs.length - 1));
  } }, tr('tabs.del'));
  btn.up = h('button', { class: 'btn', type: 'button', title: tr('tabs.up'), 'aria-label': tr('tabs.upAria'), onclick: () => reorder(selected, selected - 1, 'up') }, '▲');
  btn.down = h('button', { class: 'btn', type: 'button', title: tr('tabs.down'), 'aria-label': tr('tabs.downAria'), onclick: () => reorder(selected, selected + 1, 'down') }, '▼');

  // ---------- 오른쪽 편집기 ----------
  function drawEditor() {
    const t = m.tabs[selected];
    if (!t) { editor.replaceChildren(h('p', { class: 'muted' }, tr('tabs.noTabs'))); return; }
    editor.replaceChildren(nameCard(t), presetCard(t), columnsCard(t), advancedCard(t));
  }

  function nameCard(t) {
    const idx = selected;
    // 입력한 대로 서식이 보이는 입력창 + 태그 입력창 (서로 실시간 동기화). 툴바는 마지막으로 포커스한 편집기에 적용된다.
    const ed = createMarkupEditor({
      mode: 'text', value: t.name, ariaLabel: tr('tabs.nameLabel'),
      onChange: (raw) => {
        t.name = raw;
        store.commit(`tab-name-${idx}`);
        drawBar();
        const li = list.children[idx]?.querySelector('.tb-li-name');
        if (li) li.innerHTML = nameHtml(t.name);
      },
    });
    ed.activate();
    return h('section', { class: 'card tb-card' },
      h('h3', {}, tr('tabs.nameTitle', { n: idx })),
      h('div', { class: 'field' }, h('span', { class: 'label' }, tr('tabs.nameLabel')), createMarkupToolbar({ multiline: false }), ed.el));
  }

  /** 프리셋 이름 <select>. 목록에 없는 현재 값은 경고와 함께 보존한다. */
  function presetSelect(id, current, extraFirst) {
    const sel = h('select', { id, class: 'tb-select' });
    const warn = h('p', { class: 'hint warn hidden' });
    const fill = () => {
      const names = store.presetNames();
      const opts = [];
      if (extraFirst) opts.push(h('option', { value: extraFirst.value }, extraFirst.label));
      for (const n of names) opts.push(h('option', { value: n }, n));
      const broken = current !== extraFirst?.value && !names.includes(current);
      if (broken) opts.push(h('option', { value: current }, tr('tabs.ruleMissingOpt', { name: current || tr('tabs.ruleEmpty') })));
      sel.replaceChildren(...opts);
      sel.value = current;
      warn.classList.toggle('hidden', !broken);
      warn.textContent = broken ? tr('tabs.ruleMissingWarn', { name: current }) : '';
    };
    fill();
    return { sel, warn, fill, set: (v) => { current = v; } };
  }

  function presetCard(t) {
    const ov = presetSelect('tb-overview', t.overview);
    ov.sel.addEventListener('change', () => { t.overview = ov.sel.value; ov.set(t.overview); store.commit(`tab-overview-${selected}`); ov.fill(); });
    const br = presetSelect('tb-bracket', t.bracket, { value: BRACKET_SHOW_ALL, label: tr('tabs.ruleShowAll') });
    br.sel.addEventListener('change', () => { t.bracket = br.sel.value; br.set(t.bracket); store.commit(`tab-bracket-${selected}`); br.fill(); });
    return h('section', { class: 'card tb-card' },
      h('h3', {}, tr('tabs.ruleTitle')),
      h('div', { class: 'tb-grid' },
        h('div', { class: 'field' }, h('label', { for: 'tb-overview' }, tr('tabs.ruleOverview')), ov.sel, ov.warn),
        h('div', { class: 'field' }, h('label', { for: 'tb-bracket' }, tr('tabs.ruleBracket')), br.sel, br.warn)));
  }

  function columnsCard(t) {
    const body = h('div', { class: 'tb-cols-body' });
    const hasOverride = () => t.tabColumns !== undefined || t.tabColumnOrder !== undefined;
    const toggle = h('input', { type: 'checkbox', id: 'tb-colov', checked: hasOverride(), onchange: () => {
      if (toggle.checked) { t.tabColumns = [...m.overviewColumns]; t.tabColumnOrder = [...m.columnOrder]; }
      else { delete t.tabColumns; delete t.tabColumnOrder; }
      store.commit(`tab-cols-toggle-${selected}`);
      drawCols();
    } });
    const effOrder = () => t.tabColumnOrder ?? m.columnOrder;
    const effCols = () => t.tabColumns ?? m.overviewColumns;
    const items = () => {
      const out = [...effOrder()];
      for (const c of [...ALL_COLUMNS, ...effCols()]) if (!out.includes(c)) out.push(c);
      return out;
    };

    function drawCols() {
      if (!hasOverride()) {
        body.replaceChildren(h('p', { class: 'hint' }, tr('tabs.colsGlobal')));
        return;
      }
      const all = items();
      const cols = effCols();
      const colList = h('div', { class: 'tb-col-list', role: 'list', 'aria-label': tr('tabs.colsListAria') });
      all.forEach((c, i) => {
        const grip = gripHandle();
        const r = h('div', { class: 'tb-col', dataset: { sortable: '' }, role: 'listitem' });
        grip.addEventListener('mousedown', () => {
          r.draggable = true;
          window.addEventListener('mouseup', () => { r.draggable = false; }, { once: true });
        });
        r.addEventListener('dragend', () => { r.draggable = false; });
        const nm = columnName(c);
        const chk = h('input', { type: 'checkbox', checked: cols.includes(c), 'aria-label': tr('tabs.colShow', { name: nm }), onchange: () => {
          const cur = t.tabColumns ?? [...m.overviewColumns];
          t.tabColumns = chk.checked ? (cur.includes(c) ? cur : [...cur, c]) : cur.filter((x) => x !== c);
          store.commit(`tab-cols-${selected}`);
        } });
        r.append(grip, h('label', { class: 'check tb-col-name' }, chk, nm, nm !== c ? h('span', { class: 'badge mono' }, c) : null),
          h('span', { class: 'tb-col-acts' },
            h('button', { class: 'btn small', type: 'button', title: tr('tabs.up'), 'aria-label': tr('tabs.colUp', { name: nm }), disabled: i === 0, onclick: () => moveCol(i, i - 1) }, '▲'),
            h('button', { class: 'btn small', type: 'button', title: tr('tabs.down'), 'aria-label': tr('tabs.colDown', { name: nm }), disabled: i === all.length - 1, onclick: () => moveCol(i, i + 1) }, '▼')));
        colList.append(r);
      });
      makeSortable(colList, (f, to) => moveCol(f, to));
      body.replaceChildren(
        h('p', { class: 'hint' }, tr('tabs.colsHint')),
        colList);
    }
    function moveCol(from, to) {
      if (to < 0) return;
      const all = items();
      if (to >= all.length) return;
      moveItem(all, from, to);
      t.tabColumnOrder = all;
      store.commit(`tab-colorder-${selected}`);
      drawCols();
    }
    drawCols();
    return h('section', { class: 'card tb-card' },
      h('h3', {}, tr('tabs.colsTitle')),
      h('label', { class: 'check', for: 'tb-colov' }, toggle, tr('tabs.colsOverride')),
      body);
  }

  function advancedCard(t) {
    const extraKeys = Object.keys(t.extra || {});
    return h('details', { class: 'card tb-card tb-adv' },
      h('summary', {}, tr('tabs.advSummary')),
      h('dl', { class: 'tb-dl' },
        h('dt', {}, 'color'), h('dd', { class: 'mono' }, JSON.stringify(t.color ?? null)),
        h('dt', {}, tr('tabs.advTabNo')), h('dd', { class: 'mono' }, tr('tabs.advTabNoVal', { n: selected })),
        extraKeys.length ? [h('dt', {}, tr('tabs.advExtra')), h('dd', { class: 'mono' }, JSON.stringify(t.extra))] : null));
  }

  root.append(
    h('div', { class: 'panel-head' }, h('h2', {}, tr('tabs.title')),
      h('p', {}, tr('tabs.subtitle'))),
    h('div', { class: 'card tb-barcard' },
      h('div', { class: 'tb-barhead muted small' }, tr('tabs.barHead')), bar),
    h('div', { class: 'split' },
      h('div', { class: 'card' },
        h('div', { class: 'toolbar' }, btn.add, btn.dup, btn.del, h('span', { class: 'grow' }), btn.up, btn.down),
        list,
        h('p', { class: 'hint' }, tr('tabs.listHint'))),
      editor));
  drawBar(); drawList(); drawEditor();
}
