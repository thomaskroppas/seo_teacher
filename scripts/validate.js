#!/usr/bin/env node
// Проверка структуры контента: node scripts/validate.js [data/module-1.js ...]
const fs = require("fs"), path = require("path"), vm = require("vm");
const dir = path.join(__dirname, "..", "data");
const files = process.argv.length > 2 ? process.argv.slice(2) : fs.readdirSync(dir).filter(f => /^module-\d+\.js$/.test(f)).map(f => path.join(dir, f));
let errors = 0, warns = 0;
const err = (f, m) => { errors++; console.log("ERROR " + path.basename(f) + ": " + m); };
const warn = (f, m) => { warns++; console.log("warn  " + path.basename(f) + ": " + m); };
const words = s => (s || "").split(/\s+/).filter(Boolean).length;
function checkQ(f, where, q) {
  if (!q || typeof q.q !== "string") return err(f, where + " нет q");
  if (!q.explain || q.explain.length < 30) warn(f, where + " короткий explain");
  const t = q.type;
  if (t === "truefalse") { if (typeof q.answer !== "boolean") err(f, where + " truefalse.answer не boolean"); return; }
  if (!Array.isArray(q.options) || q.options.length < 3) return err(f, where + " <3 options");
  if (t === "single" || t === "scenario") { if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) err(f, where + " неверный answer"); }
  else if (t === "multi") { if (!Array.isArray(q.answer) || !q.answer.length || q.answer.some(i => !Number.isInteger(i) || i < 0 || i >= q.options.length)) err(f, where + " неверный answer(multi)"); }
  else err(f, where + " неизвестный type " + t);
}
for (const f of files) {
  global.window = { COURSE_MODULES: [] };
  try { vm.runInNewContext(fs.readFileSync(f, "utf8"), { window: global.window }); } catch (e) { err(f, "синтаксис: " + e.message); continue; }
  const mods = global.window.COURSE_MODULES;
  if (mods.length !== 1) { err(f, "ожидался 1 модуль, найдено " + mods.length); continue; }
  const m = mods[0];
  ["id", "num", "week", "title", "subtitle", "goal"].forEach(k => { if (!m[k]) err(f, "нет поля " + k); });
  if (!Array.isArray(m.lessons) || m.lessons.length !== 6) err(f, "нужно ровно 6 уроков, есть " + (m.lessons || []).length);
  const dist = [0, 0, 0, 0, 0];
  (m.lessons || []).forEach((l, i) => {
    const w = `урок ${i + 1} (${l.id})`;
    if (l.id !== `${m.id}-l${i + 1}`) err(f, w + " id должен быть " + `${m.id}-l${i + 1}`);
    ["title", "summary", "theory"].forEach(k => { if (!l[k]) err(f, w + " нет " + k); });
    if (!(l.minutes > 0)) err(f, w + " нет minutes");
    if (!l.objectives || l.objectives.length < 3) err(f, w + " <3 objectives");
    const tw = words(l.theory);
    if (tw < 800) warn(f, `${w} теория коротковата: ${tw} слов`);
    if (!l.practice || !l.practice.tasks || l.practice.tasks.length < 2) err(f, w + " <2 practice tasks");
    (l.practice && l.practice.tasks || []).forEach((t, j) => {
      if (t.id !== `${l.id}-t${j + 1}`) err(f, `${w} task id должен быть ${l.id}-t${j + 1}`);
      if (!t.steps || t.steps.length < 3) err(f, `${w} task ${j + 1} <3 steps`);
      if (!t.deliverable) err(f, `${w} task ${j + 1} нет deliverable`);
      if (!t.checklist || t.checklist.length < 2) err(f, `${w} task ${j + 1} <2 checklist`);
    });
    if (!l.quiz || l.quiz.length < 7) err(f, w + " <7 вопросов квиза");
    (l.quiz || []).forEach((q, j) => { checkQ(f, `${w} quiz ${j + 1}`, q); if (typeof q.answer === "number") dist[q.answer] = (dist[q.answer] || 0) + 1; });
    if (!l.cards || l.cards.length < 6) err(f, w + " <6 карточек");
    (l.cards || []).forEach((c, j) => { if (!c.front || !c.back) err(f, `${w} card ${j + 1} пустая`); });
    if (!l.resources || l.resources.length < 2) warn(f, w + " <2 ресурсов");
  });
  if (!Array.isArray(m.scenarios) || m.scenarios.length !== 6) err(f, "нужно ровно 6 сценариев");
  (m.scenarios || []).forEach((s, i) => {
    const w = `сценарий ${i + 1}`;
    if (s.id !== `${m.id}-s${i + 1}`) err(f, w + ` id должен быть ${m.id}-s${i + 1}`);
    if (!s.situation || !s.title) err(f, w + " нет title/situation");
    const c = s.choices || [];
    if (c.length < 3 || c.length > 4) err(f, w + " нужно 3–4 варианта");
    if (c.filter(x => x.verdict === "best").length !== 1) err(f, w + " нужен ровно один best");
    c.forEach(x => { if (!["best", "ok", "bad"].includes(x.verdict) || !x.feedback || !x.text) err(f, w + " некорректный вариант"); });
  });
  if (!m.exam || m.exam.length < 12) err(f, "экзамен: нужно 12 вопросов, есть " + (m.exam || []).length);
  (m.exam || []).forEach((q, j) => checkQ(f, `exam ${j + 1}`, q));
  console.log(`${path.basename(f)}: ${m.lessons ? m.lessons.length : 0} уроков, слов теории: ${(m.lessons || []).reduce((a, l) => a + words(l.theory), 0)}; распределение answer(single) A-E: ${dist.join("/")}`);
}
console.log(`\nОшибок: ${errors}, предупреждений: ${warns}`);
process.exit(errors ? 1 : 0);
