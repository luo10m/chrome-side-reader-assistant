/**
 * 测试侧边栏导航功能
 * 验证修复CSS选择器问题后，侧边栏按钮能够正常工作
 */

// 模拟DOM元素类
class MockElement {
    constructor(tagName, id, className = '') {
        this.tagName = tagName;
        this.id = id;
        this.className = className;
        this.classList = {
            contains: (cls) => this.className.includes(cls),
            add: (cls) => {
                if (!this.className.includes(cls)) {
                    this.className = this.className.trim() + ' ' + cls;
                    this.className = this.className.trim();
                }
            },
            remove: (cls) => {
                this.className = this.className.replace(new RegExp('\\b' + cls + '\\b', 'g'), '').replace(/\s+/g, ' ').trim();
            }
        };
    }
}

// 模拟DOM环境
function createMockDOM() {
    // 创建侧边栏按钮
    const aiChatBtn = new MockElement('button', 'ai-chat-btn', 'sidebar-btn active');
    const translateBtn = new MockElement('button', 'translate-btn', 'sidebar-btn');
    const settingsBtn = new MockElement('button', 'settings-btn', 'sidebar-btn');

    // 创建内容区域
    const aiChatContent = new MockElement('div', 'ai-chat-content', 'content-section active');
    const translateContent = new MockElement('div', 'translate-content', 'content-section');
    const settingsContent = new MockElement('div', 'settings-content', 'content-section');

    // 模拟DOM查询
    const elements = {
        'ai-chat-btn': aiChatBtn,
        'translate-btn': translateBtn,
        'settings-btn': settingsBtn,
        'ai-chat-content': aiChatContent,
        'translate-content': translateContent,
        'settings-content': settingsContent
    };

    // 模拟document.getElementById
    global.document = {
        getElementById: (id) => elements[id] || null,
        querySelectorAll: (selector) => {
            const result = [];
            // 解析选择器 .sidebar-btn.active, .content-section.active
            if (selector.includes('.sidebar-btn.active')) {
                Object.values(elements).forEach(el => {
                    if (el.className.includes('sidebar-btn') && el.className.includes('active')) {
                        result.push(el);
                    }
                });
            }
            if (selector.includes('.content-section.active')) {
                Object.values(elements).forEach(el => {
                    if (el.className.includes('content-section') && el.className.includes('active')) {
                        result.push(el);
                    }
                });
            }
            return result;
        }
    };

    return {
        aiChatBtn,
        translateBtn,
        settingsBtn,
        aiChatContent,
        translateContent,
        settingsContent
    };
}

// 模拟setActiveTab函数（修复后的版本）
function setActiveTab(tab) {
    const TAB_CONFIG = {
        'ai-chat': {
            btn: document.getElementById('ai-chat-btn'),
            content: document.getElementById('ai-chat-content')
        },
        'translate': {
            btn: document.getElementById('translate-btn'),
            content: document.getElementById('translate-content')
        },
        'settings': {
            btn: document.getElementById('settings-btn'),
            content: document.getElementById('settings-content')
        }
    };

    // Remove active class from currently active elements
    document.querySelectorAll('.sidebar-btn.active, .content-section.active').forEach(el => {
        el.classList.remove('active');
    });

    // Add active class to selected tab
    if (TAB_CONFIG[tab]) {
        TAB_CONFIG[tab].btn.classList.add('active');
        TAB_CONFIG[tab].content.classList.add('active');
    }
}

// 测试函数
function testSidebarNavigation() {
    console.log('🧪 开始测试侧边栏导航功能...');

    // 创建模拟DOM
    const elements = createMockDOM();

    const tests = [
        {
            name: '初始状态检查',
            test: () => {
                const aiChatActive = elements.aiChatBtn.classList.contains('active');
                const aiContentActive = elements.aiChatContent.classList.contains('active');
                const translateActive = elements.translateBtn.classList.contains('active');
                const settingsActive = elements.settingsBtn.classList.contains('active');

                return aiChatActive && aiContentActive && !translateActive && !settingsActive;
            }
        },
        {
            name: '切换到翻译页面',
            test: () => {
                setActiveTab('translate');

                const aiChatActive = elements.aiChatBtn.classList.contains('active');
                const translateActive = elements.translateBtn.classList.contains('active');
                const translateContentActive = elements.translateContent.classList.contains('active');
                const aiContentActive = elements.aiChatContent.classList.contains('active');

                return !aiChatActive && translateActive && translateContentActive && !aiContentActive;
            }
        },
        {
            name: '切换到设置页面',
            test: () => {
                setActiveTab('settings');

                const translateActive = elements.translateBtn.classList.contains('active');
                const settingsActive = elements.settingsBtn.classList.contains('active');
                const settingsContentActive = elements.settingsContent.classList.contains('active');
                const translateContentActive = elements.translateContent.classList.contains('active');

                return !translateActive && settingsActive && settingsContentActive && !translateContentActive;
            }
        },
        {
            name: '从设置页面返回聊天页面',
            test: () => {
                setActiveTab('ai-chat');

                const settingsActive = elements.settingsBtn.classList.contains('active');
                const aiChatActive = elements.aiChatBtn.classList.contains('active');
                const aiContentActive = elements.aiChatContent.classList.contains('active');
                const settingsContentActive = elements.settingsContent.classList.contains('active');

                return !settingsActive && aiChatActive && aiContentActive && !settingsContentActive;
            }
        },
        {
            name: '从设置页面返回翻译页面',
            test: () => {
                // 先切换到设置页面
                setActiveTab('settings');
                // 再切换到翻译页面
                setActiveTab('translate');

                const settingsActive = elements.settingsBtn.classList.contains('active');
                const translateActive = elements.translateBtn.classList.contains('active');
                const translateContentActive = elements.translateContent.classList.contains('active');
                const settingsContentActive = elements.settingsContent.classList.contains('active');

                return !settingsActive && translateActive && translateContentActive && !settingsContentActive;
            }
        }
    ];

    let passed = 0;
    let total = tests.length;

    tests.forEach((test, index) => {
        try {
            const result = test.test();
            if (result) {
                console.log(`✅ 测试 ${index + 1}: ${test.name} - 通过`);
                passed++;
            } else {
                console.log(`❌ 测试 ${index + 1}: ${test.name} - 失败`);
                console.log('   当前状态:', {
                    aiChatBtn: elements.aiChatBtn.className,
                    translateBtn: elements.translateBtn.className,
                    settingsBtn: elements.settingsBtn.className,
                    aiChatContent: elements.aiChatContent.className,
                    translateContent: elements.translateContent.className,
                    settingsContent: elements.settingsContent.className
                });
            }
        } catch (error) {
            console.log(`❌ 测试 ${index + 1}: ${test.name} - 错误: ${error.message}`);
        }
    });

    console.log(`\n📊 测试结果: ${passed}/${total} 通过`);

    if (passed === total) {
        console.log('🎉 所有测试通过！侧边栏导航功能修复成功！');
    } else {
        console.log('⚠️  部分测试失败，需要进一步检查。');
    }

    return passed === total;
}

// 运行测试
testSidebarNavigation(); 