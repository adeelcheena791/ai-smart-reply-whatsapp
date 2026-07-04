// background.js - Chrome Extension MV3 Service Worker
// v6.0 PREMIUM ULTRA-HUMAN ENGINE - Conversational Velocity + Context-Driven Depth
'use strict';

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
  GEMINI_MODELS: [
    "gemini-2.5-flash",
    "gemini-1.5-flash",
    "gemini-flash-latest"
  ],
  BASE_URL: "https://generativelanguage.googleapis.com/v1beta/models",
  MIN_REQUEST_INTERVAL: 1200,
  REQUEST_TIMEOUT: 30000,
  CACHE_TTL: 90000,
  MAX_RETRIES: 2,
  MAX_CACHE_SIZE: 50,
  // How many recent messages to track for impatience detection
  VELOCITY_WINDOW: 5
};

// ============================================================================
// STATE
// ============================================================================
const STATE = {
  requestQueue: [],
  isProcessing: false,
  lastRequestTime: 0,
  cache: new Map(),
  activeRequests: new Set()
};

// ============================================================================
// LIFECYCLE
// ============================================================================
chrome.runtime.onStartup.addListener(() => {
  console.log('[BG] v6.0 Premium Human Engine Online.');
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[BG] Premium Engine Installed/Updated:', details.reason);
});

// Keep service worker alive
setInterval(() => {
  chrome.runtime.getPlatformInfo();
}, 20e3);

// ============================================================================
// MESSAGE ROUTER
// ============================================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    switch (request.type) {
      case 'GENERATE_AI_REPLY':
      case 'GENERATE_REPLY':
        handleGenerateReply(request, sendResponse);
        return true;

      case 'GET_CHAT_DATA':
        handleGetChatData(request, sender, sendResponse);
        return true;

      case 'PING':
        sendResponse({ success: true, timestamp: Date.now(), version: '6.0-PREMIUM' });
        return false;

      case 'CLEAR_CACHE':
        STATE.cache.clear();
        sendResponse({ success: true });
        return false;

      default:
        console.warn('[BG] Unknown message type:', request.type);
        sendResponse({ success: false, error: 'Unknown message type: ' + request.type });
        return false;
    }
  } catch (err) {
    console.error('[BG] Critical Runtime Error:', err);
    sendResponse({ success: false, error: err.message });
    return false;
  }
});

// ============================================================================
// REQUEST HANDLER + QUEUE
// ============================================================================
async function handleGenerateReply(request, sendResponse) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    STATE.activeRequests.add(requestId);
    STATE.requestQueue.push({ request, sendResponse, id: requestId, timestamp: Date.now() });

    if (!STATE.isProcessing) {
      processQueue();
    }
  } catch (err) {
    STATE.activeRequests.delete(requestId);
    sendResponse({ success: false, error: err.message });
  }
}

async function processQueue() {
  if (STATE.isProcessing || STATE.requestQueue.length === 0) return;
  STATE.isProcessing = true;

  while (STATE.requestQueue.length > 0) {
    const { request, sendResponse, id } = STATE.requestQueue.shift();

    try {
      const now = Date.now();
      const waitTime = CONFIG.MIN_REQUEST_INTERVAL - (now - STATE.lastRequestTime);
      if (waitTime > 0) await new Promise(r => setTimeout(r, waitTime));

      const cacheKey = generateCacheKey(request);
      const cached = STATE.cache.get(cacheKey);

      if (cached && (Date.now() - cached.timestamp) < CONFIG.CACHE_TTL) {
        STATE.activeRequests.delete(id);
        sendResponse(cached.data);
        continue;
      }

      const result = await executeGenerateReply(request);

      if (result.success) {
        STATE.cache.set(cacheKey, { data: result, timestamp: Date.now() });
        cleanupCache();
      }

      STATE.activeRequests.delete(id);
      sendResponse(result);
      STATE.lastRequestTime = Date.now();

    } catch (err) {
      console.error('[BG] Queue failure:', id, err);
      STATE.activeRequests.delete(id);
      sendResponse({ success: false, error: err.message || 'Processing pipeline error' });
    }
  }

  STATE.isProcessing = false;
}

async function executeGenerateReply(request) {
  try {
    const storage = await chrome.storage.sync.get(['geminiApiKey', 'replyTone']);
    const apiKey = storage.geminiApiKey;
    const tone = storage.replyTone || 'casual';

    if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('AIza')) {
      return { success: false, error: 'API key missing. Configure it in extension settings.' };
    }

    if (!request.incomingMessage || typeof request.incomingMessage !== 'string') {
      return { success: false, error: 'Incoming message body is empty.' };
    }

    return await callGeminiWithRetry(request, apiKey, tone);
  } catch (err) {
    return { success: false, error: err.message || 'Processing error' };
  }
}

async function callGeminiWithRetry(request, apiKey, tone) {
  let lastError = null;

  for (let attempt = 0; attempt < CONFIG.MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }

    for (const model of CONFIG.GEMINI_MODELS) {
      try {
        const result = await callGeminiAPI(model, request, apiKey, tone);
        if (result.success) return result;
        lastError = result.error;
      } catch (err) {
        lastError = err.message;
        continue;
      }
    }
  }

  return { success: false, error: lastError || 'All generation models failed.' };
}

// ============================================================================
// CONVERSATIONAL VELOCITY ANALYZER
// Reads the last N messages to detect user impatience level.
// Returns: 'DIRECT' | 'NORMAL' | 'DEEP'
// ============================================================================
function analyzeConversationalVelocity(incomingMsg, context) {
  // High-impatience trigger phrases - user wants answers NOW, no fluff
  const impatienceTriggers = [
    /\bfor example\b/i,
    /\bdirectly\b/i,
    /\bjust tell me\b/i,
    /\bexact(ly)?\b/i,
    /\bwhich (one|are|is)\b/i,
    /\bname(s)?\b.*\b(give|tell|list)\b/i,
    /\b(give|tell) me (the )?(name|example|list|specific)/i,
    /\bwhat (are|is) (the )?(exact|specific|actual)\b/i,
    /\bstop\b.*\b(talking|saying|explain)/i,
    /\bget to (the )?point\b/i,
    /\bjust (say|give|name|list)\b/i,
    /\bbro (directly|just|tell|give)\b/i,
    /\bman (just|directly|tell|give)\b/i
  ];

  // Deep-question triggers - user wants rich, psychological, detailed answer
  const deepTriggers = [
    /\bhow (do|can|should) i\b/i,
    /\bwhat('s| is) the (best|secret|trick|tip|key|way)\b/i,
    /\btell me everything\b/i,
    /\bexplain\b/i,
    /\bwhy (does|do|is|are)\b/i,
    /\bgive me (all|every|a complete|a full|a detailed)\b/i,
    /\bhow (to|do you)\b/i,
    /\badvice\b/i,
    /\btips?\b/i,
    /\btrick(s)?\b/i
  ];

  const msg = incomingMsg.toLowerCase();
  const recentMessages = (context || []).slice(-CONFIG.VELOCITY_WINDOW);

  // Count how many recent messages also show impatience
  let impatienceScore = 0;
  if (impatienceTriggers.some(r => r.test(msg))) impatienceScore += 3;

  for (const m of recentMessages) {
    if (m && m.text && impatienceTriggers.some(r => r.test(m.text))) {
      impatienceScore += 1;
    }
  }

  // Short demanding messages (under 12 words) with repeat context = DIRECT mode
  const wordCount = incomingMsg.trim().split(/\s+/).length;
  if (wordCount <= 12 && impatienceScore >= 2) return 'DIRECT';
  if (impatienceScore >= 3) return 'DIRECT';

  // Deep question check
  if (deepTriggers.some(r => r.test(msg)) && impatienceScore < 2) return 'DEEP';

  return 'NORMAL';
}

// ============================================================================
// CORE GEMINI API CALL - PREMIUM PROMPT ENGINE v6.0
// ============================================================================
async function callGeminiAPI(model, request, apiKey, tone) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

  try {
    const incomingMsg = request.incomingMessage.trim();
    const userDraft = request.userDraft || '';
    const context = Array.isArray(request.context) ? request.context : [];

    // Build readable conversation history (last 8 messages for rich context)
    const contextText = context
      .slice(-8)
      .filter(m => m && m.text && m.text.trim())
      .map(m => `${m.sender === 'me' ? 'You (791cheena)' : 'Them'}: ${m.text.trim()}`)
      .join('\n');

    // ── VELOCITY ANALYSIS ──────────────────────────────────────────────────
    const velocity = analyzeConversationalVelocity(incomingMsg, context);

    // ── TOKEN + TEMPERATURE TUNING BASED ON VELOCITY ──────────────────────
    let maxTokens, temperature, topP;

    if (velocity === 'DIRECT') {
      // Sharp, punchy, zero fluff - user is frustrated, give facts immediately
      maxTokens = 280;
      temperature = 0.75;
      topP = 0.90;
    } else if (velocity === 'DEEP') {
      // Rich, detailed, psychological depth - user asked a big question
      maxTokens = 750;
      temperature = 0.92;
      topP = 0.97;
    } else {
      // Normal conversational flow
      maxTokens = 480;
      temperature = 0.88;
      topP = 0.95;
    }

    // ── VELOCITY-SPECIFIC BEHAVIOR INSTRUCTIONS ────────────────────────────
    let velocityInstruction = '';

    if (velocity === 'DIRECT') {
      velocityInstruction = `
⚡ CONVERSATIONAL VELOCITY: DIRECT MODE ACTIVATED
The human has asked for specifics multiple times. They are getting impatient. They do NOT want any intro sentence, any warm-up phrase, or any conversational padding.

YOUR ONLY JOB RIGHT NOW:
→ DROP every filler opener. Zero "oh for sure", "man honestly", "bro okay so", "dude there are", etc.
→ START your reply with the actual answer, fact, name, or item. Immediately.
→ Give real, specific, named examples. Not "travel accessories" — say "Osprey packing cubes", "Anker portable charger", "Moleskine travel journal". Real names. Real products. Real things.
→ Keep it tight and punchy. No wasted words.
→ End with ONE sharp follow-up question locked onto what you just listed.

FEW-SHOT EXAMPLES OF DIRECT MODE:

Them (after being asked 3 times): "bro directly tell me which kind of gift"
WRONG reply: "bro okay if she loves traveling you should definitely get her something that makes travel easier or more memorable, like some travel gear or accessories"
RIGHT reply: "okay real ones — a Béis weekender bag, Anker 20,000mAh power bank, Homesick 'Vacation' candle, or a scratch-off world map poster. she'll genuinely love any of these. which vibe fits her more, practical stuff or sentimental?"

Them: "for example tell me the exact name of things"
WRONG reply: "honestly there are so many cool options depending on your budget man, like if you want something sentimental you could get her..."
RIGHT reply: "okay exact names — Anker power bank, Osprey packing cubes, Away luggage tag set, Polaroid Go camera, or a custom google maps print of her fav city. budget around 30–100 bucks. which of these do you vibe with most?"
`;
    } else if (velocity === 'DEEP') {
      velocityInstruction = `
🔍 CONVERSATIONAL VELOCITY: DEEP MODE
The human asked a rich, meaningful question. They want real depth, psychology, and substance — not a surface-level answer.

YOUR JOB:
→ Give a genuinely thorough, detailed, human answer. Think like a smart close friend who has real experience with this topic.
→ Include specific details, psychology, real-world examples, and genuine nuance.
→ Don't rush it. Let the answer breathe and feel complete.
→ Close with one natural, organic follow-up question.
`;
    } else {
      velocityInstruction = `
💬 CONVERSATIONAL VELOCITY: NORMAL FLOW
Standard back-and-forth texting. Be natural, warm, and genuinely helpful. Match the energy of their message — if they're casual, be casual. If they're curious, dig in a bit.
`;
    }

    // ── MASTER PROMPT ──────────────────────────────────────────────────────
    let prompt = `You are 791cheena — a real human texting a close friend on WhatsApp. You are NOT an AI, assistant, or bot. You respond exactly like a genuine, sharp, caring human friend who gives real answers and keeps conversations alive.

════════════════════════════════════════════
CORE IDENTITY RULES (NEVER BREAK THESE):
════════════════════════════════════════════
1. REAL ANSWERS ONLY: Never talk ABOUT giving an answer. Just give the answer. No "there are so many options!", no "it really depends!", no "honestly man if she's into...". If someone asks for names → give names. If they ask for tips → give the tips.

2. ZERO FILLER OPENERS: Never start with "oh for sure", "man honestly", "dude tbh", "bro okay so", "honestly if she's", "well it depends", or any other stalling phrase. Your first word should be part of the actual answer.

3. ZERO BULLET POINTS OR LISTS: Write in natural flowing text the way humans actually type. Use commas and "and" to link items, not dashes or numbers.

4. CONVERSATIONAL VELOCITY: Read how impatient the person is from the conversation history. The more they repeat or push, the more direct and zero-fluff you become. Never ignore escalating impatience.

5. CONTEXT-DRIVEN LENGTH: Short demanding question = short punchy answer. Big thoughtful question = rich detailed answer. Never give a long answer to "for example?" and never give a short shallow answer to "tell me the exact trick to make her happy".

6. END WITH ONE QUESTION: Every single reply must close with a natural follow-up question that is directly tied to the specific things you just mentioned. Not a generic "what do you think?" — something locked onto your reply.

7. LOWERCASE + CASUAL: Write casually like a real human texter. lowercase is fine. contractions are good. slang is fine. punctuation is natural, not over-structured.

8. TONE SETTING: ${tone}

${velocityInstruction}

════════════════════════════════════════════
FEW-SHOT TRAINING: HOW GOOD LOOKS VS BAD
════════════════════════════════════════════

--- EXAMPLE SET 1: GIFT IDEAS (DIRECT MODE after repeated pushing) ---

Them: "for example tell me the exact name of things which can make easier and memorable"
BAD (what you must NEVER do): "man if she's big on traveling there are honestly so many cool routes you can go, like if you want something sentimental maybe get her a really thoughtful..."
GOOD (what you must always do): "okay exact names — Anker 633 magnetic power bank, Béis the weekender bag in sage, a custom star map from Under Lucky Stars of the place she loves, Polaroid Go mini camera, or a Homesick Vacation candle. these are all under 80 bucks and hit hard. which one matches her personality more, practical or sentimental?"

--- EXAMPLE SET 2: RELATIONSHIP ADVICE (DEEP MODE) ---

Them: "bro tell me the exact tip and trick how I can make her happy"
BAD: "honestly man just be yourself and listen to her lol"
GOOD: "real talk — the biggest thing is remembering the small details she tells you without being asked to. like if she mentioned last week her coffee order or that she's stressed about something at work and you randomly check in on it later, that hits different for girls. it shows you actually listen. second thing, don't try to fix her problems every time she vents — sometimes she just wants you to say 'that sucks, I get it' and actually be present. third, surprise her with effort, not money. a voice note just saying you were thinking of her, showing up with her favorite snack, or suggesting an activity she mentioned wanting to try will do more than any expensive gift. what's the situation with you two, are you already talking to her or still trying to get her attention?"

--- EXAMPLE SET 3: NORMAL FLOW ---

Them: "did you watch that new show everyone's obsessed with"
BAD: "oh for sure man I've been hearing about it everywhere honestly, it sounds pretty good from what people are saying!"
GOOD: "not yet lol been on my list forever though. is it actually good or just twitter overhyping it again? worth dropping everything tonight for?"

--- EXAMPLE SET 4: SHORT CASUAL QUESTION ---

Them: "what should I eat rn"
BAD: "honestly it really depends on what you're in the mood for, there are so many good options you could go with..."
GOOD: "biriyani or bust lol. unless you're trying to be healthy in which case just suffer through a salad. what are you actually feeling though, something heavy or light?"

════════════════════════════════════════════
LIVE CONVERSATION DATA:
════════════════════════════════════════════
${contextText ? `RECENT CONVERSATION HISTORY:\n${contextText}\n` : 'No prior context available.\n'}

THEIR INCOMING MESSAGE RIGHT NOW:
"${incomingMsg}"
${userDraft ? `\nYOUR CURRENT DRAFT (complete and improve this naturally):\n"${userDraft}"` : ''}

════════════════════════════════════════════
YOUR TASK:
════════════════════════════════════════════
${velocity === 'DIRECT'
  ? 'DIRECT MODE: Skip ALL openers. Start with the real answer or specific named items immediately. End with one sharp follow-up question tied to exactly what you listed.'
  : velocity === 'DEEP'
  ? 'DEEP MODE: Give a full, rich, genuinely detailed and psychologically real answer. Cover the topic thoroughly like a knowledgeable friend would. Close with one natural follow-up question.'
  : 'NORMAL MODE: Write one complete, warm, natural human reply that fully addresses their message and closes with one organic follow-up question.'
}

REPLY (start writing immediately, no label, no prefix):`;

    // ── GENERATION CONFIG ──────────────────────────────────────────────────
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: temperature,
        topK: 45,
        topP: topP,
        maxOutputTokens: maxTokens,
        candidateCount: 1,
        stopSequences: [
          "\n\n\n",
          "Them:",
          "You (791cheena):",
          "RECENT CONVERSATION",
          "LIVE CONVERSATION"
        ]
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
      ]
    };

    const url = `${CONFIG.BASE_URL}/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
  signal: controller.signal
});

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${errorBody.substring(0, 120)}`);
    }

    const data = await response.json();
    let cleanReply = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!cleanReply || cleanReply.trim().length === 0) {
      return { success: false, error: 'Empty output received from model.' };
    }

    // ── PREMIUM CLEANUP PIPELINE ───────────────────────────────────────────
    cleanReply = cleanReply.trim();

    // Strip any leading label prefixes the model might hallucinate
    cleanReply = cleanReply.replace(/^(REPLY|Reply|Response|You|AI|Me|791cheena|Them)\s*[:\-–]\s*/i, '');

    // Strip wrapping quotes or brackets the model sometimes adds
    cleanReply = cleanReply.replace(/^["'\[\{\(]+|["'\]\}\)]+$/g, '');

    // Normalize excessive whitespace but preserve paragraph breaks (max 2 newlines)
    cleanReply = cleanReply.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();

    // Strip literal \n escape sequences
    cleanReply = cleanReply.replace(/\\n/g, ' ');

    // Final length guard — hard cap to keep it within WhatsApp readable range
    const hardCap = velocity === 'DIRECT' ? 400 : velocity === 'DEEP' ? 1100 : 700;
    if (cleanReply.length > hardCap) {
      // Find last full sentence end before cap
      const truncated = cleanReply.substring(0, hardCap);
      const lastSentence = Math.max(
        truncated.lastIndexOf('.'),
        truncated.lastIndexOf('!'),
        truncated.lastIndexOf('?')
      );
      cleanReply = lastSentence > hardCap * 0.6
        ? truncated.substring(0, lastSentence + 1).trim()
        : truncated.trim() + '...';
    }

    // Minimum length sanity check
    if (!cleanReply || cleanReply.length < 8) {
      return { success: false, error: 'Generated reply too short to be valid.' };
    }

    return { success: true, reply: cleanReply };

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') return { success: false, error: 'Request timed out.' };
    throw err;
  }
}

// ============================================================================
// CHAT DATA HANDLER
// ============================================================================
async function handleGetChatData(request, sender, sendResponse) {
  try {
    let targetTabId = sender.tab?.id;

    if (!targetTabId) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        sendResponse({ success: false, error: 'No active tab found.' });
        return;
      }
      targetTabId = tab.id;
    }

    const response = await chrome.tabs.sendMessage(targetTabId, {
      type: 'EXTRACT_CHAT_DATA',
      ...request
    });

    sendResponse(response || { success: false, error: 'Content script extraction failed.' });

  } catch (err) {
    console.error('[BG] Content script message error:', err);
    sendResponse({ success: false, error: 'Failed to reach content script.' });
  }
}

// ============================================================================
// UTILITIES
// ============================================================================
function generateCacheKey(request) {
  try {
    return JSON.stringify({
      msg: request.incomingMessage?.substring(0, 120),
      draft: request.userDraft?.substring(0, 50),
      ctx: request.context?.slice(-3).map(m => m?.text?.substring(0, 30)).join('|') || ''
    });
  } catch {
    return `key_${Date.now()}`;
  }
}

function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of STATE.cache.entries()) {
    if (now - value.timestamp > CONFIG.CACHE_TTL) {
      STATE.cache.delete(key);
    }
  }
  while (STATE.cache.size > CONFIG.MAX_CACHE_SIZE) {
    STATE.cache.delete(STATE.cache.keys().next().value);
  }
}

console.log('[BG] v6.0 Premium Human Engine — Fully Initialized. Velocity Tracking Active.');