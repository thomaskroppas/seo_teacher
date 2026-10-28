'use strict';
/* Ретранслятор запросов к OpenAI-совместимому API.
   Ключ OpenAI хранится ТОЛЬКО здесь (переменная окружения OPENAI_API_KEY) — ни в браузере, ни на хостинге с сайтом.
   Принимает запросы только с секретом (заголовок X-Relay-Secret == переменная RELAY_SECRET). */
const crypto = require('crypto');

const ALLOWED_KEYS = new Set(['model', 'messages', 'stream', 'stream_options', 'max_completion_tokens', 'max_tokens', 'reasoning_effort', 'temperature']);
const MAX_BODY = 300 * 1024;

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb) && String(a).length > 0;
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body; // Vercel уже разобрал JSON
  if (typeof req.body === 'string') return JSON.parse(req.body);
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > MAX_BODY) throw Object.assign(new Error('too large'), { code: 413 }); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function handle(req, res) {
  const secret = process.env.RELAY_SECRET || '';
  const apiKey = process.env.OPENAI_API_KEY || '';
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/+$/, '');
  if (!secret || !apiKey) return send(res, 500, { error: 'not_configured', message: 'Не заданы RELAY_SECRET / OPENAI_API_KEY' });
  if (!safeEqual(req.headers['x-relay-secret'] || '', secret)) return send(res, 403, { error: 'forbidden' });

  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.searchParams.get('check')) {
    try {
      const r = await fetch(base + '/v1/models', { headers: { Authorization: 'Bearer ' + apiKey } });
      const t = await r.text();
      let msg = ''; try { msg = JSON.parse(t).error?.message || ''; } catch (e) { /* не JSON */ }
      return send(res, 200, { ok: r.ok, openai_status: r.status, message: r.ok ? 'Ключ работает, регион ретранслятора допустим' : msg.slice(0, 300), region: process.env.VERCEL_REGION || process.env.FLY_REGION || null });
    } catch (e) { return send(res, 200, { ok: false, message: 'Нет связи с OpenAI: ' + e.message }); }
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });

  let body;
  try { body = await readBody(req); } catch (e) { return send(res, e.code === 413 ? 413 : 400, { error: 'bad_body' }); }
  if (!body || typeof body !== 'object' || !Array.isArray(body.messages) || typeof body.model !== 'string') return send(res, 400, { error: 'bad_request' });
  for (const k of Object.keys(body)) if (!ALLOWED_KEYS.has(k)) delete body[k];

  const cap = Number(process.env.MAX_TOKENS_CAP || 8000);
  for (const k of ['max_completion_tokens', 'max_tokens']) if (k in body) body[k] = Math.min(Number(body[k]) || cap, cap);
  if (!('max_completion_tokens' in body) && !('max_tokens' in body)) body.max_completion_tokens = Math.min(2000, cap);
  const allowed = (process.env.ALLOWED_MODELS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.length && !allowed.includes(body.model)) return send(res, 400, { error: 'model_not_allowed' });

  let up;
  try {
    up = await fetch(base + '/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey }, body: JSON.stringify(body) });
  } catch (e) { return send(res, 502, { error: { message: 'Ретранслятор не достучался до OpenAI: ' + e.message } }); }

  res.statusCode = up.status;
  res.setHeader('Content-Type', up.headers.get('content-type') || 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  if (!up.body) return res.end();
  try { for await (const chunk of up.body) res.write(chunk); } catch (e) { /* клиент отключился */ }
  res.end();
}

module.exports = { handle };
