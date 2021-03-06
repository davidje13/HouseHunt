#!/usr/bin/env -S node --disable-proto delete
// TODO: --disallow-code-generation-from-strings (see https://github.com/dougwilson/nodejs-depd/issues/41)

import express from 'express';
import { dirname, join } from 'path';
import DB from '../database/db.mjs';

const curDir = dirname(new URL(import.meta.url).pathname);

const app = express();
const db = new DB();

app.get('/api/locations', async (req, res) => {
  try {
    res.header('Content-Type', 'application/json; charset=utf-8');
    let first = true;
    for await (const item of db.getAllBasic()) {
      if (first) {
        first = false;
        res.write('{"items":[');
      } else {
        res.write(',');
      }
      res.write(JSON.stringify(item));
    }
    if (first) {
      res.send('{"items":[]}');
    } else {
      res.write(']}');
      res.end();
    }
  } catch (e) {
    console.error('/api/locations failed', e);
    res.status(500);
    res.send(JSON.stringify({ error: 'internal error' }));
  }
});

app.get('/api/locations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    res.header('Content-Type', 'application/json; charset=utf-8');
    const item = await db.getExtraPropertyDetails(id);
    if (!item) {
      res.status(404);
      res.send(JSON.stringify({ error: 'not found' }));
      return;
    }
    res.send(JSON.stringify(item));
  } catch (e) {
    console.error('/api/locations/item failed', e);
    res.status(500);
    res.send(JSON.stringify({ error: 'internal error' }));
  }
});

const CSP = [
  "base-uri 'self'",
  "default-src 'self'",
  "object-src 'none'",
  "script-src 'self' https://cdn.jsdelivr.net blob:",
  "style-src 'self' https://cdn.jsdelivr.net",
  "connect-src 'self'",
  "img-src 'self' https://*.tile.openstreetmap.org https://*.zoocdn.com",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

app.use(express.static(join(curDir, 'frontend'), {
  setHeaders: (res) => {
    res.header('x-frame-options', 'DENY');
    res.header('x-xss-protection', '1; mode=block');
    res.header('x-content-type-options', 'nosniff');
    res.header('content-security-policy', CSP);
    res.header('referrer-policy', 'no-referrer');
    res.header('cross-origin-opener-policy', 'same-origin');
    res.header('cross-origin-embedder-policy', 'unsafe-none'); // required to load Zoopla images
  },
}));

const server = app.listen(8080, '127.0.0.1');
process.stdout.write('Listening at http://localhost:8080/\n');

let interrupted = false;
process.on('SIGINT', async () => {
  // SIGINT is sent twice in quick succession, so ignore the second
  if (!interrupted) {
    interrupted = true;
    process.stdout.write('\nShutting down...\n');
    server.close((e) => {
      if (e) {
        process.stderr.write(`\nFailed to shut down: ${e.message}.\n`);
      } else {
        db.close();
        process.stdout.write('\nShutdown complete.\n');
      }
    });
  }
});
