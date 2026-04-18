import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

async function loadGuards() {
    return import(pathToFileUrl(path.join(repoRoot, 'src/js/shared/runtime-guards.mjs')));
}

async function loadContentRecovery() {
    return import(pathToFileUrl(path.join(repoRoot, 'src/js/shared/content-script-recovery.mjs')));
}

async function loadOpenAIDefaults() {
    return import(pathToFileUrl(path.join(repoRoot, 'src/js/shared/openai-defaults.mjs')));
}

function pathToFileUrl(filePath) {
    const normalized = filePath.replace(/\\/g, '/');
    return `file:///${normalized}`;
}

async function testNormalizeSettingsRecoversFromBooleanStorage() {
    const { normalizeSettings } = await loadGuards();
    const defaults = {
        theme: 'light',
        systemPrompt: 'You are a helpful assistant.',
        systemPrompts: [
            {
                id: 'default',
                name: 'Default Prompt',
                content: 'You are a helpful assistant.',
                isDefault: true,
                isActive: true,
                icon: 'assistant'
            }
        ],
        activePromptId: 'default'
    };

    const normalized = normalizeSettings(true, defaults);

    assert.equal(normalized.theme, 'light');
    assert.equal(normalized.activePromptId, 'default');
    assert.ok(Array.isArray(normalized.systemPrompts));
    assert.equal(normalized.systemPrompts.length, 1);
    assert.equal(normalized.systemPrompts[0].content, 'You are a helpful assistant.');
}

async function testEnsureMessageListReturnsSafeArray() {
    const { ensureMessageList } = await loadGuards();

    assert.deepEqual(ensureMessageList(undefined), []);
    assert.deepEqual(ensureMessageList(true), []);
    assert.deepEqual(
        ensureMessageList([{ role: 'user', content: 'hi' }, null, { role: 'assistant', content: 'ok' }]),
        [
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: 'ok' }
        ]
    );
}

async function testSendRuntimeMessageSafelySwallowsMissingReceiver() {
    const { sendRuntimeMessageSafely } = await loadGuards();
    let invoked = false;

    const result = await sendRuntimeMessageSafely(() => {
        invoked = true;
        return Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'));
    }, { action: 'summaryStream' });

    assert.equal(invoked, true);
    assert.deepEqual(result, { delivered: false, error: 'Could not establish connection. Receiving end does not exist.' });
}

function testBackgroundServiceWorkerAvoidsDynamicImport() {
    const backgroundPath = path.join(repoRoot, 'chrome/background.js');
    const source = fs.readFileSync(backgroundPath, 'utf8');

    assert.equal(
        source.includes('import('),
        false,
        'MV3 service worker modules must not use dynamic import() at runtime'
    );
}

async function testRecoverableMissingReceiverDetection() {
    const { isRecoverableConnectionError, isInjectableTabUrl } = await loadContentRecovery();

    assert.equal(
        isRecoverableConnectionError('Could not establish connection. Receiving end does not exist.'),
        true
    );
    assert.equal(
        isRecoverableConnectionError('Some unrelated error'),
        false
    );
    assert.equal(isInjectableTabUrl('https://example.com/article'), true);
    assert.equal(isInjectableTabUrl('chrome://extensions'), false);
}

async function testOpenAIDefaultsMatchRequestedConfig() {
    const {
        DEFAULT_OPENAI_BASE_URL,
        OPENAI_BASE_URL_PLACEHOLDER,
        DEFAULT_OPENAI_MODEL,
        DEFAULT_OPENAI_MODELS
    } = await loadOpenAIDefaults();
    const { normalizeSettings } = await loadGuards();

    assert.equal(DEFAULT_OPENAI_BASE_URL, '');
    assert.equal(OPENAI_BASE_URL_PLACEHOLDER, 'https://tokenx24.com/v1');
    assert.equal(DEFAULT_OPENAI_MODEL, 'gpt-5.4');
    assert.deepEqual(
        DEFAULT_OPENAI_MODELS.map((model) => model.id),
        ['gpt-5.4', 'gpt-4.1', 'custom']
    );

    const normalized = normalizeSettings({});
    assert.equal(normalized.openaiBaseUrl, '');
    assert.equal(normalized.openaiModel, 'gpt-5.4');
}

async function testSettingsPatchKeepsAndUpdatesApiKey() {
    const { mergeSettingsPatch } = await loadGuards();

    const existing = {
        theme: 'dark',
        openaiApiKey: 'sk-old',
        openaiBaseUrl: 'https://tokenx24.com/v1',
        openaiModel: 'gpt-5.4'
    };

    const partial = mergeSettingsPatch(existing, { theme: 'light' });
    assert.equal(partial.openaiApiKey, 'sk-old');
    assert.equal(partial.theme, 'light');

    const updated = mergeSettingsPatch(existing, { openaiApiKey: 'sk-new' });
    assert.equal(updated.openaiApiKey, 'sk-new');
}

function testManifestAllowsRuntimeRecoveryInjection() {
    const manifestPath = path.join(repoRoot, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.equal(
        Array.isArray(manifest.permissions) && manifest.permissions.includes('scripting'),
        true,
        'manifest permissions must include scripting for content-script recovery'
    );
}

function testSettingsClientUsesStorageAuthority() {
    const source = fs.readFileSync(path.join(repoRoot, 'src/js/config/settings.js'), 'utf8');

    assert.equal(source.includes("action: 'getSettings'"), false, 'settings client should not request settings via runtime messaging');
    assert.equal(source.includes("action: 'updateSettings'"), false, 'settings client should not update settings via runtime messaging');
    assert.equal(source.includes('chrome.storage.local.get'), true);
    assert.equal(source.includes('chrome.storage.local.set'), true);
}

function testOpenAIRequestsDoNotUseSharedBaseUrlFallback() {
    const backgroundProvider = fs.readFileSync(path.join(repoRoot, 'chrome/services/llm-provider.js'), 'utf8');
    const sidePanelProvider = fs.readFileSync(path.join(repoRoot, 'src/js/services/openai-service.js'), 'utf8');

    assert.equal(
        backgroundProvider.includes('settings.openaiBaseUrl || DEFAULT_OPENAI_BASE_URL'),
        false,
        'background provider should only use settings.openaiBaseUrl'
    );
    assert.equal(
        sidePanelProvider.includes('baseUrl || DEFAULT_OPENAI_BASE_URL'),
        false,
        'side panel provider should not fall back to shared default base URL'
    );
}

function testManifestUsesSingleContentExtractionScript() {
    const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'));
    const contentScripts = manifest.content_scripts?.[0]?.js || [];

    assert.equal(contentScripts.includes('src/js/content-script.js'), true);
    assert.equal(contentScripts.includes('src/js/content/extractor.js'), false, 'legacy extractor protocol should be removed from manifest');
}

function testBackgroundUsesSingleSummaryProtocol() {
    const background = fs.readFileSync(path.join(repoRoot, 'chrome/background.js'), 'utf8');

    assert.equal(background.includes("import '../src/js/background/page-cache-listener.js';"), false);
    assert.equal(background.includes("request.action === 'pageContent'"), true);
    assert.equal(background.includes("request.action === 'getSettings'"), false);
    assert.equal(background.includes("request.action === 'updateSettings'"), false);
}

async function run() {
    await testNormalizeSettingsRecoversFromBooleanStorage();
    await testEnsureMessageListReturnsSafeArray();
    await testSendRuntimeMessageSafelySwallowsMissingReceiver();
    await testRecoverableMissingReceiverDetection();
    await testOpenAIDefaultsMatchRequestedConfig();
    await testSettingsPatchKeepsAndUpdatesApiKey();
    testBackgroundServiceWorkerAvoidsDynamicImport();
    testManifestAllowsRuntimeRecoveryInjection();
    testSettingsClientUsesStorageAuthority();
    testOpenAIRequestsDoNotUseSharedBaseUrlFallback();
    testManifestUsesSingleContentExtractionScript();
    testBackgroundUsesSingleSummaryProtocol();
    console.log('runtime regressions: ok');
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
