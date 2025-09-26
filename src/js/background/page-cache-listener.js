/**
 * 页面缓存监听器
 * 接收内容脚本提取的页面内容并写入 pageCache
 * 支持 Twitter/X.com 富媒体内容
 * 检测内容变化并触发通知
 */

// 生成内容哈希值
function generateContentHash(content) {
    if (!content) return '';
    // 简单哈希函数，可以根据需要替换为更复杂的实现
    let hash = 0;
    const str = JSON.stringify(content);
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
}

// 检测内容变化
async function detectContentChange(tabId, newData, oldData) {
    if (!oldData) return { hasChange: false, diffCount: 0 };

    // 方法1：时间戳比较
    const timeDiff = (newData.timestamp || 0) - (oldData.timestamp || 0);
    if (timeDiff <= 0) return { hasChange: false, diffCount: 0 };

    // 方法2：内容哈希比较
    const newHash = generateContentHash(newData.content || '');
    const oldHash = generateContentHash(oldData.content || '');
    const contentChanged = newHash !== oldHash;

    // 方法3：元素数量比较（针对评论等）
    const newCount = newData.commentCount || 0;
    const oldCount = oldData.commentCount || 0;
    const countDiff = Math.max(0, newCount - oldCount);

    // 如果是 Twitter 且有新内容
    const isTwitterUpdate = newData.isTwitter &&
        (newData.richData?.tweetId !== oldData.richData?.tweetId ||
            newData.richData?.replyCount > oldData.richData?.replyCount);

    return {
        hasChange: contentChanged || countDiff > 0 || isTwitterUpdate,
        diffCount: Math.max(countDiff, contentChanged || isTwitterUpdate ? 1 : 0)
    };
}

// 主消息监听器
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
    if (msg.action === 'extractedPageContent' && sender.tab) {
        const tabId = sender.tab.id;
        const cacheKey = 'pageCache';

        // 获取当前缓存
        const result = await chrome.storage.local.get([cacheKey, 'badge_' + tabId]);
        const pageCache = result[cacheKey] || {};
        const currentBadgeCount = parseInt(result['badge_' + tabId] || '0');

        // 基础缓存数据
        const cacheData = {
            url: msg.url,
            title: msg.title || document.title,
            content: msg.content,
            timestamp: msg.timestamp || Date.now(),
            commentCount: msg.commentCount || 0
        };

        // 如果有富媒体数据（Twitter/X.com），添加到缓存
        if (msg.richData) {
            cacheData.richData = msg.richData;
            cacheData.isTwitter = true;
            cacheData.commentCount = msg.richData.replyCount || 0;

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

        // 检测内容变化
        const oldData = pageCache[tabId];
        const { hasChange, diffCount } = await detectContentChange(tabId, cacheData, oldData);

        // 更新缓存
        pageCache[tabId] = cacheData;

        await chrome.storage.local.set({ [cacheKey]: pageCache });
        console.log('[pageCache] 已更新:', tabId, msg.url);

        // 通知 popup / ai-chat
        chrome.runtime.sendMessage({
            action: 'pageNavigated',
            tabId,
            newUrl: msg.url,
            newTitle: msg.title || document.title,
            isTwitter: cacheData.isTwitter || false,
            hasNewContent: hasChange
        });

        // 如果检测到变化，更新 Badge
        if (hasChange && diffCount > 0) {
            try {
                // 更新 Badge
                const newBadgeCount = await badgeManager.updateBadge(tabId, diffCount);

                console.log(`[pageCache] 检测到新内容，更新Badge: ${newBadgeCount}`);
            } catch (error) {
                console.error('处理内容变化时出错:', error);
            }
        }
    }

    // 处理清除 Badge 的请求
    else if (msg.action === 'clearBadge' && sender.tab) {
        try {
            await badgeManager.clearBadge(sender.tab.id);
        } catch (error) {
            console.error('清除Badge失败:', error);
        }
    }

    // 处理获取当前 Badge 计数的请求
    else if (msg.action === 'getBadgeCount' && sender.tab) {
        try {
            const result = await chrome.storage.local.get([`badge_${sender.tab.id}`]);
            const count = parseInt(result[`badge_${sender.tab.id}`] || '0');
            return Promise.resolve({ count });
        } catch (error) {
            console.error('获取Badge计数失败:', error);
            return Promise.resolve({ count: 0 });
        }
    }

    return true; // 保持消息通道开放以支持异步响应
});
