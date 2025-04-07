/**
 * 高级 Markdown 渲染工具
 * 使用 marked 和 highlight.js 提供更好的 Markdown 渲染和代码高亮
 */

import { t } from './i18n.js';

// 捕获并抑制 highlight.js 的安全警告
(function suppressHighlightJsWarnings() {
    // 保存原始的 console 方法
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalLog = console.log;
    
    // 检查是否是 highlight.js 的安全警告
    function isHighlightJsWarning(args) {
        if (args.length === 0) return false;
        
        // 检查第一个参数是否是字符串
        if (typeof args[0] === 'string') {
            return args[0].includes('unescaped HTML') || 
                   args[0].includes('highlight.js/wiki/security');
        }
        
        // 检查是否是 HTMLElement
        if (args[0] instanceof HTMLElement || 
            (args[0] && args[0].toString && args[0].toString() === '[object HTMLElement]')) {
            return true;
        }
        
        return false;
    }
    
    // 重写 console.warn 方法
    console.warn = function(...args) {
        if (!isHighlightJsWarning(args)) {
            originalWarn.apply(console, args);
        }
    };
    
    // 重写 console.error 方法，过滤掉 highlight.js 的错误
    console.error = function(...args) {
        if (args.length > 0 && typeof args[0] === 'string' && 
            (args[0].includes('highlight.js') || args[0].includes('Highlighting'))) {
            // 忽略 highlight.js 相关的错误
            return;
        }
        originalError.apply(console, args);
    };
    
    // 重写 console.log 方法，过滤掉 highlight.js 的日志
    console.log = function(...args) {
        if (args.length > 0 && typeof args[0] === 'string' && 
            (args[0].includes('Highlighting code with language') || 
             args[0].includes('highlight.js loaded') ||
             args[0].includes('Highlight successful') ||
             args[0].includes('Using auto highlight'))) {
            // 忽略 highlight.js 相关的日志
            return;
        }
        originalLog.apply(console, args);
    };
})();

// 检查 highlight.js 是否已加载
let hljs;
let hljsLoaded = false;
let hljsLanguages = [];

// 初始化 highlight.js
function initHighlight() {
    if (typeof window.hljs !== 'undefined') {
        hljs = window.hljs;
        hljsLoaded = true;
        hljsLanguages = hljs.listLanguages();
        console.log('highlight.js loaded, available languages:', hljsLanguages);
    } else {
        console.warn('highlight.js not loaded');
    }
}

// 尝试初始化
initHighlight();

// 如果初始化失败，等待 DOMContentLoaded 事件再次尝试
if (!hljsLoaded) {
    window.addEventListener('DOMContentLoaded', initHighlight);
}

// 配置 marked
marked.setOptions({
    highlight: function(code, lang) {
        console.log(`Highlighting code with language: ${lang}`);
        if (lang && hljs.getLanguage(lang)) {
            try {
                const result = hljs.highlight(code, { 
                    language: lang,
                    ignoreIllegals: true 
                }).value;
                console.log('Highlight successful');
                return result;
            } catch (e) {
                console.error('Highlight error:', e);
            }
        }
        console.log('Using auto highlight');
        return hljs.highlightAuto(code).value;
    },
    langPrefix: 'hljs language-',
    breaks: true,
    gfm: true
});

/**
 * 渲染 Markdown 为 HTML
 * @param {string} markdown Markdown 文本
 * @returns {string} 渲染后的 HTML
 */
export function renderMarkdown(markdown) {
    if (!markdown) return '';
    
    try {
        // 预处理 Markdown，确保代码块中的 HTML 被转义
        let processedMarkdown = markdown;
        
        // 特殊处理 HTML 代码示例
        const htmlCodeBlockRegex = /```(html|xml)([\s\S]*?)```/g;
        const htmlCodeBlocks = [];
        
        // 提取 HTML 代码示例并替换为占位符
        processedMarkdown = processedMarkdown.replace(htmlCodeBlockRegex, (match, lang, code) => {
            const placeholder = `HTML_CODE_BLOCK_${htmlCodeBlocks.length}`;
            htmlCodeBlocks.push({ lang, code: code.trim() });
            return '```' + lang + '\n' + placeholder + '\n```';
        });
        
        // 处理其他代码块
        processedMarkdown = preprocessMarkdown(processedMarkdown);
        
        // 使用 marked 将 Markdown 转换为 HTML
        let html = marked.parse(processedMarkdown);
        
        // 恢复 HTML 代码示例
        htmlCodeBlocks.forEach((block, index) => {
            const placeholder = `HTML_CODE_BLOCK_${index}`;
            const escapedCode = escapeHtml(block.code);
            html = html.replace(placeholder, escapedCode);
        });
        
        // 使用 DOMPurify 清理 HTML，防止 XSS 攻击
        const sanitized = DOMPurify.sanitize(html);
        
        // 处理代码块，添加复制按钮和语言标签
        const processed = processCodeBlocks(sanitized);
        
        return processed;
    } catch (error) {
        console.error('Error rendering markdown:', error);
        // 如果渲染失败，返回原始文本
        return `<pre>${escapeHtml(markdown)}</pre>`;
    }
}

/**
 * 预处理 Markdown，确保代码块中的 HTML 被转义
 * @param {string} markdown Markdown 文本
 * @returns {string} 处理后的 Markdown
 */
function preprocessMarkdown(markdown) {
    // 匹配所有代码块
    const codeBlockRegex = /```([\s\S]*?)```/g;
    
    // 替换代码块中的 HTML 标签，但保留 HTML 代码示例
    return markdown.replace(codeBlockRegex, (match, codeContent) => {
        // 检查是否是 HTML 代码示例
        if (match.startsWith('```html') || match.startsWith('```xml')) {
            // 对于 HTML 代码示例，不进行转义，但在渲染时需要特殊处理
            return match;
        } else {
            // 对于其他代码块，转义 HTML 标签
            return '```' + codeContent.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '```';
        }
    });
}

/**
 * 处理代码块，添加复制按钮和语言标签
 * @param {string} html HTML 文本
 * @returns {string} 处理后的 HTML
 */
function processCodeBlocks(html) {
    try {
        // 创建临时 DOM 元素
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        
        // 处理带有语言的代码块
        tempDiv.querySelectorAll('pre code[class^="language-"]').forEach(codeElement => {
            try {
                const pre = codeElement.parentElement;
                const codeBlock = document.createElement('div');
                codeBlock.className = 'code-block';
                
                // 获取语言
                const langClass = Array.from(codeElement.classList).find(cls => cls.startsWith('language-'));
                const language = langClass ? langClass.replace('language-', '') : '';
                
                // 创建代码块头部
                const header = document.createElement('div');
                header.className = 'code-header';
                
                // 添加语言标签
                const langLabel = document.createElement('span');
                langLabel.className = 'code-language';
                langLabel.textContent = language || 'text';
                header.appendChild(langLabel);
                
                // 添加复制按钮
                const copyButton = document.createElement('button');
                copyButton.className = 'copy-button';
                copyButton.textContent = t('chat.copy');
                
                // 确保代码内容被正确转义
                const codeContent = codeElement.textContent;
                copyButton.setAttribute('data-code', codeContent);
                
                header.appendChild(copyButton);
                
                // 将原始代码块包装在新的结构中
                pre.parentNode.insertBefore(codeBlock, pre);
                codeBlock.appendChild(header);
                codeBlock.appendChild(pre);
                
                // 应用代码高亮
                if (hljsLoaded) {
                    // 为代码块添加一个唯一ID，避免重复高亮
                    if (!codeElement.id) {
                        const codeId = `code-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                        codeElement.setAttribute('id', codeId);
                    }
                    
                    // 确保代码内容被正确转义
                    if (!codeElement.classList.contains('hljs')) {
                        try {
                            // 先清空内容，然后重新设置转义后的内容
                            const originalContent = codeElement.textContent;
                            codeElement.textContent = originalContent;
                            
                            if (language === '' || hljsLanguages.includes(language)) {
                                hljs.highlightElement(codeElement);
                            }
                        } catch (error) {
                            console.error('Error highlighting code:', error);
                        }
                    }
                }
            } catch (error) {
                console.error('Error processing code block:', error);
            }
        });
        
        // 处理普通代码块
        tempDiv.querySelectorAll('pre code:not([class^="language-"])').forEach(codeElement => {
            const pre = codeElement.parentElement;
            const codeBlock = document.createElement('div');
            codeBlock.className = 'code-block';
            
            // 创建代码块头部
            const header = document.createElement('div');
            header.className = 'code-header';
            
            // 添加语言标签
            const langLabel = document.createElement('span');
            langLabel.className = 'code-language';
            langLabel.textContent = 'text';
            header.appendChild(langLabel);
            
            // 添加复制按钮
            const copyButton = document.createElement('button');
            copyButton.className = 'copy-button';
            copyButton.textContent = t('chat.copy');
            
            // 确保代码内容被正确转义
            const codeContent = codeElement.textContent;
            copyButton.setAttribute('data-code', codeContent);
            
            header.appendChild(copyButton);
            
            // 将原始代码块包装在新的结构中
            pre.parentNode.insertBefore(codeBlock, pre);
            codeBlock.appendChild(header);
            codeBlock.appendChild(pre);
            
            // 应用代码高亮
            if (hljsLoaded && !codeElement.classList.contains('hljs')) {
                // 为代码块添加一个唯一ID，避免重复高亮
                const codeId = `code-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                codeElement.setAttribute('id', codeId);
                
                // 确保代码内容被正确转义
                const originalContent = codeElement.textContent;
                codeElement.textContent = originalContent;
                
                hljs.highlightElement(codeElement);
            }
        });
        
        return tempDiv.innerHTML;
    } catch (error) {
        console.error('Error processing code blocks:', error);
        return html;
    }
}

/**
 * 应用代码高亮
 * @param {HTMLElement} element 包含代码块的元素
 */
export function applyCodeHighlight(element) {
    if (!hljsLoaded) return;
    
    // 查找所有未高亮的代码块
    element.querySelectorAll('pre code:not(.hljs)').forEach(block => {
        hljs.highlightElement(block);
    });
}

/**
 * 转义 HTML 特殊字符
 * @param {string} text 需要转义的文本
 * @returns {string} 转义后的文本
 */
function escapeHtml(text) {
    const htmlEntities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    
    return text.replace(/[&<>"']/g, (char) => htmlEntities[char]);
} 