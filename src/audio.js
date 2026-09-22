/**
 * Web Audio API procedural sound engine for Flashbang FX.
 * Synthesizes:
 *  1. Detonation blast (sub-bass transient + explosive noise transient + rumble)
 *  2. High-pitched tinnitus ear ringing (3.95 kHz binaural sine oscillation with exponential decay)
 */
export class FlashbangAudio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.volume = 0.85;
    this.muted = false;
    this.voiceBuffer = null;
    this.isVoiceLoading = false;
  }

  async init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // Load CS:GO voice line
      this.loadVoiceSound();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  async loadVoiceSound() {
    if (this.voiceBuffer || this.isVoiceLoading) return;
    this.isVoiceLoading = true;
    try {
      const response = await fetch('/throwing-flashbang-sound-effect-cs-go.mp3');
      const arrayBuffer = await response.arrayBuffer();
      this.voiceBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      console.log('[FlashbangAudio] Loaded CS:GO voice line successfully');
    } catch (err) {
      console.warn('[FlashbangAudio] Could not load CS:GO voice line:', err);
    } finally {
      this.isVoiceLoading = false;
    }
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && !this.muted) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  /**
   * Play the CS:GO "Throwing flashbang!" voice line
   */
  playVoice() {
    this.init();
    if (!this.ctx || !this.voiceBuffer) return;

    try {
      const voiceSource = this.ctx.createBufferSource();
      voiceSource.buffer = this.voiceBuffer;
      voiceSource.connect(this.masterGain);
      voiceSource.start(this.ctx.currentTime);
    } catch (err) {
      console.warn('Error playing voice source:', err);
    }
  }

  /**
   * Play the flashbang explosion and tinnitus ringing
   * @param {number} durationSeconds - total length of tinnitus ring fadeout
   */
  playBlast(durationSeconds = 4.5) {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // 1. --- SUB-BASS TRANSIENT BOOM ---
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();

    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(140, now);
    subOsc.frequency.exponentialRampToValueAtTime(32, now + 0.35);

    subGain.gain.setValueAtTime(1.0, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    subOsc.connect(subGain);
    subGain.connect(this.masterGain);

    subOsc.start(now);
    subOsc.stop(now + 0.55);

    // 2. --- EXPLOSIVE NOISE BURST & CRACKLE ---
    const bufferSize = this.ctx.sampleRate * 0.8; // 800ms buffer
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseNode = this.ctx.createBufferSource();
    noiseNode.buffer = noiseBuffer;

    // Filter to shape into explosive low-mid rumble
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(8000, now);
    filter.frequency.exponentialRampToValueAtTime(300, now + 0.45);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.9, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    noiseNode.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    noiseNode.start(now);
    noiseNode.stop(now + 0.75);

    // 3. --- TINNITUS EAR RINGING (High-pitch 3950 Hz & 3954 Hz) ---
    const ringFreq = 3950;
    const oscLeft = this.ctx.createOscillator();
    const oscRight = this.ctx.createOscillator();
    const ringGain = this.ctx.createGain();

    oscLeft.type = 'sine';
    oscRight.type = 'sine';
    oscLeft.frequency.setValueAtTime(ringFreq, now);
    oscRight.frequency.setValueAtTime(ringFreq + 4, now); // 4Hz beat frequency creates eerie ringing texture

    // Initial shock: loud for the first ~0.8s, then exponential decay
    ringGain.gain.setValueAtTime(0.001, now);
    ringGain.gain.linearRampToValueAtTime(0.55, now + 0.04);
    ringGain.gain.setValueAtTime(0.5, now + 0.8);
    ringGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);

    oscLeft.connect(ringGain);
    oscRight.connect(ringGain);
    ringGain.connect(this.masterGain);

    oscLeft.start(now);
    oscRight.start(now);
    oscLeft.stop(now + durationSeconds + 0.1);
    oscRight.stop(now + durationSeconds + 0.1);
  }

  /**
   * Main play trigger supporting the CS:GO voice line and timed blast
   * @param {Object} options
   */
  playSequence({ durationSeconds = 4.5, withVoice = true, delayMs = 1500, onDetonate = null } = {}) {
    this.init();

    if (withVoice && this.voiceBuffer) {
      this.playVoice();
      if (delayMs > 0) {
        setTimeout(() => {
          this.playBlast(durationSeconds);
          if (onDetonate) onDetonate();
        }, delayMs);
        return;
      }
    }

    // Direct blast without delay
    this.playBlast(durationSeconds);
    if (onDetonate) onDetonate();
  }
}

