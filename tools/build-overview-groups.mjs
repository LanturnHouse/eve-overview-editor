// 게임의 오버뷰 설정(필터 → 유형)이 실제로 보여주는 그룹 ID 목록을 만들어 public/data/overview-groups.json 에 저장한다.
// ESI 의 그룹 목록에는 탄약·스크립트, 지역/성계, 행성 산업 설비, 개발용 그룹처럼 게임 오버뷰에는 나오지 않는 것이 많이 섞여 있다.
// 근거 1: Z-S Overview Customizer(https://github.com/Arziel1992/Z-S-Overview-Customizer)가 게임에서 "모든 엔티티"를 선택해 내보낸 자료를
//         바탕으로 최신 게임 데이터에서 다시 걸러 낸 matrix_latest.json. 거기서 그룹 ID 만 가져온다 (ID 는 게임 데이터의 사실 정보).
// 근거 2(권장): 내 클라이언트에서 유형 목록을 전부 체크해 내보낸 파일. Z-S 목록은 게임 버전이 달라 몇 개 더 있거나 모자랄 수 있으므로,
//         이 파일의 프리셋에 실제로 들어 있는 그룹과 겹치는 것만 남긴다.
// 사용: node tools/build-overview-groups.mjs [--export <내보낸 yaml> --preset <전부 체크한 프리셋 이름, 기본 Main>]   (인터넷 필요)
import fs from 'node:fs';
import { parseOverview } from '../public/js/model.js';

const arg = (name, def = null) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`--${name} needs a value`);
  return v;
};

const URL = 'https://raw.githubusercontent.com/Arziel1992/Z-S-Overview-Customizer/main/public/data/matrix_latest.json';
const r = await fetch(URL);
if (!r.ok) throw new Error(`download failed: ${r.status}`);
const m = await r.json();
let ids = [...new Set(Object.values(m.categories).flatMap((c) => c.groups))].sort((a, b) => a - b);
const zs = ids.length;
let source = 'Z-S Overview Customizer, public/data/matrix_latest.json (based on an in-game export of an all-entities preset)';

const exportFile = arg('export');
if (exportFile) {
  const presetName = arg('preset', 'Main');
  const model = parseOverview(fs.readFileSync(exportFile, 'utf8'));
  const preset = model.presets.find((p) => p.name === presetName);
  if (!preset) throw new Error(`preset "${presetName}" not found in ${exportFile}`);
  const ticked = new Set(preset.groups);
  const dropped = ids.filter((id) => !ticked.has(id));
  ids = ids.filter((id) => ticked.has(id));
  console.log(`confirmed against ${exportFile} (preset ${presetName}, ${ticked.size} groups): kept ${ids.length} of ${zs}, dropped ${dropped.length}: ${dropped.join(',')}`);
  source += `, limited to the groups of an in-game export with every type ticked (${ids.length} of ${zs})`;
}

// 우리 그룹 데이터(groups.json)와 맞춰 본다
const gd = JSON.parse(fs.readFileSync('public/data/groups.json', 'utf8'));
const missing = ids.filter((id) => !gd.groups[id]);
if (missing.length) console.warn(`! ${missing.length} ids are not in groups.json (run tools/build-data.mjs first): ${missing.slice(0, 10).join(', ')}`);
const cats = {};
for (const id of ids) { const c = gd.groups[id]?.cat; if (c !== undefined) cats[c] = (cats[c] || 0) + 1; }

fs.writeFileSync('public/data/overview-groups.json', JSON.stringify({
  source,
  compiledAt: m.metadata?.compiledAt ?? null,
  categories: cats,
  ids,
}) + '\n');
console.log(`saved ${ids.length} group ids in ${Object.keys(cats).length} categories`);
