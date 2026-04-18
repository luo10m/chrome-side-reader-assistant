import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const source = fs.readFileSync(
    path.join(repoRoot, 'src/js/content-script.js'),
    'utf8'
);

assert.equal(
    source.includes("window.addEventListener('unload'"),
    false,
    'content script should not register unload listeners because modern SPA pages may block them via permissions policy'
);

console.log('content script lifecycle: ok');
