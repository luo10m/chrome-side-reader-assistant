// OpenAI API Service
import { getSettings } from './ollama-service.js';

// Send message to OpenAI
export async function sendMessageToOpenAI(message, history = [], systemPrompt = null) {
    try {
        // Get settings
        const settings = await getSettings();
        
        // Check if OpenAI settings are configured
        if (!settings.openaiApiKey) {
            throw new Error('OpenAI API key is not configured');
        }
        
        // Prepare API URL
        const apiUrl = settings.openaiBaseUrl + '/chat/completions';
        console.debug('Using OpenAI API URL:', apiUrl);
        
        // Prepare model
        const model = settings.openaiModel || 'gpt-3.5-turbo';
        console.debug('Using OpenAI model:', model);
        
        // Prepare messages
        const messages = [];
        
        // Add system prompt if provided
        if (systemPrompt) {
            messages.push({
                role: 'system',
                content: systemPrompt
            });
        }
        
        // Add chat history
        if (history && history.length > 0) {
            // Filter out system messages from history as we've already added the system prompt
            const filteredHistory = history.filter(msg => msg.role !== 'system');
            messages.push(...filteredHistory);
        }
        
        // Add current message
        messages.push({
            role: 'user',
            content: message
        });
        
        console.debug('Sending messages to OpenAI:', messages);
        
        // Prepare request options
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.openaiApiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                stream: settings.useStreaming !== false
            })
        };
        
        // Send request
        console.debug('Sending request to OpenAI...');
        const response = await fetch(apiUrl, options);
        
        // Check for errors
        if (!response.ok) {
            let errorMessage = `OpenAI API error: ${response.status}`;
            try {
                const errorData = await response.json();
                if (errorData && errorData.error) {
                    errorMessage = `OpenAI API error: ${errorData.error.message || errorData.error}`;
                }
            } catch (e) {
                console.error('Failed to parse error response:', e);
            }
            throw new Error(errorMessage);
        }
        
        console.debug('Received response from OpenAI:', response.status);
        
        // Handle streaming response
        if (settings.useStreaming !== false) {
            console.debug('Processing streaming response...');
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            return {
                streaming: true,
                reader,
                decoder,
                fullResponse: '',
                model: model
            };
        } else {
            // Handle non-streaming response
            console.debug('Processing non-streaming response...');
            const data = await response.json();
            console.debug('OpenAI response data:', data);
            
            let content = '';
            if (data.choices && data.choices.length > 0 && data.choices[0].message) {
                content = data.choices[0].message.content;
            } else {
                console.warn('Unexpected OpenAI response format:', data);
                content = 'Received response in unexpected format. Please check console logs.';
            }
            
            return {
                streaming: false,
                reader: null,
                decoder: null,
                fullResponse: content,
                model: model
            };
        }
    } catch (error) {
        console.error('Error sending message to OpenAI:', error);
        throw error;
    }
}

// Parse OpenAI streaming response
export function parseOpenAIStreamingResponse(chunk) {
    // 添加调试日志
    console.debug('Parsing OpenAI chunk:', chunk);
    
    // Remove 'data: ' prefix and parse JSON
    if (chunk.startsWith('data: ')) {
        const jsonStr = chunk.slice(6).trim();
        
        // Check for [DONE] message
        if (jsonStr === '[DONE]') {
            return { done: true };
        }
        
        try {
            const data = JSON.parse(jsonStr);
            
            // 添加调试日志
            console.debug('Parsed OpenAI data:', data);
            
            // 更健壮的数据提取逻辑
            if (data.choices && data.choices.length > 0) {
                const choice = data.choices[0];
                
                // 处理流式响应格式 (delta)
                if (choice.delta && typeof choice.delta.content === 'string') {
                    return {
                        done: false,
                        content: choice.delta.content
                    };
                }
                
                // 处理非流式响应格式 (message)
                if (choice.message && typeof choice.message.content === 'string') {
                    return {
                        done: false,
                        content: choice.message.content
                    };
                }
                
                // 处理旧版 API 格式 (text)
                if (typeof choice.text === 'string') {
                    return {
                        done: false,
                        content: choice.text
                    };
                }
                
                // 如果有 finish_reason，可能是流的结束
                if (choice.finish_reason) {
                    console.debug('OpenAI stream finished with reason:', choice.finish_reason);
                    return { done: false, content: '' };
                }
            }
            
            // 处理直接返回文本的情况
            if (typeof data.content === 'string') {
                return {
                    done: false,
                    content: data.content
                };
            }
            
            // 处理错误响应
            if (data.error) {
                console.error('OpenAI API error:', data.error);
                return { 
                    done: false, 
                    content: `[Error: ${data.error.message || 'Unknown error'}]`,
                    error: data.error
                };
            }
            
            // 没有识别出内容，但不是错误
            console.debug('No content found in OpenAI response chunk');
            return { done: false, content: '' };
        } catch (error) {
            console.error('Error parsing OpenAI streaming response:', error, 'Raw chunk:', chunk);
            return { done: false, content: '' };
        }
    } else if (chunk.includes('"content":')) {
        // 尝试处理没有 data: 前缀但包含 content 字段的 JSON
        try {
            const match = chunk.match(/"content":"([^"]*)"/);
            if (match && match[1]) {
                return {
                    done: false,
                    content: match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
                };
            }
        } catch (e) {
            console.debug('Failed to extract content with regex:', e);
        }
    }
    
    // Not a data chunk or unrecognized format
    return { done: false, content: '' };
}

// Test OpenAI API connection
export async function testOpenAIConnection(apiKey, baseUrl) {
    try {
        const url = baseUrl + '/models';
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new Error(errorData?.error?.message || `API error: ${response.status}`);
        }
        
        const data = await response.json();
        return { success: true, data };
    } catch (error) {
        console.error('Error testing OpenAI connection:', error);
        throw error;
    }
}

// Get available OpenAI models
export async function getOpenAIModels(apiKey, baseUrl) {
    try {
        const url = baseUrl + '/models';
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new Error(errorData?.error?.message || `API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Filter for chat models
        const chatModels = data.data.filter(model => 
            model.id.includes('gpt') || 
            model.id.includes('claude') || 
            model.id.includes('llama')
        );
        
        return chatModels.map(model => ({
            id: model.id,
            name: model.id
        }));
    } catch (error) {
        console.error('Error fetching OpenAI models:', error);
        throw error;
    }
} 