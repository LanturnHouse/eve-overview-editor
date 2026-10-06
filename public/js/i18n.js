// 다국어 지원 (en / ko / ja / ru / zh). 기본값은 브라우저 언어, 사용자가 상단 바에서 바꾸면 localStorage 에 기억한다.
//
// 사용법
//   import { t, nameOf } from '../i18n.js';
//   t('presets.title')                      -> 현재 언어 문구
//   t('presets.selected', { n: 12 })        -> "{n}" 자리 치환
// 문구는 locales/<네임스페이스>.js 에서 defineMessages('네임스페이스', { en:{키:문구}, ko:{...}, ja:{...}, ru:{...}, zh:{...} }) 로 등록한다.
// 키는 "네임스페이스.키" 로 조회한다. 현재 언어에 없으면 영어 -> 한국어 -> 키 문자열 순으로 대체된다.
// t() 는 화면을 그릴 때(함수 안에서) 호출해야 언어 전환이 반영된다. 모듈 최상위 상수에 t() 결과를 저장하지 말 것.

export const LANGUAGES = [
  { code: 'en', label: 'English', locale: 'en-US' },
  { code: 'ko', label: '한국어', locale: 'ko-KR' },
  { code: 'ja', label: '日本語', locale: 'ja-JP' },
  { code: 'ru', label: 'Русский', locale: 'ru-RU' },
  { code: 'zh', label: '中文', locale: 'zh-CN' },
];
const CODES = LANGUAGES.map((l) => l.code);
const messages = Object.fromEntries(CODES.map((c) => [c, {}]));
const listeners = new Set();
const STORAGE_KEY = 'lang';

function detectBrowser() {
  const list = (typeof navigator !== 'undefined' && (navigator.languages?.length ? navigator.languages : [navigator.language])) || [];
  for (const l of list) {
    const c = String(l || '').toLowerCase().slice(0, 2);
    if (CODES.includes(c)) return c;
  }
  return 'en';
}
function readPref() {
  try { const v = localStorage.getItem(STORAGE_KEY); return v === 'auto' || CODES.includes(v) ? v : 'auto'; } catch { return 'auto'; }
}

let pref = readPref();
let lang = pref === 'auto' ? detectBrowser() : pref;
if (typeof document !== 'undefined') document.documentElement.lang = lang;

/** 현재 적용 중인 언어 코드 */
export const getLang = () => lang;
/** 사용자가 고른 설정: 'auto' 또는 언어 코드 */
export const getPref = () => pref;
export const getLocale = () => LANGUAGES.find((l) => l.code === lang).locale;

export function setLang(next) {
  pref = next === 'auto' || CODES.includes(next) ? next : 'auto';
  try { localStorage.setItem(STORAGE_KEY, pref); } catch { /* 저장소 사용 불가 */ }
  lang = pref === 'auto' ? detectBrowser() : pref;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  listeners.forEach((fn) => fn(lang));
}
/** 언어가 바뀔 때 호출될 콜백 등록 (반환값: 해제 함수) */
export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function defineMessages(ns, byLang) {
  for (const code of CODES) {
    const dict = byLang[code];
    if (!dict) continue;
    for (const [k, v] of Object.entries(dict)) messages[code][`${ns}.${k}`] = v;
  }
}

export function t(key, vars) {
  let s = messages[lang][key] ?? messages.en[key] ?? messages.ko[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
  return s;
}
/** 키가 현재 언어/영어/한국어 어디에도 없으면 null */
export function tOrNull(key) {
  return messages[lang][key] ?? messages.en[key] ?? messages.ko[key] ?? null;
}

/** ESI 에서 받은 이름 객체 {en, ko, ja, ru, zh, ...} 에서 현재 언어 이름을 고른다 (없으면 영어) */
export function nameOf(entry) {
  if (!entry) return '';
  return entry[lang] || entry.en || '';
}

export const formatDate = (ms) => new Date(ms).toLocaleString(getLocale());
export const formatNumber = (n) => Number(n).toLocaleString(getLocale());
