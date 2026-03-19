import './services/storage-service.js';
import { 
    currentSettings, defaultSettings, loadSettings, saveSettings, 
    upsertPageCache, pageCache, structuredPageCache, updateStructuredPageCache,
    loadChatHistory, saveChatHistory, appendMessage 
} from './services/storage-service.js';
import { summarizeWithOpenAI, fetchTranslationWithOpenAI } from './services/llm-provider.js';

import '../src/js/background/page-cache-listener.js';

class BadgeManager {
    constructor() {
        this.diffCounts = {};
        this.notificationDebounce = {};
        this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }
    
    async updateBadge(tabId, increment = 1) {
        const key = `badge_${tabId}`;
        const result = await chrome.storage.local.get([key]);
        let count = parseInt(result[key] || '0') + increment;
        await chrome.storage.local.set({ [key]: count });
        await chrome.action.setBadgeText({ tabId, text: count > 0 ? (count > 99 ? '99+' : count.toString()) : '' });
        if (count > 0) {
            await chrome.action.setBadgeBackgroundColor({ tabId, color: '#FF4D4F' });
        }
        return count;
    }
    
    async clearBadge(tabId) {
        const key = `badge_${tabId}`;
        await chrome.storage.local.remove(key);
        await chrome.action.setBadgeText({ tabId, text: '' });
        if (this.notificationDebounce[tabId]) {
            clearTimeout(this.notificationDebounce[tabId]);
            delete this.notificationDebounce[tabId];
        }
    }
    
    async cleanup() {
        const tabs = await chrome.tabs.query({});
        const activeTabIds = new Set(tabs.map(t => t.id));
        const allKeys = await chrome.storage.local.get(null);
        for (const [key] of Object.entries(allKeys)) {
            if (key.startsWith('badge_')) {
                const tabId = parseInt(key.split('_')[1]);
                if (!isNaN(tabId) && !activeTabIds.has(tabId)) {
                    await chrome.storage.local.remove(key);
                }
            }
        }
    }
}

class NotificationManager {
    constructor() {
        this.debounceMap = {};
    }
    async createNotification(tabId, title, diffCount) {
        if (this.debounceMap[tabId]) clearTimeout(this.debounceMap[tabId]);
        this.debounceMap[tabId] = setTimeout(async () => {
            try {
                await chrome.notifications.create(`page-update-${tabId}`, {
                    type: 'basic',
                    iconUrl: 'assets/icon48.png',
                    title: '页面有新内容',
                    message: `${diffCount} 条新更新：${title}`,
                    priority: 1
                });
            } catch (error) {
                console.error('创建通知失败:', error);
            } finally {
                delete this.debounceMap[tabId];
            }
        }, 2000);
    }
}

const badgeManager = new BadgeManager();
const notificationManager = new NotificationManager();

chrome.notifications.onClicked.addListener(async (notificationId) => {
    if (notificationId.startsWith('page-update-')) {
        const tabId = parseInt(notificationId.split('-')[2]);
        if (!isNaN(tabId)) {
            try {
                await chrome.tabs.update(tabId, { active: true });
                await badgeManager.clearBadge(tabId);
                await chrome.notifications.clear(notificationId);
            } catch (error) {
                console.error('处理通知点击失败:', error);
            }
        }
    }
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));

loadSettings();

chrome.commands.onCommand.addListener((command) => {
    if (command === "_execute_action") {
        chrome.sidePanel.open().catch((error) => console.error("Error opening side panel:", error));
    }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.settings) {
        import('./services/storage-service.js').then(module => {
            module.updateCurrentSettingsLocally(changes.settings.newValue);
        });
    }
});

// Implement SPA Navigation Listener
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (details.frameId === 0) { // Only main frame
        console.log("SPA Navigation detected via webNavigation. URL:", details.url);
        chrome.tabs.sendMessage(details.tabId, { action: 'extractPageContent' }).catch(() => {});
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getChatHistory') {
        loadChatHistory(request.tabId).then(list => sendResponse({ success: true, list }));
        return true;
    }
    else if (request.action === 'appendChatMessage') {
        appendMessage(request.tabId, request.message).then(list => sendResponse({ success: true, list }));
        return true;
    }
    else if (request.action === 'getPageContext') {
        const tabId = request.tabId;
        if (!tabId) {
            sendResponse({ success: false, error: 'No tabId provided' });
            return true;
        }
        chrome.storage.local.get(['pageCache'], (result) => {
            const cache = result.pageCache || {};
            const tabInfo = cache[tabId];
            if (!tabInfo) {
                sendResponse({ success: false, error: 'No page cache found for this tab' });
                return;
            }
            sendResponse({
                success: true,
                title: tabInfo.title || '',
                url: tabInfo.url || '',
                content: tabInfo.content || '',
                summary: tabInfo.summary || ''
            });
        });
        return true;
    }
    else if (request.action === 'pageStructured') {
        const tabId = sender.tab ? sender.tab.id : null;
        if (tabId) {
            updateStructuredPageCache(tabId, {
                url: request.url,
                structuredData: request.structuredData,
                timestamp: request.timestamp || Date.now()
            });
            if (sendResponse) sendResponse({ success: true });
        }
        return false;
    }
    else if (request.action === 'pageContent') {
        const tabId = sender.tab ? sender.tab.id : null;
        if (tabId && request.content) {
            upsertPageCache(tabId, request.url, request.title, request.content);
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: 'No content or tab ID provided' });
        }
        return true;
    }
    else if (request.action === 'pageNavigated') {
        const tabId = sender.tab ? sender.tab.id : null;
        if (tabId) {
            chrome.runtime.sendMessage({
                action: 'pageNavigated',
                tabId: tabId,
                previousUrl: request.previousUrl,
                newUrl: request.newUrl,
                newTitle: request.newTitle,
                timestamp: request.timestamp
            });
            sendResponse({ success: true });
        }
        return false;
    }
    else if (request.action === 'summarizePage') {
        let targetTabId = request.tabId;
        if (!targetTabId) {
            chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
                if (tabs.length === 0) {
                    sendResponse({ success: false, error: 'No active tab found' });
                    return;
                }
                processSummarizeRequest(tabs[0].id, sendResponse);
            });
        } else {
            processSummarizeRequest(targetTabId, sendResponse);
        }
        return true;
    }
    else if (request.action === 'getSettings') {
        loadSettings().then(settings => sendResponse(settings));
        return true;
    }
    else if (request.action === 'updateSettings') {
        if (request.settings && request.settings.reset === true) {
            saveSettings(defaultSettings).then(settings => sendResponse(settings));
        } else {
            saveSettings(request.settings).then(settings => sendResponse(settings)).catch(err => sendResponse({error: err.message}));
        }
        return true;
    }
    else if (request.action === 'openSettings') {
        chrome.runtime.openOptionsPage();
        sendResponse({ success: true });
        return true;
    }
    else if (request.action === 'fetchTranslation') {
        const messageId = Date.now().toString();
        sendResponse({ messageId });
        fetchTranslationWithOpenAI(request.text, request.targetLang)
            .then(translatedText => {
                chrome.runtime.sendMessage({
                    action: 'translationResponse',
                    messageId,
                    success: true,
                    translatedText
                });
            })
            .catch(error => {
                chrome.runtime.sendMessage({
                    action: 'translationResponse',
                    messageId,
                    success: false,
                    error: error.message
                });
            });
        return true;
    }
    return true;
});

async function processSummarizeRequest(tabId, sendResponse) {
    try {
        if (!pageCache[tabId]) {
            sendResponse({ success: true });
            chrome.tabs.sendMessage(tabId, { action: 'extractPageContent' }, async (response) => {
                if (chrome.runtime.lastError || !response || !response.success) {
                    chrome.runtime.sendMessage({ action: 'summaryError', error: `无法提取页面内容` });
                } else {
                    setTimeout(async () => {
                        if (pageCache[tabId] && pageCache[tabId].content) {
                            await processSummaryWithSettings(tabId);
                        } else {
                            chrome.runtime.sendMessage({ action: 'summaryError', error: '提取内容后未能正确缓存' });
                        }
                    }, 1000);
                }
            });
            return;
        }
        
        const pageInfo = pageCache[tabId];
        if (!pageInfo || !pageInfo.content) {
            sendResponse({ success: false, error: 'No content available for summarization' });
            return;
        }

        sendResponse({ success: true });
        await processSummaryWithSettings(tabId);
    } catch (error) {
        chrome.runtime.sendMessage({ action: 'summaryError', error: error.message || 'Unknown error during summarization' });
    }
}

async function processSummaryWithSettings(tabId) {
    try {
        const pageInfo = pageCache[tabId];
        if (!pageInfo || !pageInfo.content) throw new Error('No content available for summarization');
        const settings = await loadSettings();
        if (settings.defaultAI === 'openai') {
            if (!settings.openaiApiKey) {
                chrome.runtime.sendMessage({ action: 'summaryError', error: 'OpenAI API key is not configured' });
                return;
            }
            await summarizeWithOpenAI(tabId, pageInfo.url, pageInfo.title, pageInfo.content, settings);
        } else {
            chrome.runtime.sendMessage({ action: 'summaryError', error: 'Only OpenAI is supported for summarization' });
        }
    } catch (error) {
        chrome.runtime.sendMessage({ action: 'summaryError', error: error.message || 'Unknown error during summarization' });
    }
}