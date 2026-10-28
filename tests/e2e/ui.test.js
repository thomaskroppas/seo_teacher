'use strict';
/* UI-тест: стенд должен быть запущен (tests/e2e/stack.sh start), БД пустая. PLAYWRIGHT_PATH=... node tests/e2e/ui.test.js */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const U = 'http://127.0.0.1:8080/';
let pass = 0, bad = 0; const ok = (c, m) => { if (c) pass++; else { bad++; console.log('FAIL:', m); } };
async function login(ctx, user, pw, viewport) {
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.errs = errs;
  await p.goto(U); await p.waitForSelector('#lf'); await p.fill('#lu', user); await p.fill('#lp', pw); await p.click('#lb'); await p.waitForSelector('.hero', { timeout: 8000 }); return p;
}
async function ask(p, q) {
  if (await p.$('#aiPanel.hide')) await p.click('#aiFab');
  await p.fill('#aiInput', q); await p.click('#aiSend'); await p.waitForFunction(() => !document.querySelector('#aiLive') && document.querySelectorAll('.ai-m.assistant').length > 0, null, { timeout: 8000 }); await p.waitForTimeout(400);
  return await p.innerText('#aiMsgs');
}
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  // --- первый запуск: создание админа
  const ctxA = await b.newContext({ viewport: { width: 1100, height: 850 } }); const a = await ctxA.newPage(); const aerr = []; a.on('pageerror', e => aerr.push(e.message));
  await a.goto(U); await a.waitForSelector('#sf'); ok(!(await a.isVisible('.nav')), 'nav hidden before login');
  await a.fill('#sk', 'testsetupkey'); await a.fill('#su', 'boss'); await a.fill('#sd', 'Босс'); await a.fill('#sp', 'password123'); await a.click('#sb'); await a.waitForSelector('.hero');
  ok(await a.isVisible('.nav'), 'nav visible after setup'); ok((await a.innerText('#nav')).includes('Админ'), 'admin link in nav');
  // --- админка: создаём учеников
  for (const [u, n, pw] of [['anna', 'Анна', 'annapass123'], ['ivan', 'Иван', 'ivanpass123']]) {
    await a.goto(U + '#/admin/users'); await a.waitForSelector('#nu'); await a.fill('#nu', u); await a.fill('#nd', n); await a.fill('#np', pw); await a.click('#nadd'); await a.waitForSelector(`tr[data-id] >> text=${u}`, { timeout: 5000 });
  }
  ok((await a.innerText('#adm')).includes('anna') && (await a.innerText('#adm')).includes('ivan'), 'students listed');
  // --- ученик Анна: прогресс + чат
  const ctxB = await b.newContext({ viewport: { width: 1100, height: 850 } }); const an = await login(ctxB, 'anna', 'annapass123');
  ok(!(await an.innerText('#nav')).includes('Админ'), 'student has no admin link');
  await an.goto(U + '#/admin/users'); await an.waitForTimeout(300); ok((await an.innerText('#app')).includes('Нет доступа'), 'student blocked from admin page');
  await an.goto(U + '#/lesson/m1-l1'); await an.waitForSelector('#readBtn'); await an.click('#readBtn'); await an.waitForTimeout(3500); // дебаунс синхронизации
  const ans1 = await ask(an, 'Секретный вопрос Анны про домены');
  ok(ans1.includes('Ответ') && ans1.includes('Секретный вопрос Анны'), 'anna got streamed answer');
  ok((await an.innerText('.ai-usage')).includes('$0.0'), 'usage bar shown: ' + (await an.innerText('.ai-usage')).replace(/\n/g, ' '));
  await an.waitForTimeout(3500);
  // --- ученик Иван: не видит ничего Анны
  const ctxC = await b.newContext({ viewport: { width: 1100, height: 850 } }); const iv = await login(ctxC, 'ivan', 'ivanpass123');
  await iv.goto(U + '#/lesson/m1-l1'); await iv.waitForSelector('#readBtn'); ok((await iv.innerText('#readBtn')).includes('Отметить прочитанным'), 'ivan lesson NOT read (own progress)');
  await iv.click('#aiFab'); await iv.waitForSelector('#aiMsgs'); ok(!(await iv.innerText('#aiMsgs')).includes('Анны'), 'ivan chat empty / no anna messages');
  const ans2 = await ask(iv, 'Вопрос Ивана про хостинг'); ok(ans2.includes('Иван') && !ans2.includes('Анны'), 'ivan chat isolated');
  await iv.waitForTimeout(3500);
  // --- второе устройство Анны: прогресс и чат синхронизируются
  const ctxB2 = await b.newContext({ viewport: { width: 390, height: 800 }, isMobile: true }); const an2 = await login(ctxB2, 'anna', 'annapass123');
  await an2.goto(U + '#/lesson/m1-l1'); await an2.waitForSelector('#readBtn'); ok((await an2.innerText('#readBtn')).includes('Прочитано'), 'anna progress synced to 2nd device');
  await an2.click('#aiFab'); await an2.waitForSelector('#aiMsgs'); ok((await an2.innerText('#aiMsgs')).includes('Секретный вопрос Анны'), 'anna chat synced to 2nd device');
  ok(!(await an2.innerText('#aiMsgs')).includes('Ивана'), '2nd device has no ivan data');
  await an2.screenshot({ path: '/tmp/claude-0/mobile-ai.png' });
  // --- админ видит расходы
  await a.goto(U + '#/admin/users'); await a.waitForSelector('tr[data-id]'); const t = await a.innerText('#adm'); ok(/\$0\.0\d/.test(t), 'admin sees spend');
  await a.goto(U + '#/admin/ai'); await a.waitForSelector('#ssave'); await a.click('[data-preset=luna]'); await a.click('#ssave'); await a.waitForTimeout(500); await a.goto(U + '#/admin/ai'); await a.waitForSelector('#sm'); ok((await a.inputValue('#sm')) === 'gpt-6-luna', 'model switched via UI');
  await a.click('#sdiag'); await a.waitForFunction(() => document.querySelector('#diag').textContent.includes('relay'), null, { timeout: 15000 }); ok((await a.innerText('#diag')).includes('"relay_http": 200'), 'diag relay ok');
  await a.screenshot({ path: '/tmp/claude-0/admin-ai.png' });
  // --- выход
  await an.goto(U + '#/settings'); await an.waitForSelector('#logout'); await an.click('#logout'); await an.waitForSelector('#lf'); ok(true, 'logout shows login');
  await an.reload(); await an.waitForSelector('#lf'); ok(true, 'after reload still logged out');
  const errs = [...aerr, ...an.errs, ...iv.errs, ...an2.errs]; ok(errs.length === 0, 'no page errors: ' + errs.join(' | '));
  console.log(`\nPASS ${pass} FAIL ${bad}`); await b.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
