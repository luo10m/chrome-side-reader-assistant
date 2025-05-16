// Import the API service and markdown renderer
import { sendMessageToOllama, getSettings, getActiveSystemPrompt } from '../services/ollama-service.js';
import { sendMessageToOpenAI, parseOpenAIStreamingResponse } from '../services/openai-service.js';
import { renderMarkdown } from '../utils/markdown-renderer.js';
import { t } from '../utils/i18n.js';
import { MAX_MESSAGES_PER_TAB, MAX_HISTORY_IN_CONTEXT } from '../constants.js';

// Load AI Chat
export function loadAIChat(container) {
    // Chat history
    let chatHistory = [];

    // Current chat ID
    let currentChatId = null;

    // 添加当前标签页跟踪
    let currentTabId = null;

    // 在文件顶部添加变量
    let isGenerating = false; // 标记 AI 是否正在生成回复
    let isSummarizing = false; // 标记是否正在生成摘要
    let currentSummaryMessageId = null; // 当前摘要消息的ID
    let summaryContentElement = null; // 摘要内容元素
    let streamingMessageElement = null; // 用于流式响应的消息元素

    // Create chat UI with redesigned layout
    container.innerHTML = `
        <div class="chat-container">
            <div id="page-info" class="page-info-container" style="display: none;">
                <div class="page-info-content">
                    <div id="page-title" class="page-title"></div>
                    <div id="page-url" class="page-url"></div>
                </div>
                <button id="refresh-page-content" class="primary-button" data-i18n="chat.summarize">开始摘要</button>
            </div>
            <div class="chat-messages" id="chat-messages">
                <!-- Welcome message will be added here -->
            </div>
            <div class="chat-input-wrapper">
                <div class="chat-actions">
                    <button id="new-chat-button" class="action-button" data-i18n-title="chat.newChat" title="New Chat">
                        <img src="assets/svg/new-chat.svg" alt="New Chat" class="button-icon">
                    </button>
                    <button id="history-button" class="action-button" data-i18n-title="chat.history" title="Chat History">
                        <img src="assets/svg/history.svg" alt="History" class="button-icon">
                    </button>
                </div>
                <div class="chat-input-container">
                    <textarea id="chat-input" data-i18n-placeholder="chat.placeholder" placeholder="Type your message..." rows="1" style="height: auto;"></textarea>
                    <div class="chat-actions">
                        <button id="send-button" data-i18n-title="chat.send" title="Send">
                            <img src="assets/svg/send.svg" alt="Send" class="button-icon">
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- 历史记录弹出窗口 -->
        <div id="history-popup" class="history-popup">
            <div class="history-popup-header">
                <h3 data-i18n="chat.historyTitle">Chat History</h3>
                <button id="close-history" class="icon-button">
                    <span>×</span>
                </button>
            </div>
            <div class="history-popup-content">
                <div id="history-list" class="history-list">
                    <!-- 历史记录将在这里显示 -->
                </div>
            </div>
        </div>
    `;

    // Get DOM elements
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-button');
    const newChatButton = document.getElementById('new-chat-button');
    const historyButton = document.getElementById('history-button');
    const historyPopup = document.getElementById('history-popup');
    const closeHistoryButton = document.getElementById('close-history');
    const historyList = document.getElementById('history-list');

    // 新增：摘要相关元素
    const pageInfoContainer = document.getElementById('page-info');
    const pageTitleElement = document.getElementById('page-title');
    const pageUrlElement = document.getElementById('page-url');
    const refreshPageContentButton = document.getElementById('refresh-page-content');

    // 新增：初始化摘要按钮
    function initSummaryButton() {
        // 查询当前活动标签页，获取页面信息
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                const currentTab = tabs[0];
                const tabId = currentTab.id;

                // 更新当前标签页ID
                currentTabId = tabId;

                console.log(`初始化摘要按钮，当前标签页: ${tabId}, URL: ${currentTab.url}`);

                // 显示页面基本信息
                updatePageInfo(currentTab.title, currentTab.url);
                pageInfoContainer.style.display = 'flex';
                
                // 始终启用摘要按钮，让用户可以尝试提取内容
                refreshPageContentButton.disabled = false;

                // 检查是否有页面缓存（仅用于日志记录）
                chrome.runtime.sendMessage({ action: 'getSettings' }, (settings) => {
                    chrome.storage.local.get(['pageCache'], (result) => {
                        const pageCache = result.pageCache || {};
                        const tabInfo = pageCache[tabId];

                        console.log('页面缓存信息:', tabInfo);

                        // 无论是否有缓存，都显示页面信息并启用按钮
                        if (tabInfo && tabInfo.url === currentTab.url) {
                            console.log('找到页面缓存，将使用缓存内容');
                        } else {
                            console.log('未找到页面缓存，将尝试提取内容');
                        }
                    });
                });
            } else {
                // 没有活动标签页，禁用摘要按钮
                refreshPageContentButton.disabled = true;
                pageInfoContainer.style.display = 'none';
            }
        });
    }

    // 新增：更新页面信息显示
    function updatePageInfo(title, url) {
        if (title && url) {
            pageInfoContainer.style.display = 'flex';
            pageTitleElement.textContent = title;
            pageUrlElement.textContent = url;
        } else {
            pageInfoContainer.style.display = 'none';
        }
    }

    // 新增：刷新页面内容
    function refreshPageContent() {
        // 调用开始摘要函数
        startSummarize();
    }
    
    // 新增：渲染Twitter富媒体内容
    function renderTwitterContent(tabInfo) {
        if (!tabInfo || !tabInfo.isTwitter || !tabInfo.richData) {
            return null;
        }
        
        // 创建富媒体容器
        const richMediaContainer = document.createElement('div');
        richMediaContainer.className = 'twitter-rich-content';
        
        // 添加作者信息（如果有）
        if (tabInfo.author) {
            const authorElement = document.createElement('div');
            authorElement.className = 'twitter-author';
            authorElement.textContent = tabInfo.author;
            richMediaContainer.appendChild(authorElement);
        }
        
        // 添加HTML格式的推文内容（如果有）
        if (tabInfo.richData.html) {
            const contentElement = document.createElement('div');
            contentElement.className = 'twitter-text';
            contentElement.innerHTML = tabInfo.richData.html;
            richMediaContainer.appendChild(contentElement);
        }
        
        // 添加图片（如果有）
        if (tabInfo.richData.images && tabInfo.richData.images.length > 0) {
            const imagesContainer = document.createElement('div');
            imagesContainer.className = 'twitter-images';
            
            // 根据图片数量设置不同的布局类
            imagesContainer.classList.add(`image-count-${Math.min(tabInfo.richData.images.length, 4)}`);
            
            tabInfo.richData.images.forEach(imgSrc => {
                const imgWrapper = document.createElement('div');
                imgWrapper.className = 'image-wrapper';
                
                const img = document.createElement('img');
                img.src = imgSrc;
                img.alt = 'Tweet image';
                img.loading = 'lazy';
                
                // 添加点击放大功能
                img.addEventListener('click', () => {
                    const modal = document.createElement('div');
                    modal.className = 'image-modal';
                    modal.innerHTML = `
                        <div class="modal-content">
                            <img src="${imgSrc}" alt="Full size image">
                            <button class="close-modal">×</button>
                        </div>
                    `;
                    document.body.appendChild(modal);
                    
                    // 关闭模态框
                    modal.querySelector('.close-modal').addEventListener('click', () => {
                        modal.remove();
                    });
                    
                    // 点击背景关闭
                    modal.addEventListener('click', (e) => {
                        if (e.target === modal) {
                            modal.remove();
                        }
                    });
                });
                
                imgWrapper.appendChild(img);
                imagesContainer.appendChild(imgWrapper);
            });
            
            richMediaContainer.appendChild(imagesContainer);
        }
        
        // 添加视频（如果有）
        if (tabInfo.richData.videos && tabInfo.richData.videos.length > 0) {
            const videosContainer = document.createElement('div');
            videosContainer.className = 'twitter-videos';
            
            tabInfo.richData.videos.forEach(videoSrc => {
                if (videoSrc) {
                    const videoElement = document.createElement('video');
                    videoElement.controls = true;
                    videoElement.src = videoSrc;
                    videoElement.className = 'twitter-video';
                    videosContainer.appendChild(videoElement);
                }
            });
            
            richMediaContainer.appendChild(videosContainer);
        }
        
        // 添加推文链接
        if (tabInfo.url) {
            const linkContainer = document.createElement('div');
            linkContainer.className = 'twitter-link';
            
            const link = document.createElement('a');
            link.href = tabInfo.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = '查看原始推文';
            
            linkContainer.appendChild(link);
            richMediaContainer.appendChild(linkContainer);
        }
        
        return richMediaContainer;
    }

    // 新增：开始摘要 - 更新以支持页面级别独立聊天并检查OpenAI设置
    function startSummarize() {
        if (isSummarizing || !currentTabId) return;

        // 设置状态
        isSummarizing = true;
        refreshPageContentButton.disabled = true;
        refreshPageContentButton.textContent = t('chat.summarizing', '正在摘要...');

        // 删除欢迎消息（如果存在）
        const welcomeMessage = document.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }

        // 删除现有的摘要消息（如果存在）
        const existingSummary = document.querySelector('.summary-message');
        if (existingSummary) {
            existingSummary.remove();
        }

        // 创建摘要消息元素
        const messageElement = document.createElement('div');
        messageElement.className = 'message assistant summary-message';

        // 创建内容元素
        summaryContentElement = document.createElement('div');
        summaryContentElement.className = 'message-content';
        summaryContentElement.innerHTML = '<div class="loading-indicator">生成中...</div>';
        messageElement.appendChild(summaryContentElement);

        // 添加到消息列表
        chatMessages.appendChild(messageElement);

        // 滚动到底部
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // 检查是否有Twitter富媒体内容
        chrome.storage.local.get(['pageCache'], (result) => {
            const pageCache = result.pageCache || {};
            const tabInfo = pageCache[currentTabId];
            
            // 如果是Twitter页面且有富媒体内容，先渲染富媒体内容
            if (tabInfo && tabInfo.isTwitter && tabInfo.richData) {
                console.log('检测到Twitter富媒体内容，渲染中...');
                
                // 创建富媒体容器
                const twitterContentContainer = document.createElement('div');
                twitterContentContainer.className = 'twitter-content-container';
                
                // 渲染Twitter富媒体内容
                const richContent = renderTwitterContent(tabInfo);
                if (richContent) {
                    twitterContentContainer.appendChild(richContent);
                    
                    // 添加分隔线
                    const divider = document.createElement('div');
                    divider.className = 'content-divider';
                    twitterContentContainer.appendChild(divider);
                    
                    // 清除加载指示器，添加富媒体内容
                    summaryContentElement.innerHTML = '';
                    summaryContentElement.appendChild(twitterContentContainer);
                    
                    // 添加摘要加载指示器
                    const summaryLoadingIndicator = document.createElement('div');
                    summaryLoadingIndicator.className = 'loading-indicator';
                    summaryLoadingIndicator.textContent = '生成摘要中...';
                    summaryContentElement.appendChild(summaryLoadingIndicator);
                }
            }
            
            // 发送摘要请求，包含当前标签页ID
            chrome.runtime.sendMessage({
                action: 'summarizePage',
                tabId: currentTabId
            }, (response) => {
                if (chrome.runtime.lastError || !response || !response.success) {
                    const error = chrome.runtime.lastError ?
                        chrome.runtime.lastError.message :
                        (response && response.error ? response.error : '未知错误');

                    // 显示错误
                    // 如果有Twitter内容，保留富媒体内容，只替换加载指示器
                    const loadingIndicator = summaryContentElement.querySelector('.loading-indicator');
                    if (loadingIndicator) {
                        loadingIndicator.innerHTML = `<div class="error-message">摘要生成失败: ${error}</div>`;
                    } else {
                        summaryContentElement.innerHTML = `<div class="error-message">摘要生成失败: ${error}</div>`;
                    }

                    // 重置状态
                    isSummarizing = false;
                    refreshPageContentButton.disabled = false;
                    refreshPageContentButton.textContent = t('chat.summarize', '摘要');
                }
            });
        });
    }

    // 修改：处理摘要流，支持页面级别独立聊天
    let fullSummaryContent = ''; // 累积完整的摘要内容

    function handleSummaryStream(data) {
        if (!summaryContentElement) return;

        if (currentSummaryMessageId === null) {
            currentSummaryMessageId = data.messageId;
            
            // 检查是否有Twitter富媒体内容
            const twitterContainer = summaryContentElement.querySelector('.twitter-content-container');
            const loadingIndicator = summaryContentElement.querySelector('.loading-indicator');
            
            // 如果有Twitter富媒体内容，只清除加载指示器
            if (twitterContainer && loadingIndicator) {
                loadingIndicator.remove();
            } else {
                // 否则清除所有内容
                summaryContentElement.innerHTML = '';
            }
            
            fullSummaryContent = ''; // 重置累积内容
        }

        if (data.messageId !== currentSummaryMessageId) return;

        if (data.done) {
            // 摘要完成
            isSummarizing = false;
            refreshPageContentButton.disabled = false;
            refreshPageContentButton.textContent = t('chat.summarize', '摘要');
            currentSummaryMessageId = null;

            // 移除"正在生成摘要...#网页内容摘要"
            const summaryText = fullSummaryContent.replace('正在生成摘要...#', '');
            
            // 检查是否有Twitter富媒体内容
            const twitterContainer = summaryContentElement.querySelector('.twitter-content-container');
            
            if (twitterContainer) {
                // 如果有Twitter富媒体内容，添加摘要到富媒体内容之后
                const summaryElement = document.createElement('div');
                summaryElement.className = 'summary-text';
                summaryElement.innerHTML = renderMarkdown(summaryText);
                summaryContentElement.appendChild(summaryElement);
            } else {
                // 如果没有Twitter富媒体内容，直接渲染摘要
                summaryContentElement.innerHTML = renderMarkdown(summaryText);
            }

            // 添加操作按钮
            const actionsElement = document.createElement('div');
            actionsElement.className = 'message-actions';
            actionsElement.innerHTML = `
                <button class="action-copy-button" title="${t('chat.copy')}">
                    <img src="assets/svg/copy.svg" alt="Copy" class="button-icon">
                </button>
            `;
            summaryContentElement.parentElement.appendChild(actionsElement);

            // 添加复制功能
            const copyButton = actionsElement.querySelector('.action-copy-button');
            copyButton.addEventListener('click', () => {
                copyToClipboard(summaryContentElement.textContent);
            });

            // 添加或更新摘要消息到聊天历史
            if (currentTabId) {
                // 读取现有消息
                chrome.storage.local.get(['pageMessages_' + currentTabId], (result) => {
                    let messages = result['pageMessages_' + currentTabId] || [];

                    // 查找现有摘要消息
                    const summaryIndex = messages.findIndex(m => m.role === 'assistant' && m.type === 'summary');

                    if (summaryIndex >= 0) {
                        // 更新现有摘要
                        messages[summaryIndex].content = summaryText;
                    } else {
                        // 添加新摘要（在系统消息之后，如果有的话）
                        const systemIndex = messages.findIndex(m => m.role === 'system');

                        // 创建摘要消息对象
                        const summaryMessage = {
                            role: 'assistant',
                            content: summaryText,
                            type: 'summary'
                        };

                        if (systemIndex >= 0) {
                            // 插入系统消息之后
                            messages.splice(systemIndex + 1, 0, summaryMessage);
                        } else if (messages.length > 0) {
                            // 插入到开头
                            messages.unshift(summaryMessage);
                        } else {
                            // 空消息列表，添加系统消息和摘要
                            messages = [
                                { role: 'system', content: 'You are a helpful assistant.' },
                                summaryMessage
                            ];
                        }
                    }

                    // 保存更新后的消息列表
                    chrome.storage.local.set({
                        ['pageMessages_' + currentTabId]: messages
                    }, () => {
                        console.log('摘要已保存到标签页:', currentTabId);
                    });
                });
            }
        } else {
            // 累积内容，然后一次性渲染
            fullSummaryContent += data.content;

            // 移除可能的提示文本
            const cleanContent = fullSummaryContent.replace("网页内容摘要 # ", '');
            
            // 检查是否有Twitter富媒体内容
            const twitterContainer = summaryContentElement.querySelector('.twitter-content-container');
            
            if (twitterContainer) {
                // 如果有Twitter富媒体内容，检查是否已有摘要元素
                let summaryElement = summaryContentElement.querySelector('.summary-text');
                
                if (!summaryElement) {
                    // 如果没有摘要元素，创建一个
                    summaryElement = document.createElement('div');
                    summaryElement.className = 'summary-text';
                    summaryContentElement.appendChild(summaryElement);
                }
                
                // 更新摘要内容
                summaryElement.innerHTML = renderMarkdown(cleanContent);
            } else {
                // 如果没有Twitter富媒体内容，直接渲染摘要
                summaryContentElement.innerHTML = renderMarkdown(cleanContent);
            }

            // 滚动到底部
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    // 处理摘要错误
    function handleSummaryError(data) {
        if (!summaryContentElement) return;

        // 显示错误
        summaryContentElement.innerHTML = `<div class="error-message">摘要生成失败: ${data.error}</div>`;

        // 重置状态
        isSummarizing = false;
        refreshPageContentButton.disabled = false;
        refreshPageContentButton.textContent = t('chat.summarize', '摘要');
        currentSummaryMessageId = null;
    }

    // 新增：复制到剪贴板函数
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            // 可以添加一个提示，表示复制成功
            console.log('Text copied to clipboard');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
        });
    }

    // 新增：自动调整文本区域高度
    function adjustTextareaHeight() {
        if (!chatInput) return;

        chatInput.style.height = 'auto';
        chatInput.style.height = (chatInput.scrollHeight) + 'px';

        // 添加输入事件监听器，实时调整高度
        chatInput.addEventListener('input', () => {
            chatInput.style.height = 'auto';
            chatInput.style.height = (chatInput.scrollHeight) + 'px';
        });
    }

    // 新增：添加消息到UI
    function addMessageToUI(role, content, type = null) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${role}`;

        // 如果是摘要类型消息，添加额外的类名
        if (type === 'summary') {
            messageElement.classList.add('summary-message');
        }

        // 为助手消息添加模型标识
        if (role === 'assistant') {
            // 获取当前使用的模型
            getSettings().then(settings => {
                const modelName = settings.defaultAI === 'openai'
                    ? (settings.openaiModel || 'gpt-3.5-turbo')
                    : (settings.ollamaModel || 'llama2');

                // 设置模型属性用于CSS显示
                messageElement.setAttribute('data-model', modelName);

                // 添加模型图标和名称
                const modelIndicator = document.createElement('div');
                modelIndicator.className = 'model-indicator';
                modelIndicator.innerHTML = `
                    <span class="model-icon">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2L20 7V17L12 22L4 17V7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </span>
                    ${modelName}
                `;
                messageElement.insertBefore(modelIndicator, messageElement.firstChild);
            });
        }

        const contentElement = document.createElement('div');
        contentElement.className = 'message-content';

        // 对于用户消息，使用textContent而不是innerHTML
        if (role === 'user') {
            contentElement.textContent = content; // 使用textContent确保HTML标签被显示为文本
        } else {
            // 对于助手消息，继续使用Markdown渲染
            contentElement.innerHTML = renderMarkdown(content);

            // 手动初始化代码高亮，使用 try-catch 捕获可能的错误
            if (typeof hljs !== 'undefined') {
                try {
                    contentElement.querySelectorAll('pre code').forEach((block) => {
                        hljs.highlightElement(block);
                    });
                } catch (e) {
                    console.debug('Error during code highlighting:', e);
                }
            }
        }

        messageElement.appendChild(contentElement);

        // 为助手消息添加操作按钮
        if (role === 'assistant') {
            const actionsElement = document.createElement('div');
            actionsElement.className = 'message-actions';
            actionsElement.innerHTML = `
                <button class="action-button action-copy-button" title="${t('chat.copy')}">
                    <img src="assets/svg/copy.svg" alt="Copy" class="button-icon">
                </button>
            `;
            messageElement.appendChild(actionsElement);

            // 添加复制功能
            const copyButton = actionsElement.querySelector('.action-copy-button');
            copyButton.addEventListener('click', () => {
                copyToClipboard(contentElement.textContent);
            });
        }

        chatMessages.appendChild(messageElement);

        // 滚动到底部
        chatMessages.scrollTop = chatMessages.scrollHeight;

        return contentElement;
    }

    // 修改发送消息函数，实现MVT-0基础对话功能
    async function handleSend() {
        if (!chatInput.value.trim() || isGenerating) {
            return;
        }
        
        // 禁用发送按钮和输入
        isGenerating = true;
        sendButton.disabled = true;
        
        // 获取输入内容并清空输入框
        const userMessage = chatInput.value.trim();
        chatInput.value = '';
        adjustTextareaHeight();
        
        try {
            // 获取当前标签页ID
            const [{ id: tabId }] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // 1. 写入user消息到历史
            await chrome.runtime.sendMessage({
                action: 'appendChatMessage',
                tabId,
                message: {
                    id: Date.now(),
                    role: 'user',
                    content: userMessage,
                    ts: Date.now()
                }
            });
            
            // 添加用户消息到UI
            addMessageToUI('user', userMessage);
            
            // 2. 拉取完整历史
            const { list } = await chrome.runtime.sendMessage({
                action: 'getChatHistory',
                tabId
            });
            
            // 3. 取得页面摘要
            const ctx = await chrome.runtime.sendMessage({
                action: 'getPageContext',
                tabId
            });
            
            // 获取当前活动的系统提示词
            const systemPrompt = await getActiveSystemPrompt();
            
            // 获取设置
            const settings = await getSettings();
            const provider = settings.defaultAI || 'ollama';
            
            // 4. 组装发送给模型的messages
            // 使用从constants.js导入的MAX_HISTORY_IN_CONTEXT
            const summaryMsg = ctx && ctx.summary
                ? { role: 'system', content: `以下是当前页面摘要，供回答参考：\n${ctx.summary}` }
                : null;
            
            const tail = list.filter(m => m.role !== 'system').slice(-MAX_HISTORY_IN_CONTEXT);
            const messages = [
                { role: 'system', content: systemPrompt },
                summaryMsg,
                ...tail
            ].filter(Boolean); // 过滤掉null值
            
            // 创建流式显示的消息元素
            streamingMessageElement = document.createElement('div');
            streamingMessageElement.className = 'message assistant';
            const contentElement = document.createElement('div');
            contentElement.className = 'message-content';
            streamingMessageElement.appendChild(contentElement);
            chatMessages.appendChild(streamingMessageElement);
            
            // 显示加载指示器
            contentElement.innerHTML = '<div class="typing-indicator">思考中<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></div>';
            
            // 滚动到底部
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            // 5. 调用服务
            let response;
            let fullText = '';
            
            if (provider === 'openai') {
                // 检查是否有API密钥
                if (!settings.openaiApiKey) {
                    contentElement.innerHTML = '请在设置中配置OpenAI API密钥';
                    setTimeout(() => {
                        openSettings();
                    }, 1000);
                    return;
                }
                
                // 使用OpenAI
                response = await sendMessageToOpenAI(userMessage, allMessages.slice(0, -1), systemPrompt);
                
                // 处理OpenAI的流式响应
                if (response.streaming) {
                    await handleStreamingResponse(response.reader, response.decoder, updateStreamingMessage, userMessage);
                    return; // 流式响应会自行处理UI更新
                }
            } else {
                // 使用Ollama
                response = await sendMessageToOllama(userMessage, messages, (chunk, done, full) => {
                    updateStreamingMessage(chunk, full, done);
                    fullText = full;
                });
            }
            
            // 6. 流式结束后，写入assistant消息
            if (fullText) {
                await chrome.runtime.sendMessage({
                    action: 'appendChatMessage',
                    tabId,
                    message: {
                        id: Date.now(),
                        role: 'assistant',
                        content: fullText,
                        ts: Date.now()
                    }
                });
            }
        } catch (error) {
            console.error('发送消息错误:', error);
            
            // 显示错误消息
            if (streamingMessageElement) {
                const contentElement = streamingMessageElement.querySelector('.message-content');
                if (contentElement) {
                    contentElement.innerHTML = `<div class="error-message">错误: ${error.message}</div>`;
                }
            }
        } finally {
            // 重置状态
            isGenerating = false;
            sendButton.disabled = false;
            streamingMessageElement = null;
        }
    }

    // 处理流式响应
    async function handleStreamingResponse(reader, decoder, callback, userMessage) {
        let fullText = '';
        
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim() !== '');
                
                for (const line of lines) {
                    const message = line.replace(/^data: /, '').trim();
                    if (message === '[DONE]') {
                        break;
                    }
                    
                    try {
                        const parsed = JSON.parse(message);
                        const content = parsed.choices[0]?.delta?.content || '';
                        if (content) {
                            fullText += content;
                            callback(content, fullText, false);
                        }
                    } catch (e) {
                        console.error('Error parsing message:', e, 'Raw message:', message);
                    }
                }
            }
            
            // 完成处理
            callback('', fullText, true);
            
            // 添加到聊天历史
            chatHistory.push({ role: 'user', content: userMessage });
            chatHistory.push({ role: 'assistant', content: fullText });
            saveChatHistory(chatHistory);
            
        } catch (error) {
            console.error('Error reading stream:', error);
            const errorElement = streamingMessageElement?.querySelector('.message-content');
            if (errorElement) {
                errorElement.innerHTML = `<div class="error-message">流式响应错误: ${error.message}</div>`;
            }
        } finally {
            isGenerating = false;
            sendButton.disabled = false;
        }
    }
    
    // 更新流式消息
    function updateStreamingMessage(chunk, fullText, done = false) {
        if (!streamingMessageElement) return;

        const contentElement = streamingMessageElement.querySelector('.message-content');
        if (!contentElement) return;

        if (done) {
            // 完成响应，添加复制按钮
            contentElement.innerHTML = renderMarkdown(fullText || '');

            // 添加操作按钮
            const actionsElement = document.createElement('div');
            actionsElement.className = 'message-actions';
            actionsElement.innerHTML = `
                <button class="action-copy-button" title="${t('chat.copy')}">
                    <img src="assets/svg/copy.svg" alt="Copy" class="button-icon">
                </button>
            `;
            streamingMessageElement.appendChild(actionsElement);

            // 添加复制功能
            const copyButton = actionsElement.querySelector('.action-copy-button');
            copyButton.addEventListener('click', () => {
                copyToClipboard(fullText);
            });

            // 应用代码高亮
            if (typeof hljs !== 'undefined') {
                try {
                    contentElement.querySelectorAll('pre code').forEach((block) => {
                        hljs.highlightElement(block);
                    });
                } catch (e) {
                    console.debug('Error during code highlighting:', e);
                }
            }
        } else {
            // 更新流式内容
            if (contentElement.querySelector('.loading-indicator')) {
                contentElement.innerHTML = '';
            }
            
            // 包装内容以确保正确的换行
            const wrappedHtml = `<div class="streaming-content" style="white-space: normal; word-break: normal; word-wrap: normal; overflow-wrap: break-word;">${renderMarkdown(fullText)}</div>`;
            contentElement.innerHTML = wrappedHtml;
        }

        // 滚动到底部
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // 修复：加载当前标签页的聊天历史 - 正确处理复杂的消息对象
    function loadChatHistory(tabId) {
        // 显示加载状态
        const loadingElement = document.createElement('div');
        loadingElement.className = 'chat-loading';
        loadingElement.innerHTML = '<div class="spinner"></div><p>正在加载对话...</p>';
        chatMessages.innerHTML = '';
        chatMessages.appendChild(loadingElement);

        console.log('加载标签页的聊天历史:', tabId);

        // 从存储中获取该标签页的消息历史
        chrome.storage.local.get(['pageMessages_' + tabId], (result) => {
            // 清空当前显示的消息
            chatMessages.innerHTML = '';

            const messages = result['pageMessages_' + tabId] || [];
            console.log('获取到消息历史:', messages);

            // 更新本地聊天历史 - 保留所有消息包括摘要
            chatHistory = messages.filter(msg => msg.role !== 'system');

            // 如果没有历史消息，显示默认欢迎消息
            if (messages.length === 0) {
                addWelcomeMessage();
                return;
            }

            // 渲染历史消息，传递type参数以正确显示摘要
            let summaryAdded = false;
            messages.forEach(msg => {
                if (msg.role !== 'system') {
                    // 如果是摘要类型，标记已添加摘要
                    if (msg.type === 'summary') {
                        summaryAdded = true;
                    }
                    addMessageToUI(msg.role, msg.content, msg.type);
                }
            });
        });
    }

    // 新增：保存聊天记录到当前标签页
    function saveChatHistory(messages) {
        if (!currentTabId) return;

        // 检查是否有系统消息
        const hasSystemMessage = messages.some(msg => msg.role === 'system');

        // 如果没有系统消息，添加一个默认的
        const messagesWithSystem = hasSystemMessage ? messages : [
            { role: 'system', content: 'You are a helpful assistant.' },
            ...messages
        ];

        // 保存到特定标签页的消息历史
        chrome.storage.local.set({
            ['pageMessages_' + currentTabId]: messagesWithSystem
        }, () => {
            console.log('聊天记录已保存到标签页:', currentTabId);
        });
    }

    // 新增：初始化标签页关联
    function initCurrentTab() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs.length > 0) {
                currentTabId = tabs[0].id;
                console.log('当前标签页ID:', currentTabId);
                loadChatHistory(currentTabId);
            }
        });
    }

    // Add welcome message
    function addWelcomeMessage() {
        const welcomeElement = document.createElement('div');
        welcomeElement.className = 'message assistant welcome-message';

        const contentElement = document.createElement('div');
        contentElement.className = 'message-content';
        contentElement.innerHTML = renderMarkdown(t('chat.welcomeMessage', 'Hi, How can I help you today?'));

        welcomeElement.appendChild(contentElement);
        chatMessages.appendChild(welcomeElement);
    }

    // 新增：监听来自后台的消息
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'summaryStream') {
            handleSummaryStream(message);
        } else if (message.action === 'summaryError') {
            handleSummaryError(message);
        } else if (message.action === 'pageNavigated') {
            // 检查是否是当前标签页
            if (message.tabId === currentTabId) {
                console.log('Current page navigated:', message.newUrl);

                // 添加页面切换通知
                const notificationElement = document.createElement('div');
                notificationElement.className = 'page-navigation-notification';
                notificationElement.innerHTML = `
                    <div class="notification-icon">
                        <img src="assets/svg/navigate.svg" alt="Navigation" class="button-icon">
                    </div>
                    <div class="notification-content">
                        <p>页面已切换到: <strong>${message.newTitle}</strong></p>
                        <p class="notification-url">${message.newUrl}</p>
                    </div>
                `;
                chatMessages.appendChild(notificationElement);

                // 滚动到底部
                chatMessages.scrollTop = chatMessages.scrollHeight;

                // 确保在页面导航事件处理完成后，再执行initSummaryButton
                // 这样做的目的是让pageCache有足够的时间更新
                setTimeout(() => {
                    // 更新摘要按钮状态和页面信息
                    initSummaryButton();

                    // 重新加载该标签页的聊天历史（会清除并重新加载消息）
                    // 延后执行，确保页面信息区域和摘要按钮已正确显示
                    setTimeout(() => {
                        loadChatHistory(currentTabId);
                    }, 100);
                }, 300);
            }
        }
    });

    // 新增：绑定摘要按钮事件
    refreshPageContentButton.addEventListener('click', refreshPageContent);

    // 新增：绑定发送按钮事件
    sendButton.addEventListener('click', handleSend);

    // 新增：绑定输入框回车事件
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    // 新增：初始化摘要按钮
    initSummaryButton();

    // 新增：标签页切换时更新摘要按钮状态
    chrome.tabs.onActivated.addListener((activeInfo) => {
        currentTabId = activeInfo.tabId;
        console.log('标签页切换至:', currentTabId);
        loadChatHistory(currentTabId);

        // 更新摘要按钮状态
        setTimeout(initSummaryButton, 300);
    });

    // 新增：标签页更新时更新摘要按钮状态和聊天历史
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.status === 'complete' && tabId === currentTabId) {
            setTimeout(() => {
                initSummaryButton();
                loadChatHistory(currentTabId);
            }, 300);
        }
    });

    // 新增：绑定新对话按钮事件 - 清空当前标签页历史
    newChatButton.addEventListener('click', () => {
        if (!currentTabId) return;

        // 确认是否清空当前对话
        if (confirm(t('chat.confirmNewChat', '确定要开始新对话吗？这将清空当前页面的所有消息。'))) {
            // 清空聊天历史
            chatHistory = [];
            saveChatHistory(chatHistory);

            // 清空UI
            chatMessages.innerHTML = '';
            addWelcomeMessage();
        }
    });

    // 初始化
    addWelcomeMessage();
    initCurrentTab(); // 替换 initSummaryButton() 为主要初始化函数
    adjustTextareaHeight();
}