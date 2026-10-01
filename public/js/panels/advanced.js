// 파일 · 고급: 오버뷰 폴더, 백업 복원, 정리 도구, 기타 설정, 변경 요약, YAML 직접 보기/적용.
import { parseOverview, serializeOverview, clone } from '../model.js';
import { store } from '../store.js';
import { getGroupData } from '../data.js';
import { h, toast, confirmDialog, promptDialog } from '../ui.js';
import { serverApi, shell } from '../app.js';

const fmtTime = (ms) => new Date(ms).toLocaleString('ko-KR');

export default async function render(root) {
  const m = store.model;
  root.replaceChildren(
    h('div', { class: 'panel-head' }, h('h2', {}, '파일 · 고급'),
      h('p', {}, '오버뷰 폴더, 백업, 정리 도구, YAML 원문을 다룹니다.')),
    folderCard(), changesCard(m), cleanupCard(m), settingsCard(m), backupsCard(), yamlCard(m),
  );
}

function folderCard() {
  const dirEl = h('span', { class: 'mono' }, shell.getDir());
  return h('section', { class: 'card' },
    h('h3', {}, '오버뷰 폴더'),
    h('p', { class: 'hint' }, '게임이 내보내기/가져오기에 쓰는 폴더입니다. 저장하면 이 폴더의 파일에 직접 기록되며, 덮어쓰기 전에 이전 버전이 앱 폴더의 backups/ 에 자동 백업됩니다.'),
    h('div', { class: 'toolbar', style: { marginTop: '8px' } }, dirEl,
      h('button', { class: 'btn', onclick: async () => {
        const d = await promptDialog('오버뷰 폴더의 전체 경로', shell.getDir());
        if (!d) return;
        try { const r = await serverApi('/api/dir', { method: 'POST', body: JSON.stringify({ dir: d.trim() }) }); await shell.refreshFiles(); dirEl.textContent = r.dir; toast('폴더를 변경했습니다.', 'ok'); }
        catch (e) { toast(e.message, 'error', 5000); }
      } }, '폴더 변경…')));
}

// ---- 변경 요약 ----
function diffSummary(a, b) {
  const rows = [];
  const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const names = new Set([...a.presets.map((p) => p.name), ...b.presets.map((p) => p.name)]);
  for (const n of names) {
    const pa = a.presets.find((p) => p.name === n), pb = b.presets.find((p) => p.name === n);
    if (!pa) rows.push(`프리셋 추가: ${n}`);
    else if (!pb) rows.push(`프리셋 삭제: ${n}`);
    else {
      const sa = new Set(pa.groups), sb = new Set(pb.groups);
      const add = [...sb].filter((x) => !sa.has(x)).length, del = [...sa].filter((x) => !sb.has(x)).length;
      const bits = [];
      if (add || del) bits.push(`그룹 +${add} / −${del}`);
      if (!eq(pa.filteredStates, pb.filteredStates)) bits.push('숨김 상태 변경');
      if (!eq(pa.alwaysShownStates, pb.alwaysShownStates)) bits.push('항상 표시 상태 변경');
      if (bits.length) rows.push(`프리셋 ${n}: ${bits.join(', ')}`);
    }
  }
  if (!eq(a.presets.map((p) => p.name), b.presets.map((p) => p.name)) && a.presets.length === b.presets.length) rows.push('프리셋 순서/이름 변경');
  if (!eq(a.tabs, b.tabs)) rows.push('오버뷰 탭 변경');
  if (!eq([a.flagOrder, a.flagStates, a.backgroundOrder, a.backgroundStates, a.stateColors, a.stateBlinks],
    [b.flagOrder, b.flagStates, b.backgroundOrder, b.backgroundStates, b.stateColors, b.stateBlinks])) rows.push('깃발 · 배경 설정 변경');
  if (!eq([a.overviewColumns, a.columnOrder], [b.overviewColumns, b.columnOrder])) rows.push('컬럼 설정 변경');
  if (!eq([a.shipLabelOrder, a.shipLabels], [b.shipLabelOrder, b.shipLabels])) rows.push('선박 라벨 변경');
  if (!eq(a.userSettings, b.userSettings)) rows.push('기타 설정 변경');
  return rows;
}
function changesCard(m) {
  const saved = store.savedModel;
  const rows = saved ? diffSummary(saved, m) : [];
  return h('section', { class: 'card' },
    h('h3', {}, '마지막 저장 이후 변경 사항'),
    rows.length ? h('ul', { class: 'ad-list' }, rows.map((r) => h('li', {}, r))) : h('p', { class: 'muted' }, '변경 사항이 없습니다.'));
}

// ---- 정리 도구 ----
function cleanupCard(m) {
  const groups = getGroupData()?.groups ?? {};
  const unknown = new Set();
  for (const p of m.presets) for (const g of p.groups) if (!groups[g]) unknown.add(g);
  const used = new Set(m.tabs.flatMap((t) => [t.overview, t.bracket]));
  const unused = m.presets.filter((p) => !used.has(p.name)).map((p) => p.name);
  const names = new Set(m.presets.map((p) => p.name));
  const broken = m.tabs.map((t, i) => ({ t, i })).filter(({ t }) => (t.overview && !names.has(t.overview)) || (t.bracket !== '_BracketFilterShowAll' && t.bracket && !names.has(t.bracket)));
  return h('section', { class: 'card' },
    h('h3', {}, '정리 도구'),
    h('div', { class: 'ad-row' },
      h('span', {}, `알 수 없는(삭제된) 그룹 ID: ${unknown.size}개`, unknown.size ? h('span', { class: 'muted mono small' }, ` ( ${[...unknown].join(', ')} )`) : null),
      h('button', { class: 'btn small', disabled: !unknown.size, onclick: async () => {
        if (!(await confirmDialog(`모든 프리셋에서 알 수 없는 그룹 ID ${unknown.size}개를 제거할까요?`, { ok: '제거' }))) return;
        for (const p of m.presets) p.groups = p.groups.filter((g) => groups[g]);
        store.commit('cleanup-groups'); toast('제거했습니다.', 'ok'); render(document.querySelector('.main'));
      } }, '모두 제거')),
    h('div', { class: 'ad-row' }, `어느 탭에서도 쓰지 않는 프리셋: ${unused.length ? unused.join(', ') : '없음'}`),
    h('div', { class: 'ad-row' }, broken.length
      ? h('span', { class: 'warn' }, `존재하지 않는 프리셋을 참조하는 탭: ${broken.map(({ t, i }) => `#${i} ${t.name.replace(/<[^>]*>/g, '')}`).join(', ')}`)
      : '프리셋 참조 오류: 없음'));
}

function settingsCard(m) {
  const cb = h('input', { type: 'checkbox', checked: !!m.userSettings.applyToOtherObjects, onchange: () => {
    m.userSettings.applyToOtherObjects = cb.checked; store.commit('user-settings');
  } });
  return h('section', { class: 'card' },
    h('h3', {}, '기타 설정'),
    h('label', { class: 'check' }, cb, h('span', {}, 'applyToOtherObjects'),
      h('span', { class: 'muted small' }, ' — 게임의 "기타 오브젝트에도 적용" 옵션(userSettings)')));
}

// ---- 백업 ----
function backupsCard() {
  const box = h('div', {}, h('p', { class: 'muted' }, '불러오는 중…'));
  serverApi('/api/backups').then(({ backups }) => {
    box.replaceChildren(backups.length
      ? h('table', { class: 'grid' }, h('tbody', {}, backups.slice(0, 30).map((b) => h('tr', {},
        h('td', { class: 'mono small' }, b.name), h('td', { class: 'muted small' }, fmtTime(b.mtime)),
        h('td', {}, h('button', { class: 'btn small', onclick: async () => {
          if (store.dirty && !(await confirmDialog('저장하지 않은 변경 사항이 사라집니다. 이 백업을 불러올까요?', { ok: '불러오기', danger: true }))) return;
          const r = await serverApi(`/api/backup?name=${encodeURIComponent(b.name)}`);
          store.load(parseOverview(r.text), null);
          toast('백업을 불러왔습니다. 저장하려면 "다른 이름으로…"를 사용하세요.', 'info', 5000);
        } }, '불러오기'))))))
      : h('p', { class: 'muted' }, '아직 백업이 없습니다. (저장 시 기존 파일을 덮어쓰면 자동 생성됩니다)'));
  }).catch((e) => box.replaceChildren(h('p', { class: 'warn' }, e.message)));
  return h('section', { class: 'card' }, h('h3', {}, '자동 백업'), box);
}

// ---- YAML ----
function yamlCard(m) {
  const ta = h('textarea', { class: 'mono', rows: 14, spellcheck: 'false', value: serializeOverview(m), style: { fontSize: '12px' } });
  return h('section', { class: 'card' },
    h('h3', {}, 'YAML 원문'),
    h('p', { class: 'hint' }, '저장될 내용 그대로입니다. 직접 고친 뒤 "텍스트 적용"을 누르면 편집기에 반영됩니다. (되돌리기 가능)'),
    h('div', { class: 'toolbar', style: { marginTop: '8px' } },
      h('button', { class: 'btn', onclick: () => { ta.value = serializeOverview(store.model); } }, '현재 상태로 새로고침'),
      h('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(ta.value); toast('복사했습니다.', 'ok', 1500); } catch { ta.select(); } } }, '복사'),
      h('button', { class: 'btn primary', onclick: () => {
        try { store.replaceModel(parseOverview(ta.value), 'yaml-text'); toast('YAML 을 적용했습니다.', 'ok'); }
        catch (e) { toast(`YAML 오류: ${e.message}`, 'error', 7000); }
      } }, '텍스트 적용')),
    ta);
}
