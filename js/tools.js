/* Практические калькуляторы и генераторы. Каждый инструмент: {id,title,desc,render(el)} */
(function () {
  const esc = MD.esc;
  const num = v => { const n = parseFloat(String(v).replace(",", ".").replace(/\s/g, "")); return isFinite(n) ? n : 0; };
  const fmt = (n, d = 0) => isFinite(n) ? n.toLocaleString("ru-RU", { maximumFractionDigits: d }) : "—";
  const saved = id => (Store.state.tools[id] = Store.state.tools[id] || {});
  const field = (id, key, label, type, def, hint) => {
    const v = saved(id)[key] != null ? saved(id)[key] : def;
    return `<div class="field"><label for="${id}-${key}">${label}</label><input id="${id}-${key}" data-k="${key}" type="${type || "number"}" value="${esc(v)}" ${type === "number" || !type ? 'step="any" inputmode="decimal"' : ""}>${hint ? `<span class="muted small">${hint}</span>` : ""}</div>`;
  };
  const select = (id, key, label, opts, def) => {
    const v = saved(id)[key] != null ? saved(id)[key] : def;
    return `<div class="field"><label for="${id}-${key}">${label}</label><select id="${id}-${key}" data-k="${key}">${opts.map(([val, t]) => `<option value="${val}" ${String(v) === String(val) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>`;
  };
  const textarea = (id, key, label, def, hint) => `<div class="field"><label for="${id}-${key}">${label}</label><textarea id="${id}-${key}" data-k="${key}">${esc(saved(id)[key] != null ? saved(id)[key] : def)}</textarea>${hint ? `<span class="muted small">${hint}</span>` : ""}</div>`;
  const bind = (el, id, calc) => {
    const run = () => {
      const vals = {};
      el.querySelectorAll("[data-k]").forEach(i => { vals[i.dataset.k] = i.value; });
      Object.assign(saved(id), vals); Store.save();
      el.querySelector(".out").innerHTML = calc(vals);
    };
    el.addEventListener("input", run); el.addEventListener("change", run); run();
  };
  const kpi = (l, v) => `<div class="kpi"><span>${l}</span><b>${v}</b></div>`;
  const median = a => { const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };

  const tools = [];

  // 1. Оценка покупки сайта
  tools.push({ id: "buy", title: "Оценка покупки сайта", desc: "Окупаемость, мультипликатор, скоринг риска и ориентир справедливой цены. Урок 3.4.",
    render(el) {
      const id = "buy";
      el.innerHTML = `<div class="grid g2"><div>
        ${field(id, "price", "Запрашиваемая цена", "number", 3000)}
        ${field(id, "profit", "Чистая прибыль в месяц (среднее за 12 мес., проверено выпиской)", "number", 120)}
        ${field(id, "rev", "Выручка в месяц", "number", 200)}
        ${field(id, "traffic", "Органический трафик в месяц (по GSC, не по словам продавца)", "number", 8000)}
        ${field(id, "age", "Возраст сайта, месяцев", "number", 30)}
        ${field(id, "rd", "Ссылающихся доменов (RD)", "number", 90)}
        </div><div>
        ${field(id, "topShare", "Доля трафика с самой сильной страницы, %", "number", 25)}
        ${select(id, "trend", "Тренд трафика за 12 мес.", [["up", "Растёт"], ["flat", "Стабильный"], ["down", "Падает"], ["spiky", "Скачки/обвалы после апдейтов"]], "flat")}
        ${select(id, "src", "Источник дохода", [["many", "Несколько источников (ads + affiliate + свои продукты)"], ["two", "Две партнёрки/сети"], ["one", "Один источник (одна партнёрка/сеть)"]], "two")}
        ${select(id, "content", "Контент", [["human", "Авторский, с экспертизой"], ["mixed", "Смесь, частично AI/рерайт"], ["ai", "Массовый AI/рерайт/спин"]], "mixed")}
        ${select(id, "links", "Ссылочный профиль", [["clean", "Естественный, разнообразный"], ["mixed", "Есть покупные/PBN-следы"], ["dirty", "Много спама / PBN / резкие всплески"]], "mixed")}
        ${select(id, "verified", "Проверка", [["full", "GSC + аналитика + выписки доходов подтверждены"], ["part", "Часть скринов от продавца"], ["none", "Только слова/скрины"]], "part")}
        ${select(id, "ymyl", "Ниша YMYL (здоровье/финансы/право)", [["no", "Нет"], ["yes", "Да"]], "no")}
        </div></div><div class="out"></div>`;
      bind(el, id, v => {
        const price = num(v.price), profit = num(v.profit), rev = num(v.rev), traffic = num(v.traffic);
        const payback = profit > 0 ? price / profit : Infinity;
        let risk = 0; const flags = [];
        const add = (p, t) => { risk += p; flags.push(t); };
        if (num(v.age) < 12) add(10, "Возраст < 12 месяцев — мало истории");
        if (num(v.topShare) > 40) add(15, "Больше 40% трафика на одной странице — высокая зависимость");
        else if (num(v.topShare) > 25) add(7, "25–40% трафика на одной странице");
        if (v.trend === "down") add(20, "Падающий трафик — выясните причину (апдейт/санкции/устаревание)");
        if (v.trend === "spiky") add(15, "Обвалы после апдейтов — признак слабой устойчивости");
        if (v.src === "one") add(12, "Один источник дохода — риск потери программы/сети");
        if (v.src === "two") add(4, "Мало диверсификации дохода");
        if (v.content === "ai") add(18, "Массовый AI/рерайт-контент — риск scaled content abuse");
        if (v.content === "mixed") add(6, "Смешанный контент — нужен аудит качества");
        if (v.links === "dirty") add(22, "Грязный ссылочный профиль");
        if (v.links === "mixed") add(10, "Следы покупных ссылок — проверьте якоря и доноров");
        if (v.verified === "none") add(25, "Данные не подтверждены — не покупайте без доступа к GSC/аналитике");
        if (v.verified === "part") add(10, "Данные подтверждены частично");
        if (v.ymyl === "yes") add(8, "YMYL — выше требования к E-E-A-T");
        if (profit > 0 && rev > 0 && profit / rev > 0.9) add(6, "Маржа > 90% — проверьте, учтён ли ваш труд/контент-расходы");
        risk = Math.min(100, risk);
        const baseMult = 32 - Math.round(risk / 100 * 16);
        const fair = profit * baseMult;
        const verdict = risk >= 55 ? ["bad", "Высокий риск: без серьёзной скидки и проверки — не берите"] : risk >= 30 ? ["warn", "Средний риск: торгуйтесь, закладывайте резерв на ремонт"] : ["ok", "Приемлемый риск: проверяйте остальное по чек-листу"];
        return `<div class="result"><div class="kpis">
          ${kpi("Окупаемость", payback === Infinity ? "—" : fmt(payback, 1) + " мес.")}
          ${kpi("Мультипликатор", profit ? fmt(price / profit, 1) + "× мес. прибыли" : "—")}
          ${kpi("Доход на 1000 визитов", traffic ? fmt(rev / traffic * 1000, 1) : "—")}
          ${kpi("Скоринг риска", fmt(risk) + " / 100")}
          ${kpi("Ориентир справедливой цены", fair > 0 ? fmt(fair) : "—")}
        </div><p><span class="pill ${verdict[0]}">${verdict[1]}</span></p>
        ${price > fair && fair > 0 ? `<p>Запрашиваемая цена выше ориентира на <b>${fmt((price / fair - 1) * 100)}%</b> — это основание для торга или отказа.</p>` : ""}
        ${flags.length ? `<ul>${flags.map(f => `<li>${esc(f)}</li>`).join("")}</ul>` : "<p>Явных красных флагов по введённым данным нет.</p>"}
        <p class="muted small">Ориентир = прибыль/мес × множитель 16–32 в зависимости от риска. Это эвристика для первичной оценки, а не закон рынка; рыночные мультипликаторы зависят от площадки, ниши и времени.</p></div>`;
      });
    } });

  // 2. Ссылочный бюджет
  tools.push({ id: "links", title: "Калькулятор ссылочного бюджета", desc: "Сколько ссылающихся доменов нужно под запрос и сколько это стоит. Урок 6.2 и 6.5.",
    render(el) {
      const id = "links";
      el.innerHTML = `<div class="grid g2"><div>
        ${textarea(id, "comp", "Ссылающиеся домены (RD) на страницах из ТОП-10 по запросу — через запятую или с новой строки", "112, 85, 64, 60, 41, 38, 30, 22, 18, 9", "Берите RD именно на URL страницы (Ahrefs: Site Explorer → URL → Referring domains), а не на весь домен.")}
        ${select(id, "strategy", "Ваша цель", [["top3", "ТОП-3 (≈ медиана верхней половины)"], ["top10", "ТОП-10 (≈ нижняя половина выдачи)"], ["weak", "Вход в ТОП по слабой выдаче (≈ минимум)"]], "top10")}
        </div><div>
        ${field(id, "have", "Сейчас RD на вашей странице", "number", 4)}
        ${field(id, "price", "Средняя цена одной ссылки", "number", 60)}
        ${field(id, "pace", "Темп: ссылок в месяц (безопасно: 2–8 для нового сайта)", "number", 5)}
        ${field(id, "failrate", "Потери ссылок (не проиндексированы/удалены), %", "number", 15)}
        </div></div><div class="out"></div>`;
      bind(el, id, v => {
        const arr = String(v.comp).split(/[\s,;]+/).map(num).filter(x => x > 0);
        if (!arr.length) return '<p class="muted">Введите числа RD конкурентов.</p>';
        arr.sort((a, b) => b - a);
        const top = arr.slice(0, Math.max(3, Math.ceil(arr.length / 2))), low = arr.slice(Math.ceil(arr.length / 2));
        const target = v.strategy === "top3" ? median(top) : v.strategy === "weak" ? Math.min(...arr) : median(low.length ? low : arr);
        const need = Math.max(0, Math.ceil(target) - num(v.have));
        const gross = Math.ceil(need / (1 - Math.min(0.9, num(v.failrate) / 100)));
        const months = num(v.pace) > 0 ? Math.ceil(gross / num(v.pace)) : Infinity;
        const budget = gross * num(v.price);
        return `<div class="result"><div class="kpis">
          ${kpi("Медиана выдачи (RD)", fmt(median(arr)))}
          ${kpi("Целевое число RD", fmt(Math.ceil(target)))}
          ${kpi("Нужно добавить", fmt(need))}
          ${kpi("С учётом потерь купить", fmt(gross))}
          ${kpi("Срок", months === Infinity ? "—" : fmt(months) + " мес.")}
          ${kpi("Бюджет", fmt(budget))}
        </div>
        <p class="muted small">Это только количественная оценка. Качество и релевантность доноров, возраст страницы, контент и интент весят больше. Если нужно &gt; 40 RD в месяц или бюджет несоразмерен ожидаемому доходу со страницы — выберите менее конкурентный запрос (см. 2.3, 2.6).</p>
        ${months !== Infinity && months > 12 ? '<p><span class="pill warn">Больше года на одну страницу — пересмотрите выбор запроса</span></p>' : ""}</div>`;
      });
    } });

  // 3. Прогноз трафика
  const CTR = [0.28, 0.15, 0.11, 0.08, 0.065, 0.05, 0.04, 0.032, 0.028, 0.024];
  const ctrAt = p => p < 1 ? 0 : p <= 10 ? CTR[Math.round(p) - 1] : p <= 20 ? 0.008 : p <= 30 ? 0.003 : 0.001;
  tools.push({ id: "forecast", title: "Прогноз трафика и дохода", desc: "Клики и доход по позициям (CTR-кривая — ориентир). Урок 2.3 и 8.2.",
    render(el) {
      const id = "forecast";
      el.innerHTML = `<div class="grid g2"><div>
        ${textarea(id, "rows", "Запросы: «запрос; объём в месяц; ожидаемая позиция» — по строке", "best vpn for gaming; 5400; 5\nvpn for netflix; 8100; 8\nvpn router setup; 1300; 3\nfree vpn trial; 2900; 12", "Объём бери из Keyword Planner/Ahrefs; позиция — ваш реалистичный целевой результат.")}
        </div><div>
        ${field(id, "epc", "Доход с одного клика/визита (EPC) или RPM/1000", "number", 0.35)}
        ${select(id, "mode", "Как считать доход", [["epc", "EPC × визиты"], ["rpm", "RPM (за 1000 визитов)"], ["cr", "Конверсия × комиссия"]], "epc")}
        ${field(id, "cr", "Конверсия визита в продажу, % (для режима «Конверсия»)", "number", 1.5)}
        ${field(id, "comm", "Комиссия/прибыль с продажи", "number", 25)}
        ${field(id, "k", "Поправка CTR (0.6 — пессимистично, 1 — по таблице)", "number", 0.8, "AI Overviews, реклама и блоки SERP снижают CTR органики.")}
        </div></div><div class="out"></div>`;
      bind(el, id, v => {
        const rows = String(v.rows).split("\n").map(r => r.split(";").map(s => s.trim())).filter(r => r.length >= 3 && r[0]).map(r => ({ kw: r[0], vol: num(r[1]), pos: num(r[2]) }));
        if (!rows.length) return '<p class="muted">Добавьте строки.</p>';
        const k = num(v.k) || 1; let total = 0;
        const body = rows.map(r => { const c = Math.round(r.vol * ctrAt(r.pos) * k); total += c; return `<tr><td>${esc(r.kw)}</td><td>${fmt(r.vol)}</td><td>${r.pos}</td><td>${(ctrAt(r.pos) * k * 100).toFixed(1)}%</td><td><b>${fmt(c)}</b></td></tr>`; }).join("");
        const rev = v.mode === "epc" ? total * num(v.epc) : v.mode === "rpm" ? total / 1000 * num(v.epc) : total * num(v.cr) / 100 * num(v.comm);
        return `<div class="result"><div class="table-wrap"><table><thead><tr><th>Запрос</th><th>Объём</th><th>Позиция</th><th>CTR</th><th>Клики/мес</th></tr></thead><tbody>${body}</tbody></table></div>
        <div class="kpis">${kpi("Всего кликов в месяц", fmt(total))}${kpi("Доход в месяц", fmt(rev, 2))}${kpi("Доход в год", fmt(rev * 12, 0))}</div>
        <p class="muted small">CTR-кривая: 1-е место ≈ 28%, 3-е ≈ 11%, 10-е ≈ 2.4%, 11–20 ≈ 0.8% (усреднённые ориентиры публичных исследований; в вашей нише может сильно отличаться). Не учитывает сезонность и рост/падение спроса.</p></div>`;
      });
    } });

  // 4. Анкор-план
  tools.push({ id: "anchors", title: "Анкор-план", desc: "Распределение анкоров на N ссылок. Урок 6.1 и 6.5.",
    render(el) {
      const id = "anchors";
      el.innerHTML = `<div class="grid g2"><div>
        ${field(id, "n", "Сколько ссылок планируете", "number", 20)}
        ${select(id, "prof", "Профиль", [["safe", "Осторожный (новый/купленный сайт, YMYL)"], ["std", "Стандартный"], ["comm", "Коммерческий (конкурентная выдача, допускается больше точных)"]], "std")}
        </div><div>
        ${field(id, "brand", "Бренд", "text", "MyBrand")}
        ${field(id, "kw", "Основной ключ", "text", "купить ноутбук")}
        ${field(id, "url", "URL страницы", "text", "https://example.com/noutbuki/")}
        </div></div><div class="out"></div>`;
      const P = {
        safe: [["Брендовые", .38], ["Голый URL", .25], ["Безанкорные/«здесь», «сайт»", .17], ["Тематические/длинные", .15], ["Точное вхождение", .05]],
        std: [["Брендовые", .30], ["Голый URL", .20], ["Безанкорные/«здесь», «сайт»", .15], ["Тематические/длинные", .25], ["Точное вхождение", .10]],
        comm: [["Брендовые", .25], ["Голый URL", .15], ["Безанкорные/«здесь», «сайт»", .13], ["Тематические/длинные", .30], ["Точное вхождение", .17]]
      };
      bind(el, id, v => {
        const n = Math.max(1, Math.round(num(v.n))); const prof = P[v.prof] || P.std;
        let used = 0; const rows = prof.map(([t, s], i) => { const c = i === prof.length - 1 ? n - used : Math.round(n * s); used += c; return [t, Math.max(0, c), s]; });
        const ex = { "Брендовые": `${v.brand}, ${v.brand} — обзор`, "Голый URL": v.url, "Безанкорные/«здесь», «сайт»": "здесь; на этой странице; источник; сайт", "Тематические/длинные": `как выбрать ${v.kw}; гид по теме «${v.kw}»; сравнение моделей`, "Точное вхождение": v.kw };
        return `<div class="result"><div class="table-wrap"><table><thead><tr><th>Тип анкора</th><th>Доля</th><th>Ссылок</th><th>Примеры</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r[0]}</td><td>${Math.round(r[2] * 100)}%</td><td><b>${r[1]}</b></td><td class="small">${esc(ex[r[0]])}</td></tr>`).join("")}</tbody></table></div>
        <p class="muted small">Распределения — ориентиры, а не официальные пороги. Смотрите на профили топ-10 в вашей выдаче и держитесь не выше их доли точных анкоров. Ссылки должны выглядеть как цитаты, а не как таблица.</p></div>`;
      });
    } });

  // 5. Кластеризатор
  const stem = w => { w = w.toLowerCase().replace(/ё/g, "е"); if (/[а-я]/.test(w)) return w.length > 5 ? w.slice(0, -2) : w.length > 3 ? w.slice(0, -1) : w; return w.replace(/(ing|es|s)$/, ""); };
  const STOP = new Set(["и", "в", "на", "с", "по", "для", "the", "a", "an", "of", "to", "in", "for", "how", "что", "как", "или"]);
  tools.push({ id: "cluster", title: "Быстрая кластеризация запросов", desc: "Черновая группировка по общим словам. Настоящая — по пересечению SERP (урок 2.4).",
    render(el) {
      const id = "cluster";
      el.innerHTML = `${textarea(id, "kws", "Список запросов — по одному в строке", "купить ноутбук\nкупить ноутбук недорого\nноутбук для работы\nлучший ноутбук для работы 2025\nкак выбрать ноутбук\nвыбор ноутбука для студента\nноутбук для студента", "")}
        <div class="grid g3">${field(id, "th", "Порог схожести (0.3–0.8)", "number", 0.5)}</div><div class="out"></div>`;
      bind(el, id, v => {
        const kws = [...new Set(String(v.kws).split("\n").map(s => s.trim()).filter(Boolean))];
        const toks = kws.map(k => new Set(k.split(/[^a-zа-яё0-9]+/i).filter(w => w && !STOP.has(w.toLowerCase()) && !/^\d+$/.test(w)).map(stem)));
        const th = num(v.th) || 0.5; const groups = [];
        kws.forEach((k, i) => {
          let best = null, bs = 0;
          groups.forEach(g => { const inter = [...toks[i]].filter(t => g.tokens.has(t)).length; const uni = new Set([...toks[i], ...g.tokens]).size; const s = uni ? inter / uni : 0; if (s > bs) { bs = s; best = g; } });
          if (best && bs >= th) { best.items.push(k); toks[i].forEach(t => best.tokens.add(t)); } else groups.push({ items: [k], tokens: new Set(toks[i]) });
        });
        groups.sort((a, b) => b.items.length - a.items.length);
        return `<div class="result"><p><b>${kws.length}</b> запросов → <b>${groups.length}</b> групп</p>${groups.map(g => `<div class="card"><b>${esc(g.items.slice().sort((a, b) => a.length - b.length)[0])}</b> <span class="pill">${g.items.length}</span><div class="small muted">${g.items.map(esc).join(" · ")}</div></div>`).join("")}
        <p class="muted small">Группировка по словам не знает интент. «Купить ноутбук» и «обзор ноутбуков» могут делить слова, но требовать разных страниц. Проверяйте пары вручную: если в ТОП-10 по запросам ≥3–4 общих URL — они в одном кластере.</p></div>`;
      });
    } });

  // 6. Генератор ТЗ
  tools.push({ id: "brief", title: "Генератор ТЗ на статью", desc: "Каркас брифа для копирайтера по вашим данным. Урок 5.2.",
    render(el) {
      const id = "brief";
      el.innerHTML = `<div class="grid g2"><div>
        ${field(id, "kw", "Главный запрос", "text", "как выбрать ноутбук для программирования")}
        ${textarea(id, "sec", "Дополнительные запросы/подтемы (по строке)", "ноутбук для программирования 2025\nсколько оперативной памяти нужно программисту\nmacbook или windows для разработки")}
        ${select(id, "intent", "Интент", [["info", "Информационный (гайд/как)"], ["comm", "Коммерческий (сравнение/обзор)"], ["trans", "Транзакционный (купить)"], ["nav", "Навигационный"]], "comm")}
        </div><div>
        ${textarea(id, "h2", "H2/H3 страниц из ТОП-10 (вставьте списком)", "Процессор\nОперативная память\nЭкран\nАвтономность\nТоп моделей\nFAQ")}
        ${field(id, "words", "Объём, слов", "number", 2200)}
        ${field(id, "usp", "Чем ваша статья ценнее конкурентов", "text", "тесты в реальных проектах, таблица сравнения, актуальные цены")}
        </div></div><div class="out"></div>`;
      bind(el, id, v => {
        const lines = s => String(s).split("\n").map(x => x.trim()).filter(Boolean);
        const iv = { info: "дать полный и точный ответ, научить сделать", comm: "помочь сравнить варианты и принять решение о выборе", trans: "довести до покупки: цена, наличие, доверие, CTA", nav: "быстро привести к нужному разделу" }[v.intent];
        const md = `# ТЗ: ${v.kw}

**Главный запрос:** ${v.kw}
**Интент:** ${iv}
**Объём:** ~${v.words} слов (ориентир — медиана топа)
**Уникальная ценность:** ${v.usp}

## Дополнительные запросы / подтемы
${lines(v.sec).map(s => "- " + s).join("\n") || "- —"}

## Рекомендуемая структура (на основе ТОП-10)
H1: ${v.kw}
${lines(v.h2).map(s => "H2: " + s).join("\n")}
H2: Выводы / что выбрать (короткий ответ в первом экране)
H2: FAQ (3–5 вопросов из People Also Ask)

## Требования
- Первый абзац: прямой ответ на запрос в 2–3 предложениях
- Автор с экспертизой + дата обновления; источники для фактов
- Таблица/список для сравнения, 1+ оригинальная иллюстрация
- Внутренние ссылки: 3–5 на смежные страницы кластера, анкоры тематические
- Title ≤ 60 символов, Description 140–160 символов, запрос ближе к началу
- Без воды, без копирования конкурентов, без выдуманных фактов`;
        return `<div class="result"><div class="row between"><b>Готовое ТЗ</b><button class="btn sm" id="copyBrief">Копировать</button></div><pre class="code"><code>${esc(md)}</code></pre></div>`;
      });
      el.addEventListener("click", e => { if (e.target.id === "copyBrief") navigator.clipboard.writeText(el.querySelector(".out pre").innerText).then(() => App.toast("Скопировано")); });
    } });

  // 7. Окно торга / ROI покупки ссылки
  tools.push({ id: "linkroi", title: "Окупаемость ссылки/страницы", desc: "Стоит ли вкладываться в страницу: ссылки + контент против дохода. Урок 8.2.",
    render(el) {
      const id = "linkroi";
      el.innerHTML = `<div class="grid g2"><div>
        ${field(id, "vol", "Суммарный объём запросов страницы, в мес.", "number", 6000)}
        ${field(id, "pos", "Целевая позиция", "number", 4)}
        ${field(id, "rpv", "Доход с 1 визита", "number", 0.12)}
        </div><div>
        ${field(id, "content", "Стоимость контента/доработок", "number", 120)}
        ${field(id, "links", "Бюджет на ссылки", "number", 600)}
        ${field(id, "lag", "Месяцев до выхода на позицию", "number", 6)}
        ${field(id, "life", "Месяцев жизни результата (горизонт оценки)", "number", 24)}
        </div></div><div class="out"></div>`;
      bind(el, id, v => {
        const clicks = num(v.vol) * ctrAt(num(v.pos)) * 0.85, mrev = clicks * num(v.rpv);
        const earn = Math.max(0, num(v.life) - num(v.lag)) * mrev, cost = num(v.content) + num(v.links);
        const roi = cost ? (earn - cost) / cost * 100 : 0;
        return `<div class="result"><div class="kpis">${kpi("Визитов/мес", fmt(clicks))}${kpi("Доход/мес", fmt(mrev, 1))}${kpi("Доход за горизонт", fmt(earn))}${kpi("Затраты", fmt(cost))}${kpi("ROI", fmt(roi) + "%")}${kpi("Окупаемость", mrev > 0 ? fmt(num(v.lag) + cost / mrev, 1) + " мес." : "—")}</div>
        <p>${roi > 100 ? '<span class="pill ok">Выглядит выгодно даже с запасом на неудачу</span>' : roi > 0 ? '<span class="pill warn">Положительно, но запас прочности небольшой</span>' : '<span class="pill bad">Не окупается — смените запрос или удешевите</span>'}</p>
        <p class="muted small">Заложите вероятность успеха: если шанс выйти на позицию ~50–60%, делите ожидаемый доход пополам. Сравнивайте страницы между собой — вкладывайтесь в лучшие по ROI.</p></div>`;
      });
    } });

  window.Tools = tools;
})();
