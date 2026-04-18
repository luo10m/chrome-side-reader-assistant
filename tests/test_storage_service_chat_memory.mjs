import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function pathToFileUrl(filePath) {
    return `file:///${filePath.replace(/\\/g, '/')}`;
}

function createChromeStorage(initialState = {}) {
    const state = { ...initialState };

    return {
        runtime: {
            lastError: null
        },
        storage: {
            local: {
                get(keys, callback) {
                    if (Array.isArray(keys)) {
                        const result = {};
                        keys.forEach((key) => {
                            result[key] = state[key];
                        });
                        callback(result);
                        return;
                    }

                    callback({ [keys]: state[keys] });
                },
                set(payload, callback = () => {}) {
                    Object.assign(state, payload);
                    callback();
                }
            }
        },
        __state: state
    };
}

async function loadStorageService(mockChrome) {
    global.chrome = mockChrome;
    const modulePath = `${pathToFileUrl(path.join(repoRoot, 'chrome/services/storage-service.js'))}?t=${Date.now()}`;
    return import(modulePath);
}

async function testUpsertSummaryMessageAddsAndUpdatesSingleSummary() {
    const chromeMock = createChromeStorage({
        pageMessages_7: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'hello' }
        ]
    });
    const service = await loadStorageService(chromeMock);

    let firstResult = await service.upsertSummaryMessage(7, {
        role: 'assistant',
        type: 'summary',
        content: 'first summary'
    });

    assert.deepEqual(firstResult, [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'assistant', type: 'summary', content: 'first summary' },
        { role: 'user', content: 'hello' }
    ]);

    let secondResult = await service.upsertSummaryMessage(7, {
        role: 'assistant',
        type: 'summary',
        content: 'updated summary'
    });

    assert.deepEqual(secondResult, [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'assistant', type: 'summary', content: 'updated summary' },
        { role: 'user', content: 'hello' }
    ]);
}

async function testReplaceAndClearChatHistoryUseTabScopedStorage() {
    const chromeMock = createChromeStorage({
        pageMessages_11: [{ role: 'user', content: 'legacy' }]
    });
    const service = await loadStorageService(chromeMock);

    const replaced = await service.replaceChatHistory(11, [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'assistant', content: 'fresh start' }
    ]);
    assert.equal(replaced.length, 2);

    const cleared = await service.clearChatHistory(11);
    assert.deepEqual(cleared, []);
    assert.deepEqual(chromeMock.__state.pageMessages_11, []);
}

async function testCompactMemoryRoundTripAndTrimPreservesSummary() {
    const chromeMock = createChromeStorage({
        pageMessages_3: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'assistant', type: 'summary', content: 'page summary' },
            ...Array.from({ length: 60 }, (_, index) => ({
                role: index % 2 === 0 ? 'user' : 'assistant',
                content: `message-${index}`
            }))
        ],
        pageCache: {
            3: {
                url: 'https://example.com/article',
                title: 'Example',
                content: 'article'
            }
        }
    });
    const service = await loadStorageService(chromeMock);

    const appended = await service.appendMessage(3, { role: 'assistant', content: 'tail' });
    assert.equal(appended.some((message) => message.type === 'summary' && message.content === 'page summary'), true);
    assert.equal(appended.length <= 50, true);

    await service.saveCompactMemory(3, 'memory');
    const memory = await service.loadCompactMemory(3);
    assert.equal(memory, 'memory');
}

async function run() {
    await testUpsertSummaryMessageAddsAndUpdatesSingleSummary();
    await testReplaceAndClearChatHistoryUseTabScopedStorage();
    await testCompactMemoryRoundTripAndTrimPreservesSummary();
    console.log('storage service chat memory: ok');
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
