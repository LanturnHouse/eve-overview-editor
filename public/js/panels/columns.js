// 컬럼 패널: 오버뷰 컬럼 표시 여부(overviewColumns)와 순서(columnOrder).
import { store } from '../store.js';
import { h, toast, makeSortable, moveItem, gripHandle } from '../ui.js';
import { ALL_COLUMNS, columnName } from '../data.js';
import { t } from '../i18n.js';

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
  const list = h('div', { class: 'co-list', role: 'list', 'aria-label': t('columns.listAria') });
  const preview = h('div', { class: 'preview co-preview', 'aria-label': t('columns.previewAria') });
  const counter = h('span', { class: 'chip' });

  const refreshPreview = () => {
    const all = rowIds();
    const shown = all.filter(isShown);
    counter.textContent = t('columns.counter', { a: shown.length, n: all.length });
    if (!shown.length) {
      preview.replaceChildren(h('p', { class: 'muted' }, t('columns.noneShown')));
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
      h('h2', {}, t('columns.title')),
      h('p', {}, t('columns.intro'))),
    h('div', { class: 'co-layout' },
      h('div', { class: 'card co-main' },
        h('div', { class: 'toolbar' }, counter,
          preset(t('columns.showAll'), t('columns.showAllTitle'), () => {
            store.model.overviewColumns = rowIds();
            store.commit('column-preset'); drawList(); toast(t('columns.showAllToast'), 'ok', 1500);
          }),
          preset(t('columns.minimal'), t('columns.minimalTitle'), () => {
            store.model.overviewColumns = [...MINIMAL];
            store.commit('column-preset'); drawList(); toast(t('columns.minimalToast'), 'ok', 1500);
          }),
          preset(t('columns.resetOrder'), t('columns.resetOrderTitle'), () => {
            const extra = rowIds().filter((c) => !DEFAULT_ORDER.includes(c));
            store.model.columnOrder = [...DEFAULT_ORDER, ...extra];
            store.commit('column-preset'); drawList(); toast(t('columns.resetOrderToast'), 'ok', 1500);
          })),
        h('p', { class: 'hint co-hint' },
          t('columns.hintKeys')),
        list,
        h('p', { class: 'hint co-hint' }, t('columns.hintTabs'))),
      h('div', { class: 'card co-side' },
        h('h3', {}, t('columns.previewHeading')),
        h('p', { class: 'hint' }, t('columns.previewHint')),
        preview)));
  drawList();
}

function columnRow(c, i, total, ctx) {
  const m = store.model;
  const known = ALL_COLUMNS.includes(c);
  const name = columnName(c);

  const show = h('input', {
    type: 'checkbox', checked: isShown(c), 'aria-label': t('columns.showAria', { name }),
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
    h('label', { class: 'check co-show' }, show, h('span', {}, t('columns.show'))),
    h('span', { class: 'co-name' }, name, known ? null : h('span', { class: 'badge warn' }, t('columns.unknown'))),
    h('span', { class: 'co-id mono small muted' }, c),
    h('span', { class: 'co-moves' },
      h('button', { type: 'button', class: 'btn small', dataset: { act: 'up' }, disabled: i === 0, title: t('columns.up'), 'aria-label': t('columns.upAria', { name }), onclick: () => move(-1) }, '▲'),
      h('button', { type: 'button', class: 'btn small', dataset: { act: 'down' }, disabled: i === total - 1, title: t('columns.down'), 'aria-label': t('columns.downAria', { name }), onclick: () => move(1) }, '▼')));
  return row;
}
