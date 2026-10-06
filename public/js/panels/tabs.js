// 오버뷰 탭 패널: 탭 이름(마크업), 사용하는 프리셋, 브래킷 필터, 탭 전용 컬럼.
import { h, confirmDialog, toast, makeSortable, moveItem, gripHandle } from '../ui.js';
import { store, clone } from '../store.js';
import { BRACKET_SHOW_ALL } from '../model.js';
import { ALL_COLUMNS, columnName } from '../data.js';
import { renderMarkup, cssToArgb } from '../markup.js';

let selected = 0;
try { selected = parseInt(localStorage.getItem('tabs.selected'), 10) || 0; } catch { /* 저장소 사용 불가 */ }

const MARKUP_TAG = /<\/?(?:color|fontsize|b|i|u|br)(?:=[^>]*)?>/gi;
const plainText = (s) => String(s ?? '').replace(MARKUP_TAG, '');
const nameHtml = (name) => renderMarkup(name) || '<span class="muted">(이름 없음)</span>';

export default async function render(root) {
  root.replaceChildren();
  const m = store.model;
  if (selected >= m.tabs.length) selected = m.tabs.length - 1;
  if (selected < 0) selected = 0;
  let focusAfter = null;

  const bar = h('div', { class: 'preview tb-bar', role: 'tablist', 'aria-label': '탭 바 미리보기' });
  const list = h('div', { class: 'list tb-list', role: 'listbox', 'aria-label': '탭 목록' });
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
      class: 'tb-bar-item' + (i === selected ? ' active' : ''), title: `탭 ${i}`,
      html: nameHtml(t.name), onclick: () => select(i),
    })));
    if (!m.tabs.length) bar.append(h('span', { class: 'muted' }, '(탭 없음)'));
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
    r.append(grip, h('span', { class: 'badge tb-idx', title: '게임에서의 탭 번호' }, i),
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
    m.tabs.push({ bracket: BRACKET_SHOW_ALL, color: null, name: '새 탭', overview: store.presetNames()[0] ?? '', extra: {} });
    store.commit('tab-add');
    select(m.tabs.length - 1);
  } }, '+ 추가');
  btn.dup = h('button', { class: 'btn', type: 'button', onclick: () => {
    const copy = clone(m.tabs[selected]);
    copy.name += ' 복사';
    m.tabs.splice(selected + 1, 0, copy);
    store.commit('tab-duplicate');
    select(selected + 1);
  } }, '복제');
  btn.del = h('button', { class: 'btn danger', type: 'button', onclick: async () => {
    const t = m.tabs[selected];
    if (m.tabs.length <= 1) return;
    if (!(await confirmDialog(`탭 ${selected} "${plainText(t.name)}" 을(를) 삭제할까요?`, { ok: '삭제', danger: true }))) return;
    m.tabs.splice(selected, 1);
    store.commit('tab-delete');
    select(Math.min(selected, m.tabs.length - 1));
  } }, '삭제');
  btn.up = h('button', { class: 'btn', type: 'button', title: '위로', 'aria-label': '선택한 탭을 위로', onclick: () => reorder(selected, selected - 1, 'up') }, '▲');
  btn.down = h('button', { class: 'btn', type: 'button', title: '아래로', 'aria-label': '선택한 탭을 아래로', onclick: () => reorder(selected, selected + 1, 'down') }, '▼');

  // ---------- 오른쪽 편집기 ----------
  function drawEditor() {
    const t = m.tabs[selected];
    if (!t) { editor.replaceChildren(h('p', { class: 'muted' }, '탭이 없습니다. "+ 추가" 로 만드세요.')); return; }
    editor.replaceChildren(nameCard(t), presetCard(t), columnsCard(t), advancedCard(t));
  }

  function nameCard(t) {
    const idx = selected;
    const input = h('input', {
      type: 'text', class: 'input mono tb-name-input', value: t.name, spellcheck: 'false', autocomplete: 'off',
      id: 'tb-name', placeholder: '예: <fontsize=16><color=0xffAAAAAA>G<color=0xffE0E0E0>eneral',
    });
    const prev = h('div', { class: 'preview tb-name-preview', 'aria-live': 'polite', html: nameHtml(t.name) });
    const changed = () => {
      t.name = input.value;
      store.commit(`tab-name-${idx}`);
      prev.innerHTML = nameHtml(t.name);
      drawBar();
      const li = list.children[idx]?.querySelector('.tb-li-name');
      if (li) li.innerHTML = nameHtml(t.name);
    };
    input.addEventListener('input', changed);

    const insert = (text) => {
      const s = input.selectionStart ?? input.value.length;
      input.setRangeText(text, s, s, 'end');
      input.focus();
      changed();
    };
    const mk = (label, fn, title) => h('button', { class: 'btn small', type: 'button', title, onclick: fn }, label);
    const color = h('input', { type: 'color', value: '#ef5350', 'aria-label': '삽입할 색상' });
    const size = h('input', { type: 'number', class: 'input tb-size', value: 16, min: 6, max: 60, 'aria-label': '글자 크기' });
    const c1 = h('input', { type: 'color', value: '#aaaaaa', 'aria-label': '첫 글자 색' });
    const c2 = h('input', { type: 'color', value: '#e0e0e0', 'aria-label': '나머지 글자 색' });
    const sizeVal = () => Math.max(6, parseInt(size.value, 10) || 16);

    const helpers = h('div', { class: 'tb-helpers' },
      h('div', { class: 'tb-help-row' },
        h('span', { class: 'muted small' }, '커서 위치에 삽입'), color,
        mk('색 태그', () => insert(`<color=${cssToArgb(color.value)}>`), '입력창의 커서 위치에 색상 태그 삽입'),
        size, mk('글자 크기 태그', () => insert(`<fontsize=${sizeVal()}>`), '입력창의 커서 위치에 글자 크기 태그 삽입')),
      h('div', { class: 'tb-help-row' },
        h('span', { class: 'muted small' }, '첫 글자만 강조'),
        h('label', { class: 'check small' }, '첫 글자', c1), h('label', { class: 'check small' }, '나머지', c2),
        mk('적용', () => {
          const chars = Array.from(plainText(input.value));
          if (!chars.length) { toast('이름이 비어 있습니다.', 'warn', 2000); return; }
          const [first, ...rest] = chars;
          input.value = `<fontsize=${sizeVal()}><color=${cssToArgb(c1.value)}>${first}` + (rest.length ? `<color=${cssToArgb(c2.value)}>${rest.join('')}` : '');
          changed();
        }, '태그를 지우고 첫 글자에만 색을 입혀 다시 만듭니다'),
        mk('태그 모두 제거', () => { input.value = plainText(input.value); changed(); }, '마크업 태그를 지우고 글자만 남깁니다')));
    return h('section', { class: 'card tb-card' },
      h('h3', {}, `탭 ${idx} 이름`),
      h('div', { class: 'field' }, h('label', { for: 'tb-name' }, '이름 (인게임 마크업 허용)'), input),
      helpers,
      h('div', { class: 'field' }, h('span', { class: 'label' }, '미리보기'), prev));
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
      if (broken) opts.push(h('option', { value: current }, `⚠ ${current || '(비어 있음)'} — 없는 프리셋`));
      sel.replaceChildren(...opts);
      sel.value = current;
      warn.classList.toggle('hidden', !broken);
      warn.textContent = broken ? `프리셋 "${current}" 이(가) 이 파일에 없습니다. 값은 그대로 보존됩니다. 다른 프리셋을 고르면 바뀝니다.` : '';
    };
    fill();
    return { sel, warn, fill, set: (v) => { current = v; } };
  }

  function presetCard(t) {
    const ov = presetSelect('tb-overview', t.overview);
    ov.sel.addEventListener('change', () => { t.overview = ov.sel.value; ov.set(t.overview); store.commit(`tab-overview-${selected}`); ov.fill(); });
    const br = presetSelect('tb-bracket', t.bracket, { value: BRACKET_SHOW_ALL, label: '모든 브래킷 표시' });
    br.sel.addEventListener('change', () => { t.bracket = br.sel.value; br.set(t.bracket); store.commit(`tab-bracket-${selected}`); br.fill(); });
    return h('section', { class: 'card tb-card' },
      h('h3', {}, '표시 규칙'),
      h('div', { class: 'tb-grid' },
        h('div', { class: 'field' }, h('label', { for: 'tb-overview' }, '오버뷰(목록)에 쓸 프리셋'), ov.sel, ov.warn),
        h('div', { class: 'field' }, h('label', { for: 'tb-bracket' }, '우주 공간 브래킷 필터'), br.sel, br.warn)));
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
        body.replaceChildren(h('p', { class: 'hint' }, '전역 설정(컬럼 패널)을 사용합니다.'));
        return;
      }
      const all = items();
      const cols = effCols();
      const colList = h('div', { class: 'tb-col-list', role: 'list', 'aria-label': '이 탭의 컬럼 순서' });
      all.forEach((c, i) => {
        const grip = gripHandle();
        const r = h('div', { class: 'tb-col', dataset: { sortable: '' }, role: 'listitem' });
        grip.addEventListener('mousedown', () => {
          r.draggable = true;
          window.addEventListener('mouseup', () => { r.draggable = false; }, { once: true });
        });
        r.addEventListener('dragend', () => { r.draggable = false; });
        const nm = columnName(c);
        const chk = h('input', { type: 'checkbox', checked: cols.includes(c), 'aria-label': `${nm} 표시`, onchange: () => {
          const cur = t.tabColumns ?? [...m.overviewColumns];
          t.tabColumns = chk.checked ? (cur.includes(c) ? cur : [...cur, c]) : cur.filter((x) => x !== c);
          store.commit(`tab-cols-${selected}`);
        } });
        r.append(grip, h('label', { class: 'check tb-col-name' }, chk, nm, nm !== c ? h('span', { class: 'badge mono' }, c) : null),
          h('span', { class: 'tb-col-acts' },
            h('button', { class: 'btn small', type: 'button', title: '위로', 'aria-label': `${nm} 위로`, disabled: i === 0, onclick: () => moveCol(i, i - 1) }, '▲'),
            h('button', { class: 'btn small', type: 'button', title: '아래로', 'aria-label': `${nm} 아래로`, disabled: i === all.length - 1, onclick: () => moveCol(i, i + 1) }, '▼')));
        colList.append(r);
      });
      makeSortable(colList, (f, to) => moveCol(f, to));
      body.replaceChildren(
        h('p', { class: 'hint' }, '체크한 컬럼만 이 탭에서 보이며, 위에서 아래 순서가 왼쪽에서 오른쪽 순서입니다.'),
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
      h('h3', {}, '컬럼'),
      h('label', { class: 'check', for: 'tb-colov' }, toggle, '이 탭만 따로 설정'),
      body);
  }

  function advancedCard(t) {
    const extraKeys = Object.keys(t.extra || {});
    return h('details', { class: 'card tb-card tb-adv' },
      h('summary', {}, '고급 정보 (읽기 전용, 저장 시 그대로 보존)'),
      h('dl', { class: 'tb-dl' },
        h('dt', {}, 'color'), h('dd', { class: 'mono' }, JSON.stringify(t.color ?? null)),
        h('dt', {}, '탭 번호'), h('dd', { class: 'mono' }, `${selected} (저장 시 목록 위치로 자동 부여)`),
        extraKeys.length ? [h('dt', {}, '기타 속성'), h('dd', { class: 'mono' }, JSON.stringify(t.extra))] : null));
  }

  root.append(
    h('div', { class: 'panel-head' }, h('h2', {}, '오버뷰 탭'),
      h('p', {}, '게임 오버뷰 창 위쪽의 탭을 설정합니다.')),
    h('div', { class: 'card tb-barcard' },
      h('div', { class: 'tb-barhead muted small' }, '탭 바 미리보기 — 클릭해서 선택'), bar),
    h('div', { class: 'split' },
      h('div', { class: 'card' },
        h('div', { class: 'toolbar' }, btn.add, btn.dup, btn.del, h('span', { class: 'grow' }), btn.up, btn.down),
        list,
        h('p', { class: 'hint' }, '번호는 목록 위치입니다. 순서를 바꾸면 저장할 때 번호가 자동으로 다시 매겨집니다.')),
      editor));
  drawBar(); drawList(); drawEditor();
}
