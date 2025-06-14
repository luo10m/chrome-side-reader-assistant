// OpenAI API Service
import { getSettings } from './ollama-service.js';

// Send message to OpenAI
export async function sendMessageToOpenAI(message, history = [], systemPrompt = null, callback = null) {
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
        
        // Get model name, if it's a custom model use the custom model name
        let model = settings.openaiModel || 'gpt-3.5-turbo';
        if (model === 'custom' && settings.openaiCustomModel) {
            model = settings.openaiCustomModel;
        }
        
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
            let fullResponse = '';
            
            // If a callback function is provided, use it to process the stream
            if (typeof callback === 'function') {
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        
                        if (done) {
                            // Stream is complete
                            callback('', true, fullResponse);
                            break;
                        }
                        
                        // Decode the data chunk
                        const chunk = decoder.decode(value, { stream: true });
                        const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));
                        
                        for (const line of lines) {
                            if (line.includes('[DONE]')) continue;
                            
                            try {
                                const jsonData = JSON.parse(line.substring(5).trim());
                                const content = jsonData.choices?.[0]?.delta?.content || '';
                                
                                if (content) {
                                    fullResponse += content;
                                    callback(content, false, fullResponse);
                                }
                            } catch (e) {
                                console.error('Error parsing streaming data:', e);
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error reading stream:', error);
                    throw error;
                }
            }
            
            return {
                streaming: true,
                reader,
                decoder,
                fullResponse,
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
            
            // If a callback function is provided, call it with the complete response
            if (typeof callback === 'function') {
                callback(content, true, content);
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
    try {
        // 检查是否是[DONE]消息
        if (chunk.includes('[DONE]')) {
            return null;
        }
        
        // 确保chunk是以data:开头的
        if (!chunk.trim().startsWith('data:')) {
            return null;
        }
        
        // 提取JSON部分，移除'data: '前缀
        let jsonStr = chunk.substring(chunk.indexOf('data:') + 5).trim();
        
        // 检查JSON是否完整
        try {
            // 尝试解析JSON
            const data = JSON.parse(jsonStr);
            
            // 检查是否有内容
            if (data.choices && data.choices.length > 0 && data.choices[0].delta && data.choices[0].delta.content) {
                return data.choices[0].delta.content;
            }
            
            // 如果没有内容但有完整的消息
            if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
                return data.choices[0].message.content;
            }
            
            return null;
        } catch (jsonError) {
            // JSON可能被截断，尝试提取content字段
            const contentMatch = jsonStr.match(/"content":"([^"]*)"/);
            if (contentMatch && contentMatch[1]) {
                return contentMatch[1];
            }
            
            // 如果无法提取content，返回null
            return null;
        }
    } catch (error) {
        console.error('Error parsing OpenAI streaming response:', error, 'Raw chunk:', chunk);
        return null;
    }
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
        
        // Add timeout handling
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new Error(errorData?.error?.message || `API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // If no models data, return default models
        if (!data || !data.data || data.data.length === 0) {
            console.warn('No models returned from OpenAI API, using defaults');
            return [
                { id: 'gpt-3.5-turbo', name: 'GPT-3.5' },
                { id: 'gpt-4o', name: 'GPT-4o' },
            ];
        }
        
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
        // Return default models instead of throwing error
        return [
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5' },
            { id: 'gpt-4o', name: 'GPT-4o' },
        ];
    }
} 