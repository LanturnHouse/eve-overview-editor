// 깃발 · 배경 색상 패널: 상태별 우선순위 / 활성 / 색 / 깜빡임.
import { store } from '../store.js';
import { h, makeSortable, moveItem, gripHandle } from '../ui.js';
import { STATES, STATE_KINDS, APPEARANCE_STATE_IDS, stateName, stateNameEn, COLOR_NAMES, COLOR_KO, colorCss } from '../data.js';

const MODES = {
  flag: { label: '깃발', what: '아이콘 우하단의 작은 색 깃발' },
  background: { label: '배경', what: '줄 배경색' },
};
let mode = 'flag'; // 다시 그려져도 서브탭 유지

const orderKey = (p) => `${p}Order`;
const statesKey = (p) => `${p}States`;

/** 화면에 보일 전체 상태 ID (순서 배열 + 아직 순서에 없는 알려진 상태) */
function rowIds(p) {
  const order = store.model[orderKey(p)];
  return [...order, ...APPEARANCE_STATE_IDS.filter((id) => !order.includes(id))];
}
/** 순서 배열에 없던 상태를 화면에 보이는 순서 그대로 편입 */
function normalizeOrder(p) {
  const full = rowIds(p);
  const order = store.model[orderKey(p)];
  if (full.length !== order.length) order.splice(0, order.length, ...full);
}
const isActive = (p, id) => store.model[statesKey(p)].includes(id);
const colorName = (p, id) => store.model.stateColors[`${p}_${id}`] ?? STATES[id]?.color ?? null;
const isBlink = (p, id) => store.model.stateBlinks[`${p}_${id}`] === true;
const cssOf = (name) => (name ? colorCss(name) : null);

const SAMPLE_NAMES = ['Aria Voss', 'Kellan Drex', 'Mira Solenne', 'Toren Halek', 'Vash Orlin', 'Lyra Quill'];

export default async function render(root) {
  root.replaceChildren();
  const body = h('div');
  const tabs = Object.entries(MODES).map(([p, m]) =>
    h('button', {
      type: 'button', role: 'tab', 'data-mode': p,
      onclick: () => { mode = p; drawTabs(); drawBody(); },
    }, m.label));
  const tabBar = h('div', { class: 'subtabs', role: 'tablist', 'aria-label': '깃발 / 배경 선택' }, tabs);
  const drawTabs = () => tabs.forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });

  root.append(
    h('div', { class: 'panel-head' },
      h('h2', {}, '깃발 · 배경 색상'),
      h('p', {}, '오버뷰 각 줄의 상태 깃발(아이콘 우하단에 작게 표시되는 색 표시)과 줄 배경색의 우선순위·색·깜빡임을 정합니다.')),
    tabBar, body);
  drawTabs();

  function drawBody() {
    const p = mode;
    const info = MODES[p];
    const list = h('div', { class: 'ap-list', role: 'list', 'aria-label': `${info.label} 우선순위 목록` });
    const preview = h('div', { class: 'preview ap-preview', 'aria-label': `${info.label} 미리보기` });
    const counter = h('span', { class: 'chip' });

    const refreshPreview = () => {
      const all = rowIds(p);
      const ids = all.filter((id) => isActive(p, id)).slice(0, 6);
      const rows = ids.map((id, i) => previewRow(p, id, `${(i * 7 + 3) % 40}.${(i * 3 + 1) % 10} km`, SAMPLE_NAMES[i % SAMPLE_NAMES.length]));
      rows.push(previewRow(p, null, '84.1 km', '상태 없는 일반 줄'));
      preview.replaceChildren(
        h('div', { class: 'ap-prev-title muted' }, `${info.what} - 활성 상태 중 우선순위 상위 ${ids.length}개`),
        ...rows);
      counter.textContent = `활성 ${all.filter((id) => isActive(p, id)).length} / 전체 ${all.length}`;
    };

    const ctx = { refreshPreview, drawList: null };
    const drawList = (focus) => {
      const ids = rowIds(p);
      list.replaceChildren(...ids.map((id, i) => stateRow(p, id, i, ids.length, ctx)));
      if (focus) {
        const row = list.querySelector(`[data-id="${focus.id}"]`);
        const btn = row?.querySelector(`[data-act="${focus.act}"]:not([disabled])`) ?? row?.querySelector('[data-act]:not([disabled])');
        btn?.focus();
      }
      refreshPreview();
    };
    ctx.drawList = drawList;

    makeSortable(list, (from, to) => {
      normalizeOrder(p);
      moveItem(store.model[orderKey(p)], from, to);
      store.commit(`${p}-order`);
      drawList();
    });

    body.replaceChildren(
      h('div', { class: 'ap-layout' },
        h('div', { class: 'card ap-main' },
          h('div', { class: 'toolbar' }, counter,
            h('span', { class: 'hint ap-hint' }, '우선순위는 위에서 아래로: 맨 위(번호가 작은) 활성 상태 하나의 색이 먼저 적용됩니다. 끌어서 또는 ▲▼ 로 순서를 바꾸세요.')),
          list),
        h('div', { class: 'card ap-side' },
          h('h3', {}, '미리보기'),
          h('p', { class: 'hint' }, '색 이름의 미리보기 색은 근사값입니다. 실제 게임 색과 약간 다를 수 있습니다.'),
          preview)));
    drawList();
  }
  drawBody();
}

function previewRow(p, id, dist, pilot) {
  const blink = id !== null && isBlink(p, id);
  const css = id !== null && isActive(p, id) ? cssOf(colorName(p, id)) : null;
  const isBg = p === 'background';
  return h('div', { class: `ap-prow${blink ? ' blink' : ''}` },
    isBg && css ? h('span', { class: 'ap-prow-bg', style: { background: css } }) : null,
    // 게임에서 깃발은 아이콘의 우하단에 작게 겹쳐 표시된다
    h('span', { class: 'ap-prow-icon' }, '▲',
      !isBg && css ? h('span', { class: 'ap-flagbox', style: { background: css } }) : null),
    h('span', { class: 'ap-prow-dist' }, dist),
    h('span', { class: 'ap-prow-name' }, pilot),
    h('span', { class: 'ap-prow-state' }, id === null ? '' : `${stateName(id)}${blink ? ' · 깜빡임' : ''}`));
}

function stateRow(p, id, i, total, ctx) {
  const m = store.model;
  const key = `${p}_${id}`;
  const st = STATES[id];
  const known = !!st;

  const swatch = h('span', { class: 'swatch', 'aria-hidden': 'true' });
  const active = h('input', {
    type: 'checkbox', checked: isActive(p, id), 'aria-label': `${stateName(id)} 사용`,
    onchange: () => {
      normalizeOrder(p);
      const arr = m[statesKey(p)];
      const at = arr.indexOf(id);
      if (active.checked && at < 0) arr.push(id);
      else if (!active.checked && at >= 0) arr.splice(at, 1);
      sync(); store.commit(`${p}-active`); ctx.refreshPreview();
    },
  });

  // 색 선택
  const cur = m.stateColors[key];
  const defName = st?.color;
  const sel = h('select', {
    class: 'ap-color', 'aria-label': `${stateName(id)} 색`,
    onchange: () => {
      normalizeOrder(p);
      if (sel.value === '') delete m.stateColors[key]; else m.stateColors[key] = sel.value;
      sync(); store.commit(`${p}-color`); ctx.refreshPreview();
    },
  },
  h('option', { value: '' }, `기본값${defName ? ` (${COLOR_KO[defName] ?? defName})` : ''}`),
  ...Object.keys(COLOR_NAMES).map((c) => h('option', { value: c }, `${COLOR_KO[c] ?? c} (${c})`)),
  cur !== undefined && !(cur in COLOR_NAMES) ? h('option', { value: String(cur) }, `${cur} (알 수 없는 색)`) : null);
  sel.value = cur === undefined ? '' : String(cur);

  const blink = h('input', {
    type: 'checkbox', checked: isBlink(p, id), 'aria-label': `${stateName(id)} 깜빡임`,
    onchange: () => {
      normalizeOrder(p);
      if (blink.checked) m.stateBlinks[key] = true; else delete m.stateBlinks[key];
      store.commit(`${p}-blink`); ctx.refreshPreview();
    },
  });

  const move = (dir) => {
    normalizeOrder(p);
    moveItem(m[orderKey(p)], i, i + dir);
    store.commit(`${p}-order`);
    ctx.drawList({ id, act: dir < 0 ? 'up' : 'down' });
  };

  const row = h('div', { class: 'ap-row', role: 'listitem', draggable: 'true', dataset: { sortable: '', id } },
    h('span', { class: 'ap-num' }, i + 1),
    gripHandle(),
    h('label', { class: 'check ap-active', title: '이 상태를 활성화' }, active, h('span', {}, '사용')),
    swatch,
    h('div', { class: 'ap-name' },
      h('div', { class: 'ap-ko' }, stateName(id), known ? null : h('span', { class: 'badge warn' }, '미확인')),
      h('div', { class: 'ap-en muted small' }, known ? stateNameEn(id) : `ID ${id}`)),
    h('span', { class: 'badge ap-kind' }, known ? (STATE_KINDS[st.kind] ?? st.kind) : '?'),
    sel,
    h('label', { class: 'check ap-blink' }, blink, h('span', {}, '깜빡임')),
    h('span', { class: 'ap-moves' },
      h('button', { type: 'button', class: 'btn small', dataset: { act: 'up' }, disabled: i === 0, title: '위로', 'aria-label': `${stateName(id)} 위로`, onclick: () => move(-1) }, '▲'),
      h('button', { type: 'button', class: 'btn small', dataset: { act: 'down' }, disabled: i === total - 1, title: '아래로', 'aria-label': `${stateName(id)} 아래로`, onclick: () => move(1) }, '▼')));

  function sync() {
    const name = colorName(p, id);
    const css = cssOf(name);
    swatch.style.background = css ?? 'transparent';
    swatch.title = `${name ? (COLOR_KO[name] ?? name) : '색 없음'}${css ? ` (${css})` : ''}`;
    row.classList.toggle('inactive', !active.checked);
  }
  sync();
  return row;
}
