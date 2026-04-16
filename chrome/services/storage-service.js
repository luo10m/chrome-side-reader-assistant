import { ensureMessageList, normalizeSettings } from '../../src/js/shared/runtime-guards.mjs';
import { DEFAULT_OPENAI_BASE_URL, DEFAULT_OPENAI_MODEL } from '../../src/js/shared/openai-defaults.mjs';

const MAX_PAGE_CACHE = 10;
export const defaultSettings = {
    theme: 'light',
    language: 'en',
    defaultAI: 'openai',
    useProxy: false,
    useStreaming: true,
    loadLastChat: true,
    systemPrompt: 'Act as an expert in [user topic]. Provide a detailed, clear, and helpful response to the following request: [user request or question]. Make sure your explanation is easy to understand and includes examples where relevant. You are a helpful assistant.',
    systemPrompts: [
        {
            id: 'default',
            name: 'Default Prompt',
            content: 'Act as an expert in [user topic]. Provide a detailed, clear, and helpful response to the following request: [user request or question]. Make sure your explanation is easy to understand and includes examples where relevant. You are a helpful assistant.',
            isDefault: true,
            isActive: true,
            icon: 'assistant'
        }
    ],
    activePromptId: 'default',
    openaiApiKey: '',
    openaiBaseUrl: DEFAULT_OPENAI_BASE_URL,
    openaiModel: DEFAULT_OPENAI_MODEL,
    openaiCustomModel: '',
};

export let currentSettings = normalizeSettings(defaultSettings, defaultSettings);
export let pageCache = {};
export let structuredPageCache = {};

export function updateCurrentSettingsLocally(settings) {
    currentSettings = normalizeSettings(settings, defaultSettings);
}

export function loadSettings() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['settings', 'pageCache', 'structuredPageCache'], (result) => {
            const normalizedSettings = normalizeSettings(result.settings, defaultSettings);
            currentSettings = normalizedSettings;

            if (typeof result.settings !== 'undefined') {
                const rawSettingsJson = JSON.stringify(result.settings);
                const normalizedSettingsJson = JSON.stringify(normalizedSettings);
                if (rawSettingsJson !== normalizedSettingsJson) {
                    chrome.storage.local.set({ settings: normalizedSettings });
                }
            }
            if (result.pageCache) pageCache = result.pageCache;
            if (result.structuredPageCache) structuredPageCache = result.structuredPageCache;
            resolve(currentSettings);
        });
    });
}

export function saveSettings(settings) {
    return new Promise((resolve) => {
        const safeSettings = settings && typeof settings === 'object' && !Array.isArray(settings)
            ? settings
            : {};
        const newSettings = normalizeSettings({ ...currentSettings, ...safeSettings }, defaultSettings);
        chrome.storage.local.set({ settings: newSettings }, () => {
            currentSettings = newSettings;
            resolve(currentSettings);
        });
    });
}

export function updatePageCacheRecord(tabId, data) {
    if (!tabId) return;
    pageCache[tabId] = {
        ...pageCache[tabId],
        ...data
    };
    chrome.storage.local.set({ pageCache });
}

export function updateStructuredPageCache(tabId, data) {
    if (!tabId) return;
    structuredPageCache[tabId] = data;
    chrome.storage.local.set({ structuredPageCache });
}

export function upsertPageCache(tabId, url, title, content) {
    if (!tabId) return;

    pageCache[tabId] = {
        ...pageCache[tabId],
        url,
        title,
        content,
        timestamp: Date.now()
    };
    const tabIds = Object.keys(pageCache);
    if (tabIds.length > MAX_PAGE_CACHE) {
        const sortedTabIds = tabIds.sort((a, b) => pageCache[a].timestamp - pageCache[b].timestamp);
        delete pageCache[sortedTabIds[0]];
    }
    chrome.storage.local.set({ pageCache });
    console.log(`Page cache updated for tab ${tabId}, total cache entries: ${Object.keys(pageCache).length}`);
}

export function saveChatHistory(tabId, messages) {
    chrome.storage.local.set({ ['pageMessages_' + tabId]: messages });
}

export function loadChatHistory(tabId) {
    return new Promise(resolve => {
        chrome.storage.local.get(['pageMessages_' + tabId], result => {
            resolve(ensureMessageList(result['pageMessages_' + tabId]));
        });
    });
}

export async function appendMessage(tabId, msg) {
    let list = ensureMessageList(await loadChatHistory(tabId));
    if (msg && typeof msg === 'object') {
        list.push(msg);
    }
    const MAX_MESSAGES_PER_TAB = 50;
    if (list.length > MAX_MESSAGES_PER_TAB) {
        const system = list.filter(m => m.role === 'system' || m.type === 'summary');
        const others = list.filter(m => m.role !== 'system' && m.type !== 'summary');
        list = [...system, ...others.slice(-MAX_MESSAGES_PER_TAB + system.length)];
    }
    saveChatHistory(tabId, list);
    return list;
}

export function cacheHistory(url, title, pageText, summaryText) {
    return new Promise((resolve) => {
        chrome.storage.local.get(['chatHistory'], (result) => {
            let history = result.chatHistory || [];
            const chatId = Date.now().toString();
            history.push({
                id: chatId,
                messages: [
                    { role: 'system', content: 'You are a helpful assistant.' },
                    { role: 'user', content: `URL: ${url}\nTitle: ${title}` },
                    { role: 'assistant', content: '我已收到您分享的网页链接。' },
                    { role: 'user', content: '请为我摘要这个网页的内容。' },
                    { role: 'assistant', content: summaryText }
                ],
                timestamp: Date.now()
            });
            chrome.storage.local.set({ chatHistory: history }, () => resolve());
        });
    });
}
