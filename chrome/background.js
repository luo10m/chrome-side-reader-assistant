import './services/storage-service.js';
import { 
    currentSettings, loadSettings, updateCurrentSettingsLocally,
    upsertPageCache, pageCache, structuredPageCache, updateStructuredPageCache,
    loadChatHistory, saveChatHistory, appendMessage,
    replaceChatHistory, clearChatHistory, upsertSummaryMessage,
    loadCompactMemory, saveCompactMemory
} from './services/storage-service.js';
import { summarizeWithOpenAI, fetchTranslationWithOpenAI, compactConversationWithOpenAI } from './services/llm-provider.js';
import {
    CONTENT_SCRIPT_RECOVERY_FILES,
    isInjectableTabUrl,
    isRecoverableConnectionError
} from '../src/js/shared/content-script-recovery.mjs';
import { getMessagesForCompactMemory } from '../src/js/shared/chat-context.mjs';

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
        updateCurrentSettingsLocally(changes.settings.newValue);
    }
});

// Implement SPA Navigation Listener
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (details.frameId === 0) { // Only main frame
        console.log("SPA Navigation detected via webNavigation. URL:", details.url);
        chrome.tabs.sendMessage(details.tabId, { action: 'extractPageContent' }).catch(() => {});
    }
});

function generateContentHash(content) {
    if (!content) return '';

    let hash = 0;
    const str = typeof content === 'string' ? content : JSON.stringify(content);
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash &= hash;
    }
    return hash.toString(16);
}

function detectContentChange(newData, oldData) {
    if (!oldData) {
        return { hasChange: false, diffCount: 0 };
    }

    const timeDiff = (newData.timestamp || 0) - (oldData.timestamp || 0);
    if (timeDiff <= 0) {
        return { hasChange: false, diffCount: 0 };
    }

    const contentChanged = generateContentHash(newData.content || '') !== generateContentHash(oldData.content || '');
    const newCount = newData.commentCount || 0;
    const oldCount = oldData.commentCount || 0;
    const countDiff = Math.max(0, newCount - oldCount);

    return {
        hasChange: contentChanged || countDiff > 0,
        diffCount: Math.max(countDiff, contentChanged ? 1 : 0)
    };
}

function mergePageCacheData(request, previousData = {}) {
    const merged = {
        ...previousData,
        url: request.url,
        title: request.title || previousData.title || '',
        content: request.content,
        timestamp: request.timestamp || Date.now()
    };

    if (request.excerpt) merged.excerpt = request.excerpt;
    if (request.byline) merged.byline = request.byline;
    if (request.siteName) merged.siteName = request.siteName;

    if (request.richData) {
        merged.richData = request.richData;
        merged.isTwitter = true;
        merged.commentCount = request.richData.replyCount || request.commentCount || 0;
        if (request.richData.images?.length) {
            merged.hasImages = true;
            merged.imageCount = request.richData.images.length;
            merged.images = request.richData.images;
        }
        if (request.richData.videos?.length) {
            merged.hasVideos = true;
            merged.videoCount = request.richData.videos.length;
            merged.videos = request.richData.videos;
        }
        if (request.richData.author) {
            merged.author = request.richData.author;
        }
        if (request.richData.html) {
            merged.htmlContent = request.richData.html;
        }
    } else {
        merged.commentCount = request.commentCount || previousData.commentCount || 0;
    }

    return merged;
}

async function handlePageContent(request, sender, sendResponse) {
    try {
        const tabId = sender.tab ? sender.tab.id : null;
        if (!tabId || !request.content) {
            sendResponse({ success: false, error: 'No content or tab ID provided' });
            return;
        }

        const oldData = pageCache[tabId];
        const cacheData = mergePageCacheData(request, oldData);
        const previousUrl = oldData?.url || null;
        const isNewUrl = previousUrl && previousUrl !== cacheData.url && previousUrl !== 'about:blank';

        if (isNewUrl) {
            console.log(`Tab ${tabId} URL changed from ${previousUrl} to ${cacheData.url}. Clearing old chats.`);
            saveChatHistory(tabId, [
                { role: 'system', content: 'You are a helpful assistant.' },
                {
                    id: Date.now(),
                    role: 'assistant',
                    content: `🚀 页面已切换到新内容: **${cacheData.title}**\n\n您现在可以针对新页面点击摘要，或直接发送问题。`,
                    ts: Date.now()
                }
            ]);
            await saveCompactMemory(tabId, '', { compactMemorySourceCount: 0 });
            cacheData.summary = '';
            cacheData.summaryTime = null;
            cacheData.compactMemory = '';
            cacheData.compactMemoryUpdatedAt = null;
        }

        upsertPageCache(tabId, cacheData.url, cacheData.title, cacheData.content);
        pageCache[tabId] = {
            ...pageCache[tabId],
            ...cacheData
        };
        await chrome.storage.local.set({ pageCache });

        const { hasChange, diffCount } = detectContentChange(pageCache[tabId], oldData);
        chrome.runtime.sendMessage({
            action: 'pageNavigated',
            tabId,
            previousUrl,
            newUrl: cacheData.url,
            newTitle: cacheData.title,
            isTwitter: cacheData.isTwitter || false,
            hasNewContent: hasChange,
            timestamp: cacheData.timestamp
        }).catch(() => {});

        if (hasChange && diffCount > 0) {
            try {
                const newBadgeCount = await badgeManager.updateBadge(tabId, diffCount);
                const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!activeTab || activeTab.id !== tabId) {
                    notificationManager.createNotification(tabId, cacheData.title || '新内容', diffCount);
                }
                console.log(`[pageCache] 检测到新内容，更新Badge: ${newBadgeCount}`);
            } catch (error) {
                console.error('处理内容变化时出错:', error);
            }
        }

        sendResponse({ success: true });
    } catch (error) {
        console.error('处理 pageContent 失败:', error);
        sendResponse({ success: false, error: error.message || 'Failed to update page cache' });
    }
}

function requestSelectedText(tabId) {
    return new Promise((resolve) => {
        try {
            chrome.tabs.sendMessage(tabId, { action: 'getSelectedText' }, (response) => {
                const error = chrome.runtime.lastError;
                if (error) {
                    resolve({ success: false, error: error.message, text: '' });
                    return;
                }

                resolve({
                    success: true,
                    text: typeof response?.text === 'string' ? response.text : ''
                });
            });
        } catch (error) {
            resolve({ success: false, error: error.message || String(error), text: '' });
        }
    });
}

async function updateCompactMemoryForTab(tabId) {
    const history = await loadChatHistory(tabId);
    const archivedMessages = getMessagesForCompactMemory(history);
    const archivedCount = archivedMessages.length;
    const existingCompactedCount = pageCache?.[tabId]?.compactMemorySourceCount || 0;

    if (archivedCount === 0) {
        await saveCompactMemory(tabId, '', { compactMemorySourceCount: 0 });
        return { success: true, compactMemory: '' };
    }

    const settings = await loadSettings();
    if (!settings.openaiApiKey) {
        return { success: false, error: 'OpenAI API key is not configured', compactMemory: '' };
    }

    const existingMemory = await loadCompactMemory(tabId);
    const messagesToCompact = archivedCount > existingCompactedCount
        ? archivedMessages.slice(existingCompactedCount)
        : [];

    if (messagesToCompact.length === 0) {
        return { success: true, compactMemory: existingMemory };
    }

    const compactMemory = await compactConversationWithOpenAI(existingMemory, messagesToCompact, settings);
    await saveCompactMemory(tabId, compactMemory, { compactMemorySourceCount: archivedCount });

    return { success: true, compactMemory };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getChatHistory') {
        loadChatHistory(request.tabId).then(list => sendResponse({ success: true, list }));
        return true;
    }
    else if (request.action === 'appendChatMessage') {
        appendMessage(request.tabId, request.message).then(list => sendResponse({ success: true, list }));
        return true;
    }
    else if (request.action === 'replaceChatHistory') {
        replaceChatHistory(request.tabId, request.messages).then((list) => sendResponse({ success: true, list }));
        return true;
    }
    else if (request.action === 'clearChatHistory') {
        clearChatHistory(request.tabId)
            .then(async (list) => {
                await saveCompactMemory(request.tabId, '', { compactMemorySourceCount: 0 });
                sendResponse({ success: true, list });
            });
        return true;
    }
    else if (request.action === 'upsertSummaryMessage') {
        upsertSummaryMessage(request.tabId, request.summaryMessage).then((list) => sendResponse({ success: true, list }));
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
                summary: tabInfo.summary || '',
                compactMemory: tabInfo.compactMemory || ''
            });
        });
        return true;
    }
    else if (request.action === 'getCompactMemory') {
        loadCompactMemory(request.tabId).then((compactMemory) => sendResponse({ success: true, compactMemory }));
        return true;
    }
    else if (request.action === 'updateCompactMemory') {
        updateCompactMemoryForTab(request.tabId)
            .then((result) => sendResponse(result))
            .catch((error) => sendResponse({ success: false, error: error.message || String(error), compactMemory: '' }));
        return true;
    }
    else if (request.action === 'getSelectedPageText') {
        requestSelectedText(request.tabId)
            .then((result) => sendResponse({ success: result.success, text: result.text || '', error: result.error }))
            .catch((error) => sendResponse({ success: false, text: '', error: error.message || String(error) }));
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
        handlePageContent(request, sender, sendResponse);
        return true;
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

function requestPageExtraction(tabId) {
    return new Promise((resolve) => {
        try {
            chrome.tabs.sendMessage(tabId, { action: 'extractPageContent' }, (response) => {
                const error = chrome.runtime.lastError;
                if (error) {
                    resolve({ success: false, error: error.message });
                    return;
                }

                if (response && response.success) {
                    resolve({ success: true });
                    return;
                }

                resolve({
                    success: false,
                    error: response?.error || 'Content script did not acknowledge extraction request'
                });
            });
        } catch (error) {
            resolve({ success: false, error: error.message || String(error) });
        }
    });
}

async function recoverContentScript(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !isInjectableTabUrl(tab.url || '')) {
            return {
                success: false,
                error: '当前页面不支持内容提取，请切换到普通网页后重试'
            };
        }

        await chrome.scripting.executeScript({
            target: { tabId },
            files: CONTENT_SCRIPT_RECOVERY_FILES
        });

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error.message || '无法重新注入页面脚本'
        };
    }
}

async function requestPageExtractionWithRecovery(tabId) {
    const firstAttempt = await requestPageExtraction(tabId);
    if (firstAttempt.success) {
        return firstAttempt;
    }

    if (!isRecoverableConnectionError(firstAttempt.error)) {
        return firstAttempt;
    }

    const recovery = await recoverContentScript(tabId);
    if (!recovery.success) {
        return recovery;
    }

    return requestPageExtraction(tabId);
}

async function waitForPageCache(tabId, minTimestamp, timeoutMs = 5000, intervalMs = 200) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const cached = pageCache[tabId];
        if (cached && cached.content && (cached.timestamp || 0) >= minTimestamp) {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    return false;
}

async function processSummarizeRequest(tabId, sendResponse) {
    try {
        sendResponse({ success: true });

        const requestStartedAt = Date.now();
        const extractionResult = await requestPageExtractionWithRecovery(tabId);

        if (!extractionResult.success) {
            if (pageCache[tabId] && pageCache[tabId].content) {
                await processSummaryWithSettings(tabId);
            } else {
                const errorMessage = extractionResult.error || '无法通讯提取内容且无缓存';
                chrome.runtime.sendMessage({ action: 'summaryError', error: errorMessage }).catch(() => {});
            }
            return;
        }

        const cacheReady = await waitForPageCache(tabId, requestStartedAt);
        if (!cacheReady) {
            if (pageCache[tabId] && pageCache[tabId].content) {
                await processSummaryWithSettings(tabId);
            } else {
                chrome.runtime.sendMessage({ action: 'summaryError', error: '提取内容后未能正确缓存' }).catch(() => {});
            }
            return;
        }

        await processSummaryWithSettings(tabId);
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
