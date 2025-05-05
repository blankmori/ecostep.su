// ========== CONFIGURATION ==========
const config = {
    telegram: {
        botToken: '7869035867:AAFyXWcOp8C3kvLDig4VydnnEX7cYGLTSfw',
        chatId: '1340284564',
        apiUrl: 'https://api.telegram.org/bot',
        pollingInterval: 3000,
        maxMessageLength: 4000
    },
    chatModes: {
        AI: 'ai',
        OPERATOR: 'operator'
    },
    currentChatMode: 'ai',
    apiUrl: 'https://ecostep.su',
    feedbackSent: false
};

// ========== MAIN APP ==========
const App = {
    init() {
        this.initChat();
        this.initFeedbackForm();

        if (!localStorage.getItem('chatId')) {
            localStorage.setItem('chatId', Date.now().toString());
        }
        this.chatId = localStorage.getItem('chatId');
        this.startPolling();
        this.showWelcomeMessage();
    },

    closeModal() {
        this.modalPortfolio.classList.remove('active');
        document.body.style.overflow = '';
    },

    // ========== CHAT SYSTEM ==========
    initChat() {
        this.chatWidget = document.querySelector('.chat-widget');
        this.chatButton = document.querySelector('.chat-button');
        this.chatClose = document.querySelector('.chat-close');
        this.chatMessages = document.getElementById('chatMessages');
        this.userMessage = document.getElementById('userMessage');
        this.sendButton = document.getElementById('sendMessage');

        this.chatButton.addEventListener('click', () => this.toggleChat());
        this.chatClose.addEventListener('click', () => this.toggleChat());
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.userMessage.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Создаем контейнер для кнопки переключения внизу чата
        this.chatFooter = document.createElement('div');
        this.chatFooter.className = 'chat-footer';
        this.chatWidget.appendChild(this.chatFooter);

        // Создаем кнопку переключения на оператора
        this.transferButton = document.createElement('button');
        this.transferButton.id = 'transferToHuman';
        this.transferButton.innerHTML = '<i class="fas fa-user"></i> Связаться с оператором';
        this.transferButton.className = 'chat-transfer-button';
        this.chatFooter.appendChild(this.transferButton);
        this.transferButton.addEventListener('click', () => this.transferToOperator());
    },

    async transferToOperator() {
        if (config.currentChatMode === config.chatModes.OPERATOR) return;

        config.currentChatMode = config.chatModes.OPERATOR;
        this.transferButton.disabled = true;
        this.transferButton.innerHTML = '<i class="fas fa-user"></i> Ожидайте ответа оператора';

        try {
            // Отправляем запрос на наш сервер для уведомления оператора
            const response = await fetch(`${config.apiUrl}/api/notify-operator`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: this.chatId
                })
            });

            if (!response.ok) throw new Error('Ошибка отправки');

            this.addMessage('bot', 'Ваш запрос передан оператору. Пожалуйста, ожидайте ответа.');
        } catch (error) {
            console.error('Ошибка:', error);
            this.addMessage('bot', 'Не удалось связаться с оператором. Попробуйте позже.');
            config.currentChatMode = config.chatModes.AI;  // Возвращаем в режим AI
            this.transferButton.disabled = false;
            this.transferButton.innerHTML = '<i class="fas fa-user"></i> Связаться с оператором';
        }
    },

    toggleChat() {
        if (this.chatWidget.classList.contains('active')) {
            this.chatWidget.classList.remove('active');
        } else {
            // Закрываем форму обратной связи перед открытием чата
            this.feedbackForm.classList.remove('active');
            this.chatWidget.classList.add('active');
            setTimeout(() => this.userMessage.focus(), 100);
        }
    },

    async sendMessage() {
        const message = this.userMessage.value.trim();
        if (!message) return;

        this.addMessage('user', message);
        this.userMessage.value = '';
        this.showTypingIndicator();

        try {
            if (config.currentChatMode === config.chatModes.AI) {
                await this.sendToAI(message);
            } else {
                await this.sendToOperator(message);
            }
        } catch (error) {
            this.hideTypingIndicator();
            this.addMessage('bot', 'Не удалось отправить сообщение. Попробуйте позже.');
            console.error('Ошибка отправки:', error);
        }
    },

    async sendToAI(message) {
        try {
            const response = await fetch(`${config.apiUrl}/api/ai-chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: this.chatId,
                    message: message
                })
            });

            if (!response.ok) throw new Error('Ошибка отправки');

            const data = await response.json();
            this.addMessage('bot', data.response);
        } catch (error) {
            console.error('Ошибка:', error);
            throw error;
        } finally {
            this.hideTypingIndicator();
        }
    },

    async sendToOperator(message) {
        try {
            const response = await fetch(`${config.telegram.apiUrl}${config.telegram.botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: config.telegram.chatId,
                    text: `Сообщение от клиента #${this.chatId}:\n\n${message}`
                })
            });

            if (!response.ok) throw new Error('Ошибка отправки');

            // Убираем сообщение о том, что сообщение отправлено оператору
            // Теперь оно показывается только при первом переключении
        } catch (error) {
            console.error('Ошибка:', error);
            throw error;
        } finally {
            this.hideTypingIndicator();
        }
    },

    startPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }

        this.pollingInterval = setInterval(async () => {
            try {
                // Для режима оператора опрашиваем наш сервер
                if (config.currentChatMode === config.chatModes.OPERATOR) {
                    const response = await fetch(`${config.apiUrl}/api/operator-messages/${this.chatId}`);
                    if (!response.ok) throw new Error('Ошибка получения сообщений');

                    const data = await response.json();
                    if (data.messages && data.messages.length > 0) {
                        data.messages.forEach(msg => {
                            this.addMessage('operator', msg.text);
                        });
                    }
                }
                // Для режима AI ничего не делаем (или можно оставить текущую логику)
            } catch (error) {
                console.error('Ошибка проверки сообщений:', error);
            }
        }, config.telegram.pollingInterval);
    },

    addMessage(type, text, time = '') {
        const now = new Date();
        const messageTime = time || `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;

        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${type}-message`;
        messageDiv.innerHTML = `
            <div class="message-content">${text}</div>
            <div class="message-time">${messageTime}</div>
        `;

        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    },

    showTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        `;
        this.chatMessages.appendChild(indicator);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    },

    hideTypingIndicator() {
        const indicator = this.chatMessages.querySelector('.typing-indicator');
        if (indicator) indicator.remove();
    },

    showWelcomeMessage() {
        this.chatMessages.innerHTML = '';
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        this.addMessage('bot', 'Здравствуйте! Напишите ваш вопрос, и мы вам поможем. Если ответы ИИ-ассистента вам не помогли, вы можете связаться с оператором.', `${hours}:${minutes}`);
    },

    // ========== FEEDBACK FORM ==========
    initFeedbackForm() {
        // Создаем кнопку обратной связи
        this.feedbackButton = document.createElement('div');
        this.feedbackButton.className = 'feedback-button';
        this.feedbackButton.innerHTML = '<i class="fas fa-comment-dots"></i> Обратная связь';
        document.body.appendChild(this.feedbackButton);

        // Создаем форму обратной связи
        this.feedbackForm = document.createElement('div');
        this.feedbackForm.className = 'feedback-form';
        this.feedbackForm.innerHTML = `
            <div class="feedback-header">
                <h3>Обратная связь</h3>
                <button class="feedback-close"><i class="fas fa-times"></i></button>
            </div>
            <form id="feedbackForm">
                <div class="form-group">
                    <input type="text" id="feedbackName" placeholder="ФИО" required>
                </div>
                <div class="form-group">
                    <input type="email" id="feedbackEmail" placeholder="Email" required>
                </div>
                <div class="form-group">
                    <input type="tel" id="feedbackPhone" placeholder="Телефон" required>
                </div>
                <div class="form-group">
                    <textarea id="feedbackMessage" placeholder="Ваше сообщение" required></textarea>
                </div>
                <button type="submit" class="btn-submit">Отправить</button>
            </form>
        `;
        document.body.appendChild(this.feedbackForm);

        // Обработчики событий
        this.feedbackButton.addEventListener('click', () => this.toggleFeedbackForm());
        this.feedbackForm.querySelector('.feedback-close').addEventListener('click', () => this.toggleFeedbackForm());
        this.feedbackForm.querySelector('form').addEventListener('submit', (e) => this.submitFeedback(e));
    },

    toggleFeedbackForm() {
        if (this.feedbackForm.classList.contains('active')) {
            this.feedbackForm.classList.remove('active');
        } else {
            // Закрываем чат перед открытием формы обратной связи
            this.chatWidget.classList.remove('active');
            this.feedbackForm.classList.add('active');
        }
    },

    async submitFeedback(e) {
        e.preventDefault();

        if (config.feedbackSent) return;

        const name = document.getElementById('feedbackName').value;
        const email = document.getElementById('feedbackEmail').value;
        const phone = document.getElementById('feedbackPhone').value;
        const message = document.getElementById('feedbackMessage').value;

        try {
            const response = await fetch(`${config.telegram.apiUrl}${config.telegram.botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: config.telegram.chatId,
                    text: `Новое сообщение обратной связи:\n\nФИО: ${name}\nEmail: ${email}\nТелефон: ${phone}\nСообщение: ${message}`
                })
            });

            if (!response.ok) throw new Error('Ошибка отправки');

            config.feedbackSent = true;
            this.feedbackForm.querySelector('form').innerHTML = '<div class="success-message">Спасибо! Ваше сообщение отправлено.</div>';
            setTimeout(() => this.toggleFeedbackForm(), 2000);
        } catch (error) {
            console.error('Ошибка:', error);
            alert('Не удалось отправить сообщение. Попробуйте позже.');
        }
    }
};

window.addEventListener('DOMContentLoaded', () => {
    if (location.hash) {
        const section = document.querySelector(location.hash);
        if (section) {
            section.scrollIntoView({ behavior: 'smooth' });
            history.replaceState(null, '', location.pathname);
        }
    }
});

document.querySelectorAll('.faq-question').forEach((question, index) => {
    question.addEventListener('click', () => {
        const item = question.closest('.faq-item');
        const answer = item.querySelector('.faq-answer');
        const isActive = item.classList.contains('active');

        document.querySelectorAll('.faq-item').forEach(el => {
            el.classList.remove('active');
            el.querySelector('.faq-answer').style.height = '0';
        });

        if (!isActive) {
            item.classList.add('active');
            answer.style.height = `${answer.scrollHeight}px`;
        }
    });
});

// После открытия модального окна
document.querySelectorAll('.modal-portfolio').forEach(modal => {
    modal.addEventListener('shown.bs.modal', function () {
        // Переинициализация слайдера
        const carousel = this.querySelector('.carousel');
        if (carousel) new bootstrap.Carousel(carousel);

        // Сброс позиции скролла
        const infoBlock = this.querySelector('.modal-info');
        if (infoBlock) infoBlock.scrollTop = 0;

        // Перерасчет позиции кнопок
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 300);
    });
});

document.addEventListener('DOMContentLoaded', () => App.init());