// 정적 참조 데이터: 상태(state) ID, 컬럼, 색상, 선박 라벨 종류, 그룹/카테고리.
// 사람이 읽는 이름은 locales/data.js (t('data.*')) 와 groups.json 의 언어별 이름에서 온다.
import { t, tOrNull, nameOf } from './i18n.js';

// kind: legal(법적/보안) | affiliation(소속) | standing(우호도) | militia(밀리샤) | misc
// filterOnly: 프리셋 필터(숨김/항상표시)에서만 쓰이고 깃발/배경에는 못 쓰는 상태. en 은 게임의 영어 원문.
// hidden: 현상금(20)처럼 게임이 서버 설정(hide_player_bounties)에 따라 설정 창에서 숨기는 상태. 목록에는 올리지 않고,
//         파일이나 프리셋이 이미 쓰고 있을 때만 보인다 (쓰는 것을 놓치지 않도록).
export const STATES = {
  9:  { en: 'Pilot has a security status below -5', kind: 'legal', color: 'red' },
  10: { en: 'Pilot has a security status below 0', kind: 'legal', color: 'orange' },
  11: { en: 'Pilot is in your fleet', kind: 'affiliation', color: 'purple' },
  12: { en: 'Pilot is in your Capsuleer corporation', kind: 'affiliation', color: 'green' },
  13: { en: 'Pilot is at war with your corporation/alliance', kind: 'legal', color: 'red' },
  14: { en: 'Pilot is in your alliance', kind: 'affiliation', color: 'blue' },
  15: { en: 'Pilot has Excellent Standing', kind: 'standing', color: 'darkBlue' },
  16: { en: 'Pilot has Good Standing', kind: 'standing', color: 'darkBlue' },
  17: { en: 'Pilot has Neutral Standing', kind: 'standing', color: 'grey' },
  18: { en: 'Pilot has Bad Standing', kind: 'standing', color: 'orange' },
  19: { en: 'Pilot has Terrible Standing', kind: 'standing', color: 'red' },
  20: { en: 'Pilot has bounty on them', kind: 'legal', color: 'grey', hidden: true },
  21: { en: 'Pilot (agent) is interactable', kind: 'misc', color: 'white' },
  36: { en: 'Wreck is already viewed', kind: 'misc', color: 'grey', filterOnly: true },
  37: { en: 'Wreck is empty', kind: 'misc', color: 'grey', filterOnly: true },
  44: { en: 'Pilot is at war with your militia', kind: 'militia', color: 'red' },
  45: { en: 'Pilot is in your militia or allied to your militia', kind: 'militia', color: 'blue' },
  48: { en: 'Pilot has No Standing', kind: 'standing', color: 'grey' },
  49: { en: 'Pilot is an ally in one or more of your wars', kind: 'legal', color: 'blue' },
  50: { en: 'Pilot is a suspect', kind: 'legal', color: 'yellow' },
  51: { en: 'Pilot is a criminal', kind: 'legal', color: 'red' },
  52: { en: 'Pilot has a limited engagement with you', kind: 'legal', color: 'orange' },
  53: { en: 'Pilot has a killright on them that you can activate', kind: 'legal', color: 'orange' },
  66: { en: 'Pilot is in your Non Capsuleer corporation', kind: 'affiliation', color: 'green' },
  68: { en: 'Pilot has retribution timer', kind: 'legal', color: 'orange' },
};
export const STATE_KIND_IDS = ['legal', 'affiliation', 'standing', 'militia', 'misc'];
export const ALL_STATE_IDS = Object.keys(STATES).map(Number).sort((a, b) => a - b);
export const APPEARANCE_STATE_IDS = ALL_STATE_IDS.filter((id) => !STATES[id].filterOnly && !STATES[id].hidden);
export const HIDDEN_STATE_IDS = ALL_STATE_IDS.filter((id) => STATES[id].hidden);
export const isHiddenState = (id) => !!STATES[id]?.hidden;

/** 현재 언어의 상태 이름 (모르는 ID 는 "알 수 없는 상태 #id") */
export const stateName = (id) => (STATES[id] ? t(`data.state.${id}`) : t('data.unknownState', { id }));
/** 게임의 영어 원문 */
export const stateNameEn = (id) => STATES[id]?.en ?? `State ${id}`;
export const kindName = (kind) => t(`data.kind.${kind}`);

// 오버뷰 컬럼 (ID 는 YAML 에 쓰이는 값)
export const ALL_COLUMNS = [
  'ICON', 'TAG', 'DISTANCE', 'NAME', 'TYPE', 'CORPORATION', 'ALLIANCE', 'FACTION', 'MILITIA', 'SIZE',
  'VELOCITY', 'RADIALVELOCITY', 'TRANSVERSALVELOCITY', 'ANGULARVELOCITY',
];
export const columnName = (c) => tOrNull(`data.col.${c}`) ?? c;

// 게임이 쓰는 이름 있는 색상 (미리보기 색은 근사값). 이름 표시는 colorLabel()
export const COLOR_NAMES = {
  black: '#000000', white: '#ffffff', grey: '#808080', red: '#ff0000', orange: '#ff7700', yellow: '#ffff00',
  green: '#00ff00', blue: '#3399ff', darkBlue: '#1b3a8f', turquoise: '#30d5c8', darkTurquoise: '#00a5b5',
  purple: '#bf00ff', indigo: '#4b0082',
};
export const colorLabel = (name) => tOrNull(`data.color.${name}`) ?? name;
export const colorCss = (name) => COLOR_NAMES[name] ?? (name === 'gray' ? '#808080' : null);

// 선박 라벨 종류 (null = 빈 구분자)
export const LABEL_TYPE_IDS = ['pilot name', 'ship type', 'ship name', 'corporation', 'alliance', 'faction', 'militia'];
export const labelTypeName = (type) => (type === null || type === undefined ? t('data.labelSeparator') : tOrNull(`data.label.${type}`) ?? type);

// 게임 오버뷰 유형 탭에 나오는 카테고리 (그 외는 "모든 카테고리 표시"를 켜야 보임)
export const OVERVIEW_CATEGORIES = [25, 2, 8, 22, 18, 11, 87, 46, 6, 40, 23, 3, 65, 41];

let groupData = null;
export async function loadGroupData() {
  if (!groupData) groupData = await (await fetch('data/groups.json')).json();
  return groupData;
}
export const getGroupData = () => groupData;
/** 그룹 ID -> 이름 객체 {en,ko,ja,ru,zh,cat,pub} 또는 undefined. 표시 이름은 nameOf(entry) */
export const groupEntry = (id) => groupData?.groups[id];
export const categoryEntry = (id) => groupData?.categories[id];
/** 현재 언어의 그룹 이름 (없으면 null) */
export const groupLabel = (id) => { const g = groupEntry(id); return g ? nameOf(g) : null; };
