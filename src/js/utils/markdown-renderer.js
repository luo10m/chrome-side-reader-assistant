/**
 * 高级 Markdown 渲染工具
 * 使用 marked 和 highlight.js 提供更好的 Markdown 渲染和代码高亮
 */

import { t } from './i18n.js';

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

// 渲染 Markdown 为 HTML
export function renderMarkdown(markdown) {
    if (!markdown) return '';
    
    // 使用 marked 将 Markdown 转换为 HTML
    const html = marked.parse(markdown);
    
    // 使用 DOMPurify 清理 HTML，防止 XSS 攻击
    const sanitized = DOMPurify.sanitize(html);
    
    // 处理代码块，添加复制按钮和语言标签
    const processed = processCodeBlocks(sanitized);
    
    return processed;
}

/**
 * 处理代码块，添加复制按钮和语言标签
 * @param {string} html HTML 文本
 * @returns {string} 处理后的 HTML
 */
function processCodeBlocks(html) {
    // 创建临时 DOM 元素
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // 处理带有语言的代码块
    tempDiv.querySelectorAll('pre code[class^="language-"]').forEach(codeElement => {
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
        copyButton.setAttribute('data-code', codeElement.textContent);
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
            
            // 只有当代码块没有高亮过时才应用高亮
            if (!codeElement.classList.contains('hljs')) {
                if (language === '' || hljsLanguages.includes(language)) {
                    hljs.highlightElement(codeElement);
                }
            }
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
        copyButton.setAttribute('data-code', codeElement.textContent);
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
            
            hljs.highlightElement(codeElement);
        }
    });
    
    return tempDiv.innerHTML;
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

// 转义 HTML 特殊字符
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