/* Панель администратора: ученики, лимиты, модель и цены ИИ. */
(function () {
  const { esc, $, $$, S } = App;
  const Auth = App.Auth, Api = App.Api;
  const money = n => "$" + (Number(n) || 0).toFixed(2);
  const dt = ts => ts ? new Date(ts * 1000).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "—";
  const PRESETS = { sol: { label: "Sol (дороже, умнее)", model: "gpt-6-sol", price_in: 2, price_out: 10 }, luna: { label: "Luna (дёшево)", model: "gpt-6-luna", price_in: 0.1, price_out: 0.5 } };

  App.routes.admin = async function (el, [tab]) {
    if (!Auth.isAdmin()) { el.innerHTML = '<div class="card"><h2>Нет доступа</h2><p>Этот раздел только для администратора.</p></div>'; return; }
    tab = tab || "users"; App.title = "Админ";
    el.innerHTML = `<h1>Администрирование</h1><nav class="tabs">${[["users", "👥 Ученики"], ["ai", "🤖 ИИ и лимиты"], ["usage", "📈 Расходы"]].map(([k, t]) => `<a href="#/admin/${k}" class="${tab === k ? "active" : ""}">${t}</a>`).join("")}</nav><div id="adm"><p class="muted">Загрузка…</p></div>`;
    let ov;
    try { const r = await Api.call("admin_overview"); if (!r.ok) throw new Error((r.data && r.data.message) || r.status); ov = r.data; }
    catch (e) { $("#adm", el).innerHTML = `<div class="card"><b>Не удалось загрузить:</b> ${esc(e.message)}</div>`; return; }
    const box = $("#adm", el);
    const reload = () => App.render();
    const post = async (a, body, okMsg) => { const r = await Api.call(a, { method: "POST", body }); if (r.ok) { if (okMsg) App.toast(okMsg); reload(); } else alert((r.data && r.data.message) || "Ошибка"); return r; };

    if (tab === "users") {
      box.innerHTML = `<div class="card"><h3 style="margin-top:0">Создать ученика</h3><div class="grid g4"><div class="field"><label>Логин</label><input id="nu" type="text" autocapitalize="none" placeholder="anna"></div><div class="field"><label>Имя</label><input id="nd" type="text" placeholder="Анна"></div><div class="field"><label>Пароль (от 8 символов)</label><input id="np" type="text" autocomplete="off"></div><div class="field"><label>Лимит $/сутки (пусто = по умолчанию ${money(ov.settings.daily_limit_default)})</label><input id="nl" type="number" step="0.1" min="0"></div></div>
        <div class="row"><select id="nr" style="width:auto"><option value="student">Ученик</option><option value="admin">Администратор</option></select><button class="btn primary" id="nadd">Создать</button><button class="btn" id="ngen">Сгенерировать пароль</button></div><p class="muted small">Передайте ученику логин и пароль лично. Он сможет сменить пароль в «⚙ Настройки».</p></div>
        <div class="table-wrap mt"><table><thead><tr><th>Логин / имя</th><th>Роль</th><th>Сегодня</th><th>Лимит $/сутки</th><th>Месяц</th><th>Вход</th><th></th></tr></thead><tbody>${ov.users.map(u => `<tr data-id="${u.id}" class="${u.active ? "" : "off"}">
          <td><b>${esc(u.username)}</b><div class="muted small">${esc(u.displayName || "")}${u.active ? "" : " · <span class='pill bad'>отключён</span>"}</div></td>
          <td>${u.role === "admin" ? '<span class="pill pri">админ</span>' : "ученик"}</td>
          <td>${money(u.spentToday)} <span class="muted small">(${u.requestsToday} запр.)</span></td>
          <td><input data-lim type="number" step="0.1" min="0" style="width:90px" value="${u.dailyLimit === null ? "" : u.dailyLimit}" placeholder="${ov.settings.daily_limit_default}"> <button class="btn sm" data-savelim>OK</button></td>
          <td>${money(u.spentMonth)}</td><td class="small">${dt(u.lastLogin)}</td>
          <td class="small"><button class="btn sm" data-pw>Пароль</button> <button class="btn sm" data-toggle>${u.active ? "Отключить" : "Включить"}</button> <button class="btn sm danger" data-del>Удалить</button></td></tr>`).join("")}</tbody></table></div>`;
      const gen = () => { const a = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let p = ""; const r = crypto.getRandomValues(new Uint32Array(12)); r.forEach(x => { p += a[x % a.length]; }); return p; };
      $("#ngen", box).onclick = () => { $("#np", box).value = gen(); };
      $("#nadd", box).onclick = () => post("admin_user_create", { username: $("#nu", box).value.trim(), displayName: $("#nd", box).value.trim(), password: $("#np", box).value, role: $("#nr", box).value, dailyLimit: $("#nl", box).value === "" ? null : $("#nl", box).value }, "Пользователь создан");
      $$("tr[data-id]", box).forEach(tr => {
        const id = +tr.dataset.id, u = ov.users.find(x => x.id === id);
        $("[data-savelim]", tr).onclick = () => post("admin_user_update", { id, dailyLimit: $("[data-lim]", tr).value === "" ? null : $("[data-lim]", tr).value }, "Лимит сохранён");
        $("[data-pw]", tr).onclick = () => { const p = prompt("Новый пароль для «" + u.username + "» (от 8 символов):", gen()); if (p) post("admin_user_update", { id, password: p }, "Пароль изменён"); };
        $("[data-toggle]", tr).onclick = () => post("admin_user_update", { id, active: !u.active }, u.active ? "Отключён" : "Включён");
        $("[data-del]", tr).onclick = () => { if (confirm("Удалить «" + u.username + "» вместе с его прогрессом и историей расходов?")) post("admin_user_delete", { id }, "Удалён"); };
      });
    } else if (tab === "ai") {
      const s = ov.settings;
      box.innerHTML = `<div class="card"><h3 style="margin-top:0">Модель и цены</h3>
        <div class="row">${Object.entries(PRESETS).map(([k, p]) => `<button class="btn sm" data-preset="${k}">${esc(p.label)}</button>`).join("")}</div>
        <div class="grid g3 mt"><div class="field"><label>Модель (идентификатор в API)</label><input id="sm" type="text" value="${esc(s.model)}"></div>
        <div class="field"><label>Цена входа, $ за 1 млн токенов</label><input id="si" type="number" step="0.01" min="0" value="${esc(s.price_in)}"></div>
        <div class="field"><label>Цена выхода, $ за 1 млн токенов</label><input id="so" type="number" step="0.01" min="0" value="${esc(s.price_out)}"></div></div>
        <p class="muted small">Цены используются для подсчёта расходов и лимитов. Сверьте их на <a href="https://openai.com/api/pricing/" target="_blank" rel="noopener noreferrer">openai.com/api/pricing</a>: если цены в настройках занижены, лимит $1 «растянется». Пресеты — ориентиры на момент создания приложения.</p></div>
        <div class="card"><h3 style="margin-top:0">Лимиты</h3><div class="grid g3"><div class="field"><label>Лимит ученика по умолчанию, $/сутки</label><input id="sd" type="number" step="0.1" min="0" value="${esc(s.daily_limit_default)}"></div>
        <div class="field"><label>Общий лимит для всех, $/сутки (0 = выкл.)</label><input id="sg" type="number" step="0.5" min="0" value="${esc(s.global_daily_limit)}"></div>
        <div class="field"><label>Макс. длина ответа, токенов</label><input id="st" type="number" step="100" min="100" max="8000" value="${esc(s.max_output_tokens)}"></div></div>
        <p class="muted small">Сутки считаются по часовому поясу ${esc(ov.timezone)}. Сегодня потрачено всеми: <b>${money(ov.globalSpentToday)}</b>. Лимит ученика можно повысить индивидуально во вкладке «Ученики». Повышать его может только администратор.</p></div>
        <details class="card"><summary><b>Дополнительно</b></summary><div class="grid g2 mt"><div class="field"><label>Параметр длины ответа</label><select id="sp"><option value="max_completion_tokens" ${s.token_param === "max_completion_tokens" ? "selected" : ""}>max_completion_tokens (новые модели)</option><option value="max_tokens" ${s.token_param === "max_tokens" ? "selected" : ""}>max_tokens (старые/совместимые)</option></select></div>
        <div class="field"><label>Усилие рассуждения (reasoning_effort)</label><select id="sr">${["", "none", "minimal", "low", "medium", "high"].map(v => `<option value="${v}" ${s.reasoning_effort === v ? "selected" : ""}>${v || "не передавать"}</option>`).join("")}</select></div></div>
        <div class="field"><label>Дополнительные указания ИИ (добавляются к системной инструкции)</label><textarea id="sx">${esc(s.extra_instructions)}</textarea></div></details>
        <div class="row mt"><button class="btn primary" id="ssave">Сохранить</button><button class="btn" id="sdiag">Проверить подключение к ИИ</button></div><pre class="code hide" id="diag"></pre>`;
      $$("[data-preset]", box).forEach(b => b.onclick = () => { const p = PRESETS[b.dataset.preset]; $("#sm", box).value = p.model; $("#si", box).value = p.price_in; $("#so", box).value = p.price_out; });
      $("#ssave", box).onclick = () => post("admin_settings_set", { model: $("#sm", box).value, price_in: $("#si", box).value, price_out: $("#so", box).value, daily_limit_default: $("#sd", box).value, global_daily_limit: $("#sg", box).value, max_output_tokens: $("#st", box).value, token_param: $("#sp", box).value, reasoning_effort: $("#sr", box).value, extra_instructions: $("#sx", box).value }, "Настройки сохранены");
      $("#sdiag", box).onclick = async () => { const d = $("#diag", box); d.classList.remove("hide"); d.textContent = "Проверяю…"; const r = await Api.call("diag"); d.textContent = JSON.stringify(r.data, null, 2); };
    } else {
      box.innerHTML = `<div class="kpis"><div class="kpi"><span>Сегодня потрачено (все)</span><b>${money(ov.globalSpentToday)}</b></div><div class="kpi"><span>Общий лимит</span><b>${Number(ov.settings.global_daily_limit) ? money(ov.settings.global_daily_limit) : "нет"}</b></div><div class="kpi"><span>Модель</span><b class="small">${esc(ov.settings.model)}</b></div></div>
        <div class="table-wrap"><table><thead><tr><th>Дата</th><th>Расход</th><th>Запросов</th></tr></thead><tbody>${ov.days.map(d => `<tr><td>${esc(d.day)}</td><td>${money(d.cost)}</td><td>${d.requests}</td></tr>`).join("") || '<tr><td colspan="3" class="muted">Пока нет запросов к ИИ</td></tr>'}</tbody></table></div>
        <div class="table-wrap"><table><thead><tr><th>Ученик</th><th>Сегодня</th><th>Месяц</th></tr></thead><tbody>${ov.users.map(u => `<tr><td>${esc(u.username)}</td><td>${money(u.spentToday)}</td><td>${money(u.spentMonth)}</td></tr>`).join("")}</tbody></table></div>
        <p class="muted small">Расходы считаются по фактическому usage из ответа API и ценам из настроек. Баланс и точные счета смотрите в кабинете OpenAI.</p>`;
    }
  };
})();
