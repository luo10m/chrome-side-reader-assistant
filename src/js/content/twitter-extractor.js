/**
 * Twitter/X.com 推文提取模块
 * 提供可靠的推文正文、图片、视频提取功能
 */

/**
 * 等待指定选择器的元素出现
 * @param {string} selector - CSS选择器
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<Element>} - 返回找到的元素
 */
export function waitForElement(selector, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    
    (function loop() {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (Date.now() - start > timeout) return reject(new Error(`等待元素超时: ${selector}`));
      requestAnimationFrame(loop);
    })();
  });
}

/**
 * 提取推文内容，包括文本、HTML、图片和视频
 * @param {number} selectorTimeout - 选择器等待超时时间（毫秒）
 * @returns {Promise<Object>} - 返回包含推文内容的对象
 */
export async function extractTweet(selectorTimeout = 8000) {
  try {
    // 等待推文文本元素出现
    const textElement = await waitForElement('article div[data-testid="tweetText"]', selectorTimeout);
    // 获取包含整个推文的article元素
    const article = textElement.closest('article');
    
    if (!article) {
      throw new Error('无法找到完整的推文元素');
    }

    // 提取文本内容（纯文本）
    const text = textElement.innerText.trim();
    
    // 提取HTML内容（保留格式、表情符号等）
    const textHtml = textElement.innerHTML;
    
    // 提取图片
    const images = [...article.querySelectorAll('div[data-testid="tweetPhoto"] img')]
      .map(img => img.src)
      .filter(src => src && !src.includes('placeholder'));
    
    // 提取视频
    const videos = [...article.querySelectorAll('video')]
      .map(video => video.src)
      .filter(Boolean);
    
    // 提取作者信息
    let author = '';
    const authorElement = article.querySelector('div[data-testid="User-Name"]');
    if (authorElement) {
      author = authorElement.textContent.trim();
    }
    
    // 提取发布时间
    let publishTime = '';
    const timeElement = article.querySelector('time');
    if (timeElement) {
      publishTime = timeElement.getAttribute('datetime');
    }
    
    return {
      text,
      html: textHtml,
      images,
      videos,
      author,
      publishTime,
      url: window.location.href
    };
  } catch (error) {
    console.error('提取推文失败:', error);
    throw error;
  }
}

/**
 * 检测页面是否为Twitter/X.com
 * @returns {boolean} - 是否为Twitter/X.com页面
 */
export function isTwitterPage() {
  const hostname = window.location.hostname;
  return hostname.match(/(^|\.)x\.com$/) || hostname.match(/(^|\.)twitter\.com$/);
}

/**
 * 检测URL是否为单条推文页面
 * @param {string} url - 要检查的URL
 * @returns {boolean} - 是否为单条推文页面
 */
export function isTweetPage(url = window.location.href) {
  // Twitter/X.com单条推文URL格式: twitter.com/username/status/123456789
  // 或 x.com/username/status/123456789
  return /\/(x|twitter)\.com\/[^\/]+\/status\/\d+/.test(url);
}

/**
 * 监听Twitter/X.com页面导航和DOM变化
 * @param {Function} callback - 当推文内容变化时的回调函数
 * @returns {Function} - 用于停止监听的函数
 */
export function watchTwitterPage(callback) {
  if (!isTwitterPage()) return () => {};
  
  let lastUrl = window.location.href;
  let extractionTimer = null;
  
  // 尝试提取推文并通过回调返回
  const tryExtractTweet = async (reason) => {
    if (!isTweetPage()) return;
    
    try {
      clearTimeout(extractionTimer);
      extractionTimer = setTimeout(async () => {
        const tweetData = await extractTweet();
        if (callback && typeof callback === 'function') {
          callback({
            action: 'tweetExtracted',
            reason,
            ...tweetData
          });
        }
      }, 700); // 延迟700ms，等待内容完全加载
    } catch (error) {
      console.debug('[Twitter提取器] 未找到推文:', error);
    }
  };
  
  // 监听URL变化
  const checkUrlChange = () => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      tryExtractTweet('urlChange');
    }
  };
  
  // 重写history API
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function() {
    const result = originalPushState.apply(this, arguments);
    checkUrlChange();
    return result;
  };
  
  history.replaceState = function() {
    const result = originalReplaceState.apply(this, arguments);
    checkUrlChange();
    return result;
  };
  
  // 监听popstate事件
  const popstateHandler = () => tryExtractTweet('popstate');
  window.addEventListener('popstate', popstateHandler);
  
  // 使用MutationObserver监听DOM变化
  const observer = new MutationObserver(() => {
    if (isTweetPage()) {
      tryExtractTweet('domChange');
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // 初始提取
  tryExtractTweet('initial');
  
  // 返回清理函数
  return () => {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    window.removeEventListener('popstate', popstateHandler);
    observer.disconnect();
    clearTimeout(extractionTimer);
  };
}
