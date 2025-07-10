// UI Elements
const chatArea = document.getElementById('chatArea');
const chatForm = document.getElementById('chatForm');
const userInput = document.getElementById('userInput');
const fileInput = document.getElementById('fileInput');
const fileBtn = document.getElementById('fileBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettings = document.getElementById('closeSettings');
const endpointInput = document.getElementById('endpointInput');
const modelInput = document.getElementById('modelInput');
const saveSettings = document.getElementById('saveSettings');
const filePreview = document.getElementById('filePreview');
const fileDetails = document.getElementById('fileDetails');
const closeFilePreview = document.getElementById('closeFilePreview');
const sendFile = document.getElementById('sendFile');

// Settings (persisted in localStorage)
let endpoint = localStorage.getItem('ai_endpoint') || 'https://api.example.com/v1/chat';
let modelId = localStorage.getItem('ai_model_id') || 'model-id';
endpointInput.value = endpoint;
modelInput.value = modelId;

// Modal helpers
function showModal(modal) {
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.add('active'), 10);
}
function hideModal(modal) {
    modal.classList.remove('active');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

// Settings modal
settingsBtn.onclick = () => showModal(settingsModal);
closeSettings.onclick = () => hideModal(settingsModal);
saveSettings.onclick = () => {
    endpoint = endpointInput.value.trim();
    modelId = modelInput.value.trim();
    localStorage.setItem('ai_endpoint', endpoint);
    localStorage.setItem('ai_model_id', modelId);
    hideModal(settingsModal);
};

// File upload
fileBtn.onclick = () => fileInput.click();
fileInput.onchange = () => {
    if (fileInput.files.length) {
        const file = fileInput.files[0];
        fileDetails.innerHTML = `<strong>Name:</strong> ${file.name}<br><strong>Size:</strong> ${file.size} bytes<br><strong>Type:</strong> ${file.type || 'Unknown'}`;
        showModal(filePreview);
    }
};
closeFilePreview.onclick = () => hideModal(filePreview);
sendFile.onclick = async () => {
    if (!fileInput.files.length) return;
    const file = fileInput.files[0];
    appendMessage('user', `Sent file: <em>${file.name}</em>`);
    hideModal(filePreview);
    await sendToAI('', file);
    fileInput.value = '';
};

// Chat form
chatForm.onsubmit = async (e) => {
    e.preventDefault();
    const text = userInput.value.trim();
    if (!text) return;
    appendMessage('user', text);
    userInput.value = '';
    await sendToAI(text);
};

// Message rendering
function appendMessage(sender, text) {
    const msg = document.createElement('div');
    msg.className = `message ${sender}`;
    msg.innerHTML = text;
    chatArea.appendChild(msg);
    chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' });
}

// AI communication
async function sendToAI(text, file) {
    // Streaming support
    appendMessage('ai', `<span class="typing"></span>`);
    const aiMsg = chatArea.querySelector('.message.ai:last-child');
    try {
        let response;
        if (file) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('model', modelId);
            formData.append('messages', JSON.stringify([{ role: 'user', content: `File upload: ${file.name}` }]));
            response = await fetch(endpoint, {
                method: 'POST',
                body: formData
            });
            if (!response.ok) throw new Error('Network error');
            const data = await response.json();
            aiMsg.innerHTML = '';
            let reply = data.reply || (data.choices && data.choices[0]?.message?.content) || '[No reply]';
            // Remove <prompt>...</prompt> and set as input prompt if present
            reply = handlePromptTag(reply);
            animateText(aiMsg, reply.cleaned);
            if (reply.prompt) {
                userInput.placeholder = reply.prompt;
            } else {
                userInput.placeholder = 'Type your message...';
            }
        } else {
            response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: text }], stream: true })
            });
            if (!response.ok) throw new Error('Network error');
            // Streaming response
            const reader = response.body.getReader();
            let buffer = '';
            aiMsg.innerHTML = '';
            let promptText = null;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = new TextDecoder().decode(value);
                buffer += chunk;
                // Try to parse as JSON lines or OpenAI stream format
                let lines = buffer.split('\n');
                buffer = lines.pop();
                for (let line of lines) {
                    line = line.trim();
                    if (!line) continue;
                    if (line.startsWith('data:')) line = line.slice(5).trim();
                    if (line === '[DONE]') continue;
                    try {
                        const delta = JSON.parse(line);
                        let content = delta.choices?.[0]?.delta?.content || delta.reply || delta.content || '';
                        if (content) {
                            // Remove <prompt>...</prompt> and set as input prompt if present
                            const result = handlePromptTag(content);
                            aiMsg.innerHTML += result.cleaned.replace(/\n/g, '<br>');
                            if (result.prompt) promptText = result.prompt;
                            chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' });
                        }
                    } catch {}
                }
            }
            if (!aiMsg.innerHTML) aiMsg.innerHTML = '[No reply]';
            if (promptText) {
                userInput.placeholder = promptText;
            } else {
                userInput.placeholder = 'Type your message...';
            }
        }
    } catch (err) {
        aiMsg.innerHTML = `<span style=\"color:#d7263d;\">Error: ${err.message}</span>`;
    }
    chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' });
}

// Remove <prompt>...</prompt> and return { cleaned, prompt }
function handlePromptTag(text) {
    if (!text) return { cleaned: '', prompt: null };
    const promptMatch = text.match(/<prompt>([\s\S]*?)<\/prompt>/i);
    // Remove <prompt>...</prompt> but do NOT trim the result, to preserve leading/trailing spaces
    let cleaned = text.replace(/<prompt>[\s\S]*?<\/prompt>/gi, '');
    let prompt = promptMatch ? promptMatch[1].trim() : null;
    return { cleaned, prompt };
}

// Animated text effect
function animateText(element, text) {
    element.innerHTML = '';
    let i = 0;
    function type() {
        if (i < text.length) {
            element.innerHTML += text[i] === '\n' ? '<br>' : text[i];
            i++;
            setTimeout(type, 16 + Math.random() * 24);
        }
    }
    type();
}

// Dismiss modals on overlay click
[settingsModal, filePreview].forEach(modal => {
    modal.onclick = e => {
        if (e.target === modal) hideModal(modal);
    };
});

// Keyboard shortcuts
window.onkeydown = e => {
    if (e.key === 'Escape') {
        if (!settingsModal.classList.contains('hidden')) hideModal(settingsModal);
        if (!filePreview.classList.contains('hidden')) hideModal(filePreview);
    }
};

// Initial focus
userInput.focus();
