/**
 * Site adapters for structured content extraction
 * Maps hostnames to CSS selectors for extracting structured content
 * 设计文档：MVT¹ 站点适配 + 结构化抓取
 */

// 工具函数 - 符合设计文档中的工具函数要求

/**
 * 获取元素的文本内容
 * @param {Element} element - DOM元素
 * @returns {string} 文本内容
 */
function getTextContent(element) {
  if (!element) return '';
  return element.textContent.trim();
}

/**
 * 提取元素的文本
 * @param {string} selector - CSS选择器
 * @param {Element} context - 上下文元素，默认为document
 * @returns {string} 文本内容
 */
function extractText(selector, context = document) {
  const element = context.querySelector(selector);
  return getTextContent(element);
}

/**
 * 提取元素的HTML内容
 * @param {string} selector - CSS选择器
 * @param {Element} context - 上下文元素，默认为document
 * @returns {string} HTML内容
 */
function extractHtml(selector, context = document) {
  const element = context.querySelector(selector);
  if (!element) return '';
  return element.innerHTML.trim();
}

/**
 * 提取元素的属性值
 * @param {string} selector - CSS选择器
 * @param {string} attribute - 属性名
 * @param {Element} context - 上下文元素，默认为document
 * @returns {string} 属性值
 */
function extractAttribute(selector, attribute, context = document) {
  const element = context.querySelector(selector);
  if (!element) return '';
  return element.getAttribute(attribute) || '';
}

/**
 * 生成稳定的评论id
 * @param {string} content - 评论内容
 * @param {string} author - 评论作者
 * @param {string} date - 评论日期
 * @returns {string} 生成的稳定 ID
 */
function generateStableId(content, author = '', date = '') {
  // 结合作者、内容和日期生成更稳定的ID
  const combinedString = `${author}_${content}_${date}`.trim();
  
  // 使用简单的哈希函数生成稳定的ID
  let hash = 0;
  for (let i = 0; i < combinedString.length; i++) {
    const char = combinedString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为32位整数
  }
  
  // 使用绝对值确保正数
  hash = Math.abs(hash);
  return `comment_${hash}`;
}

// Site adapter interface
class SiteAdapter {
  constructor(selectors) {
    this.selectors = selectors;
  }

  /**
   * Extract structured content from the page
   * @returns {Object} Structured content with title, author, content, and comments
   */
  extract() {
    try {
      // Extract basic post information
      const title = this.extractTitle();
      const author = this.extractAuthor();
      const content = this.extractContent();
      const media = this.extractMedia();
      const comments = this.extractComments();
      const metadata = this.extractMetadata();

      return {
        title,
        post: {
          author,
          content,
          media,
          metadata
        },
        comments
      };
    } catch (error) {
      console.error('Error extracting structured content:', error);
      return null;
    }
  }

  extractTitle() {
    return extractText(this.selectors.title) || document.title;
  }

  extractAuthor() {
    const authorElement = document.querySelector(this.selectors.author);
    if (!authorElement) return null;
    
    return {
      name: getTextContent(authorElement),
      link: authorElement.href || null,
      avatar: this.extractAuthorAvatar()
    };
  }

  extractAuthorAvatar() {
    const avatarElement = document.querySelector(this.selectors.authorAvatar);
    return avatarElement ? avatarElement.src : null;
  }

  extractContent() {
    return extractHtml(this.selectors.content);
  }

  extractMetadata() {
    const metadata = {};
    
    // 提取发布日期
    if (this.selectors.publishDate) {
      metadata.publishDate = extractText(this.selectors.publishDate);
    }
    
    // 提取点赞数
    if (this.selectors.likeCount) {
      metadata.likeCount = extractText(this.selectors.likeCount);
    }
    
    // 提取浏览量
    if (this.selectors.viewCount) {
      metadata.viewCount = extractText(this.selectors.viewCount);
    }
    
    return metadata;
  }

  extractMedia() {
    try {
      // 如果有站点特定的媒体处理函数，优先使用
      if (typeof this.selectors.postMediaUrls === 'function') {
        const contentElement = document.querySelector(this.selectors.content);
        return this.selectors.postMediaUrls(contentElement);
      }
      
      // 否则使用通用提取逻辑
      const mediaElements = document.querySelectorAll(this.selectors.media);
      const media = [];

      mediaElements.forEach(element => {
        if (element.tagName === 'IMG') {
          media.push({
            type: 'image',
            url: element.src,
            alt: element.alt || ''
          });
        } else if (element.tagName === 'VIDEO') {
          media.push({
            type: 'video',
            url: element.src || element.querySelector('source')?.src,
            poster: element.poster || ''
          });
        }
      });

      return media;
    } catch (error) {
      console.error('Error extracting media:', error);
      return [];
    }
  }

  extractComments() {
    try {
      const commentElements = document.querySelectorAll(this.selectors.comments);
      const comments = [];

      commentElements.forEach(element => {
        try {
          // 尝试多种方式提取作者信息
          const authorSelectors = [
            this.selectors.commentAuthor,           // 主要选择器
            '.comment-author',                      // 备用选择器1
            '.user-name',                           // 备用选择器2
            '.nickname',                            // 备用选择器3
            'a[data-user-name]',                    // 属性选择器
            '[class*="author"]',                   // 模糊选择器
          ];

          let authorName = '';
          for (const selector of authorSelectors) {
            const authorElement = element.querySelector(selector);
            if (authorElement) {
              authorName = getTextContent(authorElement);
              break;
            }
          }

          const contentElement = element.querySelector(this.selectors.commentContent);
          const dateElement = element.querySelector(this.selectors.commentDate);
          const idAttribute = element.getAttribute(this.selectors.commentIdAttribute);

          if (contentElement) {
            const commentContent = getTextContent(contentElement);
            const commentDate = dateElement ? getTextContent(dateElement) : '';
            
            // 使用站点提供的ID或生成稳定的ID
            const commentId = idAttribute || generateStableId(commentContent, authorName, commentDate);
            
            // 添加额外的作者信息提取方法
            if (!authorName) {
              // 尝试从其他属性提取作者信息
              const dataUserAttr = element.getAttribute('data-user');
              const dataAuthorAttr = element.getAttribute('data-author');
              
              if (dataUserAttr) {
                authorName = dataUserAttr;
              } else if (dataAuthorAttr) {
                authorName = dataAuthorAttr;
              }
            }

            comments.push({
              id: commentId,
              author: authorName,
              content: commentContent,
              date: commentDate,
              likes: this.extractCommentLikes(element)
            });
          }
        } catch (commentError) {
          console.error('Error extracting individual comment:', commentError);
          // Continue with other comments
        }
      });

      return comments;
    } catch (error) {
      console.error('Error extracting comments:', error);
      return [];
    }
  }

  extractCommentLikes(commentElement) {
    const likesElement = commentElement.querySelector(this.selectors.commentLikes);
    if (!likesElement) return 0;
    
    const likesText = getTextContent(likesElement);
    const likesMatch = likesText.match(/\d+/);
    return likesMatch ? parseInt(likesMatch[0], 10) : 0;
  }
}

/**
 * 站点特定处理函数
 */

// 小红书特定的处理函数

/**
 * 获取小红书帖子中的原始图片URL
 * @param {Element} mediaElement - 媒体元素
 * @returns {string} 原始图片URL
 */
function getXiaohongshuFullImageUrl(mediaElement) {
  if (!mediaElement) return '';
  
  // 获取小红书原始图片URL，需要处理提取原始URL
  let imgUrl = mediaElement.src;
  
  // 小红书图片URL处理，移除压缩参数获取原图
  if (imgUrl && imgUrl.includes('xhs-cn.com')) {
    // 移除尺寸参数，返回原始大图
    imgUrl = imgUrl.replace(/!\w+$/, '');
  }
  
  return imgUrl;
}

/**
 * 提取小红书帖子中的媒体URL数组
 * @param {Element} contentElement - 内容元素
 * @returns {Array} 媒体URL数组
 */
function extractXiaohongshuMediaUrls(contentElement) {
  const mediaUrls = [];
  if (!contentElement) return mediaUrls;
  
  // 提取所有图片
  const imgElements = contentElement.querySelectorAll('img');
  imgElements.forEach(img => {
    const fullUrl = getXiaohongshuFullImageUrl(img);
    if (fullUrl) {
      mediaUrls.push({
        type: 'image',
        url: fullUrl,
        alt: img.alt || ''
      });
    }
  });
  
  // 提取所有视频
  const videoElements = contentElement.querySelectorAll('video');
  videoElements.forEach(video => {
    const videoUrl = video.src || video.querySelector('source')?.src;
    if (videoUrl) {
      mediaUrls.push({
        type: 'video',
        url: videoUrl,
        poster: video.poster || ''
      });
    }
  });
  
  return mediaUrls;
}

// 知乎特定的处理函数

/**
 * 提取知乎回答中的媒体URL数组
 * @param {Element} contentElement - 内容元素
 * @returns {Array} 媒体URL数组
 */
function extractZhihuMediaUrls(contentElement) {
  const mediaUrls = [];
  if (!contentElement) return mediaUrls;
  
  // 提取所有图片，知乎的图片需要特殊处理
  const imgElements = contentElement.querySelectorAll('img');
  imgElements.forEach(img => {
    let imgUrl = img.src || img.getAttribute('data-original');
    
    // 如果是知乎的图片，尝试获取原始大图
    if (imgUrl && imgUrl.includes('zhimg.com')) {
      // 移除尺寸参数，用原图替代
      imgUrl = imgUrl.replace(/_\w+\..+$/, '');
    }
    
    if (imgUrl) {
      mediaUrls.push({
        type: 'image',
        url: imgUrl,
        alt: img.alt || ''
      });
    }
  });
  
  // 提取所有视频
  const videoElements = contentElement.querySelectorAll('video');
  videoElements.forEach(video => {
    const videoUrl = video.src || video.querySelector('source')?.src;
    if (videoUrl) {
      mediaUrls.push({
        type: 'video',
        url: videoUrl,
        poster: video.poster || ''
      });
    }
  });
  
  return mediaUrls;
}

// 小红书适配器
const xiaohongshuSelectors = {
  title: '.note-top .title, .note-content .title',  // 更广泛的选择器
  author: '.user-nickname, .author .name',          // 适配不同版本的选择器
  authorAvatar: '.user-avatar img, .author .avatar img',
  content: '.note-content',
  media: '.note-content img, .note-content video',
  publishDate: '.publish-date, .create-time',      // 适配不同版本
  likeCount: '.like-wrapper .count, .operation-wrapper .like .count',
  commentCount: '.operation-wrapper .comment .count',
  comments: '.comment-item, .comment-list .comment-item',
  commentAuthor: '.user-nickname, .comment-user-name .name, .comment-author, .user-name, .nickname, a[data-user-name], [class*="author"]',
  commentContent: '.content, .comment-content',
  commentDate: '.time, .comment-time',
  commentLikes: '.like-wrapper .count, .like .count',
  commentIdAttribute: 'data-id',
  // 添加站点特定处理函数
  postMediaUrls: extractXiaohongshuMediaUrls
};

// 为小红书短链接注册相同的选择器
const xhslinkSelectors = xiaohongshuSelectors;

// 知乎适配器
const zhihuSelectors = {
  title: '.QuestionHeader-title',
  author: '.AnswerItem .AuthorInfo-name a, .AuthorInfo-name',
  authorAvatar: '.AnswerItem .AuthorInfo-avatar img, .AuthorInfo-avatar img',
  content: '.AnswerItem .RichContent-inner, .RichContent-inner',
  media: '.AnswerItem .RichContent-inner img, .RichContent-inner img, .RichContent-inner video',
  publishDate: '.ContentItem-time span, .ContentItem-time',
  likeCount: '.VoteButton--up .Button-label, .VoteButton--up',
  commentCount: '.Button--withIcon.Button--plain:nth-child(2)',
  viewCount: '.QuestionMainAction, .ViewCount',
  comments: '.Comments-item, .CommentItem',
  commentAuthor: '.CommentItemV2-meta .UserLink-link, .CommentItemV2-meta .UserLink, .CommentItem .CommentItemV2-meta a',
  commentContent: '.CommentItemV2-content, .CommentItem .CommentContent',
  commentDate: '.CommentItemV2-time, .CommentItem .CommentItemMeta time',
  commentLikes: '.CommentItemV2-footer .Button--plain:first-child, .CommentItem .VoteButton',
  commentIdAttribute: 'data-id',
  // 添加站点特定处理函数
  postMediaUrls: extractZhihuMediaUrls
};

// Map of hostname patterns to selectors
const siteAdapters = {
  'xiaohongshu.com': xiaohongshuSelectors,
  'xhslink.com': xhslinkSelectors, // Short links for Xiaohongshu
  'zhihu.com': zhihuSelectors
};

/**
 * 根据URL获取适配器
 * @param {string} url - 页面URL
 * @returns {SiteAdapter|null} 站点适配器或null
 */
function getAdapterByUrl(url) {
  try {
    // 解析URL获取hostname
    const hostname = new URL(url).hostname;
    
    // 根据hostname匹配适配器
    for (const [pattern, selectors] of Object.entries(siteAdapters)) {
      if (hostname.includes(pattern)) {
        return new SiteAdapter(selectors);
      }
    }
    
    console.log(`没有找到匹配的站点适配器: ${hostname}`);
    return null;
  } catch (error) {
    console.error('获取适配器时出错:', error);
    return null;
  }
}

/**
 * 获取当前页面的适配器
 * @returns {SiteAdapter|null} 站点适配器或null
 */
function getSiteAdapter() {
  return getAdapterByUrl(window.location.href);
}

/**
 * 提取结构化数据
 * @param {string} url - 页面URL，默认为当前页面
 * @returns {Object|null} 结构化数据或null
 */
function extractStructuredData(url = window.location.href) {
  try {
    const adapter = getAdapterByUrl(url);
    if (!adapter) {
      console.log(`没有为 URL ${url} 找到适配器`);
      return null;
    }
    
    const extractedData = adapter.extract();
    if (!extractedData) {
      console.log('适配器提取失败');
      return null;
    }
    
    // 保证数据格式符合设计文档要求
    const structuredData = {
      // 基本信息
      url: url,
      title: extractedData.title || document.title,
      timestamp: Date.now(),
      source: new URL(url).hostname,
      
      // 帖子数据
      post: {
        author: extractedData.post.author || null,
        content: extractedData.post.content || '',
        media: extractedData.post.media || [],
        metadata: extractedData.post.metadata || {}
      },
      
      // 评论数据
      comments: Array.isArray(extractedData.comments) ? extractedData.comments.map(comment => ({
        id: comment.id,
        author: comment.author || '', // 保留原始作者信息，不使用默认值
        content: comment.content || '',
        date: comment.date || '',
        likes: comment.likes || 0
      })) : []
    };
    
    return structuredData;
  } catch (error) {
    console.error('提取结构化数据失败:', error);
    return null;
  }
}

// 导出函数和适配器
window.siteAdapters = {
  getAdapterByUrl,
  getSiteAdapter,
  extractStructuredData
};
