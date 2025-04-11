/**
 * 简化版 Markdown 格式化工具
 * 主要处理代码块和基本格式
 */

// 格式化 Markdown 文本为 HTML
export function formatMarkdown(text) {
    if (!text) return '';
    
    let formatted = text;
    
    // 转义 HTML 特殊字符
    formatted = escapeHtml(formatted);
    
    // 处理代码块 (```code```)
    formatted = formatted.replace(/```([\s\S]*?)```/g, (match, codeContent) => {
        // 检测语言
        const firstLine = codeContent.trim().split('\n')[0];
        let language = '';
        let code = codeContent;
        
        if (firstLine && !firstLine.includes(' ') && firstLine.length < 20) {
            language = firstLine;
            code = codeContent.substring(firstLine.length).trim();
        }
        
        const languageClass = language ? ` class="language-${language}"` : '';
        
        // 确保代码中的换行符不会被后续处理替换为 <br>
        // 使用 textContent 属性而不是 innerHTML 来避免 HTML 解析问题
        const escapedCode = code.replace(/&/g, '&amp;')
                               .replace(/</g, '&lt;')
                               .replace(/>/g, '&gt;')
                               .replace(/"/g, '&quot;')
                               .replace(/'/g, '&#39;');
        
        // 创建一个安全的 data-code 属性值，用于复制功能
        // 将换行符替换为特殊标记，以便在复制时能够正确处理
        const dataCode = escapedCode.replace(/\n/g, '\\n')
                                   .replace(/\r/g, '\\r')
                                   .replace(/\t/g, '\\t');
        
        // 使用 data 属性而不是内联脚本，并确保代码中的换行符保持原样
        return `<div class="code-block">
            <div class="code-header">
                ${language ? `<span class="code-language">${language}</span>` : ''}
                <button class="copy-button" i18n-title="chat.copy" data-code="${dataCode}">Copy</button>
            </div>
            <pre><code${languageClass}>${escapedCode}</code></pre>
        </div>`;
    });
    
    // 处理内联代码 (`code`)
    formatted = formatted.replace(/`([^`]+)`/g, (match, code) => {
        return `<code>${code}</code>`;
    });
    
    // 处理换行
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
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
    
    // 先保留代码块内容
    const codeBlocks = [];
    text = text.replace(/```([\s\S]*?)```/g, (match) => {
        codeBlocks.push(match);
        return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });
    
    // 先保留内联代码内容
    const inlineCodes = [];
    text = text.replace(/`([^`]+)`/g, (match) => {
        inlineCodes.push(match);
        return `__INLINE_CODE_${inlineCodes.length - 1}__`;
    });
    
    // 转义 HTML 特殊字符
    text = text.replace(/[&<>"']/g, (char) => htmlEntities[char]);
    
    // 恢复代码块内容
    codeBlocks.forEach((block, index) => {
        text = text.replace(`__CODE_BLOCK_${index}__`, block);
    });
    
    // 恢复内联代码内容
    inlineCodes.forEach((code, index) => {
        text = text.replace(`__INLINE_CODE_${index}__`, code);
    });
    
    return text;
}