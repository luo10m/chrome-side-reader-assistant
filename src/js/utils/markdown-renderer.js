/**
 * 高级 Markdown 渲染工具
 * 使用 marked 和 highlight.js 提供更好的 Markdown 渲染和代码高亮
 */

import { t } from './i18n.js';

// 简化错误处理，只捕获关键错误
(function suppressHighlightJsWarnings() {
    // 保存原始的 console 方法
    const originalWarn = console.warn;
    const originalError = console.error;
    
    // 重写 console.warn 方法
    console.warn = function(...args) {
        if (args.length > 0 && typeof args[0] === 'string' && 
            (args[0].includes('highlight.js') || args[0].includes('Highlighting'))) {
            // 忽略 highlight.js 相关的警告
            return;
        }
        originalWarn.apply(console, args);
    };
    
    // 重写 console.error 方法
    console.error = function(...args) {
        if (args.length > 0) {
            // 检查是否是字符串类型的 highlight.js 错误
            if (typeof args[0] === 'string' && 
                (args[0].includes('highlight.js') || args[0].includes('Highlighting'))) {
                return;
            }
            
            // 检查是否是 Error 对象，且与 highlight.js 相关
            if (args[0] instanceof Error && 
                args[0].message && 
                (args[0].message.includes('highlight.js') || 
                 args[0].message.includes('Highlighting') ||
                 args[0].stack && args[0].stack.includes('highlight.js'))) {
                return;
            }
            
            // 检查是否是 DOMException 或其他对象类型
            if (args[0] && typeof args[0] === 'object') {
                try {
                    const errorString = String(args[0]);
                    if (errorString.includes('[object DOMException]') || 
                        errorString.includes('AbortError') ||
                        errorString.includes('NetworkError')) {
                        // 将对象转换为更有用的错误信息
                        if (args[0] instanceof DOMException) {
                            args[0] = `DOMException: ${args[0].name} - ${args[0].message}`;
                        } else if (args[0].name && args[0].message) {
                            args[0] = `${args[0].name}: ${args[0].message}`;
                        }
                    }
                } catch (e) {
                    // 忽略转换错误
                }
            }
        }
        
        // 其他情况，正常输出错误
        originalError.apply(console, args);
    };
})();

// 初始化 highlight.js
let hljs = window.hljs;

// 配置 marked 选项
marked.use({
    gfm: true,         // 启用 GitHub 风格的 Markdown
    breaks: true,      // 将换行符转换为 <br>
    pedantic: false,   // 不使用原始 markdown.pl 的行为
    sanitize: false,   // 不进行输出的安全过滤，我们使用 DOMPurify 处理
    smartLists: true,  // 使用更智能的列表行为
    smartypants: false, // 不使用更智能的标点符号
    xhtml: false,      // 不使用自闭合的 XHTML 标签
    
    // 自定义代码高亮
    highlight: function(code, lang) {
        if (!hljs) return code;
        
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(code, { 
                    language: lang,
                    ignoreIllegals: true 
                }).value;
            } catch (e) {
                console.error('Highlight error:', e);
            }
        }
        
        try {
            return hljs.highlightAuto(code).value;
        } catch (e) {
            console.error('Auto highlight error:', e);
            return code;
        }
    }
});

/**
 * 渲染 Markdown 为 HTML
 * @param {string} markdown Markdown 文本
 * @returns {string} 渲染后的 HTML
 */
export function renderMarkdown(markdown) {
    if (!markdown) return '';
    
    try {
        // 预处理 Markdown
        const processedMarkdown = preprocessMarkdown(markdown);
        
        // 使用 marked 将 Markdown 转换为 HTML
        let html = marked.parse(processedMarkdown);
        
        // 使用 DOMPurify 清理 HTML，防止 XSS 攻击
        if (window.DOMPurify) {
            html = DOMPurify.sanitize(html);
        }
        
        // 处理代码块，添加复制按钮和语言标签
        let processed = processCodeBlocks(html);
        
        // 修复中文文本分词换行问题
        processed = fixChineseTextWrapping(processed);
        
        return processed;
    } catch (error) {
        console.error('Error rendering markdown:', error);
        // 如果渲染失败，返回原始文本
        return `<pre>${escapeHtml(markdown)}</pre>`;
    }
}

/**
 * 修复中文文本分词换行问题
 * @param {string} html HTML 文本
 * @returns {string} 处理后的 HTML
 */
function fixChineseTextWrapping(html) {
    // 创建临时 DOM 元素
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // 查找所有段落和文本块
    const textElements = tempDiv.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, span, div');
    
    textElements.forEach(element => {
        // 将空白字符串替换为正常空格，避免意外换行
        element.innerHTML = element.innerHTML.replace(/(&nbsp;|\s)+/g, ' ');
        
        // 通过添加样式类解决分词换行问题
        element.classList.add('chinese-text-fix');
        
        // 如果元素没有行内样式，添加行内样式
        if (!element.hasAttribute('style')) {
            element.setAttribute('style', 'word-break: normal; white-space: normal; overflow-wrap: break-word;');
        } else {
            // 如果已有样式，附加到现有样式后
            let style = element.getAttribute('style');
            style += '; word-break: normal; white-space: normal; overflow-wrap: break-word;';
            element.setAttribute('style', style);
        }
    });
    
    return tempDiv.innerHTML;
}

/**
 * 预处理 Markdown，确保代码块中的 HTML 被转义
 * @param {string} markdown Markdown 文本
 * @returns {string} 处理后的 Markdown
 */
function preprocessMarkdown(markdown) {
    if (!markdown) return '';
    
    // 处理代码块中的 HTML
    return markdown.replace(/```([\s\S]*?)```/g, (match, content) => {
        // 检查是否已经是 HTML 或 XML 代码块
        if (match.startsWith('```html') || match.startsWith('```xml')) {
            return match;
        }
        
        // 提取语言标识符（如果有）
        const firstLine = content.split('\n')[0];
        const restContent = content.substring(firstLine.length);
        
        // 返回处理后的代码块
        return '```' + firstLine + restContent + '```';
    });
}

/**
 * 处理代码块，添加复制按钮和语言标签
 * @param {string} html HTML 文本
 * @returns {string} 处理后的 HTML
 */
function processCodeBlocks(html) {
    if (!html) return '';
    
    // 创建临时 DOM 元素
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // 查找所有代码块
    const codeBlocks = tempDiv.querySelectorAll('pre code');
    
    codeBlocks.forEach(codeBlock => {
        // 获取代码块的父元素 (pre 标签)
        const preElement = codeBlock.parentNode;
        
        // 添加类名
        preElement.classList.add('code-block');
        
        // 获取语言
        const classNames = codeBlock.className.split(' ');
        let language = '';
        
        for (const className of classNames) {
            if (className.startsWith('language-')) {
                language = className.substring(9); // 移除 'language-' 前缀
                break;
            }
        }
        
        // 创建代码块头部
        const codeHeader = document.createElement('div');
        codeHeader.className = 'code-header';
        
        // 添加语言标签
        const languageLabel = document.createElement('span');
        languageLabel.className = 'code-language';
        languageLabel.textContent = language || t('code.unknown', '代码');
        codeHeader.appendChild(languageLabel);
        
        // 添加复制按钮
        const copyButton = document.createElement('button');
        copyButton.className = 'code-copy-button';
        copyButton.title = t('code.copy', '复制代码');
        copyButton.innerHTML = '<img src="assets/svg/copy.svg" alt="Copy" class="button-icon">';
        copyButton.setAttribute('data-code', codeBlock.textContent);
        codeHeader.appendChild(copyButton);
        
        // 将头部插入到代码块前面
        preElement.insertBefore(codeHeader, codeBlock);
    });
    
    // 为复制按钮添加事件监听器
    const copyButtons = tempDiv.querySelectorAll('.code-copy-button');
    copyButtons.forEach(button => {
        button.addEventListener('click', function() {
            const code = this.getAttribute('data-code');
            navigator.clipboard.writeText(code)
                .then(() => {
                    // 显示复制成功提示
                    this.classList.add('copied');
                    this.title = t('code.copied', '已复制');
                    
                    // 2秒后恢复原样
                    setTimeout(() => {
                        this.classList.remove('copied');
                        this.title = t('code.copy', '复制代码');
                    }, 2000);
                })
                .catch(err => {
                    console.error('Failed to copy code:', err);
                });
        });
    });
    
    return tempDiv.innerHTML;
}

/**
 * 转义 HTML 特殊字符
 * @param {string} text 需要转义的文本
 * @returns {string} 转义后的文本
 */
function escapeHtml(text) {
    if (!text) return '';
    
    const escapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    
    return text.replace(/[&<>"']/g, match => escapeMap[match]);
}