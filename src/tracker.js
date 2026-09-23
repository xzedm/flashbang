import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';
import { HandLandmarkFilterBank } from './landmark-filter.js';

/**
 * Advanced Multi-Hand Tracking & Gesture Classification Engine.
 * Combines MediaPipe GestureRecognizer neural network, 3D metric world landmarks,
 * 1€ filter jitter suppression, and kinematic trajectory analysis.
 */
export class GestureTracker {
  constructor() {
    this.gestureRecognizer = null;
    this.isReady = false;
    this.selectedGesture = 'peace'; // 'peace' | 'throw' | 'pinch' | 'palm' | 'any'
    
    // Cooldown management
    this.lastTriggerTime = 0;
    this.cooldownDuration = 3500; // ms

    // Confidence threshold for neural classifier
    this.confidenceThreshold = 0.65;

    // 1€ Filter bank for 3D landmark smoothing
    this.filterBank = new HandLandmarkFilterBank(1.2, 0.005, 1.0);

    // Independent history buffers per hand key ('Left', 'Right', or 'hand_0', 'hand_1')
    this.handHistories = new Map();
    this.historyMax = 25; // ~400-500ms at 30-60fps

    // Frame persistence / debounce map for static gestures
    this.gestureFrameCounts = new Map();

    // Callbacks
    this.onTrigger = null;
  }

  async init() {
    const wasmUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
    const localModel = '/models/gesture_recognizer.task';
    const remoteModel = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

    try {
      const vision = await FilesetResolver.forVisionTasks(wasmUrl);
      this.gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: localModel,
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      this.isReady = true;
      return true;
    } catch (err) {
      console.warn('Falling back to remote GestureRecognizer asset:', err);
      try {
        const vision = await FilesetResolver.forVisionTasks(wasmUrl);
        this.gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: remoteModel,
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        this.isReady = true;
        return true;
      } catch (fallbackErr) {
        console.error('Failed to initialize GestureRecognizer:', fallbackErr);
        throw fallbackErr;
      }
    }
  }

  setTriggerMode(mode) {
    this.selectedGesture = mode;
  }

  setCooldown(ms) {
    this.cooldownDuration = ms;
  }

  /**
   * Process a video frame with neural recognition, 3D metric analysis & multi-hand support
   */
  processFrame(videoElement, timestamp) {
    if (!this.isReady || !this.gestureRecognizer || videoElement.readyState < 2) {
      return {
        landmarks: [],
        hands: [],
        activeGesture: null,
        gestureName: '',
        gestureIcon: '',
        inCooldown: false
      };
    }

    const results = this.gestureRecognizer.recognizeForVideo(videoElement, timestamp);
    const rawLandmarks = results.landmarks || [];
    const worldLandmarks = results.worldLandmarks || [];
    const mlGestures = results.gestures || [];
    const handednessArray = results.handednesses || results.handedness || [];

    const now = performance.now();
    const canTrigger = (now - this.lastTriggerTime) > this.cooldownDuration;
    const activeHandKeys = new Set();

    const smoothedLandmarksList = [];
    const analyzedHands = [];
    let winningTriggerHand = null;

    for (let i = 0; i < rawLandmarks.length; i++) {
      const rawLm = rawLandmarks[i];
      const worldLm = worldLandmarks[i] || null;

      // Determine handedness label (Left / Right)
      let handLabel = 'Hand ' + (i + 1);
      let handednessKey = 'hand_' + i;
      if (handednessArray[i] && handednessArray[i][0]) {
        const cat = handednessArray[i][0].categoryName || handednessArray[i][0].displayName;
        if (cat) {
          handLabel = cat + ' Hand';
          handednessKey = cat;
        }
      }
      activeHandKeys.add(handednessKey);

      // 1. One Euro Filter landmark smoothing to eliminate jitter
      const smoothedLm = this.filterBank.filter(handednessKey, rawLm, timestamp);
      smoothedLandmarksList.push(smoothedLm);

      // 2. Primary Classification: MediaPipe Neural Gesture Recognizer
      let mlCategory = 'None';
      let mlScore = 0;
      if (mlGestures[i] && mlGestures[i].length > 0) {
        const topGesture = mlGestures[i][0];
        mlCategory = topGesture.categoryName;
        mlScore = topGesture.score;
      }

      // 3. Posture Evaluation: Hybrid Neural + 3D Metric + Anatomical Invariants
      const posture = this.classifyPosture(smoothedLm, worldLm, mlCategory, mlScore);
      let gesture = posture.gesture;
      let name = posture.name;
      let icon = posture.icon;
      let score = posture.score;

      // 4. Update per-hand motion history for dynamic gesture tracking
      this.updateHandHistory(handednessKey, smoothedLm, posture);

      // 5. Dynamic Tactical Throw detection
      if (this.detectThrowOnHand(handednessKey)) {
        gesture = 'throw';
        name = 'Tactical Throw';
        icon = '✊💨';
        score = 0.95;
      }

      // 6. Temporal smoothing: debounces false 1-frame flickers
      const stableGesture = this.smoothGesture(handednessKey, gesture);

      analyzedHands.push({
        index: i,
        key: handednessKey,
        label: handLabel,
        landmarks: smoothedLm,
        worldLandmarks: worldLm,
        gesture: stableGesture || gesture,
        name: name,
        icon: icon,
        score: score,
        isTriggerCandidate: false
      });
    }

    // Prune filters & histories for hands that disappeared
    this.filterBank.prune(activeHandKeys);
    for (const [key, history] of this.handHistories.entries()) {
      if (!activeHandKeys.has(key)) {
        if (history.length > 0 && (now - history[history.length - 1].time > 600)) {
          this.handHistories.delete(key);
          this.gestureFrameCounts.delete(key);
        }
      }
    }

    // Evaluate trigger condition across ALL detected hands
    for (const hand of analyzedHands) {
      if (!hand.gesture) continue;

      const matchesSelection = 
        this.selectedGesture === 'any' 
          ? (hand.gesture !== 'fist' && hand.gesture !== null) 
          : (hand.gesture === this.selectedGesture);

      if (matchesSelection) {
        hand.isTriggerCandidate = true;
        if (!winningTriggerHand) {
          winningTriggerHand = hand;
        }
      }
    }

    // Detonate flashbang if a candidate matches and cooldown has elapsed
    if (winningTriggerHand && canTrigger) {
      this.lastTriggerTime = now;
      if (this.onTrigger) {
        this.onTrigger({
          gesture: winningTriggerHand.gesture,
          name: winningTriggerHand.name,
          icon: winningTriggerHand.icon,
          handLabel: winningTriggerHand.label,
          score: winningTriggerHand.score
        });
      }
    }

    // Representative hand for global HUD fallback
    const primaryHand = winningTriggerHand || analyzedHands.find(h => h.gesture) || analyzedHands[0];
    const activeGesture = primaryHand ? primaryHand.gesture : null;
    const gestureName = primaryHand ? primaryHand.name : '';
    const gestureIcon = primaryHand ? primaryHand.icon : '';

    return {
      landmarks: smoothedLandmarksList,
      hands: analyzedHands,
      activeGesture,
      gestureName,
      gestureIcon,
      inCooldown: (now - this.lastTriggerTime) <= this.cooldownDuration
    };
  }

  /**
   * Hybrid Classifier combining ML Model, 3D World Landmarks, and Invariant Geometrics
   */
  classifyPosture(lm, worldLm, mlCategory, mlScore) {
    const dist2D = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const dist3D = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y, (p1.z || 0) - (p2.z || 0));

    // Reference palm scale
    const wrist = lm[0];
    const palmLength = dist2D(wrist, lm[9]);
    const palmWidth = dist2D(lm[5], lm[17]);
    const palmScale = Math.max(0.01, (palmLength * 0.7 + palmWidth * 0.3));

    // --- CHECK PINCH (Pin Pull 👌) FIRST ---
    // The ML model does not natively have Pinch, so we check metric 3D / 2D closeness
    const thumbTip = lm[4];
    const indexTip = lm[8];
    let isPinch = false;
    let pinchConfidence = 0;

    if (worldLm && worldLm[4] && worldLm[8]) {
      // 3D Euclidean distance in real-world metric space (meters)
      const metricDist = dist3D(worldLm[4], worldLm[8]);
      if (metricDist < 0.038) { // < 3.8 cm
        isPinch = true;
        pinchConfidence = Math.max(0.7, 1.0 - (metricDist / 0.038) * 0.3);
      }
    } else {
      const normDist = dist2D(thumbTip, indexTip);
      if (normDist < palmScale * 0.36) {
        isPinch = true;
        pinchConfidence = 0.85;
      }
    }

    if (isPinch) {
      // Confirm middle finger is not tightly curled into a closed fist
      const middleExtended = dist2D(lm[12], lm[9]) > palmScale * 0.6;
      if (middleExtended || mlCategory !== 'Closed_Fist') {
        return {
          gesture: 'pinch',
          name: 'Pin Pull',
          icon: '👌',
          score: pinchConfidence,
          isFist: false,
          isOpen: false
        };
      }
    }

    // --- ML MODEL DIRECT RECOGNITION ---
    if (mlScore >= this.confidenceThreshold) {
      if (mlCategory === 'Victory') {
        return {
          gesture: 'peace',
          name: 'Peace Sign',
          icon: '✌️',
          score: mlScore,
          isFist: false,
          isOpen: false
        };
      }
      if (mlCategory === 'Open_Palm') {
        return {
          gesture: 'palm',
          name: 'Open Palm',
          icon: '🖐️',
          score: mlScore,
          isFist: false,
          isOpen: true
        };
      }
      if (mlCategory === 'Closed_Fist') {
        return {
          gesture: 'fist',
          name: 'Fist Grip',
          icon: '✊',
          score: mlScore,
          isFist: true,
          isOpen: false
        };
      }
    }

    // --- GEOMETRIC INVARIANT FALLBACK ---
    // Activated if ML model returns 'None', low confidence, or unusual perspective angle
    const evalFinger = (tipIdx, dipIdx, pipIdx, mcpIdx) => {
      const tip = lm[tipIdx];
      const pip = lm[pipIdx];
      const mcp = lm[mcpIdx];

      const tipToMcp = dist2D(tip, mcp);
      const pipToMcp = dist2D(pip, mcp);
      const tipToWrist = dist2D(tip, wrist);
      const pipToWrist = dist2D(pip, wrist);

      const isExtended = (tipToMcp > palmScale * 0.62) && (tipToWrist > pipToWrist * 0.95 || tipToMcp > pipToMcp * 1.35);
      const isCurled = (tipToMcp < palmScale * 0.58) || (tipToWrist < pipToWrist && tipToMcp < palmScale * 0.85);

      return { isExtended, isCurled };
    };

    const index = evalFinger(8, 7, 6, 5);
    const middle = evalFinger(12, 11, 10, 9);
    const ring = evalFinger(16, 15, 14, 13);
    const pinky = evalFinger(20, 19, 18, 17);

    // Peace Sign fallback
    if (index.isExtended && middle.isExtended && ring.isCurled && pinky.isCurled) {
      return { gesture: 'peace', name: 'Peace Sign', icon: '✌️', score: 0.82, isFist: false, isOpen: false };
    }

    // Open Palm fallback
    if (index.isExtended && middle.isExtended && ring.isExtended && pinky.isExtended) {
      return { gesture: 'palm', name: 'Open Palm', icon: '🖐️', score: 0.85, isFist: false, isOpen: true };
    }

    // Closed Fist fallback
    if (index.isCurled && middle.isCurled && ring.isCurled && pinky.isCurled) {
      return { gesture: 'fist', name: 'Fist Grip', icon: '✊', score: 0.88, isFist: true, isOpen: false };
    }

    return {
      gesture: null,
      name: '',
      icon: '',
      score: 0,
      isFist: index.isCurled && middle.isCurled,
      isOpen: index.isExtended && middle.isExtended
    };
  }

  /**
   * Update motion history buffer for a specific hand
   */
  updateHandHistory(handKey, lm, posture) {
    if (!this.handHistories.has(handKey)) {
      this.handHistories.set(handKey, []);
    }
    const history = this.handHistories.get(handKey);
    const now = performance.now();

    history.push({
      x: lm[9].x, // Middle MCP is stable center of palm
      y: lm[9].y,
      time: now,
      isFist: posture.isFist,
      isOpen: posture.isOpen
    });

    // Prune entries older than 500ms or exceeding historyMax
    while (history.length > this.historyMax || (history.length > 0 && now - history[0].time > 500)) {
      history.shift();
    }
  }

  /**
   * Detect dynamic throw motion on a specific hand:
   * Transition from Fist (✊) within 120-450ms into Open Hand (🖐️) accompanied by rapid velocity
   */
  detectThrowOnHand(handKey) {
    const history = this.handHistories.get(handKey);
    if (!history || history.length < 5) return false;

    const current = history[history.length - 1];
    if (!current.isOpen) return false;

    // Check if within the past 120ms - 450ms there was a closed fist on this hand
    const now = current.time;
    const hadFistRecently = history.some(h => h.isFist && (now - h.time) >= 120 && (now - h.time) <= 450);
    if (!hadFistRecently) return false;

    // Measure displacement over the last ~250ms
    const recentSample = history.find(h => (now - h.time) >= 180) || history[0];
    const dx = current.x - recentSample.x;
    const dy = current.y - recentSample.y;
    const displacement = Math.hypot(dx, dy);

    // Rapid throwing acceleration
    return displacement > 0.075;
  }

  /**
   * Temporal smoothing for static gestures to prevent 1-frame jitter
   */
  smoothGesture(handKey, currentGesture) {
    if (!this.gestureFrameCounts.has(handKey)) {
      this.gestureFrameCounts.set(handKey, { gesture: null, count: 0 });
    }

    const state = this.gestureFrameCounts.get(handKey);
    if (currentGesture === state.gesture && currentGesture !== null) {
      state.count++;
    } else {
      state.gesture = currentGesture;
      state.count = 1;
    }

    // Validated if held for at least 2 frames (~33-66ms) or if dynamic
    if (currentGesture === 'throw' || state.count >= 2) {
      return currentGesture;
    }

    return null;
  }
}
