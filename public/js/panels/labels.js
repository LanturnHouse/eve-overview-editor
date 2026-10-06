// 선박 라벨 패널: 브래킷 옆에 이어 붙는 라벨 조각(순서, 표시 여부, 앞/뒤 마크업)을 편집한다.
import { h, toast, makeSortable, moveItem, gripHandle } from '../ui.js';
import { store } from '../store.js';
import { LABEL_TYPE_IDS, labelTypeName } from '../data.js';
import { t } from '../i18n.js';
import { renderMarkup, recolorPiece, pieceColor } from '../markup.js';
import * as CS from '../color-scheme.js';
import { createMarkupEditor, createMarkupToolbar } from '../markup-editor.js';

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
const EXTRA_BOOL = ['bold', 'italic', 'underline'];
const bgName = (b) => t(`labels.bg.${b.id}`);

export default async function render(root) {
  root.replaceChildren();
  try { await CS.loadBgLuminance(); } catch { /* 읽기 점수 없이도 동작 */ }
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
  /** 샘플 함선 data 로 라벨 문자열을 만든다. colors({조각: RRGGBB}) 를 주면 그 색으로 바꾼 미리보기를 만든다 */
  function labelFor(data, colors = null) {
    let s = '';
    for (const key of m.shipLabelOrder) {
      const a = attrsOf(key);
      if (!a.state) continue;
      let pre = str(a.pre), post = str(a.post);
      if (colors && key !== null && colors[key]) ({ pre, post } = recolorPiece(pre, post, colors[key]));
      const val = key === null ? '' : (data[key] ?? str(key));
      s += pre + (key === null ? '' : decorate(a, val)) + post;
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

  // ---------- 서식 툴바 (마지막으로 포커스한 조각 편집기에 적용) ----------
  const toolbar = createMarkupToolbar({ multiline: true });

  // ---------- 순서 목록 ----------
  const list = h('div', { class: 'lb-list', role: 'list', 'aria-label': t('labels.listAria') });
  const openExtras = new Set();
  let focusAfter = null; // { index, cls }

  /** 조각 하나의 서식 편집기: 입력한 대로 보이는 입력창 + 앞/뒤 태그 입력창 */
  function pieceEditor(key) {
    const a = attrsOf(key);
    return createMarkupEditor({
      mode: 'piece', value: { pre: str(a.pre), post: str(a.post) }, chip: key !== null, multiline: true,
      chipText: key === null ? '' : (SAMPLE[key] ?? labelTypeName(key)), ariaLabel: labelTypeName(key),
      onChange: ({ pre, post }) => {
        const at = ensure(key); at.pre = pre; at.post = post;
        store.commit(`label-markup-${keyId(key)}`);
        updatePreview();
      },
    });
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
    const extras = extrasEditor(key);
    r.append(
      h('div', { class: 'lb-main' },
        grip,
        h('label', { class: 'lb-vis', title: t('labels.visTitle') }, chk),
        h('span', { class: 'lb-name' }, name, key !== null && !LABEL_TYPE_IDS.includes(key) ? h('span', { class: 'badge' }, t('labels.unknown')) : null),
        pieceEditor(key).el,
        h('span', { class: 'lb-acts' },
          h('button', { class: 'btn small lb-up', type: 'button', title: t('labels.up'), 'aria-label': t('labels.upAria', { name }), disabled: i === 0, onclick: () => move(i, i - 1, 'lb-up') }, '▲'),
          h('button', { class: 'btn small lb-down', type: 'button', title: t('labels.down'), 'aria-label': t('labels.downAria', { name }), disabled: i === n - 1, onclick: () => move(i, i + 1, 'lb-down') }, '▼'),
          h('button', { class: 'btn small danger lb-del', type: 'button', title: t('labels.removeTitle'), 'aria-label': t('labels.removeAria', { name }), onclick: () => remove(i) }, '✕'))),
      ...(extras ? [extras] : []));
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

  // ---------- 추천 색 조합: 메인 색 -> 서브 색 자동 추천 ----------
  const PIECE_ORDER = ['ship type', 'pilot name', 'corporation', 'alliance'];
  const STYLE_IDS = CS.SCHEMES;
  const scheme = { piece: 'ship type', hex: 'FFEB3B', style: 'tint', open: false };
  try { Object.assign(scheme, JSON.parse(localStorage.getItem('labels.scheme') || '{}')); } catch { /* 무시 */ }
  const saveScheme = () => { try { localStorage.setItem('labels.scheme', JSON.stringify({ piece: scheme.piece, hex: scheme.hex, style: scheme.style, open: scheme.open })); } catch { /* 무시 */ } };
  const sw = (hex) => h('span', { class: 'swatch', style: { background: hex ? `#${hex}` : 'transparent' } });
  const pct = (x) => Math.round(x * 100);

  function schemeCard() {
    const present = PIECE_ORDER.filter((k) => m.shipLabelOrder.includes(k));
    const box = h('details', { class: 'card lb-scheme', open: scheme.open }, h('summary', {}, t('labels.scheme.title')));
    box.addEventListener('toggle', () => { scheme.open = box.open; saveScheme(); });
    if (present.length < 2) { box.append(h('p', { class: 'muted' }, t('labels.scheme.needPieces'))); return box; }
    if (!present.includes(scheme.piece)) scheme.piece = present[0];
    if (!CS.normHex(scheme.hex)) scheme.hex = 'FFEB3B';

    const out = h('div', { class: 'lb-scheme-out' });
    const pieceSel = h('select', { class: 'input', 'aria-label': t('labels.scheme.mainPiece') }, present.map((k) => h('option', { value: k, selected: k === scheme.piece }, labelTypeName(k))));
    const colorIn = h('input', { type: 'color', value: `#${scheme.hex}`, 'aria-label': t('labels.scheme.mainColor') });
    const hexIn = h('input', { type: 'text', class: 'input mono lb-hex', value: `#${scheme.hex}`, maxlength: 10, spellcheck: 'false', 'aria-label': t('labels.scheme.hexAria') });
    const styleBox = h('div', { class: 'lb-scheme-styles', role: 'radiogroup', 'aria-label': t('labels.scheme.styleLabel') });

    const compute = () => {
      const hex = CS.normHex(scheme.hex) ?? 'FFFFFF';
      const subs = CS.recommend(hex, scheme.style);
      const map = { [scheme.piece]: hex };
      present.filter((k) => k !== scheme.piece).forEach((k, i) => { if (subs[i]) map[k] = subs[i]; });
      return map;
    };
    const readCell = (hex) => {
      const c = CS.coverage(hex);
      if (!c) return h('span', { class: 'muted' }, '–');
      const lvl = c.worst >= 0.7 ? 'good' : c.worst >= 0.5 ? 'mid' : 'low';
      return h('span', { class: `lb-read ${lvl}`, title: t('labels.scheme.readTitle') },
        h('span', { class: 'lb-bar' }, h('span', { style: { width: `${pct(c.avg)}%` } })),
        h('span', { class: 'small' }, t('labels.scheme.readValue', { avg: pct(c.avg), worst: pct(c.worst) })));
    };
    function drawStyles() {
      styleBox.replaceChildren(...STYLE_IDS.map((id) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(scheme.style === id), class: 'lb-scheme-style' + (scheme.style === id ? ' active' : ''),
        onclick: () => { scheme.style = id; saveScheme(); drawStyles(); drawOut(); },
      }, h('b', {}, t(`labels.scheme.style.${id}`)), h('span', { class: 'muted small' }, t(`labels.scheme.style.${id}.desc`)))));
    }
    function drawOut() {
      const map = compute();
      const mainHex = map[scheme.piece];
      const rows = present.map((k) => {
        const a = attrsOf(k), cur = pieceColor(str(a.pre), str(a.post)), nw = map[k];
        return h('tr', {},
          h('td', {}, labelTypeName(k), k === scheme.piece ? h('span', { class: 'badge', style: { marginLeft: '6px' } }, t('labels.scheme.main')) : null),
          h('td', {}, sw(cur), ' ', h('span', { class: 'mono small' }, cur ? `#${cur}` : t('labels.scheme.noColor'))),
          h('td', {}, '→'),
          h('td', {}, sw(nw), ' ', h('code', { class: 'mono small lb-tag', title: t('labels.scheme.tagTitle') }, `<color=0xff${nw}>`)),
          h('td', {}, readCell(nw)));
      });
      const mc = CS.coverage(mainHex);
      const fix = mc && mc.worst < 0.7 ? CS.ensureReadable(mainHex) : null;
      const cells = ['brown', 'blue', 'gold', 'red', 'green'].map((id) => {
        const bg = BACKGROUNDS.find((b) => b.id === id);
        return h('div', { class: 'lb-sc-cell', style: { backgroundImage: `url(${bg.file})` } },
          h('div', { class: 'lb-sc-ship' }, h('span', { class: 'lb-bracket', 'aria-hidden': 'true' }), h('span', { class: 'lb-ship-text', html: renderMarkup(labelFor(SHIPS[1].d, map)) })),
          h('span', { class: 'lb-sc-name' }, bgName(bg)));
      });
      out.replaceChildren(
        mc && fix ? h('p', { class: 'warn lb-scheme-warn' }, t('labels.scheme.lowWarn', { worst: pct(mc.worst) }), ' ',
          fix !== mainHex ? h('button', { type: 'button', class: 'btn small', onclick: () => { scheme.hex = fix; saveScheme(); colorIn.value = `#${fix}`; hexIn.value = `#${fix}`; drawOut(); } }, t('labels.scheme.lighten', { hex: fix })) : null) : null,
        h('table', { class: 'grid lb-scheme-table' },
          h('thead', {}, h('tr', {}, h('th', {}, t('labels.scheme.colPiece')), h('th', {}, t('labels.scheme.colCurrent')), h('th', {}), h('th', {}, t('labels.scheme.colNew')), h('th', {}, t('labels.scheme.colRead')))),
          h('tbody', {}, rows)),
        h('h4', { class: 'lb-scheme-prevhead' }, t('labels.scheme.previewHeading')),
        h('div', { class: 'lb-sc-grid' }, cells),
        h('div', { class: 'toolbar', style: { marginTop: '10px' } },
          h('button', { class: 'btn primary', type: 'button', onclick: () => applyScheme() }, t('labels.scheme.apply'))));
    }
    function applyScheme() {
      let n = 0;
      for (const [key, hex] of Object.entries(compute())) {
        const a = ensure(key), r = recolorPiece(str(a.pre), str(a.post), hex);
        if (r.pre !== str(a.pre) || r.post !== str(a.post)) { a.pre = r.pre; a.post = r.post; n++; }
      }
      if (!n) { toast(t('labels.scheme.nothing'), 'info', 2500); return; }
      store.commit('label-scheme');
      toast(t('labels.scheme.applied', { n }), 'ok', 4500);
      redraw(); updatePreview(); drawOut();
    }

    pieceSel.addEventListener('change', () => {
      scheme.piece = pieceSel.value;
      const cur = pieceColor(str(attrsOf(scheme.piece).pre), str(attrsOf(scheme.piece).post));
      if (cur) { scheme.hex = cur; colorIn.value = `#${cur}`; hexIn.value = `#${cur}`; }
      saveScheme(); drawOut();
    });
    colorIn.addEventListener('input', () => { scheme.hex = CS.normHex(colorIn.value); hexIn.value = `#${scheme.hex}`; hexIn.removeAttribute('aria-invalid'); saveScheme(); drawOut(); });
    hexIn.addEventListener('input', () => {
      const v = CS.normHex(hexIn.value);
      if (!v) { hexIn.setAttribute('aria-invalid', 'true'); return; }
      hexIn.removeAttribute('aria-invalid'); scheme.hex = v; colorIn.value = `#${v}`; saveScheme(); drawOut();
    });
    box.append(
      h('p', { class: 'hint' }, t('labels.scheme.hint')),
      h('div', { class: 'lb-scheme-controls' },
        h('label', { class: 'lb-scheme-field' }, h('span', { class: 'muted small' }, t('labels.scheme.mainPiece')), pieceSel),
        h('label', { class: 'lb-scheme-field' }, h('span', { class: 'muted small' }, t('labels.scheme.mainColor')), h('span', { class: 'lb-scheme-colorrow' }, colorIn, hexIn))),
      h('div', { class: 'muted small' }, t('labels.scheme.styleLabel')), styleBox, out);
    drawStyles(); drawOut();
    return box;
  }
  let recommend = schemeCard();

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
