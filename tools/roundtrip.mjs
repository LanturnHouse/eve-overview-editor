import { readFileSync } from 'node:fs';
import { parseOverview, serializeOverview } from '../public/js/model.js';
const src = readFileSync(process.argv[2], 'utf8');
const out = serializeOverview(parseOverview(src));
const a = src.replace(/\r\n/g, '\n').split('\n'), b = out.split('\n');
let diffs = 0;
for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { if (diffs++ < 15) console.log(i + 1, JSON.stringify(a[i]), '=>', JSON.stringify(b[i])); }
console.log(diffs ? `${diffs} differing lines` : 'IDENTICAL', a.length, b.length);
