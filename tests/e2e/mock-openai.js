'use strict';
/* Подставной OpenAI для тестов: считает usage, умеет ошибки. */
const http = require('http');
let calls = [];
http.createServer((req, res) => {
  const auth = req.headers.authorization || '';
  if (req.url === '/__calls') { res.end(JSON.stringify(calls)); return; }
  if (auth !== 'Bearer sk-mock') { res.statusCode = 401; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ error: { message: 'Incorrect API key' } })); }
  if (req.url === '/v1/models') { res.setHeader('Content-Type', 'application/json'); return res.end('{"data":[]}'); }
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    const body = JSON.parse(b || '{}'); calls.push(body);
    const last = body.messages[body.messages.length - 1].content;
    if (last.includes('FAIL429')) { res.statusCode = 429; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ error: { message: 'You exceeded your current quota' } })); }
    if (last.includes('FAIL403')) { res.statusCode = 403; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ error: { message: 'Country, region, or territory not supported' } })); }
    const big = last.includes('BIGCOST');
    res.setHeader('Content-Type', 'text/event-stream');
    const ctx = body.messages[0].content;
    const parts = ['Ответ ', 'по теме. ', 'Контекст: ' + (ctx.match(/Текущий контекст: ([^\n.]*)/) || [, '?'])[1] + '. ', 'Вопрос: ' + last.slice(0, 40)];
    let i = 0;
    const t = setInterval(() => {
      if (i < parts.length) { res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: parts[i++] } }] }) + '\n\n'); return; }
      clearInterval(t);
      res.write('data: ' + JSON.stringify({ choices: [], usage: { prompt_tokens: big ? 200000 : 1500, completion_tokens: big ? 40000 : 300 } }) + '\n\n');
      res.write('data: [DONE]\n\n'); res.end();
    }, 40);
  });
}).listen(Number(process.env.PORT || 9101), () => console.log('mock openai'));
