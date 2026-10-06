// 메인 색 하나를 고르면 어울리면서 잘 읽히는 서브 색을 추천한다.
// "잘 읽힘" = 5개 리전 배경 이미지에서 대비 3.0 이상으로 읽히는 픽셀의 비율 (data/bg-luminance.json: tools/build-bg-luminance.py 로 생성).
// DOM 에 의존하지 않아 Node 에서 시험할 수 있다. 읽기 점수를 쓰려면 먼저 setBgLuminance() 또는 loadBgLuminance() 를 호출한다.

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ------------------------------------------------------------------ 색 변환
export const normHex = (v) => {
  const s = String(v ?? '').trim().replace(/^0x/i, '').replace(/^#/, '');
  const six = s.length === 8 ? s.slice(2) : s;
  return /^[0-9a-f]{6}$/i.test(six) ? six.toUpperCase() : null;
};
export const hexToRgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
export const rgbToHex = (rgb) => rgb.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('').toUpperCase();
export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
export const hslToHex = (h, s, l) => rgbToHex(hslToRgb(h, s, l));

// ------------------------------------------------------------------ 가독성
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export const relLuminance = (hex) => { const [r, g, b] = hexToRgb(hex); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
export const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

let BG = null;
export function setBgLuminance(data) { BG = data; }
export async function loadBgLuminance() {
  if (!BG) BG = await (await fetch('data/bg-luminance.json')).json();
  return BG;
}
/** 글자색이 각 리전 배경에서 읽히는 픽셀 비율: { avg, worst, per: {brown, blue, ...} } (0~1). 배경 데이터가 없으면 null */
export function coverage(hex, threshold = 3) {
  if (!BG) return null;
  const L = relLuminance(hex), per = {};
  let sum = 0, worst = 1, n = 0;
  for (const [id, hist] of Object.entries(BG.images)) {
    let ok = 0;
    for (let i = 0; i < hist.length; i++) if (contrast(L, (i + 0.5) / BG.bins) >= threshold) ok += hist[i];
    per[id] = ok; sum += ok; worst = Math.min(worst, ok); n++;
  }
  return { avg: sum / n, worst, per };
}
/** 읽기 점수가 목표에 못 미치면 같은 색조를 유지한 채 밝기를 올린다 */
export function ensureReadable(hex, minWorst = 0.75) {
  if (!BG) return hex;
  let [h, s, l] = rgbToHsl(hexToRgb(hex));
  let cur = hex;
  for (let i = 0; i < 40 && coverage(cur).worst < minWorst && l < 0.97; i++) {
    l = Math.min(0.97, l + 0.02);
    cur = hslToHex(h, s, l);
  }
  return cur;
}

// ------------------------------------------------------------------ 추천
export const SCHEMES = ['tint', 'analogous', 'complement', 'neutral'];
const ACCENT_HUE = 45; // 메인 색이 무채색일 때 쓰는 포인트 색조(황금빛)

/**
 * 메인 색(hex) -> 서브 색 3개 [주조각2, 보조 회색조, 가장 옅은 색]. 라벨에서는 보통 [파일럿 이름, 콥, 얼라이언스].
 * 모든 서브 색은 읽기 점수를 만족하도록 밝기가 보정된다.
 */
export function recommend(mainHex, scheme = 'tint') {
  const main = normHex(mainHex) ?? 'FFFFFF';
  const [h, s] = rgbToHsl(hexToRgb(main));
  const gray = s < 0.08;                                  // 무채색 메인
  const sat = (k, lo, hi) => (gray ? 0 : clamp(s * k, lo, hi));
  let sub1, sub2, sub3;
  if (scheme === 'neutral') { sub1 = 'F2F2F2'; sub2 = 'D9D9D9'; sub3 = 'FFFFFF'; }
  else {
    const base = gray ? ACCENT_HUE : h;
    const sat1 = scheme === 'tint' ? (gray ? 0 : sat(0.75, 0.3, 0.9)) : 0.8;
    let hue1 = base;
    if (scheme === 'complement') hue1 = base + 180;
    else if (scheme === 'analogous') {
      // 이웃 색조는 +35° / −35° 중 배경에서 더 잘 읽히는 쪽 (같으면 따뜻한 쪽인 −35°)
      const a = hslToHex(base - 35, sat1, 0.8), b = hslToHex(base + 35, sat1, 0.8);
      const ca = coverage(a), cb = coverage(b);
      hue1 = ca && cb && cb.avg > ca.avg + 0.005 ? base + 35 : base - 35;
    }
    sub1 = hslToHex(hue1, sat1, 0.8);
    sub2 = hslToHex(h, sat(0.18, 0.05, 0.2), 0.86);
    sub3 = hslToHex(h, gray ? 0 : 0.06, 0.96);
  }
  return [sub1, sub2, sub3].map((x) => ensureReadable(x));
}
