// --- audio_handler.js ---
// This module handles all interactions with the Web Media APIs
// for capturing and processing audio via an AudioWorklet.

import { devLog, devError } from './config.js';
import muteManager from './mute-manager.js';

// Must match sample_rate in the Deepgram LiveOptions in services/stt_service.py.
const TARGET_SAMPLE_RATE = 48000;

let audioContext = null;
let micStream = null;
let systemStream = null;
let micGainNode = null;
let screenVideoTrack = null; // Store video track for screenshot reuse
export let lastAudioError = '';

/**
 * Requests permission to use the microphone and populates the dropdown.
 * @returns {Promise<boolean>} True if permission was granted, false otherwise.
 */
export async function setupMicrophone() {
    const micSelect = document.getElementById('mic-select');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        stream.getTracks().forEach(track => track.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioDevices = devices.filter(device => device.kind === 'audioinput');

        if (audioDevices.length === 0) return false;

        micSelect.innerHTML = '';
        audioDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Microphone ${micSelect.options.length + 1}`;
            micSelect.appendChild(option);
        });

        // Restore saved microphone preference if available
        const preferredMic = window.profileManager?.savedProfile?.preferredMic;
        if (preferredMic && audioDevices.some(d => d.deviceId === preferredMic)) {
            micSelect.value = preferredMic;
        }

        // Save microphone choice when user changes it
        if (!micSelect._hasProfileSaveListener) {
            micSelect.addEventListener('change', () => {
                window.profileManager?.saveProfile({ preferredMic: micSelect.value }, false);
            });
            micSelect._hasProfileSaveListener = true;
        }
        
        micSelect.disabled = false;
        return true;
    } catch (err) {
        devError("Error setting up microphone:", err);
        return false;
    }
}

/**
 * Starts audio processing by setting up the AudioContext, loading the worklet,
 * and connecting the audio streams.
 * @param {string} micId - The deviceId of the selected microphone.
 * @param {function} onAudioData - Callback function to handle the processed PCM audio data.
 * @returns {Promise<boolean>} True if processing started successfully.
 */
export async function startAudioProcessing(micId, onAudioData) {
    try {
        // 1. Get Microphone Stream (with fallback to default microphone)
        try {
            if (micId) {
                micStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: micId } } });
            } else {
                micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
        } catch (micExactErr) {
            console.warn("⚠️ Could not open specific micId, falling back to default mic:", micExactErr);
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }

        if (!micStream) {
            console.error("❌ Could not get microphone audio stream.");
            stopAudioProcessing();
            return false;
        }

        // 2. Get Display Media Stream (Screen / Window share)
        // First try requesting screen with system audio; if refused or unsupported, fallback to video-only
        try {
            systemStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });
        } catch (displayAudioErr) {
            console.warn("⚠️ getDisplayMedia with audio failed, retrying video-only:", displayAudioErr);
            try {
                systemStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: false
                });
            } catch (displayErr) {
                console.error("❌ Screen sharing was canceled or failed:", displayErr);
                stopAudioProcessing();
                return false;
            }
        }

        if (!systemStream) {
            console.error("❌ No display stream obtained.");
            stopAudioProcessing();
            return false;
        }

        // Store the video track for screenshot reuse
        const videoTracks = systemStream.getVideoTracks();
        if (videoTracks.length > 0) {
            screenVideoTrack = videoTracks[0];
            console.log("📹 Screen video track stored for screenshot reuse");
        } else {
            console.warn("⚠️ No video track found in display media stream");
        }

        // 3. Setup AudioContext and Worklet
        // Pin the rate so it matches what Deepgram is told to expect. Left to
        // itself the context adopts the hardware rate, and a 44.1kHz device
        // then streams audio that Deepgram decodes as 48kHz (~9% fast).
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        try {
            audioContext = new AudioCtx({ sampleRate: TARGET_SAMPLE_RATE });
        } catch (rateErr) {
            console.warn('⚠️ Could not pin AudioContext sample rate:', rateErr);
            audioContext = new AudioCtx();
        }
        console.log(`🎵 AudioContext: ${audioContext.sampleRate}Hz`);
        if (audioContext.sampleRate !== TARGET_SAMPLE_RATE) {
            console.warn(`⚠️ AudioContext is ${audioContext.sampleRate}Hz but Deepgram expects ${TARGET_SAMPLE_RATE}Hz`);
        }
        await audioContext.audioWorklet.addModule('/static/js/audio_processor.js');

        // 4. Create mixed audio processor
        const mixedProcessor = new AudioWorkletNode(audioContext, 'mixed-processor');

        let audioProcessingCounter = 0;
        mixedProcessor.port.onmessage = (event) => {
            if (muteManager.isAudioPaused()) {
                if (audioProcessingCounter % 200 === 0) {
                    devLog(`⏸️ Audio processing paused due to universal mute.`);
                }
                audioProcessingCounter++;
                return;
            }

            const { audioData, micLevel, systemLevel } = event.data;
            let speakerHint;

            if (muteManager.isMicrophoneMuted()) {
                speakerHint = 'system';
            } else {
                speakerHint = systemLevel > micLevel * 2 ? 'system' : 'microphone';
            }

            audioProcessingCounter++;
            onAudioData(audioData, speakerHint);
        };

        // 5. Connect microphone source through gain node for mute control
        const micSource = audioContext.createMediaStreamSource(micStream);
        micGainNode = audioContext.createGain();
        updateMicGainNode();
        muteManager.on('microphoneMuteChange', updateMicGainNode);

        micSource.connect(micGainNode);
        micGainNode.connect(mixedProcessor);

        // 6. Connect system audio source ONLY IF audio tracks exist
        const systemAudioTracks = systemStream.getAudioTracks();
        if (systemAudioTracks.length > 0) {
            try {
                const systemSource = audioContext.createMediaStreamSource(systemStream);
                systemSource.connect(mixedProcessor);
                console.log("🔊 System audio connected successfully to mixed processor");
            } catch (sysErr) {
                console.warn("⚠️ Could not connect system audio stream, continuing with mic only:", sysErr);
            }
        } else {
            console.log("ℹ️ No system audio track in screen stream (window sharing or audio checkbox unchecked). Capturing audio via microphone.");
        }

        devLog("✅ Audio processing started successfully");
        return true;

    } catch (err) {
        console.error("❌ Error starting audio processing:", err);
        lastAudioError = err?.message || String(err);
        stopAudioProcessing();
        return false;
    }
}

/**
 * Updates the microphone gain node based on the central mute manager state.
 */
function updateMicGainNode() {
    if (!micGainNode || !audioContext) return;
    
    const isMuted = muteManager.isMicrophoneMuted();
    const targetGain = isMuted ? 0 : 1;
    
    // Smooth transition to avoid audio pops
    micGainNode.gain.setTargetAtTime(targetGain, audioContext.currentTime, 0.05);
    devLog(`🎤 Microphone gain set to ${targetGain} based on mute manager.`);
}

// --- Legacy Functions (now wrappers for MuteManager) ---
// These are kept for backward compatibility with other modules that might call them.

/**
 * @deprecated Use muteManager.setMicrophoneMute(mute) instead.
 */
export function setMicrophoneMute(mute) {
    muteManager.setMicrophoneMute(mute);
    return muteManager.isMicrophoneMuted();
}

/**
 * @deprecated Use muteManager.isMicrophoneMuted() instead.
 */
export function isMicrophoneMuted() {
    return muteManager.isMicrophoneMuted();
}

/**
 * @deprecated Use muteManager.toggleMicrophoneMute() instead.
 */
export function toggleMicrophoneMute() {
    return muteManager.toggleMicrophoneMute();
}

/**
 * @deprecated Use muteManager.getMuteStatus() instead.
 */
export function getAudioProcessingMode() {
    return muteManager.getMuteStatus();
}

/**
 * Gets the screen video track for screenshot capture.
 * @returns {MediaStreamTrack|null} The screen video track if available.
 */
export function getScreenVideoTrack() {
    return screenVideoTrack;
}

/**
 * Checks if screen sharing is available for screenshots.
 * @returns {boolean} True if screen video track is available and active.
 */
export function isScreenSharingAvailable() {
    return screenVideoTrack && screenVideoTrack.readyState === 'live';
}

/**
 * Stops all audio streams and closes the AudioContext.
 */
export function stopAudioProcessing() {
    console.log("Stopping audio processing.");
    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
    }
    if (systemStream) {
        systemStream.getTracks().forEach(track => track.stop());
        systemStream = null;
    }
    if (screenVideoTrack) {
        screenVideoTrack.stop();
        screenVideoTrack = null;
        console.log("📹 Screen video track stopped");
    }
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
        audioContext = null;
    }
    
    // Reset mute state in the central manager
    muteManager.setMicrophoneMute(true);
    muteManager.setUniversalMute(false);
    micGainNode = null;
}