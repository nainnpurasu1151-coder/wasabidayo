'use strict';

/* =========================================================
 * がっこう手帳 — 中学生向け 時間割・持ち物・提出物・テスト管理
 * データはすべてこの端末の localStorage に保存されます。
 * ========================================================= */

const STORAGE_KEY = 'gakkou-techo:v1';
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

const DEFAULT_SUBJECTS = [
  ['国語', ['国語の教科書', '国語のノート', '漢字ドリル']],
  ['数学', ['数学の教科書', '数学のノート', '定規・コンパス']],
  ['英語', ['英語の教科書', '英語のノート', 'ワークブック']],
  ['理科', ['理科の教科書', '理科のノート', '資料集']],
  ['社会', ['社会の教科書', '社会のノート', '地図帳']],
  ['音楽', ['音楽の教科書', 'リコーダー']],
  ['美術', ['美術の教科書', '絵の具セット']],
  ['保健体育', ['体操服', '体育館シューズ']],
  ['技術・家庭', ['技術・家庭の教科書']],
  ['道徳', ['道徳の教科書']],
  ['総合', []],
  ['学活', []],
];

/* ---------- ユーティリティ ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function today() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function diffDays(fromDate, toDate) {
  return Math.round((toDate - fromDate) / 86400000);
}
function fmtDate(s) {
  const d = parseYmd(s);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}
function relLabel(s) {
  const n = diffDays(today(), parseYmd(s));
  if (n === 0) return { text: '今日', cls: 'warn' };
  if (n === 1) return { text: '明日', cls: 'gold' };
  if (n < 0) return { text: `${-n}日すぎてる`, cls: 'warn' };
  if (n <= 3) return { text: `あと${n}日`, cls: 'gold' };
  return { text: `あと${n}日`, cls: '' };
}

/* ---------- 状態 ---------- */
function defaultState() {
  const subjects = DEFAULT_SUBJECTS.map(([name, items]) => ({ id: uid(), name, items }));
  const timetable = {};
  for (let w = 1; w <= 6; w++) timetable[w] = Array(7).fill(null);
  return {
    version: 1,
    schoolName: '',
    days: 5, // 5 = 月〜金, 6 = 月〜土
    periods: 6,
    subjects,
    timetable,
    dailyItems: ['生徒手帳', '筆記用具', 'ハンカチ・ティッシュ', '水筒', 'マスク'],
    tasks: [],
    tests: [],
    extraItems: {}, // { 'YYYY-MM-DD': ['...'] }
    checked: {}, // { 'YYYY-MM-DD': ['持ち物名', ...] }
    noSchool: [], // 祝日・休校日 ['YYYY-MM-DD']
  };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return Object.assign(defaultState(), JSON.parse(raw));
  } catch (e) {
    console.warn('load failed', e);
  }
  return defaultState();
}
function save() {
  // 古いチェック記録は掃除しておく
  const limit = ymd(addDays(today(), -14));
  for (const k of Object.keys(state.checked)) if (k < limit) delete state.checked[k];
  for (const k of Object.keys(state.extraItems)) if (k < limit) delete state.extraItems[k];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    alert('保存できませんでした: ' + e.message);
  }
}

const subjectById = (id) => state.subjects.find((s) => s.id === id);
const subjectName = (id) => subjectById(id)?.name ?? '';

function isSchoolDay(d) {
  const w = d.getDay();
  if (w === 0 || w > state.days) return false;
  return !state.noSchool.includes(ymd(d));
}
function nextSchoolDay(from) {
  let d = addDays(from, 1);
  for (let i = 0; i < 30; i++, d = addDays(d, 1)) if (isSchoolDay(d)) return d;
  return null;
}
function lessonsOn(d) {
  const row = state.timetable[d.getDay()] || [];
  return row.slice(0, state.periods);
}
function itemsFor(dateStr) {
  const d = parseYmd(dateStr);
  const groups = [];
  const seen = new Set();
  const push = (title, items) => {
    const list = items.filter((x) => x && !seen.has(x));
    list.forEach((x) => seen.add(x));
    if (list.length) groups.push({ title, items: list });
  };
  push('毎日', state.dailyItems);
  for (const sid of new Set(lessonsOn(d).filter(Boolean))) {
    const s = subjectById(sid);
    if (s) push(s.name, s.items);
  }
  const due = state.tasks.filter((t) => t.due === dateStr && !t.done).map((t) => `【提出】${t.title}`);
  push('提出物', due);
  push('その他', state.extraItems[dateStr] || []);
  return groups;
}

/* ---------- ダイアログ ---------- */
function openDialog(html, onSubmit) {
  const dlg = $('#dialog');
  const form = $('#dialog-form');
  form.innerHTML = html;
  form.onsubmit = (e) => {
    const action = e.submitter?.value || 'ok';
    if (action === 'cancel') return;
    const result = onSubmit(action, new FormData(form), form);
    if (result === false) e.preventDefault();
  };
  dlg.showModal();
  const first = form.querySelector('input[type=text], textarea');
  if (first && !first.value) first.focus();
}
function closeDialog() {
  $('#dialog').close();
}

function subjectOptions(selected) {
  return (
    `<option value="">（なし）</option>` +
    state.subjects.map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)}</option>`).join('')
  );
}

/* ---------- 画面: 今日 ---------- */
function renderToday() {
  const t = today();
  const tStr = ymd(t);
  const next = nextSchoolDay(t);
  let html = '';

  // 今日の時間割
  html += `<h2>${fmtDate(tStr)} きょう</h2>`;
  if (isSchoolDay(t)) {
    html += `<div class="card">${lessonList(t)}</div>`;
  } else {
    html += `<div class="card accent"><div class="big">お休み 🌿</div></div>`;
  }

  // 次の登校日の持ち物
  if (next) {
    const nStr = ymd(next);
    const label = diffDays(t, next) === 1 ? 'あした' : '次の登校日';
    const groups = itemsFor(nStr);
    const checked = new Set(state.checked[nStr] || []);
    const all = groups.flatMap((g) => g.items);
    const doneCount = all.filter((x) => checked.has(x)).length;
    const complete = all.length > 0 && doneCount === all.length;

    html += `<h2>${fmtDate(nStr)} ${label}の準備</h2>`;
    html += `<div class="card ${complete ? 'accent' : ''}">`;
    html += `<div class="row between"><div class="muted">時間割</div></div>`;
    html += `<div class="chips">${
      lessonsOn(next)
        .map((sid, i) => `<span class="chip">${i + 1} ${esc(subjectName(sid) || '—')}</span>`)
        .join('') || '<span class="muted">未登録</span>'
    }</div>`;
    html += `<div class="row between" style="margin-top:14px"><div class="muted">持ち物 ${doneCount}/${all.length}</div>${
      complete ? '<div class="chip">準備OK！🎒</div>' : ''
    }</div>`;
    for (const g of groups) {
      html += `<div class="small muted" style="margin-top:10px">${esc(g.title)}</div><ul class="list">`;
      for (const item of g.items) {
        const on = checked.has(item);
        html += `<li class="${on ? 'done' : ''}"><input type="checkbox" class="check" data-pack="${esc(nStr)}" data-item="${esc(item)}" ${
          on ? 'checked' : ''
        } aria-label="${esc(item)}"><span class="label grow">${esc(item)}</span>${
          g.title === 'その他' ? `<button class="icon" data-del-extra="${esc(nStr)}" data-item="${esc(item)}" aria-label="削除">✕</button>` : ''
        }</li>`;
      }
      html += `</ul>`;
    }
    html += `<button class="ghost full" style="margin-top:10px" data-add-extra="${nStr}">＋ この日だけの持ち物を追加</button>`;
    html += `</div>`;
  }

  // 締め切りが近い提出物
  const soon = state.tasks
    .filter((x) => !x.done && diffDays(t, parseYmd(x.due)) <= 7)
    .sort((a, b) => a.due.localeCompare(b.due));
  html += `<h2>1週間以内の提出物</h2>`;
  html += soon.length
    ? `<div class="card"><ul class="list">${soon.map(taskLi).join('')}</ul></div>`
    : `<div class="card"><div class="empty-state">ありません 👍</div></div>`;

  // 次のテスト
  const nextTest = state.tests.filter((x) => x.date >= tStr).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (nextTest) {
    const n = diffDays(t, parseYmd(nextTest.date));
    html += `<h2>次のテスト</h2><div class="card gold" data-goto="tests"><div class="row between"><div class="grow"><div class="big">${esc(
      nextTest.name
    )}</div><div class="muted">${fmtDate(nextTest.date)}</div></div><div class="countdown">${
      n === 0 ? '今日' : `${n}<small>日</small>`
    }</div></div></div>`;
  }

  return html;
}

function lessonList(d) {
  const lessons = lessonsOn(d);
  if (!lessons.some(Boolean)) return `<div class="empty-state">時間割が未登録です。「時間割」タブから登録してね</div>`;
  return `<ul class="list">${lessons
    .map((sid, i) => `<li><span class="period">${i + 1}</span><span class="grow">${esc(subjectName(sid) || '—')}</span></li>`)
    .join('')}</ul>`;
}

/* ---------- 画面: 時間割 ---------- */
function renderTimetable() {
  const tw = today().getDay();
  let html = `<h2>時間割（マスをタップして教科を選ぶ）</h2><div class="tt-wrap"><table class="tt"><thead><tr><th class="pnum"></th>`;
  for (let w = 1; w <= state.days; w++) html += `<th class="${w === tw ? 'today' : ''}">${WEEKDAYS[w]}</th>`;
  html += `</tr></thead><tbody>`;
  for (let p = 0; p < state.periods; p++) {
    html += `<tr><th class="pnum">${p + 1}</th>`;
    for (let w = 1; w <= state.days; w++) {
      const sid = state.timetable[w][p];
      const name = subjectName(sid);
      html += `<td><button data-cell="${w}-${p}" class="${name ? '' : 'empty'}">${name ? esc(name) : '＋'}</button></td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table></div>`;
  html += `<p class="muted small">教科ごとの持ち物は「設定 → 教科と持ち物」で変えられます。時間割に合わせて「今日」タブの持ち物リストが自動で作られます。</p>`;
  return html;
}

function editCell(w, p) {
  const current = state.timetable[w][p];
  openDialog(
    `<h3>${WEEKDAYS[w]}曜 ${p + 1}時間目</h3>
     <label class="field"><span>教科</span><select name="sid">${subjectOptions(current)}</select></label>
     <div class="actions"><button class="ghost" value="cancel" formnovalidate>やめる</button><button class="primary" value="ok">決定</button></div>`,
    (_, fd) => {
      state.timetable[w][p] = fd.get('sid') || null;
      save();
      render();
    }
  );
}

/* ---------- 画面: 提出物 ---------- */
let taskFilter = 'open';

function taskLi(t) {
  const r = relLabel(t.due);
  const subj = subjectName(t.subjectId);
  return `<li class="${t.done ? 'done' : ''}">
    <input type="checkbox" class="check" data-task-done="${t.id}" ${t.done ? 'checked' : ''} aria-label="完了">
    <div class="grow" data-task-edit="${t.id}" style="cursor:pointer">
      <div class="label">${esc(t.title)}</div>
      <div class="muted small">${subj ? esc(subj) + '・' : ''}${fmtDate(t.due)}まで${t.memo ? '・' + esc(t.memo) : ''}</div>
    </div>
    ${t.done ? '' : `<span class="chip ${r.cls}">${r.text}</span>`}
  </li>`;
}

function renderTasks() {
  const open = state.tasks.filter((t) => !t.done).sort((a, b) => a.due.localeCompare(b.due));
  const done = state.tasks.filter((t) => t.done).sort((a, b) => b.due.localeCompare(a.due));
  const list = taskFilter === 'open' ? open : done;
  let html = `<div class="segmented">
    <button data-task-filter="open" class="${taskFilter === 'open' ? 'on' : ''}">まだ（${open.length}）</button>
    <button data-task-filter="done" class="${taskFilter === 'done' ? 'on' : ''}">おわった（${done.length}）</button>
  </div>`;
  html += list.length
    ? `<div class="card"><ul class="list">${list.map(taskLi).join('')}</ul></div>`
    : `<div class="card"><div class="empty-state">${taskFilter === 'open' ? '提出物はありません。右下の＋で追加できます' : 'まだありません'}</div></div>`;
  if (taskFilter === 'done' && done.length) html += `<button class="danger full" data-clear-done>おわった提出物をまとめて削除</button>`;
  html += `<button class="fab" data-add-task aria-label="提出物を追加">＋</button>`;
  return html;
}

function editTask(id) {
  const t = state.tasks.find((x) => x.id === id) || {
    id: null,
    title: '',
    subjectId: '',
    due: ymd(nextSchoolDay(today()) || addDays(today(), 1)),
    memo: '',
  };
  openDialog(
    `<h3>${t.id ? '提出物を編集' : '提出物を追加'}</h3>
     <label class="field"><span>なにを出す？</span><input type="text" name="title" required value="${esc(t.title)}" placeholder="例：数学ワーク p.20〜25"></label>
     <label class="field"><span>教科</span><select name="subjectId">${subjectOptions(t.subjectId)}</select></label>
     <label class="field"><span>しめきり</span><input type="date" name="due" required value="${esc(t.due)}"></label>
     <label class="field"><span>メモ</span><input type="text" name="memo" value="${esc(t.memo)}" placeholder="例：プリントも一緒に"></label>
     <div class="actions">
       ${t.id ? '<button class="danger" value="delete" formnovalidate style="margin-right:auto">削除</button>' : ''}
       <button class="ghost" value="cancel" formnovalidate>やめる</button>
       <button class="primary" value="ok">保存</button>
     </div>`,
    (action, fd) => {
      if (action === 'delete') {
        if (!confirm('削除しますか？')) return false;
        state.tasks = state.tasks.filter((x) => x.id !== t.id);
      } else {
        const data = {
          title: fd.get('title').trim(),
          subjectId: fd.get('subjectId') || '',
          due: fd.get('due'),
          memo: fd.get('memo').trim(),
        };
        if (t.id) Object.assign(state.tasks.find((x) => x.id === t.id), data);
        else state.tasks.push({ id: uid(), done: false, ...data });
      }
      save();
      render();
    }
  );
}

/* ---------- 画面: テスト ---------- */
function renderTests() {
  const tStr = ymd(today());
  const upcoming = state.tests.filter((x) => x.date >= tStr).sort((a, b) => a.date.localeCompare(b.date));
  const past = state.tests.filter((x) => x.date < tStr).sort((a, b) => b.date.localeCompare(a.date));
  let html = `<h2>これからのテスト</h2>`;
  if (!upcoming.length) html += `<div class="card"><div class="empty-state">予定はありません。右下の＋で追加できます</div></div>`;
  for (const x of upcoming) {
    const n = diffDays(today(), parseYmd(x.date));
    html += `<div class="card ${n <= 7 ? 'gold' : ''}" data-test-edit="${x.id}" style="cursor:pointer">
      <div class="row between">
        <div class="grow"><div class="big">${esc(x.name)}</div><div class="muted">${fmtDate(x.date)}</div></div>
        <div class="countdown">${n === 0 ? '今日' : `${n}<small>日</small>`}</div>
      </div>
      ${x.subjects.length ? `<div class="chips">${x.subjects.map((s) => `<span class="chip">${esc(subjectName(s))}</span>`).join('')}</div>` : ''}
      ${x.memo ? `<div class="small" style="margin-top:8px;white-space:pre-wrap">${esc(x.memo)}</div>` : ''}
    </div>`;
  }
  if (past.length) {
    html += `<h2>おわったテスト</h2><div class="card"><ul class="list">${past
      .map(
        (x) =>
          `<li data-test-edit="${x.id}" style="cursor:pointer"><span class="grow">${esc(x.name)}</span><span class="muted small">${fmtDate(
            x.date
          )}</span></li>`
      )
      .join('')}</ul></div>`;
  }
  html += `<button class="fab" data-add-test aria-label="テストを追加">＋</button>`;
  return html;
}

function editTest(id) {
  const x = state.tests.find((t) => t.id === id) || { id: null, name: '', date: ymd(addDays(today(), 14)), subjects: [], memo: '' };
  const boxes = state.subjects
    .map(
      (s) =>
        `<label class="chip" style="cursor:pointer"><input type="checkbox" name="subjects" value="${s.id}" ${
          x.subjects.includes(s.id) ? 'checked' : ''
        }> ${esc(s.name)}</label>`
    )
    .join('');
  openDialog(
    `<h3>${x.id ? 'テストを編集' : 'テストを追加'}</h3>
     <label class="field"><span>テストの名前</span><input type="text" name="name" required value="${esc(x.name)}" placeholder="例：2学期 期末テスト"></label>
     <label class="field"><span>日にち（初日）</span><input type="date" name="date" required value="${esc(x.date)}"></label>
     <div class="field"><span class="muted small" style="font-weight:600">教科</span><div class="chips">${boxes}</div></div>
     <label class="field" style="margin-top:12px"><span>テスト範囲・メモ</span><textarea name="memo" placeholder="例：数学 教科書p.40〜72">${esc(x.memo)}</textarea></label>
     <div class="actions">
       ${x.id ? '<button class="danger" value="delete" formnovalidate style="margin-right:auto">削除</button>' : ''}
       <button class="ghost" value="cancel" formnovalidate>やめる</button>
       <button class="primary" value="ok">保存</button>
     </div>`,
    (action, fd) => {
      if (action === 'delete') {
        if (!confirm('削除しますか？')) return false;
        state.tests = state.tests.filter((t) => t.id !== x.id);
      } else {
        const data = { name: fd.get('name').trim(), date: fd.get('date'), subjects: fd.getAll('subjects'), memo: fd.get('memo').trim() };
        if (x.id) Object.assign(state.tests.find((t) => t.id === x.id), data);
        else state.tests.push({ id: uid(), ...data });
      }
      save();
      render();
    }
  );
}

/* ---------- 画面: 設定 ---------- */
function renderSettings() {
  let html = `<h2>学校</h2><div class="card">
    <label class="field"><span>アプリの上に出す名前</span><input type="text" id="set-school" value="${esc(state.schoolName)}" placeholder="例：〇〇中 1年2組"></label>
    <div class="row wrap">
      <label class="field grow"><span>授業がある曜日</span><select id="set-days">
        <option value="5" ${state.days === 5 ? 'selected' : ''}>月〜金</option>
        <option value="6" ${state.days === 6 ? 'selected' : ''}>月〜土</option></select></label>
      <label class="field grow"><span>1日の時間数</span><select id="set-periods">
        ${[4, 5, 6, 7].map((n) => `<option value="${n}" ${state.periods === n ? 'selected' : ''}>${n}時間</option>`).join('')}</select></label>
    </div>
  </div>`;

  html += `<h2>休みの日（祝日・振替休日・行事など）</h2><div class="card">`;
  const ns = state.noSchool.filter((d) => d >= ymd(today())).sort();
  html += ns.length
    ? `<ul class="list">${ns.map((d) => `<li><span class="grow">${fmtDate(d)}</span><button class="icon" data-del-noschool="${d}" aria-label="削除">✕</button></li>`).join('')}</ul>`
    : `<div class="muted small">登録すると、その日は「次の登校日」から外れます。</div>`;
  html += `<div class="row" style="margin-top:10px"><input type="date" id="noschool-date" class="grow"><button class="ghost" data-add-noschool>追加</button></div></div>`;

  html += `<h2>毎日の持ち物</h2><div class="card">
    <textarea id="set-daily" placeholder="1行に1つ">${esc(state.dailyItems.join('\n'))}</textarea>
    <div class="muted small">1行に1つずつ書いてください</div></div>`;

  html += `<h2>教科と持ち物</h2><div class="card"><ul class="list">`;
  for (const s of state.subjects) {
    html += `<li data-subject-edit="${s.id}" style="cursor:pointer"><div class="grow"><div>${esc(s.name)}</div><div class="muted small">${
      s.items.length ? esc(s.items.join('、')) : '持ち物なし'
    }</div></div><span class="muted">›</span></li>`;
  }
  html += `</ul><button class="ghost full" style="margin-top:8px" data-add-subject>＋ 教科を追加</button></div>`;

  html += `<h2>データ</h2><div class="card">
    <p class="muted small" style="margin-top:0">データはこのスマホ（ブラウザ）の中だけに保存されています。機種変更のときは「書き出す」で保存したファイルを新しい端末で「読み込む」と引き継げます。</p>
    <div class="row wrap">
      <button class="ghost grow" data-export>書き出す</button>
      <button class="ghost grow" data-import>読み込む</button>
    </div>
    <input type="file" id="import-file" accept="application/json,.json" hidden>
    <button class="danger full" style="margin-top:10px" data-reset>すべてのデータを消す</button>
  </div>`;
  return html;
}

function editSubject(id) {
  const s = state.subjects.find((x) => x.id === id) || { id: null, name: '', items: [] };
  openDialog(
    `<h3>${s.id ? '教科を編集' : '教科を追加'}</h3>
     <label class="field"><span>教科名</span><input type="text" name="name" required value="${esc(s.name)}"></label>
     <label class="field"><span>持ち物（1行に1つ）</span><textarea name="items">${esc(s.items.join('\n'))}</textarea></label>
     <div class="actions">
       ${s.id ? '<button class="danger" value="delete" formnovalidate style="margin-right:auto">削除</button>' : ''}
       <button class="ghost" value="cancel" formnovalidate>やめる</button>
       <button class="primary" value="ok">保存</button>
     </div>`,
    (action, fd) => {
      if (action === 'delete') {
        if (!confirm(`「${s.name}」を削除しますか？時間割からも消えます。`)) return false;
        state.subjects = state.subjects.filter((x) => x.id !== s.id);
        for (const w of Object.keys(state.timetable)) state.timetable[w] = state.timetable[w].map((v) => (v === s.id ? null : v));
      } else {
        const data = { name: fd.get('name').trim(), items: lines(fd.get('items')) };
        if (s.id) Object.assign(state.subjects.find((x) => x.id === s.id), data);
        else state.subjects.push({ id: uid(), ...data });
      }
      save();
      render();
    }
  );
}

const lines = (text) =>
  String(text || '')
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gakkou-techo-${ymd(today())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.subjects) || !data.timetable) throw new Error('形式が違います');
    if (!confirm('今のデータを上書きして読み込みますか？')) return;
    state = Object.assign(defaultState(), data);
    save();
    render();
    alert('読み込みました');
  } catch (e) {
    alert('読み込めませんでした: ' + e.message);
  }
}

/* ---------- ルーティング・描画 ---------- */
let currentTab = 'today';

function render() {
  const views = { today: renderToday, timetable: renderTimetable, tasks: renderTasks, tests: renderTests, settings: renderSettings };
  $('#view').innerHTML = views[currentTab]();
  $('#title').textContent = state.schoolName || 'がっこう手帳';
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === currentTab));
}

function go(tab) {
  currentTab = tab;
  try {
    sessionStorage.setItem('tab', tab);
  } catch {}
  render();
  window.scrollTo(0, 0);
}

document.querySelector('.tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) go(b.dataset.tab);
});

$('#view').addEventListener('click', (e) => {
  const el = e.target.closest(
    '[data-cell],[data-task-edit],[data-add-task],[data-task-filter],[data-clear-done],[data-test-edit],[data-add-test],[data-subject-edit],[data-add-subject],[data-add-extra],[data-del-extra],[data-goto],[data-export],[data-import],[data-reset],[data-add-noschool],[data-del-noschool]'
  );
  if (!el) return;
  const d = el.dataset;
  if (d.cell) {
    const [w, p] = d.cell.split('-').map(Number);
    editCell(w, p);
  } else if (d.taskEdit) editTask(d.taskEdit);
  else if ('addTask' in d) editTask(null);
  else if (d.taskFilter) {
    taskFilter = d.taskFilter;
    render();
  } else if ('clearDone' in d) {
    if (confirm('おわった提出物を全部削除しますか？')) {
      state.tasks = state.tasks.filter((t) => !t.done);
      save();
      render();
    }
  } else if (d.testEdit) editTest(d.testEdit);
  else if ('addTest' in d) editTest(null);
  else if (d.subjectEdit) editSubject(d.subjectEdit);
  else if ('addSubject' in d) editSubject(null);
  else if (d.addExtra) {
    const date = d.addExtra;
    openDialog(
      `<h3>${fmtDate(date)} だけの持ち物</h3>
       <label class="field"><span>持ち物</span><input type="text" name="item" required placeholder="例：遠足のしおり、集金袋"></label>
       <div class="actions"><button class="ghost" value="cancel" formnovalidate>やめる</button><button class="primary" value="ok">追加</button></div>`,
      (_, fd) => {
        const item = fd.get('item').trim();
        (state.extraItems[date] ||= []).includes(item) || state.extraItems[date].push(item);
        save();
        render();
      }
    );
  } else if (d.delExtra) {
    state.extraItems[d.delExtra] = (state.extraItems[d.delExtra] || []).filter((x) => x !== d.item);
    save();
    render();
  } else if (d.goto) go(d.goto);
  else if ('export' in d) exportData();
  else if ('import' in d) $('#import-file').click();
  else if ('reset' in d) {
    if (confirm('本当にすべてのデータを消しますか？元に戻せません。')) {
      state = defaultState();
      save();
      render();
    }
  } else if ('addNoschool' in d) {
    const v = $('#noschool-date').value;
    if (v && !state.noSchool.includes(v)) {
      state.noSchool.push(v);
      save();
      render();
    }
  } else if (d.delNoschool) {
    state.noSchool = state.noSchool.filter((x) => x !== d.delNoschool);
    save();
    render();
  }
});

$('#view').addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.pack) {
    const date = t.dataset.pack;
    const set = new Set(state.checked[date] || []);
    t.checked ? set.add(t.dataset.item) : set.delete(t.dataset.item);
    state.checked[date] = [...set];
    save();
    render();
  } else if (t.dataset.taskDone) {
    const task = state.tasks.find((x) => x.id === t.dataset.taskDone);
    if (task) task.done = t.checked;
    save();
    setTimeout(render, 250); // チェックのアニメーションを見せてから並べ替え
  } else if (t.id === 'set-school') {
    state.schoolName = t.value.trim();
    save();
    render();
  } else if (t.id === 'set-days') {
    state.days = Number(t.value);
    save();
  } else if (t.id === 'set-periods') {
    state.periods = Number(t.value);
    save();
  } else if (t.id === 'set-daily') {
    state.dailyItems = lines(t.value);
    save();
  } else if (t.id === 'import-file' && t.files[0]) {
    importData(t.files[0]);
    t.value = '';
  }
});

// 日付が変わったら表示を更新
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') render();
});

try {
  currentTab = sessionStorage.getItem('tab') || 'today';
} catch {}
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
