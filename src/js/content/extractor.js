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
            // 检查是否是单条推文页面
            if (location.pathname.match(/\/[^\/]+\/status\/\d+/)) {
                // 尝试提取推文
                const tweetTextEl = document.querySelector('article div[data-testid="tweetText"]');
                if (tweetTextEl) {
                    const article = tweetTextEl.closest('article');
                    if (article) {
                        // 提取推文内容
                        const text = tweetTextEl.innerText.trim();

                        // 提取图片
                        const images = [...article.querySelectorAll('div[data-testid="tweetPhoto"] img')]
                            .map(img => img.src)
                            .filter(src => src && !src.includes('placeholder'));

                        // 构建富文本内容
                        let richContent = text;

                        // 添加图片信息
                        if (images.length > 0) {
                            richContent += '\n\n图片：' + images.length + '张';
                        }

                        // 添加视频信息
                        const videos = article.querySelectorAll('video');
                        if (videos.length > 0) {
                            richContent += '\n\n视频：' + videos.length + '个';
                        }

                        return richContent;
                    }
                    return tweetTextEl.innerText.trim();
                }
            }
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

    // ————————————————————
    // 检查扩展上下文是否有效
    // ————————————————————
    function isExtensionContextValid() {
        // 1. Check if chrome object exists and is an object
        if (typeof chrome !== 'object' || chrome === null) {
            // console.debug('isExtensionContextValid: chrome object is missing or not an object.');
            return false;
        }
        // 2. Check if chrome.runtime exists and is an object
        if (typeof chrome.runtime !== 'object' || chrome.runtime === null) {
            // console.debug('isExtensionContextValid: chrome.runtime object is missing or not an object.');
            return false;
        }
        // 3. Check if chrome.runtime.getURL is a function (a benign API call to test context)
        if (typeof chrome.runtime.getURL !== 'function') {
            // console.debug('isExtensionContextValid: chrome.runtime.getURL is not a function.');
            return false;
        }

        try {
            // 4. Attempt to call a benign API. If it throws, the context is invalid.
            chrome.runtime.getURL('');
            return true;
        } catch (e) {
            // console.debug('isExtensionContextValid: Exception during chrome.runtime.getURL():', e.message);
            return false;
        }
    }

    // ————————————————————
    // 安全地发送消息到后台
    // ————————————————————
    function sendMessageSafely(payload) {
        if (!isExtensionContextValid()) {
            // console.debug('sendMessageSafely: Context invalid, bailing out.'); // Already logged by isExtensionContextValid
            return;
        }

        // At this point, we "believe" chrome.runtime and chrome.runtime.sendMessage are available.
        try {
            // Double-check sendMessage is a function before calling, as a final safeguard.
            if (typeof chrome.runtime.sendMessage === 'function') {
                chrome.runtime.sendMessage(payload, response => {
                    // This callback is asynchronous.
                    // The context could have become invalidated between the sendMessage call and this callback execution.
                    // Therefore, we must check chrome and chrome.runtime again before accessing chrome.runtime.lastError.
                    if (typeof chrome === 'object' && chrome !== null &&
                        typeof chrome.runtime === 'object' && chrome.runtime !== null &&
                        chrome.runtime.lastError) {
                        // Log specific lastError messages. "Extension context invalidated" can also appear here.
                        // console.debug('sendMessageSafely: chrome.runtime.lastError after sendMessage:', chrome.runtime.lastError.message);
                    }
                    // Optional: could log if context became invalid by the time callback was hit but no lastError (e.g. if( !isExtensionContextValid() && !chrome.runtime.lastError ) )
                });
            } else {
                // This case should ideally be caught by isExtensionContextValid earlier if sendMessage is missing.
                // console.debug('sendMessageSafely: chrome.runtime.sendMessage is not a function (unexpected).');
            }
        } catch (e) {
            // This 'catch' block is for SYNC errors thrown by the chrome.runtime.sendMessage call itself.
            // "Extension context invalidated" can sometimes be a synchronous error.
            // console.debug('sendMessageSafely: Synchronous exception during chrome.runtime.sendMessage call:', e.message);
        }
    }

    // ————————————————————————
    // 2. 上报到后台
    // ————————————————————————
    function reportContent(reason = 'initial') {
        // 检查扩展上下文是否有效
        if (!isExtensionContextValid()) return;

        // 基础内容
        const content = getMainContent();

        // 基础payload
        const payload = {
            action: 'extractedPageContent',
            reason,
            url: location.href,
            title: document.title,
            content: content,
            timestamp: Date.now()
        };

        // 针对Twitter/X.com的增强提取
        const hostname = location.hostname;
        if ((hostname.match(/(^|\.)x\.com$/) || hostname.match(/(^|\.)twitter\.com$/)) &&
            location.pathname.match(/\/[^\/]+\/status\/\d+/)) {

            // 尝试提取推文的富媒体内容
            extractTwitterRichContent().then(richData => {
                if (richData) {
                    // 合并富媒体数据到payload
                    payload.richData = richData;
                }
                // 发送到后台
                sendMessageSafely(payload);
            }).catch(() => {
                // 如果富媒体提取失败，仍然发送基础内容
                sendMessageSafely(payload);
            });
        } else {
            // 非Twitter页面，直接发送基础内容
            sendMessageSafely(payload);
        }
    }

    // ————————————————————————
    // 2.1 Twitter富媒体提取
    // ————————————————————————
    async function extractTwitterRichContent() {
        try {
            // 等待推文文本元素出现
            const textElement = await waitForElement('article div[data-testid="tweetText"]', 5000);
            // 获取包含整个推文的article元素
            const article = textElement.closest('article');

            if (!article) {
                return null;
            }

            // 提取文本内容（纯文本）
            const text = textElement.innerText.trim();

            // 提取HTML内容（保留格式、表情符号等）
            const textHtml = textElement.innerHTML;

            // 提取图片
            const images = [...article.querySelectorAll('div[data-testid="tweetPhoto"] img')]
                .map(img => img.src)
                .filter(src => src && !src.includes('placeholder'));

            // 提取视频
            const videos = [...article.querySelectorAll('video')]
                .map(video => video.src)
                .filter(Boolean);

            // 提取作者信息
            let author = '';
            const authorElement = article.querySelector('div[data-testid="User-Name"]');
            if (authorElement) {
                author = authorElement.textContent.trim();
            }

            // 提取发布时间
            let publishTime = '';
            const timeElement = article.querySelector('time');
            if (timeElement) {
                publishTime = timeElement.getAttribute('datetime');
            }

            return {
                text,
                html: textHtml,
                images,
                videos,
                author,
                publishTime
            };
        } catch (error) {
            console.debug('提取推文富媒体内容失败:', error);
            return null;
        }
    }

    // 辅助函数：等待元素出现
    function waitForElement(selector, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();

            (function loop() {
                const el = document.querySelector(selector);
                if (el) return resolve(el);
                if (Date.now() - start > timeout) return reject(new Error(`等待元素超时: ${selector}`));
                requestAnimationFrame(loop);
            })();
        });
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
