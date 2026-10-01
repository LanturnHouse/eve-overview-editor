// 편집 중인 모델의 단일 저장소. 모델은 JSON 직렬화 가능한 평범한 객체다 (model.js 참고).
//
// 패널 규칙:
//  - 모델을 직접 수정한 뒤 반드시 store.commit('라벨') 을 호출한다. (되돌리기 스냅샷 + 변경 표시)
//  - 같은 라벨의 연속 commit 은 0.8초 안이면 하나의 되돌리기 단계로 합쳐진다. (타이핑 등)
//  - 'change' 이벤트: commit 직후. 패널이 자기 화면을 다시 그릴 필요는 없다 (포커스 유지).
//  - 'reload' 이벤트: 파일 열기 / 되돌리기 / 다시 실행으로 모델이 통째로 바뀜. 셸이 활성 패널을 다시 그린다.
import { clone } from './model.js';

const listeners = { change: new Set(), reload: new Set() };
const emit = (ev, arg) => listeners[ev].forEach((fn) => fn(arg));

let model = null;
let history = [];      // JSON 스냅샷
let cursor = -1;
let savedSnap = null;  // 마지막으로 저장/로드된 스냅샷
let lastLabel = null, lastTime = 0;

export const store = {
  get model() { return model; },
  fileName: null,
  on(ev, fn) { listeners[ev].add(fn); return () => listeners[ev].delete(fn); },

  get dirty() { return model !== null && JSON.stringify(model) !== savedSnap; },
  get canUndo() { return cursor > 0; },
  get canRedo() { return cursor < history.length - 1; },

  load(newModel, fileName) {
    model = newModel;
    this.fileName = fileName;
    history = [JSON.stringify(model)];
    cursor = 0;
    savedSnap = history[0];
    lastLabel = null;
    emit('reload');
    emit('change');
  },
  markSaved(fileName) {
    if (fileName) this.fileName = fileName;
    savedSnap = JSON.stringify(model);
    emit('change');
  },
  commit(label = 'edit') {
    const snap = JSON.stringify(model);
    if (snap === history[cursor]) return;
    const now = Date.now();
    history = history.slice(0, cursor + 1);
    if (label === lastLabel && now - lastTime < 800 && cursor > 0) history[cursor] = snap;
    else { history.push(snap); cursor++; if (history.length > 200) { history.shift(); cursor--; } }
    lastLabel = label; lastTime = now;
    emit('change');
  },
  /** 모델을 통째로 교체하되 되돌리기 기록은 유지 (YAML 텍스트 직접 적용 등) */
  replaceModel(newModel, label = 'replace') {
    model = newModel;
    history = history.slice(0, cursor + 1);
    history.push(JSON.stringify(model)); cursor++;
    lastLabel = null;
    emit('reload'); emit('change');
  },
  get savedModel() { return savedSnap ? JSON.parse(savedSnap) : null; },
  undo() { if (this.canUndo) { cursor--; model = JSON.parse(history[cursor]); lastLabel = null; emit('reload'); emit('change'); } },
  redo() { if (this.canRedo) { cursor++; model = JSON.parse(history[cursor]); lastLabel = null; emit('reload'); emit('change'); } },

  // ---- 여러 패널이 공유하는 모델 연산 ----
  presetNames() { return model.presets.map((p) => p.name); },
  /** 프리셋 이름 변경: 탭이 참조하는 이름도 함께 바꾼다. 중복/빈 이름이면 false. */
  renamePreset(index, newName) {
    newName = newName.trim();
    const p = model.presets[index];
    if (!newName || model.presets.some((q, i) => i !== index && q.name === newName)) return false;
    for (const t of model.tabs) {
      if (t.overview === p.name) t.overview = newName;
      if (t.bracket === p.name) t.bracket = newName;
    }
    p.name = newName;
    this.commit('rename-preset');
    return true;
  },
  /** 프리셋을 참조하는 탭 목록 */
  tabsUsingPreset(name) {
    return model.tabs.map((t, i) => ({ t, i })).filter(({ t }) => t.overview === name || t.bracket === name);
  },
  uniquePresetName(base) {
    let n = base, k = 2;
    while (model.presets.some((p) => p.name === n)) n = `${base} (${k++})`;
    return n;
  },
};

export { clone };
