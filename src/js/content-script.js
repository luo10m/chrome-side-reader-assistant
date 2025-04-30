// 监听消息以复制代码
document.addEventListener('click', (event) => {
    if (event.target.classList.contains('copy-button')) {
        const code = event.target.getAttribute('data-code');
        if (code) {
            // 处理特殊的换行符标记
            const processedCode = code.replace(/\\n/g, '\n')
                                     .replace(/\\r/g, '\r')
                                     .replace(/\\t/g, '\t');
            
            navigator.clipboard.writeText(processedCode).then(() => {
                const button = event.target;
                const originalText = button.textContent;
                button.textContent = 'Copied!';
                setTimeout(() => {
                    button.textContent = originalText;
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy: ', err);
            });
        } else {
            // 如果没有 data-code 属性，尝试从代码块获取
            const codeBlock = event.target.closest('.code-block');
            if (codeBlock) {
                const codeElement = codeBlock.querySelector('code');
                if (codeElement) {
                    const code = codeElement.textContent;
                    navigator.clipboard.writeText(code).then(() => {
                        const button = event.target;
                        const originalText = button.textContent;
                        button.textContent = 'Copied!';
                        setTimeout(() => {
                            button.textContent = originalText;
                        }, 2000);
                    }).catch(err => {
                        console.error('Failed to copy: ', err);
                    });
                }
            }
        }
    }
}); 

// =============================================================
// 新增：抓取当前页面正文并发送给后台
// =============================================================
function extractPageText() {
    try {
        // 获取页面标题和URL
        const title = document.title;
        const url = location.href;
        
        // 获取页面内容（简易版，使用innerText）
        // 注意：复杂网页可以考虑使用Readability等算法提取主要内容
        const text = document.body ? document.body.innerText : '';
        
        // 发送消息到后台脚本
        chrome.runtime.sendMessage({
            action: 'pageContent',
            url: url,
            title: title,  // 添加标题，便于用户识别
            content: text,
            timestamp: Date.now()
        });
        
        console.log('Page content extracted and sent to background');
    } catch (e) {
        console.error('Failed to extract page text', e);
    }
}

// 页面加载完成后执行内容提取
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', extractPageText, { once: true });
} else {
    extractPageText();
}

// 监听来自侧边栏的消息，处理手动刷新内容的请求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractPageContent') {
        // 重新提取页面内容
        extractPageText();
        
        // 发送成功响应
        sendResponse({ success: true });
    }
    
    // 返回true表示将异步发送响应
    return true;
});