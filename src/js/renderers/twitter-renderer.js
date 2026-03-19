export function renderTwitterContent(tabInfo) {
    if (!tabInfo || !tabInfo.isTwitter || !tabInfo.richData) {
        return null;
    }
    
    // 创建富媒体容器
    const richMediaContainer = document.createElement('div');
    richMediaContainer.className = 'twitter-rich-content';
    
    // 添加作者信息（如果有）
    if (tabInfo.author) {
        const authorElement = document.createElement('div');
        authorElement.className = 'twitter-author';
        authorElement.textContent = tabInfo.author;
        richMediaContainer.appendChild(authorElement);
    }
    
    // 添加HTML格式的推文内容（如果有）
    if (tabInfo.richData.html) {
        const contentElement = document.createElement('div');
        contentElement.className = 'twitter-text';
        contentElement.innerHTML = tabInfo.richData.html;
        richMediaContainer.appendChild(contentElement);
    }
    
    // 添加图片（如果有）
    if (tabInfo.richData.images && tabInfo.richData.images.length > 0) {
        const imagesContainer = document.createElement('div');
        imagesContainer.className = 'twitter-images';
        
        // 根据图片数量设置不同的布局类
        imagesContainer.classList.add(`image-count-${Math.min(tabInfo.richData.images.length, 4)}`);
        
        tabInfo.richData.images.forEach(imgSrc => {
            const imgWrapper = document.createElement('div');
            imgWrapper.className = 'image-wrapper';
            
            const img = document.createElement('img');
            img.src = imgSrc;
            img.alt = 'Tweet image';
            img.loading = 'lazy';
            
            // 添加点击放大功能
            img.addEventListener('click', () => {
                const modal = document.createElement('div');
                modal.className = 'image-modal';
                modal.innerHTML = `
                    <div class="modal-content">
                        <img src="${imgSrc}" alt="Full size image">
                        <button class="close-modal">×</button>
                    </div>
                `;
                document.body.appendChild(modal);
                
                // 关闭模态框
                modal.querySelector('.close-modal').addEventListener('click', () => {
                    modal.remove();
                });
                
                // 点击背景关闭
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        modal.remove();
                    }
                });
            });
            
            imgWrapper.appendChild(img);
            imagesContainer.appendChild(imgWrapper);
        });
        
        richMediaContainer.appendChild(imagesContainer);
    }
    
    // 添加视频（如果有）
    if (tabInfo.richData.videos && tabInfo.richData.videos.length > 0) {
        const videosContainer = document.createElement('div');
        videosContainer.className = 'twitter-videos';
        
        tabInfo.richData.videos.forEach(videoSrc => {
            if (videoSrc) {
                const videoElement = document.createElement('video');
                videoElement.controls = true;
                videoElement.src = videoSrc;
                videoElement.className = 'twitter-video';
                videosContainer.appendChild(videoElement);
            }
        });
        
        richMediaContainer.appendChild(videosContainer);
    }
    
    // 添加推文链接
    if (tabInfo.url) {
        const linkContainer = document.createElement('div');
        linkContainer.className = 'twitter-link';
        
        const link = document.createElement('a');
        link.href = tabInfo.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = '查看原始推文';
        
        linkContainer.appendChild(link);
        richMediaContainer.appendChild(linkContainer);
    }
    
    return richMediaContainer;
}

// Registry component for generic renderer picking
export function getRichMediaRenderer(tabInfo) {
    if (tabInfo && tabInfo.isTwitter) {
        return renderTwitterContent(tabInfo);
    }
    return null; // fallback to text parsing
}
