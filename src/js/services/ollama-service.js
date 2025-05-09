// Send message to Ollama via background script with streaming support
export async function sendMessageToOllama(message, history, onUpdate) {
    const settings = await getSettings();
    
    return new Promise((resolve, reject) => {
        let isResolved = false;
        let fullContent = '';
        
        // 发送请求
        chrome.runtime.sendMessage({
            action: 'sendMessageToOllama',
            message,
            history,
            systemPrompt: settings.systemPrompt
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }
            
            if (response.error) {
                reject(new Error(response.error));
                return;
            }
            
            const messageId = response.messageId;
            
            // 设置消息监听器
            const messageListener = (msg) => {
                if (msg.action === 'ollamaResponse' && msg.messageId === messageId) {
                    if (msg.done) {
                        // 完成响应
                        if (!isResolved) {
                            isResolved = true;
                            resolve({ content: fullContent });
                            chrome.runtime.onMessage.removeListener(messageListener);
                        }
                    } else {
                        // 增量更新
                        fullContent += msg.content;
                        if (onUpdate) {
                            onUpdate(msg.content, fullContent);
                        }
                    }
                } else if (msg.action === 'ollamaError' && msg.messageId === messageId) {
                    // 错误响应
                    if (!isResolved) {
                        isResolved = true;
                        reject(new Error(msg.error));
                        chrome.runtime.onMessage.removeListener(messageListener);
                    }
                }
            };
            
            // 添加消息监听器
            chrome.runtime.onMessage.addListener(messageListener);
            
            // 设置超时
            setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    reject(new Error('Request timed out'));
                    chrome.runtime.onMessage.removeListener(messageListener);
                }
            }, 30000);
        });
    });
}

// Get current settings
export async function getSettings() {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: 'getSettings'
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else if (response.error) {
                reject(response.error);
            } else {
                resolve(response);
            }
        });
    });
}

// Update settings
export async function updateSettings(settings) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: 'updateSettings',
            settings: settings
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else if (response.error) {
                reject(response.error);
            } else {
                resolve(response);
            }
        });
    });
}

// 获取当前活动的系统提示词
export async function getActiveSystemPrompt() {
    const settings = await getSettings();
    return settings.systemPrompt || '';
}

// 获取所有系统提示词
export async function getAllSystemPrompts() {
    const settings = await getSettings();
    return settings.systemPrompts || [];
}

// 获取指定ID的系统提示词
export async function getSystemPromptById(promptId) {
    const settings = await getSettings();
    const prompt = settings.systemPrompts?.find(p => p.id === promptId);
    return prompt ? prompt.content : '';
}

// 设置活动系统提示词
export async function setActiveSystemPrompt(promptId) {
    const settings = await getSettings();
    const prompt = settings.systemPrompts?.find(p => p.id === promptId);
    
    if (prompt) {
        settings.activePromptId = promptId;
        settings.systemPrompt = prompt.content;
        await updateSettings(settings);
        return true;
    }
    
    return false;
} 