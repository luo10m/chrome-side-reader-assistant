/**
 * 代码复制工具
 */

import { t } from './i18n.js';

// 复制代码到剪贴板
export function copyToClipboard(text, button) {
    // 处理特殊的换行符标记
    const processedText = text.replace(/\\n/g, '\n')
                              .replace(/\\r/g, '\r')
                              .replace(/\\t/g, '\t');
    
    navigator.clipboard.writeText(processedText).then(() => {
        const originalText = button.textContent;
        button.textContent = t('chat.copied');
        setTimeout(() => {
            button.textContent = originalText;
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy: ', err);
        button.textContent = 'Error!';
        setTimeout(() => {
            button.textContent = 'Copy';
        }, 2000);
    });
}

/**
 * 添加复制功能的事件监听器
 */
export function addCopyListeners() {
    // 确保 document 已经准备好
    if (!document.body) {
        document.addEventListener('DOMContentLoaded', addCopyListeners);
        return;
    }
    
    // 使用事件委托，监听整个文档的点击事件
    document.body.addEventListener('click', (event) => {
        // 检查点击的是否是复制按钮
        if (event.target.classList.contains('copy-button')) {
            const code = event.target.getAttribute('data-code');
            if (code) {
                // 处理特殊的换行符标记
                const processedCode = code.replace(/\\n/g, '\n')
                                         .replace(/\\r/g, '\r')
                                         .replace(/\\t/g, '\t');
                
                navigator.clipboard.writeText(processedCode).then(() => {
                    const originalText = event.target.textContent;
                    event.target.textContent = t('chat.copied');
                    setTimeout(() => {
                        event.target.textContent = originalText;
                    }, 2000);
                }).catch(err => {
                    console.error('Failed to copy: ', err);
                });
            }
        }
    });
    
    console.log('Copy listeners added');
} 