/**
 * UGC Content Extractor
 * 
 * Provides structured extraction for UGC (User Generated Content) websites
 * Supports extracting title, author, content, media, and comments
 */

// Site adapter registry
const siteAdapters = {};

/**
 * Register a site adapter
 * @param {string} hostPattern - Pattern to match against hostname
 * @param {Object} selectors - CSS selectors for extracting content
 */
function registerSiteAdapter(hostPattern, selectors) {
  siteAdapters[hostPattern] = selectors;
}

/**
 * Get the appropriate adapter for the current site
 * @returns {SiteAdapter|null} Site adapter or null if no matching adapter
 */
function getSiteAdapter() {
  const hostname = window.location.hostname;
  
  // Find matching adapter based on hostname
  for (const [pattern, selectors] of Object.entries(siteAdapters)) {
    if (hostname.includes(pattern)) {
      return new SiteAdapter(selectors);
    }
  }
  
  // No matching adapter found
  console.log(`No site adapter found for hostname: ${hostname}`);
  return null;
}

/**
 * Site adapter for structured content extraction
 */
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
    try {
      const titleElement = document.querySelector(this.selectors.title);
      return titleElement ? titleElement.textContent.trim() : document.title;
    } catch (error) {
      console.error('Error extracting title:', error);
      return document.title;
    }
  }

  extractAuthor() {
    try {
      const authorElement = document.querySelector(this.selectors.author);
      if (!authorElement) return null;
      
      return {
        name: authorElement.textContent.trim(),
        link: authorElement.href || null,
        avatar: this.extractAuthorAvatar()
      };
    } catch (error) {
      console.error('Error extracting author:', error);
      return null;
    }
  }

  extractAuthorAvatar() {
    try {
      const avatarElement = document.querySelector(this.selectors.authorAvatar);
      return avatarElement ? avatarElement.src : null;
    } catch (error) {
      console.error('Error extracting author avatar:', error);
      return null;
    }
  }

  extractContent() {
    try {
      const contentElement = document.querySelector(this.selectors.content);
      return contentElement ? contentElement.innerHTML.trim() : '';
    } catch (error) {
      console.error('Error extracting content:', error);
      return '';
    }
  }

  extractMedia() {
    try {
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

  extractMetadata() {
    try {
      const metadata = {};
      
      // Extract publish date if selector exists
      if (this.selectors.publishDate) {
        const dateElement = document.querySelector(this.selectors.publishDate);
        if (dateElement) {
          metadata.publishDate = dateElement.textContent.trim();
          // Try to parse as date if possible
          try {
            const dateObj = new Date(dateElement.dateTime || dateElement.textContent);
            if (!isNaN(dateObj)) {
              metadata.publishDateISO = dateObj.toISOString();
            }
          } catch (e) {
            // Ignore date parsing errors
          }
        }
      }
      
      // Extract view count if selector exists
      if (this.selectors.viewCount) {
        const viewElement = document.querySelector(this.selectors.viewCount);
        if (viewElement) {
          metadata.viewCount = viewElement.textContent.trim();
        }
      }
      
      // Extract like count if selector exists
      if (this.selectors.likeCount) {
        const likeElement = document.querySelector(this.selectors.likeCount);
        if (likeElement) {
          metadata.likeCount = likeElement.textContent.trim();
        }
      }
      
      return metadata;
    } catch (error) {
      console.error('Error extracting metadata:', error);
      return {};
    }
  }

  extractComments() {
    try {
      const commentElements = document.querySelectorAll(this.selectors.comments);
      const comments = [];

      commentElements.forEach(element => {
        try {
          const authorElement = element.querySelector(this.selectors.commentAuthor);
          const contentElement = element.querySelector(this.selectors.commentContent);
          const dateElement = element.querySelector(this.selectors.commentDate);
          const idAttribute = element.getAttribute(this.selectors.commentIdAttribute);

          if (contentElement) {
            comments.push({
              id: idAttribute || this.generateCommentId(contentElement.textContent),
              author: authorElement ? authorElement.textContent.trim() : '',
              content: contentElement.textContent.trim(),
              date: dateElement ? dateElement.textContent.trim() : '',
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
    try {
      const likesElement = commentElement.querySelector(this.selectors.commentLikes);
      if (!likesElement) return 0;
      
      const likesText = likesElement.textContent.trim();
      const likesMatch = likesText.match(/\d+/);
      return likesMatch ? parseInt(likesMatch[0], 10) : 0;
    } catch (error) {
      console.error('Error extracting comment likes:', error);
      return 0;
    }
  }

  generateCommentId(content) {
    // Simple hash function for generating stable IDs from content
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `comment_${hash}`;
  }
}

// Register site adapters for supported platforms

// Xiaohongshu (Little Red Book) adapter
registerSiteAdapter('xiaohongshu.com', {
  title: '.note-top .title',
  author: '.user-nickname',
  authorAvatar: '.user-avatar img',
  content: '.note-content',
  media: '.note-content img, .note-content video',
  publishDate: '.publish-date',
  likeCount: '.like-wrapper .count',
  comments: '.comment-item',
  commentAuthor: '.user-nickname',
  commentContent: '.content',
  commentDate: '.time',
  commentLikes: '.like-wrapper .count',
  commentIdAttribute: 'data-id'
});

// Also register short links for Xiaohongshu
registerSiteAdapter('xhslink.com', {
  title: '.note-top .title',
  author: '.user-nickname',
  authorAvatar: '.user-avatar img',
  content: '.note-content',
  media: '.note-content img, .note-content video',
  publishDate: '.publish-date',
  likeCount: '.like-wrapper .count',
  comments: '.comment-item',
  commentAuthor: '.user-nickname',
  commentContent: '.content',
  commentDate: '.time',
  commentLikes: '.like-wrapper .count',
  commentIdAttribute: 'data-id'
});

// Zhihu adapter
registerSiteAdapter('zhihu.com', {
  title: '.QuestionHeader-title',
  author: '.AnswerItem .AuthorInfo-name a',
  authorAvatar: '.AnswerItem .AuthorInfo-avatar img',
  content: '.AnswerItem .RichContent-inner',
  media: '.AnswerItem .RichContent-inner img, .AnswerItem .RichContent-inner video',
  publishDate: '.ContentItem-time',
  likeCount: '.VoteButton--up .Button-label',
  viewCount: '.QuestionMainAction',
  comments: '.Comments-item',
  commentAuthor: '.CommentItemV2-meta .UserLink-link',
  commentContent: '.CommentItemV2-content',
  commentDate: '.CommentItemV2-time',
  commentLikes: '.CommentItemV2-footer .Button--plain:first-child',
  commentIdAttribute: 'data-id'
});

/**
 * Extract structured data from the current page
 * @returns {Object|null} Structured data object or null if extraction failed
 */
function extractStructuredData() {
  try {
    // Get the site adapter for the current page
    const adapter = getSiteAdapter();
    if (!adapter) {
      console.log('No site adapter available for this page');
      return null;
    }
    
    // Extract structured data
    const structuredData = adapter.extract();
    
    // Add URL and timestamp
    if (structuredData) {
      structuredData.url = window.location.href;
      structuredData.timestamp = Date.now();
    }
    
    return structuredData;
  } catch (error) {
    console.error('Error in extractStructuredData:', error);
    return null;
  }
}

/**
 * Setup history API monitoring to detect SPA navigation
 * @param {Function} callback - Function to call when URL changes
 * @returns {Function} Cleanup function
 */
function setupHistoryMonitoring(callback) {
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  // Override pushState
  history.pushState = function() {
    const result = originalPushState.apply(this, arguments);
    if (typeof callback === 'function') {
      callback();
    }
    return result;
  };
  
  // Override replaceState
  history.replaceState = function() {
    const result = originalReplaceState.apply(this, arguments);
    if (typeof callback === 'function') {
      callback();
    }
    return result;
  };
  
  // Listen for popstate events
  const popstateHandler = () => {
    if (typeof callback === 'function') {
      callback();
    }
  };
  window.addEventListener('popstate', popstateHandler);
  
  // Return cleanup function
  return () => {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    window.removeEventListener('popstate', popstateHandler);
  };
}

/**
 * Setup mutation observer to detect DOM changes
 * @param {Function} callback - Function to call when relevant DOM changes occur
 * @param {number} throttleMs - Throttle time in milliseconds
 * @returns {Function} Cleanup function
 */
function setupMutationObserver(callback, throttleMs = 500) {
  let timer = null;
  
  // Create mutation observer
  const observer = new MutationObserver(() => {
    // Throttle callback
    if (timer) {
      clearTimeout(timer);
    }
    
    timer = setTimeout(() => {
      if (typeof callback === 'function') {
        callback();
      }
    }, throttleMs);
  });
  
  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Return cleanup function
  return () => {
    observer.disconnect();
    if (timer) {
      clearTimeout(timer);
    }
  };
}

// Export functions
window.UGCExtractor = {
  extractStructuredData,
  setupHistoryMonitoring,
  setupMutationObserver
};
