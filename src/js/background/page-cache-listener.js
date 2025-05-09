/**
 * 页面缓存监听器
 * 接收内容脚本提取的页面内容并写入 pageCache
 * 支持 Twitter/X.com 富媒体内容
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'extractedPageContent' && sender.tab) {
        const tabId = sender.tab.id;
        const cacheKey = 'pageCache';
        chrome.storage.local.get([cacheKey], result => {
            const pageCache = result[cacheKey] || {};
            
            // 基础缓存数据
            const cacheData = {
                url: msg.url,
                title: msg.title,
                content: msg.content,
                timestamp: msg.timestamp
            };
            
            // 如果有富媒体数据（Twitter/X.com），添加到缓存
            if (msg.richData) {
                cacheData.richData = msg.richData;
                cacheData.isTwitter = true;
                
                // 增强内容描述，添加图片和视频信息
                if (msg.richData.images && msg.richData.images.length > 0) {
                    cacheData.hasImages = true;
                    cacheData.imageCount = msg.richData.images.length;
                    cacheData.images = msg.richData.images;
                }
                
                if (msg.richData.videos && msg.richData.videos.length > 0) {
                    cacheData.hasVideos = true;
                    cacheData.videoCount = msg.richData.videos.length;
                    cacheData.videos = msg.richData.videos;
                }
                
                // 添加作者信息
                if (msg.richData.author) {
                    cacheData.author = msg.richData.author;
                }
                
                // 添加HTML格式的内容
                if (msg.richData.html) {
                    cacheData.htmlContent = msg.richData.html;
                }
                
                console.log('[pageCache] 已更新Twitter富媒体内容:', tabId, msg.url);
            }
            
            // 更新缓存
            pageCache[tabId] = cacheData;
            
            chrome.storage.local.set({ [cacheKey]: pageCache }, () => {
                console.log('[pageCache] 已更新:', tabId, msg.url);
                // 通知 popup / ai-chat
                chrome.runtime.sendMessage({
                    action: 'pageNavigated',
                    tabId,
                    newUrl: msg.url,
                    newTitle: msg.title,
                    isTwitter: cacheData.isTwitter || false
                });
            });
        });
    }
});
