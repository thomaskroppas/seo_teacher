/* Ядро приложения: роутер, общие компоненты, главная, план, уроки, квизы. */
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
  /** Линейная иконка из спрайта в index.html. */
  App.icon = (id, cls) => `<svg class="i${cls ? " " + cls : ""}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const I = App.icon;
  /** Строка-ссылка с иконкой: [href, icon, title, sub, value, hot] */
  App.rowLink = ([href, icon, title, sub, val, hot]) => `<a class="row-link" href="${href}"><span class="ico${hot ? " hot" : ""}">${I(icon)}</span><span class="txt"><b>${title}</b>${sub ? `<span>${sub}</span>` : ""}</span>${val != null && val !== "" ? `<span class="val">${val}</span>` : ""}${I("chev-r", "s")}</a>`;

  // ---------- Навигация: 5 разделов внизу экрана (на десктопе — в шапке)
  const NAV = [
    ["#/", "Главная", "home", c => c === "#/" || c === ""],
    ["#/roadmap", "План", "map", c => /^#\/(roadmap|lesson|module|exam)/.test(c)],
    ["#/train", "Тренировка", "target", c => /^#\/(train|review|trainer|scenarios)/.test(c)],
    ["#/projects", "Проекты", "folder", c => /^#\/project/.test(c)],
    ["#/more", "Ещё", "grid", c => /^#\/(more|tools|checklist|glossary|settings|search)/.test(c)]
  ];
  const ADMIN_TAB = ["#/admin", "Админ", "shield", c => c.startsWith("#/admin")];
  function renderNav() {
    const cur = location.hash || "#/";
    const items = App.Auth && App.Auth.isAdmin() ? NAV.concat([ADMIN_TAB]) : NAV;
    $("#nav").innerHTML = items.map(([h, t, ic, isActive]) => { const on = isActive(cur); return `<a href="${h}" class="${on ? "active" : ""}"${on ? ' aria-current="page"' : ""}>${I(ic)}<span>${t}</span></a>`; }).join("");
    const due = S.dueCards().length, streak = S.streak();
    $("#counters").innerHTML = `<span class="counter${streak ? " hot" : ""}" title="Серия: ${streak} ${App.plural(streak, ["день", "дня", "дней"])} подряд">${I("flame", "s")}${streak}</span>` +
      `<a class="counter" href="#/review" title="Карточек к повторению: ${due}">${I("layers", "s")}${due}</a>`;
  }
  App.renderNav = renderNav;

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
  const THEMES = { auto: "как в системе", dark: "тёмная", light: "светлая" };
  App.themeName = () => THEMES[S.state.theme] || THEMES.auto;
  function applyTheme() { const t = S.state.theme; if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t); }
  App.cycleTheme = () => { const cur = S.state.theme; S.state.theme = cur === "auto" ? "dark" : cur === "dark" ? "light" : "auto"; S.save(); applyTheme(); App.toast("Тема: " + App.themeName()); };
  $("#themeBtn").addEventListener("click", App.cycleTheme);
  applyTheme();

  // ---------- Квиз-движок
  /** questions: [{id,q,type,options,answer,explain,ctx}] ; opts:{shuffle,onFinish,passPct,title,after} */
  App.runQuiz = function (box, questions, opts) {
    opts = opts || {};
    const qs = (opts.shuffleQuestions ? App.shuffle(questions) : questions).map(q => {
      if (q.type === "truefalse") return Object.assign({}, q, { options: ["Верно", "Неверно"], order: [0, 1], correct: [q.answer ? 0 : 1], multi: false });
      const order = opts.shuffle ? App.shuffle(q.options.map((_, i) => i)) : q.options.map((_, i) => i);
      const ans = Array.isArray(q.answer) ? q.answer : [q.answer];
      return Object.assign({}, q, { order, correct: ans.map(a => order.indexOf(a)), multi: q.type === "multi" });
    });
    let i = 0, score = 0; const results = [];
    const progress = () => qs.length > 24 ? App.bar(i / qs.length * 100)
      : `<div class="qprog">${qs.map((_, k) => `<i class="${k < i ? (results[k].ok ? "ok" : "bad") : k === i ? "on" : ""}"></i>`).join("")}</div>`;
    function show() {
      const q = qs[i]; let sel = []; let checked = false;
      const opt = q.type === "truefalse" ? q.options : q.order.map(k => q.options[k]);
      box.innerHTML = `<div class="q">
        <div class="q-head"><span>${opts.title ? esc(opts.title) + " · " : ""}${i + 1}/${qs.length}${q.ctx ? " · " + esc(q.ctx) : ""}</span><span>${q.multi ? "несколько ответов" : ""}</span></div>
        ${progress()}
        <div class="q-text">${MD.inline(q.q)}</div>
        <div id="opts">${opt.map((t, k) => `<button class="opt" data-k="${k}"><span class="k">${"АБВГДЕ"[k]}</span><span>${MD.inline(t)}</span></button>`).join("")}</div>
        <div class="q-foot ${q.multi ? "" : "hide"}"><div id="fb"></div><button class="btn primary ${q.multi ? "" : "hide"}" id="check" disabled>Проверить</button><button class="btn primary hide" id="next">${i === qs.length - 1 ? "Показать результат" : "Дальше"}</button></div></div>`;
      const btns = $$(".opt", box);
      function finishQ() {
        checked = true;
        const ok = sel.length === q.correct.length && sel.every(s => q.correct.includes(s));
        if (ok) score++;
        results.push({ q, ok });
        if (q.id) S.recordAnswer(q.id, ok);
        btns.forEach((b, k) => { b.disabled = true; b.classList.remove("sel"); if (q.correct.includes(k)) b.classList.add("right"); else if (sel.includes(k)) b.classList.add("wrong"); });
        $("#fb", box).innerHTML = `<div class="explain ${ok ? "ok" : "bad"}"><div class="verdict">${I(ok ? "check" : "x")}${ok ? "Верно" : "Неверно"}</div>${MD.inline(q.explain || "")}</div>`;
        $(".q-foot", box).classList.remove("hide");
        $("#check", box).classList.add("hide"); $("#next", box).classList.remove("hide"); $("#next", box).focus({ preventScroll: true });
      }
      btns.forEach(b => b.addEventListener("click", () => {
        if (checked) return; const k = +b.dataset.k;
        if (q.multi) { sel = sel.includes(k) ? sel.filter(x => x !== k) : sel.concat(k); b.classList.toggle("sel", sel.includes(k)); $("#check", box).disabled = !sel.length; }
        else { sel = [k]; finishQ(); }
      }));
      $("#check", box).addEventListener("click", finishQ);
      $("#next", box).addEventListener("click", () => { i++; if (i < qs.length) { show(); box.scrollIntoView({ block: "start" }); } else done(); });
    }
    function done() {
      const pct = Math.round(score / qs.length * 100);
      const pass = opts.passPct ? pct >= opts.passPct : null;
      const wrong = results.filter(r => !r.ok);
      box.innerHTML = `<div class="q"><div class="card result-card"><div class="ring" style="--p:${pct}"><div>${pct}%</div></div>
        <h2>${score} из ${qs.length}</h2>
        ${pass === null ? "" : pass ? `<p class="pill ok">Зачтено, порог ${opts.passPct}%</p>` : `<p class="pill bad">Не зачтено: порог ${opts.passPct}%. Перечитайте теорию и попробуйте ещё раз</p>`}
        <div class="row"><button class="btn primary" id="again">${I("refresh", "s")}Пройти ещё раз</button>${opts.after || ""}</div></div>
        ${wrong.length ? `<div class="section-h"><h2>Разбор ошибок</h2></div>${wrong.map(r => `<div class="card"><div class="q-text" style="margin:0 0 12px;font-size:17px">${MD.inline(r.q.q)}</div><div class="muted">${MD.inline(r.q.explain || "")}</div></div>`).join("")}` : "<p class='center muted'>Без ошибок</p>"}</div>`;
      $("#again", box).addEventListener("click", () => App.runQuiz(box, questions, opts));
      box.scrollIntoView({ block: "start" });
      S.touch();
      if (opts.onFinish) opts.onFinish({ score, total: qs.length, pct, pass });
    }
    show();
  };

  // ---------- Главная
  /** Позиция «вашего сайта» в выдаче: 0% курса → 100-е место, 100% → 1-е. */
  App.serpPosition = pct => Math.max(1, Math.round(100 * (1 - pct / 100) ** 2));
  function serpHTML(pct) {
    const p = (S.state.projects || [])[0];
    const query = (p && p.keywords && p.keywords[0] && p.keywords[0].kw) || "как продвинуть сайт";
    const pos = App.serpPosition(pct);
    const sk = n => `<div class="sn"><span class="pos">${n}</span><div><div class="sk t"></div><div class="sk u"></div></div></div>`;
    const you = `<div class="sn you"><span class="pos">${pos}</span><div><div class="t">${esc((p && p.name) || "Ваш сайт")}</div><div class="u">${esc((p && p.domain) || "ваш-сайт.ru")}</div></div></div>`;
    const top10 = '<div class="top10"><span>граница ТОП-10</span></div>', dots = '<div class="dots">···</div>';
    const ladder = pos === 1 ? you + sk(2) + sk(3) : pos <= 10 ? sk(1) + (pos > 2 ? dots : "") + you + top10 : sk(1) + dots + top10 + dots + you;
    return `<div class="card serp"><div class="serp-q">${I("search", "s")}${esc(query)}</div>${ladder}
      <p class="serp-cap">Курс пройден на <span class="mono">${pct}%</span>. Чем дальше по плану, тем выше сайт</p></div>`;
  }
  function nextCardHTML(next) {
    const m = S.moduleOfLesson[next.id], lp = S.lessonProgress(next), n = m.num + "." + (m.lessons.indexOf(next) + 1);
    return `<div class="card next-card"><div class="lbl">${lp.started ? "Продолжить урок" : "Следующий урок"}</div><h3>${esc(next.title)}</h3>
      <div class="meta">Урок ${n} · <span class="mono">${next.minutes} мин</span></div>${App.bar(lp.pct)}
      <a class="btn primary" href="#/lesson/${next.id}">${lp.started ? "Продолжить" : "Начать урок"}${I("chev-r", "s")}</a></div>`;
  }
  routes.home = function (el) {
    const o = S.overall(), next = S.nextLesson(), cs = S.cardStats(), due = S.dueCards().length, weak = S.weakQuestionIds().length, streak = S.streak();
    const act = S.state.activity; const days = [];
    for (let k = 27; k >= 0; k--) { const d = new Date(); d.setDate(d.getDate() - k); const n = act[S.ymd(d)] || 0; days.push(`<i class="${n > 15 ? "l3" : n > 5 ? "l2" : n ? "l1" : ""}${k === 0 ? " today" : ""}" title="${d.toLocaleDateString("ru-RU")}: ${n}"></i>`); }
    const start = new Date(); start.setDate(start.getDate() - 27);
    const quest = (window.CHECKLISTS || []).find(x => x.id === "first-site");
    let qt = 0, qd = 0; if (quest) { const st = S.state.checklists["-:first-site"] || {}; quest.groups.forEach((g, gi) => g.items.forEach((_, ii) => { qt++; if (st[gi + "." + ii]) qd++; })); }
    const title = o.done === o.total && o.total ? "Курс пройден" : Object.keys(S.state.lessons).length ? "Ваш путь к ТОП-10" : "Начнём с нуля";
    const today = [
      ["#/review", "layers", "Повторить карточки", due ? `около ${Math.max(1, Math.round(due / 2))} мин` : "на сегодня всё", due || "", due > 0],
      ["#/trainer?mode=weak", "alert", "Работа над ошибками", weak ? "вопросы, где вы ошиблись" : "ошибок пока нет", weak || ""],
      quest ? ["#/checklist/first-site", "globe", "Мой первый сайт", "реальный сайт за ~1000 ₽", `${qd}/${qt}`] : null
    ].filter(Boolean);
    el.innerHTML = `${S.modules.length ? "" : '<div class="card"><h2>Курс обновляется</h2><p>Новые уроки ещё загружаются. Загляните через несколько минут</p></div>'}
    <section class="hero">
      <div class="day">День ${S.dayNumber()} · серия ${streak} ${App.plural(streak, ["день", "дня", "дней"])}</div>
      <h1>${title}</h1>
      ${next ? nextCardHTML(next) : '<div class="card"><p style="margin:0">Повторяйте карточки и решайте кейсы, чтобы не забыть материал</p></div>'}
    </section>
    <div class="home-grid"><div>
      <div class="section-h"><h2>Ваш сайт в выдаче</h2></div>${serpHTML(o.pct)}
      <div class="section-h"><h2>Сегодня</h2></div><div class="list">${today.map(App.rowLink).join("")}</div>
      <div class="section-h"><h2>Прогресс</h2><a href="#/roadmap">План</a></div>
      <div class="mini-stats"><div class="card"><span>Уроки</span><b>${o.done}/${o.total}</b><span>пройдено</span></div><div class="card"><span>Выучено</span><b>${cs.mature}</b><span>${App.plural(cs.mature, ["карточка", "карточки", "карточек"])} из ${cs.total}</span></div></div>
      ${S.memoryOnly() ? '<p class="pill warn mt">Браузер не сохраняет данные. Экспортируйте прогресс в настройках</p>' : ""}
    </div><div>
      <div class="section-h"><h2>Активность</h2><span class="muted small">4 недели</span></div>
      <div class="card"><div class="heat" style="margin-top:0">${days.join("")}</div><div class="heat-axis"><span>${start.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span><span>сегодня</span></div>
        <ul class="routine"><li><span>Каждый день</span><span>1 урок: теория, практика, квиз и 10 минут карточек</span></li><li><span>Раз в неделю</span><span>экзамен модуля и 2–3 кейса</span></li><li><span>Параллельно</span><span>свой проект во вкладке «Проекты»</span></li></ul></div>
      <div class="section-h"><h2>Модули</h2></div>
      <div class="card">${S.modules.map(mm => { const p = S.moduleProgress(mm); return `<a class="mod-row" href="#/module/${mm.id}"><div class="row between small"><span><span class="n">${mm.num}</span>${esc(mm.title)}</span><span class="mono muted">${p.done}/${p.total}</span></div>${App.bar(p.pct, p.done === p.total ? "ok" : "")}</a>`; }).join("")}</div>
    </div></div>`;
    App.title = "Главная";
  };

  // ---------- План: карта пути
  const PATH_X = [0.5, 0.72, 0.8, 0.62, 0.38, 0.2, 0.28];
  const PATH_STEP = 96, BUBBLE_H = 176;
  function moduleMapHTML(m, next) {
    const p = S.moduleProgress(m), isCur = next && S.moduleOfLesson[next.id] === m, exam = S.state.exams[m.id];
    const nodes = m.lessons.map((l, i) => {
      const lp = S.lessonProgress(l), num = m.num + "." + (i + 1);
      const st = next && next.id === l.id ? "cur" : lp.done ? "done" : lp.started ? "part" : "";
      return { href: "#/lesson/" + l.id, st, inner: st === "done" ? I("check") : st === "cur" ? I("play") : num, title: l.title, meta: `${num} · ${l.minutes} мин`, l };
    });
    nodes.push({ href: "#/exam/" + m.id, st: "exam" + (exam && exam.best >= 75 ? " done" : ""), inner: I("flag"), title: "Экзамен модуля", meta: exam ? `лучший ${exam.best}%` : `${m.exam.length} вопросов` });
    const cur = nodes.find(n => n.st === "cur");
    return `<a class="unit ${isCur ? "cur" : p.done === p.total ? "done" : ""}" href="#/module/${m.id}"><span><small>Модуль ${m.num} · ${esc(m.week)}</small><b>${esc(m.title)}</b></span><span class="frac">${p.done}/${p.total}</span></a>
      <div class="path"><svg class="road" aria-hidden="true"></svg>
      ${nodes.map(n => `<a class="node ${n.st}" href="${n.href}" aria-label="${esc(n.meta + " " + n.title)}">${n.inner}</a>${n.st === "cur" ? "" : `<a class="node-label" href="${n.href}" tabindex="-1"><span class="m">${esc(n.meta)}</span><span class="t">${esc(n.title)}</span></a>`}`).join("")}
      ${cur ? `<div class="bubble"><small>${esc(cur.meta)}</small><b>${esc(cur.title)}</b><a class="btn accent" href="${cur.href}">${S.lessonProgress(cur.l).started ? "Продолжить" : "Начать урок"}</a></div>` : ""}</div>`;
  }
  /** Раскладывает узлы карты змейкой и рисует дорожку; зависит от ширины, поэтому вызывается и на resize. */
  function layoutPaths(root) {
    $$(".path", root).forEach(path => {
      const W = path.clientWidth; if (!W) return;
      const nodes = $$(".node", path), labels = $$(".node-label", path), bubble = $(".bubble", path);
      let y = 48, li = 0; const pts = [];
      nodes.forEach((n, i) => {
        const x = PATH_X[i % PATH_X.length] * W, isCur = n.classList.contains("cur"), r = isCur ? 36 : 28;
        n.style.left = x + "px"; n.style.top = y + "px"; pts.push({ x, y, solid: /done|cur/.test(n.className) });
        if (isCur && bubble) { bubble.style.top = (y + r + 20) + "px"; y += BUBBLE_H; }
        else if (labels[li]) {
          const lab = labels[li++], gap = r + 14;
          if (x >= W / 2) { const w = Math.min(W * 0.42, x - gap); lab.style.width = w + "px"; lab.style.left = (x - gap - w) + "px"; lab.classList.add("l"); }
          else { const left = x + gap; lab.style.left = left + "px"; lab.style.width = Math.min(W * 0.42, W - left) + "px"; lab.classList.remove("l"); }
          lab.style.top = y + "px";
        }
        y += PATH_STEP;
      });
      path.style.height = (y - PATH_STEP + 56) + "px";
      const seg = (a, b) => `C ${a.x} ${a.y + 48}, ${b.x} ${b.y - 48}, ${b.x} ${b.y}`;
      const all = pts.map((p, i) => i ? seg(pts[i - 1], p) : `M ${p.x} ${p.y}`).join(" ");
      let k = 0; while (k < pts.length && pts[k].solid) k++;
      const solid = pts.slice(0, k).map((p, i) => i ? seg(pts[i - 1], p) : `M ${p.x} ${p.y}`).join(" ");
      $("svg.road", path).innerHTML = `<path d="${all}" fill="none" stroke="var(--line2)" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round"/>${k > 1 ? `<path d="${solid}" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>` : ""}`;
    });
  }
  let resizeT; window.addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => layoutPaths(app), 120); });
  routes.roadmap = function (el) {
    const next = S.nextLesson(), o = S.overall();
    el.innerHTML = `<div class="row between hub-title"><h1 style="margin:0">План</h1><span class="counter">${o.done}/${o.total}</span></div>
      <p class="muted small" style="margin:0 4px">${S.modules.length} модулей, ${S.lessons.length} коротких уроков по 20–40 минут. Идеальный темп — 1 урок в день, около ${Math.ceil(S.lessons.length / 5)} недель при 5 днях в неделю. Ничего знать заранее не нужно</p>` +
      S.modules.map(m => moduleMapHTML(m, next)).join("");
    layoutPaths(el);
    const cur = $(".node.cur", el); if (cur) setTimeout(() => cur.scrollIntoView({ block: "center" }), 0);
    App.title = "План";
  };

  routes.module = function (el, [id]) {
    const m = S.moduleById[id]; if (!m) return (el.innerHTML = "<p>Модуль не найден</p>");
    const p = S.moduleProgress(m), exam = S.state.exams[m.id];
    el.innerHTML = `<div class="crumbs"><a href="#/roadmap">План</a> / Модуль ${m.num}</div><h1>${esc(m.title)}</h1><p class="muted">${esc(m.subtitle)}</p>
    <div class="card"><b>Цель модуля</b><p>${esc(m.goal)}</p>${App.bar(p.pct)}<div class="small muted mono">${p.done}/${p.total} уроков</div></div>
    <div class="section-h"><h2>Уроки</h2></div><div class="list">${m.lessons.map((l, i) => { const lp = S.lessonProgress(l); return `<a class="lrow" href="#/lesson/${l.id}"><span class="dot ${lp.done ? "done" : lp.started ? "part" : ""}">${lp.done ? I("check", "s") : ""}</span><span class="grow"><span class="mono">${m.num}.${i + 1}</span> ${esc(l.title)}</span><span class="mono">${lp.pct}%</span></a>`; }).join("")}</div>
    <div class="section-h"><h2>Закрепить</h2></div>
    <div class="list">${[["#/scenarios?m=" + m.id, "split", "Кейсы с выбором", `${m.scenarios.length} ${App.plural(m.scenarios.length, ["ситуация", "ситуации", "ситуаций"])}: решение и последствия`, ""],
      ["#/exam/" + m.id, "flag", "Экзамен модуля", `${m.exam.length} вопросов, порог 75%`, exam ? exam.best + "%" : ""]].map(App.rowLink).join("")}</div>`;
    App.title = m.title;
  };

  // ---------- Урок
  routes.lesson = function (el, [id, tab]) {
    const l = S.lessonById[id]; if (!l) return (el.innerHTML = "<p>Урок не найден</p>");
    tab = tab || "theory"; const m = S.moduleOfLesson[id]; const idx = m.lessons.indexOf(l);
    S.addCards(id); S.L(id); S.save();
    const lp = S.lessonProgress(l);
    const steps = [["theory", "Теория", lp.read, ""], ["practice", "Практика", lp.ttotal > 0 && lp.tdone === lp.ttotal, `${lp.tdone}/${lp.ttotal}`], ["quiz", "Квиз", lp.quiz != null && lp.quiz >= 70, lp.quiz != null ? lp.quiz + "%" : ""], ["cards", "Карточки", false, ""]];
    const prev = idx > 0 ? [`#/lesson/${m.lessons[idx - 1].id}`, m.lessons[idx - 1].title] : m.num > 1 ? [`#/module/${S.modules[m.num - 2].id}`, "Модуль " + (m.num - 1)] : null;
    const nxt = idx < m.lessons.length - 1 ? [`#/lesson/${m.lessons[idx + 1].id}`, m.lessons[idx + 1].title] : [`#/exam/${m.id}`, "Экзамен модуля"];
    el.innerHTML = `<div class="crumbs"><a href="#/roadmap">План</a> / <a href="#/module/${m.id}">Модуль ${m.num}</a> / Урок ${m.num}.${idx + 1}</div>
      <nav class="steps" aria-label="Шаги урока">${steps.map(([k, t, done, extra]) => `<a href="#/lesson/${id}/${k}" class="${tab === k ? "active" : ""} ${done ? "done" : ""}"${tab === k ? ' aria-current="step"' : ""}><i></i><span>${t} <span class="mono">${extra}</span></span></a>`).join("")}</nav>
      <div class="lesson-head"><h1>${esc(l.title)}</h1><div class="meta"><span class="mono">${l.minutes} мин</span>${lp.done ? ' · <span class="pill ok">пройден</span>' : ""}</div></div>
      <div id="tab"></div>
      <div class="lesson-nav">${prev ? `<a class="btn" href="${prev[0]}">${I("chev-l", "s")}<span>${esc(prev[1])}</span></a>` : "<span></span>"}<a class="btn" href="${nxt[0]}"><span>${esc(nxt[1])}</span>${I("chev-r", "s")}</a></div>`;
    const box = $("#tab", el);
    App.title = l.title;
    if (tab === "theory") {
      box.innerHTML = `<p class="muted" style="margin:0 4px 16px">${esc(l.summary)}</p>
      <div class="goals"><b>После урока вы сможете</b><ul>${l.objectives.map(o => { const t = String(o).replace(/^(после урока\s+)?вы\s+сможете\s*/i, ""); return `<li>${esc(t.charAt(0).toUpperCase() + t.slice(1))}</li>`; }).join("")}</ul></div>
      <article class="prose mt">${MD.render(l.theory)}</article>
      ${(l.resources || []).length ? `<div class="section-h"><h2>Ресурсы</h2></div><div class="card"><ul style="margin:0">${l.resources.map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a>${r.note ? ` — <span class="muted">${esc(r.note)}</span>` : ""}</li>`).join("")}</ul></div>` : ""}
      <div class="section-h"><h2>Мои заметки</h2></div><textarea id="note" placeholder="Что запомнилось, что применю на практике" aria-label="Мои заметки">${esc(S.state.notes[id] || "")}</textarea>
      <div class="sticky-actions"><button class="btn ${lp.read ? "" : "primary"}" id="readBtn"${lp.read ? ' title="Нажмите, чтобы снять отметку"' : ""}>${lp.read ? I("check", "s") + "Прочитано" : "Отметить прочитанным"}</button><a class="btn ${lp.read ? "primary" : ""}" href="#/lesson/${id}/practice">К практике</a></div>`;
      $("#note", box).addEventListener("input", e => { S.state.notes[id] = e.target.value; S.save(); });
      $("#readBtn", box).addEventListener("click", () => { const s = S.L(id); s.read = !s.read; if (s.read) S.touch(); S.save(); if (s.read) App.toast("Урок отмечен прочитанным"); render(); });
    } else if (tab === "practice") {
      const pr = l.practice;
      box.innerHTML = `<p class="text2" style="margin:0 4px 8px">${esc(pr.intro || "")}</p>` + pr.tasks.map((t, ti) => {
        const done = !!(S.state.lessons[id].tasks || {})[t.id]; const ck = (S.state.lessons[id].ck = S.state.lessons[id].ck || {});
        return `<div class="task ${done ? "done" : ""}" data-t="${t.id}"><span class="tmeta">Задача ${ti + 1} · ${t.minutes} мин</span><h3>${esc(t.title)}</h3>
        <ol>${t.steps.map(s => `<li>${MD.inline(s)}</li>`).join("")}</ol>
        <p><b>Результат:</b> ${MD.inline(t.deliverable)}</p>
        <b class="small">Самопроверка</b>${t.checklist.map((c, ci) => `<label class="chk ${ck[t.id + ci] ? "done" : ""}"><input type="checkbox" data-ck="${t.id}${ci}" ${ck[t.id + ci] ? "checked" : ""}><span>${MD.inline(c)}</span></label>`).join("")}
        <div class="field"><label>Мои результаты и выводы</label><textarea data-note="${t.id}" placeholder="Ссылка на таблицу, цифры, выводы">${esc(S.state.notes[t.id] || "")}</textarea></div>
        <button class="btn ${done ? "" : "ok"} block" data-done="${t.id}"${done ? ' title="Нажмите, чтобы снять отметку"' : ""}>${done ? I("check", "s") + "Выполнено" : "Задача выполнена"}</button></div>`;
      }).join("") + `<div class="sticky-actions"><a class="btn primary" href="#/lesson/${id}/quiz">К квизу</a></div>`;
      $$("[data-ck]", box).forEach(c => c.addEventListener("change", () => { S.state.lessons[id].ck[c.dataset.ck] = c.checked; S.save(); c.closest(".chk").classList.toggle("done", c.checked); }));
      $$("[data-note]", box).forEach(c => c.addEventListener("input", () => { S.state.notes[c.dataset.note] = c.value; S.save(); }));
      $$("[data-done]", box).forEach(b => b.addEventListener("click", () => { const s = S.L(id); s.tasks[b.dataset.done] = !s.tasks[b.dataset.done]; if (s.tasks[b.dataset.done]) S.touch(); S.save(); render(); }));
    } else if (tab === "quiz") {
      const qs = l.quiz.map((q, i) => Object.assign({ id: `${id}-q${i}`, ctx: m.num + "." + (idx + 1) }, q));
      box.innerHTML = `<p class="muted" style="margin:0 4px">Порог зачёта 70%. ${lp.quiz != null ? "Лучший результат: <b class='mono'>" + lp.quiz + "%</b>. " : ""}Вопросы проверяют понимание, а не заучивание, поэтому читайте объяснения</p><div id="qbox"></div>`;
      App.runQuiz($("#qbox", box), qs, { passPct: 70, shuffle: true, title: "Квиз", onFinish: r => { const s = S.L(id); s.quizAttempts++; s.quizBest = Math.max(s.quizBest || 0, r.pct); S.save(); renderNav(); },
        after: `<a class="btn" href="#/lesson/${id}/cards">Карточки урока</a>` });
    } else {
      S.addCards(id);
      box.innerHTML = `<p class="muted" style="margin:0 4px 12px">Эти карточки уже в вашей колоде интервального повторения. <a href="#/review?m=${m.id}">Повторять модуль</a></p><div class="grid g2">${l.cards.map(c => `<div class="card"><b>${MD.inline(c.front)}</b><details><summary class="muted small" style="cursor:pointer;margin-top:8px">Показать ответ</summary><p>${MD.inline(c.back)}</p></details></div>`).join("")}</div>`;
    }
  };

  // ---------- Экзамен модуля
  routes.exam = function (el, [id]) {
    const m = S.moduleById[id]; if (!m) return (el.innerHTML = "<p>Модуль не найден</p>");
    const prev = S.state.exams[id];
    el.innerHTML = `<div class="crumbs"><a href="#/module/${id}">Модуль ${m.num}</a> / Экзамен</div><h1>Экзамен: ${esc(m.title)}</h1><p class="muted" style="margin:0 4px">${m.exam.length} вопросов по всему модулю, порядок вопросов и ответов перемешивается. Порог 75%. ${prev ? "Лучший результат: <b class='mono'>" + prev.best + "%</b>" : ""}</p><div id="qbox"></div>`;
    const qs = m.exam.map((q, i) => Object.assign({ id: `${id}-e${i}`, ctx: "Экзамен" }, q));
    App.runQuiz($("#qbox", el), qs, { passPct: 75, shuffle: true, shuffleQuestions: true, title: "Экзамен", onFinish: r => { const cur = S.state.exams[id]; if (!cur || r.pct > cur.best) S.state.exams[id] = { best: r.pct, at: Date.now() }; S.save(); } });
    App.title = "Экзамен " + m.title;
  };
})();
