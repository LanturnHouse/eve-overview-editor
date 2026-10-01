// EVE 오버뷰 YAML <-> 편집용 모델 변환.
// 게임은 dict 를 [[key, value], ...] 쌍 리스트로 저장한다. 여기서는 다루기 쉬운 JSON 모델로 바꿨다가
// 저장 시 원래 형식(키 알파벳 정렬, 들여쓰기 없는 리스트)으로 되돌린다.
import { load, dump } from '../vendor/js-yaml.mjs';
const yaml = { load, dump };

export const BRACKET_SHOW_ALL = '_BracketFilterShowAll';

const KNOWN_TOP = new Set([
  'backgroundOrder', 'backgroundStates', 'columnOrder', 'flagOrder', 'flagStates', 'overviewColumns',
  'presets', 'shipLabelOrder', 'shipLabels', 'stateBlinks', 'stateColorsNameList', 'tabSetup', 'userSettings',
]);

const pairsToObj = (pairs) => {
  const o = {};
  for (const p of Array.isArray(pairs) ? pairs : []) if (Array.isArray(p)) o[p[0]] = p[1];
  return o;
};
const cmp = (a, b) => (a === b ? 0 : a === null ? -1 : b === null ? 1 : String(a) < String(b) ? -1 : 1);
const sortedPairs = (obj) => Object.keys(obj).sort(cmp).map((k) => [k, obj[k]]);

export function parseOverview(text) {
  const doc = yaml.load(text);
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('오버뷰 YAML 형식이 아닙니다.');
  const m = {
    presets: [], tabs: [], shipLabelOrder: [], shipLabels: [],
    flagOrder: [], flagStates: [], backgroundOrder: [], backgroundStates: [],
    stateColors: {}, stateBlinks: {}, overviewColumns: [], columnOrder: [],
    userSettings: {}, extraTop: {},
  };
  for (const k of Object.keys(doc)) if (!KNOWN_TOP.has(k)) m.extraTop[k] = doc[k];

  for (const [name, attrs] of doc.presets || []) {
    const a = pairsToObj(attrs);
    const { groups = [], filteredStates = [], alwaysShownStates = [], ...extra } = a;
    m.presets.push({ name, groups: [...groups], filteredStates: [...filteredStates], alwaysShownStates: [...alwaysShownStates], extra });
  }
  for (const [, attrs] of doc.tabSetup || []) {
    const { bracket = BRACKET_SHOW_ALL, color = null, name = '', overview = '', tabColumns, tabColumnOrder, ...extra } = pairsToObj(attrs);
    const t = { bracket, color, name, overview, extra };
    if (tabColumns) t.tabColumns = [...tabColumns];
    if (tabColumnOrder) t.tabColumnOrder = [...tabColumnOrder];
    m.tabs.push(t);
  }
  m.shipLabelOrder = [...(doc.shipLabelOrder || [])];
  m.shipLabels = (doc.shipLabels || []).map(([key, attrs]) => ({ key, attrs: pairsToObj(attrs) }));
  for (const k of ['flagOrder', 'flagStates', 'backgroundOrder', 'backgroundStates', 'overviewColumns', 'columnOrder'])
    m[k] = [...(doc[k] || [])];
  m.stateColors = pairsToObj(doc.stateColorsNameList);
  m.stateBlinks = pairsToObj(doc.stateBlinks);
  m.userSettings = pairsToObj(doc.userSettings);
  return m;
}

export function serializeOverview(m) {
  const doc = { ...m.extraTop };
  doc.presets = m.presets.map((p) => [
    p.name,
    sortedPairs({
      ...p.extra,
      alwaysShownStates: uniqSorted(p.alwaysShownStates),
      filteredStates: uniqSorted(p.filteredStates),
      groups: uniqSorted(p.groups),
    }),
  ]);
  doc.tabSetup = m.tabs.map((t, i) => {
    const a = { ...t.extra, bracket: t.bracket, color: t.color ?? null, name: t.name, overview: t.overview };
    if (t.tabColumns) a.tabColumns = [...t.tabColumns];
    if (t.tabColumnOrder) a.tabColumnOrder = [...t.tabColumnOrder];
    return [i, sortedPairs(a)];
  });
  doc.shipLabelOrder = [...m.shipLabelOrder];
  doc.shipLabels = [...m.shipLabels]
    .sort((a, b) => cmp(a.key, b.key))
    .map((l) => [l.key, sortedPairs(l.attrs)]);
  doc.flagOrder = [...m.flagOrder];
  doc.flagStates = uniqSorted(m.flagStates);
  doc.backgroundOrder = [...m.backgroundOrder];
  doc.backgroundStates = uniqSorted(m.backgroundStates);
  doc.overviewColumns = [...m.overviewColumns].sort(cmp);
  doc.columnOrder = [...m.columnOrder];
  doc.stateColorsNameList = sortedPairs(m.stateColors);
  doc.stateBlinks = sortedPairs(m.stateBlinks);
  doc.userSettings = sortedPairs(m.userSettings);
  const out = {};
  for (const k of Object.keys(doc).sort(cmp)) out[k] = doc[k];
  return yaml.dump(out, { noArrayIndent: true, lineWidth: -1, quotingType: "'", sortKeys: false });
}

const uniqSorted = (a) => [...new Set(a)].sort((x, y) => x - y);
export const clone = (o) => JSON.parse(JSON.stringify(o));
