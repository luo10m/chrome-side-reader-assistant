function isMeaningfulText(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

export function buildSelectionPreview(selectionText, maxLength = 60) {
    const normalized = isMeaningfulText(selectionText)
        ? selectionText.trim().replace(/\s+/g, ' ')
        : '';

    if (!normalized) {
        return '';
    }

    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, maxLength)}...`;
}

export function buildUserTurnContent(userMessage, selectionText = '') {
    const normalizedUserMessage = isMeaningfulText(userMessage) ? userMessage.trim() : '';
    const normalizedSelection = isMeaningfulText(selectionText) ? selectionText.trim() : '';

    if (!normalizedSelection) {
        return normalizedUserMessage;
    }

    return `用户当前问题：\n${normalizedUserMessage}\n\n用户当前选中的网页片段：\n${normalizedSelection}`;
}

export function getRenderableConversationMessages(history = []) {
    if (!Array.isArray(history)) {
        return [];
    }

    return history.filter((message) => message && typeof message === 'object' && message.role !== 'system');
}

function getContextEligibleMessages(history = []) {
    if (!Array.isArray(history)) {
        return [];
    }

    return history.filter((message) => {
        if (!message || typeof message !== 'object') {
            return false;
        }

        if (message.role === 'system') {
            return false;
        }

        if (message.type === 'summary') {
            return false;
        }

        return true;
    });
}

export function getMessagesForCompactMemory(history = [], maxHistoryInContext = 6) {
    const eligibleMessages = getContextEligibleMessages(history);
    if (eligibleMessages.length <= maxHistoryInContext) {
        return [];
    }

    return eligibleMessages.slice(0, eligibleMessages.length - maxHistoryInContext);
}

export function buildChatRequestMessages({
    systemPrompt,
    pageSummary,
    compactMemory,
    history = [],
    userMessage,
    selectionText = '',
    maxHistoryInContext = 6
}) {
    const messages = [];

    if (isMeaningfulText(systemPrompt)) {
        messages.push({
            role: 'system',
            content: systemPrompt.trim()
        });
    }

    if (isMeaningfulText(pageSummary)) {
        messages.push({
            role: 'system',
            content: `以下是当前页面摘要，供回答参考：\n${pageSummary.trim()}`
        });
    }

    if (isMeaningfulText(compactMemory)) {
        messages.push({
            role: 'system',
            content: `以下是当前页面对话的长期记忆，请在回答时延续这些上下文：\n${compactMemory.trim()}`
        });
    }

    const recentHistory = getContextEligibleMessages(history).slice(-maxHistoryInContext);
    messages.push(...recentHistory);

    messages.push({
        role: 'user',
        content: buildUserTurnContent(userMessage, selectionText)
    });

    return messages;
}
