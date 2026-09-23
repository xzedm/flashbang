/**
 * 1€ Filter (One Euro Filter) for noise reduction and jitter removal
 * in real-time interactive systems with minimal lag.
 * Reference: Casiez, Roussel, Vogel (CHI 2012)
 */

class LowPassFilter {
  constructor(alpha = 1.0, initVal = 0) {
    this.alpha = alpha;
    this.y = initVal;
    this.s = initVal;
    this.initialized = false;
  }

  filter(value, alpha) {
    this.alpha = alpha;
    if (!this.initialized) {
      this.s = value;
      this.initialized = true;
    } else {
      this.s = alpha * value + (1.0 - alpha) * this.s;
    }
    this.y = value;
    return this.s;
  }

  last() {
    return this.s;
  }

  reset() {
    this.initialized = false;
  }
}

export class OneEuroFilter {
  /**
   * @param {number} minCutoff - Minimum cutoff frequency in Hz (decreases jitter at low speeds)
   * @param {number} beta - Speed coefficient (reduces lag during quick movements)
   * @param {number} dCutoff - Cutoff frequency for derivative
   */
  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;

    this.xFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter();
    this.lastTime = null;
  }

  alpha(rate, cutoff) {
    const tau = 1.0 / (2.0 * Math.PI * cutoff);
    const te = 1.0 / rate;
    return 1.0 / (1.0 + tau / te);
  }

  filter(value, timestamp) {
    if (this.lastTime === null) {
      this.lastTime = timestamp;
      return this.xFilter.filter(value, 1.0);
    }

    // Convert ms difference to seconds rate
    let dt = (timestamp - this.lastTime) / 1000.0;
    this.lastTime = timestamp;

    if (dt <= 0 || isNaN(dt)) {
      dt = 1.0 / 60.0;
    }

    const rate = 1.0 / dt;

    // Estimate derivative
    const prevValue = this.xFilter.last();
    const dx = (value - prevValue) * rate;
    const edx = this.dxFilter.filter(dx, this.alpha(rate, this.dCutoff));

    // Dynamic cutoff based on speed
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);

    // Filter value
    return this.xFilter.filter(value, this.alpha(rate, cutoff));
  }

  reset() {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }
}

/**
 * Filter bank managing 21 3D landmarks (x, y, z) per hand.
 */
export class HandLandmarkFilterBank {
  constructor(minCutoff = 1.2, beta = 0.005, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    // Map of handKey -> Array(21) of { xFilter, yFilter, zFilter }
    this.hands = new Map();
  }

  getFiltersForHand(handKey) {
    if (!this.hands.has(handKey)) {
      const filters = [];
      for (let i = 0; i < 21; i++) {
        filters.push({
          x: new OneEuroFilter(this.minCutoff, this.beta, this.dCutoff),
          y: new OneEuroFilter(this.minCutoff, this.beta, this.dCutoff),
          z: new OneEuroFilter(this.minCutoff, this.beta, this.dCutoff)
        });
      }
      this.hands.set(handKey, filters);
    }
    return this.hands.get(handKey);
  }

  filter(handKey, landmarks, timestamp) {
    if (!landmarks || landmarks.length !== 21) {
      return landmarks;
    }

    const filters = this.getFiltersForHand(handKey);
    const smoothed = new Array(21);

    for (let i = 0; i < 21; i++) {
      const p = landmarks[i];
      const f = filters[i];
      smoothed[i] = {
        x: f.x.filter(p.x, timestamp),
        y: f.y.filter(p.y, timestamp),
        z: f.z.filter(p.z ?? 0, timestamp),
        visibility: p.visibility
      };
    }

    return smoothed;
  }

  prune(activeKeys) {
    for (const key of this.hands.keys()) {
      if (!activeKeys.has(key)) {
        this.hands.delete(key);
      }
    }
  }

  resetAll() {
    this.hands.clear();
  }
}
