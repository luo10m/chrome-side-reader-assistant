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

export const badgeManager = new BadgeManager();
export const notificationManager = new NotificationManager();
