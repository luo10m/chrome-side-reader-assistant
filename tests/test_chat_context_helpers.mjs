import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function pathToFileUrl(filePath) {
    return `file:///${filePath.replace(/\\/g, '/')}`;
}

async function loadHelpers() {
    return import(pathToFileUrl(path.join(repoRoot, 'src/js/shared/chat-context.mjs')));
}

async function testBuildChatRequestMessagesUsesSummaryMemoryRecentMessagesAndSelection() {
    const { buildChatRequestMessages } = await loadHelpers();

    const history = [
        { role: 'system', content: 'ignore me' },
        { role: 'assistant', type: 'summary', content: 'summary copy in history should not be replayed as raw history' },
        { role: 'user', content: 'q1' },
        { role: 'assistant', content: 'a1' },
        { role: 'user', content: 'q2' },
        { role: 'assistant', content: 'a2' },
        { role: 'user', content: 'q3' },
        { role: 'assistant', content: 'a3' },
        { role: 'user', content: 'q4' },
        { role: 'assistant', content: 'a4' }
    ];

    const messages = buildChatRequestMessages({
        systemPrompt: 'system prompt',
        pageSummary: 'page summary',
        compactMemory: 'memory summary',
        history,
        userMessage: 'current question',
        selectionText: 'selected quote',
        maxHistoryInContext: 3
    });

    assert.deepEqual(
        messages.map((message) => ({ role: message.role, content: message.content })),
        [
            { role: 'system', content: 'system prompt' },
            { role: 'system', content: '以下是当前页面摘要，供回答参考：\npage summary' },
            { role: 'system', content: '以下是当前页面对话的长期记忆，请在回答时延续这些上下文：\nmemory summary' },
            { role: 'assistant', content: 'a3' },
            { role: 'user', content: 'q4' },
            { role: 'assistant', content: 'a4' },
            { role: 'user', content: '用户当前问题：\ncurrent question\n\n用户当前选中的网页片段：\nselected quote' }
        ]
    );
}

async function testGetMessagesForCompactMemoryReturnsOnlyArchivedConversation() {
    const { getMessagesForCompactMemory } = await loadHelpers();

    const history = [
        { role: 'system', content: 'system prompt' },
        { role: 'assistant', type: 'summary', content: 'summary' },
        { role: 'user', content: 'q1' },
        { role: 'assistant', content: 'a1' },
        { role: 'user', content: 'q2' },
        { role: 'assistant', content: 'a2' },
        { role: 'user', content: 'q3' },
        { role: 'assistant', content: 'a3' }
    ];

    assert.deepEqual(
        getMessagesForCompactMemory(history, 4),
        [
            { role: 'user', content: 'q1' },
            { role: 'assistant', content: 'a1' }
        ]
    );
}

async function testBuildSelectionPreviewTruncatesLongText() {
    const { buildSelectionPreview } = await loadHelpers();

    assert.equal(buildSelectionPreview('  short text  ', 20), 'short text');
    assert.equal(buildSelectionPreview('12345678901234567890', 10), '1234567890...');
    assert.equal(buildSelectionPreview('', 10), '');
}

async function run() {
    await testBuildChatRequestMessagesUsesSummaryMemoryRecentMessagesAndSelection();
    await testGetMessagesForCompactMemoryReturnsOnlyArchivedConversation();
    await testBuildSelectionPreviewTruncatesLongText();
    console.log('chat context helpers: ok');
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
