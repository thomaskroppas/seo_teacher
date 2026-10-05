/* Остальные экраны: карточки, тренажёр, кейсы, инструменты, проекты, чек-листы, словарь, поиск, настройки. */
(function () {
  const { esc, $, $$, S, routes } = App;
  const uid = () => Math.random().toString(36).slice(2, 9);
  const fmtDate = d => d ? new Date(d).toLocaleDateString("ru-RU") : "—";

  // ---------- Интервальное повторение
  routes.review = function (el, _, q) {
    let due = S.dueCards();
    if (q.m) due = due.filter(c => c.module === q.m);
    const stats = S.cardStats();
    const queue = due.slice(0, 20);
    App.title = "Карточки";
    const head = `<h1>Карточки</h1><div class="row"><span class="pill pri">К повторению: ${due.length}</span><span class="pill">В колоде: ${stats.total}</span><span class="pill ok">Выучено: ${stats.mature}</span>
      <select id="mf" style="width:auto"><option value="">Все модули</option>${S.modules.map(m => `<option value="${m.id}" ${q.m === m.id ? "selected" : ""}>${m.num}. ${esc(m.title)}</option>`).join("")}</select></div>`;
    if (!queue.length) {
      el.innerHTML = head + `<div class="card center mt"><h2>${stats.total ? "Всё повторено 🎉" : "Колода пока пуста"}</h2><p class="muted">${stats.total ? "Возвращайтесь завтра: интервалы 1 → 3 → 7 → 16 → 35 дней." : "Карточки добавляются автоматически, когда вы открываете урок."}</p>
        <button class="btn" id="addAll">Добавить карточки всех уроков в колоду</button></div>`;
      $("#mf", el).addEventListener("change", e => App.go("#/review" + (e.target.value ? "?m=" + e.target.value : "")));
      const b = $("#addAll", el); if (b) b.addEventListener("click", () => { S.lessons.forEach(l => S.addCards(l.id)); App.toast("Карточки добавлены"); App.render(); });
      return;
    }
    let i = 0, flipped = false;
    function show() {
      const c = queue[i];
      el.innerHTML = head + `<div class="muted small center mt">Карточка ${i + 1} из ${queue.length} · урок ${esc(c.lesson.replace("-l", "."))}</div><div class="flash mt"><div class="flip ${flipped ? "on" : ""}" id="flip" tabindex="0" role="button" aria-label="Перевернуть карточку">
        <div class="face front"><div>${MD.inline(c.front)}</div><div class="muted small" style="margin-top:18px">нажмите, чтобы увидеть ответ (пробел)</div></div><div class="face back"><div>${MD.inline(c.back)}</div></div></div>
        <div class="row mt ${flipped ? "" : "hide"}" id="rate" style="justify-content:center"><button class="btn danger" data-g="0">Не помню</button><button class="btn" data-g="1">Трудно</button><button class="btn ok" data-g="2">Хорошо</button><button class="btn primary" data-g="3">Легко</button></div></div>`;
      $("#mf", el).addEventListener("change", e => App.go("#/review" + (e.target.value ? "?m=" + e.target.value : "")));
      const flip = () => { flipped = true; $("#flip", el).classList.add("on"); $("#rate", el).classList.remove("hide"); };
      $("#flip", el).addEventListener("click", flip);
      $$("[data-g]", el).forEach(b => b.addEventListener("click", () => { S.rateCard(c.id, +b.dataset.g); i++; flipped = false; if (i < queue.length) show(); else App.render(); }));
      keyHandler = e => { if (e.key === " " && !flipped) { e.preventDefault(); flip(); } else if (flipped && "1234".includes(e.key)) { $(`[data-g="${+e.key - 1}"]`, el).click(); } };
    }
    show();
  };
  let keyHandler = null;
  document.addEventListener("keydown", e => { if (keyHandler && location.hash.startsWith("#/review") && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) keyHandler(e); });

  // ---------- Тренажёр
  function questionPool() {
    const pool = [];
    S.modules.forEach(m => {
      m.lessons.forEach((l, li) => l.quiz.forEach((q, i) => pool.push(Object.assign({ id: `${l.id}-q${i}`, ctx: `${m.num}.${li + 1}`, module: m.id, read: !!(S.state.lessons[l.id] || {}).read }, q))));
      m.exam.forEach((q, i) => pool.push(Object.assign({ id: `${m.id}-e${i}`, ctx: `Модуль ${m.num}`, module: m.id, read: m.lessons.some(l => (S.state.lessons[l.id] || {}).read) }, q)));
    });
    return pool;
  }
  routes.trainer = function (el, _, q) {
    App.title = "Тренажёр";
    const pool = questionPool(); const weak = new Set(S.weakQuestionIds());
    if (q.go) {
      let sel = pool;
      if (q.mode === "weak") sel = pool.filter(x => weak.has(x.id));
      else if (q.mode === "read") sel = pool.filter(x => x.read);
      if (q.m) sel = sel.filter(x => x.module === q.m);
      sel = App.shuffle(sel).slice(0, +q.n || 15);
      el.innerHTML = `<h1>Тренажёр</h1><div id="qbox"></div>`;
      if (!sel.length) { el.innerHTML += `<div class="card">Подходящих вопросов нет. ${q.mode === "weak" ? "Ошибок пока нет — отлично!" : "Откройте и прочитайте хотя бы один урок."} <a href="#/trainer">Назад</a></div>`; return; }
      App.runQuiz($("#qbox", el), sel, { shuffle: true, title: "Тренажёр", after: '<a class="btn" href="#/trainer">Другие настройки</a>' });
      return;
    }
    el.innerHTML = `<h1>Тренажёр вопросов</h1><p class="muted">Смешанные вопросы из всех квизов и экзаменов. Лучший способ закрепить материал — режим «Работа над ошибками».</p>
      <div class="card"><div class="grid g3">
      <div class="field"><label>Режим</label><select id="mode"><option value="read">Из пройденных уроков</option><option value="weak">Работа над ошибками (${weak.size})</option><option value="all">Все вопросы курса (${pool.length})</option></select></div>
      <div class="field"><label>Модуль</label><select id="mm"><option value="">Все</option>${S.modules.map(m => `<option value="${m.id}">${m.num}. ${esc(m.title)}</option>`).join("")}</select></div>
      <div class="field"><label>Количество</label><select id="n"><option>10</option><option selected>15</option><option>25</option><option>40</option></select></div></div>
      <button class="btn primary" id="start">Начать</button></div>`;
    $("#start", el).addEventListener("click", () => App.go(`#/trainer?go=1&mode=${$("#mode", el).value}&m=${$("#mm", el).value}&n=${$("#n", el).value}`));
  };

  // ---------- Кейсы
  routes.scenarios = function (el, _, q) {
    App.title = "Кейсы";
    el.innerHTML = `<h1>Кейсы с выбором</h1><p class="muted">Мини-ситуации из практики. Выберите решение — и увидите последствия каждого варианта. Здесь нет «правильных ответов из учебника», только компромиссы.</p>
      <div class="row"><select id="mf" style="width:auto"><option value="">Все модули</option>${S.modules.map(m => `<option value="${m.id}" ${q.m === m.id ? "selected" : ""}>${m.num}. ${esc(m.title)}</option>`).join("")}</select><button class="btn" id="rand">🎲 Случайный непройденный</button></div><div id="list" class="mt"></div>`;
    $("#mf", el).addEventListener("change", e => App.go("#/scenarios" + (e.target.value ? "?m=" + e.target.value : "")));
    const all = []; S.modules.forEach(m => { if (!q.m || q.m === m.id) m.scenarios.forEach(s => all.push({ m, s })); });
    const list = $("#list", el);
    list.innerHTML = all.map(({ m, s }) => { const st = S.state.scen[s.id];
      return `<div class="scen mt" id="sc-${s.id}"><div class="row between"><b>${esc(s.title)}</b><span class="row"><span class="pill">Модуль ${m.num}</span>${st ? `<span class="pill ${st === "best" ? "ok" : st === "ok" ? "warn" : "bad"}">${{ best: "лучший выбор", ok: "приемлемо", bad: "ошибка" }[st]}</span>` : ""}</span></div>
      <p>${MD.inline(s.situation)}</p><div class="chs">${s.choices.map((c, i) => `<button class="ch" data-i="${i}">${MD.inline(c.text)}</button>`).join("")}</div></div>`; }).join("");
    all.forEach(({ s }) => {
      const box = $("#sc-" + s.id, list);
      $$(".ch", box).forEach(b => b.addEventListener("click", () => {
        const pick = +b.dataset.i; S.state.scen[s.id] = s.choices[pick].verdict; S.touch();
        $$(".ch", box).forEach((x, i) => { x.disabled = true; x.classList.add(s.choices[i].verdict); if (i === pick) x.classList.add("picked"); x.insertAdjacentHTML("beforeend", `<span class="fb"><b>${{ best: "✅ Лучший вариант. ", ok: "⚖️ Допустимо, но есть минусы. ", bad: "❌ Рискованно. " }[s.choices[i].verdict]}</b>${MD.inline(s.choices[i].feedback)}</span>`); });
        box.insertAdjacentHTML("beforeend", `<button class="btn sm mt" data-retry>Сыграть заново</button>`);
        $("[data-retry]", box).addEventListener("click", () => { delete S.state.scen[s.id]; S.save(); App.render(); });
      }));
    });
    $("#rand", el).addEventListener("click", () => { const open = all.filter(x => !S.state.scen[x.s.id]); const pick = App.shuffle(open.length ? open : all)[0]; if (pick) { const n = $("#sc-" + pick.s.id, list); n.scrollIntoView({ behavior: "smooth", block: "center" }); } });
  };

  // ---------- Инструменты
  routes.tools = function (el, [id]) {
    App.title = "Инструменты";
    const t = Tools.find(x => x.id === id) || Tools[0];
    el.innerHTML = `<h1>Инструменты</h1><p class="muted">Калькуляторы для реальных решений. Данные сохраняются в браузере. Все формулы — ориентиры; логика объясняется в соответствующих уроках.</p>
      <nav class="tabs">${Tools.map(x => `<a href="#/tools/${x.id}" class="${x.id === t.id ? "active" : ""}">${esc(x.title)}</a>`).join("")}</nav>
      <div class="card"><h2 style="margin-top:0">${esc(t.title)}</h2><p class="muted">${esc(t.desc)}</p><div id="tool"></div></div>`;
    t.render($("#tool", el));
  };

  // ---------- Проекты
  const projects = () => S.state.projects;
  routes.projects = function (el) {
    App.title = "Проекты";
    el.innerHTML = `<div class="row between"><h1>Мои проекты</h1><button class="btn primary" id="add">+ Новый проект</button></div>
      <p class="muted">Здесь вы применяете курс на практике: ключи и позиции, ссылки и бюджет, статус покупки/запуска, чек-листы.</p>
      ${projects().length ? `<div class="grid g2">${projects().map(p => { const spend = (p.links || []).reduce((a, l) => a + (+l.price || 0), 0) + (+p.price || 0);
        return `<a class="card" style="color:inherit" href="#/project/${p.id}"><div class="row between"><b>${esc(p.name)}</b><span class="pill pri">${esc(p.status)}</span></div><div class="muted small">${esc(p.domain || "")} · ${esc(p.niche || "")}</div>
        <div class="row small mt"><span>🔑 ${(p.keywords || []).length}</span><span>🔗 ${(p.links || []).length}</span><span>💰 вложено ${spend}</span></div></a>`; }).join("")}</div>` : '<div class="card center"><p>Проектов пока нет. Начните с идеи ниши (урок 2.1) или покупки сайта (модуль 3).</p></div>'}`;
    $("#add", el).addEventListener("click", () => {
      const p = { id: uid(), name: "Новый проект", domain: "", niche: "", type: "new", status: "Идея", price: 0, started: S.today(), notes: "", keywords: [], links: [], expenses: [] };
      projects().push(p); S.save(); App.go("#/project/" + p.id);
    });
  };
  const STATUSES = ["Идея", "Исследование ниши", "Поиск/оценка сайта", "Покупка/запуск", "Технический аудит", "Контент", "Линкбилдинг", "Рост (ТОП-30)", "ТОП-10", "Продан/закрыт"];
  routes.project = function (el, [id, tab]) {
    const p = projects().find(x => x.id === id); if (!p) return (el.innerHTML = '<p>Проект не найден. <a href="#/projects">К списку</a></p>');
    tab = tab || "overview"; App.title = p.name;
    const save = () => S.save();
    el.innerHTML = `<div class="crumbs"><a href="#/projects">Проекты</a> / ${esc(p.name)}</div><h1>${esc(p.name)}</h1>
      <nav class="tabs">${[["overview", "Обзор"], ["keywords", "Ключи и позиции"], ["links", "Ссылки"], ["checks", "Чек-листы"]].map(([k, t]) => `<a href="#/project/${id}/${k}" class="${tab === k ? "active" : ""}">${t}</a>`).join("")}</nav><div id="pt"></div>`;
    const box = $("#pt", el);
    const bindInputs = (root, obj) => $$("[data-f]", root).forEach(i => i.addEventListener("input", () => { obj[i.dataset.f] = i.type === "number" ? +i.value : i.value; save(); }));
    if (tab === "overview") {
      const spendLinks = p.links.reduce((a, l) => a + (+l.price || 0), 0);
      box.innerHTML = `<div class="grid g2"><div class="card">
        <div class="field"><label>Название</label><input data-f="name" type="text" value="${esc(p.name)}"></div>
        <div class="field"><label>Домен</label><input data-f="domain" type="text" value="${esc(p.domain)}" placeholder="example.com"></div>
        <div class="field"><label>Ниша</label><input data-f="niche" type="text" value="${esc(p.niche)}"></div>
        <div class="field"><label>Тип</label><select data-f="type">${[["new", "Новый сайт с нуля"], ["expired", "Expired-домен"], ["bought", "Купленный готовый сайт"]].map(([v, t]) => `<option value="${v}" ${p.type === v ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        <div class="field"><label>Статус</label><select data-f="status">${STATUSES.map(s => `<option ${p.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
        <div class="field"><label>Цена покупки (если покупали)</label><input data-f="price" type="number" value="${p.price || 0}"></div>
        <div class="field"><label>Дата старта</label><input data-f="started" type="date" value="${esc(p.started || "")}"></div></div>
        <div class="card"><div class="kpis">${[["Ключей", p.keywords.length], ["Ссылок", p.links.length], ["Потрачено на ссылки", spendLinks], ["Всего вложено", spendLinks + (+p.price || 0)], ["Ключей в ТОП-10", p.keywords.filter(k => { const h = k.hist && k.hist[k.hist.length - 1]; return h && h.pos > 0 && h.pos <= 10; }).length]].map(([a, b]) => `<div class="kpi"><span>${a}</span><b>${b}</b></div>`).join("")}</div>
        <div class="field"><label>Заметки, решения, гипотезы</label><textarea data-f="notes" style="min-height:220px">${esc(p.notes)}</textarea></div>
        <button class="btn danger sm" id="del">Удалить проект</button></div></div>`;
      bindInputs(box, p);
      $("#del", box).addEventListener("click", () => { if (confirm("Удалить проект безвозвратно?")) { S.state.projects = projects().filter(x => x !== p); save(); App.go("#/projects"); } });
    } else if (tab === "keywords") {
      const spark = h => { if (!h || h.length < 2) return ""; const w = 90, ht = 26, mx = Math.max(...h.map(x => x.pos), 20); const pts = h.map((x, i) => `${(i / (h.length - 1) * w).toFixed(1)},${(x.pos / mx * (ht - 4) + 2).toFixed(1)}`).join(" "); return `<svg width="${w}" height="${ht}" viewBox="0 0 ${w} ${ht}"><polyline fill="none" stroke="var(--primary)" stroke-width="2" points="${pts}"/></svg>`; };
      box.innerHTML = `<div class="card"><div class="row"><input id="kw" type="text" placeholder="Ключевой запрос" class="grow"><input id="ku" type="text" placeholder="Целевой URL" class="grow"><input id="kv" type="number" placeholder="Объём" style="width:110px"><button class="btn primary" id="addk">Добавить</button></div></div>
      <div class="table-wrap mt"><table><thead><tr><th>Запрос</th><th>URL</th><th>Объём</th><th>Позиция</th><th>Динамика</th><th>Обновить позицию</th><th></th></tr></thead><tbody>
      ${p.keywords.map(k => { const last = k.hist && k.hist[k.hist.length - 1]; return `<tr><td>${esc(k.kw)}</td><td class="small">${esc(k.url || "")}</td><td>${k.vol || ""}</td><td><b>${last ? last.pos : "—"}</b> <span class="muted small">${last ? fmtDate(last.d) : ""}</span></td><td>${spark(k.hist)}</td><td><input type="number" data-pos="${k.id}" style="width:80px" placeholder="поз."> <button class="btn sm" data-setpos="${k.id}">OK</button></td><td><button class="btn sm danger" data-delk="${k.id}">×</button></td></tr>`; }).join("") || '<tr><td colspan="7" class="muted">Добавьте запросы и вносите позиции раз в неделю (из GSC или трекера). Позиция 0 = нет в топ-100.</td></tr>'}</tbody></table></div>`;
      $("#addk", box).addEventListener("click", () => { const kw = $("#kw", box).value.trim(); if (!kw) return; p.keywords.push({ id: uid(), kw, url: $("#ku", box).value.trim(), vol: +$("#kv", box).value || 0, hist: [] }); save(); App.render(); });
      $$("[data-setpos]", box).forEach(b => b.addEventListener("click", () => { const k = p.keywords.find(x => x.id === b.dataset.setpos); const v = $(`[data-pos="${k.id}"]`, box).value; if (v === "") return; k.hist.push({ d: S.today(), pos: +v }); S.touch(); App.render(); }));
      $$("[data-delk]", box).forEach(b => b.addEventListener("click", () => { p.keywords = p.keywords.filter(x => x.id !== b.dataset.delk); save(); App.render(); }));
    } else if (tab === "links") {
      const total = p.links.reduce((a, l) => a + (+l.price || 0), 0);
      box.innerHTML = `<div class="card"><div class="grid g3"><div class="field"><label>URL размещения / донор</label><input id="ld" type="text"></div><div class="field"><label>Анкор</label><input id="la" type="text"></div><div class="field"><label>Куда ведёт (URL)</label><input id="lt" type="text"></div>
        <div class="field"><label>Тип</label><select id="ly">${["Гест-пост", "Outreach", "Покупная (биржа)", "Крауд/форум", "Digital PR", "Каталог/профиль", "Партнёрская", "Другое"].map(x => `<option>${x}</option>`).join("")}</select></div><div class="field"><label>Цена</label><input id="lp" type="number" value="0"></div><div class="field"><label>Дата</label><input id="ldt" type="date" value="${S.today()}"></div></div><button class="btn primary" id="addl">Добавить ссылку</button></div>
      <div class="kpis mt"><div class="kpi"><span>Ссылок</span><b>${p.links.length}</b></div><div class="kpi"><span>Потрачено</span><b>${total}</b></div><div class="kpi"><span>Средняя цена</span><b>${p.links.length ? Math.round(total / p.links.length) : 0}</b></div><div class="kpi"><span>Брендовых/голых/прочих</span><b class="small">${(() => { const b = p.links.filter(l => /бренд|brand|http|www/i.test(l.anchor || "")).length; return b + " / – / " + (p.links.length - b); })()}</b></div></div>
      <div class="table-wrap"><table><thead><tr><th>Дата</th><th>Донор</th><th>Анкор</th><th>Тип</th><th>Цена</th><th>Статус</th><th></th></tr></thead><tbody>${p.links.map(l => `<tr><td>${fmtDate(l.date)}</td><td class="small">${esc(l.donor)}</td><td>${esc(l.anchor)}<div class="muted small">→ ${esc(l.target || "")}</div></td><td>${esc(l.type)}</td><td>${l.price}</td><td><select data-ls="${l.id}">${["Размещена", "Проиндексирована", "Не индексируется", "Удалена"].map(s => `<option ${l.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></td><td><button class="btn sm danger" data-dell="${l.id}">×</button></td></tr>`).join("") || '<tr><td colspan="7" class="muted">Ведите журнал всех ссылок: он понадобится для контроля живучести и диверсификации анкоров.</td></tr>'}</tbody></table></div>`;
      $("#addl", box).addEventListener("click", () => { const donor = $("#ld", box).value.trim(); if (!donor) return; p.links.push({ id: uid(), donor, anchor: $("#la", box).value.trim(), target: $("#lt", box).value.trim(), type: $("#ly", box).value, price: +$("#lp", box).value || 0, date: $("#ldt", box).value, status: "Размещена" }); S.touch(); App.render(); });
      $$("[data-ls]", box).forEach(s => s.addEventListener("change", () => { p.links.find(x => x.id === s.dataset.ls).status = s.value; save(); }));
      $$("[data-dell]", box).forEach(b => b.addEventListener("click", () => { p.links = p.links.filter(x => x.id !== b.dataset.dell); save(); App.render(); }));
    } else {
      box.innerHTML = `<p class="muted">Чек-листы для этого проекта (прогресс сохраняется отдельно для каждого проекта).</p><div class="grid g2">${(window.CHECKLISTS || []).map(c => { const pr = checkProgress(c, id); return `<a class="card" style="color:inherit" href="#/checklist/${c.id}?p=${id}"><b>${esc(c.title)}</b><div class="muted small">${esc(c.description || "")}</div>${App.bar(pr.pct)}<div class="small muted">${pr.done}/${pr.total}</div></a>`; }).join("")}</div>`;
    }
  };

  // ---------- Чек-листы
  function checkProgress(c, pid) {
    const st = S.state.checklists[(pid || "-") + ":" + c.id] || {}; let total = 0, done = 0;
    c.groups.forEach((g, gi) => g.items.forEach((_, ii) => { total++; if (st[gi + "." + ii]) done++; }));
    return { total, done, pct: total ? Math.round(done / total * 100) : 0 };
  }
  routes.checklists = function (el) {
    App.title = "Чек-листы";
    el.innerHTML = `<h1>Чек-листы</h1><p class="muted">Рабочие списки для запуска, покупки сайта, аудита, линкбилдинга и рутины. Откройте чек-лист и отмечайте пункты — можно привязать к проекту.</p>
      <div class="grid g2">${(window.CHECKLISTS || []).map(c => { const pr = checkProgress(c, ""); return `<a class="card" style="color:inherit" href="#/checklist/${c.id}"><b>${esc(c.title)}</b><div class="muted small">${esc(c.description || "")}</div>${App.bar(pr.pct)}<div class="small muted">${pr.done}/${pr.total}</div></a>`; }).join("")}</div>`;
  };
  routes.checklist = function (el, [id], q) {
    const c = (window.CHECKLISTS || []).find(x => x.id === id); if (!c) return (el.innerHTML = "<p>Не найдено.</p>");
    const pid = q.p || ""; const key = (pid || "-") + ":" + c.id; const st = (S.state.checklists[key] = S.state.checklists[key] || {});
    const proj = projects().find(x => x.id === pid); App.title = c.title;
    el.innerHTML = `<div class="crumbs"><a href="#/checklists">Чек-листы</a></div><div class="row between"><h1>${esc(c.title)}</h1><div class="row"><select id="ps" style="width:auto"><option value="">Без проекта</option>${projects().map(p => `<option value="${p.id}" ${p.id === pid ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select><button class="btn sm" id="rs">Сбросить</button></div></div>
      <p class="muted">${esc(c.description || "")}</p><div id="prog"></div>
      ${c.groups.map((g, gi) => `<div class="card"><h3 style="margin-top:0">${esc(g.title)}</h3>${g.items.map((it, ii) => `<label class="chk ${st[gi + "." + ii] ? "done" : ""}"><input type="checkbox" data-k="${gi}.${ii}" ${st[gi + "." + ii] ? "checked" : ""}><span>${MD.inline(it)}</span></label>`).join("")}</div>`).join("")}`;
    const upd = () => { const p = checkProgress(c, pid); $("#prog", el).innerHTML = `${App.bar(p.pct, p.pct === 100 ? "ok" : "")}<div class="small muted">${p.done}/${p.total} · ${p.pct}%</div>`; };
    upd();
    $$("[data-k]", el).forEach(i => i.addEventListener("change", () => { st[i.dataset.k] = i.checked; i.closest(".chk").classList.toggle("done", i.checked); S.touch(); upd(); }));
    $("#ps", el).addEventListener("change", e => App.go("#/checklist/" + id + (e.target.value ? "?p=" + e.target.value : "")));
    $("#rs", el).addEventListener("click", () => { if (confirm("Сбросить отметки этого чек-листа?")) { S.state.checklists[key] = {}; S.save(); App.render(); } });
  };

  // ---------- Словарь
  routes.glossary = function (el, _, q) {
    App.title = "Словарь";
    const G = window.GLOSSARY || [];
    el.innerHTML = `<h1>Словарь SEO</h1><input id="gs" type="search" placeholder="Найти термин… (${G.length})" value="${esc(q.q || "")}"><div id="gl" class="mt"></div>`;
    const draw = () => { const s = $("#gs", el).value.trim().toLowerCase(); const list = G.filter(g => !s || (g.term + " " + (g.en || "") + " " + g.def).toLowerCase().includes(s));
      $("#gl", el).innerHTML = list.map(g => `<div class="term"><b>${esc(g.term)}</b> ${g.en ? `<span class="muted small">${esc(g.en)}</span>` : ""}<div>${MD.inline(g.def)}</div>${(g.see || []).length ? `<div class="small muted">См. также: ${g.see.map(esc).join(", ")}</div>` : ""}</div>`).join("") || '<p class="muted">Ничего не найдено.</p>'; };
    $("#gs", el).addEventListener("input", draw); draw();
  };

  // ---------- Поиск
  routes.search = function (el, _, q) {
    const term = (q.q || "").trim().toLowerCase(); App.title = "Поиск"; $("#searchInput").value = q.q || "";
    const res = [];
    if (term) {
      S.modules.forEach(m => m.lessons.forEach((l, i) => {
        const hay = l.theory.toLowerCase(); const at = hay.indexOf(term);
        const inTitle = (l.title + " " + l.summary).toLowerCase().includes(term);
        if (at >= 0 || inTitle) { const s = Math.max(0, at - 70); res.push({ k: "Урок " + m.num + "." + (i + 1), t: l.title, href: "#/lesson/" + l.id, sn: at >= 0 ? l.theory.slice(s, at + 150).replace(/[#>*`|]/g, "") : l.summary, w: inTitle ? 2 : 1 }); }
        l.cards.forEach(c => { if ((c.front + c.back).toLowerCase().includes(term)) res.push({ k: "Карточка", t: c.front, href: "#/lesson/" + l.id + "/cards", sn: c.back, w: 0 }); });
      }));
      (window.GLOSSARY || []).forEach(g => { if ((g.term + " " + g.def).toLowerCase().includes(term)) res.push({ k: "Словарь", t: g.term, href: "#/glossary?q=" + encodeURIComponent(g.term), sn: g.def, w: 1 }); });
      res.sort((a, b) => b.w - a.w);
    }
    const hl = s => esc(s).replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), m => `<mark>${m}</mark>`);
    el.innerHTML = `<h1>Поиск: «${esc(q.q || "")}»</h1>${res.length ? res.slice(0, 60).map(r => `<a class="card" style="color:inherit;display:block" href="${r.href}"><span class="pill">${r.k}</span> <b>${esc(r.t)}</b><div class="small muted">…${hl(r.sn)}…</div></a>`).join("") : '<p class="muted">Ничего не найдено.</p>'}`;
  };

  // ---------- Настройки
  routes.settings = function (el) {
    App.title = "Настройки";
    el.innerHTML = `<h1>Настройки и данные</h1><div class="grid g2"><div class="card"><h3 style="margin-top:0">Прогресс</h3><p class="muted">Все данные хранятся только в этом браузере. Делайте экспорт перед очисткой браузера и для переноса на другое устройство.</p>
      <div class="row"><button class="btn primary" id="exp">Экспорт в файл</button><button class="btn" id="imp">Импорт из файла</button><input type="file" id="file" accept="application/json" class="hide"></div></div>
      <div class="card"><h3 style="margin-top:0">Старт обучения</h3><div class="field"><label>Дата начала (для счётчика дней)</label><input type="date" id="sd" value="${esc(S.state.startDate)}"></div>
      <h3>Сброс</h3><button class="btn danger" id="reset">Стереть весь прогресс</button></div></div>
      <div class="card"><h3 style="margin-top:0">Как учиться по этому курсу</h3><ol><li>Теория → практика → квиз: не переходите дальше, пока практика не сделана (результаты записывайте в заметки).</li><li>Карточки — 10 минут в день. Они возвращают вас к теме через 1, 3, 7, 16, 35 дней.</li><li>Кейсы — после каждого модуля: учат принимать решения.</li><li>Ведите реальный проект. Курс — карта, трафик даёт только ваш сайт.</li></ol></div>`;
    $("#exp", el).addEventListener("click", () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([S.exportJSON()], { type: "application/json" })); a.download = "seo-teacher-progress-" + S.today() + ".json"; a.click(); });
    $("#imp", el).addEventListener("click", () => $("#file", el).click());
    $("#file", el).addEventListener("change", e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => { try { S.importJSON(t); App.toast("Импортировано"); App.render(); } catch (err) { alert("Не удалось импортировать: " + err.message); } }); });
    $("#sd", el).addEventListener("change", e => { S.state.startDate = e.target.value || S.today(); S.save(); });
    $("#reset", el).addEventListener("click", () => { if (confirm("Точно стереть весь прогресс, проекты и заметки?") && confirm("Это необратимо. Продолжить?")) { S.reset(); App.go("#/"); App.render(); } });
  };
})();
