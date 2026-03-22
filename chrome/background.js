import './services/storage-service.js';
import { 
    currentSettings, defaultSettings, loadSettings, saveSettings, 
    upsertPageCache, pageCache, structuredPageCache, updateStructuredPageCache,
    loadChatHistory, saveChatHistory, appendMessage 
} from './services/storage-service.js';
import { summarizeWithOpenAI, fetchTranslationWithOpenAI } from './services/llm-provider.js';

import '../src/js/background/page-cache-listener.js';

import { badgeManager, notificationManager } from './services/ui-managers.js';

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
            }).catch(() => {});
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
                }).catch(() => {});
            })
            .catch(error => {
                chrome.runtime.sendMessage({
                    action: 'translationResponse',
                    messageId,
                    success: false,
                    error: error.message
                }).catch(() => {});
            });
        return true;
    }
    return true;
});

async function processSummarizeRequest(tabId, sendResponse) {
    try {
        sendResponse({ success: true });
        
        // 无论如何，每次点击【开始摘要】时强制从当前 DOM 提取最新内容
        // 这解决了 SPA (单页应用) 网址变化后，React/Vue 尚未渲染就被缓存导致的“错把旧网页当新网页内容”的 Bug。
        chrome.tabs.sendMessage(tabId, { action: 'extractPageContent' }, async (response) => {
            if (chrome.runtime.lastError || !response || !response.success) {
                // 如果通信失败但存在旧缓存，则尝试使用旧缓存兜底
                if (pageCache[tabId] && pageCache[tabId].content) {
                    await processSummaryWithSettings(tabId);
                } else {
                    chrome.runtime.sendMessage({ action: 'summaryError', error: `无法通讯提取内容且无缓存` }).catch(() => {});
                }
            } else {
                // 等待 Content-Script 解析并发送 pageContent 事件后再行处理摘要
                setTimeout(async () => {
                    if (pageCache[tabId] && pageCache[tabId].content) {
                        await processSummaryWithSettings(tabId);
                    } else {
                        chrome.runtime.sendMessage({ action: 'summaryError', error: '提取内容后未能正确缓存' }).catch(() => {});
                    }
                }, 800);
            }
        });
    } catch (error) {
        chrome.runtime.sendMessage({ action: 'summaryError', error: error.message || 'Unknown error during summarization' }).catch(() => {});
    }
}

async function processSummaryWithSettings(tabId) {
    try {
        const pageInfo = pageCache[tabId];
        if (!pageInfo || !pageInfo.content) throw new Error('No content available for summarization');
        const settings = await loadSettings();
        if (settings.defaultAI === 'openai') {
            if (!settings.openaiApiKey) {
                chrome.runtime.sendMessage({ action: 'summaryError', error: 'OpenAI API key is not configured' }).catch(() => {});
                return;
            }
            await summarizeWithOpenAI(tabId, pageInfo.url, pageInfo.title, pageInfo.content, settings);
        } else {
            chrome.runtime.sendMessage({ action: 'summaryError', error: 'Only OpenAI is supported for summarization' }).catch(() => {});
        }
    } catch (error) {
        chrome.runtime.sendMessage({ action: 'summaryError', error: error.message || 'Unknown error during summarization' }).catch(() => {});
    }
}