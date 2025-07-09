// 全局变量
let socket = null;
let discussionState = {
    isActive: false,
    topic: '',
    currentTurn: 0,
    totalTurns: 0,
    responses: [],
    isConnected: false,
    sessionId: null,
    messageStyle: 'card', // 'card' 或 'bubble'
    lastProcessedResponseIndex: 0, // 防止重复处理响应
    renderedResponsesCount: 0 // 记录已渲染的响应数量
};

// DOM 元素
const elements = {
    statusIndicator: null,
    statusText: null,
    topicInput: null,
    turnsInput: null,
    startButton: null,
    errorMessage: null,
    progressSection: null,
    progressText: null,
    progressFill: null,
    currentTopic: null,
    emptyState: null,
    discussionResults: null,
    styleToggleBtn: null
};

// 模型配置 - 只使用图片，不使用SVG图标
const modelConfig = {
    DeepSeek: {
        avatar: 'static/images/deepseek.png',
        class: 'deepseek',
        fallbackColor: '#10b981'
    },
    Doubao: {
        avatar: 'static/images/doubao.png',
        class: 'doubao',
        fallbackColor: '#8b5cf6'
    },
    Wenxin: {
        avatar: 'static/images/wenxin.png',
        class: 'wenxin',
        fallbackColor: '#3b82f6'
    }
};

// 保活定时器
let keepAliveInterval = null;
let currentThinkingIndicator = null;
let typingTimeouts = [];
let isProcessingResponse = false; // 防止并发处理
let responseQueue = []; // 响应队列

// 自定义音效管理
const audioManager = {
    context: null,
    enabled: true,

    init() {
        try {
            this.context = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('音频上下文初始化失败:', e);
            this.enabled = false;
        }
    },

    // 自定义提示音 - 更悦耳的音效
    playNotification() {
        if (!this.enabled || !this.context) return;

        try {
            // 创建一个更复杂的音效
            const oscillator1 = this.context.createOscillator();
            const oscillator2 = this.context.createOscillator();
            const gainNode = this.context.createGain();
            const filterNode = this.context.createBiquadFilter();

            // 设置滤波器
            filterNode.type = 'lowpass';
            filterNode.frequency.setValueAtTime(2000, this.context.currentTime);

            // 连接音频节点
            oscillator1.connect(gainNode);
            oscillator2.connect(gainNode);
            gainNode.connect(filterNode);
            filterNode.connect(this.context.destination);

            // 设置频率 - 和谐的音程
            oscillator1.frequency.setValueAtTime(523.25, this.context.currentTime); // C5
            oscillator2.frequency.setValueAtTime(659.25, this.context.currentTime); // E5

            // 频率变化
            oscillator1.frequency.exponentialRampToValueAtTime(392, this.context.currentTime + 0.3);
            oscillator2.frequency.exponentialRampToValueAtTime(493.88, this.context.currentTime + 0.3);

            // 音量包络
            gainNode.gain.setValueAtTime(0, this.context.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.1, this.context.currentTime + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.3);

            // 播放
            const startTime = this.context.currentTime;
            const duration = 0.3;

            oscillator1.start(startTime);
            oscillator2.start(startTime);
            oscillator1.stop(startTime + duration);
            oscillator2.stop(startTime + duration);
        } catch (e) {
            console.warn('播放提示音失败:', e);
        }
    }
};

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeElements();
    checkServerConnection();
    bindEvents();
    startKeepAlive();
    audioManager.init();

    // 从localStorage恢复用户偏好
    const savedStyle = localStorage.getItem('messageStyle');
    if (savedStyle) {
        discussionState.messageStyle = savedStyle;
    }
    updateStyleToggleButton();

    // 用户交互后启用音频上下文
    document.addEventListener('click', function() {
        if (audioManager.context && audioManager.context.state === 'suspended') {
            audioManager.context.resume();
        }
    }, { once: true });
});

// 初始化DOM元素
function initializeElements() {
    elements.statusIndicator = document.getElementById('statusIndicator');
    elements.statusText = document.getElementById('statusText');
    elements.topicInput = document.getElementById('topicInput');
    elements.turnsInput = document.getElementById('turnsInput');
    elements.startButton = document.getElementById('startButton');
    elements.errorMessage = document.getElementById('errorMessage');
    elements.progressSection = document.getElementById('progressSection');
    elements.progressText = document.getElementById('progressText');
    elements.progressFill = document.getElementById('progressFill');
    elements.currentTopic = document.getElementById('currentTopic');
    elements.emptyState = document.getElementById('emptyState');
    elements.discussionResults = document.getElementById('discussionResults');
    elements.styleToggleBtn = document.getElementById('styleToggleBtn');
}

// 检查服务器连接
async function checkServerConnection() {
    try {
        const response = await fetch('/health');
        updateConnectionStatus(response.ok);
    } catch (error) {
        updateConnectionStatus(false);
    }
}

// 会话保活
async function keepSessionAlive() {
    if (discussionState.sessionId && discussionState.isActive) {
        try {
            const response = await fetch('/keepalive', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: discussionState.sessionId
                })
            });

            if (!response.ok) {
                console.warn('Keep-alive failed:', response.status);
            }
        } catch (error) {
            console.warn('Keep-alive error:', error);
        }
    }
}

// 启动保活定时器
function startKeepAlive() {
    // 每30秒检查连接状态
    setInterval(checkServerConnection, 30000);

    // 每20秒发送保活请求
    keepAliveInterval = setInterval(keepSessionAlive, 20000);
}

// 绑定事件
function bindEvents() {
    elements.startButton.addEventListener('click', startDiscussion);
    elements.styleToggleBtn.addEventListener('click', toggleMessageStyle);

    elements.topicInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            startDiscussion();
        }
    });
}

// 切换消息样式
function toggleMessageStyle() {
    discussionState.messageStyle = discussionState.messageStyle === 'card' ? 'bubble' : 'card';

    // 更新按钮文本和图标
    updateStyleToggleButton();

    // 样式切换时需要完整重新渲染
    if (discussionState.messageStyle === 'bubble') {
        renderBubbleStyle(); // 使用完整重新渲染
    } else {
        updateDiscussionContent(); // 卡片模式正常渲染
    }

    // 保存用户偏好到localStorage
    localStorage.setItem('messageStyle', discussionState.messageStyle);
}

// 更新样式切换按钮
function updateStyleToggleButton() {
    if (discussionState.messageStyle === 'card') {
        elements.styleToggleBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            气泡模式
        `;
    } else {
        elements.styleToggleBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="9" y1="9" x2="15" y2="9"/>
                <line x1="9" y1="13" x2="15" y2="13"/>
            </svg>
            卡片模式
        `;
    }
}

// 更新连接状态
function updateConnectionStatus(connected) {
    discussionState.isConnected = connected;

    if (connected) {
        elements.statusIndicator.classList.add('connected');
        elements.statusText.textContent = '已连接';
    } else {
        elements.statusIndicator.classList.remove('connected');
        elements.statusText.textContent = '未连接';
    }

    updateUI();
}

// 开始讨论
async function startDiscussion() {
    const topic = elements.topicInput.value.trim();
    const maxTurns = parseInt(elements.turnsInput.value) || 5;

    if (!topic) {
        showError('请输入讨论主题');
        return;
    }

    if (maxTurns < 1 || maxTurns > 10) {
        showError('讨论轮数必须在1-10之间');
        return;
    }

    if (!discussionState.isConnected) {
        showError('未连接到服务器');
        return;
    }

    try {
        // 重置状态
        discussionState.responses = [];
        discussionState.lastProcessedResponseIndex = 0;
        discussionState.renderedResponsesCount = 0;
        responseQueue = [];
        isProcessingResponse = false;
        clearTypingTimeouts();
        hideThinkingIndicator();

        const response = await fetch('/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                topic: topic,
                max_turns: maxTurns
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || '启动失败');
        }

        discussionState.sessionId = data.session_id;
        discussionState.isActive = true;
        discussionState.topic = data.topic;
        discussionState.totalTurns = data.max_turns;
        discussionState.currentTurn = 1; // 从1开始

        // 从localStorage恢复用户偏好
        const savedStyle = localStorage.getItem('messageStyle');
        if (savedStyle) {
            discussionState.messageStyle = savedStyle;
        }

        elements.topicInput.value = '';
        updateUI();
        updateStyleToggleButton();
        hideError();

        // 开始获取响应
        fetchNextResponse();
    } catch (error) {
        showError(error.message || '启动讨论失败');
    }
}

// 显示思考指示器
function showThinkingIndicator(modelName) {
    hideThinkingIndicator();

    const config = modelConfig[modelName] || modelConfig.DeepSeek;
    const container = elements.discussionResults;

    const indicator = document.createElement('div');
    indicator.className = 'thinking-indicator';

    // 构建头像HTML - 只使用图片，失败时显示颜色块
    let avatarHtml = '';
    if (config.avatar) {
        avatarHtml = `<img src="${config.avatar}" alt="${modelName}" class="avatar-img" onerror="this.style.display='none'; this.parentNode.style.backgroundColor='${config.fallbackColor}'; this.parentNode.innerHTML='<span style=\\"color:white;font-weight:bold;font-size:0.75rem\\">${modelName.charAt(0)}</span>';">`;
    } else {
        avatarHtml = `<span style="color:white;font-weight:bold;font-size:0.75rem">${modelName.charAt(0)}</span>`;
    }

    indicator.innerHTML = `
        <div class="thinking-avatar ${config.class}">
            ${avatarHtml}
        </div>
        <div class="thinking-text">
            ${modelName} 正在思考中
            <div class="thinking-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;

    container.appendChild(indicator);
    currentThinkingIndicator = indicator;

    // 显示动画
    setTimeout(() => {
        indicator.classList.add('show');
    }, 50);

    // 滚动到底部
    container.scrollTop = container.scrollHeight;
}

// 隐藏思考指示器
function hideThinkingIndicator() {
    if (currentThinkingIndicator) {
        currentThinkingIndicator.remove();
        currentThinkingIndicator = null;
    }
}

// 清除所有打字超时
function clearTypingTimeouts() {
    typingTimeouts.forEach(timeout => clearTimeout(timeout));
    typingTimeouts = [];
}

// 响应队列处理
async function processResponseQueue() {
    if (isProcessingResponse || responseQueue.length === 0) {
        return;
    }

    isProcessingResponse = true;

    while (responseQueue.length > 0) {
        const responseData = responseQueue.shift();
        await processResponse(responseData);

        // 添加延迟避免卡顿
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    isProcessingResponse = false;
}

// 处理单个响应
async function processResponse(data) {
    // 隐藏思考指示器
    hideThinkingIndicator();

    if (data.done) {
        discussionState.isActive = false;
        discussionState.sessionId = null;
        updateUI();
        return;
    }

    // 播放提示音
    audioManager.playNotification();

    // 添加响应到状态
    const newResponse = {
        model: data.model,
        response: data.response,
        turn: data.turn,
        timestamp: data.timestamp || Date.now() / 1000
    };

    discussionState.responses.push(newResponse);
    discussionState.currentTurn = data.turn;

    // 更新UI
    updateUI();

    // 为新响应添加打字机效果
    if (discussionState.messageStyle === 'card') {
        await addTypingEffectToLatestCard();
    } else {
        await addTypingEffectToLatestBubble();
    }
}

// 获取下一个响应
async function fetchNextResponse() {
    if (!discussionState.sessionId || !discussionState.isActive) {
        return;
    }

    // 获取当前应该响应的模型
    const modelNames = ['DeepSeek', 'Doubao', 'Wenxin'];
    const currentModelIndex = discussionState.responses.length % modelNames.length;
    const currentModel = modelNames[currentModelIndex];

    // 显示思考指示器
    showThinkingIndicator(currentModel);

    try {
        const response = await fetch('/next', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: discussionState.sessionId
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || '获取响应失败');
        }

        // 添加到队列而不是直接处理
        responseQueue.push(data);
        processResponseQueue();

        // 如果没有完成，继续获取下一个响应
        if (!data.done) {
            setTimeout(fetchNextResponse, 1500); // 增加间隔避免卡顿
        }
    } catch (error) {
        hideThinkingIndicator();
        showError(error.message || '获取响应失败');
        discussionState.isActive = false;
        discussionState.sessionId = null;
        updateUI();
    }
}

// 为最新卡片添加打字机效果
async function addTypingEffectToLatestCard() {
    const lastCard = elements.discussionResults.querySelector('.response-card:last-child .response-content');
    if (lastCard && discussionState.responses.length > 0) {
        const lastResponse = discussionState.responses[discussionState.responses.length - 1];
        await typewriterEffect(lastCard, lastResponse.response, 30);
    }
}

// 为最新气泡添加打字机效果
async function addTypingEffectToLatestBubble() {
    const lastBubble = elements.discussionResults.querySelector('.message-bubble:last-child .message-bubble-content');
    if (lastBubble && discussionState.responses.length > 0) {
        const lastResponse = discussionState.responses[discussionState.responses.length - 1];
        await typewriterEffect(lastBubble, lastResponse.response, 30);
    }
}

// 显示错误信息
function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorMessage.style.display = 'block';
}

// 隐藏错误信息
function hideError() {
    elements.errorMessage.style.display = 'none';
}

// 更新UI
function updateUI() {
    updateStartButton();
    updateProgress();
    updateStyleToggleButton();
    updateDiscussionContent();
}

// 更新开始按钮
function updateStartButton() {
    const isDisabled = discussionState.isActive || !discussionState.isConnected;

    elements.startButton.disabled = isDisabled;
    elements.topicInput.disabled = discussionState.isActive;
    elements.turnsInput.disabled = discussionState.isActive;

    if (discussionState.isActive) {
        elements.startButton.innerHTML = `
            <div class="loading-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
            讨论进行中...
        `;
    } else {
        elements.startButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22,2 15,22 11,13 2,9 22,2"/>
            </svg>
            开始讨论
        `;
    }
}

// 更新进度
function updateProgress() {
    if (discussionState.isActive && discussionState.totalTurns > 0) {
        elements.progressSection.style.display = 'block';
        elements.progressText.textContent = `${discussionState.currentTurn}/${discussionState.totalTurns}`;

        const percentage = (discussionState.currentTurn / discussionState.totalTurns) * 100;
        elements.progressFill.style.width = `${percentage}%`;
    } else {
        elements.progressSection.style.display = 'none';
    }
}

// 更新讨论内容
function updateDiscussionContent() {
    if (discussionState.topic) {
        elements.currentTopic.textContent = `当前话题：${discussionState.topic}`;
        elements.currentTopic.style.display = 'block';
    } else {
        elements.currentTopic.style.display = 'none';
    }

    if (discussionState.responses.length === 0) {
        elements.emptyState.style.display = 'block';
        elements.discussionResults.style.display = 'none';
    } else {
        elements.emptyState.style.display = 'none';
        elements.discussionResults.style.display = 'block';
        renderDiscussionResults();
    }
}

// 渲染讨论结果
function renderDiscussionResults() {
    if (discussionState.messageStyle === 'card') {
        renderCardStyle();
    } else {
        renderBubbleStyleIncremental();
    }

    // 滚动到底部
    elements.discussionResults.scrollTop = elements.discussionResults.scrollHeight;
}

// 打字机效果
function typewriterEffect(element, text, speed = 50) {
    return new Promise((resolve) => {
        element.textContent = '';
        element.classList.add('typewriter');

        // 将文本按单词分割，保持自然换行
        const words = text.split(' ');
        let currentWordIndex = 0;
        let currentCharIndex = 0;
        let displayText = '';

        const timer = setInterval(() => {
            if (currentWordIndex < words.length) {
                const currentWord = words[currentWordIndex];

                if (currentCharIndex < currentWord.length) {
                    // 逐字符添加当前单词
                    displayText += currentWord.charAt(currentCharIndex);
                    currentCharIndex++;
                } else {
                    // 当前单词完成，添加空格（除非是最后一个单词）
                    if (currentWordIndex < words.length - 1) {
                        displayText += ' ';
                    }
                    currentWordIndex++;
                    currentCharIndex = 0;
                }

                element.textContent = displayText;
            } else {
                clearInterval(timer);
                element.classList.remove('typewriter');
                element.classList.add('typing-complete');
                resolve();
            }
        }, speed);

        typingTimeouts.push(timer);
    });
}

// 渲染卡片样式
function renderCardStyle() {
    const groupedResponses = groupResponsesByTurn();
    let html = '';

    Object.keys(groupedResponses).sort((a, b) => parseInt(a) - parseInt(b)).forEach(turn => {
        const responses = groupedResponses[turn];

        html += `
            <div class="turn-section">
                <div class="turn-header">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12,6 12,12 16,14"/>
                    </svg>
                    <span>第 ${turn} 轮讨论</span>
                </div>
                <div class="responses-grid">
                    ${responses.map(response => renderResponseCard(response)).join('')}
                </div>
            </div>
        `;
    });

    elements.discussionResults.innerHTML = html;
    elements.discussionResults.className = 'discussion-content';
}

// 渲染气泡样式 - 增量渲染版本
function renderBubbleStyleIncremental() {
    const container = elements.discussionResults;
    container.className = 'discussion-content bubble-mode';

    // 如果是第一次渲染，需要初始化容器并添加用户消息
    if (discussionState.renderedResponsesCount === 0) {
        container.innerHTML = ''; // 清空容器

        // 添加用户初始消息
        if (discussionState.topic) {
            const userMessage = createBubbleMessage('User', discussionState.topic, true, Date.now() / 1000, false, false);
            container.appendChild(userMessage);

            // 显示用户消息动画
            setTimeout(() => {
                userMessage.style.opacity = '1';
                userMessage.style.transform = 'translateY(0) scale(1)';

                setTimeout(() => {
                    const bubbleContent = userMessage.querySelector('.message-bubble-content');
                    bubbleContent.style.opacity = '1';
                    bubbleContent.style.transform = 'scale(1)';
                }, 200);
            }, 100);
        }
    }

    // 只渲染新的响应
    const newResponses = discussionState.responses.slice(discussionState.renderedResponsesCount);

    newResponses.forEach((response, index) => {
        const globalIndex = discussionState.renderedResponsesCount + index;

        // 简单的左右交错逻辑：奇数索引在右，偶数索引在左
        const isRight = globalIndex % 2 === 1;

        const isLatest = globalIndex === discussionState.responses.length - 1;
        const message = createBubbleMessage(response.model, response.response, false, response.timestamp, isRight, isLatest);
        container.appendChild(message);

        // 延迟显示动画
        setTimeout(() => {
            message.style.opacity = '1';
            message.style.transform = 'translateY(0) scale(1)';

            setTimeout(() => {
                const bubbleContent = message.querySelector('.message-bubble-content');
                bubbleContent.style.opacity = '1';
                bubbleContent.style.transform = 'scale(1)';
            }, 200);
        }, index * 300);
    });

    // 更新已渲染的响应数量
    discussionState.renderedResponsesCount = discussionState.responses.length;
}

// 渲染气泡样式 - 完整重新渲染版本（保留用于样式切换）
function renderBubbleStyle() {
    const container = elements.discussionResults;
    container.innerHTML = '';
    container.className = 'discussion-content bubble-mode';

    // 重置渲染计数
    discussionState.renderedResponsesCount = 0;

    // 添加用户初始消息
    if (discussionState.topic) {
        const userMessage = createBubbleMessage('User', discussionState.topic, true, Date.now() / 1000, false, false);
        container.appendChild(userMessage);

        // 显示用户消息动画
        setTimeout(() => {
            userMessage.style.opacity = '1';
            userMessage.style.transform = 'translateY(0) scale(1)';

            setTimeout(() => {
                const bubbleContent = userMessage.querySelector('.message-bubble-content');
                bubbleContent.style.opacity = '1';
                bubbleContent.style.transform = 'scale(1)';
            }, 200);
        }, 100);
    }

    // 按响应顺序渲染，简单左右交错
    discussionState.responses.forEach((response, index) => {
        // 简单的左右交错逻辑：奇数索引在右，偶数索引在左
        const isRight = index % 2 === 1;
        const isLatest = index === discussionState.responses.length - 1;
        const message = createBubbleMessage(response.model, response.response, false, response.timestamp, isRight, isLatest);
        container.appendChild(message);

        // 延迟显示动画
        setTimeout(() => {
            message.style.opacity = '1';
            message.style.transform = 'translateY(0) scale(1)';

            setTimeout(() => {
                const bubbleContent = message.querySelector('.message-bubble-content');
                bubbleContent.style.opacity = '1';
                bubbleContent.style.transform = 'scale(1)';
            }, 200);
        }, index * 300);
    });

    // 更新已渲染的响应数量
    discussionState.renderedResponsesCount = discussionState.responses.length;
}

// 创建气泡消息元素
function createBubbleMessage(modelName, content, isUser = false, timestamp = Date.now() / 1000, forceRight = false, isLatest = false) {
    const messageDiv = document.createElement('div');
    const config = modelConfig[modelName] || modelConfig.DeepSeek;
    const time = formatTime(timestamp);

    // 确定消息位置
    const isRight = isUser || forceRight;
    messageDiv.className = `message-bubble ${isUser ? 'user-message' : 'model-message'} ${isRight ? 'right-aligned' : 'left-aligned'}`;
    messageDiv.style.opacity = '0';
    messageDiv.style.transform = 'translateY(20px) scale(0.9)';

    // 创建消息结构
    const messageHeader = document.createElement('div');
    messageHeader.className = `message-info ${isRight ? 'right-info' : 'left-info'}`;

    // 头像 - 只使用图片，失败时显示颜色块
    const avatar = document.createElement('div');
    avatar.className = `message-avatar ${config.class}`;

    if (config.avatar && !isUser) {
        const img = document.createElement('img');
        img.src = config.avatar;
        img.alt = modelName;
        img.className = 'avatar-img';
        img.onerror = function() {
            this.style.display = 'none';
            avatar.style.backgroundColor = config.fallbackColor;
            avatar.innerHTML = `<span style="color:white;font-weight:bold;font-size:0.75rem">${modelName.charAt(0)}</span>`;
        };
        avatar.appendChild(img);
    } else if (isUser) {
        avatar.innerHTML = `<span style="color:white;font-weight:bold;font-size:0.75rem">用</span>`;
        avatar.className += ' user-avatar';
        avatar.style.backgroundColor = '#6366f1';
    } else {
        avatar.style.backgroundColor = config.fallbackColor;
        avatar.innerHTML = `<span style="color:white;font-weight:bold;font-size:0.75rem">${modelName.charAt(0)}</span>`;
    }

    // 名称和时间
    const nameTime = document.createElement('div');
    nameTime.className = 'name-time';
    nameTime.innerHTML = `
        <span class="sender-name">${isUser ? '用户' : modelName}</span>
        <span class="message-time">${time}</span>
    `;

    // 组装消息头
    if (isRight) {
        messageHeader.appendChild(nameTime);
        messageHeader.appendChild(avatar);
    } else {
        messageHeader.appendChild(avatar);
        messageHeader.appendChild(nameTime);
    }

    // 消息气泡
    const bubble = document.createElement('div');
    bubble.className = `message-bubble-content ${isUser ? 'user-bubble' : 'model-bubble'}`;
    bubble.textContent = content;
    bubble.style.transform = 'scale(0.8)';
    bubble.style.opacity = '0';

    // 组装完整消息
    messageDiv.appendChild(messageHeader);
    messageDiv.appendChild(bubble);

    return messageDiv;
}

// 按轮次分组响应
function groupResponsesByTurn() {
    const grouped = {};
    discussionState.responses.forEach(response => {
        if (!grouped[response.turn]) {
            grouped[response.turn] = [];
        }
        grouped[response.turn].push(response);
    });
    return grouped;
}

// 渲染响应卡片
function renderResponseCard(response) {
    const config = modelConfig[response.model] || modelConfig.DeepSeek;
    const time = formatTime(response.timestamp);

    // 构建头像HTML - 只使用图片，失败时显示颜色块
    let avatarHtml = '';
    if (config.avatar) {
        avatarHtml = `<img src="${config.avatar}" alt="${response.model}" class="avatar-img" onerror="this.style.display='none'; this.parentNode.style.backgroundColor='${config.fallbackColor}'; this.parentNode.innerHTML='<span style=\\"color:white;font-weight:bold;font-size:0.75rem\\">${response.model.charAt(0)}</span>';">`;
    } else {
        avatarHtml = `<span style="color:white;font-weight:bold;font-size:0.75rem">${response.model.charAt(0)}</span>`;
    }

    return `
        <div class="response-card">
            <div class="response-header">
                <div class="model-icon ${config.class}">
                    ${avatarHtml}
                </div>
                <div class="response-meta">
                    <div class="model-name">${response.model}</div>
                    <div class="response-time">${time}</div>
                </div>
            </div>
            <div class="response-content">${escapeHtml(response.response)}</div>
        </div>
    `;
}

// 格式化时间
function formatTime(timestamp) {
    return new Date(timestamp * 1000).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// HTML转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}