import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function testBackgroundExposesChatMemoryActions() {
    const source = read('chrome/background.js');

    [
        "request.action === 'replaceChatHistory'",
        "request.action === 'clearChatHistory'",
        "request.action === 'upsertSummaryMessage'",
        "request.action === 'getCompactMemory'",
        "request.action === 'updateCompactMemory'",
        "request.action === 'getSelectedPageText'"
    ].forEach((snippet) => {
        assert.equal(source.includes(snippet), true, `background.js should handle ${snippet}`);
    });
}

function testContentScriptSupportsSelectedTextRequests() {
    const source = read('src/js/content-script.js');

    assert.equal(source.includes("request.action === 'getSelectedText'"), true);
    assert.equal(source.includes('window.getSelection().toString()'), true);
}

function testAiChatUsesSelectionChipHistoryPopupAndContextBuilder() {
    const source = read('src/js/modules/ai-chat.js');

    [
        "import {",
        "buildChatRequestMessages",
        "buildSelectionPreview",
        "selection-chip",
        "historyButton.addEventListener",
        "closeHistoryButton.addEventListener",
        "action: 'getSelectedPageText'",
        "action: 'getCompactMemory'",
        "action: 'updateCompactMemory'",
        'settings.loadLastChat'
    ].forEach((snippet) => {
        assert.equal(source.includes(snippet), true, `ai-chat.js should include ${snippet}`);
    });
}

function run() {
    testBackgroundExposesChatMemoryActions();
    testContentScriptSupportsSelectedTextRequests();
    testAiChatUsesSelectionChipHistoryPopupAndContextBuilder();
    console.log('chat integration sources: ok');
}

run();
