/**
 * 高级 Markdown 渲染工具
 * 使用 marked 和 highlight.js 提供更好的 Markdown 渲染和代码高亮
 */

// 初始化 highlight.js 和 marked
function initMarkdownRenderer() {
    // 检查 highlight.js 是否已加载
    if (typeof hljs === 'undefined') {
        console.error('highlight.js is not loaded!');
        return;
    }
    
    console.log('highlight.js loaded, available languages:', hljs.listLanguages());
    
    // 配置 highlight.js
    hljs.configure({
        languages: ['javascript', 'html', 'xml', 'css', 'python', 'java', 'cpp', 'json'],
        ignoreUnescapedHTML: true
    });

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
}

// 包装代码块的函数
function wrapCodeBlock(html) {
    let codeBlockCount = 0;
    return html.replace(/<pre><code[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/code><\/pre>/g, 
        (match, classNames, code) => {
            const id = `code-${Date.now()}-${codeBlockCount++}`;
            const languageMatch = classNames.match(/language-(\w+)/);
            const language = languageMatch ? languageMatch[1] : 'text';
            
            console.log(`Wrapping code block with language: ${language}, class names: ${classNames}`);
            
            // 为复制功能准备代码
            const decodedCode = code
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'");
            
            // 将换行符编码为特殊标记，以便在复制时能够正确处理
            const encodedCode = decodedCode
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(/\t/g, '\\t')
                .replace(/"/g, '&quot;');
            
            return `
                <div class="code-block">
                    <div class="code-header">
                        <span class="code-language">${language}</span>
                        <button class="copy-button" data-code="${encodedCode}">Copy</button>
                    </div>
                    <pre><code id="${id}" class="${classNames}">${code}</code></pre>
                </div>
            `;
        }
    );
}

// 渲染 Markdown 为 HTML
export function renderMarkdown(text) {
    if (!text) return '';
    
    // 确保 marked 和 hljs 已初始化
    if (typeof marked === 'undefined' || typeof hljs === 'undefined') {
        console.error('marked or highlight.js not loaded');
        return escapeHtml(text).replace(/\n/g, '<br>');
    }
    
    // 初始化渲染器
    initMarkdownRenderer();
    
    try {
        // 使用 marked 渲染 Markdown
        let html = marked.parse(text);
        
        // 包装代码块
        html = wrapCodeBlock(html);
        
        // 使用 DOMPurify 清理 HTML
        if (typeof DOMPurify !== 'undefined') {
            html = DOMPurify.sanitize(html);
        }
        
        // 返回处理后的 HTML
        const result = html;
        
        // 使用 setTimeout 确保 DOM 已更新后再初始化高亮
        setTimeout(() => {
            // 手动初始化所有代码块
            document.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
        }, 0);
        
        return result;
    } catch (error) {
        console.error('Error rendering markdown:', error);
        return escapeHtml(text).replace(/\n/g, '<br>');
    }
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