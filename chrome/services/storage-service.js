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
    openaiBaseUrl: 'https://api.openai.com/v1',
    openaiModel: 'gpt-3.5-turbo',
    openaiCustomModel: '',
};

export let currentSettings = { ...defaultSettings };
export let pageCache = {};
export let structuredPageCache = {};

export function updateCurrentSettingsLocally(settings) {
    currentSettings = settings;
}

export function loadSettings() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['settings', 'pageCache', 'structuredPageCache'], (result) => {
            if (result.settings) {
                currentSettings = { ...defaultSettings, ...result.settings };
            }
            if (result.pageCache) pageCache = result.pageCache;
            if (result.structuredPageCache) structuredPageCache = result.structuredPageCache;
            resolve(currentSettings);
        });
    });
}

export function saveSettings(settings) {
    return new Promise((resolve) => {
        const newSettings = { ...currentSettings, ...settings };
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
    
    const previousUrl = pageCache[tabId] ? pageCache[tabId].url : null;
    const isNewUrl = previousUrl && previousUrl !== url && previousUrl !== 'about:blank';
    
    if (isNewUrl) {
        console.log(`Tab ${tabId} URL changed from ${previousUrl} to ${url}. Clearing old chats.`);
        const newHistory = [
            { role: 'system', content: 'You are a helpful assistant.' },
            { 
                id: Date.now(),
                role: 'assistant', 
                content: `🚀 页面已切换到新内容: **${title}**\n\n您现在可以针对新页面点击摘要，或直接发送问题。`, 
                ts: Date.now() 
            }
        ];
        saveChatHistory(tabId, newHistory);
        
        chrome.runtime.sendMessage({
            action: 'pageNavigated',
            tabId: tabId,
            previousUrl: previousUrl,
            newUrl: url,
            newTitle: title,
            timestamp: Date.now()
        }).catch(() => {});
    }
    
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
            resolve(result['pageMessages_' + tabId] || []);
        });
    });
}

export async function appendMessage(tabId, msg) {
    let list = await loadChatHistory(tabId);
    list.push(msg);
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
