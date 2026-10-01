// 탭 이름 스타일 일괄 적용 도구: 모든 탭 이름을 같은 규칙(글자 크기, 강조 방식, 색)으로 다시 만든다.
// 게임 마크업이 지원하는 것은 색, 글자 크기, 굵게/기울임/밑줄뿐이라 그 안에서 보기 좋은 조합을 제공한다.
import { h, toast } from '../ui.js';
import { store } from '../store.js';
import { renderMarkup, argbToCss } from '../markup.js';

const TAGS = /<\/?(?:color|fontsize|b|i|u|br)(?:=[^>]*)?>/gi;
const plainText = (s) => String(s ?? '').replace(TAGS, '').trim();
const COLOR_TAG = /<color=0x[0-9a-f]{2}([0-9a-f]{6})>/i;

// 어두운 배경에서 서로 구분이 잘 되는 색 (명도가 비슷한 Material 400 계열)
const PALETTE = ['EF5350', 'FFA726', 'FFEE58', 'ADFF2F', '66BB6A', '26C6DA', '42A5F5', '5C6BC0', 'AB47BC', 'EC407A', 'FF7043', 'BDBDBD'];
const KEYWORDS = [
  [/pvp|pk|fight|전투/i, 'EF5350'], [/loot|salvage|wreck|루팅|잔해/i, 'ADFF2F'], [/rat|npc|belt|랫|렛/i, 'FFEE58'],
  [/drone|드론/i, '26C6DA'], [/warp|gate|jump|워프/i, '5C6BC0'], [/logi|rep|로지/i, 'AB47BC'],
  [/cap|capital|캐피탈|캡/i, 'EC407A'], [/general|all|일반/i, 'BDBDBD'], [/etc|기타/i, 'FF7043'],
];

export const STYLES = {
  initial: { label: '첫 글자 포인트', desc: '첫 글자만 강조색, 나머지는 기본색' },
  bold: { label: '첫 글자 포인트 + 굵게', desc: '첫 글자를 굵게 해서 더 또렷하게' },
  dot: { label: '● 점 + 이름', desc: '강조색 점 뒤에 이름. 깔끔하고 색이 잘 보임' },
  solid: { label: '이름 전체 색', desc: '이름 전체를 강조색으로' },
};

const DEFAULTS = { style: 'initial', size: 16, neutral: '#e0e0e0', keep: true, upper: false };
function loadOpts() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('tabs.styleOpts') || '{}') }; } catch { return { ...DEFAULTS }; }
}
const saveOpts = (o) => { try { localStorage.setItem('tabs.styleOpts', JSON.stringify(o)); } catch { /* 무시 */ } };

const hasLetter = (s) => /[\p{L}\p{N}]/u.test(s);

/** 현재 이름에서 강조색을 뽑는다: 첫 번째 <color=…> */
function existingAccent(name) {
  const m = COLOR_TAG.exec(name || '');
  return m ? m[1].toUpperCase() : null;
}

/** 탭마다 강조색을 정한다. keep=true 면 이미 쓰는 색을 유지하고 없는 탭만 자동 배정. */
function pickAccents(tabs, keep, neutralHex) {
  const accents = tabs.map((t) => {
    const a = keep ? existingAccent(t.name) : null;
    return a && a.toLowerCase() !== neutralHex.toLowerCase() ? a : null;
  });
  const used = new Set(accents.filter(Boolean));
  tabs.forEach((t, i) => {
    if (accents[i]) return;
    const text = plainText(t.name);
    const kw = KEYWORDS.find(([re, c]) => re.test(text) && !used.has(c));
    const c = kw ? kw[1] : PALETTE.find((p) => !used.has(p)) ?? PALETTE[i % PALETTE.length];
    accents[i] = c; used.add(c);
  });
  return accents;
}

export function buildName(text, accent, o) {
  const neutral = `0xff${o.neutral.replace('#', '').toUpperCase()}`;
  const acc = `0xff${accent}`;
  const size = `<fontsize=${o.size}>`;
  let t = o.upper ? text.toUpperCase() : text;
  if (!t) return '';
  const chars = Array.from(t);
  // 글자·숫자가 없는 이름(예: ✈ ✈ ✈)은 전체를 강조색으로
  if (o.style === 'solid' || !hasLetter(t)) return `${size}<color=${acc}>${t}`;
  if (o.style === 'dot') return `${size}<color=${acc}>●<color=${neutral}> ${t}`;
  const rest = chars.slice(1).join('');
  if (o.style === 'bold') return `${size}<color=${acc}><b>${chars[0]}</b><color=${neutral}>${rest}`;
  return `${size}<color=${acc}>${chars[0]}<color=${neutral}>${rest}`;
}

function plan(m, o) {
  const accents = pickAccents(m.tabs, o.keep, o.neutral.replace('#', ''));
  return m.tabs.map((t, i) => buildName(plainText(t.name), accents[i], o));
}

/** @param afterApply 적용 후 패널을 다시 그리는 콜백 */
export function styleCard(m, afterApply) {
  const o = loadOpts();
  const bar = (names, title) => h('div', {},
    h('div', { class: 'muted small' }, title),
    h('div', { class: 'preview tb-bar tb-style-bar' }, names.map((n) => h('span', { class: 'tb-bar-item', html: renderMarkup(n) || '&nbsp;' }))));
  const before = h('div', {}), after = h('div', {});

  const redraw = () => {
    saveOpts(o);
    const names = plan(m, o);
    before.replaceChildren(bar(m.tabs.map((t) => t.name), '지금'));
    after.replaceChildren(bar(names, '적용 후'));
  };

  const styleBtns = h('div', { class: 'tb-style-choices', role: 'radiogroup', 'aria-label': '스타일' });
  const drawChoices = () => styleBtns.replaceChildren(...Object.entries(STYLES).map(([id, s]) => {
    const sample = buildName('Sample', 'FFA726', { ...o, style: id });
    return h('button', {
      type: 'button', role: 'radio', 'aria-checked': o.style === id ? 'true' : 'false',
      class: 'tb-style-choice' + (o.style === id ? ' active' : ''),
      onclick: () => { o.style = id; drawChoices(); redraw(); },
    }, h('span', { class: 'preview tb-style-sample', html: renderMarkup(sample) }), h('b', {}, s.label), h('span', { class: 'muted small' }, s.desc));
  }));

  const size = h('select', { class: 'input', 'aria-label': '글자 크기', onchange: () => { o.size = Number(size.value); redraw(); drawChoices(); } },
    [13, 14, 15, 16, 17, 18, 20].map((n) => h('option', { value: n, selected: n === o.size }, `${n}`)));
  const neutral = h('input', { type: 'color', value: o.neutral, 'aria-label': '기본 글자색', oninput: () => { o.neutral = neutral.value; redraw(); drawChoices(); } });
  const keep = h('input', { type: 'checkbox', checked: o.keep, onchange: () => { o.keep = keep.checked; redraw(); } });
  const upper = h('input', { type: 'checkbox', checked: o.upper, onchange: () => { o.upper = upper.checked; redraw(); drawChoices(); } });

  const card = h('details', { class: 'card tb-card tb-styler', open: true },
    h('summary', {}, '이름 스타일 한 번에 정리'),
    h('p', { class: 'hint' }, '모든 탭 이름의 글자 크기·색 규칙을 통일합니다. 글자 내용은 그대로 두고 꾸미는 태그만 새로 만듭니다.'),
    styleBtns,
    h('div', { class: 'toolbar', style: { marginTop: '10px' } },
      h('label', { class: 'check' }, '글자 크기', size),
      h('label', { class: 'check' }, '기본 글자색', neutral),
      h('label', { class: 'check', title: '켜면 지금 쓰는 강조색을 그대로 두고, 색이 없는 탭에만 자동으로 색을 배정합니다.' }, keep, '기존 강조색 유지'),
      h('label', { class: 'check' }, upper, '대문자로')),
    before, after,
    h('div', { class: 'toolbar', style: { marginTop: '10px' } },
      h('button', { class: 'btn primary', onclick: () => {
        const names = plan(m, o);
        m.tabs.forEach((t, i) => { t.name = names[i]; });
        store.commit('tab-style');
        toast('모든 탭 이름에 적용했습니다. 마음에 안 들면 Ctrl+Z 로 되돌릴 수 있어요.', 'ok', 4000);
        afterApply();
      } }, '모든 탭에 적용'),
      h('span', { class: 'muted small' }, '적용 후에도 각 탭에서 개별 수정할 수 있습니다.')));
  drawChoices(); redraw();
  return card;
}
