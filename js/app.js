/* Ядро приложения: роутер, общие компоненты, дашборд, план, уроки, квизы. */
(function () {
  const esc = MD.esc, S = Store;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const app = document.getElementById("app");
  const routes = {};
  const App = { routes, esc, $, $$, S };
  window.App = App;

  App.toast = msg => { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(App.toast._t); App.toast._t = setTimeout(() => t.classList.remove("show"), 2200); };
  App.shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  App.plural = (n, f) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? f[2] : b > 1 && b < 5 ? f[1] : b === 1 ? f[0] : f[2]; };
  App.bar = (pct, cls) => `<div class="bar ${cls || ""}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;
  App.go = h => { location.hash = h; };

  // ---------- Навигация
  const NAV = [["#/", "Главная"], ["#/roadmap", "План"], ["#/review", "Карточки"], ["#/trainer", "Тренажёр"], ["#/scenarios", "Кейсы"], ["#/tools", "Инструменты"], ["#/projects", "Проекты"], ["#/checklists", "Чек-листы"], ["#/glossary", "Словарь"], ["#/settings", "⚙"]];
  function renderNav() {
    const cur = location.hash || "#/"; const due = S.dueCards().length;
    $("#nav").innerHTML = NAV.map(([h, t]) => {
      const act = h === "#/" ? (cur === "#/" || cur === "") : cur.startsWith(h) || (h === "#/roadmap" && /^#\/(lesson|module|exam)/.test(cur)) || (h === "#/projects" && cur.startsWith("#/project"));
      return `<a href="${h}" class="${act ? "active" : ""}">${t}${h === "#/review" && due ? `<span class="badge">${due}</span>` : ""}</a>`;
    }).join("");
  }

  // ---------- Роутер
  function parse() {
    const raw = (location.hash || "#/").slice(2); const [path, qs] = raw.split("?");
    const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
    const q = {}; (qs || "").split("&").filter(Boolean).forEach(p => { const [k, v] = p.split("="); q[k] = decodeURIComponent(v || ""); });
    return { parts, q };
  }
  function render() {
    const { parts, q } = parse();
    const name = parts[0] || "home";
    const fn = routes[name] || routes.home;
    app.innerHTML = "";
    try { fn(app, parts.slice(1), q); } catch (e) { console.error(e); app.innerHTML = `<div class="card"><h2>Ошибка отображения</h2><pre class="code"><code>${esc(e.stack || e)}</code></pre></div>`; }
    renderNav(); window.scrollTo(0, 0); app.focus({ preventScroll: true });
    document.title = (App.title ? App.title + " · " : "") + "SEO-обучатель"; App.title = "";
  }
  App.render = render;
  window.addEventListener("hashchange", render);

  $("#searchForm").addEventListener("submit", e => { e.preventDefault(); const v = $("#searchInput").value.trim(); if (v) App.go("#/search?q=" + encodeURIComponent(v)); });
  function applyTheme() { const t = S.state.theme; if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t); }
  $("#themeBtn").addEventListener("click", () => { const cur = S.state.theme; S.state.theme = cur === "auto" ? "dark" : cur === "dark" ? "light" : "auto"; S.save(); applyTheme(); App.toast("Тема: " + ({ auto: "авто", dark: "тёмная", light: "светлая" })[S.state.theme]); });
  applyTheme();

  // ---------- Квиз-движок
  /** questions: [{id,q,type,options,answer,explain,ctx}] ; opts:{shuffle,onFinish,passPct,title} */
  App.runQuiz = function (box, questions, opts) {
    opts = opts || {};
    const qs = (opts.shuffleQuestions ? App.shuffle(questions) : questions).map(q => {
      if (q.type === "truefalse") return Object.assign({}, q, { options: ["Верно", "Неверно"], order: [0, 1], correct: [q.answer ? 0 : 1], multi: false });
      const order = opts.shuffle ? App.shuffle(q.options.map((_, i) => i)) : q.options.map((_, i) => i);
      const ans = Array.isArray(q.answer) ? q.answer : [q.answer];
      return Object.assign({}, q, { order, correct: ans.map(a => order.indexOf(a)), multi: q.type === "multi" });
    });
    let i = 0, score = 0; const results = [];
    function show() {
      const q = qs[i]; let sel = []; let checked = false;
      const opt = q.type === "truefalse" ? q.options : q.order.map(k => q.options[k]);
      box.innerHTML = `<div class="q">
        <div class="row between small muted"><span>${opts.title ? esc(opts.title) + " · " : ""}Вопрос ${i + 1} из ${qs.length}${q.ctx ? " · " + esc(q.ctx) : ""}</span><span>${q.multi ? "несколько ответов" : ""}</span></div>
        ${App.bar((i) / qs.length * 100)}
        <div class="q-text">${MD.inline(q.q)}</div>
        <div id="opts">${opt.map((t, k) => `<button class="opt" data-k="${k}"><span class="k">${"АБВГДЕ"[k]}</span><span>${MD.inline(t)}</span></button>`).join("")}</div>
        <div id="fb"></div>
        <div class="row mt"><button class="btn primary ${q.multi ? "" : "hide"}" id="check" disabled>Проверить</button><button class="btn primary hide" id="next">${i === qs.length - 1 ? "Показать результат" : "Дальше →"}</button></div></div>`;
      const btns = $$(".opt", box);
      function finishQ() {
        checked = true;
        const ok = sel.length === q.correct.length && sel.every(s => q.correct.includes(s));
        if (ok) score++;
        results.push({ q, ok });
        if (q.id) S.recordAnswer(q.id, ok);
        btns.forEach((b, k) => { b.disabled = true; b.classList.remove("sel"); if (q.correct.includes(k)) b.classList.add("right"); else if (sel.includes(k)) b.classList.add("wrong"); });
        $("#fb").innerHTML = `<div class="explain"><b>${ok ? "✅ Верно." : "❌ Неверно."}</b> ${MD.inline(q.explain || "")}</div>`;
        $("#check").classList.add("hide"); $("#next").classList.remove("hide"); $("#next").focus();
      }
      btns.forEach(b => b.addEventListener("click", () => {
        if (checked) return; const k = +b.dataset.k;
        if (q.multi) { sel = sel.includes(k) ? sel.filter(x => x !== k) : sel.concat(k); b.classList.toggle("sel", sel.includes(k)); $("#check").disabled = !sel.length; }
        else { sel = [k]; finishQ(); }
      }));
      $("#check").addEventListener("click", finishQ);
      $("#next").addEventListener("click", () => { i++; i < qs.length ? show() : done(); });
    }
    function done() {
      const pct = Math.round(score / qs.length * 100);
      const pass = opts.passPct ? pct >= opts.passPct : null;
      const wrong = results.filter(r => !r.ok);
      box.innerHTML = `<div class="q"><div class="card center"><div class="ring" style="--p:${pct};margin:0 auto 12px"><div>${pct}%</div></div>
        <h2 style="margin-top:0">${score} из ${qs.length}</h2>
        ${pass === null ? "" : pass ? `<p><span class="pill ok">Зачтено (порог ${opts.passPct}%)</span></p>` : `<p><span class="pill bad">Не зачтено — порог ${opts.passPct}%. Перечитайте теорию и попробуйте ещё раз.</span></p>`}
        <div class="row" style="justify-content:center"><button class="btn primary" id="again">Пройти ещё раз</button>${opts.after || ""}</div></div>
        ${wrong.length ? `<h3>Разбор ошибок</h3>${wrong.map(r => `<div class="card"><div class="q-text">${MD.inline(r.q.q)}</div><div class="explain">${MD.inline(r.q.explain || "")}</div></div>`).join("")}` : "<p class='center'>Без ошибок! 🎉</p>"}</div>`;
      $("#again").addEventListener("click", () => App.runQuiz(box, questions, opts));
      if (opts.onFinish) opts.onFinish({ score, total: qs.length, pct, pass });
    }
    show();
  };

  // ---------- Главная
  routes.home = function (el) {
    const o = S.overall(), next = S.nextLesson(), cs = S.cardStats(), due = S.dueCards().length, weak = S.weakQuestionIds().length;
    const act = S.state.activity; const days = [];
    for (let k = 27; k >= 0; k--) { const d = new Date(); d.setDate(d.getDate() - k); const n = act[d.toISOString().slice(0, 10)] || 0; days.push(`<i class="${n > 15 ? "l3" : n > 5 ? "l2" : n ? "l1" : ""}" title="${d.toLocaleDateString("ru-RU")}: ${n}"></i>`); }
    const m = next && S.moduleOfLesson[next.id];
    const empty = !S.modules.length;
    el.innerHTML = `${empty ? '<div class="card"><h2>Контент курса не найден</h2><p>Проверьте, что файлы data/module-*.js на месте.</p></div>' : ""}
    <section class="hero"><div>
      <div class="muted small">День ${S.dayNumber()} · серия активности: ${S.streak()} ${App.plural(S.streak(), ["день", "дня", "дней"])}</div>
      <h1>${o.done === o.total && o.total ? "Курс пройден 🎉" : "Продолжаем путь к ТОП-10"}</h1>
      ${next ? `<p>Следующий шаг: <b>${esc(m.num + "." + (+next.id.split("-l")[1]) + " " + next.title)}</b> <span class="muted">· ~${next.minutes} мин</span></p>
      <div class="row"><a class="btn primary" href="#/lesson/${next.id}">${S.lessonProgress(next).started ? "Продолжить урок" : "Начать урок"} →</a><a class="btn" href="#/roadmap">Весь план</a></div>` : "<p>Повторяйте карточки и решайте кейсы, чтобы не забыть материал.</p>"}
    </div><div class="ring" style="--p:${o.pct}"><div>${o.pct}%</div></div></section>
    <div class="grid g4 mt">
      <a class="card stat" href="#/review" style="color:inherit"><b>${due}</b><span>карточек к повторению</span></a>
      <a class="card stat" href="#/trainer?mode=weak" style="color:inherit"><b>${weak}</b><span>вопросов с ошибками</span></a>
      <div class="card stat"><b>${o.done}/${o.total}</b><span>уроков пройдено</span></div>
      <div class="card stat"><b>${cs.mature}</b><span>карточек выучено (из ${cs.total})</span></div>
    </div>
    <div class="grid g2 mt">
      <div class="card"><h3 style="margin-top:0">Модули</h3>${S.modules.map(mm => { const p = S.moduleProgress(mm); return `<a href="#/module/${mm.id}" style="color:inherit;display:block;margin:10px 0"><div class="row between small"><span><b>${mm.num}. ${esc(mm.title)}</b></span><span class="muted">${p.done}/${p.total}</span></div>${App.bar(p.pct, p.done === p.total ? "ok" : "")}</a>`; }).join("")}</div>
      <div class="card"><h3 style="margin-top:0">Активность за 4 недели</h3><div class="heat">${days.join("")}</div>
        <h3>Режим работы</h3><ul class="small"><li><b>Каждый день:</b> 1 урок (теория → практика → квиз) и 10 минут карточек.</li><li><b>Раз в неделю:</b> экзамен модуля и 2–3 кейса.</li><li><b>Параллельно:</b> ведите свой проект во вкладке «Проекты» — это превращает знания в результат.</li></ul>
        ${S.memoryOnly() ? '<p class="pill warn">Браузер не сохраняет данные — экспортируйте прогресс в настройках</p>' : ""}</div>
    </div>`;
    App.title = "Главная";
  };

  // ---------- План
  routes.roadmap = function (el) {
    const next = S.nextLesson();
    el.innerHTML = `<h1>План обучения</h1><p class="muted">8 модулей, 48 уроков. Идеальный темп — 1 урок в день (≈ 8 недель). Порядок выстроен от основ и выбора ниши — к покупке сайта, технике, контенту, ссылкам и запуску до ТОП-10.</p>` +
      S.modules.map(m => { const p = S.moduleProgress(m); const open = next && S.moduleOfLesson[next.id] === m;
        return `<details class="card module" ${open ? "open" : ""}><summary><div class="mnum">${m.num}</div><div class="grow"><div class="row between"><b>${esc(m.title)}</b><span class="pill">${esc(m.week)}</span></div><div class="muted small">${esc(m.subtitle)}</div>${App.bar(p.pct, p.done === p.total ? "ok" : "")}</div></summary>
        <div class="small muted" style="padding:0 20px 12px"><b>Цель:</b> ${esc(m.goal)}</div>
        ${m.lessons.map((l, i) => { const lp = S.lessonProgress(l); return `<a class="lrow" href="#/lesson/${l.id}"><span class="dot ${lp.done ? "done" : lp.started ? "part" : ""}">${lp.done ? "✓" : ""}</span><span class="grow"><b>${m.num}.${i + 1}</b> ${esc(l.title)}<br><span class="muted small">${esc(l.summary)}</span></span><span class="pill">${l.minutes} мин</span></a>`; }).join("")}
        <div class="row" style="padding:14px 20px;border-top:1px solid var(--border)"><a class="btn sm" href="#/module/${m.id}">Обзор модуля</a><a class="btn sm" href="#/exam/${m.id}">Экзамен ${S.state.exams[m.id] ? "· " + S.state.exams[m.id].best + "%" : ""}</a><a class="btn sm" href="#/scenarios?m=${m.id}">Кейсы</a></div></details>`; }).join("");
    App.title = "План";
  };

  routes.module = function (el, [id]) {
    const m = S.moduleById[id]; if (!m) return (el.innerHTML = "<p>Модуль не найден.</p>");
    const p = S.moduleProgress(m);
    el.innerHTML = `<div class="crumbs"><a href="#/roadmap">План</a> / Модуль ${m.num}</div><h1>${m.num}. ${esc(m.title)}</h1><p class="muted">${esc(m.subtitle)}</p>
    <div class="card"><b>Цель модуля</b><p>${esc(m.goal)}</p>${App.bar(p.pct)}</div>
    <h2>Уроки</h2><div class="card" style="padding:0">${m.lessons.map((l, i) => { const lp = S.lessonProgress(l); return `<a class="lrow" href="#/lesson/${l.id}"><span class="dot ${lp.done ? "done" : lp.started ? "part" : ""}">${lp.done ? "✓" : ""}</span><span class="grow"><b>${m.num}.${i + 1}</b> ${esc(l.title)}</span><span class="pill">${lp.pct}%</span></a>`; }).join("")}</div>
    <div class="grid g2 mt"><a class="card" style="color:inherit" href="#/scenarios?m=${m.id}"><h3 style="margin-top:0">🎯 Кейсы с выбором</h3><p class="muted">6 ситуаций: принять решение, увидеть последствия.</p></a>
    <a class="card" style="color:inherit" href="#/exam/${m.id}"><h3 style="margin-top:0">📝 Экзамен модуля</h3><p class="muted">12 вопросов, порог 75%. ${S.state.exams[m.id] ? "Лучший результат: " + S.state.exams[m.id].best + "%" : "Ещё не сдавался."}</p></a></div>`;
    App.title = m.title;
  };

  // ---------- Урок
  routes.lesson = function (el, [id, tab]) {
    const l = S.lessonById[id]; if (!l) return (el.innerHTML = "<p>Урок не найден.</p>");
    tab = tab || "theory"; const m = S.moduleOfLesson[id]; const idx = m.lessons.indexOf(l);
    S.addCards(id); S.L(id); S.save();
    const lp = S.lessonProgress(l);
    const T = [["theory", "📖 Теория"], ["practice", `🛠 Практика ${lp.tdone}/${lp.ttotal}`], ["quiz", `❓ Квиз ${lp.quiz != null ? lp.quiz + "%" : ""}`], ["cards", "🗂 Карточки"]];
    el.innerHTML = `<div class="crumbs"><a href="#/roadmap">План</a> / <a href="#/module/${m.id}">Модуль ${m.num}</a> / Урок ${m.num}.${idx + 1}</div>
      <div class="row between"><h1 style="margin-bottom:4px">${esc(l.title)}</h1>${lp.done ? '<span class="pill ok">Пройден</span>' : `<span class="pill pri">~${l.minutes} мин</span>`}</div>
      <p class="muted">${esc(l.summary)}</p>
      <nav class="tabs">${T.map(([k, t]) => `<a href="#/lesson/${id}/${k}" class="${tab === k ? "active" : ""}">${t}</a>`).join("")}</nav><div id="tab"></div>
      <div class="row between mt2">${idx > 0 ? `<a class="btn" href="#/lesson/${m.lessons[idx - 1].id}">← ${esc(m.lessons[idx - 1].title)}</a>` : (m.num > 1 ? `<a class="btn" href="#/module/${S.modules[m.num - 2].id}">← Модуль ${m.num - 1}</a>` : "<span></span>")}${idx < m.lessons.length - 1 ? `<a class="btn primary" href="#/lesson/${m.lessons[idx + 1].id}">${esc(m.lessons[idx + 1].title)} →</a>` : `<a class="btn primary" href="#/exam/${m.id}">Экзамен модуля →</a>`}</div>`;
    const box = $("#tab", el);
    App.title = l.title;
    if (tab === "theory") {
      box.innerHTML = `<div class="grid g2" style="grid-template-columns:minmax(0,1fr)"><div class="card" style="max-width:820px"><b>После урока вы сможете</b><ul>${l.objectives.map(o => `<li>${esc(o)}</li>`).join("")}</ul></div></div>
      <article class="prose mt">${MD.render(l.theory)}</article>
      ${(l.resources || []).length ? `<h3>Ресурсы</h3><ul>${l.resources.map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a>${r.note ? ` — <span class="muted">${esc(r.note)}</span>` : ""}</li>`).join("")}</ul>` : ""}
      <div class="card mt"><b>Мои заметки</b><textarea id="note" placeholder="Что запомнилось, что применю на практике…">${esc(S.state.notes[id] || "")}</textarea></div>
      <div class="sticky-actions row"><button class="btn ${lp.read ? "" : "primary"}" id="readBtn">${lp.read ? "✓ Прочитано (снять отметку)" : "Отметить прочитанным"}</button><a class="btn" href="#/lesson/${id}/practice">К практике →</a></div>`;
      $("#note", box).addEventListener("input", e => { S.state.notes[id] = e.target.value; S.save(); });
      $("#readBtn", box).addEventListener("click", () => { const s = S.L(id); s.read = !s.read; if (s.read) S.touch(); S.save(); if (s.read) App.toast("Отмечено. К практике!"); render(); });
    } else if (tab === "practice") {
      const pr = l.practice;
      box.innerHTML = `<p>${esc(pr.intro || "")}</p>` + pr.tasks.map((t, ti) => {
        const done = !!(S.state.lessons[id].tasks || {})[t.id]; const ck = (S.state.lessons[id].ck = S.state.lessons[id].ck || {});
        return `<div class="task ${done ? "done" : ""}" data-t="${t.id}"><h3><span class="pill pri">Задача ${ti + 1}</span> ${esc(t.title)} <span class="pill">${t.minutes} мин</span></h3>
        <ol>${t.steps.map(s => `<li>${MD.inline(s)}</li>`).join("")}</ol>
        <p><b>Результат:</b> ${MD.inline(t.deliverable)}</p>
        <b class="small">Самопроверка</b>${t.checklist.map((c, ci) => `<label class="chk ${ck[t.id + ci] ? "done" : ""}"><input type="checkbox" data-ck="${t.id}${ci}" ${ck[t.id + ci] ? "checked" : ""}><span>${MD.inline(c)}</span></label>`).join("")}
        <div class="field"><label>Мои результаты / выводы</label><textarea data-note="${t.id}" placeholder="Ссылка на таблицу, цифры, выводы…">${esc(S.state.notes[t.id] || "")}</textarea></div>
        <button class="btn ${done ? "" : "ok"} sm" data-done="${t.id}">${done ? "✓ Выполнено (снять)" : "Задача выполнена"}</button></div>`;
      }).join("") + `<div class="sticky-actions row"><a class="btn primary" href="#/lesson/${id}/quiz">К квизу →</a></div>`;
      $$("[data-ck]", box).forEach(c => c.addEventListener("change", () => { S.state.lessons[id].ck[c.dataset.ck] = c.checked; S.save(); c.closest(".chk").classList.toggle("done", c.checked); }));
      $$("[data-note]", box).forEach(c => c.addEventListener("input", () => { S.state.notes[c.dataset.note] = c.value; S.save(); }));
      $$("[data-done]", box).forEach(b => b.addEventListener("click", () => { const s = S.L(id); s.tasks[b.dataset.done] = !s.tasks[b.dataset.done]; if (s.tasks[b.dataset.done]) S.touch(); S.save(); render(); }));
    } else if (tab === "quiz") {
      const qs = l.quiz.map((q, i) => Object.assign({ id: `${id}-q${i}`, ctx: m.num + "." + (idx + 1) }, q));
      box.innerHTML = `<div class="card"><b>Квиз по уроку</b><p class="muted">Порог зачёта — 70%. ${lp.quiz != null ? "Лучший результат: <b>" + lp.quiz + "%</b>." : ""} Вопросы проверяют понимание, а не заучивание: читайте объяснения.</p></div><div id="qbox" class="mt"></div>`;
      App.runQuiz($("#qbox", box), qs, { passPct: 70, shuffle: true, title: "Квиз", onFinish: r => { const s = S.L(id); s.quizAttempts++; s.quizBest = Math.max(s.quizBest || 0, r.pct); S.save(); renderNav(); },
        after: `<a class="btn" href="#/lesson/${id}/cards">Карточки урока</a>` });
    } else {
      S.addCards(id);
      box.innerHTML = `<p class="muted">Эти карточки уже добавлены в вашу колоду интервального повторения. <a href="#/review?m=${m.id}">Повторять модуль →</a></p><div class="grid g2">${l.cards.map(c => `<div class="card"><b>${MD.inline(c.front)}</b><details><summary class="muted small" style="cursor:pointer">Показать ответ</summary><p>${MD.inline(c.back)}</p></details></div>`).join("")}</div>`;
    }
  };

  // ---------- Экзамен модуля
  routes.exam = function (el, [id]) {
    const m = S.moduleById[id]; if (!m) return (el.innerHTML = "<p>Модуль не найден.</p>");
    const prev = S.state.exams[id];
    el.innerHTML = `<div class="crumbs"><a href="#/module/${id}">Модуль ${m.num}</a> / Экзамен</div><h1>Экзамен: ${esc(m.title)}</h1><div class="card"><p>12 вопросов по всему модулю, порядок вопросов и ответов перемешивается. Порог — <b>75%</b>. ${prev ? "Лучший результат: <b>" + prev.best + "%</b>." : ""}</p></div><div id="qbox" class="mt"></div>`;
    const qs = m.exam.map((q, i) => Object.assign({ id: `${id}-e${i}`, ctx: "Экзамен" }, q));
    App.runQuiz($("#qbox", el), qs, { passPct: 75, shuffle: true, shuffleQuestions: true, title: "Экзамен", onFinish: r => { const cur = S.state.exams[id]; if (!cur || r.pct > cur.best) S.state.exams[id] = { best: r.pct, at: Date.now() }; S.touch(); } });
    App.title = "Экзамен " + m.title;
  };
})();
