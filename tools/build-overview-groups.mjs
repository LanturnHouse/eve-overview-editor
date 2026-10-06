// 게임의 오버뷰 설정(필터 → 유형)이 실제로 보여주는 그룹 ID 목록을 만들어 public/data/overview-groups.json 에 저장한다.
// ESI 의 그룹 목록에는 탄약·스크립트, 지역/성계, 행성 산업 설비, 개발용 그룹처럼 게임 오버뷰에는 나오지 않는 것이 많이 섞여 있다.
// 근거: Z-S Overview Customizer(https://github.com/Arziel1992/Z-S-Overview-Customizer)가 게임에서 "모든 엔티티"를 선택해 내보낸 자료를
// 바탕으로 최신 게임 데이터에서 다시 걸러 낸 matrix_latest.json. 거기서 그룹 ID 만 가져온다 (ID 는 게임 데이터의 사실 정보).
// 사용: node tools/build-overview-groups.mjs     (인터넷 필요)
import fs from 'node:fs';

const URL = 'https://raw.githubusercontent.com/Arziel1992/Z-S-Overview-Customizer/main/public/data/matrix_latest.json';
const r = await fetch(URL);
if (!r.ok) throw new Error(`download failed: ${r.status}`);
const m = await r.json();
const ids = [...new Set(Object.values(m.categories).flatMap((c) => c.groups))].sort((a, b) => a - b);
const cats = Object.fromEntries(Object.entries(m.categories).map(([id, c]) => [id, c.groups.length]));

// 우리 그룹 데이터(groups.json)와 맞춰 본다
const gd = JSON.parse(fs.readFileSync('public/data/groups.json', 'utf8'));
const missing = ids.filter((id) => !gd.groups[id]);
if (missing.length) console.warn(`! ${missing.length} ids are not in groups.json (run tools/build-data.mjs first): ${missing.slice(0, 10).join(', ')}`);

fs.writeFileSync('public/data/overview-groups.json', JSON.stringify({
  source: 'Z-S Overview Customizer, public/data/matrix_latest.json (based on an in-game export of an all-entities preset)',
  compiledAt: m.metadata?.compiledAt ?? null,
  categories: cats,
  ids,
}) + '\n');
console.log(`saved ${ids.length} group ids in ${Object.keys(cats).length} categories`);
