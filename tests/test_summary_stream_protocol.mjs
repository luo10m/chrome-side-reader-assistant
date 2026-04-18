import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function testSummaryProviderDoesNotSendLoadingTextAsSummaryContent() {
    const source = read('chrome/services/llm-provider.js');

    assert.equal(
        source.includes("content: '正在生成摘要...'"),
        false,
        'summary stream protocol should not send placeholder loading text as content chunks'
    );
}

function testSummaryProviderDoneEventDoesNotReplayFullSummaryContent() {
    const source = read('chrome/services/llm-provider.js');

    assert.equal(
        source.includes('done: true,\n                    content: fullResponse'),
        false,
        'summary stream done event should not replay the entire summary content'
    );
}

function run() {
    testSummaryProviderDoesNotSendLoadingTextAsSummaryContent();
    testSummaryProviderDoneEventDoesNotReplayFullSummaryContent();
    console.log('summary stream protocol: ok');
}

run();
