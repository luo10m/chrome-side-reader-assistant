/**
 * 通用页面正文提取 + SPA 导航侦测
 * 依赖：Mozilla Readability（如果需要可以自行打包）
 */
(function () {
    // ————————————————————————
    // 1. 辅助：提取正文
    // ————————————————————————
    function getMainContent() {
        // 针对特殊站点可在此先行匹配
        const hostname = location.hostname;

        // 1) Twitter / X：提取单条推文
        if (hostname.match(/(^|\.)x\.com$/) || hostname.match(/(^|\.)twitter\.com$/)) {
            const article = document.querySelector('article div[data-testid="tweetText"]');
            if (article) return article.innerText.trim();
        }

        // 2) 其它站点：用 Readability
        try {
            const docClone = document.cloneNode(true);
            const reader = new Readability(docClone);
            const parsed = reader.parse();
            if (parsed && parsed.textContent) {
                return parsed.textContent.trim();
            }
        } catch (e) {
            console.debug('Readability 解析失败:', e);
        }

        // 3) 兜底：全文
        return document.body ? document.body.innerText.trim() : '';
    }

    // ————————————————————————
    // 2. 上报到后台
    // ————————————————————————
    function reportContent(reason = 'initial') {
        const payload = {
            action: 'extractedPageContent',
            reason,
            url: location.href,
            title: document.title,
            content: getMainContent(),
            timestamp: Date.now()
        };
        chrome.runtime.sendMessage(payload);
    }

    // ————————————————————————
    // 3. 监听历史记录变化（pushState / replaceState）
    // ————————————————————————
    (function hackHistory() {
        const rawPush = history.pushState;
        const rawReplace = history.replaceState;

        function wrapper(original) {
            return function () {
                const ret = original.apply(this, arguments);
                window.dispatchEvent(new Event('spa:navigation'));
                return ret;
            };
        }
        history.pushState = wrapper(rawPush);
        history.replaceState = wrapper(rawReplace);
    })();

    // ————————————————————————
    // 4. MutationObserver（应对 React 之类异步内容）
    // ————————————————————————
    let lastMutation = Date.now();
    const mo = new MutationObserver(() => {
        lastMutation = Date.now();
    });
    mo.observe(document, { childList: true, subtree: true });

    // ————————————————————————
    // 5. 定时检测：URL 或 DOM 是否真正变化
    // ————————————————————————
    let lastUrl = location.href;
    let lastSent = 0;
    setInterval(() => {
        const now = Date.now();
        const urlChanged = location.href !== lastUrl;
        const domChangedRecently = now - lastMutation < 800; // 0.8 秒内有变更

        if (urlChanged || (domChangedRecently && now - lastSent > 1500)) {
            lastUrl = location.href;
            lastSent = now;
            reportContent(urlChanged ? 'urlChange' : 'domChange');
        }
    }, 1000);

    // ————————————————————————
    // 6. popstate 和自定义事件
    // ————————————————————————
    window.addEventListener('popstate', () => reportContent('popstate'));
    window.addEventListener('spa:navigation', () => reportContent('historyAPI'));

    // 首次进入页面立即上报
    reportContent('initial');
})();
