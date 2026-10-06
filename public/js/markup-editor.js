// 서식 입력 칸: "입력한 대로 디자인이 보이는 입력창" + "게임 태그를 직접 쓰는 입력창" 2개가 서로 실시간 동기화된다.
// 탭 이름(한 줄 텍스트)과 선박 라벨 조각(앞 + 값 자리 + 뒤)에 같이 쓴다. 변환 규칙은 markup.js 참고.
//
//   const ed = createMarkupEditor({ mode: 'text', value: '<b>MAIN', onChange: (raw) => ... });
//   const ed = createMarkupEditor({ mode: 'piece', value: { pre, post }, chipText: 'Loki', multiline: true, onChange: ({ pre, post }) => ... });
//   toolbar = createMarkupToolbar({ multiline })    // 마지막으로 포커스한 편집기에 서식을 적용한다
//
// 설계 메모
//  - 화면(contenteditable)은 입력 중에는 절대 다시 그리지 않는다 (한글/일본어/중국어 IME 조합이 깨지지 않도록).
//    다시 그리는 것은 툴바 명령, 태그 입력칸 편집, 외부 setValue 때뿐이다.
//  - 모델은 원자(atom) 배열이고, 선택 영역은 "원자 위치(코드포인트 단위)" 로 저장해서 다시 그린 뒤에도 복원한다.
//  - 선택이 없으면(커서만 있으면) 서식은 전체 텍스트에 적용된다.
import { h, toast } from './ui.js';
import { t } from './i18n.js';
import * as MK from './markup.js';
import { symbolPicker } from './panels/symbol-picker.js';

// ------------------------------------------------------------------ 전역 상태 (툴바 <-> 편집기)
const registry = new Set();
let active = null;
const stateListeners = new Set();
const notify = () => stateListeners.forEach((fn) => { try { fn(); } catch { /* 무시 */ } });

const RAW_KEY = 'markup.showRaw';
const readShowRaw = () => { try { return localStorage.getItem(RAW_KEY) !== '0'; } catch { return true; } };
document.documentElement.dataset.mkRaw = readShowRaw() ? 'on' : 'off';

// ------------------------------------------------------------------ DOM <-> 원자
const isAtomic = (el) => el.hasAttribute('data-chip') || el.hasAttribute('data-raw') || (el.tagName === 'BR' && el.hasAttribute('data-br'));

function styleData(el) {
  return { color: el.dataset.color || null, size: el.dataset.size ? Number(el.dataset.size) : null, b: el.dataset.b === '1', i: el.dataset.i === '1', u: el.dataset.u === '1' };
}
function setStyleData(el, s) {
  if (s.color != null) el.dataset.color = s.color;
  if (s.size != null) el.dataset.size = String(s.size);
  if (s.b) el.dataset.b = '1';
  if (s.i) el.dataset.i = '1';
  if (s.u) el.dataset.u = '1';
  const css = MK.styleCss(s);
  if (css) el.style.cssText = css;
}

function domToAtoms(root) {
  const out = [];
  const walk = (node, style) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        for (const ch of child.nodeValue) out.push({ t: 'c', ch: ch === ' ' ? ' ' : ch, s: style });
      } else if (child.nodeType === 1) {
        if (child.hasAttribute('data-chip')) out.push({ t: 'chip', s: styleData(child) });
        else if (child.hasAttribute('data-raw')) {
          const a = { t: 'raw', raw: child.dataset.raw, s: styleData(child) };
          if (child.dataset.stray) a.stray = true;
          out.push(a);
        } else if (child.tagName === 'BR') { if (child.hasAttribute('data-br')) out.push({ t: 'br', s: style }); }
        else walk(child, child.classList.contains('mk-run') ? styleData(child) : style);
      }
    }
  };
  walk(root, MK.NONE);
  return out;
}

function atomsToDom(atoms, root, chipText) {
  const segs = [];
  for (const a of atoms) {
    const last = segs[segs.length - 1];
    if (a.t === 'c' && last && last.k === 'text' && MK.sameStyle(last.s, a.s)) last.text += a.ch;
    else segs.push(a.t === 'c' ? { k: 'text', s: a.s, text: a.ch } : { k: a.t, s: a.s, a });
  }
  const nodes = [];
  const run = (s) => { const el = h('span', { class: 'mk-run' }); setStyleData(el, s); return el; };
  for (const g of segs) {
    if (g.k === 'text') { const el = run(g.s); el.textContent = g.text; nodes.push(el); }
    else if (g.k === 'br') { const el = run(g.s); el.append(h('br', { 'data-br': '' })); nodes.push(el); }
    else if (g.k === 'chip') { const el = h('span', { class: 'mk-chip', contenteditable: 'false', 'data-chip': '', title: t('editor.chipTitle') }, chipText); setStyleData(el, g.s); nodes.push(el); }
    else {
      const el = h('span', { class: `mk-tag${g.a.stray ? ' stray' : ''}`, contenteditable: 'false', title: t('editor.tagTitle') }, g.a.raw);
      el.dataset.raw = g.a.raw;
      if (g.a.stray) el.dataset.stray = '1';
      nodes.push(el);
    }
  }
  root.replaceChildren(...nodes);
}

// ------------------------------------------------------------------ 선택 영역 <-> 원자 위치
function countAtoms(n) {
  if (n.nodeType === 3) return Array.from(n.nodeValue).length;
  if (n.nodeType === 11) return [...n.childNodes].reduce((s, c) => s + countAtoms(c), 0);
  if (n.nodeType !== 1) return 0;
  if (n.hasAttribute('data-chip') || n.hasAttribute('data-raw')) return 1;
  if (n.tagName === 'BR') return n.hasAttribute('data-br') ? 1 : 0;
  return [...n.childNodes].reduce((s, c) => s + countAtoms(c), 0);
}
function boundaryOffset(root, node, offset) {
  const r = document.createRange();
  r.setStart(root, 0);
  try { r.setEnd(node, offset); } catch { return null; }
  return countAtoms(r.cloneContents());
}
/** 문서 선택이 root 안에 있으면 {start, end} (원자 위치), 아니면 null */
function readSelection(root) {
  const sel = document.getSelection();
  if (!sel || !sel.rangeCount || !sel.anchorNode || !sel.focusNode) return null;
  if (!root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return null;
  const a = boundaryOffset(root, sel.anchorNode, sel.anchorOffset), b = boundaryOffset(root, sel.focusNode, sel.focusOffset);
  if (a === null || b === null) return null;
  return { start: Math.min(a, b), end: Math.max(a, b) };
}
function locate(root, pos) {
  let acc = 0;
  const walk = (node) => {
    const kids = [...node.childNodes];
    for (let idx = 0; idx < kids.length; idx++) {
      const c = kids[idx];
      if (c.nodeType === 3) {
        const cps = Array.from(c.nodeValue);
        if (pos <= acc + cps.length) return [c, cps.slice(0, pos - acc).join('').length];
        acc += cps.length;
      } else if (c.nodeType === 1) {
        if (isAtomic(c)) {
          if (pos === acc) return [node, idx];
          acc += 1;
          if (pos === acc) return [node, idx + 1];
        } else { const r = walk(c); if (r) return r; }
      }
    }
    return null;
  };
  return walk(root) ?? [root, root.childNodes.length];
}
function writeSelection(root, start, end) {
  const sel = document.getSelection();
  if (!sel) return;
  const [n1, o1] = locate(root, start), [n2, o2] = locate(root, end);
  const r = document.createRange();
  r.setStart(n1, o1); r.setEnd(n2, o2);
  sel.removeAllRanges(); sel.addRange(r);
}

document.addEventListener('selectionchange', () => {
  if (!active || !active.visual.isConnected) return;
  const s = readSelection(active.visual);
  if (s) { active.sel = s; notify(); }
});

// ------------------------------------------------------------------ 편집기
/**
 * @param {object} o
 * @param {'text'|'piece'} o.mode  text: 문자열 하나 / piece: { pre, post } + 가운데 값 자리(chip)
 * @param {string|{pre:string,post:string}} o.value
 * @param {string} [o.chipText]    값 자리에 보여줄 예시 값 (piece)
 * @param {boolean} [o.chip=true]  piece 에서 값 자리를 둘지 (구분자 조각은 false)
 * @param {boolean} [o.multiline]  줄바꿈 허용
 * @param {(v:string|{pre:string,post:string})=>void} o.onChange
 * @param {string} [o.ariaLabel]
 */
export function createMarkupEditor(o) {
  const piece = o.mode === 'piece';
  const hasChip = piece && o.chip !== false;
  const chipText = o.chipText ?? '●●●';
  const multiline = !!o.multiline;

  let atoms = [];
  let leaks = false;       // 조각 끝에 열린 태그가 남아 다음 조각으로 서식이 이어지는가 (원본 보존용)
  let composing = false;
  let lastFocus = 'visual'; // 'visual' | 'pre' | 'post' | 'raw'

  const visual = h('div', {
    class: 'mk-visual', contenteditable: 'true', role: 'textbox', 'aria-multiline': String(multiline), spellcheck: 'false',
    'aria-label': o.ariaLabel || t('editor.visualAria'), 'data-placeholder': t('editor.placeholder'),
  });
  const mkRaw = (cls, aria) => h('input', { type: 'text', class: `input mono mk-raw ${cls}`, spellcheck: 'false', autocomplete: 'off', 'aria-label': aria });
  const rawText = piece ? null : mkRaw('mk-raw-text', o.ariaLabel ? `${o.ariaLabel} - ${t('editor.rawAria')}` : t('editor.rawAria'));
  const rawPre = piece ? mkRaw('mk-raw-pre', `${o.ariaLabel || ''} ${t('editor.rawPre')}`.trim()) : null;
  const rawPost = piece ? mkRaw('mk-raw-post', `${o.ariaLabel || ''} ${t('editor.rawPost')}`.trim()) : null;
  const rawRow = h('div', { class: 'mk-rawrow' },
    h('span', { class: 'mk-rawlabel', title: t('editor.rawAria') }, t('editor.rawLabel')),
    piece
      ? [h('label', { class: 'mk-rawpair' }, h('span', { class: 'mk-rawcap' }, t('editor.rawPre')), rawPre), h('label', { class: 'mk-rawpair' }, h('span', { class: 'mk-rawcap' }, t('editor.rawPost')), rawPost)]
      : rawText);
  const el = h('div', { class: 'mk-field' }, visual, rawRow);

  const api = { el, visual, sel: null, piece, multiline, get leaks() { return leaks; } };

  // ---- 모델 <-> 화면/태그칸 ----
  const rawValue = () => (piece ? { pre: rawPre.value, post: rawPost.value } : rawText.value);
  function parseRaw() {
    if (piece) {
      const r = MK.parsePiece(rawPre.value, rawPost.value, { chip: hasChip });
      atoms = r.atoms; leaks = r.leaks;
    } else { atoms = MK.parseMarkup(rawText.value); leaks = false; }
  }
  function writeRaw() {
    if (piece) {
      if (hasChip) {
        if (!atoms.some((a) => a.t === 'chip')) atoms = [...atoms, { t: 'chip', s: MK.NONE }]; // 값 자리는 항상 하나 있어야 한다
        const r = MK.serializeAtoms(atoms, { splitAtChip: true, closeAtEnd: !leaks });
        rawPre.value = r.pre; rawPost.value = r.post;
      } else { rawPre.value = MK.serializeAtoms(atoms, { closeAtEnd: !leaks }); rawPost.value = ''; }
    } else rawText.value = MK.serializeAtoms(atoms, { closeAtEnd: false });
  }
  const renderVisual = () => atomsToDom(atoms, visual, chipText);
  const emit = () => o.onChange(rawValue());
  function syncFromDom() { atoms = domToAtoms(visual); }

  function setValue(v) {
    if (piece) { rawPre.value = v?.pre ?? ''; rawPost.value = v?.post ?? ''; } else rawText.value = v ?? '';
    parseRaw(); renderVisual();
  }

  // 현재 적용 범위: 선택이 있으면 그 범위, 없으면 전체
  function range() {
    const s = readSelection(visual) ?? api.sel;
    if (s && s.start !== s.end) return { a: Math.min(s.start, s.end), b: Math.max(s.start, s.end), whole: false };
    return { a: 0, b: atoms.length, whole: true };
  }
  function commitAtoms(next, caret) {
    atoms = next;
    writeRaw(); renderVisual();
    if (caret) { api.sel = caret; writeSelection(visual, caret.start, caret.end); }
    emit(); notify();
  }

  // ---- 명령 (툴바) ----
  api.apply = (patch) => {
    syncFromDom();
    const { a, b, whole } = range();
    const keep = api.sel && !whole ? { start: a, end: b } : api.sel;
    commitAtoms(MK.applyStyle(atoms, a, b, patch), keep ?? null);
  };
  api.clear = () => {
    syncFromDom();
    const { a, b, whole } = range();
    commitAtoms(MK.clearStyle(atoms, a, b), whole ? null : { start: a, end: b });
  };
  function insertAtSelection(text, brAfter = false) {
    syncFromDom();
    const s = readSelection(visual) ?? api.sel ?? { start: atoms.length, end: atoms.length };
    let next = MK.replaceRange(atoms, s.start, s.end, text);
    let pos = s.start + Array.from(text).length;
    if (brAfter) { next = MK.insertBreak(next, pos, pos); pos += 1; }
    commitAtoms(next, { start: pos, end: pos });
  }
  api.insertText = (text) => {
    if (lastFocus !== 'visual') { // 태그 입력칸에 포커스가 있었다면 거기에 그대로 넣는다
      const inp = lastFocus === 'post' ? rawPost : lastFocus === 'pre' ? rawPre : rawText ?? rawPre;
      const at = inp.selectionStart ?? inp.value.length;
      inp.setRangeText(text, at, inp.selectionEnd ?? at, 'end');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.focus();
      return;
    }
    insertAtSelection(text);
    visual.focus();
  };
  api.insertBreak = () => {
    if (!multiline) return;
    if (lastFocus !== 'visual') { api.insertText('<br>'); return; }
    syncFromDom();
    const s = readSelection(visual) ?? api.sel ?? { start: atoms.length, end: atoms.length };
    const next = MK.insertBreak(MK.replaceRange(atoms, s.start, s.end, ''), s.start, s.start);
    commitAtoms(next, { start: s.start + 1, end: s.start + 1 });
    visual.focus();
  };
  api.query = () => { const { a, b } = range(); return MK.commonStyle(atoms, a, b); };
  api.focus = () => visual.focus();
  api.setValue = setValue;
  api.activate = () => { active = api; notify(); };

  // ---- 화면 입력 이벤트 ----
  function onVisualInput() {
    syncFromDom();
    if (hasChip && !atoms.some((a) => a.t === 'chip')) { // 값 자리를 지웠다면 되살린다
      const s = readSelection(visual) ?? { start: atoms.length, end: atoms.length };
      atoms = [...atoms, { t: 'chip', s: MK.NONE }];
      writeRaw(); renderVisual(); writeSelection(visual, s.start, s.end); emit(); return;
    }
    writeRaw(); emit();
  }
  visual.addEventListener('input', () => { if (!composing) onVisualInput(); });
  visual.addEventListener('compositionstart', () => { composing = true; });
  visual.addEventListener('compositionend', () => { composing = false; onVisualInput(); });
  visual.addEventListener('beforeinput', (e) => {
    const type = e.inputType;
    if (type === 'insertParagraph' || type === 'insertLineBreak') { e.preventDefault(); if (multiline) api.insertBreak(); return; }
    if (type === 'historyUndo' || type === 'historyRedo' || type === 'insertFromDrop') e.preventDefault(); // 되돌리기는 앱 전체 기록이 담당
  });
  visual.addEventListener('paste', (e) => {
    e.preventDefault();
    let text = (e.clipboardData || window.clipboardData)?.getData('text/plain') ?? '';
    text = text.replace(/\r\n?/g, '\n');
    if (!multiline) text = text.replace(/\n+/g, ' ');
    const parts = text.split('\n');
    parts.forEach((p, idx) => insertAtSelection(p, idx < parts.length - 1));
  });
  visual.addEventListener('dragstart', (e) => e.preventDefault());
  visual.addEventListener('drop', (e) => e.preventDefault());
  visual.addEventListener('click', (e) => { // 값 자리를 누르면 통째로 선택해서 서식을 줄 수 있게
    const chip = e.target.closest?.('[data-chip]');
    if (!chip) return;
    const r = document.createRange(); r.selectNode(chip);
    const sel = document.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    api.sel = readSelection(visual); active = api; notify();
  });

  // ---- 태그 입력칸 ----
  for (const inp of [rawText, rawPre, rawPost].filter(Boolean)) {
    inp.addEventListener('input', () => { parseRaw(); renderVisual(); emit(); notify(); });
    inp.addEventListener('focus', () => { lastFocus = inp === rawPost ? 'post' : inp === rawPre ? 'pre' : 'raw'; });
  }
  visual.addEventListener('focus', () => { lastFocus = 'visual'; });
  // 툴바의 적용 대상: 이 편집기를 건드리는 어떤 동작(포커스, 클릭, 키 입력)이든 마지막 편집기로 기억한다
  const activate = () => { if (active !== api) { active = api; registry.add(api); notify(); } };
  for (const ev of ['focusin', 'pointerdown', 'keydown', 'input']) el.addEventListener(ev, activate);

  registry.add(api);
  setValue(o.value);
  return api;
}

// ------------------------------------------------------------------ 툴바
// 팔레트: 어두운 배경(EVE 우주)에서 잘 읽히는 색 위주
const PALETTE = ['FFFFFF', 'E0E0E0', 'FFEB3B', 'FFCC80', 'FFA726', 'EF5350', 'EC407A', 'AB47BC', '5C6BC0', '42A5F5', '26C6DA', '66BB6A', 'ADFF2F'];
const SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 24];

function target() {
  for (const e of [...registry]) { if (e.el.isConnected) e.seen = true; else if (e.seen) registry.delete(e); }
  return active && active.el.isConnected ? active : null;
}

export function createMarkupToolbar({ multiline = false } = {}) {
  const run = (fn) => (e) => { const ed = target(); if (!ed) { toast(t('editor.pickFirst'), 'warn', 2200); return; } fn(ed, e); };
  const keepFocus = (e) => e.preventDefault(); // 버튼을 눌러도 편집기의 포커스/선택 유지

  const swatches = PALETTE.map((hex) => h('button', {
    type: 'button', class: 'mk-swatch', style: { background: `#${hex}` }, title: t('editor.colorTitle', { hex: `#${hex}` }), 'aria-label': t('editor.colorTitle', { hex: `#${hex}` }),
    dataset: { hex }, onmousedown: keepFocus, onclick: run((ed) => ed.apply({ color: MK.cssToArgb(`#${hex}`) })),
  }));
  const noColor = h('button', { type: 'button', class: 'mk-swatch mk-nocolor', title: t('editor.colorNone'), 'aria-label': t('editor.colorNone'), onmousedown: keepFocus, onclick: run((ed) => ed.apply({ color: null })) }, '⊘');
  const custom = h('input', { type: 'color', class: 'mk-colorpick', value: '#ffffff', title: t('editor.colorCustom'), 'aria-label': t('editor.colorCustom') });
  custom.addEventListener('input', run((ed) => ed.apply({ color: MK.cssToArgb(custom.value) })));

  const sizeSel = h('select', { class: 'input mk-size', title: t('editor.size'), 'aria-label': t('editor.size') },
    h('option', { value: '' }, t('editor.sizePlaceholder')),
    h('option', { value: 'none' }, t('editor.sizeDefault')),
    SIZES.map((n) => h('option', { value: String(n) }, String(n))));
  sizeSel.addEventListener('change', run((ed) => {
    const v = sizeSel.value; sizeSel.value = '';
    if (!v) return;
    ed.apply({ size: v === 'none' ? null : Number(v) });
  }));

  const toggle = (key, label, title, cls) => h('button', {
    type: 'button', class: `btn small mk-fmt ${cls}`, title, 'aria-label': title, 'aria-pressed': 'false', dataset: { key },
    onmousedown: keepFocus, onclick: run((ed) => ed.apply({ [key]: 'toggle' })),
  }, label);
  const bBtn = toggle('b', 'B', t('editor.bold'), 'mk-b'), iBtn = toggle('i', 'I', t('editor.italic'), 'mk-i'), uBtn = toggle('u', 'U', t('editor.underline'), 'mk-u');
  const clearBtn = h('button', { type: 'button', class: 'btn small', title: t('editor.clear'), onmousedown: keepFocus, onclick: run((ed) => ed.clear()) }, t('editor.clear'));

  const picker = symbolPicker((ch) => run((ed) => ed.insertText(ch))());
  picker.classList.add('hidden');
  let symOpen = false;
  const symBtn = h('button', { type: 'button', class: 'btn small', 'aria-expanded': 'false', title: t('editor.symbolsNote') }, t('editor.symbolsOpen'));
  symBtn.addEventListener('click', () => {
    symOpen = !symOpen;
    picker.classList.toggle('hidden', !symOpen);
    symBtn.setAttribute('aria-expanded', String(symOpen));
    symBtn.textContent = symOpen ? t('editor.symbolsClose') : t('editor.symbolsOpen');
  });
  const brBtn = multiline ? h('button', { type: 'button', class: 'btn small', title: t('editor.lineBreak'), onmousedown: keepFocus, onclick: run((ed) => ed.insertBreak()) }, `↵ ${t('editor.lineBreak')}`) : null;

  const rawToggle = h('button', { type: 'button', class: 'btn small mk-rawtoggle', title: t('editor.showTagsTitle'), 'aria-pressed': String(readShowRaw()) }, '</> ' + t('editor.showTags'));
  rawToggle.addEventListener('click', () => {
    const on = document.documentElement.dataset.mkRaw !== 'on';
    document.documentElement.dataset.mkRaw = on ? 'on' : 'off';
    try { localStorage.setItem(RAW_KEY, on ? '1' : '0'); } catch { /* 무시 */ }
    rawToggle.setAttribute('aria-pressed', String(on));
  });

  const root = h('div', { class: 'mk-toolbar', role: 'toolbar', 'aria-label': t('editor.toolbarAria') },
    h('div', { class: 'mk-row' },
      h('div', { class: 'mk-group' },
        h('span', { class: 'mk-glabel' }, t('editor.format')),
        h('span', { class: 'mk-swatches', role: 'group', 'aria-label': t('editor.color') }, swatches, noColor, custom),
        sizeSel, bBtn, iBtn, uBtn, clearBtn),
      h('div', { class: 'mk-group' },
        h('span', { class: 'mk-glabel' }, t('editor.insert')),
        brBtn, symBtn),
      h('div', { class: 'mk-group mk-right' }, rawToggle)),
    h('p', { class: 'hint mk-hint' }, t('editor.hint'), ' ', t('editor.hintLang')),
    picker);

  // 선택 영역의 서식 상태를 툴바에 반영 (굵게/기울임/밑줄 눌림, 팔레트 선택 표시)
  let seen = false;
  function refresh() {
    if (root.isConnected) seen = true;
    else if (seen) { stateListeners.delete(refresh); return; }
    const ed = target();
    const st = ed ? ed.query() : null;
    for (const btn of [bBtn, iBtn, uBtn]) btn.setAttribute('aria-pressed', String(!!st && st[btn.dataset.key] === true));
    const hex = st && st.color && st.color !== 'mixed' ? MK.colorHex(st.color) : null;
    for (const s of swatches) s.classList.toggle('on', !!hex && s.dataset.hex === hex);
    if (hex) custom.value = `#${hex.toLowerCase()}`;
  }
  stateListeners.add(refresh);
  root.refresh = refresh;
  return root;
}
