[WhatsApp_Extension_README.md](https://github.com/user-attachments/files/29670154/WhatsApp_Extension_README.md)
 AI Smart Reply — WhatsApp Web Chrome Extension

<div align="center">

![Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=google-chrome)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6-yellow?style=for-the-badge&logo=javascript)
![Python](https://img.shields.io/badge/Python-Flask-blue?style=for-the-badge&logo=python)
![Gemini](https://img.shields.io/badge/Google-Gemini%20AI-orange?style=for-the-badge&logo=google)
![Manifest](https://img.shields.io/badge/Manifest-V3-green?style=for-the-badge)

A Chrome extension that reads your WhatsApp Web conversations and suggests AI-powered smart replies in real time using Google Gemini.

</div>

---

 Features

| Feature | Description |
|---------|-------------|
| AI Reply Suggestions | Reads WhatsApp conversation and suggests smart replies |
| Real-time Analysis | Analyzes messages as they arrive instantly |
| Context Aware | Understands full conversation context |
| Velocity Tracking| Detects conversation speed (NORMAL / FAST) |
| Python Backend | Flask server handles AI API calls |
| Gemini 2.5 Flash | Uses Google's latest fast AI model |
| WhatsApp Web | Works directly inside WhatsApp Web interface |

---

Architecture

```
Chrome Browser (WhatsApp Web)
        ↓
content.js — reads messages from WhatsApp DOM
        ↓
background.js — Chrome service worker
        ↓
Python Flask Server (localhost:5000)
        ↓
Google Gemini AI API
        ↓
Smart reply suggestions injected into WhatsApp UI
```

---

 Project Structure

```
ai-smart-reply-whatsapp/
├── manifest.json           Chrome extension config (Manifest V3)
├── content.js             Injected into WhatsApp Web — reads messages
├── background.js          Service worker — handles extension logic
├── utils/
│   └── ai.js              AI utility functions
├── popup/
│   ├── popup.html         Extension popup UI
│   ├── popup.js           Popup logic
│   └── popup.css          Popup styling
├── styles/
│   └── content.css        Styles injected into WhatsApp Web
└── python-server/
    └── server.py         Flask server for Gemini API calls
```

---
 Installation & Setup

 Step 1 — Start Python Server

```bash
cd python-server
pip install flask flask-cors requests
python server.py
```

Server runs at `http://localhost:5000`

 Step 2 — Load Extension in Chrome

1. Open Chrome → go to `chrome://extensions/`
2. Enable Developer Mode (top right toggle)
3. Click "Load unpacked"
4. Select the project folder
5. Extension is now installed! 

 Step 3 — Configure API Key

1. Click the extension icon in Chrome toolbar
2. Enter your Google Gemini API key
3. Get free key at: `https://aistudio.google.com/app/apikey`

Step 4 — Use on WhatsApp Web

1. Open `https://web.whatsapp.com`
2. Open any chat
3. AI suggestions appear automatically! 

---

How It Works

content.js
Injected directly into WhatsApp Web page. Reads the conversation messages from the DOM and sends them to the background script.

 background.js
Chrome service worker that receives messages from content script and forwards them to the Python Flask server.

Python Server (server.py)
Flask server that:
- Receives conversation text
- Sends to Google Gemini API
- Returns AI-generated reply suggestions
- Handles model fallbacks (tries multiple Gemini models)

AI Response
Gemini analyzes the conversation context and returns contextually relevant reply suggestions that are displayed in the WhatsApp interface.

---

Tech Stack

```
Extension:    JavaScript (Manifest V3)
Backend:      Python + Flask
AI Model:     Google Gemini 2.5 Flash
API:          Google Generative Language API
Permissions:  activeTab, storage, scripting
Host:         https://web.whatsapp.com/*
```

---

 Configuration

The extension uses these Chrome permissions:
- `storage` — save user settings and API key
- `activeTab` — access current tab
- `scripting` — inject scripts into WhatsApp Web
- `alarms` — schedule periodic checks

---

 Privacy & Security

- API key stored locally in Chrome storage only
- No conversation data sent to any third-party server
- Only communicates with Google Gemini API directly
- Python server runs locally on your machine

---

Troubleshooting

| Problem | Solution |
|---------|----------|
| `HTTP 429` error | Gemini rate limit hit — wait 1 minute |
| `HTTP 404` error | Model not found — server tries fallback models |
| Extension not working | Make sure Python server is running first |
| No suggestions showing | Check API key is entered in popup |

---

Future Improvements

- [ ] Direct API calls without Python server
- [ ] Support for multiple languages
- [ ] Tone selection (formal/casual)
- [ ] Support for Telegram and other platforms
- [ ] Custom prompt templates

---

 About the Developer

Muhammad Adeel
-  Software Engineering @ Zhengzhou University (ZZU), China
-  Building AI-powered applications and Chrome extensions
-  [ChatPilot AI](https://chatpilot-hwhr.onrender.com) — My other AI project
- adeelcheena791@gmail.com

---

 License

MIT License — feel free to use and modify!

---

<div align="center">
Built with  by Muhammad Adeel | ZZU China 2026
</div>
