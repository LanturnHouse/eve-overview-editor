// 선박 라벨 패널: 브래킷 옆에 이어 붙는 라벨 조각(순서, 표시 여부, 앞/뒤 마크업)을 편집한다.
import { h, toast, makeSortable, moveItem, gripHandle } from '../ui.js';
import { store } from '../store.js';
import { LABEL_TYPE_IDS, labelTypeName } from '../data.js';
import { t } from '../i18n.js';
import { renderMarkup, cssToArgb } from '../markup.js';

const SAMPLE = {
  'pilot name': 'Capsuleer Joe', 'ship type': 'Loki', 'ship name': 'My Ship', corporation: 'Some Corp',
  alliance: 'Some Alliance', faction: 'Amarr Empire', militia: 'Faction Warfare',
};
// 가독성 확인용 샘플 함선들 (배경의 어두운/밝은 부분 여러 곳에 흩어 놓는다). x,y 는 % 위치
const SHIPS = [
  { x: 4, y: 8, d: SAMPLE },
  { x: 38, y: 40, d: { 'pilot name': 'Kiyoko Mori', 'ship type': 'Sabre', 'ship name': 'Hot Dog', corporation: 'Red Moon Corp', alliance: 'Crimson Tide', faction: 'Minmatar Republic', militia: 'Faction Warfare' } },
  { x: 66, y: 8, d: { 'pilot name': 'Razor Eddie', 'ship type': 'Guardian', 'ship name': 'Medic', corporation: 'Pax Logi', alliance: 'Silent Order', faction: 'Amarr Empire', militia: 'Faction Warfare' } },
  { x: 62, y: 62, d: { 'pilot name': 'Nova Vex', 'ship type': 'Hecate', 'ship name': 'Pew', corporation: 'Nova Group', alliance: 'Star Union', faction: 'Gallente Federation', militia: 'Faction Warfare' } },
  { x: 4, y: 62, d: { 'pilot name': 'Ari', 'ship type': 'Rifter', 'ship name': 'Tiny', corporation: 'Tiny Corp', alliance: 'Little Alliance', faction: 'Minmatar Republic', militia: 'Faction Warfare' } },
];
// 리전 배경 (해상도가 제각각이라 cover 로 맞춘다)
const BACKGROUNDS = [
  { id: 'brown', file: 'img/regions/brown.webp' },
  { id: 'blue', file: 'img/regions/blue.webp' },
  { id: 'gold', file: 'img/regions/gold.webp' },
  { id: 'red', file: 'img/regions/red.webp' },
  { id: 'green', file: 'img/regions/green.png' },
  { id: 'black', file: null },
];
let bgId = 'brown';
try { bgId = localStorage.getItem('labels.bg') || 'brown'; } catch { /* 무시 */ }
// 5개 리전 배경 분석으로 고른 가독성 좋은 글자색 (빨강·진한 주황은 어두운 배경에서 잘 안 읽힘)
const RECOMMENDED = { 'ship type': 'FFEB3B', 'pilot name': 'FFCC80', corporation: 'E0E0E0', alliance: 'FFFFFF' };
const COLOR_TAG = /<color=0x[0-9a-f]{2}([0-9a-f]{6})>/i;
const EXTRA_BOOL = ['bold', 'italic', 'underline'];
const bgName = (b) => t(`labels.bg.${b.id}`);

export default async function render(root) {
  root.replaceChildren();
  const m = store.model;
  const keyId = (k) => (k === null ? '(null)' : String(k));

  const find = (key) => m.shipLabels.find((l) => l.key === key);
  const attrsOf = (key) => find(key)?.attrs ?? { pre: '', post: '', state: 1, type: key };
  /** 편집 시점에만 shipLabels 에 항목을 만든다 (보기만 할 때는 모델을 건드리지 않음). */
  const ensure = (key) => {
    let l = find(key);
    if (!l) { l = { key, attrs: { post: '', pre: '', state: 1, type: key } }; m.shipLabels.push(l); }
    return l.attrs;
  };
  const str = (v) => (v === null || v === undefined ? '' : String(v));

  // ---------- 미리보기 ----------
  const preview = h('div', { class: 'preview lb-preview lb-stage', 'aria-label': t('labels.previewAria') });
  const applyBg = () => {
    const bg = BACKGROUNDS.find((b) => b.id === bgId) ?? BACKGROUNDS[0];
    preview.style.backgroundImage = bg.file ? `url(${bg.file})` : 'none';
    preview.style.backgroundColor = '#05070a';
  };
  const bgPicker = h('div', { class: 'lb-bgs', role: 'radiogroup', 'aria-label': t('labels.bgAria') });
  function drawBgPicker() {
    bgPicker.replaceChildren(...BACKGROUNDS.map((b) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': b.id === bgId ? 'true' : 'false', title: bgName(b),
      class: 'lb-bg' + (b.id === bgId ? ' active' : ''),
      onclick: () => { bgId = b.id; try { localStorage.setItem('labels.bg', bgId); } catch { /* 무시 */ } applyBg(); drawBgPicker(); },
    }, h('span', { class: 'lb-bg-thumb', style: b.file ? { backgroundImage: `url(${b.file})` } : { background: '#05070a' } }), h('span', { class: 'small' }, bgName(b)))));
  }
  function decorate(a, val) {
    let open = '', close = '';
    if (typeof a.color === 'string' && a.color) open += `<color=${a.color}>`;
    if (a.fontsize !== null && a.fontsize !== undefined && Number(a.fontsize) > 0) open += `<fontsize=${a.fontsize}>`;
    if (a.bold === true) { open += '<b>'; }
    if (a.italic === true) { open += '<i>'; }
    if (a.underline === true) { open += '<u>'; }
    return open + val + close; // 열린 태그는 renderMarkup 이 끝에서 닫아 준다
  }
  function labelFor(data) {
    let s = '';
    for (const key of m.shipLabelOrder) {
      const a = attrsOf(key);
      if (!a.state) continue;
      const val = key === null ? '' : (data[key] ?? str(key));
      s += str(a.pre) + (key === null ? '' : decorate(a, val)) + str(a.post);
    }
    return s;
  }
  function updatePreview() {
    const parts = SHIPS.map(({ x, y, d }) => {
      const html = renderMarkup(labelFor(d));
      return h('div', { class: 'lb-ship', style: { left: `${x}%`, top: `${y}%` } },
        h('span', { class: 'lb-bracket', 'aria-hidden': 'true' }), h('span', { class: 'lb-ship-text', html }));
    });
    const any = m.shipLabelOrder.some((k) => attrsOf(k).state);
    preview.replaceChildren(...(any ? parts : [h('span', { class: 'muted', style: { padding: '14px' } }, t('labels.previewEmpty'))]));
  }

  // ---------- 마크업 도우미 (포커스됐던 pre/post 입력의 커서 위치에 삽입) ----------
  let last = null; // { el, start, end }
  const remember = (el) => { last = { el, start: el.selectionStart ?? el.value.length, end: el.selectionEnd ?? el.value.length }; };
  function insert(text) {
    if (!last || !last.el.isConnected) { toast(t('labels.needFocus'), 'warn', 2500); return; }
    const { el, start } = last;
    el.setRangeText(text, start, start, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
    const pos = start + text.length;
    el.setSelectionRange(pos, pos);
    remember(el);
  }
  const colorPick = h('input', { type: 'color', value: '#ff8800', 'aria-label': t('labels.colorPickAria'), title: t('labels.colorPickAria') });
  const sizePick = h('input', { type: 'number', class: 'input lb-size', value: 14, min: 6, max: 60, 'aria-label': t('labels.fontsize'), title: t('labels.fontsize') });
  const tool = (label, text, title) => h('button', {
    class: 'btn small mono', type: 'button', title: title || t('labels.insertTitle', { text }),
    onmousedown: (e) => e.preventDefault(), onclick: () => insert(typeof text === 'function' ? text() : text),
  }, label);
  const toolbar = h('div', { class: 'lb-tools', role: 'group', 'aria-label': t('labels.toolsAria') },
    h('span', { class: 'muted small' }, t('labels.insertLabel')),
    colorPick, tool(t('labels.colorBtn'), () => `<color=${cssToArgb(colorPick.value)}>`, t('labels.colorBtnTitle')),
    tool('</color>', '</color>'),
    sizePick, tool(t('labels.sizeBtn'), () => `<fontsize=${Math.max(6, parseInt(sizePick.value, 10) || 14)}>`, t('labels.sizeBtnTitle')),
    tool('<b>', '<b>'), tool('</b>', '</b>'), tool('<br>', '<br>', t('labels.brTitle')));

  // ---------- 순서 목록 ----------
  const list = h('div', { class: 'lb-list', role: 'list', 'aria-label': t('labels.listAria') });
  const openExtras = new Set();
  let focusAfter = null; // { index, cls }

  function markupInput(key, field, label) {
    const a = attrsOf(key);
    const el = h('input', {
      type: 'text', class: 'input mono lb-markup', value: str(a[field]), spellcheck: 'false', autocomplete: 'off',
      'aria-label': t('labels.fieldAria', { name: labelTypeName(key), field: label }), placeholder: label,
    });
    el.addEventListener('input', () => {
      ensure(key)[field] = el.value;
      store.commit(`label-${field}-${keyId(key)}`);
      updatePreview();
    });
    for (const ev of ['focus', 'blur', 'keyup', 'click', 'select']) el.addEventListener(ev, () => remember(el));
    return el;
  }

  function extrasEditor(key) {
    const a = attrsOf(key);
    const present = ['bold', 'italic', 'underline', 'color', 'fontsize'].filter((k) => k in a);
    if (!present.length) return null;
    const body = h('div', { class: 'lb-extras-body' });
    for (const k of present) {
      if (EXTRA_BOOL.includes(k)) {
        body.append(h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: a[k] === true, onchange: (e) => {
            ensure(key)[k] = e.target.checked; store.commit(`label-${k}-${keyId(key)}`); updatePreview();
          } }), t(`labels.${k}`)));
      } else if (k === 'color') {
        const inp = h('input', { type: 'text', class: 'input mono', value: str(a.color), placeholder: t('labels.nullDefault'), style: { width: '130px' } });
        inp.addEventListener('input', () => {
          const v = inp.value;
          ensure(key).color = v === '' ? null : (typeof a.color === 'number' && /^-?\d+$/.test(v) ? Number(v) : v);
          store.commit(`label-color-${keyId(key)}`); updatePreview();
        });
        body.append(h('label', { class: 'lb-extra-field' }, t('labels.color'), inp));
      } else {
        const inp = h('input', { type: 'number', class: 'input', value: str(a.fontsize), min: 1, placeholder: t('labels.nullDefault'), style: { width: '110px' } });
        inp.addEventListener('input', () => {
          const n = parseInt(inp.value, 10);
          ensure(key).fontsize = inp.value === '' || Number.isNaN(n) ? null : n;
          store.commit(`label-fontsize-${keyId(key)}`); updatePreview();
        });
        body.append(h('label', { class: 'lb-extra-field' }, t('labels.fontsize'), inp));
      }
    }
    const d = h('details', { class: 'lb-extras', open: openExtras.has(key) },
      h('summary', {}, t('labels.extras')), body);
    d.addEventListener('toggle', () => { d.open ? openExtras.add(key) : openExtras.delete(key); });
    return d;
  }

  function row(key, i) {
    const a = attrsOf(key);
    const n = m.shipLabelOrder.length;
    const name = labelTypeName(key);
    const grip = gripHandle();
    const r = h('div', { class: 'lb-row' + (a.state ? '' : ' off'), dataset: { sortable: '', idx: i }, role: 'listitem' });
    // 손잡이를 잡았을 때만 행을 드래그 가능하게 해서 입력칸의 글자 선택을 방해하지 않는다.
    grip.addEventListener('mousedown', () => {
      r.draggable = true;
      window.addEventListener('mouseup', () => { r.draggable = false; }, { once: true });
    });
    r.addEventListener('dragend', () => { r.draggable = false; });

    const chk = h('input', { type: 'checkbox', checked: !!a.state, 'aria-label': t('labels.visAria', { name }) });
    chk.addEventListener('change', () => {
      ensure(key).state = chk.checked ? 1 : 0;
      r.classList.toggle('off', !chk.checked);
      store.commit(`label-state-${keyId(key)}-${i}`);
      updatePreview();
    });
    r.append(
      h('div', { class: 'lb-main' },
        grip,
        h('label', { class: 'lb-vis', title: t('labels.visTitle') }, chk),
        h('span', { class: 'lb-name' }, name, key !== null && !LABEL_TYPE_IDS.includes(key) ? h('span', { class: 'badge' }, t('labels.unknown')) : null),
        markupInput(key, 'pre', t('labels.pre')),
        markupInput(key, 'post', t('labels.post')),
        h('span', { class: 'lb-acts' },
          h('button', { class: 'btn small lb-up', type: 'button', title: t('labels.up'), 'aria-label': t('labels.upAria', { name }), disabled: i === 0, onclick: () => move(i, i - 1, 'lb-up') }, '▲'),
          h('button', { class: 'btn small lb-down', type: 'button', title: t('labels.down'), 'aria-label': t('labels.downAria', { name }), disabled: i === n - 1, onclick: () => move(i, i + 1, 'lb-down') }, '▼'),
          h('button', { class: 'btn small danger lb-del', type: 'button', title: t('labels.removeTitle'), 'aria-label': t('labels.removeAria', { name }), onclick: () => remove(i) }, '✕'))),
      extrasEditor(key));
    return r;
  }

  function move(from, to, cls) {
    if (to < 0 || to >= m.shipLabelOrder.length) return;
    moveItem(m.shipLabelOrder, from, to);
    store.commit('label-order');
    focusAfter = { index: to, cls };
    redraw();
  }
  function remove(i) {
    m.shipLabelOrder.splice(i, 1);
    store.commit('label-remove');
    focusAfter = null;
    redraw();
  }

  makeSortable(list, (from, to) => { moveItem(m.shipLabelOrder, from, to); store.commit('label-order'); redraw(); });

  // ---------- 추가 ----------
  const addSel = h('select', { 'aria-label': t('labels.addAria') });
  const addBtn = h('button', { class: 'btn', type: 'button', onclick: () => {
    if (!addSel.value) return;
    const key = addSel.value === '__null' ? null : addSel.value;
    if (key === null && m.shipLabelOrder.includes(null)) { toast(t('labels.separatorOnce'), 'warn'); return; }
    ensure(key);
    m.shipLabelOrder.push(key);
    store.commit('label-add');
    focusAfter = null;
    redraw();
  } }, t('labels.addBtn'));
  function refreshAdd() {
    const inOrder = new Set(m.shipLabelOrder);
    const kinds = [...new Set([...LABEL_TYPE_IDS, ...m.shipLabels.map((l) => l.key).filter((k) => k !== null)])]
      .filter((k) => !inOrder.has(k));
    const opts = kinds.map((k) => h('option', { value: k }, labelTypeName(k)));
    if (!inOrder.has(null)) opts.push(h('option', { value: '__null' }, t('labels.separatorOpt')));
    if (!opts.length) opts.push(h('option', { value: '' }, t('labels.noneToAdd')));
    addSel.replaceChildren(...opts);
    addSel.disabled = addBtn.disabled = !kinds.length && inOrder.has(null);
  }

  function redraw() {
    list.replaceChildren(...m.shipLabelOrder.map(row));
    if (!m.shipLabelOrder.length) list.append(h('p', { class: 'muted lb-empty' }, t('labels.empty')));
    refreshAdd();
    updatePreview();
    if (focusAfter) {
      const btn = list.children[focusAfter.index]?.querySelector('.' + focusAfter.cls);
      (btn && !btn.disabled ? btn : list.children[focusAfter.index]?.querySelector('.lb-up:not([disabled]), .lb-down:not([disabled])'))?.focus();
      focusAfter = null;
    }
  }

  // ---------- 가독성 추천 색 ----------
  function recommendCard() {
    const rows = Object.entries(RECOMMENDED).map(([key, rec]) => {
      const cur = COLOR_TAG.exec(str(attrsOf(key).pre))?.[1]?.toUpperCase() ?? null;
      const sw = (hex) => h('span', { class: 'swatch', style: { background: hex ? `#${hex}` : 'transparent' } });
      return h('tr', {}, h('td', {}, labelTypeName(key)),
        h('td', {}, sw(cur), ' ', h('span', { class: 'mono small' }, cur ?? t('labels.recNoColor'))),
        h('td', {}, '→'),
        h('td', {}, sw(rec), ' ', h('span', { class: 'mono small' }, rec), cur === rec ? h('span', { class: 'muted small' }, ' ' + t('labels.recApplied')) : null));
    });
    return h('details', { class: 'card' },
      h('summary', {}, t('labels.recTitle')),
      h('p', { class: 'hint' }, t('labels.recHint')),
      h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, h('th', {}, t('labels.recPiece')), h('th', {}, t('labels.recCurrent')), h('th', {}), h('th', {}, t('labels.recRecommended')))), h('tbody', {}, rows)),
      h('div', { class: 'toolbar', style: { marginTop: '10px' } },
        h('button', { class: 'btn primary', onclick: () => {
          let n = 0;
          for (const [key, rec] of Object.entries(RECOMMENDED)) {
            if (!m.shipLabelOrder.includes(key) && !find(key)) continue;
            const a = ensure(key), pre = str(a.pre), tag = `<color=0xff${rec}>`;
            const next = COLOR_TAG.test(pre) ? pre.replace(COLOR_TAG, tag) : pre.replace(/^((?:<fontsize=\d+>)*)/, `$1${tag}`);
            if (next !== pre) { a.pre = next; n++; }
          }
          if (!n) { toast(t('labels.recAllDone'), 'info', 2500); return; }
          store.commit('label-recommended');
          toast(t('labels.recToast', { n }), 'ok', 4500);
          redraw(); recommend.replaceWith(recommend = recommendCard());
        } }, t('labels.recApply'))));
  }
  let recommend = recommendCard();

  root.append(
    h('div', { class: 'panel-head' }, h('h2', {}, t('labels.title')),
      h('p', {}, t('labels.intro'))),
    h('div', { class: 'card' },
      h('h3', {}, t('labels.previewHeading')),
      h('p', { class: 'hint' }, t('labels.previewHint')),
      bgPicker,
      preview),
    recommend,
    h('div', { class: 'card' },
      h('h3', {}, t('labels.orderHeading')),
      h('p', { class: 'hint' }, t('labels.orderHint')),
      toolbar,
      list,
      h('div', { class: 'toolbar lb-add' }, h('label', { class: 'muted small' }, t('labels.addLabel')), addSel, addBtn),
      h('p', { class: 'hint' }, t('labels.keepHint'))));
  applyBg(); drawBgPicker();
  redraw();
}
