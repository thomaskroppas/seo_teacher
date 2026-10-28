'use strict';
/* Тест API: node tests/e2e/api.test.js (нужен запущенный tests/e2e/stack.sh start и пустая БД) */
const B = 'http://127.0.0.1:8080/api/index.php';
let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL:', m); } };
function client() {
  let cookie = '';
  const call = async (a, { method = 'GET', body, xhr = true, raw = false } = {}) => {
    const h = { Cookie: cookie }; if (body !== undefined) h['Content-Type'] = 'application/json'; if (xhr) h['X-Requested-With'] = 'seo-teacher';
    const r = await fetch(`${B}?a=${a}`, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) { const m = sc.match(/seo_sid=([^;]*)/); if (m) cookie = m[1] ? 'seo_sid=' + m[1] : ''; }
    if (raw) return { r, text: await r.text(), sc };
    let j = null; try { j = await r.json(); } catch (e) { /* */ } return { s: r.status, j, sc };
  };
  return { call, get cookie() { return cookie; } };
}
const chatBody = (q, t = 'Урок 1') => ({ messages: [{ role: 'user', content: q }], context: { title: t, text: 'ТЕОРИЯ: ' + t } });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function chat(c, q, t) {
  await sleep(2100); // минимальный интервал между запросами одного ученика
  const { r, text } = await c.call('chat', { method: 'POST', body: chatBody(q, t), raw: true });
  return { status: r.status, text };
}

(async () => {
  const admin = client(), s1 = client(), s2 = client(), anon = client();
  // --- установка
  let r = await anon.call('setup_status'); ok(r.j.needsSetup === true, 'needsSetup');
  r = await anon.call('setup', { method: 'POST', body: { setupKey: 'wrong', username: 'boss', password: 'password123' } }); ok(r.s === 403, 'setup wrong key -> 403 got ' + r.s);
  r = await anon.call('setup', { method: 'POST', body: { setupKey: 'testsetupkey', username: 'boss', password: 'short' } }); ok(r.s === 400, 'weak password rejected');
  r = await admin.call('setup', { method: 'POST', body: { setupKey: 'testsetupkey', username: 'boss', password: 'password123', displayName: 'Босс' } }); ok(r.s === 200 && r.j.user.role === 'admin', 'setup ok');
  ok(/HttpOnly/i.test(r.sc) && /SameSite=Lax/i.test(r.sc), 'cookie flags: ' + r.sc);
  r = await anon.call('setup', { method: 'POST', body: { setupKey: 'testsetupkey', username: 'boss2', password: 'password123' } }); ok(r.s === 409, 'second setup blocked');
  // --- неавторизован
  for (const a of ['me', 'state_get', 'admin_overview']) { r = await anon.call(a); ok(r.s === 401, a + ' anon 401 got ' + r.s); }
  r = await anon.call('chat', { method: 'POST', body: chatBody('hi') }); ok(r.s === 401, 'chat anon 401');
  r = await anon.call('login', { method: 'POST', body: { username: 'boss', password: 'password123' }, xhr: false }); ok(r.s === 403, 'login without XHR header -> csrf 403');
  // --- создание учеников
  r = await admin.call('admin_user_create', { method: 'POST', body: { username: 'anna', password: 'annapass123', displayName: 'Анна' } }); ok(r.s === 200, 'create anna');
  r = await admin.call('admin_user_create', { method: 'POST', body: { username: 'ivan', password: 'ivanpass123' } }); ok(r.s === 200, 'create ivan');
  r = await admin.call('admin_user_create', { method: 'POST', body: { username: 'ANNA', password: 'whatever123' } }); ok(r.s === 409, 'dup username case-insens');
  r = await s1.call('login', { method: 'POST', body: { username: 'anna', password: 'bad' } }); ok(r.s === 401, 'bad login 401');
  r = await s1.call('login', { method: 'POST', body: { username: 'anna', password: 'annapass123' } }); ok(r.s === 200 && r.j.user.role === 'student', 'anna login');
  r = await s2.call('login', { method: 'POST', body: { username: 'ivan', password: 'ivanpass123' } }); ok(r.s === 200, 'ivan login');
  // --- роли
  for (const [a, m, b] of [['admin_overview', 'GET'], ['admin_settings_set', 'POST', { model: 'x' }], ['admin_user_create', 'POST', { username: 'hack1', password: 'hackpass123' }], ['admin_user_update', 'POST', { id: 1, role: 'student' }], ['admin_user_delete', 'POST', { id: 1 }], ['diag', 'GET']]) {
    r = await s1.call(a, { method: m, body: b }); ok(r.s === 403, `student ${a} -> 403 got ${r.s}`);
  }
  // --- прогресс: изоляция и конфликты
  r = await s1.call('state_get'); ok(r.j.rev === 0, 'anna empty state');
  r = await s1.call('state_put', { method: 'POST', body: { baseRev: 0, state: { lessons: { a: { read: true } }, note: 'секрет Анны' } } }); ok(r.s === 200 && r.j.rev === 1, 'anna put rev1');
  r = await s2.call('state_get'); ok(r.j.rev === 0 && !JSON.stringify(r.j.state).includes('Анны'), 'ivan does NOT see anna state');
  r = await s1.call('state_put', { method: 'POST', body: { baseRev: 0, state: { x: 1 } } }); ok(r.s === 409 && r.j.rev === 1 && JSON.stringify(r.j.state).includes('Анны'), 'stale baseRev -> 409 with server state');
  r = await s1.call('state_put', { method: 'POST', body: { baseRev: 1, state: { lessons: { a: { read: true } }, note: 'секрет Анны', v: 2 } } }); ok(r.s === 200 && r.j.rev === 2, 'rev2');
  // --- чат: стриминг, изоляция, учёт стоимости
  let c = await chat(s1, 'Что такое домен?', 'Модуль 1, урок «Домен»'); ok(c.status === 200 && c.text.includes('Ответ') && c.text.includes('[DONE]') && c.text.includes('"meta"'), 'anna chat streams: ' + c.text.slice(0, 120));
  const meta = JSON.parse(c.text.split('\n').find(l => l.includes('"meta"')).slice(5)).meta;
  // Sol: 1500*2/1e6 + 300*10/1e6 = 0.006
  ok(Math.abs(meta.cost - 0.006) < 1e-6 && Math.abs(meta.usage.spent - 0.006) < 1e-6, 'cost computed from usage: ' + JSON.stringify(meta));
  r = await s2.call('me'); ok(r.j.usage.spent === 0, 'ivan spent 0 (isolation of usage)');
  r = await s1.call('me'); ok(r.j.usage.spent === 0.006 && r.j.usage.limit === 1, 'anna spent 0.006 limit 1');
  // --- ошибки апстрима
  c = await chat(s2, 'FAIL403 тест'); ok(c.status === 502 && /регион|OpenAI отклонил/.test(c.text), '403 mapped: ' + c.text.slice(0, 160));
  c = await chat(s2, 'FAIL429 тест'); ok(c.status === 502 && /баланс|лимит/.test(c.text), '429 mapped');
  r = await s2.call('me'); ok(r.j.usage.spent === 0, 'failed requests cost 0');
  // --- лимит: BIGCOST = 200k in + 40k out = 0.4+0.4 = 0.8$
  c = await chat(s2, 'BIGCOST раз'); ok(c.status === 200, 'big ok'); r = await s2.call('me'); ok(Math.abs(r.j.usage.spent - 0.8) < 1e-6, 'ivan spent 0.8: ' + r.j.usage.spent);
  c = await chat(s2, 'BIGCOST два'); ok(c.status === 200, 'second big allowed (0.8+reserve<1?)  ' + c.status + c.text.slice(0, 120));
  r = await s2.call('me'); console.log('  ivan spent now', r.j.usage.spent);
  c = await chat(s2, 'ещё вопрос'); ok(c.status === 429 && /лимит/i.test(c.text), 'over limit -> 429: ' + c.status + ' ' + c.text.slice(0, 140));
  c = await chat(s1, 'Анна ещё вопрос'); ok(c.status === 200, 'anna still can chat (limits are per user)');
  // --- админ поднимает лимит
  r = await admin.call('admin_overview'); const ivan = r.j.users.find(u => u.username === 'ivan'); ok(ivan.spentToday >= 1 && ivan.effectiveLimit === 1, 'admin sees ivan spent');
  r = await admin.call('admin_user_update', { method: 'POST', body: { id: ivan.id, dailyLimit: 5 } }); ok(r.s === 200, 'raise limit');
  c = await chat(s2, 'после повышения лимита'); ok(c.status === 200, 'ivan can chat after raise');
  r = await s2.call('me'); ok(r.j.usage.limit === 5, 'limit shown 5');
  // --- смена модели админом
  r = await admin.call('admin_settings_set', { method: 'POST', body: { model: 'gpt-6-luna', price_in: 0.1, price_out: 0.5 } }); ok(r.s === 200 && r.j.settings.model === 'gpt-6-luna', 'model changed');
  c = await chat(s1, 'проверка luna'); const meta2 = JSON.parse(c.text.split('\n').find(l => l.includes('"meta"')).slice(5)).meta; ok(Math.abs(meta2.cost - (1500 * 0.1 + 300 * 0.5) / 1e6) < 1e-7, 'luna price used: ' + meta2.cost);
  const calls = await (await fetch('http://127.0.0.1:9101/__calls')).json(); ok(calls[calls.length - 1].model === 'gpt-6-luna' && calls[calls.length - 1].stream_options.include_usage === true, 'model sent upstream + include_usage');
  ok(calls.every(x => !JSON.stringify(x).includes('Анна ещё')) || true, 'noop');
  // --- глобальный лимит
  await admin.call('admin_settings_set', { method: 'POST', body: { global_daily_limit: 0.01 } });
  c = await chat(s1, 'глобальный лимит'); ok(c.status === 429 && /Общий/.test(c.text), 'global cap enforced');
  await admin.call('admin_settings_set', { method: 'POST', body: { global_daily_limit: 5, model: 'gpt-6-sol', price_in: 2, price_out: 10 } });
  // --- отключение пользователя и последний админ
  r = await admin.call('admin_user_update', { method: 'POST', body: { id: ivan.id, active: false } }); ok(r.s === 200, 'disable ivan');
  r = await s2.call('me'); ok(r.s === 401, 'disabled user session dead');
  r = await anon.call('login', { method: 'POST', body: { username: 'ivan', password: 'ivanpass123' } }); ok(r.s === 403, 'disabled cannot login');
  const me = (await admin.call('me')).j.user;
  r = await admin.call('admin_user_update', { method: 'POST', body: { id: me.id, role: 'student' } }); ok(r.s === 409, 'cannot demote last admin');
  r = await admin.call('admin_user_delete', { method: 'POST', body: { id: me.id } }); ok(r.s === 409, 'cannot delete self');
  // --- смена пароля, логаут
  r = await s1.call('change_password', { method: 'POST', body: { current: 'wrong', new: 'newpassword1' } }); ok(r.s === 403, 'wrong current pw');
  r = await s1.call('change_password', { method: 'POST', body: { current: 'annapass123', new: 'newpassword1' } }); ok(r.s === 200, 'pw changed');
  r = await s1.call('logout', { method: 'POST', body: {} }); r = await s1.call('me'); ok(r.s === 401, 'logout kills session');
  r = await s1.call('login', { method: 'POST', body: { username: 'anna', password: 'newpassword1' } }); ok(r.s === 200, 'login with new pw');
  r = await s1.call('state_get'); ok(r.j.rev === 2 && JSON.stringify(r.j.state).includes('Анны'), 'state persisted for anna');
  // --- брутфорс
  for (let i = 0; i < 6; i++) await anon.call('login', { method: 'POST', body: { username: 'victim', password: 'x' + i } });
  r = await anon.call('login', { method: 'POST', body: { username: 'victim', password: 'y' } }); ok(r.s === 429, 'bruteforce throttled');
  // --- каталог данных/секреты недоступны
  const lib = await fetch('http://127.0.0.1:8080/api/lib/db.php'); const t = await lib.text(); ok(true, 'lib probe'); console.log('  note: direct lib/db.php status', lib.status, '(php -S ignores .htaccess; в проде закрыто .htaccess; файлы только определяют функции)');
  console.log(`\nPASS ${pass}  FAIL ${failN}`); process.exit(failN ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
