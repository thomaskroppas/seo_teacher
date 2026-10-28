/* Вход, роли и синхронизация прогресса с сервером. Режимы:
   server — есть бэкенд (api/): нужен вход, прогресс синхронизируется между устройствами;
   local  — бэкенда нет (открыто как файл или статический хостинг): всё работает локально без входа и без ИИ-чата. */
(function () {
  const { esc, $, S } = App;
  const BASE = "api/index.php";
  const USER_KEY = "seo-teacher-user";
  const Auth = { mode: "local", user: null, usage: null };
  App.Auth = Auth;

  // ---------- API
  const Api = {
    async call(a, { method = "GET", body } = {}) {
      const headers = { "X-Requested-With": "seo-teacher" };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const r = await fetch(`${BASE}?a=${a}`, { method, headers, credentials: "same-origin", cache: "no-store", body: body !== undefined ? JSON.stringify(body) : undefined });
      let data = null; try { data = await r.json(); } catch (e) { /* не JSON */ }
      return { status: r.status, ok: r.ok, data, json: data !== null };
    },
    raw(a, body) {
      return fetch(`${BASE}?a=${a}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Requested-With": "seo-teacher" }, body: JSON.stringify(body) });
    }
  };
  App.Api = Api;

  const cachedUser = () => { try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch (e) { return null; } };
  const cacheUser = u => { try { u ? localStorage.setItem(USER_KEY, JSON.stringify(u)) : localStorage.removeItem(USER_KEY); } catch (e) { /* ignore */ } };

  // ---------- Синхронизация
  const Sync = {
    rev: 0, dirty: false, ver: 0, timer: null, pushing: false, lastPull: 0, offline: false,
    key() { return "seo-teacher-sync:" + S.namespace(); },
    loadMeta() { try { const m = JSON.parse(localStorage.getItem(this.key()) || "{}"); this.rev = m.rev || 0; this.dirty = !!m.dirty; } catch (e) { this.rev = 0; this.dirty = false; } },
    saveMeta() { try { localStorage.setItem(this.key(), JSON.stringify({ rev: this.rev, dirty: this.dirty })); } catch (e) { /* ignore */ } },
    markDirty() { this.dirty = true; this.ver++; this.saveMeta(); this.schedule(2500); },
    schedule(ms) { clearTimeout(this.timer); this.timer = setTimeout(() => this.push(), ms); },
    async init() {
      this.loadMeta();
      S.hooks.onSave = () => Sync.markDirty();
      await this.pull(true);
    },
    async pull(initial) {
      let r;
      try { r = await Api.call("state_get"); } catch (e) { this.offline = true; return false; }
      this.offline = false;
      if (r.status === 401) { Auth.expired(); return false; }
      if (!r.ok || !r.json) return false;
      this.lastPull = Date.now();
      const remote = r.data.state && Object.keys(r.data.state).length ? r.data.state : null;
      if (!remote) { if (S.hasProgress()) { this.dirty = true; this.saveMeta(); await this.push(); } this.rev = r.data.rev; this.saveMeta(); return true; }
      if (r.data.rev > this.rev || initial) {
        const changedElsewhere = r.data.rev > this.rev;
        if (this.dirty) { S.replaceState(S.mergeStates(S.state, remote)); this.rev = r.data.rev; this.saveMeta(); this.schedule(300); }
        else { S.replaceState(remote); this.rev = r.data.rev; this.saveMeta(); if (changedElsewhere && !initial) App.toast("Прогресс обновлён с другого устройства"); }
      }
      return true;
    },
    async push() {
      if (this.pushing || !this.dirty) return;
      this.pushing = true; const ver = this.ver;
      try {
        const r = await Api.call("state_put", { method: "POST", body: { baseRev: this.rev, state: S.state } });
        if (r.status === 401) return Auth.expired();
        if (r.ok) { this.rev = r.data.rev; if (ver === this.ver) this.dirty = false; else this.schedule(500); this.saveMeta(); this.offline = false; }
        else if (r.status === 409 && r.json) { S.replaceState(S.mergeStates(S.state, r.data.state)); this.rev = r.data.rev; this.dirty = true; this.saveMeta(); this.schedule(200); }
        else if (r.status === 413) App.toast("Прогресс слишком большой для сохранения на сервере");
        else this.schedule(20000);
      } catch (e) { this.offline = true; this.schedule(20000); }
      finally { this.pushing = false; }
    },
    async flush() { clearTimeout(this.timer); if (this.dirty) await this.push(); }
  };
  Auth.Sync = Sync;
  document.addEventListener("visibilitychange", () => {
    if (Auth.mode !== "server" || !Auth.user) return;
    if (document.visibilityState === "hidden") Sync.flush();
    else if (Date.now() - Sync.lastPull > 20000) Sync.pull(false);
  });
  window.addEventListener("online", () => { if (Auth.user) { Sync.flush(); Sync.pull(false); } });

  // ---------- Экраны входа
  function lockUI(on) { document.body.classList.toggle("locked", on); document.body.classList.toggle("local-mode", Auth.mode === "local"); }
  function authShell(inner) {
    lockUI(true);
    $("#app").innerHTML = `<div class="auth-wrap"><div class="card auth-card"><div class="center"><span class="logo big">↗</span><h1 style="margin:.3em 0 0">SEO-обучатель</h1><p class="muted">Личный курс по SEO для начинающих</p></div>${inner}</div></div>`;
  }
  function showLogin(msg) {
    authShell(`<form id="lf"><div class="field"><label for="lu">Логин</label><input id="lu" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" required></div>
      <div class="field"><label for="lp">Пароль</label><input id="lp" type="password" autocomplete="current-password" required></div>
      <div id="lerr" class="small" style="color:var(--bad);min-height:1.4em">${esc(msg || "")}</div>
      <button class="btn primary" style="width:100%;justify-content:center" id="lb">Войти</button>
      <p class="muted small center mt">Аккаунты создаёт администратор. Нет доступа — напишите ему.</p></form>`);
    $("#lf").onsubmit = async e => {
      e.preventDefault(); $("#lb").disabled = true; $("#lerr").textContent = "";
      try {
        const r = await Api.call("login", { method: "POST", body: { username: $("#lu").value.trim(), password: $("#lp").value } });
        if (r.ok) { const me = await Api.call("me"); await enter(me.data); } else { $("#lerr").textContent = (r.data && r.data.message) || "Не удалось войти"; $("#lb").disabled = false; }
      } catch (err) { $("#lerr").textContent = "Нет связи с сервером. Проверьте интернет."; $("#lb").disabled = false; }
    };
  }
  function showSetup() {
    authShell(`<form id="sf"><p>Это первый запуск. Создайте <b>учётную запись администратора</b>.</p>
      <div class="field"><label for="sk">Ключ установки (setup_key из api/config.php)</label><input id="sk" type="password" autocomplete="off" required></div>
      <div class="field"><label for="su">Логин (латиница, 3–32 символа)</label><input id="su" type="text" autocomplete="username" autocapitalize="none" required></div>
      <div class="field"><label for="sd">Имя (как показывать)</label><input id="sd" type="text"></div>
      <div class="field"><label for="sp">Пароль (от 8 символов)</label><input id="sp" type="password" autocomplete="new-password" required minlength="8"></div>
      <div id="serr" class="small" style="color:var(--bad);min-height:1.4em"></div><button class="btn primary" style="width:100%;justify-content:center" id="sb">Создать администратора</button></form>`);
    $("#sf").onsubmit = async e => {
      e.preventDefault(); $("#sb").disabled = true;
      const r = await Api.call("setup", { method: "POST", body: { setupKey: $("#sk").value, username: $("#su").value.trim(), displayName: $("#sd").value.trim(), password: $("#sp").value } });
      if (r.ok) { const me = await Api.call("me"); await enter(me.data); } else { $("#serr").textContent = (r.data && r.data.message) || "Ошибка"; $("#sb").disabled = false; }
    };
  }
  function showError(text) {
    authShell(`<p>${esc(text)}</p><button class="btn primary" id="retry" style="width:100%;justify-content:center">Повторить</button>`);
    $("#retry").onclick = start;
  }

  // ---------- Вход / выход
  async function enter(data) {
    Auth.mode = "server"; Auth.user = data.user; Auth.usage = data.usage; cacheUser(data.user);
    const legacyKey = "seo-teacher-v1";
    S.load("u" + data.user.id);
    await Sync.init();
    // прогресс, накопленный до введения аккаунтов в этом браузере
    try {
      const legacy = localStorage.getItem(legacyKey);
      if (legacy && !S.hasProgress() && !localStorage.getItem(legacyKey + ":adopted")) {
        const st = JSON.parse(legacy);
        if (S.hasProgress(st) && confirm("На этом устройстве найден прогресс без аккаунта. Перенести его в ваш аккаунт «" + data.user.username + "»?")) { S.replaceState(st, false); Sync.markDirty(); }
        localStorage.setItem(legacyKey + ":adopted", "1");
      }
    } catch (e) { /* ignore */ }
    lockUI(false);
    applyTheme();
    if (!location.hash || location.hash === "#/login") location.hash = "#/";
    App.render();
  }
  function applyTheme() { const t = S.state.theme; if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t); }

  Auth.expired = function () { Auth.user = null; cacheUser(null); showLogin("Сессия истекла. Войдите снова."); };
  Auth.logout = async function () {
    await Sync.flush();
    try { await Api.call("logout", { method: "POST", body: {} }); } catch (e) { /* ignore */ }
    if (!Sync.dirty) { try { localStorage.removeItem("seo-teacher-v1:" + S.namespace()); localStorage.removeItem(Sync.key()); } catch (e) { /* ignore */ } }
    S.hooks.onSave = null; Auth.user = null; Auth.usage = null; cacheUser(null); S.load("local"); history.replaceState(null, "", location.pathname);
    showLogin();
  };
  Auth.refreshUsage = async function () { try { const r = await Api.call("me"); if (r.ok) { Auth.usage = r.data.usage; document.dispatchEvent(new Event("usage-updated")); } } catch (e) { /* ignore */ } };
  Auth.isAdmin = () => !!(Auth.user && Auth.user.role === "admin");

  // ---------- Запуск
  async function start() {
    document.body.classList.remove("booting");
    if (location.protocol === "file:") { Auth.mode = "local"; lockUI(false); return App.render(); }
    let r;
    try { r = await Api.call("me"); }
    catch (e) {
      const u = cachedUser();
      if (u) { Auth.mode = "server"; Auth.user = u; S.load("u" + u.id); Sync.loadMeta(); S.hooks.onSave = () => Sync.markDirty(); Sync.offline = true; lockUI(false); return App.render(); }
      return showError("Нет связи с сервером. Проверьте интернет и повторите.");
    }
    if (!r.json) { Auth.mode = "local"; lockUI(false); return App.render(); }          // нет бэкенда — локальный режим
    if (r.ok) return enter(r.data);
    if (r.status === 401) {
      try { const s = await Api.call("setup_status"); if (s.ok && s.data.needsSetup) return showSetup(); } catch (e) { /* ignore */ }
      return showLogin();
    }
    showError((r.data && r.data.message) || "Сервер вернул ошибку (" + r.status + ")");
  }
  Auth.start = start;
})();
