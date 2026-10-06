// EVE 에서 실제로 표시되는 특수문자 선택창 (symbols.js: EVE Sans Neue + Arial Unicode 에 글리프가 있는 것만).
import { h } from '../ui.js';
import { SYMBOL_GROUPS } from '../symbols.js';

const RECENT_KEY = 'tabs.recentSymbols';
const loadRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };
const saveRecent = (a) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(a)); } catch { /* 무시 */ } };
const code = (ch) => `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;

let lastGroup = 'recent';

/** @param onPick (char) => void  — 호출 측이 커서 위치에 삽입한다 */
export function symbolPicker(onPick) {
  const tabs = h('div', { class: 'tb-sym-tabs', role: 'tablist', 'aria-label': '특수문자 분류' });
  const grid = h('div', { class: 'tb-sym-grid', role: 'group' });
  const hint = h('p', { class: 'hint tb-sym-hint' });
  let recent = loadRecent();

  const groups = () => [{ id: 'recent', label: '최근', chars: recent.join('') }, ...SYMBOL_GROUPS];
  const pick = (ch) => {
    recent = [ch, ...recent.filter((c) => c !== ch)].slice(0, 24);
    saveRecent(recent);
    onPick(ch);
    if (lastGroup === 'recent') draw(); // 최근 탭에서 눌렀을 땐 순서 갱신
  };

  function draw() {
    const all = groups();
    if (!all.some((g) => g.id === lastGroup)) lastGroup = SYMBOL_GROUPS[0].id;
    tabs.replaceChildren(...all.map((g) => h('button', {
      type: 'button', role: 'tab', class: 'tb-sym-tab' + (g.id === lastGroup ? ' active' : ''), 'aria-selected': g.id === lastGroup ? 'true' : 'false',
      onclick: () => { lastGroup = g.id; draw(); },
    }, g.label)));
    const g = all.find((x) => x.id === lastGroup);
    const chars = Array.from(g.chars);
    grid.replaceChildren(...(chars.length
      ? chars.map((ch) => h('button', { type: 'button', class: 'tb-sym', title: `${ch}  ${code(ch)}`, 'aria-label': `${ch} ${code(ch)}`, onclick: () => pick(ch) }, ch))
      : [h('span', { class: 'muted small tb-sym-empty' }, '아직 쓴 문자가 없습니다. 다른 분류에서 고르면 여기에 쌓입니다.')]));
    hint.textContent = `${g.label} · ${chars.length}자`;
  }
  draw();
  return h('div', { class: 'tb-sym-picker' }, tabs, grid, hint,
    h('p', { class: 'hint' }, 'EVE 클라이언트 글꼴(EVE Sans Neue + Arial Unicode)에 글리프가 있는 문자만 보여줍니다. 문자를 누르면 이름 입력칸의 커서 위치에 들어갑니다.'));
}
