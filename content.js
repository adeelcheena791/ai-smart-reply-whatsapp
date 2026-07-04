// content.js - WhatsApp AI Reply v2.1 - Production Ready
'use strict';

const CONFIG = {
  MIN_INTERVAL: 3000,
  MAX_CONTEXT_MSGS: 6,
  MAX_TEXT_LENGTH: 200,
  TOAST_DURATION: 3000,
  SUGGESTION_TIMEOUT: 15000
};

const STATE = {
  isGenerating: false,
  lastRequestTime: 0,
  observer: null,
  buttonEl: null,
  isInitialized: false
};

const SELECTORS = {
  MESSAGE_ROW: 'div[role="row"]',
  MESSAGE_IN: 'div.message-in',
  MESSAGE_OUT: 'div.message-out',
  MESSAGE_CONTAINER: 'div[data-id^="false_"], div[data-id^="true_"], div[data-id]',
  MESSAGE_TEXT: 'span.selectable-text.copyable-text, div.copyable-text span, span[dir]',
  INPUT_BOX: [
    'div[contenteditable="true"][data-tab="10"]',
    'div[contenteditable="true"][role="textbox"]',
    'footer div[contenteditable="true"]',
    'div[data-testid="conversation-compose-box-input"]',
    'div.lexical-rich-text-input div[contenteditable="true"]'
  ],
  CHAT_LIST: 'div[data-testid="conversation-panel-messages"], div[role="application"], div[data-tab="8"]',
  SEND_BUTTON: 'button[data-testid="compose-btn-send"], span[data-icon="send"]'
};

/**
 * Main handler - Generates single accurate reply
 */
async function handleGenerateReplies(isAuto = false) {
  console.log('[AI] handleGenerateReplies called, auto:', isAuto);

  if (STATE.isGenerating) {
    console.log('[AI] Already generating');
    if (!isAuto) showToast("Processing...", "info");
    return;
  }

  const now = Date.now();
  if (!isAuto && (now - STATE.lastRequestTime) < CONFIG.MIN_INTERVAL) {
    const waitSec = Math.ceil((CONFIG.MIN_INTERVAL - (now - STATE.lastRequestTime)) / 1000);
    showToast(`Wait ${waitSec}s`, "warning");
    return;
  }

  STATE.isGenerating = true;
  STATE.lastRequestTime = now;

  try {
    if (!isAuto) updateButtonState('loading');

    const incomingMsg = await getLastIncomingMessage();
    if (!incomingMsg?.text) {
      console.warn('[AI] No incoming message found');
      if (!isAuto) showError("No message to reply to");
      return;
    }

    console.log('[AI] Target message:', incomingMsg.text.substring(0, 50));

    const userDraft = getUserTypingDraft();
    if (userDraft) {
      console.log('[AI] User draft:', userDraft.substring(0, 30));
    }

    const chatContext = getChatContext(CONFIG.MAX_CONTEXT_MSGS);
    console.log('[AI] Context messages:', chatContext.length);

    // FIX: Check chrome.runtime exists before calling
    if (!chrome?.runtime?.sendMessage) {
      throw new Error('Extension context invalid. Please reload the page.');
    }

    const response = await Promise.race([
      chrome.runtime.sendMessage({
        type: "GENERATE_AI_REPLY",
        incomingMessage: incomingMsg.text,
        userDraft: userDraft,
        context: chatContext,
        timestamp: Date.now()
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Request timeout")), 12000)
      )
    ]);

    console.log('[AI] Response:', response);

    if (!response?.success) {
      throw new Error(response?.error || "Generation failed");
    }

    const reply = response.reply || response.replies?.[0];
    if (!reply) {
      throw new Error("AI returned empty reply");
    }

    const cleanReply = sanitizeReply(reply);
    if (!cleanReply) {
      throw new Error("Reply sanitization failed");
    }

    console.log('[AI] Final reply:', cleanReply);
    showSingleReply(cleanReply, isAuto);
    if (!isAuto) showToast("✅ Ready", "success");

  } catch (err) {
    console.error('[AI] Generation error:', err);
    const errMsg = err.message.includes('Extension context invalid')
  ? "Extension error. Reload page."
      : err.message.includes('timeout')
    ? "Request timed out. Check connection."
      : err.message;
    if (!isAuto) showError(errMsg);
  } finally {
    STATE.isGenerating = false;
    updateButtonState('idle');
  }
}

/**
 * Get ONLY the last incoming message - Updated for 2026 WhatsApp
 */
async function getLastIncomingMessage() {
  try {
    const allMessages = document.querySelectorAll(SELECTORS.MESSAGE_CONTAINER);

    for (let i = allMessages.length - 1; i >= 0; i--) {
      const node = allMessages[i];
      const dataId = node.getAttribute('data-id');

      if (!dataId) continue;

      const isIncoming = dataId.startsWith('false_');
      if (!isIncoming) continue;

      const textEl = node.querySelector(SELECTORS.MESSAGE_TEXT);
      const text = textEl?.textContent?.trim() || textEl?.innerText?.trim();

      if (text && text.length > 0 && text.length < CONFIG.MAX_TEXT_LENGTH) {
        console.log('[AI] Found incoming:', text.substring(0, 30));
        return { text, dataId };
      }
    }

    // Fallback: class-based
    const incomingNodes = document.querySelectorAll(SELECTORS.MESSAGE_IN);
    if (incomingNodes.length > 0) {
      const lastNode = incomingNodes[incomingNodes.length - 1];
      const textEl = lastNode.querySelector(SELECTORS.MESSAGE_TEXT);
      const text = textEl?.textContent?.trim();

      if (text && text.length > 0) {
        console.log('[AI] Found incoming via class:', text.substring(0, 30));
        return { text };
      }
    }

    console.warn('[AI] No incoming message found');
    return null;
  } catch (err) {
    console.error('[AI] getLastIncomingMessage error:', err);
    return null;
  }
}

/**
 * Get user typing draft - Multiple selectors for reliability
 */
function getUserTypingDraft() {
  try {
    for (const selector of SELECTORS.INPUT_BOX) {
      const inputBox = document.querySelector(selector);
      if (!inputBox) continue;

      const draft = inputBox.innerText?.trim() || inputBox.textContent?.trim();

      if (draft && draft.length > 0 && draft.length < CONFIG.MAX_TEXT_LENGTH) {
        return draft;
      }
    }
    return null;
  } catch (err) {
    console.error('[AI] getUserTypingDraft error:', err);
    return null;
  }
}

/**
 * Get chat context
 */
function getChatContext(maxMessages = 6) {
  try {
    const messages = [];
    const messageNodes = document.querySelectorAll(SELECTORS.MESSAGE_CONTAINER);
    const recentNodes = Array.from(messageNodes).slice(-maxMessages);

    recentNodes.forEach(node => {
      try {
        const dataId = node.getAttribute('data-id');
        const isOutgoing = dataId?.startsWith('true_');
        const textEl = node.querySelector(SELECTORS.MESSAGE_TEXT);
        const text = textEl?.textContent?.trim();

        if (text && text.length > 0) {
          messages.push({
            sender: isOutgoing? "You" : "Them",
            text: text.substring(0, 150)
          });
        }
      } catch (e) {}
    });

    return messages;
  } catch (err) {
    console.error('[AI] getChatContext error:', err);
    return [];
  }
}

/**
 * Sanitize AI reply
 */
function sanitizeReply(rawReply) {
  if (!rawReply) return null;

  let clean = String(rawReply)
.trim()
.replace(/^["'\[\{\(]+|["'\]\}\)]+$/g, '')
.replace(/```[\s\S]*?```/g, '')
.replace(/\\n/g, ' ')
.replace(/\s+/g, ' ')
.replace(/^(Reply:|REPLY:|Answer:)\s*/i, '')
.trim();

  if (clean.length < 3 || clean.length > 250) {
    console.warn('[AI] Reply length invalid:', clean.length);
    return null;
  }

  const incompletePatterns = [/^I am$/i, /^I am doing$/i, /^I'm$/i, /^Yes$/i, /^No$/i, /^Ok$/i];
  if (incompletePatterns.some(p => p.test(clean))) {
    console.warn('[AI] Incomplete reply detected:', clean);
    return null;
  }

  if (!/[.!?]$/.test(clean) && clean.length > 10) {
    clean += '.';
  }

  return clean;
}

/**
 * Insert text into WhatsApp input - Fixed for React/Lexical 2026
 */
function insertTextIntoWhatsApp(text) {
  console.log('[AI] Inserting text:', text.substring(0, 30));

  try {
    let inputBox = null;

    for (const selector of SELECTORS.INPUT_BOX) {
      inputBox = document.querySelector(selector);
      if (inputBox) break;
    }

    if (!inputBox) {
      console.error('[AI] Input box not found');
      showError("Couldn't find input box");
      return false;
    }

    inputBox.focus();

    // Method 1: Clipboard API - Most reliable for WhatsApp 2026
    try {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', text);

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dataTransfer,
        bubbles: true,
        cancelable: true
      });

      inputBox.dispatchEvent(pasteEvent);

      // Check if it worked
      setTimeout(() => {
        if (inputBox.innerText.trim()!== text.trim()) {
          // Method 2: Fallback execCommand
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, text);
        }

        // Trigger React events
        inputBox.dispatchEvent(new Event('input', { bubbles: true }));
        inputBox.dispatchEvent(new Event('change', { bubbles: true }));
      }, 50);

    } catch (err) {
      console.warn('[AI] Clipboard method failed, using execCommand:', err);
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
      inputBox.dispatchEvent(new Event('input', { bubbles: true }));
    }

    console.log('[AI] Text inserted successfully');
    return true;

  } catch (err) {
    console.error('[AI] insertTextIntoWhatsApp error:', err);
    return false;
  }
}

/**
 * UI: Show single reply suggestion
 */
function showSingleReply(reply, isAuto = false) {
  document.getElementById('ai-reply-suggestions')?.remove();

  const box = document.createElement('div');
  box.id = 'ai-reply-suggestions';
  box.style.cssText = `
    position: fixed;
    bottom: 90px;
    right: 20px;
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.12);
    padding: 14px;
    z-index: 99998;
    max-width: 340px;
    border: 1.5px solid #8B5CF6;
    animation: slideIn 0.2s ease-out;
  `;

  if (!document.getElementById('ai-reply-styles')) {
    const style = document.createElement('style');
    style.id = 'ai-reply-styles';
    style.textContent = `
      @keyframes slideIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }

  const header = document.createElement('div');
  header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;';
  header.innerHTML = `
    <span style="font-weight: 600; font-size: 12px; color: #8B5CF6;">✨ AI Reply</span>
    <button id="ai-close-btn" style="background: none; border: none; cursor: pointer; font-size: 18px; color: #9CA3AF; padding: 0 4px;">×</button>
  `;
  box.appendChild(header);

  const replyBtn = document.createElement('button');
  replyBtn.textContent = reply;
  replyBtn.style.cssText = `
    width: 100%;
    text-align: left;
    padding: 12px;
    background: #F5F3FF;
    border: 1px solid #C4B5FD;
    border-radius: 10px;
    cursor: pointer;
    font-size: 14px;
    color: #1F2937;
    line-height: 1.5;
    transition: all 0.15s;
    word-wrap: break-word;
  `;

  replyBtn.onmouseenter = () => {
    replyBtn.style.background = '#8B5CF6';
    replyBtn.style.color = '#ffffff';
    replyBtn.style.transform = 'scale(1.02)';
  };

  replyBtn.onmouseleave = () => {
    replyBtn.style.background = '#F5F3FF';
    replyBtn.style.color = '#1F2937';
    replyBtn.style.transform = 'scale(1)';
  };

  replyBtn.onclick = () => {
    if (insertTextIntoWhatsApp(reply)) {
      box.remove();
      showToast("Inserted ✓", "success");
    }
  };

  box.appendChild(replyBtn);

  const regenBtn = document.createElement('button');
  regenBtn.innerHTML = '🔄 Regenerate';
  regenBtn.style.cssText = `
    width: 100%;
    margin-top: 8px;
    padding: 8px;
    background: transparent;
    border: 1px solid #E5E7EB;
    border-radius: 8px;
    cursor: pointer;
    font-size: 12px;
    color: #6B7280;
    transition: all 0.15s;
  `;
  regenBtn.onmouseenter = () => regenBtn.style.background = '#F9FAFB';
  regenBtn.onmouseleave = () => regenBtn.style.background = 'transparent';
  regenBtn.onclick = () => {
    box.remove();
    handleGenerateReplies(false);
  };
  box.appendChild(regenBtn);

  header.querySelector('#ai-close-btn').onclick = () => box.remove();
  document.body.appendChild(box);
  setTimeout(() => box.remove(), CONFIG.SUGGESTION_TIMEOUT);
}

/**
 * UI Helpers
 */
function showToast(message, type = "info") {
  let toast = document.getElementById('ai-reply-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ai-reply-toast';
    toast.style.cssText = `
      position: fixed; top: 70px; right: 20px; padding: 12px 18px;
      border-radius: 10px; color: white; font-size: 13px; font-weight: 500;
      z-index: 99999; box-shadow: 0 4px 16px rgba(0,0,0,0.15);
      transition: all 0.3s; opacity: 0;
    `;
    document.body.appendChild(toast);
  }

  const colors = { info: '#3B82F6', success: '#10B981', warning: '#F59E0B', error: '#EF4444' };
  toast.style.background = colors[type] || colors.info;
  toast.textContent = message;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, CONFIG.TOAST_DURATION);
}

function updateButtonState(state) {
  if (!STATE.buttonEl) return;
  const states = {
    idle: { text: '✨', disabled: false, opacity: '1' },
    loading: { text: '⏳', disabled: true, opacity: '0.6' }
  };
  const config = states[state] || states.idle;
  STATE.buttonEl.innerHTML = config.text;
  STATE.buttonEl.disabled = config.disabled;
  STATE.buttonEl.style.opacity = config.opacity;
}

function showLoading() { updateButtonState('loading'); }
function hideLoading() { updateButtonState('idle'); }
function showError(message) { showToast(message, "error"); hideLoading(); }

/**
 * Initialize icon-only button
 */
function initAIButton() {
  if (STATE.buttonEl || document.getElementById('ai-reply-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'ai-reply-btn';
  btn.innerHTML = '✨';
  btn.title = 'Generate AI Reply';
  btn.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 48px;
    height: 48px;
    background: linear-gradient(135deg, #8B5CF6, #A78BFA);
    color: white;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    font-size: 20px;
    box-shadow: 0 4px 16px rgba(139, 92, 246, 0.4);
    z-index: 99997;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  btn.onmouseenter = () => {
    btn.style.transform = 'scale(1.1)';
    btn.style.boxShadow = '0 6px 20px rgba(139, 92, 246, 0.5)';
  };

  btn.onmouseleave = () => {
    btn.style.transform = 'scale(1)';
    btn.style.boxShadow = '0 4px 16px rgba(139, 92, 246, 0.4)';
  };

  btn.onclick = () => handleGenerateReplies(false);
  document.body.appendChild(btn);
  STATE.buttonEl = btn;
  console.log('[AI] Button initialized');
}

/**
 * Observer for new messages
 */
function initMessageObserver() {
  if (STATE.observer) STATE.observer.disconnect();

  const chatList = document.querySelector(SELECTORS.CHAT_LIST);
  if (!chatList) {
    console.warn('[AI] Chat list not found, retrying...');
    setTimeout(initMessageObserver, 2000);
    return;
  }

  STATE.observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        const addedNode = mutation.addedNodes[0];
        if (addedNode?.querySelector?.(SELECTORS.MESSAGE_IN)) {
          console.log('[AI] New incoming message detected');
        }
      }
    }
  });

  STATE.observer.observe(chatList, { childList: true, subtree: true });
  console.log('[AI] Message observer initialized');
}

/**
 * Initialize extension
 */
function init() {
  if (STATE.isInitialized) return;
  STATE.isInitialized = true;

  console.log('[AI] Initializing WhatsApp AI Reply Extension v2.1');

  const initInterval = setInterval(() => {
    if (document.querySelector(SELECTORS.CHAT_LIST)) {
      clearInterval(initInterval);
      initAIButton();
      initMessageObserver();
      console.log('[AI] Extension ready');
    }
  }, 1000);

  setTimeout(() => clearInterval(initInterval), 30000);
}

// Start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Keep button alive
setInterval(() => {
  if (!document.getElementById('ai-reply-btn')) {
    console.log('[AI] Button missing, reinitializing');
    initAIButton();
  }
}, 5000);

// Handle messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'EXTRACT_CHAT_DATA') {
    const data = getChatContext(20);
    sendResponse({ success: true, data });
    return true;
  }
});