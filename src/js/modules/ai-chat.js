// Import the API service and markdown renderer
import { sendMessageToOllama } from '../services/ollama-service.js';
import { renderMarkdown } from '../utils/markdown-renderer.js';
import { t } from '../utils/i18n.js';

// Chat history
let chatHistory = [];

// Load AI Chat
export function loadAIChat(container) {
    // Create chat UI
    container.innerHTML = `
        <div class="chat-container">
            <div class="chat-header">
                <h2 data-i18n="chat.header">AI Chat</h2>
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
    `;
    
    // Get DOM elements
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-button');
    
    // Function to add message to UI
    function addMessageToUI(role, content) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${role}`;
        
        const contentElement = document.createElement('div');
        contentElement.className = 'message-content';
        
        // Format message content with markdown
        contentElement.innerHTML = renderMarkdown(content);
        
        messageElement.appendChild(contentElement);
        
        chatMessages.appendChild(messageElement);
        
        // 手动初始化代码高亮
        if (typeof hljs !== 'undefined') {
            contentElement.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
        }
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        return contentElement;
    }
    
    // Function to send message
    async function sendMessage() {
        const message = chatInput.value.trim();
        
        if (!message) return;
        
        // Clear input
        chatInput.value = '';
        chatInput.style.height = 'auto';
        
        // Add user message to UI
        addMessageToUI('user', message);
        
        // Add user message to chat history
        chatHistory.push({
            role: 'user',
            content: message
        });
        
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
        
        let fullContent = '';
        
        try {
            // Send message to Ollama, using streaming response
            const response = await sendMessageToOllama(
                message, 
                chatHistory.slice(0, -1),
                (chunk, full) => {
                    // Remove typing indicator
                    if (assistantContent.contains(typingIndicator)) {
                        assistantContent.removeChild(typingIndicator);
                    }
                    
                    // Update content
                    fullContent = full;
                    assistantContent.innerHTML = renderMarkdown(fullContent);
                    
                    // Scroll to bottom
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
            );
            
            // Ensure final content is updated
            if (assistantContent.contains(typingIndicator)) {
                assistantContent.removeChild(typingIndicator);
            }
            assistantContent.innerHTML = renderMarkdown(response.content);
            
            // Add assistant message to chat history
            chatHistory.push({
                role: 'assistant',
                content: response.content
            });
            
            // Save chat history to storage
            chrome.storage.local.set({ chatHistory });
        } catch (error) {
            // Remove typing indicator
            if (assistantContent.contains(typingIndicator)) {
                assistantContent.removeChild(typingIndicator);
            }
            
            // Display error message
            assistantContent.innerHTML = `<span class="error">Error: ${error.message}</span>`;
            
            console.error('Error sending message:', error);
        }
    }
    
    // Event listeners
    sendButton.addEventListener('click', sendMessage);
    
    chatInput.addEventListener('keydown', (event) => {
        // If Enter is pressed without Shift, send message
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
        // If Shift+Enter is pressed, add a new line
        else if (event.key === 'Enter' && event.shiftKey) {
            // Let the default behavior happen (add a new line)
            // But limit to 3 rows max
            setTimeout(() => {
                const lineCount = (chatInput.value.match(/\n/g) || []).length + 1;
                if (lineCount > 3) {
                    chatInput.style.overflowY = 'auto';
                } else {
                    chatInput.rows = lineCount;
                }
            }, 0);
        }
    });
    
    // Auto-resize textarea
    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        
        // Count lines
        const lineCount = (chatInput.value.match(/\n/g) || []).length + 1;
        
        // Set rows (max 3)
        if (lineCount <= 3) {
            chatInput.rows = lineCount;
            chatInput.style.overflowY = 'hidden';
        } else {
            chatInput.rows = 3;
            chatInput.style.overflowY = 'auto';
        }
        
        // Limit height
        chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    });
    
    // Load chat history from storage
    chrome.storage.local.get(['chatHistory'], (result) => {
        if (result.chatHistory && result.chatHistory.length > 0) {
            chatHistory = result.chatHistory;
            
            // Display chat history in UI
            chatHistory.forEach(message => {
                addMessageToUI(message.role, message.content);
            });
        }
    });
    
    // 修改复制按钮文本
    chatMessages.addEventListener('click', (event) => {
        if (event.target.classList.contains('copy-button')) {
            const code = event.target.getAttribute('data-code');
            if (code) {
                // 处理特殊的换行符标记
                const processedCode = code.replace(/\\n/g, '\n')
                                         .replace(/\\r/g, '\r')
                                         .replace(/\\t/g, '\t');
                
                navigator.clipboard.writeText(processedCode).then(() => {
                    const originalText = event.target.textContent;
                    event.target.textContent = t('chat.copied');
                    setTimeout(() => {
                        event.target.textContent = originalText;
                    }, 2000);
                }).catch(err => {
                    console.error('Failed to copy: ', err);
                });
            }
        }
    });
} 