import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

/**
 * Hand tracking & gesture classification engine using MediaPipe
 */
export class GestureTracker {
  constructor() {
    this.handLandmarker = null;
    this.isReady = false;
    this.selectedGesture = 'peace'; // 'peace' | 'throw' | 'pinch' | 'palm' | 'any'
    
    // Cooldown management
    this.lastTriggerTime = 0;
    this.cooldownDuration = 3500; // ms

    // History buffer for velocity & dynamic throw detection
    this.history = [];
    this.historyMax = 12; // ~200-300ms at 30-60fps
    
    // Callbacks
    this.onTrigger = null;
  }

  async init() {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      // Prefer local offline model asset if present, else fallback to Google CDN
      const modelPath = '/models/hand_landmarker.task';

      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6
      });

      this.isReady = true;
      return true;
    } catch (err) {
      console.warn('Falling back to remote model asset:', err);
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.6
        });
        this.isReady = true;
        return true;
      } catch (fallbackErr) {
        console.error('Failed to initialize HandLandmarker:', fallbackErr);
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
   * Process a video frame
   */
  processFrame(videoElement, timestamp) {
    if (!this.isReady || !this.handLandmarker || videoElement.readyState < 2) {
      return { landmarks: [], activeGesture: null };
    }

    const results = this.handLandmarker.detectForVideo(videoElement, timestamp);
    const landmarks = results.landmarks || [];

    let detectedGesture = null;
    let gestureIcon = '';
    let gestureName = '';

    if (landmarks.length > 0) {
      // Analyze primary hand
      const hand = landmarks[0];
      const gestureData = this.analyzeHand(hand);

      detectedGesture = gestureData.gesture;
      gestureIcon = gestureData.icon;
      gestureName = gestureData.name;

      // Update history buffer for dynamic throw detection
      this.updateHistory(hand, gestureData);

      // Check if throw occurred
      if (this.detectThrowMotion()) {
        detectedGesture = 'throw';
        gestureIcon = '✊💨';
        gestureName = 'Throw';
      }

      // Check if current detected gesture should detonate
      const now = performance.now();
      const canTrigger = (now - this.lastTriggerTime) > this.cooldownDuration;

      const matchesSelection = 
        this.selectedGesture === 'any' ? (detectedGesture !== null) :
        (detectedGesture === this.selectedGesture);

      if (matchesSelection && canTrigger) {
        this.lastTriggerTime = now;
        if (this.onTrigger) {
          this.onTrigger({
            gesture: detectedGesture,
            name: gestureName,
            icon: gestureIcon
          });
        }
      }
    } else {
      this.history = [];
    }

    return {
      landmarks,
      activeGesture: detectedGesture,
      gestureName,
      gestureIcon,
      inCooldown: (performance.now() - this.lastTriggerTime) <= this.cooldownDuration
    };
  }

  /**
   * Classify hand gesture from 21 landmarks
   */
  analyzeHand(lm) {
    // Helper: calculate 2D distance
    const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

    // Palm scale reference (distance from wrist to middle MCP)
    const palmScale = dist(lm[0], lm[9]) || 0.1;

    // Joint checks: is finger extended?
    // Finger is extended if tip is further from wrist than PIP joint
    const wrist = lm[0];
    const isExtended = (tipIdx, pipIdx) => {
      return dist(lm[tipIdx], wrist) > dist(lm[pipIdx], wrist) * 1.15;
    };

    const thumbExtended = dist(lm[4], lm[9]) > palmScale * 0.75;
    const indexExtended = isExtended(8, 6);
    const middleExtended = isExtended(12, 10);
    const ringExtended = isExtended(16, 14);
    const pinkyExtended = isExtended(20, 18);

    // Finger curl check: tip close to MCP/wrist
    const indexCurled = !indexExtended;
    const middleCurled = !middleExtended;
    const ringCurled = !ringExtended;
    const pinkyCurled = !pinkyExtended;

    // 1. Check PEACE SIGN (✌️ Victory)
    // Index & Middle clearly extended, Ring & Pinky curled
    if (indexExtended && middleExtended && ringCurled && pinkyCurled) {
      const tipSep = dist(lm[8], lm[12]);
      if (tipSep > palmScale * 0.2) {
        return { gesture: 'peace', name: 'Peace Sign', icon: '✌️', isFist: false, isOpen: false };
      }
    }

    // 2. Check FIST (✊)
    // All 4 fingers curled
    const isFist = indexCurled && middleCurled && ringCurled && pinkyCurled;
    if (isFist) {
      return { gesture: 'fist', name: 'Grip / Fist', icon: '✊', isFist: true, isOpen: false };
    }

    // 3. Check PINCH (👌 Pin Pull)
    const pinchDist = dist(lm[4], lm[8]);
    if (pinchDist < palmScale * 0.35 && middleExtended && ringExtended) {
      return { gesture: 'pinch', name: 'Pin Pull', icon: '👌', isFist: false, isOpen: false };
    }

    // 4. Check OPEN PALM (🖐️)
    const isOpen = indexExtended && middleExtended && ringExtended && pinkyExtended;
    if (isOpen) {
      return { gesture: 'palm', name: 'Open Palm', icon: '🖐️', isFist: false, isOpen: true };
    }

    return { gesture: null, name: '', icon: '', isFist: false, isOpen: false };
  }

  updateHistory(lm, gestureData) {
    const centroid = {
      x: lm[9].x, // middle MCP is stable center of palm
      y: lm[9].y,
      time: performance.now(),
      isFist: gestureData.isFist,
      isOpen: gestureData.isOpen
    };

    this.history.push(centroid);
    if (this.history.length > this.historyMax) {
      this.history.shift();
    }
  }

  /**
   * Detect dynamic throw: recent transition from Fist (✊) to Open Hand (🖐️) with rapid velocity
   */
  detectThrowMotion() {
    if (this.history.length < 5) return false;

    const current = this.history[this.history.length - 1];
    if (!current.isOpen) return false;

    // Check if within the last 400ms there was a closed fist
    const hadFistRecently = this.history.slice(0, -2).some(h => h.isFist);
    if (!hadFistRecently) return false;

    // Check hand motion displacement
    const oldest = this.history[0];
    const dx = current.x - oldest.x;
    const dy = current.y - oldest.y;
    const speed = Math.hypot(dx, dy);

    // If moving fast enough and opened up -> THROW!
    return speed > 0.08;
  }
}
