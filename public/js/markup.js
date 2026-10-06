// EVE 인게임 마크업(<color=0xAARRGGBB>, <fontsize=N>, <b>, <i>, <u>, <br>) 처리.
//
// 문자열 <-> "원자(atom) 배열" 변환기를 중심으로 한다. 원자 하나 = 글자 하나(또는 줄바꿈/값 자리/알 수 없는 태그)이고,
// 각 원자는 그 자리의 서식 s = { color, size, b, i, u } 를 가진다. 서식 편집기(markup-editor.js)와 미리보기가 같은 모델을 쓴다.
//
// 태그 의미(게임의 동작을 근사): color / fontsize 는 스택처럼 동작한다. <color=A>…<color=B>…</color> 에서 </color> 뒤는 A 로 돌아간다.
// 닫는 태그가 없는 열린 태그는 문자열 끝까지 유지된다. (탭 이름이 그런 식으로 쓰이는 경우가 많다)
// 이 파일은 DOM 에 의존하지 않아 Node 에서도 시험할 수 있다.

export const NONE = Object.freeze({ color: null, size: null, b: false, i: false, u: false });
export const styleKey = (s) => `${(s.color ?? '').toLowerCase()}|${s.size ?? ''}|${s.b ? 1 : 0}${s.i ? 1 : 0}${s.u ? 1 : 0}`;
const mkStyle = (o) => Object.freeze({ color: o.color ?? null, size: o.size ?? null, b: !!o.b, i: !!o.i, u: !!o.u });
export const sameStyle = (a, b) => styleKey(a) === styleKey(b);

// ------------------------------------------------------------------ 색 도우미
export function argbToCss(hex) {
  let h = String(hex ?? '').trim().replace(/^0x/i, '').replace(/^#/, '');
  if (h.length === 8) h = h.slice(2);
  return /^[0-9a-f]{6}$/i.test(h) ? `#${h.toLowerCase()}` : '#ffffff';
}
/** '#rrggbb' -> '0xffRRGGBB' (대문자 16진수: 게임 파일에서 흔히 쓰는 표기) */
export const cssToArgb = (css) => `0xff${String(css).replace('#', '').toUpperCase()}`;
/** '0xffRRGGBB' 에서 'RRGGBB' (대문자). 해석할 수 없으면 null */
export function colorHex(v) {
  const h = String(v ?? '').trim().replace(/^0x/i, '').replace(/^#/, '');
  const six = h.length === 8 ? h.slice(2) : h;
  return /^[0-9a-f]{6}$/i.test(six) ? six.toUpperCase() : null;
}

// ------------------------------------------------------------------ 파서
const TAG_RE = /<(\/?)([a-zA-Z]+)(?:\s*=\s*([^>]*?))?\s*\/?>/g;

export class Parser {
  constructor() {
    this.colors = []; this.sizes = []; this.b = 0; this.i = 0; this.u = 0;
    this.atoms = [];
    this._cache = null;
  }
  style() {
    const color = this.colors.length ? this.colors[this.colors.length - 1] : null;
    const size = this.sizes.length ? this.sizes[this.sizes.length - 1] : null;
    const key = `${color}|${size}|${this.b > 0}|${this.i > 0}|${this.u > 0}`;
    if (this._cache?.key !== key) this._cache = { key, s: mkStyle({ color, size, b: this.b > 0, i: this.i > 0, u: this.u > 0 }) };
    return this._cache.s;
  }
  /** 열린 서식 태그가 남아 있는가 (게임에서 다음 조각까지 서식이 이어지는지 판단) */
  get open() { return this.colors.length + this.sizes.length + this.b + this.i + this.u > 0; }
  text(str) { for (const ch of str) this.atoms.push({ t: 'c', ch, s: this.style() }); }
  raw(str, stray = false) { this.atoms.push(stray ? { t: 'raw', raw: str, s: this.style(), stray: true } : { t: 'raw', raw: str, s: this.style() }); }
  chip() { this.atoms.push({ t: 'chip', s: this.style() }); }
  feed(str) {
    str = String(str ?? '');
    let last = 0;
    for (const m of str.matchAll(TAG_RE)) {
      this.text(str.slice(last, m.index));
      last = m.index + m[0].length;
      const close = m[1] === '/', name = m[2].toLowerCase(), val = m[3] === undefined ? undefined : m[3].trim();
      switch (name) {
        case 'br': if (close) this.raw(m[0], true); else this.atoms.push({ t: 'br', s: this.style() }); break;
        case 'color':
          if (close) { if (this.colors.length) this.colors.pop(); else this.raw(m[0], true); } else if (val) this.colors.push(val); else this.raw(m[0]);
          break;
        case 'fontsize': {
          if (close) { if (this.sizes.length) this.sizes.pop(); else this.raw(m[0], true); break; }
          const n = parseInt(val, 10);
          if (Number.isFinite(n) && n > 0 && n < 400) this.sizes.push(n); else this.raw(m[0]);
          break;
        }
        case 'b': case 'i': case 'u':
          if (val !== undefined) this.raw(m[0]);
          else if (close) { if (this[name] > 0) this[name]--; else this.raw(m[0], true); } else this[name]++;
          break;
        default: this.raw(m[0]); // 알 수 없는 태그는 그대로 보존
      }
    }
    this.text(str.slice(last));
    return this;
  }
}
export const parseMarkup = (raw) => new Parser().feed(raw).atoms;

/** 선박 라벨 조각: pre + (값 자리) + post. 값 자리는 chip 원자. leaks=true 면 post 끝까지 열린 태그가 남는다(다음 조각으로 서식이 이어짐). */
export function parsePiece(pre, post, { chip = true } = {}) {
  const p = new Parser().feed(pre);
  if (chip) p.chip();
  p.feed(post);
  return { atoms: p.atoms, leaks: p.open };
}

// ------------------------------------------------------------------ 직렬화
const desiredTags = (s) => {
  const d = [];
  if (s.size != null) d.push({ k: 'size', v: s.size });
  if (s.color != null) d.push({ k: 'color', v: s.color });
  if (s.b) d.push({ k: 'b' });
  if (s.i) d.push({ k: 'i' });
  if (s.u) d.push({ k: 'u' });
  return d;
};
const sameTag = (a, b) => a.k === b.k && String(a.v ?? '').toLowerCase() === String(b.v ?? '').toLowerCase();
const opener = (o) => (o.k === 'size' ? `<fontsize=${o.v}>` : o.k === 'color' ? `<color=${o.v}>` : `<${o.k}>`);
const closer = (o) => (o.k === 'size' ? '</fontsize>' : o.k === 'color' ? '</color>' : `</${o.k}>`);

/**
 * 원자 배열 -> 마크업 문자열. 서식이 바뀌는 곳에만 태그를 넣고, 안쪽 태그부터 닫는다.
 * closeAtEnd: 끝에서 열린 태그를 모두 닫는다. splitAtChip: 값 자리(chip)에서 {pre, post} 로 나눈다.
 */
export function serializeAtoms(atoms, { closeAtEnd = false, splitAtChip = false } = {}) {
  let out = '', pre = null;
  const open = [];
  const go = (s) => {
    const want = desiredTags(s);
    let k = 0;
    while (k < open.length && k < want.length && sameTag(open[k], want[k])) k++;
    for (let j = open.length - 1; j >= k; j--) out += closer(open[j]);
    open.length = k;
    for (let j = k; j < want.length; j++) { out += opener(want[j]); open.push(want[j]); }
  };
  for (const a of atoms) {
    go(a.s);
    if (a.t === 'c') out += a.ch;
    else if (a.t === 'br') out += '<br>';
    else if (a.t === 'raw') out += a.raw;
    else if (a.t === 'chip' && splitAtChip && pre === null) { pre = out; out = ''; }
  }
  if (closeAtEnd) go(NONE);
  if (!splitAtChip) return out;
  return pre === null ? { pre: out, post: '' } : { pre, post: out };
}

// ------------------------------------------------------------------ 원자 편집 (모두 새 배열을 돌려준다)
/** 범위 [a, b) 의 서식을 patch 로 바꾼다. patch: { color, size } 값 또는 null(해제), { b, i, u }: true/false/'toggle' */
export function applyStyle(atoms, a, b, patch) {
  const slice = atoms.slice(a, b);
  const toggled = {};
  for (const k of ['b', 'i', 'u']) {
    if (patch[k] === 'toggle') toggled[k] = !(slice.length && slice.every((x) => x.s[k]));
  }
  return atoms.map((at, idx) => {
    if (idx < a || idx >= b) return at;
    const ns = { ...at.s };
    if ('color' in patch) ns.color = patch.color;
    if ('size' in patch) ns.size = patch.size;
    for (const k of ['b', 'i', 'u']) {
      if (k in patch) ns[k] = patch[k] === 'toggle' ? toggled[k] : !!patch[k];
    }
    return { ...at, s: mkStyle(ns) };
  });
}
export const clearStyle = (atoms, a, b) => atoms.map((at, idx) => (idx >= a && idx < b ? { ...at, s: NONE } : at));
/** 범위 [a, b) 를 text 로 바꾼다 (새 글자는 앞 원자(없으면 뒤 원자)의 서식을 따른다) */
export function replaceRange(atoms, a, b, text) {
  const ref = atoms[a - 1] ?? atoms[b] ?? null;
  const s = ref ? ref.s : NONE;
  const ins = Array.from(String(text)).map((ch) => ({ t: 'c', ch, s }));
  return [...atoms.slice(0, a), ...ins, ...atoms.slice(b)];
}
export function insertBreak(atoms, a, b) {
  const ref = atoms[a - 1] ?? atoms[b] ?? null;
  return [...atoms.slice(0, a), { t: 'br', s: ref ? ref.s : NONE }, ...atoms.slice(b)];
}
/** 범위의 공통 서식 (서로 다르면 해당 항목은 'mixed') */
export function commonStyle(atoms, a, b) {
  const sl = atoms.slice(a, b);
  if (!sl.length) return null;
  const out = { ...sl[0].s };
  for (const at of sl) for (const k of Object.keys(out)) if (String(at.s[k] ?? '').toLowerCase() !== String(out[k] ?? '').toLowerCase()) out[k] = 'mixed';
  return out;
}
export const plainText = (atoms) => atoms.map((a) => (a.t === 'c' ? a.ch : a.t === 'br' ? '\n' : '')).join('');

// ------------------------------------------------------------------ HTML 렌더링 (미리보기용)
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function styleCss(s) {
  const css = [];
  if (s.color != null) css.push(`color:${argbToCss(s.color)}`);
  if (s.size != null) css.push(`font-size:${s.size}px`);
  if (s.b) css.push('font-weight:700');
  if (s.i) css.push('font-style:italic');
  if (s.u) css.push('text-decoration:underline');
  return css.join(';');
}
/** 원자 배열 -> HTML (같은 서식이 이어지는 글자는 한 span 으로) */
export function atomsToHtml(atoms) {
  let html = '', run = null;
  const flush = () => { if (run) { const css = styleCss(run.s); html += css ? `<span style="${css}">${esc(run.text)}</span>` : esc(run.text); run = null; } };
  for (const a of atoms) {
    if (a.t === 'br') { flush(); html += '<br>'; continue; }
    const text = a.t === 'c' ? a.ch : a.t === 'raw' && !a.stray ? a.raw : '';
    if (!text) continue;
    if (run && sameStyle(run.s, a.s)) run.text += text; else { flush(); run = { s: a.s, text }; }
  }
  flush();
  return html;
}
/** 마크업 문자열 -> 안전한 HTML (인게임 미리보기). 알 수 없는 태그는 글자 그대로 보인다. */
export const renderMarkup = (raw) => (raw == null ? '' : atomsToHtml(parseMarkup(raw)));

// ------------------------------------------------------------------ 라벨 조각 색
/** 조각의 "주 색" = 값 자리(chip)의 색 (대문자 RRGGBB, 없으면 null) */
export function pieceColor(pre, post) {
  const c = parsePiece(pre, post).atoms.find((a) => a.t === 'chip')?.s.color;
  return c ? colorHex(c) : null;
}
/** 조각의 주 색을 hex(RRGGBB) 로 바꾼다. 값과 같은 색이던 앞/뒤 글자도 함께 바뀌고, 다른 색의 장식은 그대로 둔다. -> { pre, post } */
export function recolorPiece(pre, post, hex) {
  const { atoms, leaks } = parsePiece(pre, post);
  const ref = atoms.find((a) => a.t === 'chip');
  const c0 = String(ref?.s.color ?? '').toLowerCase();
  const color = cssToArgb(`#${hex}`);
  const out = atoms.map((a) => {
    if (a.t === 'br' || (a.t !== 'chip' && String(a.s.color ?? '').toLowerCase() !== c0)) return a;
    return { ...a, s: Object.freeze({ ...a.s, color }) };
  });
  return serializeAtoms(out, { splitAtChip: true, closeAtEnd: !leaks });
}
