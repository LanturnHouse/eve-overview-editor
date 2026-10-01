// 컬럼 패널: 오버뷰 컬럼 표시 여부(overviewColumns)와 순서(columnOrder).
import { store } from '../store.js';
import { h, toast, makeSortable, moveItem, gripHandle } from '../ui.js';
import { ALL_COLUMNS, COLUMNS, columnName } from '../data.js';

const DEFAULT_ORDER = ['ICON', 'DISTANCE', 'NAME', 'TYPE', 'TAG', 'CORPORATION', 'ALLIANCE', 'FACTION', 'MILITIA', 'SIZE',
  'VELOCITY', 'RADIALVELOCITY', 'TRANSVERSALVELOCITY', 'ANGULARVELOCITY'];
const MINIMAL = ['ICON', 'DISTANCE', 'NAME', 'TYPE'];

const SAMPLE = {
  ICON: ['▲', '◆', '●', '■'],
  TAG: ['A1', '', 'B2', ''],
  DISTANCE: ['12.3 km', '48.0 km', '1,250 m', '3.2 AU'],
  NAME: ['Aria Voss', 'Kellan Drex', 'Mira Solenne', 'Toren Halek'],
  TYPE: ['Rifter', 'Merlin', 'Heron', 'Capsule'],
  CORPORATION: ['Sample Corp', 'Free Folk', 'Deep Space', 'Nova Union'],
  ALLIANCE: ['Sample Alliance', '', 'Stellar Pact', ''],
  FACTION: ['Minmatar', '', 'Caldari', ''],
  MILITIA: ['Minmatar Republic', '', '', 'Gallente Federation'],
  SIZE: ['34 m', '29 m', '71 m', '14 m'],
  VELOCITY: ['350 m/s', '0 m/s', '1,020 m/s', '75 m/s'],
  RADIALVELOCITY: ['-12 m/s', '0 m/s', '88 m/s', '-3 m/s'],
  TRANSVERSALVELOCITY: ['210 m/s', '0 m/s', '640 m/s', '22 m/s'],
  ANGULARVELOCITY: ['0.021', '0.000', '0.104', '0.008'],
};

/** 화면에 보일 전체 컬럼 ID: 순서 배열 + 알려진 나머지 + 순서에 없는 알 수 없는 표시 컬럼 */
function rowIds() {
  const m = store.model;
  const ids = [...m.columnOrder];
  for (const c of ALL_COLUMNS) if (!ids.includes(c)) ids.push(c);
  for (const c of m.overviewColumns) if (!ids.includes(c)) ids.push(c);
  return ids;
}
/** 화면에 보이는 순서를 columnOrder 에 편입 (구조 변경 시) */
function normalizeOrder() {
  const full = rowIds();
  const order = store.model.columnOrder;
  if (full.length !== order.length) order.splice(0, order.length, ...full);
}
const isShown = (c) => store.model.overviewColumns.includes(c);

export default async function render(root) {
  root.replaceChildren();
  const list = h('div', { class: 'co-list', role: 'list', 'aria-label': '컬럼 순서 목록' });
  const preview = h('div', { class: 'preview co-preview', 'aria-label': '오버뷰 헤더 미리보기' });
  const counter = h('span', { class: 'chip' });

  const refreshPreview = () => {
    const all = rowIds();
    const shown = all.filter(isShown);
    counter.textContent = `표시 ${shown.length} / 전체 ${all.length}`;
    if (!shown.length) {
      preview.replaceChildren(h('p', { class: 'muted' }, '표시할 컬럼이 없습니다. 왼쪽에서 하나 이상 선택하세요.'));
      return;
    }
    preview.replaceChildren(h('table', { class: 'co-table' },
      h('thead', {}, h('tr', {}, shown.map((c) => h('th', { scope: 'col', class: `co-c-${c}` }, columnName(c))))),
      h('tbody', {}, [0, 1, 2, 3].map((r) =>
        h('tr', {}, shown.map((c) => h('td', { class: `co-c-${c}` }, SAMPLE[c]?.[r] ?? '—')))))));
  };

  const drawList = (focus) => {
    const ids = rowIds();
    list.replaceChildren(...ids.map((c, i) => columnRow(c, i, ids.length, { refreshPreview, drawList })));
    if (focus) {
      const row = list.querySelector(`[data-id="${focus.id}"]`);
      const btn = row?.querySelector(`[data-act="${focus.act}"]:not([disabled])`) ?? row?.querySelector('[data-act]:not([disabled])');
      btn?.focus();
    }
    refreshPreview();
  };

  makeSortable(list, (from, to) => {
    normalizeOrder();
    moveItem(store.model.columnOrder, from, to);
    store.commit('column-order');
    drawList();
  });

  const preset = (label, title, fn) => h('button', { type: 'button', class: 'btn', title, onclick: fn }, label);

  root.append(
    h('div', { class: 'panel-head' },
      h('h2', {}, '컬럼'),
      h('p', {}, '오버뷰 목록에 보일 컬럼과 그 순서를 정합니다.')),
    h('div', { class: 'co-layout' },
      h('div', { class: 'card co-main' },
        h('div', { class: 'toolbar' }, counter,
          preset('전체 표시', '모든 컬럼을 표시합니다.', () => {
            store.model.overviewColumns = rowIds();
            store.commit('column-preset'); drawList(); toast('모든 컬럼을 표시합니다.', 'ok', 1500);
          }),
          preset('최소 (아이콘·거리·이름·종류)', '아이콘, 거리, 이름, 종류만 표시합니다.', () => {
            store.model.overviewColumns = [...MINIMAL];
            store.commit('column-preset'); drawList(); toast('최소 컬럼만 표시합니다.', 'ok', 1500);
          }),
          preset('순서를 기본값으로 초기화', '컬럼 순서를 게임 기본 순서로 되돌립니다. 표시 여부는 유지됩니다.', () => {
            const extra = rowIds().filter((c) => !DEFAULT_ORDER.includes(c));
            store.model.columnOrder = [...DEFAULT_ORDER, ...extra];
            store.commit('column-preset'); drawList(); toast('컬럼 순서를 기본값으로 되돌렸습니다.', 'ok', 1500);
          })),
        h('p', { class: 'hint co-hint' },
          '표시 여부는 체크박스(overviewColumns)가, 순서는 목록의 위치(columnOrder)가 정합니다. 표시 중이어도 순서만 바꿀 수 있고, 체크를 꺼도 순서는 유지됩니다.'),
        list,
        h('p', { class: 'hint co-hint' }, '탭별 컬럼은 \'오버뷰 탭\' 패널에서 설정하세요. 여기 설정은 탭별 설정이 없는 탭의 기본값입니다.')),
      h('div', { class: 'card co-side' },
        h('h3', {}, '오버뷰 헤더 미리보기'),
        h('p', { class: 'hint' }, '표시 중인 컬럼만 정해진 순서로 보입니다. 값은 예시이며 실제 게임 화면과 다를 수 있습니다.'),
        preview)));
  drawList();
}

function columnRow(c, i, total, ctx) {
  const m = store.model;
  const known = c in COLUMNS;
  const name = columnName(c);

  const show = h('input', {
    type: 'checkbox', checked: isShown(c), 'aria-label': `${name} 표시`,
    onchange: () => {
      const arr = m.overviewColumns;
      const at = arr.indexOf(c);
      if (show.checked && at < 0) arr.push(c);
      else if (!show.checked && at >= 0) arr.splice(at, 1);
      row.classList.toggle('inactive', !show.checked);
      store.commit('column-show'); ctx.refreshPreview();
    },
  });
  const move = (dir) => {
    normalizeOrder();
    moveItem(m.columnOrder, i, i + dir);
    store.commit('column-order');
    ctx.drawList({ id: c, act: dir < 0 ? 'up' : 'down' });
  };

  const row = h('div', { class: `co-row${isShown(c) ? '' : ' inactive'}`, role: 'listitem', draggable: 'true', dataset: { sortable: '', id: c } },
    h('span', { class: 'co-num' }, i + 1),
    gripHandle(),
    h('label', { class: 'check co-show' }, show, h('span', {}, '표시')),
    h('span', { class: 'co-name' }, name, known ? null : h('span', { class: 'badge warn' }, '미확인')),
    h('span', { class: 'co-id mono small muted' }, c),
    h('span', { class: 'co-moves' },
      h('button', { type: 'button', class: 'btn small', dataset: { act: 'up' }, disabled: i === 0, title: '위로', 'aria-label': `${name} 위로`, onclick: () => move(-1) }, '▲'),
      h('button', { type: 'button', class: 'btn small', dataset: { act: 'down' }, disabled: i === total - 1, title: '아래로', 'aria-label': `${name} 아래로`, onclick: () => move(1) }, '▼')));
  return row;
}
