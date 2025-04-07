// Send message to Ollama via background script with streaming support
export async function sendMessageToOllama(message, history, onUpdate) {
    console.log("Sending message to Ollama:", message);
    console.log("History:", history);
    
    return new Promise((resolve, reject) => {
        // 发送消息到 background script
        chrome.runtime.sendMessage({
            action: 'sendMessageToOllama',
            message: message,
            history: history
        }, (response) => {
            console.log("Initial response from background script:", response);
            
            if (chrome.runtime.lastError) {
                console.error("Runtime error:", chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
                return;
            }
            
            if (response.error) {
                console.error("Response error:", response.error);
                reject(response.error);
                return;
            }
            
            // 如果是流式响应
            if (response.streaming) {
                // 创建一个端口连接到 background script，使用连接 ID 确保唯一性
                const port = chrome.runtime.connect({ name: `ollama-stream-${response.connectionId}` });
                let fullContent = '';
                
                // 监听端口消息
                port.onMessage.addListener((msg) => {
                    if (msg.error) {
                        reject(new Error(msg.error));
                        port.disconnect();
                        return;
                    }
                    
                    if (msg.done) {
                        // 流结束，返回完整响应
                        resolve({
                            content: msg.content,
                            model: msg.model
                        });
                        port.disconnect();
                    } else {
                        // 增量更新
                        fullContent += msg.content;
                        if (onUpdate) {
                            onUpdate(msg.content, fullContent);
                        }
                    }
                });
                
                // 监听端口断开
                port.onDisconnect.addListener(() => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    }
                });
            } else {
                // 非流式响应，直接返回
                resolve(response);
            }
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