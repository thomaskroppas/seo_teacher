/* ИИ-наставник. Запросы идут на сервер сайта (api/), а не напрямую в OpenAI: ключ и лимиты хранятся на сервере,
   ответ одного ученика никогда не доступен другому. */
(function () {
  const { esc, $, S } = App;
  const Auth = App.Auth, Api = App.Api;
  const MAX_STORED = 40;
  let abort = null, busy = false;

  function context() {
    const m = (location.hash || "").match(/^#\/lesson\/([^/?]+)/);
    const l = m && S.lessonById[m[1]];
    if (!l) return { id: "general", title: "Общие вопросы по курсу", text: "" };
    const mod = S.moduleOfLesson[l.id];
    const tasks = (l.practice && l.practice.tasks || []).map(t => "- " + t.title + ": " + t.steps.join("; ")).join("\n");
    return { id: l.id, title: `Модуль ${mod.num}, урок «${l.title}»`, text: `ТЕОРИЯ УРОКА:\n${l.theory}\n\nПРАКТИЧЕСКИЕ ЗАДАЧИ:\n${tasks}` };
  }

  const fab = document.createElement("button");
  fab.id = "aiFab"; fab.className = "ai-fab"; fab.innerHTML = "💬 Спросить ИИ"; fab.setAttribute("aria-label", "Открыть чат с ИИ-наставником");
  const panel = document.createElement("aside");
  panel.id = "aiPanel"; panel.className = "ai-panel hide"; panel.setAttribute("aria-label", "Чат с ИИ-наставником");
  document.body.append(fab, panel);

  const money = n => "$" + (Number(n) || 0).toFixed(2);
  function usageHTML() {
    const u = Auth.usage; if (!u) return "";
    const pct = u.limit > 0 ? Math.min(100, u.spent / u.limit * 100) : 100;
    return `<div class="ai-usage" title="Лимит обновляется каждые сутки"><div class="row between small"><span>Сегодня потрачено ${money(u.spent)} из ${money(u.limit)}</span><span class="muted">${esc(u.model || "")}</span></div><div class="bar ${pct >= 90 ? "bad" : ""}"><i style="width:${pct}%"></i></div></div>`;
  }
  const bubble = m => `<div class="ai-m ${m.role}">${m.role === "assistant" ? MD.render(m.content) : esc(m.content).replace(/\n/g, "<br>")}</div>`;

  function render() {
    const ctx = context(); const chat = (S.state.chats = S.state.chats || {}); const msgs = chat[ctx.id] || [];
    panel.innerHTML = `<div class="ai-head"><div><b>ИИ-наставник</b><div class="muted small">${esc(ctx.title)}</div></div><div class="row"><button class="btn sm" id="aiClear" title="Очистить диалог">Очистить</button><button class="icon-btn" id="aiClose" aria-label="Закрыть">✕</button></div></div>
      ${usageHTML()}
      <div class="ai-msgs" id="aiMsgs">${msgs.length ? msgs.map(bubble).join("") : `<div class="ai-hint">Задайте вопрос по этому уроку — например: «объясни проще», «приведи пример», «зачем это нужно?».<br><br><button class="btn sm" data-q="Объясни главную мысль урока проще, как для школьника">Объясни проще</button> <button class="btn sm" data-q="Приведи пример из жизни к этому уроку">Дай пример</button> <button class="btn sm" data-q="Какие самые частые ошибки новичков по этой теме?">Частые ошибки</button></div>`}</div>
      <form class="ai-form" id="aiForm"><textarea id="aiInput" rows="2" placeholder="Ваш вопрос…"></textarea><button class="btn primary" id="aiSend">Отправить</button></form>
      <div class="muted small" style="padding:0 14px 10px">ИИ может ошибаться: цены, кнопки и правила сверяйте с официальными источниками. Диалог виден только вам.</div>`;
    const box = $("#aiMsgs", panel); box.scrollTop = box.scrollHeight;
    $("#aiClose", panel).onclick = () => panel.classList.add("hide");
    $("#aiClear", panel).onclick = () => { if (abort) abort.abort(); chat[ctx.id] = []; S.save(); render(); };
    $("#aiForm", panel).onsubmit = e => { e.preventDefault(); send($("#aiInput", panel).value); };
    $("#aiInput", panel).onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e.target.value); } };
    panel.querySelectorAll("[data-q]").forEach(b => b.onclick = () => send(b.dataset.q));
  }

  async function stream(history, ctx, onDelta) {
    abort = new AbortController();
    const r = await fetch("api/index.php?a=chat", { method: "POST", signal: abort.signal, credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Requested-With": "seo-teacher" }, body: JSON.stringify({ messages: history.slice(-12), context: { title: ctx.title, text: ctx.text } }) });
    if (!r.ok) {
      let j = null; try { j = await r.json(); } catch (e) { /* ignore */ }
      if (r.status === 401) { Auth.expired(); throw new Error("Сессия истекла. Войдите снова."); }
      if (j && j.usage) { Auth.usage = j.usage; }
      throw new Error((j && j.message) || "Ошибка сервера (" + r.status + ")");
    }
    const reader = r.body.getReader(), dec = new TextDecoder(); let buf = "", full = "";
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
      for (const ln of lines) {
        const t = ln.trim(); if (!t.startsWith("data:")) continue;
        const d = t.slice(5).trim(); if (!d || d === "[DONE]") continue;
        let j; try { j = JSON.parse(d); } catch (e) { continue; }
        if (j.error) throw new Error(j.error);
        if (j.meta && j.meta.usage) Auth.usage = j.meta.usage;
        const piece = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
        if (piece) { full += piece; onDelta(full); }
      }
    }
    return full;
  }

  async function send(text) {
    text = (text || "").trim(); if (!text || busy) return;
    const ctx = context(); const chat = (S.state.chats = S.state.chats || {}); const msgs = (chat[ctx.id] = chat[ctx.id] || []);
    msgs.push({ role: "user", content: text.slice(0, 4000) }); render();
    const box = $("#aiMsgs", panel); box.insertAdjacentHTML("beforeend", '<div class="ai-m assistant" id="aiLive"><span class="muted">Думаю…</span></div>');
    box.scrollTop = box.scrollHeight; busy = true; $("#aiSend", panel).disabled = true;
    try {
      const out = await stream(msgs, ctx, full => { const el = $("#aiLive", panel); if (el) { el.innerHTML = MD.render(full); box.scrollTop = box.scrollHeight; } });
      msgs.push({ role: "assistant", content: out || "(пустой ответ)" }); S.touch();
    } catch (e) {
      if (e.name !== "AbortError") msgs.push({ role: "assistant", content: "⚠️ " + (e.message || "Не удалось получить ответ") + (/Failed to fetch|NetworkError|Load failed/.test(e.message || "") ? "\nНет связи с сервером. Проверьте интернет." : "") });
    } finally {
      busy = false; if (msgs.length > MAX_STORED) msgs.splice(0, msgs.length - MAX_STORED); S.save();
      Auth.refreshUsage().then(() => { if (!panel.classList.contains("hide")) render(); });
      if (!panel.classList.contains("hide")) render();
    }
  }

  fab.addEventListener("click", () => {
    panel.classList.toggle("hide");
    if (!panel.classList.contains("hide")) { render(); Auth.refreshUsage().then(() => { const h = $(".ai-usage", panel); if (h) h.outerHTML = usageHTML(); }); const i = $("#aiInput", panel); if (i && window.innerWidth > 700) i.focus(); }
  });
  window.addEventListener("hashchange", () => { if (!panel.classList.contains("hide") && !busy) render(); });
  document.addEventListener("usage-updated", () => { const h = $(".ai-usage", panel); if (h) h.outerHTML = usageHTML(); });
  App.AI = { render };
})();
