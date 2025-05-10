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
        console.log('扩展上下文已失效');
        return false;
    }
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
            console.log('结构化提取失败或不适用，将使用Readability提取');
        }
        
        // 继续使用Readability提取（保持原有流程不变）
        console.log('使用Readability提取内容');
        
        // 尝试使用Readability提取
        const readabilityResult = extractPageWithReadability();
        
        // 如果Readability成功提取
        if (readabilityResult) {
            const content = readabilityResult.textContent || readabilityResult.content;
            
            // 发送消息到后台脚本，添加try-catch以处理上下文失效
            try {
                if (isExtensionContextValid()) {
                    chrome.runtime.sendMessage({
                        action: 'pageContent',
                        url: url,
                        title: readabilityResult.title || title,
                        content: content,
                        timestamp: Date.now(),
                        excerpt: readabilityResult.excerpt,
                        byline: readabilityResult.byline,
                        siteName: readabilityResult.siteName
                    });
                    console.log('使用Readability提取的内容已发送到后台');
                }
            } catch (chromeError) {
                console.log('发送消息时出错，可能是扩展上下文已失效:', chromeError);
            }
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
        
        // 发送消息到后台脚本，添加try-catch以处理上下文失效
        try {
            if (isExtensionContextValid()) {
                chrome.runtime.sendMessage({
                    action: 'pageContent',
                    url: url,
                    title: title,
                    content: content,
                    timestamp: Date.now()
                });
                console.log('页面内容已提取并发送到后台');
            }
        } catch (chromeError) {
            console.log('发送消息时出错，可能是扩展上下文已失效:', chromeError);
        }
    } catch (e) {
        console.error('提取页面文本失败', e);
    }
}

// 检查URL变化的函数
function checkUrlChange() {
    // 首先检查扩展上下文是否有效
    if (!isExtensionContextValid()) {
        // 清除定时器避免继续执行
        clearInterval(urlCheckInterval);
        return;
    }

    const currentUrl = location.href;

    // 如果URL发生变化
    if (currentUrl !== currentPageUrl) {
        console.log('URL从', currentPageUrl, '变为', currentUrl);

        // 先提取页面内容并发送，确保页面缓存先更新
        const title = document.title;
        const text = document.body ? document.body.innerText : '';

        // 发送页面内容消息
        try {
            chrome.runtime.sendMessage({
                action: 'pageContent',
                url: currentUrl,
                title: title,
                content: text,
                timestamp: Date.now()
            }, () => {
                if (chrome.runtime.lastError) {
                    console.log('发送消息时出错:', chrome.runtime.lastError);
                    return;
                }
                
                // 在页面内容发送完成后，再发送页面导航变化消息
                try {
                    chrome.runtime.sendMessage({
                        action: 'pageNavigated',
                        previousUrl: currentPageUrl,
                        newUrl: currentUrl,
                        newTitle: title,
                        timestamp: Date.now()
                    });
                    
                    // 更新当前URL（放在回调中确保顺序正确）
                    currentPageUrl = currentUrl;
                } catch (e) {
                    console.error('发送导航变化消息时出错:', e);
                }
            });
        } catch (e) {
            setTimeout(() => {
                extractPageText();
                setupPageMonitors();
            }, 1000);
        }
    }
}

// 设置定时器定期检查URL变化（针对SPA应用如Medium）
const urlCheckInterval = setInterval(checkUrlChange, 1000);

// 页面卸载时清除定时器
window.addEventListener('beforeunload', () => {
    clearInterval(urlCheckInterval);
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
        setTimeout(() => attemptExtraction(), 1000);
    });
} else {
    // 页面已经加载，但仍然延迟执行
    setTimeout(() => attemptExtraction(), 1000);
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