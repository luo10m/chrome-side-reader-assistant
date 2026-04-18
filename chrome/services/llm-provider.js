import { currentSettings, defaultSettings, updatePageCacheRecord } from './storage-service.js';
import { sendRuntimeMessageSafely } from '../../src/js/shared/runtime-guards.mjs';
import { DEFAULT_OPENAI_MODEL } from '../../src/js/shared/openai-defaults.mjs';

function dispatchRuntimeMessage(payload) {
    return sendRuntimeMessageSafely(
        chrome.runtime.sendMessage.bind(chrome.runtime),
        payload
    );
}

function getConfiguredOpenAIBaseUrl(settings) {
    const baseUrl = (settings?.openaiBaseUrl || '').trim().replace(/\/+$/, '');
    if (!baseUrl) {
        throw new Error('OpenAI base URL is not configured');
    }
    return baseUrl;
}

export async function summarizeWithOpenAI(tabId, url, title, content, settings) {
    if (!settings) {
        settings = currentSettings;
    }

    const apiKey = settings.openaiApiKey;
    if (!apiKey) throw new Error('OpenAI API Key is not configured');

    const messageId = Date.now().toString();
    const MAX_CONTENT_LENGTH = 10000;
    const truncatedContent = content.length > MAX_CONTENT_LENGTH
        ? content.substring(0, MAX_CONTENT_LENGTH) + '...(content truncated)'
        : content;

    try {
        const systemPrompt = `第一步，你是一位阅读教练，以《如何阅读一本书》的方法论为指导。请帮我分析以下文本内容：

1. 首先进行结构分析：找出文章的主要部分，确定作者的核心论点和支持论点。
2. 解释关键概念和术语，确保我理解作者使用的专业词汇。
3. 分析作者的推理过程：论证逻辑是否健全，证据是否充分。
4. 提供批判性思考视角：指出文章的优点和可能的不足之处。
5. 总结文章的核心价值和适用场景

记住，目标不是简单总结文章内容，而是帮助我更深入地理解和评价文章。

第二步，你是一位批判性思维教练，以《学会提问》的方法论为指导。请帮我分析以下文本内容：

1. 识别文本中的主要论点和结论。
2. 找出关键假设和隐含前提。
3. 评估论据的质量和相关性。
4. 指出潜在的逻辑谬误或推理错误。
5. 提供替代性解释或视角。
6. 评估文本中可能的偏见、利益冲突或情感诉求。

请以苏格拉底式的提问方式，引导我思考文本的真实性、准确性和完整性。

输出格式：

**内容总结**
{{列表形式输出总结}}
**批判性分析**
{{详尽又犀利的批判性分析}}
**深入思考**
{{苏格拉底的提问}}
`;

        const baseUrl = getConfiguredOpenAIBaseUrl(settings);
        const model = settings.openaiCustomModel || settings.openaiModel || DEFAULT_OPENAI_MODEL;

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `请为以下网页内容生成一个全面的分析：\n\n标题：${title}\nURL：${url}\n\n内容：${truncatedContent}` }
                ],
                stream: true
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullResponse = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                await dispatchRuntimeMessage({
                    action: 'summaryStream',
                    messageId,
                    done: true,
                    content: ''
                });
                break;
            }

            const chunk = decoder.decode(value, { stream: true });
            if (chunk) {
                try {
                    const lines = chunk.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.substring(6);
                            if (data === '[DONE]') continue;
                            try {
                                const sanitizedData = data.trim();
                                const json = JSON.parse(sanitizedData);
                                const content = json.choices?.[0]?.delta?.content || '';
                                if (content) {
                                    fullResponse += content;
                                    await dispatchRuntimeMessage({
                                        action: 'summaryStream',
                                        messageId,
                                        done: false,
                                        content: content
                                    });
                                }
                            } catch (e) {
                                console.error('Failed to parse JSON from stream:', e);
                            }
                        }
                    }
                } catch (e) {
                    console.error('Error processing chunk:', e);
                }
            }
        }

        updatePageCacheRecord(tabId, {
            summary: fullResponse,
            summaryTime: Date.now()
        });

        return fullResponse;
    } catch (error) {
        console.error('Summarization error:', error);
        await dispatchRuntimeMessage({
            action: 'summaryError',
            error: error.message
        });
        throw error;
    }
}

export async function fetchTranslationWithOpenAI(text, targetLang) {
    const settings = currentSettings || defaultSettings;
    const apiKey = settings.openaiApiKey;
    
    if (!apiKey) {
        throw new Error('OpenAI API Key is not configured');
    }
    
    const baseUrl = getConfiguredOpenAIBaseUrl(settings);
    const model = settings.openaiCustomModel || settings.openaiModel || DEFAULT_OPENAI_MODEL;
    
    const languageMap = {
        'en': 'English', 'zh_cn': 'Chinese (Simplified)', 'zh-CN': 'Chinese (Simplified)', 
        'zh_tw': 'Chinese (Traditional)', 'zh-TW': 'Chinese (Traditional)', 'ja': 'Japanese',
        'ko': 'Korean', 'fr': 'French', 'de': 'German', 'es': 'Spanish', 'ru': 'Russian',
        'ar': 'Arabic', 'hi': 'Hindi', 'pt': 'Portuguese', 'it': 'Italian'
    };
    const targetLanguage = languageMap[targetLang] || targetLang;
    
    try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: `You are a professional translator. Translate the given text to ${targetLanguage}. Only return the translated text, no explanations or additional content.` },
                    { role: 'user', content: text }
                ],
                temperature: 0.3,
                max_tokens: 2000
            })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
        }
        const data = await response.json();
        const translatedText = data.choices?.[0]?.message?.content?.trim();
        if (!translatedText) throw new Error('No translation received from OpenAI');
        return translatedText;
    } catch (error) {
        console.error('Translation error:', error);
        throw error;
    }
}

export async function compactConversationWithOpenAI(existingMemory, archivedMessages, settings) {
    const safeMessages = Array.isArray(archivedMessages)
        ? archivedMessages.filter((message) => message && typeof message === 'object' && typeof message.content === 'string')
        : [];

    if (safeMessages.length === 0) {
        return existingMemory || '';
    }

    if (!settings) {
        settings = currentSettings;
    }

    const apiKey = settings.openaiApiKey;
    if (!apiKey) {
        throw new Error('OpenAI API Key is not configured');
    }

    const baseUrl = getConfiguredOpenAIBaseUrl(settings);
    const model = settings.openaiCustomModel || settings.openaiModel || DEFAULT_OPENAI_MODEL;
    const archivedTranscript = safeMessages
        .map((message) => `${message.role === 'user' ? '用户' : '助手'}: ${message.content}`)
        .join('\n');

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            messages: [
                {
                    role: 'system',
                    content: `你负责维护网页对话的滚动 compact memory。

目标：
1. 保留用户目标、已确认结论、仍未解决的问题。
2. 保留对网页内容的重要引用、术语、偏好和约束。
3. 删除寒暄、重复表述、低价值措辞。
4. 输出紧凑中文，便于后续对话直接作为 system context 使用。

输出要求：
- 不要复述全部原文。
- 不要写“以下是总结”等前言。
- 使用 4 到 8 条短列表。`
                },
                {
                    role: 'user',
                    content: `现有 compact memory：
${existingMemory || '（空）'}

请将以下即将滑出最近上下文窗口的旧对话增量合并进去，并返回新的 compact memory：
${archivedTranscript}`
                }
            ],
            temperature: 0.2,
            max_tokens: 600
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(`OpenAI API error: ${errorData?.error?.message || response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || existingMemory || '';
}


