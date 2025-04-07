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