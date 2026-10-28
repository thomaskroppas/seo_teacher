/* Хранилище прогресса (localStorage) + доступ к курсу + интервальное повторение. */
(function () {
  const KEY = "seo-teacher-v1";
  const DAY = 86400000;
  const today = () => new Date().toISOString().slice(0, 10);
  const defaults = () => ({
    v: 1, startDate: today(), lessons: {}, cards: {}, qstats: {}, scen: {}, exams: {},
    checklists: {}, projects: [], notes: {}, activity: {}, theme: "auto", tools: {}, chats: {}
  });
  let state = defaults();
  let memoryOnly = false;
  let ns = "local";
  const keyFor = () => (ns === "local" ? KEY : KEY + ":" + ns);
  const hooks = { onSave: null };

  function load(namespace) {
    ns = namespace || "local";
    try { state = Object.assign(defaults(), JSON.parse(localStorage.getItem(keyFor()) || "{}")); }
    catch (e) { state = defaults(); }
  }
  function save(skipHook) {
    state.updatedAt = Date.now();
    try { localStorage.setItem(keyFor(), JSON.stringify(state)); memoryOnly = false; }
    catch (e) { memoryOnly = true; }
    if (!skipHook && hooks.onSave) hooks.onSave();
  }
  function touch() { const d = today(); state.activity[d] = (state.activity[d] || 0) + 1; save(); }
  function hasProgress(st) { st = st || state; return !!st && (Object.keys(st.lessons || {}).length || Object.keys(st.cards || {}).length || (st.projects || []).length || Object.keys(st.activity || {}).length) > 0; }

  // ---- Слияние состояний с разных устройств (ничего не теряем)
  const orMerge = (x, y) => Object.assign({}, y || {}, Object.fromEntries(Object.entries(x || {}).filter(([, v]) => v)), Object.fromEntries(Object.entries(y || {}).filter(([, v]) => v)));
  function mergeStates(a, b) {
    a = a || {}; b = b || {};
    const newer = (a.updatedAt || 0) >= (b.updatedAt || 0) ? a : b, older = newer === a ? b : a;
    const out = Object.assign(defaults(), JSON.parse(JSON.stringify(older)), JSON.parse(JSON.stringify(newer)));
    const keys = (x, y) => new Set(Object.keys(x || {}).concat(Object.keys(y || {})));
    out.lessons = {};
    keys(a.lessons, b.lessons).forEach(id => {
      const la = (a.lessons || {})[id] || {}, lb = (b.lessons || {})[id] || {};
      out.lessons[id] = { read: !!(la.read || lb.read), tasks: orMerge(la.tasks, lb.tasks), ck: orMerge(la.ck, lb.ck),
        quizBest: Math.max(la.quizBest == null ? -1 : la.quizBest, lb.quizBest == null ? -1 : lb.quizBest) < 0 ? null : Math.max(la.quizBest || 0, lb.quizBest || 0),
        quizAttempts: Math.max(la.quizAttempts || 0, lb.quizAttempts || 0) };
    });
    out.cards = {};
    keys(a.cards, b.cards).forEach(id => { const ca = (a.cards || {})[id], cb = (b.cards || {})[id]; out.cards[id] = !ca ? cb : !cb ? ca : (ca.seen !== cb.seen ? (ca.seen > cb.seen ? ca : cb) : (ca.due >= cb.due ? ca : cb)); });
    out.qstats = {};
    keys(a.qstats, b.qstats).forEach(id => { const qa = (a.qstats || {})[id], qb = (b.qstats || {})[id]; out.qstats[id] = !qa ? qb : !qb ? qa : ((qa.right + qa.wrong) >= (qb.right + qb.wrong) ? qa : qb); });
    out.exams = {};
    keys(a.exams, b.exams).forEach(id => { const ea = (a.exams || {})[id], eb = (b.exams || {})[id]; out.exams[id] = !ea ? eb : !eb ? ea : (ea.best >= eb.best ? ea : eb); });
    out.scen = Object.assign({}, b.scen || {}, a.scen || {});
    out.checklists = {};
    keys(a.checklists, b.checklists).forEach(id => { out.checklists[id] = orMerge((a.checklists || {})[id], (b.checklists || {})[id]); });
    out.notes = Object.assign({}, older.notes || {}, newer.notes || {});
    out.activity = {};
    keys(a.activity, b.activity).forEach(d => { out.activity[d] = Math.max((a.activity || {})[d] || 0, (b.activity || {})[d] || 0); });
    out.chats = {};
    keys(a.chats, b.chats).forEach(id => { const x = (a.chats || {})[id] || [], y = (b.chats || {})[id] || []; out.chats[id] = x.length >= y.length ? x : y; });
    const pj = {}; (older.projects || []).concat(newer.projects || []).forEach(p => { pj[p.id] = p; }); out.projects = Object.values(pj);
    out.startDate = [a.startDate, b.startDate].filter(Boolean).sort()[0] || out.startDate;
    out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
    return out;
  }
  function replaceState(obj, skipHook) { state = Object.assign(defaults(), obj); save(skipHook !== false); }

  load("local");

  // ---- Курс
  const modules = (window.COURSE_MODULES || []).slice().sort((a, b) => a.num - b.num);
  const lessons = [];
  const lessonById = {}, moduleById = {}, moduleOfLesson = {};
  modules.forEach(m => {
    moduleById[m.id] = m;
    m.lessons.forEach(l => { lessons.push(l); lessonById[l.id] = l; moduleOfLesson[l.id] = m; });
  });
  const allCards = () => {
    const res = [];
    lessons.forEach(l => (l.cards || []).forEach((c, i) => res.push({ id: `${l.id}-c${i}`, lesson: l.id, module: moduleOfLesson[l.id].id, front: c.front, back: c.back })));
    return res;
  };
  const cardIdSet = () => new Set(allCards().map(c => c.id));

  // ---- Уроки
  const L = id => (state.lessons[id] = state.lessons[id] || { read: false, tasks: {}, quizBest: null, quizAttempts: 0 });
  function lessonProgress(l) {
    const s = state.lessons[l.id] || {};
    const tasks = (l.practice && l.practice.tasks) || [];
    const tdone = tasks.filter(t => s.tasks && s.tasks[t.id]).length;
    const read = !!s.read, quiz = s.quizBest;
    const done = read && tdone === tasks.length && quiz != null && quiz >= 70;
    const pct = Math.round(((read ? 1 : 0) + (tasks.length ? tdone / tasks.length : 1) + (quiz != null ? Math.min(quiz, 100) / 100 : 0)) / 3 * 100);
    return { read, tdone, ttotal: tasks.length, quiz, done, pct, started: read || tdone > 0 || quiz != null };
  }
  function moduleProgress(m) {
    const ps = m.lessons.map(lessonProgress);
    return { done: ps.filter(p => p.done).length, total: ps.length, pct: Math.round(ps.reduce((a, p) => a + p.pct, 0) / ps.length) };
  }
  function overall() {
    const ps = lessons.map(lessonProgress);
    return { done: ps.filter(p => p.done).length, total: ps.length, pct: ps.length ? Math.round(ps.reduce((a, p) => a + p.pct, 0) / ps.length) : 0 };
  }
  function nextLesson() { return lessons.find(l => !lessonProgress(l).done) || null; }

  // ---- Карточки (Лейтнер): боксы 0..5, интервалы в днях
  const INTERVALS = [0, 1, 3, 7, 16, 35];
  function cardState(id) { return state.cards[id]; }
  function addCards(lessonId) { // карточки урока попадают в колоду при изучении теории
    const l = lessonById[lessonId]; if (!l) return;
    (l.cards || []).forEach((c, i) => { const id = `${l.id}-c${i}`; if (!state.cards[id]) state.cards[id] = { box: 0, due: Date.now(), seen: 0 }; });
    save();
  }
  function dueCards() {
    const ids = cardIdSet(); const now = Date.now();
    return allCards().filter(c => state.cards[c.id] && ids.has(c.id) && state.cards[c.id].due <= now);
  }
  function rateCard(id, grade) { // 0 снова, 1 трудно, 2 хорошо, 3 легко
    const c = state.cards[id] || (state.cards[id] = { box: 0, due: 0, seen: 0 });
    if (grade === 0) c.box = 0; else if (grade === 1) c.box = Math.max(0, c.box - (c.box > 1 ? 1 : 0)); else if (grade === 2) c.box = Math.min(5, c.box + 1); else c.box = Math.min(5, c.box + 2);
    c.seen++; c.due = Date.now() + (grade === 0 ? 10 * 60000 : INTERVALS[c.box] * DAY);
    touch();
  }
  function cardStats() {
    const ids = Object.keys(state.cards); const now = Date.now();
    return { total: ids.length, due: ids.filter(i => state.cards[i].due <= now).length, mature: ids.filter(i => state.cards[i].box >= 4).length };
  }

  // ---- Вопросы
  function recordAnswer(qid, ok) {
    const s = state.qstats[qid] || (state.qstats[qid] = { right: 0, wrong: 0, last: null });
    if (ok) s.right++; else s.wrong++; s.last = ok; touch();
  }
  function weakQuestionIds() { return Object.keys(state.qstats).filter(k => state.qstats[k].last === false); }

  // ---- Стрик
  function streak() {
    let n = 0; const d = new Date();
    if (!state.activity[today()]) d.setDate(d.getDate() - 1);
    while (state.activity[d.toISOString().slice(0, 10)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function dayNumber() { return Math.max(1, Math.floor((Date.now() - new Date(state.startDate).getTime()) / DAY) + 1); }

  window.Store = {
    get state() { return state; }, save, touch, today, memoryOnly: () => memoryOnly, load, hooks, mergeStates, replaceState, hasProgress, namespace: () => ns,
    modules, lessons, lessonById, moduleById, moduleOfLesson, allCards,
    L, lessonProgress, moduleProgress, overall, nextLesson,
    addCards, dueCards, rateCard, cardStats, cardState,
    recordAnswer, weakQuestionIds, streak, dayNumber,
    exportJSON: () => JSON.stringify(state, null, 2),
    importJSON(text) { const o = JSON.parse(text); if (!o || typeof o !== "object" || !o.v) throw new Error("Неверный файл"); state = Object.assign(defaults(), o); save(); },
    reset() { state = defaults(); save(); }
  };
})();
