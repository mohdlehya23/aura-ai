// Modular main.js - Entry point and coordination
import { StateManager } from './state-manager.js';
import { WebSocketHandler } from './websocket-handler.js';
import { ProviderManager } from './provider-manager.js';
import {
    setupMicrophone,
    startAudioProcessing,
    stopAudioProcessing,
    getScreenVideoTrack,
    isScreenSharingAvailable,
    lastAudioError
} from './audio_handler.js';
import muteManager from './mute-manager.js';
import { autofillForTesting } from './dev.js';
import { loadConfig, isDev, devLog, devWarn, devError, applyConsoleGate } from './config.js';
import liveInterviewUI from './live-interview.js';
import hotkeyManager from './hotkeys.js';
import presetManager from './preset-manager.js';
import screenshotService from './screenshot-service.js';
import { ConfigManager } from './config-manager.js';
import { ProfileManager } from './profile-manager.js';
import { testStreamingMarkdown, testSampleMarkdown } from './streaming-markdown-demo.js';

// Initialize managers
const stateManager = new StateManager();
const webSocketHandler = new WebSocketHandler(stateManager);
const providerManager = new ProviderManager(stateManager, webSocketHandler);
const configManager = new ConfigManager(stateManager);
const profileManager = new ProfileManager(stateManager, providerManager);

// Expose to window for inter-module integration
window.providerManager = providerManager;
window.configManager = configManager;
window.profileManager = profileManager;

// --- Dependency Injection ---
// Wire the managers together to avoid race conditions and reliance on globals.
// This ensures the WebSocketHandler has a direct reference to the ProviderManager.
webSocketHandler.setProviderManager(providerManager);

// --- DOM Elements ---
const views = {
    onboarding: document.getElementById('onboarding-view'),
    preflight: document.getElementById('preflight-view'),
    live: document.getElementById('live-view'),
};

const micSelect = document.getElementById('mic-select');
const proceedButton = document.getElementById('proceed-to-checks');
const startButton = document.getElementById('start-interview-button');
const backButton = document.getElementById('back-to-onboarding-btn');

// --- Tab Management ---
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-tab');

            // Update buttons
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update panes
            tabPanes.forEach(p => p.classList.remove('active'));
            const targetPane = document.getElementById(targetId);
            if (targetPane) targetPane.classList.add('active');

            // Refresh advanced config if switching to that tab
            if (targetId === 'advanced-config-tab') {
                configManager.loadInitialData();
            }
        });
    });

    // Wire up the Fill Demo Data button
    const fillDemoBtn = document.getElementById('fill-demo-btn');
    if (fillDemoBtn) {
        fillDemoBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            autofillForTesting();
            profileManager.saveProfile(null, true);
            fillDemoBtn.textContent = '✅ Filled!';
            setTimeout(() => { fillDemoBtn.textContent = '⚡ Demo'; }, 1500);
        });
    }
}


// --- View Management ---
function switchView(targetView) {
    Object.values(views).forEach(view => view.classList.remove('active'));
    views[targetView].classList.add('active');
}

function handleOnboarding() {
    if (stateManager.handleOnboarding()) {
        profileManager.saveProfile(null, true);
        switchView('preflight');
        runPreFlightChecks();
    }
}

async function runPreFlightChecks() {
    // --- 1. Microphone Check ---
    // First, ensure we have microphone permissions as this is a prerequisite.
    const micPermissionCheck = document.getElementById('check-mic-permission');
    const micSelectionCheck = document.getElementById('check-mic-selection');

    providerManager.webSocketHandler.updateCheckStatus(micPermissionCheck, 'pending', 'Requesting Microphone...');
    const micPermission = await setupMicrophone();
    if (micPermission) {
        providerManager.webSocketHandler.updateCheckStatus(micPermissionCheck, 'success', 'Microphone Permission OK');
        providerManager.webSocketHandler.updateCheckStatus(micSelectionCheck, 'success', 'Microphone Selection Ready');
    } else {
        providerManager.webSocketHandler.updateCheckStatus(micPermissionCheck, 'error', 'Microphone Permission Denied');
        providerManager.webSocketHandler.updateCheckStatus(micSelectionCheck, 'error', 'Microphone Selection Failed');
        return;
    }

    // --- 2. Backend Connection and Session Establishment (NEW ASYNC FLOW) ---
    // We now `await` the connection. The `connect` method returns a promise that
    // only resolves after the WebSocket is open AND the server has confirmed
    // that a session (new or resumed) is established.
    try {
        providerManager.webSocketHandler.updateCheckStatus(providerManager.checks.backend, 'pending', 'Connecting to Backend...');
        await webSocketHandler.connect();
        providerManager.webSocketHandler.updateCheckStatus(providerManager.checks.backend, 'success', 'Backend Connected');
    } catch (error) {
        providerManager.webSocketHandler.updateCheckStatus(providerManager.checks.backend, 'error', 'Backend Connection Failed');
        console.error("Failed to establish WebSocket connection and session:", error);
        // The error status is already set within the WebSocketHandler's onError method.
        return; // Stop checks if backend connection fails.
    }

    // --- 3. AI Provider and Deepgram API Verification ---
    // These checks are now only run *after* the backend session is confirmed to be ready.
    // This ensures that the verification messages can be sent reliably.
    await providerManager.runPreFlightChecks();
}

// These functions are now handled by the modules

// This function is now handled by WebSocketHandler

// This function is now handled by WebSocketHandler

async function startInterview() {
    switchView('live');
    liveInterviewUI.init();
    liveInterviewUI.initialize();
    hotkeyManager.setEnabled(true);

    const onAudioData = (audioData, speakerHint) => {
        webSocketHandler.sendAudioChunk(audioData, muteManager.isMicrophoneMuted());
    };

    const processingStarted = await startAudioProcessing(micSelect.value, onAudioData);

    if (!processingStarted) {
        const errorDetail = lastAudioError ? `: ${lastAudioError}` : '';
        alert(`Could not start audio streams${errorDetail}. Please check permissions and try again.`);
        switchView('preflight');
        return;
    }

    webSocketHandler.startInterview();
}

async function endInterview() {
    console.log('🔚 Ending interview and clearing state...');

    // Stop all audio processing
    stopAudioProcessing();

    // Send end interview signal to backend
    webSocketHandler.endInterview();

    // Disable hotkeys
    hotkeyManager.setEnabled(false);

    // Clear conversation UI
    if (window.liveInterviewUI) {
        liveInterviewUI.clearConversation();
    }

    // Comprehensive state clearing
    stateManager.clearInterviewState();

    // Reset preset manager if available
    if (window.presetManager) {
        presetManager.clearNotifications?.();
    }

    // Switch back to onboarding
    switchView('onboarding');

    console.log('✅ Interview ended and state cleared successfully');
}

async function resetInterview() {
    console.log('🔄 Resetting interview...');

    // Send reset signal to backend
    webSocketHandler.sendMessage('reset_session', {});

    // Clear conversation UI
    if (window.liveInterviewUI) {
        liveInterviewUI.clearConversation();
        liveInterviewUI.showActivity('Listening...');
    }

    console.log('✅ Interview reset successfully');
}

// Provider management functions are now handled by ProviderManager


// --- Preset Switching Functions ---
function switchPreset(presetKey) {
    return webSocketHandler.switchPreset(presetKey);
}

// --- Transparency Functions ---
async function setTransparency(level) {
    return await liveInterviewUI.setTransparency(level);
}

function getSystemStatus() {
    return stateManager.getSystemStatus();
}

// --- Vision Mode Functions ---
function switchVisionModel() {
    return stateManager.switchVisionModel();
}

function toggleVisionMode() {
    return stateManager.toggleVisionMode();
}

// --- Screenshot Functions ---
async function captureScreenshot() {
    return await stateManager.captureScreenshot();
}

async function processScreenshots() {
    return await stateManager.processScreenshots();
}

async function resetScreenshotQueue() {
    return await stateManager.resetScreenshotQueue();
}

// --- Audio Toggle Functions ---
function toggleMicMute() {
    return stateManager.toggleMicMute();
}

function toggleUniversalMute() {
    return stateManager.toggleUniversalMute();
}

// --- Tool Screenshot and Capture Protection Functions ---
async function captureToolScreenshot() {
    try {
        if (typeof html2canvas === 'undefined') {
            console.error('html2canvas not loaded');
            screenshotService?.showNotification('❌ Error', 'Screenshot engine not available', 'error');
            return false;
        }

        screenshotService?.showNotification('📷 Capturing...', 'Taking tool screenshot', 'info');

        // Target either active live-view or the whole visible body
        const liveView = document.getElementById('live-view');
        const isLive = liveView && !liveView.classList.contains('hidden') && liveView.style.display !== 'none';
        const targetElement = isLive ? (liveView.querySelector('.live-interview-container') || liveView) : document.body;

        const canvas = await html2canvas(targetElement, {
            backgroundColor: '#0a0a0c',
            scale: window.devicePixelRatio || 1.5,
            useCORS: true,
            logging: false,
            ignoreElements: (element) => {
                return element.classList?.contains('capture-notification');
            }
        });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `aura-tool-${timestamp}.png`;
        const dataUrl = canvas.toDataURL('image/png');

        // Trigger file download
        const downloadLink = document.createElement('a');
        downloadLink.download = fileName;
        downloadLink.href = dataUrl;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        // Copy image to clipboard if supported
        try {
            canvas.toBlob(blob => {
                if (blob && navigator.clipboard && window.ClipboardItem) {
                    navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                    ]).catch(() => {});
                }
            });
        } catch (_) {}

        screenshotService?.showNotification('📸 Tool Screenshot Saved', `Saved as ${fileName}`, 'success');
        return true;
    } catch (err) {
        console.error('Failed to capture tool screenshot:', err);
        screenshotService?.showNotification('❌ Capture Failed', err.message || 'Error capturing tool', 'error');
        return false;
    }
}

async function toggleCaptureProtection(explicitState) {
    try {
        if (typeof explicitState === 'boolean') {
            updateCaptureProtectionUI(explicitState);
            return;
        }
        const resp = await fetch('/api/capture-protection/toggle', { method: 'POST' });
        if (resp.ok) {
            const data = await resp.json();
            updateCaptureProtectionUI(data.enabled);
        }
    } catch (e) {
        console.error('Failed to toggle capture protection:', e);
    }
}

function updateCaptureProtectionUI(enabled) {
    const btn = document.getElementById('toggle-stealth-btn');
    if (btn) {
        const textSpan = btn.querySelector('.btn-text');
        if (enabled) {
            btn.classList.add('active');
            btn.classList.remove('warning');
            if (textSpan) textSpan.textContent = 'Stealth: ON';
            btn.title = 'Screen Capture Protection Active (Tool is hidden from recordings/screenshots). Click or press Alt+K to allow capturing tool.';
        } else {
            btn.classList.remove('active');
            btn.classList.add('warning');
            if (textSpan) textSpan.textContent = 'Stealth: OFF';
            btn.title = 'Screen Capture Protection Inactive (Tool is VISIBLE in screenshots and recording). Click or press Alt+K to hide.';
        }
    }
    if (enabled) {
        screenshotService?.showNotification('🛡️ Stealth Protection ON', 'Tool is hidden from screen capture (WDA_EXCLUDEFROMCAPTURE)', 'info');
    } else {
        screenshotService?.showNotification('👁️ Tool Capture Allowed', 'Stealth OFF: Tool can now be captured with Windows Snipping Tool (Win+Shift+S) & recordings', 'warning');
    }
}

// --- Event Listeners ---
function setupEventListeners() {
    proceedButton?.addEventListener('click', handleOnboarding);
    startButton?.addEventListener('click', startInterview);
    backButton?.addEventListener('click', async () => {
        switchView('onboarding');
        await profileManager.loadProfile();
        profileManager.applySavedAiProviders();
    });

    // Tool screenshot & stealth buttons
    document.getElementById('tool-screenshot-btn')?.addEventListener('click', captureToolScreenshot);
    document.getElementById('toggle-stealth-btn')?.addEventListener('click', () => toggleCaptureProtection());

    // Provider change listeners
    const providerSelect = document.getElementById('ai-provider-select');
    const secondaryProviderSelect = document.getElementById('ai-secondary-provider-select');
    const visionProviderSelect = document.getElementById('vision-provider-select');
    const visionSecondaryProviderSelect = document.getElementById('vision-secondary-provider-select');

    providerSelect?.addEventListener('change', providerManager.updateModelDropdown.bind(providerManager));
    secondaryProviderSelect?.addEventListener('change', providerManager.updateSecondaryModelDropdown.bind(providerManager));
    visionProviderSelect?.addEventListener('change', providerManager.updateVisionModelDropdown.bind(providerManager));
    visionSecondaryProviderSelect?.addEventListener('change', providerManager.updateSecondaryVisionModelDropdown.bind(providerManager));
}

// Main initialization
window.addEventListener('DOMContentLoaded', async () => {
    // 1. Setup UI tabs and click handlers immediately so UI is always responsive
    setupTabs();
    setupEventListeners();
    setupDeveloperShortcuts();
    setupPresetHotkeys();
    hotkeyManager.setEnabled(false);
    switchView('onboarding');

    // 2. Load configurations and profile data safely
    try {
        await loadConfig();
        applyConsoleGate(); // Suppress console.log/debug/info when DEV_MODE is off
    } catch (e) {
        console.error("Error loading config:", e);
    }

    try {
        await profileManager.loadProfile();
    } catch (e) {
        console.error("Error loading profile:", e);
    }

    try {
        await providerManager.loadAiProviders();
        profileManager.applySavedAiProviders();
        profileManager.setupAutoSave();
    } catch (e) {
        console.error("Error initializing AI providers:", e);
    }

    try {
        liveInterviewUI.init();
    } catch (e) {
        console.error("Error initializing LiveInterviewUI:", e);
    }

    fetch('/api/capture-protection')
        .then(r => r.json())
        .then(d => { if (typeof d.enabled === 'boolean') updateCaptureProtectionUI(d.enabled); })
        .catch(() => {});
});

// --- Developer Shortcuts ---
function setupDeveloperShortcuts() {

    devLog('🛠️ Developer shortcuts enabled');

    // Console helper functions
    if (isDev) {
        console.log(`
🧪 === AURA DEVELOPER TOOLS ===
Available testing functions:
• testSampleMarkdown() - Test with sample markdown content  
• testStreamingMarkdown() - Test with comprehensive scenarios
• closeAllTestWindows() - Close all test windows manually
• closeTestWindow('id') - Close specific test window
• autofillForTesting() - Auto-fill onboarding form
• Ctrl+J - Auto-fill form shortcut

📝 Real-time Markdown Testing:
The new hybrid streaming markdown parser integrates with the existing 
MarkdownProcessor to provide real-time rendering that's compatible 
with code blocks, syntax highlighting, and all existing features.

🕒 Auto-Close Feature:
Test windows now auto-close after 10 seconds with countdown display.
Manual close (× button) cancels auto-close timer.

Try: testSampleMarkdown()

🔧 Code Block Fix Applied:
• Fixed missing code blocks in streaming responses
• Added proper syntax highlighting with Prism.js
• Integrated with existing MarkdownProcessor system
• Real-time code block rendering during streaming
        `);
    }

    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'j') {
            e.preventDefault();
            devLog('🛠️ Auto-filling form via Ctrl+J');
            autofillForTesting();
            profileManager.saveProfile(null, true);
        }
    });
}

function setupPresetHotkeys() {
    devLog('🎹 Setting up preset switching and vision hotkeys');
    document.addEventListener('keydown', (e) => {
        // Only work during live interview and if not focusing on input fields
        if (!e.target.matches('input, textarea, select') && stateManager.isLiveInterviewActive()) {
            if (e.altKey && !e.ctrlKey && !e.shiftKey) {
                switch (e.key.toLowerCase()) {
                    case 'q':
                        e.preventDefault();
                        switchPreset('primary');
                        devLog('🔄 Hotkey: Switching to primary preset');
                        break;
                    case 'w':
                        e.preventDefault();
                        switchPreset('secondary');
                        devLog('🔄 Hotkey: Switching to secondary preset');
                        break;
                    case 'e':
                        e.preventDefault();
                        switchPreset('auto');
                        devLog('🔄 Hotkey: Auto-selecting best preset');
                        break;
                    case 't':
                        e.preventDefault();
                        if (e.shiftKey) {
                            captureToolScreenshot();
                            devLog('📷 Hotkey: Capturing tool screenshot');
                        } else {
                            switchVisionModel();
                            devLog('🔄 Hotkey: Switching vision model');
                        }
                        break;
                    case 'k':
                        e.preventDefault();
                        toggleCaptureProtection();
                        devLog('🛡️ Hotkey: Toggling capture protection');
                        break;
                    case 'v':
                        e.preventDefault();
                        toggleVisionMode();
                        devLog('👁️ Hotkey: Toggling vision mode');
                        break;
                    case 's':
                        e.preventDefault();
                        captureScreenshot();
                        devLog('📸 Hotkey: Capturing screenshot');
                        break;
                    case 'p':
                        e.preventDefault();
                        processScreenshots();
                        devLog('🔄 Hotkey: Processing screenshots');
                        break;
                }
            }
        }
    });
}

// --- Global Exports ---
// Make functions globally accessible for hotkeys and external calls
window.switchPreset = switchPreset;
window.setTransparency = setTransparency;
window.getSystemStatus = getSystemStatus;
window.switchVisionModel = switchVisionModel;
window.toggleVisionMode = toggleVisionMode;
window.captureScreenshot = captureScreenshot;
window.processScreenshots = processScreenshots;
window.resetScreenshotQueue = resetScreenshotQueue;
window.captureToolScreenshot = captureToolScreenshot;
window.toggleCaptureProtection = toggleCaptureProtection;
window.toggleMicMute = toggleMicMute;
window.toggleUniversalMute = toggleUniversalMute;
window.endInterview = endInterview;
window.resetInterview = resetInterview;
window.getScreenVideoTrack = getScreenVideoTrack;
window.isScreenSharingAvailable = isScreenSharingAvailable;
window.testStreamingMarkdown = testStreamingMarkdown;
window.testSampleMarkdown = testSampleMarkdown;

// Export managers for other modules
window.appState = stateManager.getState();
window.sendSocketMessage = (type, payload) => webSocketHandler.sendMessage(type, payload);
window.webSocketHandler = webSocketHandler;
window.screenshotService = screenshotService;

// Export for external use
export { switchView, startInterview, endInterview, stateManager, webSocketHandler, providerManager, profileManager };