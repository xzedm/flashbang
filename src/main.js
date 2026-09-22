import { CameraManager } from './camera.js';
import { FlashbangAudio } from './audio.js';
import { GestureTracker } from './tracker.js';
import { FlashbangRenderer } from './renderer.js';

// DOM Elements
const videoEl = document.getElementById('webcam-video');
const canvasEl = document.getElementById('viewport-canvas');
const statusText = document.getElementById('status-text');

// Controls
const btnDetonate = document.getElementById('btn-detonate');
const gestureSelect = document.getElementById('gesture-select');
const btnMirror = document.getElementById('btn-mirror');
const btnSkeleton = document.getElementById('btn-skeleton');
const btnClean = document.getElementById('btn-clean');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnSettings = document.getElementById('btn-settings');
const btnModalClose = document.getElementById('btn-modal-close');
const settingsModal = document.getElementById('settings-modal');

const cameraSelect = document.getElementById('camera-select');
const durationSlider = document.getElementById('duration-slider');
const durationLabel = document.getElementById('duration-label');
const volumeSlider = document.getElementById('volume-slider');
const volumeLabel = document.getElementById('volume-label');
const voiceToggle = document.getElementById('voice-toggle');
const fuseSelect = document.getElementById('fuse-select');
const muteToggle = document.getElementById('mute-toggle');

// Instances
const camera = new CameraManager(videoEl);
const audio = new FlashbangAudio();
const tracker = new GestureTracker();
const renderer = new FlashbangRenderer(canvasEl);

let flashDurationSeconds = 4.5;
let useVoiceEnabled = true;
let fuseDelayMs = 1500;
let isThrowing = false;

/**
 * Trigger the flashbang explosion and tinnitus
 */
function triggerFlashbang(source = 'manual') {
  if (isThrowing) return; // Prevent double trigger during fuse countdown
  isThrowing = true;
  console.log(`[Flashbang] Triggered via ${source} (voice: ${useVoiceEnabled}, delay: ${fuseDelayMs}ms)`);

  audio.init();

  if (useVoiceEnabled && fuseDelayMs > 0) {
    statusText.textContent = '💣 "THROWING FLASHBANG!"';
    statusText.style.color = 'var(--accent-amber)';
  }

  audio.playSequence({
    durationSeconds: flashDurationSeconds,
    withVoice: useVoiceEnabled,
    delayMs: fuseDelayMs,
    onDetonate: () => {
      // Visuals: instant whiteout, camera shake, snapshot for retinal ghost
      renderer.detonate(videoEl, flashDurationSeconds * 1000);

      // Status HUD update
      statusText.textContent = 'BLINDED (FLASHED)';
      statusText.style.color = 'var(--accent-red)';

      setTimeout(() => {
        isThrowing = false;
        statusText.textContent = 'TRACKING READY';
        statusText.style.color = 'var(--accent-green)';
      }, flashDurationSeconds * 1000);
    }
  });

  // If there is no delay, isThrowing will be reset by the timeout above
}

// Hook up gesture trigger callback
tracker.onTrigger = (event) => {
  triggerFlashbang(`gesture: ${event.name} (${event.icon})`);
};

/**
 * Initialize Camera & MediaPipe Tracker
 */
async function initializeApp() {
  try {
    statusText.textContent = 'CONNECTING CAMERA...';
    await camera.start();

    // Populate camera selector
    const devices = await camera.getDevices();
    cameraSelect.innerHTML = '';
    devices.forEach((dev, idx) => {
      const opt = document.createElement('option');
      opt.value = dev.deviceId;
      opt.textContent = dev.label || `Camera ${idx + 1}`;
      cameraSelect.appendChild(opt);
    });

    statusText.textContent = 'LOADING GESTURE MODEL...';
    await tracker.init();

    statusText.textContent = 'TRACKING READY';

    // Start render loop
    requestAnimationFrame(renderLoop);
  } catch (err) {
    console.error('App init error:', err);
    statusText.textContent = 'CAMERA / MODEL ERROR';
    statusText.style.color = 'var(--accent-red)';
  }
}

/**
 * Continuous animation and tracking loop
 */
function renderLoop() {
  // Ensure canvas matches window dimensions
  if (canvasEl.width !== window.innerWidth || canvasEl.height !== window.innerHeight) {
    renderer.resize(window.innerWidth, window.innerHeight);
  }

  // Process tracking
  const timestamp = performance.now();
  const trackingData = tracker.processFrame(videoEl, timestamp);

  // Render composite to canvas
  renderer.render(videoEl, trackingData.landmarks, {
    activeGesture: trackingData.activeGesture,
    gestureName: trackingData.gestureName,
    gestureIcon: trackingData.gestureIcon
  });

  requestAnimationFrame(renderLoop);
}

/**
 * Event Bindings
 */

// Manual trigger button
btnDetonate.addEventListener('click', () => {
  audio.init();
  triggerFlashbang('button click');
});

// Gesture selector change
gestureSelect.addEventListener('change', (e) => {
  tracker.setTriggerMode(e.target.value);
});

// Mirror toggle
btnMirror.addEventListener('click', () => {
  const isMirrored = !renderer.isMirrored;
  renderer.isMirrored = isMirrored;
  camera.setMirrored(isMirrored);
  btnMirror.classList.toggle('active', isMirrored);
});

// Skeleton toggle
btnSkeleton.addEventListener('click', () => {
  renderer.showLandmarks = !renderer.showLandmarks;
  btnSkeleton.classList.toggle('active', renderer.showLandmarks);
});

// OBS Clean Mode toggle
function toggleCleanMode() {
  document.body.classList.toggle('clean-mode');
  const isClean = document.body.classList.contains('clean-mode');
  btnClean.classList.toggle('active', isClean);
}
btnClean.addEventListener('click', toggleCleanMode);

// Fullscreen toggle
btnFullscreen.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => console.warn(err));
  } else {
    document.exitFullscreen().catch(err => console.warn(err));
  }
});

// Settings Modal open/close
btnSettings.addEventListener('click', () => settingsModal.classList.add('open'));
btnModalClose.addEventListener('click', () => settingsModal.classList.remove('open'));
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) settingsModal.classList.remove('open');
});

// Camera selection
cameraSelect.addEventListener('change', async (e) => {
  try {
    await camera.start(e.target.value);
  } catch (err) {
    alert('Failed to switch camera: ' + err.message);
  }
});

// Flash duration slider
durationSlider.addEventListener('input', (e) => {
  flashDurationSeconds = parseFloat(e.target.value);
  durationLabel.textContent = `${flashDurationSeconds.toFixed(1)} seconds`;
  tracker.setCooldown(flashDurationSeconds * 1000 * 0.85); // adjust cooldown with duration
});

// Volume slider
volumeSlider.addEventListener('input', (e) => {
  const vol = parseFloat(e.target.value);
  audio.setVolume(vol);
  volumeLabel.textContent = `${Math.round(vol * 100)}%`;
});

// Mute toggle
muteToggle.addEventListener('change', (e) => {
  audio.setMuted(e.target.checked);
});

// CS:GO Voice Call toggle
voiceToggle.addEventListener('change', (e) => {
  useVoiceEnabled = e.target.checked;
});

// Fuse timing select
fuseSelect.addEventListener('change', (e) => {
  fuseDelayMs = parseInt(e.target.value, 10);
});

// Keyboard Shortcuts: Space or G = Detonate, C = Clean Mode, F = Fullscreen
window.addEventListener('keydown', (e) => {
  // Don't trigger if user is interacting with form controls
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

  if (e.code === 'Space' || e.key.toLowerCase() === 'g') {
    e.preventDefault();
    audio.init();
    triggerFlashbang('hotkey');
  } else if (e.key.toLowerCase() === 'c') {
    e.preventDefault();
    toggleCleanMode();
  } else if (e.key.toLowerCase() === 'f') {
    e.preventDefault();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  } else if (e.key === 'Escape') {
    settingsModal.classList.remove('open');
  }
});

// First user interaction audio unlock
window.addEventListener('click', () => audio.init(), { once: true });
window.addEventListener('keydown', () => audio.init(), { once: true });

// Start the app!
initializeApp();
