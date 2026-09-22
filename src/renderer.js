/**
 * Flashbang Canvas Renderer with Retinal Burn After-Image, Screen Shake, and Radial Vision Recovery.
 */
export class FlashbangRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    // Offscreen canvas for capturing retinal burn after-image
    this.freezeCanvas = document.createElement('canvas');
    this.freezeCtx = this.freezeCanvas.getContext('2d');

    // FX State
    this.isFlashing = false;
    this.flashStartTime = 0;
    this.flashDuration = 4500; // ms
    this.shakeAmount = 0;
    this.shakeDecay = 0.92;
    this.lastFrameTime = performance.now();

    // Debug overlays
    this.showLandmarks = true;
    this.isMirrored = true;
  }

  resize(width, height) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.freezeCanvas.width = width;
      this.freezeCanvas.height = height;
    }
  }

  /**
   * Detonate the flashbang!
   * @param {HTMLVideoElement} videoElement - snapshot webcam frame for retinal burn
   * @param {number} durationMs - total effect duration
   */
  detonate(videoElement, durationMs = 4500) {
    this.isFlashing = true;
    this.flashStartTime = performance.now();
    this.flashDuration = durationMs;
    this.shakeAmount = 28; // initial trauma shake in pixels

    // Snapshot the current frame for retinal after-image
    if (videoElement && videoElement.videoWidth > 0) {
      this.freezeCanvas.width = this.canvas.width;
      this.freezeCanvas.height = this.canvas.height;
      this.freezeCtx.save();
      if (this.isMirrored) {
        this.freezeCtx.translate(this.canvas.width, 0);
        this.freezeCtx.scale(-1, 1);
      }
      this.freezeCtx.drawImage(videoElement, 0, 0, this.canvas.width, this.canvas.height);
      this.freezeCtx.restore();
    }
  }

  /**
   * Main render loop
   */
  render(videoElement, landmarks = null, gestureInfo = null) {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const now = performance.now();

    this.ctx.save();

    // 1. Calculate trauma shake
    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeAmount > 0.5) {
      shakeX = (Math.random() - 0.5) * this.shakeAmount * 2;
      shakeY = (Math.random() - 0.5) * this.shakeAmount * 2;
      this.shakeAmount *= this.shakeDecay;
    } else {
      this.shakeAmount = 0;
    }
    this.ctx.translate(shakeX, shakeY);

    // 2. Draw live camera feed
    if (videoElement && videoElement.readyState >= 2) {
      this.ctx.save();
      if (this.isMirrored) {
        this.ctx.translate(width, 0);
        this.ctx.scale(-1, 1);
      }
      this.ctx.drawImage(videoElement, 0, 0, width, height);
      this.ctx.restore();
    } else {
      this.ctx.fillStyle = '#101216';
      this.ctx.fillRect(0, 0, width, height);
    }

    // 3. Draw hand skeleton / debug indicators (if enabled and not fully blinded)
    const elapsed = now - this.flashStartTime;
    const isBlind = this.isFlashing && elapsed < this.flashDuration;

    if (this.showLandmarks && landmarks && landmarks.length > 0 && (!isBlind || elapsed > 2500)) {
      this.drawHandLandmarks(landmarks, width, height);
    }

    // 4. Render Flashbang Effects (Pure Whiteout + Retinal Burn + Recovery Vignette)
    if (isBlind) {
      this.renderFlashbangOverlay(elapsed, width, height);
    } else if (this.isFlashing && elapsed >= this.flashDuration) {
      this.isFlashing = false;
    }

    // 5. Draw Gesture Status Badge (when not blinded)
    if (!isBlind && gestureInfo) {
      this.drawGestureHUD(gestureInfo, width, height);
    }

    this.ctx.restore();
  }

  /**
   * Render the authentic blinding whiteout & retinal burn
   */
  renderFlashbangOverlay(elapsed, width, height) {
    const progress = elapsed / this.flashDuration; // 0 to 1

    // Phase 1: Pure blinding whiteout (Hold 100% for first 700ms, then exponential drop)
    let whiteAlpha = 1.0;
    if (elapsed < 700) {
      whiteAlpha = 1.0;
    } else {
      const fadeProgress = (elapsed - 700) / (this.flashDuration - 700);
      whiteAlpha = Math.max(0, Math.pow(1 - fadeProgress, 1.8));
    }

    // Phase 2: Retinal Burn Ghost (Starts emerging at ~400ms, fades by ~3000ms)
    if (elapsed > 350 && elapsed < 3200) {
      const burnProgress = (elapsed - 350) / (3200 - 350);
      const burnAlpha = Math.sin(burnProgress * Math.PI) * 0.75;

      this.ctx.save();
      this.ctx.globalAlpha = burnAlpha;
      this.ctx.filter = 'contrast(250%) brightness(180%) blur(1px)';
      this.ctx.drawImage(this.freezeCanvas, 0, 0, width, height);
      this.ctx.restore();
    }

    // Draw blinding white fill
    this.ctx.save();
    this.ctx.fillStyle = `rgba(255, 255, 255, ${whiteAlpha})`;
    this.ctx.fillRect(0, 0, width, height);

    // Peripheral disorientation (vignette recovery)
    if (elapsed > 1000 && elapsed < this.flashDuration) {
      const vignetteAlpha = (1 - progress) * 0.45;
      const grad = this.ctx.createRadialGradient(
        width / 2, height / 2, Math.min(width, height) * 0.25,
        width / 2, height / 2, Math.max(width, height) * 0.7
      );
      grad.addColorStop(0, `rgba(255, 255, 255, 0)`);
      grad.addColorStop(1, `rgba(240, 245, 255, ${vignetteAlpha})`);
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(0, 0, width, height);
    }

    this.ctx.restore();
  }

  /**
   * Draw tactical hand skeleton on canvas
   */
  drawHandLandmarks(landmarksArray, width, height) {
    this.ctx.save();
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8],       // Index
      [5, 9], [9, 10], [10, 11], [11, 12],  // Middle
      [9, 13], [13, 14], [14, 15], [15, 16], // Ring
      [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
      [0, 17]                               // Palm base
    ];

    for (const hand of landmarksArray) {
      // Draw bones
      this.ctx.lineWidth = 2.5;
      this.ctx.strokeStyle = 'rgba(0, 240, 255, 0.65)';
      this.ctx.beginPath();
      for (const [startIdx, endIdx] of connections) {
        const start = hand[startIdx];
        const end = hand[endIdx];
        const sx = (this.isMirrored ? (1 - start.x) : start.x) * width;
        const sy = start.y * height;
        const ex = (this.isMirrored ? (1 - end.x) : end.x) * width;
        const ey = end.y * height;
        this.ctx.moveTo(sx, sy);
        this.ctx.lineTo(ex, ey);
      }
      this.ctx.stroke();

      // Draw joints
      for (let i = 0; i < hand.length; i++) {
        const pt = hand[i];
        const px = (this.isMirrored ? (1 - pt.x) : pt.x) * width;
        const py = pt.y * height;

        const isTip = [4, 8, 12, 16, 20].includes(i);
        this.ctx.fillStyle = isTip ? '#00FF88' : '#00E5FF';
        this.ctx.beginPath();
        this.ctx.arc(px, py, isTip ? 5 : 3.5, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
    this.ctx.restore();
  }

  /**
   * Draw subtle gesture detector HUD badge
   */
  drawGestureHUD(info, width, height) {
    if (!info.activeGesture) return;

    this.ctx.save();
    const text = `${info.gestureIcon} ${info.gestureName.toUpperCase()}`;
    this.ctx.font = '600 14px system-ui, -apple-system, sans-serif';
    const textWidth = this.ctx.measureText(text).width;
    const padding = 12;
    const boxW = textWidth + padding * 2 + 10;
    const boxH = 32;
    const x = 20;
    const y = height - boxH - 20;

    // Glass pill background
    this.ctx.fillStyle = 'rgba(10, 14, 20, 0.75)';
    this.ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, boxW, boxH, 8);
    this.ctx.fill();
    this.ctx.stroke();

    // Pulse dot
    this.ctx.fillStyle = '#00FF88';
    this.ctx.beginPath();
    this.ctx.arc(x + 14, y + boxH / 2, 4, 0, Math.PI * 2);
    this.ctx.fill();

    // Text
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(text, x + 26, y + boxH / 2);

    this.ctx.restore();
  }
}
