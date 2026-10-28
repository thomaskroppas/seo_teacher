/* ИИ-помощник: вопросы по уроку через OpenAI API. Ключ хранится только в localStorage этого браузера
   (отдельный ключ, не попадает в экспорт прогресса) и уходит только на api.openai.com. */
(function () {
  const { esc, $, S } = App;
  const CFG_KEY = "seo-teacher-ai";
  const API = "https://api.openai.com/v1/chat/completions";
  const MAX_HISTORY = 12, MAX_STORED = 40;
  let abort = null, busy = false;

  const cfg = {
    get() { try { return Object.assign({ key: "", model: "gpt-4o-mini" }, JSON.parse(localStorage.getItem(CFG_KEY) || "{}")); } catch (e) { return { key: "", model: "gpt-4o-mini" }; } },
    set(o) { try { localStorage.setItem(CFG_KEY, JSON.stringify(Object.assign(cfg.get(), o))); return true; } catch (e) { return false; } },
    clear() { try { localStorage.removeItem(CFG_KEY); } catch (e) { /* ignore */ } }
  };

  function context() {
    const m = (location.hash || "").match(/^#\/lesson\/([^/?]+)/);
    const l = m && S.lessonById[m[1]];
    if (!l) return { id: "general", title: "Общие вопросы по курсу", text: "" };
    const mod = S.moduleOfLesson[l.id];
    const tasks = (l.practice && l.practice.tasks || []).map(t => "- " + t.title + ": " + t.steps.join("; ")).join("\n");
    return { id: l.id, title: `Модуль ${mod.num}, урок «${l.title}»`, text: `ТЕОРИЯ УРОКА:\n${l.theory}\n\nПРАКТИЧЕСКИЕ ЗАДАЧИ:\n${tasks}` };
  }

  function systemPrompt(ctx) {
    return `Ты — доброжелательный наставник в учебном курсе по SEO для абсолютных новичков (человек уверенно пользуется интернетом, но никогда не работал с сайтами и SEO). Отвечай по-русски, простым языком, коротко и по делу (обычно до 150–250 слов), с аналогиями из игр и соцсетей, когда это помогает. Новые термины объясняй сразу. Если нужны шаги — давай нумерованный список с названиями кнопок. 
Правила: опирайся на материал урока и общие проверенные знания о SEO. Не выдумывай цены, цифры, названия кнопок и правила: если не уверен или это может меняться — так и скажи и посоветуй проверить в официальной справке (Google Search Central, Яндекс Вебмастер, сайт регистратора/хостинга). Не обещай гарантированных результатов («ТОП-1», быстрые деньги) и не советуй спам, накрутки и обман поисковиков. Юридические и налоговые вопросы — только общие принципы и совет обратиться к специалисту. Если вопрос не про сайты, SEO, заработок на сайтах или обучение — вежливо верни разговор к теме курса.
Текущий контекст: ${ctx.title}.
${ctx.text}`;
  }

  async function ask(history, ctx, onDelta) {
    const c = cfg.get();
    abort = new AbortController();
    const body = { model: c.model, stream: true, messages: [{ role: "system", content: systemPrompt(ctx) }].concat(history.slice(-MAX_HISTORY)) };
    const r = await fetch(API, { method: "POST", signal: abort.signal, headers: { "Content-Type": "application/json", Authorization: "Bearer " + c.key }, body: JSON.stringify(body) });
    if (!r.ok) {
      let msg = "";
      try { msg = (await r.json()).error.message; } catch (e) { /* ignore */ }
      const hint = r.status === 401 ? "Ключ не принят. Проверьте его в настройках (⚙)." : r.status === 429 ? "Лимит или баланс исчерпан, либо слишком частые запросы. Проверьте баланс в кабинете OpenAI." : r.status === 404 ? "Модель не найдена или недоступна для вашего ключа. Смените модель в настройках (⚙)." : "Ошибка API (" + r.status + ").";
      throw new Error(hint + (msg ? "\n" + msg : ""));
    }
    const reader = r.body.getReader(), dec = new TextDecoder(); let buf = "", full = "";
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
      for (const ln of lines) {
        const t = ln.trim(); if (!t.startsWith("data:")) continue;
        const d = t.slice(5).trim(); if (d === "[DONE]") continue;
        try { const j = JSON.parse(d); const piece = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content; if (piece) { full += piece; onDelta(full); } } catch (e) { /* неполный чанк */ }
      }
    }
    return full;
  }

  // ---------- Панель
  const fab = document.createElement("button");
  fab.id = "aiFab"; fab.className = "ai-fab"; fab.innerHTML = "💬 Спросить ИИ"; fab.setAttribute("aria-label", "Открыть чат с ИИ-наставником");
  const panel = document.createElement("aside");
  panel.id = "aiPanel"; panel.className = "ai-panel hide"; panel.setAttribute("aria-label", "Чат с ИИ-наставником");
  document.body.append(fab, panel);

  function render() {
    const ctx = context(); const chat = (S.state.chats = S.state.chats || {}); const msgs = chat[ctx.id] || [];
    const has = !!cfg.get().key;
    panel.innerHTML = `<div class="ai-head"><div><b>ИИ-наставник</b><div class="muted small">${esc(ctx.title)}</div></div><div class="row"><button class="btn sm" id="aiClear" title="Очистить диалог">Очистить</button><button class="icon-btn" id="aiClose" aria-label="Закрыть">✕</button></div></div>
      <div class="ai-msgs" id="aiMsgs">${has ? (msgs.length ? msgs.map(bubble).join("") : `<div class="ai-hint">Задайте вопрос по этому уроку — например: «объясни проще», «приведи пример», «зачем это нужно?».<br><br><button class="btn sm" data-q="Объясни главную мысль урока проще, как для школьника">Объясни проще</button> <button class="btn sm" data-q="Приведи пример из жизни к этому уроку">Дай пример</button> <button class="btn sm" data-q="Какие самые частые ошибки новичков по этой теме?">Частые ошибки</button></div>`) : `<div class="ai-hint"><b>Нужен ключ OpenAI API.</b><br>Откройте <a href="#/settings">⚙ Настройки</a> и вставьте свой ключ. Он хранится только в вашем браузере.</div>`}</div>
      <form class="ai-form" id="aiForm"><textarea id="aiInput" rows="2" placeholder="${has ? "Ваш вопрос…" : "Сначала добавьте ключ в настройках"}" ${has ? "" : "disabled"}></textarea><button class="btn primary" id="aiSend" ${has ? "" : "disabled"}>Отправить</button></form>
      <div class="muted small" style="padding:0 14px 10px">ИИ может ошибаться: цены, кнопки и правила сверяйте с официальными источниками.</div>`;
    const box = $("#aiMsgs", panel); box.scrollTop = box.scrollHeight;
    $("#aiClose", panel).onclick = () => panel.classList.add("hide");
    $("#aiClear", panel).onclick = () => { if (abort) abort.abort(); chat[ctx.id] = []; S.save(); render(); };
    $("#aiForm", panel).onsubmit = e => { e.preventDefault(); send($("#aiInput", panel).value); };
    $("#aiInput", panel).onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e.target.value); } };
    panel.querySelectorAll("[data-q]").forEach(b => b.onclick = () => send(b.dataset.q));
  }
  const bubble = m => `<div class="ai-m ${m.role}">${m.role === "assistant" ? MD.render(m.content) : esc(m.content).replace(/\n/g, "<br>")}</div>`;

  async function send(text) {
    text = (text || "").trim(); if (!text || busy) return;
    const ctx = context(); const chat = (S.state.chats = S.state.chats || {}); const msgs = (chat[ctx.id] = chat[ctx.id] || []);
    msgs.push({ role: "user", content: text }); render();
    const box = $("#aiMsgs", panel); box.insertAdjacentHTML("beforeend", '<div class="ai-m assistant" id="aiLive"><span class="muted">Думаю…</span></div>');
    box.scrollTop = box.scrollHeight; busy = true; $("#aiSend", panel).disabled = true;
    try {
      const out = await ask(msgs, ctx, full => { const el = $("#aiLive", panel); if (el) { el.innerHTML = MD.render(full); box.scrollTop = box.scrollHeight; } });
      msgs.push({ role: "assistant", content: out || "(пустой ответ)" }); S.touch();
    } catch (e) {
      if (e.name !== "AbortError") msgs.push({ role: "assistant", content: "⚠️ " + (e.message || "Не удалось получить ответ") + (/Failed to fetch|NetworkError/.test(e.message || "") ? "\nНет связи с api.openai.com: проверьте интернет, VPN/блокировки или расширения браузера." : "") });
    } finally {
      busy = false; if (msgs.length > MAX_STORED) msgs.splice(0, msgs.length - MAX_STORED); S.save(); if (!panel.classList.contains("hide")) render();
    }
  }

  fab.addEventListener("click", () => { panel.classList.toggle("hide"); if (!panel.classList.contains("hide")) { render(); const i = $("#aiInput", panel); if (i && !i.disabled) i.focus(); } });
  window.addEventListener("hashchange", () => { if (!panel.classList.contains("hide")) render(); });
  App.AI = { cfg, render, ask };

  // ---------- Блок в настройках
  App.aiSettingsHTML = function () {
    const c = cfg.get();
    return `<div class="card"><h3 style="margin-top:0">💬 ИИ-наставник (OpenAI API)</h3>
      <p class="muted">Задавайте вопросы по любому уроку. Запросы идут <b>напрямую из вашего браузера в OpenAI</b>, текст текущего урока передаётся как контекст. Оплата — с вашего OpenAI-аккаунта.</p>
      <div class="field"><label for="aiKey">API-ключ OpenAI</label><input id="aiKey" type="password" autocomplete="off" placeholder="sk-…" value="${esc(c.key)}"></div>
      <div class="field"><label for="aiModel">Модель</label><input id="aiModel" type="text" value="${esc(c.model)}" list="aiModels"><datalist id="aiModels"><option value="gpt-4o-mini"><option value="gpt-4o"><option value="gpt-4.1-mini"><option value="gpt-4.1"></datalist><span class="muted small">Недорогая «mini»-модель обычно достаточна. Название можно заменить на любую доступную вашему ключу.</span></div>
      <div class="row"><button class="btn primary" id="aiSave">Сохранить</button><button class="btn" id="aiTest">Проверить ключ</button><button class="btn danger" id="aiDel">Удалить ключ</button></div><div id="aiStatus" class="small mt"></div>
      <div class="callout warn" style="margin-top:14px"><p><b>Безопасность ключа.</b> Ключ лежит в памяти браузера на этом устройстве и отправляется только на api.openai.com. Не вводите его на чужих компьютерах. Если разместите курс на GitHub Pages — ключ <b>не вшивайте в код и не коммитьте</b>. Лучше создать отдельный ключ именно для этого сайта и поставить лимит трат в кабинете OpenAI (Billing → Limits). При подозрении на утечку удалите ключ там же.</p></div></div>`;
  };
  App.aiSettingsBind = function (root) {
    const st = m => { $("#aiStatus", root).innerHTML = m; };
    $("#aiSave", root).onclick = () => { cfg.set({ key: $("#aiKey", root).value.trim(), model: $("#aiModel", root).value.trim() || "gpt-4o-mini" }) ? st("✅ Сохранено") : st("⚠️ Браузер не дал сохранить данные (приватный режим?)"); };
    $("#aiDel", root).onclick = () => { cfg.clear(); $("#aiKey", root).value = ""; st("Ключ удалён из этого браузера"); };
    $("#aiTest", root).onclick = async () => {
      cfg.set({ key: $("#aiKey", root).value.trim(), model: $("#aiModel", root).value.trim() || "gpt-4o-mini" }); st("Проверяю…");
      try { const out = await ask([{ role: "user", content: "Ответь одним словом: работает" }], { id: "t", title: "тест", text: "" }, () => {}); st("✅ Подключение работает. Ответ: " + esc(out.slice(0, 60))); }
      catch (e) { st("⚠️ " + esc(e.message).replace(/\n/g, "<br>")); }
    };
  };
})();
