// 정적 참조 데이터: 상태(state) ID, 컬럼, 색상, 선박 라벨 종류, 그룹/카테고리.

// kind: legal(법적/보안) | affiliation(소속) | standing(우호도) | militia(밀리샤) | misc
// filterOnly: 프리셋 필터(숨김/항상표시)에서만 쓰이고 깃발/배경에는 못 쓰는 상태
export const STATES = {
  9:  { en: 'Pilot has a security status below -5', ko: '보안 등급 -5 미만', kind: 'legal', color: 'red' },
  10: { en: 'Pilot has a security status below 0', ko: '보안 등급 0 미만', kind: 'legal', color: 'orange' },
  11: { en: 'Pilot is in your fleet', ko: '내 플릿 소속', kind: 'affiliation', color: 'purple' },
  12: { en: 'Pilot is in your Capsuleer corporation', ko: '내 콥(캡슐리어) 소속', kind: 'affiliation', color: 'green' },
  13: { en: 'Pilot is at war with your corporation/alliance', ko: '내 콥/얼라이언스와 전쟁 중', kind: 'legal', color: 'red' },
  14: { en: 'Pilot is in your alliance', ko: '내 얼라이언스 소속', kind: 'affiliation', color: 'blue' },
  15: { en: 'Pilot has Excellent Standing', ko: '우호도 매우 좋음', kind: 'standing', color: 'darkBlue' },
  16: { en: 'Pilot has Good Standing', ko: '우호도 좋음', kind: 'standing', color: 'darkBlue' },
  17: { en: 'Pilot has Neutral Standing', ko: '우호도 중립', kind: 'standing', color: 'grey' },
  18: { en: 'Pilot has Bad Standing', ko: '우호도 나쁨', kind: 'standing', color: 'orange' },
  19: { en: 'Pilot has Terrible Standing', ko: '우호도 매우 나쁨', kind: 'standing', color: 'red' },
  20: { en: 'Reserved (20)', ko: '예약됨 (20)', kind: 'misc', color: 'grey' },
  21: { en: 'Pilot (agent) is interactable', ko: '상호작용 가능한 에이전트', kind: 'misc', color: 'white' },
  36: { en: 'Wreck is already viewed', ko: '이미 열어본 잔해', kind: 'misc', color: 'grey', filterOnly: true },
  37: { en: 'Wreck is empty', ko: '빈 잔해', kind: 'misc', color: 'grey', filterOnly: true },
  44: { en: 'Pilot is at war with your militia', ko: '내 밀리샤와 전쟁 중', kind: 'militia', color: 'red' },
  45: { en: 'Pilot is in your militia or allied to your militia', ko: '내 밀리샤 또는 동맹 밀리샤', kind: 'militia', color: 'blue' },
  48: { en: 'Pilot has No Standing', ko: '우호도 없음', kind: 'standing', color: 'grey' },
  49: { en: 'Pilot is an ally in one or more of your wars', ko: '내 전쟁의 동맹', kind: 'legal', color: 'blue' },
  50: { en: 'Pilot is a suspect', ko: '서스펙트', kind: 'legal', color: 'yellow' },
  51: { en: 'Pilot is a criminal', ko: '크리미널', kind: 'legal', color: 'red' },
  52: { en: 'Pilot has a limited engagement with you', ko: '나와 제한적 교전 중', kind: 'legal', color: 'orange' },
  53: { en: 'Pilot has a killright on them that you can activate', ko: '내가 발동할 수 있는 킬라이트', kind: 'legal', color: 'orange' },
  66: { en: 'Pilot is in your Non Capsuleer corporation', ko: '내 콥(비캡슐리어) 소속', kind: 'affiliation', color: 'green' },
  68: { en: 'Pilot has retribution timer', ko: '보복(retribution) 타이머', kind: 'legal', color: 'orange' },
};
export const STATE_KINDS = { legal: '법적/보안', affiliation: '소속', standing: '우호도', militia: '밀리샤', misc: '기타' };
export const ALL_STATE_IDS = Object.keys(STATES).map(Number).sort((a, b) => a - b);
export const APPEARANCE_STATE_IDS = ALL_STATE_IDS.filter((id) => !STATES[id].filterOnly);

export const stateName = (id) => (STATES[id] ? `${STATES[id].ko}` : `알 수 없는 상태 #${id}`);
export const stateNameEn = (id) => STATES[id]?.en ?? `State ${id}`;

// 오버뷰 컬럼
export const COLUMNS = {
  ICON: '아이콘', TAG: '태그', DISTANCE: '거리', NAME: '이름', TYPE: '종류', CORPORATION: '콥', ALLIANCE: '얼라이언스',
  FACTION: '팩션', MILITIA: '밀리샤', SIZE: '크기', VELOCITY: '속도', RADIALVELOCITY: '반경 속도',
  TRANSVERSALVELOCITY: '횡방향 속도', ANGULARVELOCITY: '각속도',
};
export const ALL_COLUMNS = Object.keys(COLUMNS);
export const columnName = (c) => COLUMNS[c] ?? c;

// 게임이 쓰는 이름 있는 색상 (미리보기 색은 근사값)
export const COLOR_NAMES = {
  black: '#000000', white: '#ffffff', grey: '#808080', red: '#ff0000', orange: '#ff7700', yellow: '#ffff00',
  green: '#00ff00', blue: '#3399ff', darkBlue: '#1b3a8f', turquoise: '#30d5c8', darkTurquoise: '#00a5b5',
  purple: '#bf00ff', indigo: '#4b0082',
};
export const COLOR_KO = {
  black: '검정', white: '흰색', grey: '회색', red: '빨강', orange: '주황', yellow: '노랑', green: '초록',
  blue: '파랑', darkBlue: '짙은 파랑', turquoise: '청록', darkTurquoise: '짙은 청록', purple: '보라', indigo: '남색',
};
export const colorCss = (name) => COLOR_NAMES[name] ?? (name === 'gray' ? '#808080' : null);

// 선박 라벨 종류 (null = 빈 구분자)
export const LABEL_TYPES = {
  'pilot name': '파일럿 이름', 'ship type': '함선 종류', 'ship name': '함선 이름', corporation: '콥',
  alliance: '얼라이언스', faction: '팩션', militia: '밀리샤',
};
export const labelTypeName = (t) => (t === null || t === undefined ? '(구분자)' : LABEL_TYPES[t] ?? t);

// 게임 오버뷰 유형 탭에 나오는 카테고리 (그 외는 "모든 카테고리 표시"를 켜야 보임)
export const OVERVIEW_CATEGORIES = [25, 2, 8, 22, 18, 11, 87, 46, 6, 40, 23, 3, 65, 41];

let groupData = null;
export async function loadGroupData() {
  if (!groupData) groupData = await (await fetch('data/groups.json')).json();
  return groupData;
}
export const getGroupData = () => groupData;
export function groupName(id) {
  const g = groupData?.groups[id];
  return g ? { en: g.en, ko: g.ko } : null;
}
