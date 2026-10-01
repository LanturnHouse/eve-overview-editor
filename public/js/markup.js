// EVE 인게임 마크업(<color=0xAARRGGBB>, <fontsize=N>, <b>, <i>, <u>, <br>) -> 미리보기용 HTML.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function argbToCss(hex) {
  let h = String(hex ?? '').trim().replace(/^0x/i, '').replace(/^#/, '');
  if (h.length === 8) h = h.slice(2);
  return /^[0-9a-f]{6}$/i.test(h) ? `#${h.toLowerCase()}` : '#ffffff';
}
export const cssToArgb = (css) => `0xff${String(css).replace('#', '').toLowerCase()}`;

// EVE 마크업은 태그가 열린 채로 다음 조각까지 이어지는 일이 흔하므로, 열린 span 을 직접 세어 균형을 맞춘다.
export function renderMarkup(raw) {
  if (raw == null) return '';
  const parts = String(raw).split(/(<\/?[a-z]+(?:=[^>]*)?>)/i);
  let out = '', open = 0;
  for (const part of parts) {
    const m = /^<(\/?)([a-z]+)(?:=([^>]*))?>$/i.exec(part);
    if (!m) { out += esc(part); continue; }
    const [, close, tag, val] = m, t = tag.toLowerCase();
    if (t === 'br') { out += '<br>'; continue; }
    if (!['color', 'fontsize', 'b', 'i', 'u'].includes(t)) { out += esc(part); continue; }
    if (close) { if (open > 0) { open--; out += '</span>'; } continue; }
    open++;
    if (t === 'color') out += `<span style="color:${argbToCss(val)}">`;
    else if (t === 'fontsize') out += `<span style="font-size:${parseInt(val, 10) || 12}px">`;
    else if (t === 'b') out += '<span style="font-weight:700">';
    else if (t === 'i') out += '<span style="font-style:italic">';
    else out += '<span style="text-decoration:underline">';
  }
  return out + '</span>'.repeat(open);
}
