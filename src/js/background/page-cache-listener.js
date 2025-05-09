/**
 * 页面缓存监听器
 * 接收内容脚本提取的页面内容并写入 pageCache
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'extractedPageContent' && sender.tab) {
        const tabId = sender.tab.id;
        const cacheKey = 'pageCache';
        chrome.storage.local.get([cacheKey], result => {
            const pageCache = result[cacheKey] || {};
            pageCache[tabId] = {
                url: msg.url,
                title: msg.title,
                content: msg.content,
                timestamp: msg.timestamp
            };
            chrome.storage.local.set({ [cacheKey]: pageCache }, () => {
                console.log('[pageCache] 已更新:', tabId, msg.url);
                // 通知 popup / ai-chat
                chrome.runtime.sendMessage({
                    action: 'pageNavigated',
                    tabId,
                    newUrl: msg.url,
                    newTitle: msg.title
                });
            });
        });
    }
});
