'use strict';
/* Запуск без Vercel — на любом VPS за границей: RELAY_SECRET=... OPENAI_API_KEY=... PORT=8787 node server.js */
const http = require('http');
const { handle } = require('./core');
http.createServer((req, res) => { handle(req, res).catch(e => { try { res.statusCode = 500; res.end('{"error":"server"}'); } catch (x) { /* */ } }); })
  .listen(Number(process.env.PORT || 8787), () => console.log('relay on :' + (process.env.PORT || 8787)));
