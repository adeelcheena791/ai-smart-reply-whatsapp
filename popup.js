// popup.js - Settings handler

const apiKeyInput = document.getElementById("apiKey");
const toneSelect = document.getElementById("toneSelect");
const enabledToggle = document.getElementById("enabledToggle");
const saveBtn = document.getElementById("saveBtn");
const statusDiv = document.getElementById("status");
const toggleKeyBtn = document.getElementById("toggleKey");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");

// Load saved settings
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get(["geminiApiKey", "replyTone", "enabled"], (res) => {
    if (res.geminiApiKey) apiKeyInput.value = res.geminiApiKey;
    if (res.replyTone) toneSelect.value = res.replyTone;
    enabledToggle.checked = res.enabled !== false; // default true
  });

  checkBackgroundStatus();
});

// Toggle API key visibility
toggleKeyBtn.onclick = () => {
  apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
  toggleKeyBtn.textContent = apiKeyInput.type === "password" ? "👁️" : "🙈";
};

// Save settings
saveBtn.onclick = () => {
  const apiKey = apiKeyInput.value.trim();
  const tone = toneSelect.value;
  const enabled = enabledToggle.checked;

  if (!apiKey) {
    showStatus("API key required", "error");
    return;
  }

  if (!apiKey.startsWith("AIza")) {
    showStatus("Invalid Gemini API key format", "error");
    return;
  }

  chrome.storage.sync.set({
    geminiApiKey: apiKey,
    replyTone: tone,
    enabled: enabled
  }, () => {
    showStatus("Settings saved ✓", "success");
    checkBackgroundStatus();
  });
};

function showStatus(msg, type) {
  statusDiv.textContent = msg;
  statusDiv.className = `status ${type}`;
  setTimeout(() => {
    statusDiv.textContent = "";
    statusDiv.className = "status";
  }, 3000);
}

function checkBackgroundStatus() {
  chrome.runtime.sendMessage({ type: "PING" }, (response) => {
    if (chrome.runtime.lastError ||!response?.success) {
      statusDot.className = "dot error";
      statusText.textContent = "Background error";
    } else {
      statusDot.className = "dot ok";
      statusText.textContent = "Ready";
    }
  });
}