import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const source = fs.readFileSync(path.join(repoRoot, 'src/css/ai-chat.css'), 'utf8');

assert.equal(
    source.includes('.selection-chip[hidden]'),
    true,
    'selection chip should explicitly stay hidden when the hidden attribute is present'
);

console.log('ai chat styles: ok');
