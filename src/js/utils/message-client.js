// src/js/utils/message-client.js

export function isExtensionContextValid() {
    try {
        chrome.runtime.getURL('');
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Sends a message safely to the background service worker.
 * Wraps chrome.runtime.sendMessage to handle invalidated contexts.
 * Returns a Promise for modern async/await usage and accepts a legacy callback.
 */
export function safeSendMessage(message, callback) {
    if (!isExtensionContextValid()) {
        console.warn('Extension context is invalid, please reload the page.');
        const fallback = { success: false, error: 'Extension context invalidated' };
        if (callback) return callback(fallback);
        return Promise.resolve(fallback);
    }

    const promise = new Promise((resolve) => {
        try {
            chrome.runtime.sendMessage(message, (response) => {
                const error = chrome.runtime.lastError;
                if (error) {
                    console.warn('Message send failed:', error.message);
                    return resolve({ success: false, error: error.message });
                }
                resolve(response || { success: true });
            });
        } catch (err) {
            console.error('Error sending message:', err);
            resolve({ success: false, error: err.message });
        }
    });

    if (callback) {
        promise.then(callback);
    } else {
        return promise;
    }
}
