// 全局错误处理
window.addEventListener('error', function(event) {
    // 检查是否是 highlight.js 相关的错误
    if (event.filename && event.filename.includes('highlight')) {
        // 阻止错误传播
        event.preventDefault();
        return false;
    }
});

// 捕获未处理的 Promise 拒绝
window.addEventListener('unhandledrejection', function(event) {
    // 检查是否是 highlight.js 相关的错误
    if (event.reason && event.reason.stack && 
        event.reason.stack.includes('highlight')) {
        // 阻止错误传播
        event.preventDefault();
        return false;
    }
}); 