#!/usr/bin/env -S node --disable-proto delete
// TODO: --disallow-code-generation-from-strings (see https://github.com/dougwilson/nodejs-depd/issues/41)

import express from 'express';
import { dirname, join } from 'path';
import DB from '../database/db.mjs';

const baseDir = join(dirname(new URL(import.meta.url).pathname), '..');

const app = express();
const db = new DB();

app.get('/api/locations', async (req, res) => {
  try {
    res.header('Content-Type', 'application/json; charset=utf-8');
    let first = true;
    for await (const { id, lat, lon } of db.getAllLocations()) {
      if (first) {
        first = false;
        res.write('{"items":[');
      } else {
        res.write(',');
      }
      res.write(JSON.stringify({ id, lat, lon }));
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

const CSP = [
  "base-uri 'self'",
  "default-src 'self'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self'",
  "img-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

app.use(express.static(join(baseDir, 'frontend'), {
  setHeaders: (res) => {
    res.header('x-frame-options', 'DENY');
    res.header('x-xss-protection', '1; mode=block');
    res.header('x-content-type-options', 'nosniff');
    res.header('content-security-policy', CSP);
    res.header('referrer-policy', 'no-referrer');
    res.header('cross-origin-opener-policy', 'same-origin');
    res.header('cross-origin-embedder-policy', 'require-corp');
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
