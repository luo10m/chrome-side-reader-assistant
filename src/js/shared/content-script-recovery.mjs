export const CONTENT_SCRIPT_RECOVERY_FILES = [
    'lib/JSDOMParser.js',
    'lib/Readability.js',
    'lib/defuddle.js',
    'src/js/site-adapters.js',
    'src/js/content-script.js'
];

const NON_INJECTABLE_PROTOCOLS = [
    'chrome:',
    'chrome-extension:',
    'edge:',
    'about:',
    'moz-extension:',
    'opera:',
    'vivaldi:',
    'view-source:',
    'devtools:'
];

export function isRecoverableConnectionError(errorMessage) {
    if (typeof errorMessage !== 'string') {
        return false;
    }

    return errorMessage.includes('Receiving end does not exist')
        || errorMessage.includes('Could not establish connection');
}

export function isInjectableTabUrl(url) {
    if (typeof url !== 'string' || !url.trim()) {
        return false;
    }

    return !NON_INJECTABLE_PROTOCOLS.some((protocol) => url.startsWith(protocol));
}
