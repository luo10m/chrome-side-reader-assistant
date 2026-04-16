// 生成内容哈希
function generateContentHash(content) {
    if (!content) return '';
    
    // 简单哈希函数，用于检测内容变化
    let hash = 0;
    const str = typeof content === 'string' ? content : JSON.stringify(content);
    
    if (str.length === 0) return '0';
    
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    
    return hash.toString(16);
}

// 获取页面内容哈希
function getPageContentHash() {
    try {
        // 获取页面主要内容区域
        const mainContent = document.querySelector('main, article, .content, #content, .main, #main') || document.body;
        
        // 提取关键元素
        const elements = mainContent.querySelectorAll('p, div, article, section, header, footer, aside, nav, figure, figcaption');
        
        // 提取文本内容
        let content = '';
        elements.forEach(el => {
            // 排除隐藏元素
            if (el.offsetParent !== null) {
                content += el.textContent.trim() + '\n';
            }
        });
        
        // 生成哈希
        return generateContentHash(content);
    } catch (error) {
        console.error('生成内容哈希失败:', error);
        return '';
    }
}

// 监听来自背景脚本的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getContentHash') {
        const hash = getPageContentHash();
        sendResponse({ hash });
        return true; // 保持消息通道开放以支持异步响应
    }
    return false;
});

// 监听消息以复制代码
document.addEventListener('click', (event) => {
    if (event.target.classList.contains('copy-button')) {
        const code = event.target.getAttribute('data-code');
        if (code) {
            // 处理特殊的换行符标记
            const processedCode = code.replace(/\n/g, '\n')
                .replace(/\r/g, '\r')
                .replace(/\t/g, '\t');

            navigator.clipboard.writeText(processedCode).then(() => {
                const button = event.target;
                const originalText = button.textContent;
                button.textContent = 'Copied!';
                setTimeout(() => {
                    button.textContent = originalText;
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy: ', err);
            });
        } else {
            // 如果没有 data-code 属性，尝试从代码块获取
            const codeBlock = event.target.closest('.code-block');
            if (codeBlock) {
                const codeElement = codeBlock.querySelector('code');
                if (codeElement) {
                    const code = codeElement.textContent;
                    navigator.clipboard.writeText(code).then(() => {
                        const button = event.target;
                        const originalText = button.textContent;
                        button.textContent = 'Copied!';
                        setTimeout(() => {
                            button.textContent = originalText;
                        }, 2000);
                    }).catch(err => {
                        console.error('Failed to copy: ', err);
                    });
                }
            }
        }
    }
});

// =============================================================
// 抓取当前页面正文并发送给后台 - 使用Readability.js提取
// =============================================================

// 保存当前页面URL，用于检测变化
let currentPageUrl = location.href;

// 使用Defuddle提取内容
function extractPageWithDefuddle() {
    try {
        if (typeof window.Defuddle !== 'undefined' || typeof Defuddle !== 'undefined') {
            const DefuddleClass = typeof window.Defuddle !== 'undefined' ? window.Defuddle : Defuddle;
            // 创建文档克隆，防止 Defuddle 修改原始 DOM（比如删除 script/style 等标签）导致网页结构被破坏
            const documentClone = document.cloneNode(true);
            const defuddle = new DefuddleClass(documentClone, { markdown: false });
            const result = defuddle.parse();
            if (result && result.content) {
                console.log('Defuddle成功提取内容:', result.title);
                return {
                    title: result.title || document.title,
                    content: result.content,
                    textContent: result.content,
                    excerpt: result.description,
                    byline: result.author,
                    siteName: result.site
                };
            }
        } else {
            console.warn('Defuddle 类未加载');
        }
    } catch (e) {
        console.error('Defuddle提取失败:', e);
    }
    return null;
}

// 使用Readability提取内容
function extractPageWithReadability() {
    try {
        // 创建文档的克隆，避免修改原始DOM
        const documentClone = document.cloneNode(true);
        
        // 创建一个新的Readability对象
        const reader = new Readability(documentClone);
        
        // 解析页面
        const article = reader.parse();
        
        if (article && article.content) {
            console.log('Readability成功提取内容:', article.title);
            return {
                title: article.title || document.title,
                content: article.content,
                textContent: article.textContent,
                excerpt: article.excerpt,
                byline: article.byline,
                siteName: article.siteName
            };
        } else {
            console.log('Readability无法提取内容，回退到基本提取');
            return null;
        }
    } catch (e) {
        console.error('Readability提取失败:', e);
        return null;
    }
}

// 检查扩展上下文是否有效
function isExtensionContextValid() {
    try {
        chrome.runtime.getURL('');
        return true;
    } catch (e) {
        return false;
    }
}

// 安全发送消息到后台脚本
function safeSendMessage(message, callback) {
    if (!isExtensionContextValid()) {
        console.warn('Extension context is invalid, please reload the page.');
        if (callback) callback({ success: false, error: 'Extension context invalidated' });
        return;
    }

    try {
        chrome.runtime.sendMessage(message, (response) => {
            const error = chrome.runtime.lastError;
            if (error) {
                console.warn('Message send failed:', error.message);
                if (callback) callback({ success: false, error: error.message });
                return;
            }
            if (callback) callback(response);
        });
    } catch (err) {
        console.error('Error sending message:', err);
        if (callback) callback({ success: false, error: err.message });
    }
}

function extractTwitterRichData() {
    const hostname = location.hostname;
    if (
        !(hostname.match(/(^|\.)x\.com$/) || hostname.match(/(^|\.)twitter\.com$/)) ||
        !location.pathname.match(/\/[^\/]+\/status\/\d+/)
    ) {
        return null;
    }

    const textElement = document.querySelector('article div[data-testid="tweetText"]');
    const article = textElement?.closest('article');
    if (!textElement || !article) {
        return null;
    }

    const images = [...article.querySelectorAll('div[data-testid="tweetPhoto"] img')]
        .map((img) => img.src)
        .filter((src) => src && !src.includes('placeholder'));
    const videos = [...article.querySelectorAll('video')]
        .map((video) => video.src || video.querySelector('source')?.src)
        .filter(Boolean);
    const author = article.querySelector('div[data-testid="User-Name"]')?.textContent?.trim() || '';
    const publishTime = article.querySelector('time')?.getAttribute('datetime') || '';

    return {
        text: textElement.innerText.trim(),
        html: textElement.innerHTML,
        images,
        videos,
        author,
        publishTime
    };
}

function sendExtractedContent(payload) {
    const richData = extractTwitterRichData();
    safeSendMessage({
        action: 'pageContent',
        ...payload,
        ...(richData ? { richData } : {})
    });
}

// 改进的内容提取函数
function extractPageText() {
    try {
        console.log('开始提取页面内容');
        
        // 获取页面基本信息
        const url = window.location.href;
        const title = document.title;
        
        // 更新当前URL
        currentPageUrl = url;
        
        // 针对小红书进行专用正文提取
        if (url.includes('xiaohongshu.com/explore')) {
            console.log('应用小红书专用提取规则');
            const noteTitle = document.querySelector('#detail-title, .title')?.innerText || '';
            const noteDesc = document.querySelector('#detail-desc, .desc')?.innerText || '';
            const author = document.querySelector('.username, .name')?.innerText || '';
            
            // 如果成功抓取到了核心节点
            if (noteTitle || noteDesc) {
                const combinedText = `作者: ${author}\n标题: ${noteTitle}\n内容: ${noteDesc}`;
                console.log('小红书正文提取成功:', combinedText.substring(0, 50));
                
                sendExtractedContent({
                    url: url,
                    title: title,
                    content: combinedText,
                    timestamp: Date.now()
                });
                return;
            }
        }
        
        // 双轨并行设计: 尝试使用UGC提取器进行结构化提取
        console.log('尝试使用UGC提取器进行结构化提取...');
        const structuredData = extractStructuredData();
        
        // 如果结构化提取成功
        if (structuredData) {
            console.log('结构化提取成功，发送数据到后台');
            
            // 发送结构化内容到后台
            try {
                if (isExtensionContextValid()) {
                    chrome.runtime.sendMessage({
                        action: 'pageStructured',
                        url: url,
                        structuredData: structuredData,
                        timestamp: Date.now()
                    }, response => {
                        if (response && response.success) {
                            console.log('结构化数据已成功发送到后台');
                        } else {
                            console.warn('发送结构化数据时收到异常响应:', response);
                        }
                    });
                }
            } catch (chromeError) {
                console.error('发送结构化消息时出错:', chromeError);
            }
        } else {
            console.log('结构化提取失败或不适用，将使用Defuddle或Readability提取');
        }

        // 尝试使用Defuddle提取
        console.log('尝试使用Defuddle提取内容...');
        const defuddleResult = extractPageWithDefuddle();

        if (defuddleResult) {
            const content = defuddleResult.textContent || defuddleResult.content;
            sendExtractedContent({
                url: url,
                title: defuddleResult.title || title,
                content: content,
                timestamp: Date.now(),
                excerpt: defuddleResult.excerpt,
                byline: defuddleResult.byline,
                siteName: defuddleResult.siteName
            });
            console.log('使用Defuddle提取的内容已发送到后台');
            return;
        }

        // 继续使用Readability提取作为后备
        console.log('使用Readability提取内容...');
        
        // 尝试使用Readability提取
        const readabilityResult = extractPageWithReadability();
        
        // 如果Readability成功提取
        if (readabilityResult) {
            const content = readabilityResult.textContent || readabilityResult.content;

            sendExtractedContent({
                url: url,
                title: readabilityResult.title || title,
                content: content,
                timestamp: Date.now(),
                excerpt: readabilityResult.excerpt,
                byline: readabilityResult.byline,
                siteName: readabilityResult.siteName
            });
            console.log('使用Readability提取的内容已发送到后台');
            return;
        }
        
        // 回退到原始提取逻辑
        let content = '';
        
        // 尝试获取文章主体
        const articleElements = document.querySelectorAll('article, [role="main"], main, .main-content, #content, .content');
        if (articleElements.length > 0) {
            // 使用最大的文章元素
            let maxLength = 0;
            let bestElement = null;

            try {
                articleElements.forEach(element => {
                    const text = element.innerText;
                    if (text.length > maxLength) {
                        maxLength = text.length;
                        bestElement = element;
                    }
                });
            } catch (e) {
                console.error('处理文章元素时出错:', e);
            }

            if (bestElement) {
                content = bestElement.innerText;
            }
        }

        // 如果没有找到文章元素，则获取所有段落
        if (!content) {
            const paragraphs = document.querySelectorAll('p');
            try {
                content = Array.from(paragraphs)
                    .map(p => p.innerText)
                    .filter(text => text.length > 40) // 过滤掉太短的段落
                    .join('\n\n');
            } catch (e) {
                console.error('处理段落时出错:', e);
            }
        }

        // 如果仍然没有内容，获取所有可见文本
        if (!content) {
            // 获取body的文本，排除脚本和样式
            content = document.body ? document.body.innerText : '';
        }
        
        // 发送消息到后台脚本
        sendExtractedContent({
            url: url,
            title: title,
            content: content,
            timestamp: Date.now()
        });
        console.log('页面内容已提取并发送到后台');
    } catch (e) {
        console.error('提取页面文本失败', e);
    }
}

function bootstrapExtraction() {
    attemptExtraction();
    setupPageMonitors();
}

// 页面卸载时清理逻辑
window.addEventListener('beforeunload', () => {
    // 任何必要的清理
});

// 多次尝试提取内容
function attemptExtraction(maxAttempts = 3, delay = 2000) {
    let attempts = 0;
    
    function tryExtract() {
        attempts++;
        console.log(`尝试内容提取 #${attempts}`);
        
        extractPageText();
        
        if (attempts < maxAttempts) {
            setTimeout(tryExtract, delay);
        }
    }
    
    // 开始第一次尝试
    tryExtract();
}

/**
 * 尝试提取结构化数据
 * @returns {Object|null} 结构化数据对象或null
 */
function extractStructuredData() {
    try {
        // 检查 site-adapters 是否可用
        if (!window.siteAdapters) {
            console.log('site-adapters 模块未加载');
            return null;
        }
        
        // 使用 site-adapters 提取结构化数据
        const structuredData = window.siteAdapters.extractStructuredData();
        
        if (structuredData) {
            console.log('成功提取结构化数据:', structuredData);
            return structuredData;
        } else {
            console.log('无法提取结构化数据，可能没有适配器或页面结构不匹配');
            return null;
        }
    } catch (error) {
        console.error('提取结构化数据失败:', error);
        return null;
    }
}

/**
 * 设置页面监听器，检测页面变化并触发提取
 */
function setupPageMonitors() {
    console.log('设置页面监听器');
    
    // 设置 History API 监听
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    // 重写 pushState
    history.pushState = function() {
        const result = originalPushState.apply(this, arguments);
        console.log('检测到 pushState 调用，重新提取页面');
        setTimeout(extractPageText, 1000); // 给页面一点时间加载
        return result;
    };
    
    // 重写 replaceState
    history.replaceState = function() {
        const result = originalReplaceState.apply(this, arguments);
        console.log('检测到 replaceState 调用，重新提取页面');
        setTimeout(extractPageText, 1000);
        return result;
    };
    
    // 监听 popstate 事件
    const popstateHandler = () => {
        console.log('检测到 popstate 事件，重新提取页面');
        setTimeout(extractPageText, 1000);
    };
    window.addEventListener('popstate', popstateHandler);
    
    // 设置 DOM 变化监听
    let mutationTimer = null;
    const observer = new MutationObserver(() => {
        // 节流处理
        if (mutationTimer) {
            clearTimeout(mutationTimer);
        }
        
        mutationTimer = setTimeout(() => {
            console.log('检测到 DOM 变化，重新提取页面');
            extractPageText();
        }, 1000); // 1秒节流
    });
    
    // 开始监听
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // 在页面卸载时清理
    window.addEventListener('unload', () => {
        history.pushState = originalPushState;
        history.replaceState = originalReplaceState;
        window.removeEventListener('popstate', popstateHandler);
        observer.disconnect();
        if (mutationTimer) {
            clearTimeout(mutationTimer);
        }
    });
}

// 页面加载完成后执行内容提取
if (document.readyState === 'loading') {
    window.addEventListener('load', () => {
        // 给页面一点时间完全渲染
        setTimeout(() => bootstrapExtraction(), 1000);
    });
} else {
    // 页面已经加载，但仍然延迟执行
    setTimeout(() => bootstrapExtraction(), 1000);
}

// 监听来自侧边栏的消息，处理手动刷新内容的请求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
        if (request.action === 'extractPageContent') {
            // 检查扩展上下文是否有效
            if (!isExtensionContextValid()) {
                sendResponse({ success: false, error: '扩展上下文已失效' });
                return true;
            }
            
            // 重新提取页面内容
            extractPageText();

            // 发送成功响应
            sendResponse({ success: true });
        }
    } catch (e) {
        console.error('处理消息时出错:', e);
        sendResponse({ success: false, error: e.message });
    }

    // 返回true表示将异步发送响应
    return true;
});
