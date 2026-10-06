// ESI에서 그룹/카테고리 이름(영어/한국어/일본어/러시아어/중국어)을 받아 data/groups.json 으로 저장한다.
import { writeFileSync } from 'node:fs';
const ESI = 'https://esi.evetech.net/latest';
async function get(path, lang) {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(`${ESI}${path}${path.includes('?') ? '&' : '?'}language=${lang}`);
      if (r.ok) return r.json();
      if (r.status === 404) return null;
    } catch {}
    await new Promise(r => setTimeout(r, 500 * (i + 1)));
  }
  throw new Error('failed ' + path);
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}
const LANGS = ['en', 'ko', 'ja', 'ru', 'zh'];
const names = async (path) => {
  const rs = await Promise.all(LANGS.map((l) => get(path, l)));
  return rs[0] ? { rs, base: rs[0] } : null;
};
const catIds = await get('/universe/categories/', 'en');
console.log('categories', catIds.length);
const cats = {};
await pool(catIds, 20, async id => {
  const r = await names(`/universe/categories/${id}/`);
  if (r) cats[id] = { ...Object.fromEntries(LANGS.map((l, i) => [l, r.rs[i]?.name || r.base.name])), pub: r.base.published };
});
let groupIds = [];
for (let p = 1; ; p++) {
  const r = await fetch(`${ESI}/universe/groups/?page=${p}`);
  if (!r.ok) break;
  const j = await r.json(); if (!j.length) break;
  groupIds.push(...j);
  if (p >= +r.headers.get('x-pages')) break;
}
console.log('groups', groupIds.length);
const groups = {};
let done = 0;
await pool(groupIds, 25, async id => {
  const r = await names(`/universe/groups/${id}/`);
  if (r) groups[id] = { ...Object.fromEntries(LANGS.map((l, i) => [l, r.rs[i]?.name || r.base.name])), cat: r.base.category_id, pub: r.base.published };
  if (++done % 200 === 0) console.log(done);
});
writeFileSync('public/data/groups.json', JSON.stringify({ categories: cats, groups }));
console.log('saved', Object.keys(groups).length);
