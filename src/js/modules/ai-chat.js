// Import the API service and markdown renderer
import { sendMessageToOllama, getSettings } from '../services/ollama-service.js';
import { renderMarkdown } from '../utils/markdown-renderer.js';
import { t } from '../utils/i18n.js';

// Load AI Chat
export function loadAIChat(container) {
    // Chat history
    let chatHistory = [];
    
    // Current chat ID
    let currentChatId = null;
    
    // 在文件顶部添加变量
    let isGenerating = false; // 标记 AI 是否正在生成回复
    
    // Create chat UI
    container.innerHTML = `
        <div class="chat-container">
            <div class="chat-header">
                <h2 data-i18n="chat.header">AI Chat</h2>
                <div class="chat-header-actions">
                    <button id="new-chat-button" class="icon-button" data-i18n-title="chat.newChat">
                        <img src="assets/svg/new-chat.svg" alt="New Chat" class="button-icon">
                    </button>
                    <button id="history-button" class="icon-button" data-i18n-title="chat.history">
                        <img src="assets/svg/history.svg" alt="History" class="button-icon">
                    </button>
                </div>
            </div>
            <div class="chat-messages" id="chat-messages">
                <!-- Messages will be added here -->
            </div>
            <div class="chat-input-container">
                <textarea id="chat-input" data-i18n-placeholder="chat.placeholder" placeholder="Type your message..." rows="1"></textarea>
                <button id="send-button" data-i18n-title="chat.send">
                    <img src="assets/svg/send.svg" alt="Send" class="button-icon">
                </button>
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
    
    // Function to add message to UI
    function addMessageToUI(role, content) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${role}`;
        
        const contentElement = document.createElement('div');
        contentElement.className = 'message-content';
        
        // Format message content with markdown
        contentElement.innerHTML = renderMarkdown(content);
        
        // 手动初始化代码高亮，使用 try-catch 捕获可能的错误
        if (typeof hljs !== 'undefined') {
            try {
                contentElement.querySelectorAll('pre code').forEach((block) => {
                    try {
                        // 确保代码内容被正确转义
                        const originalContent = block.textContent;
                        block.textContent = originalContent;
                        
                        hljs.highlightElement(block);
                    } catch (e) {
                        // 忽略单个代码块的高亮错误
                        console.debug('Error highlighting individual code block:', e);
                    }
                });
            } catch (e) {
                // 忽略整体高亮错误
                console.debug('Error during code highlighting:', e);
            }
        }
        
        messageElement.appendChild(contentElement);
        
        chatMessages.appendChild(messageElement);
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        return contentElement;
    }
    
    // Function to send message
    let streamingMessageElement = null;
    let codeBlocks = new Map(); // 用于跟踪代码块
    
    
    // 简化输入事件处理
    
    async function sendMessage() {
        const message = chatInput.value.trim();
        
        if (!message) return;
        
        // 如果 AI 正在生成回复，不允许发送新消息
        if (isGenerating) {
            console.log('AI is still generating a response, please wait');
            return;
        }
        
        // 只清空输入内容，让 CSS 自动处理高度
        chatInput.value = '';
        
        // 添加用户消息到UI
        addMessageToUI('user', message);
        
        // 添加到聊天历史
        chatHistory.push({
            role: 'user',
            content: message
        });
        
        // 保存当前聊天
        await saveCurrentChat();
        
        // Create assistant message element
        const assistantElement = document.createElement('div');
        assistantElement.className = 'message assistant';
        
        const assistantContent = document.createElement('div');
        assistantContent.className = 'message-content';
        
        // Initial display as typing indicator
        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'typing-indicator';
        typingIndicator.innerHTML = '<span></span><span></span><span></span>';
        
        assistantContent.appendChild(typingIndicator);
        assistantElement.appendChild(assistantContent);
        
        chatMessages.appendChild(assistantElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // 保存当前正在流式传输的消息元素引用
        streamingMessageElement = assistantContent;
        
        // 重置代码块跟踪
        codeBlocks.clear();
        
        // 设置生成状态为 true，并禁用输入
        isGenerating = true;
        updateInputState();
        
        try {
            // 获取当前设置
            const settings = await getSettings();
            
            // 根据默认 AI 提供商选择不同的 API
            let response;
            
            if (settings.defaultAI === 'ollama') {
                // 使用 Ollama API
                response = await sendMessageToOllama(message, chatHistory, (chunk, fullText) => {
                    // Remove typing indicator
                    if (assistantContent.contains(typingIndicator)) {
                        assistantContent.removeChild(typingIndicator);
                    }
                    
                    // 使用增量更新方法处理内容
                    updateStreamingContent(assistantContent, fullText);
                    
                    // Scroll to bottom
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                });
            } else {
                // 未来可以添加其他 AI 提供商
                throw new Error(`Unsupported AI provider: ${settings.defaultAI}`);
            }
            
            // Add assistant message to chat history
            chatHistory.push({
                role: 'assistant',
                content: response.content
            });
            
            // Reset streaming message element
            streamingMessageElement = null;
            codeBlocks.clear();
            
            // Save current chat
            await saveCurrentChat();
        } catch (error) {
            // Remove typing indicator
            if (assistantContent.contains(typingIndicator)) {
                assistantContent.removeChild(typingIndicator);
            }
            
            // Show error message
            assistantContent.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
            
            console.error('Error sending message:', error);
        } finally {
            // 无论成功还是失败，都重置生成状态并启用输入
            isGenerating = false;
            updateInputState();
            
            // 自动聚焦回输入框
            setTimeout(() => {
                chatInput.focus();
            }, 100); // 短暂延迟确保 UI 已更新
        }
    }
    
    // 更新流式内容的函数
    function updateStreamingContent(element, content) {
        // 使用 Markdown 渲染内容
        const renderedContent = renderMarkdown(content);
        
        // 更新元素内容
        element.innerHTML = renderedContent;
        
        // 应用代码高亮
        if (typeof hljs !== 'undefined') {
            try {
                element.querySelectorAll('pre code').forEach((block) => {
                    // 检查这个代码块是否已经高亮过
                    const blockId = block.parentElement.dataset.id || Math.random().toString(36).substring(2);
                    block.parentElement.dataset.id = blockId;
                    
                    if (!codeBlocks.has(blockId)) {
                        try {
                            // 确保代码内容被正确转义
                            const originalContent = block.textContent;
                            block.textContent = originalContent;
                            
                            hljs.highlightElement(block);
                             
                            // 标记为已处理
                            codeBlocks.set(blockId, true);
                        } catch (e) {
                            console.debug('Error highlighting code block:', e);
                        }
                    }
                });
            } catch (e) {
                console.debug('Error during code highlighting:', e);
            }
        }
    }
    
    // Load chat history list
    async function loadChatHistoryList() {
        // Clear history list
        historyList.innerHTML = '';
        
        // Get chat history from storage
        const result = await chrome.storage.local.get(['chatHistoryList']);
        const chatHistoryList = result.chatHistoryList || [];
        
        if (chatHistoryList.length === 0) {
            // If no history, display prompt information
            historyList.innerHTML = `<div class="history-empty" data-i18n="chat.noHistory">No chat history</div>`;
            return;
        }
        
        // Sort by last edit time (latest first)
        chatHistoryList.sort((a, b) => b.lastEditTime - a.lastEditTime);
        
        // Create history items
        chatHistoryList.forEach(chat => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            if (chat.id === currentChatId) {
                historyItem.classList.add('active');
            }
            
            // Format date
            const date = new Date(chat.lastEditTime);
            const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
            
            historyItem.innerHTML = `
                <div class="history-item-content">
                    <div class="history-item-title">${chat.title}</div>
                    <div class="history-item-time">${formattedDate}</div>
                </div>
                <button class="history-delete-button" data-chat-id="${chat.id}" data-i18n-title="chat.delete">×</button>
            `;
            
            // Click to load chat
            historyItem.addEventListener('click', (e) => {
                // If clicked is delete button, don't load chat
                if (e.target.classList.contains('history-delete-button')) {
                    return;
                }
                
                loadChat(chat.id);
                historyPopup.classList.remove('show');
            });
            
            historyList.appendChild(historyItem);
        });
        
        // Add event listener for delete buttons
        document.querySelectorAll('.history-delete-button').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent event bubbling
                const chatId = button.getAttribute('data-chat-id');
                deleteChat(chatId);
            });
        });
    }
    
    // 添加 getChatTitle 函数
    function getChatTitle() {
        // 获取聊天标题（第一条用户消息的前10个字）
        let title = '';
        for (const msg of chatHistory) {
            if (msg.role === 'user') {
                title = msg.content.substring(0, 10) + (msg.content.length > 10 ? '...' : '');
                break;
            }
        }
        
        if (!title) {
            title = t('chat.untitled');
        }
        
        return title;
    }
    
    // 修改 saveCurrentChat 函数
    async function saveCurrentChat() {
        if (!currentChatId) {
            console.error('Cannot save chat: no currentChatId');
            return;
        }
        
        // 如果聊天历史为空，不保存到历史列表中
        if (chatHistory.length === 0) {
            console.log('Not saving empty chat to history list');
            return;
        }
        
        try {
            // 获取现有的聊天历史列表
            const result = await chrome.storage.local.get(['chatHistoryList']);
            let chatHistoryList = result.chatHistoryList || [];
            
            // 查找当前聊天
            const chatIndex = chatHistoryList.findIndex(chat => chat.id === currentChatId);
            
            // 准备要保存的聊天数据
            const chatData = {
                id: currentChatId,
                title: getChatTitle(),
                messages: chatHistory,
                lastEditTime: Date.now()
            };
            
            // 如果找到了现有聊天，更新它；否则添加新聊天
            if (chatIndex !== -1) {
                chatHistoryList[chatIndex] = chatData;
            } else {
                // 只有当聊天中有用户消息时才添加到历史列表
                const hasUserMessage = chatHistory.some(msg => msg.role === 'user');
                if (hasUserMessage) {
                    chatHistoryList.push(chatData);
                    console.log(`Added new chat ${currentChatId} to history list`);
                } else {
                    console.log(`Not adding chat ${currentChatId} to history list (no user messages)`);
                    return; // 不保存没有用户消息的聊天
                }
            }
            
            // 保存更新后的聊天历史列表和最后活动的聊天ID
            await chrome.storage.local.set({
                chatHistoryList: chatHistoryList,
                lastActiveChatId: currentChatId
            });
            
            console.log(`Chat ${currentChatId} saved successfully`);
        } catch (error) {
            console.error('Error saving chat:', error);
        }
    }
    
    // Load chat with specified ID
    async function loadChat(chatId) {
        console.log(`Loading chat ${chatId}`);
        
        try {
            // 获取聊天历史列表
            const result = await chrome.storage.local.get(['chatHistoryList']);
            const chatHistoryList = result.chatHistoryList || [];
            
            // 查找指定的聊天
            const chat = chatHistoryList.find(chat => chat.id === chatId);
            
            if (!chat) {
                console.error(`Chat ${chatId} not found`);
                return false;
            }
            
            // 清空当前聊天UI
            chatMessages.innerHTML = '';
            
            // 设置当前聊天ID
            currentChatId = chatId;
            
            // 加载聊天消息
            chatHistory = chat.messages || [];
            
            // 显示聊天消息
            for (const msg of chatHistory) {
                if (msg.role === 'user' || msg.role === 'assistant') {
                    addMessageToUI(msg.role, msg.content);
                }
            }
            
            // 如果没有消息，添加系统消息
            if (chatHistory.length === 0) {
                addSystemMessageToUI(t('chat.systemMessage'));
            }
            
            // 更新最后活动的聊天ID
            await chrome.storage.local.set({ lastActiveChatId: chatId });
            
            console.log(`Chat ${chatId} loaded successfully with ${chatHistory.length} messages`);
            return true;
        } catch (error) {
            console.error('Error loading chat:', error);
            return false;
        }
    }
    
    // 修改 createNewChat 函数
    async function createNewChat() {
        // 清空聊天历史
        chatHistory = [];
        
        // 清空聊天消息UI
        chatMessages.innerHTML = '';
        
        // 生成新的聊天ID
        currentChatId = Date.now().toString();
        
        // 添加系统消息
        addSystemMessageToUI(t('chat.systemMessage'));
        
        console.log(`New chat created with ID: ${currentChatId}`);
        
        // 注意：不再保存空聊天
        // 只有当用户发送第一条消息时才会保存
        
        return currentChatId;
    }
    
    // Delete chat
    async function deleteChat(chatId) {
        console.log(`Deleting chat ${chatId}`);
        
        // 获取聊天历史列表
        const result = await chrome.storage.local.get(['chatHistoryList', 'lastActiveChatId']);
        let chatHistoryList = result.chatHistoryList || [];
        
        // 从列表中移除
        chatHistoryList = chatHistoryList.filter(chat => chat.id !== chatId);
        
        // 保存更新后的列表
        await chrome.storage.local.set({ chatHistoryList });
        
        // 删除聊天内容
        await chrome.storage.local.remove([`chat_${chatId}`]);
        
        // 如果删除的是当前活动的聊天，更新lastActiveChatId
        if (chatId === result.lastActiveChatId) {
            // 如果还有其他聊天，设置最新的一个为活动聊天
            if (chatHistoryList.length > 0) {
                // 按最后编辑时间排序
                chatHistoryList.sort((a, b) => b.lastEditTime - a.lastEditTime);
                await chrome.storage.local.set({ lastActiveChatId: chatHistoryList[0].id });
            } else {
                // 如果没有其他聊天，清除lastActiveChatId
                await chrome.storage.local.remove(['lastActiveChatId']);
            }
        }
        
        // 如果删除的是当前聊天，创建新聊天
        if (chatId === currentChatId) {
            // 重要：先将currentChatId设为null，防止在beforeunload事件中保存已删除的聊天
            const deletedChatId = currentChatId;
            currentChatId = null;
            chatHistory = [];
            
            // 创建新聊天（这会设置新的currentChatId）
            await createNewChat();
            
            console.log(`Switched from deleted chat ${deletedChatId} to new chat ${currentChatId}`);
        }
        
        // 重新加载历史列表
        loadChatHistoryList();
        
        console.log(`Chat ${chatId} deleted, remaining chats: ${chatHistoryList.length}`);
    }
    
    // Add system message to UI
    function addSystemMessageToUI(message) {
        const messageElement = document.createElement('div');
        messageElement.className = 'message system';
        messageElement.innerHTML = `
            <div class="message-content">${message}</div>
        `;
        chatMessages.appendChild(messageElement);
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Send button click event
    sendButton.addEventListener('click', sendMessage);
    
    // Input enter key event
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Event listeners for chat history
    newChatButton.addEventListener('click', createNewChat);
    
    historyButton.addEventListener('click', (e) => {
        e.stopPropagation();
        loadChatHistoryList();
        historyPopup.classList.add('show');
    });
    
    closeHistoryButton.addEventListener('click', () => {
        historyPopup.classList.remove('show');
    });
    
    // Initialization: Load recent chat or create new chat
    async function initChat() {
        console.log('Initializing chat...');
        
        // 获取设置和聊天历史
        const result = await chrome.storage.local.get(['settings', 'chatHistoryList', 'lastActiveChatId']);
        const settings = result.settings || {};
        const chatHistoryList = result.chatHistoryList || [];
        const lastActiveChatId = result.lastActiveChatId;
        
        // 检查是否应该加载上次对话
        const shouldLoadLastChat = settings.loadLastChat !== false;
        
        console.log(`Found ${chatHistoryList.length} chats, last active: ${lastActiveChatId}, should load last chat: ${shouldLoadLastChat}`);
        
        if (chatHistoryList.length > 0 && shouldLoadLastChat) {
            if (lastActiveChatId) {
                // 检查lastActiveChatId是否存在于chatHistoryList中
                const chatExists = chatHistoryList.some(chat => chat.id === lastActiveChatId);
                
                if (chatExists) {
                    // 加载最后活动的聊天
                    console.log(`Loading last active chat: ${lastActiveChatId}`);
                    loadChat(lastActiveChatId);
                    return;
                }
            }
            
            // 如果没有lastActiveChatId或它不存在，按最后编辑时间排序加载最新的聊天
            chatHistoryList.sort((a, b) => b.lastEditTime - a.lastEditTime);
            console.log(`Loading most recent chat: ${chatHistoryList[0].id}`);
            loadChat(chatHistoryList[0].id);
        } else {
            // 创建新聊天
            console.log('Creating new chat (no history or loadLastChat is false)');
            createNewChat();
        }
    }
    
    // Initialize chat
    initChat();
    
    // Save current chat before page unload
    window.removeEventListener('beforeunload', saveCurrentChatOnUnload); // 移除可能存在的旧监听器

    // 创建一个命名的函数，以便可以移除
    function saveCurrentChatOnUnload() {
        // 只有当currentChatId存在且聊天历史不为空时才保存
        if (currentChatId && chatHistory.length > 0) {
            console.log(`Saving chat ${currentChatId} before unload`);
            saveCurrentChat();
        } else {
            console.log('Not saving on unload: no current chat or empty history');
        }
    }

    // 添加新的监听器
    window.addEventListener('beforeunload', saveCurrentChatOnUnload);

    // 点击外部区域关闭历史记录弹窗
    document.addEventListener('click', (e) => {
        // 如果历史记录弹窗已显示
        if (historyPopup.classList.contains('show')) {
            // 检查点击是否在历史记录弹窗外部
            // 并且不是点击历史按钮本身（避免点击历史按钮同时触发打开和关闭）
            if (!historyPopup.contains(e.target) && e.target !== historyButton && !historyButton.contains(e.target)) {
                historyPopup.classList.remove('show');
            }
        }
    });

    // 阻止历史记录弹窗内部的点击事件冒泡到文档
    historyPopup.addEventListener('click', (e) => {
        // 不阻止删除按钮的点击事件冒泡，因为它需要触发删除功能
        if (!e.target.classList.contains('history-delete-button')) {
            e.stopPropagation();
        }
    });

    // 添加更新输入状态的函数
    function updateInputState() {
        // 根据 isGenerating 状态禁用或启用输入框和发送按钮
        chatInput.disabled = isGenerating;
        sendButton.disabled = isGenerating;
        
        // 可选：添加视觉提示
        if (isGenerating) {
            chatInput.classList.add('disabled');
            sendButton.classList.add('disabled');
        } else {
            chatInput.classList.remove('disabled');
            sendButton.classList.remove('disabled');
        }
    }
} 