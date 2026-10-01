// 패널들이 공통으로 쓰는 작은 UI 도우미.

/** h('div', {class:'a', onclick:fn, dataset:{x:1}, style:{color:'red'}}, '텍스트', h('span')) */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected' || k === 'indeterminate') el[k] = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

let toastBox;
export function toast(msg, kind = 'info', ms = 3200) {
  if (!toastBox) toastBox = document.body.appendChild(h('div', { class: 'toasts' }));
  const t = h('div', { class: `toast ${kind}` }, msg);
  toastBox.append(t);
  setTimeout(() => t.remove(), ms);
}

function modal(build) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'modal' });
    const done = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    build(dlg, done);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
    document.body.append(dlg);
    dlg.showModal();
  });
}
/** 확인 대화상자 -> Promise<boolean> */
export const confirmDialog = (message, { ok = '확인', danger = false } = {}) =>
  modal((dlg, done) => dlg.append(
    h('p', { class: 'modal-msg' }, message),
    h('div', { class: 'modal-actions' },
      h('button', { class: 'btn', onclick: () => done(false) }, '취소'),
      h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => done(true) }, ok)),
  )).then((v) => v === true);
/** 한 줄 입력 대화상자 -> Promise<string|null> */
export const promptDialog = (title, value = '', { ok = '확인' } = {}) =>
  modal((dlg, done) => {
    const input = h('input', { type: 'text', class: 'input', value, style: { width: '100%' } });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(input.value); });
    dlg.append(h('p', { class: 'modal-msg' }, title), input,
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', onclick: () => done(null) }, '취소'),
        h('button', { class: 'btn primary', onclick: () => done(input.value) }, ok)));
    setTimeout(() => { input.focus(); input.select(); }, 0);
  });

/**
 * 드래그로 순서 바꾸기. listEl 의 직계 자식 중 `.grip` 을 잡고 끌 수 있다.
 * 자식 요소는 DOM 순서 == 데이터 순서여야 한다. onSort(from, to) 는 이동 후의 인덱스를 준다.
 * 호출 후 목록을 다시 그리는 것은 onSort 쪽 책임.
 */
export function makeSortable(listEl, onSort) {
  let from = -1;
  const rows = () => [...listEl.children];
  listEl.addEventListener('dragstart', (e) => {
    const row = e.target.closest?.('[data-sortable]') || e.target;
    if (!listEl.contains(row) || row.parentElement !== listEl) return;
    from = rows().indexOf(row);
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(from));
  });
  listEl.addEventListener('dragend', () => {
    rows().forEach((r) => r.classList.remove('dragging', 'drop-before', 'drop-after'));
    from = -1;
  });
  listEl.addEventListener('dragover', (e) => {
    if (from < 0) return;
    e.preventDefault();
    const row = e.target.closest('[data-sortable]');
    rows().forEach((r) => r.classList.remove('drop-before', 'drop-after'));
    if (!row || row.parentElement !== listEl) return;
    const rect = row.getBoundingClientRect();
    row.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drop-before' : 'drop-after');
  });
  listEl.addEventListener('drop', (e) => {
    if (from < 0) return;
    e.preventDefault();
    const row = e.target.closest('[data-sortable]');
    if (!row || row.parentElement !== listEl) return;
    const idx = rows().indexOf(row);
    const after = e.clientY >= row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
    let to = idx + (after ? 1 : 0);
    if (from < to) to--;
    const f = from; from = -1;
    rows().forEach((r) => r.classList.remove('dragging', 'drop-before', 'drop-after'));
    if (f !== to) onSort(f, to);
  });
}
/** 드래그 가능한 행을 만들 때: h('div', {draggable:'true', dataset:{sortable:''}}, gripHandle(), ...) */
export const gripHandle = () => h('span', { class: 'grip', title: '끌어서 순서 변경' }, '⋮⋮');

/** 배열 요소 이동 (제자리 수정) */
export function moveItem(arr, from, to) {
  const [x] = arr.splice(from, 1);
  arr.splice(to, 0, x);
}

export const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
