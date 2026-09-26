class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.bgmGain = null;
    this.bgmInterval = null;
    this.isBgmPlaying = false;
    this.noiseBuffer = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this._createNoiseBuffer();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  _createNoiseBuffer() {
    if (!this.ctx || this.noiseBuffer) return;
    const bufferSize = this.ctx.sampleRate * 2; // 2 seconds of noise
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.bgmGain && this.ctx) {
      this.bgmGain.gain.setValueAtTime(this.muted ? 0 : 0.15, this.ctx.currentTime);
    }
    return this.muted;
  }

  startBgm() {
    this.init();
    if (this.isBgmPlaying || !this.ctx) return;
    this.isBgmPlaying = true;

    if (!this.bgmGain) {
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.setValueAtTime(this.muted ? 0 : 0.15, this.ctx.currentTime);
      this.bgmGain.connect(this.ctx.destination);
    }

    // 16-step synthwave battle loop (4 bars = 64 steps total loop)
    // 122 BPM -> ~123ms per 16th note step
    let currentStep = 0;

    // Chord progression notes (frequencies in Hz)
    // Bar 1: C minor | Bar 2: Ab major | Bar 3: Bb major | Bar 4: G minor
    const bassChords = [
      [65.41, 130.81], // C2, C3
      [51.91, 103.83], // Ab1, Ab2
      [58.27, 116.54], // Bb1, Bb2
      [49.00, 98.00]   // G1, G2
    ];

    const arpChords = [
      [261.63, 311.13, 392.00, 523.25, 622.25, 783.99], // Cm: C4, Eb4, G4, C5, Eb5, G5
      [207.65, 261.63, 311.13, 415.30, 523.25, 622.25], // Ab: Ab3, C4, Eb4, Ab4, C5, Eb5
      [233.08, 293.66, 349.23, 466.16, 587.33, 698.46], // Bb: Bb3, D4, F4, Bb4, D5, F5
      [196.00, 246.94, 293.66, 392.00, 493.88, 587.33]  // G: G3, B3, D4, G4, B4, D5
    ];

    this.bgmInterval = setInterval(() => {
      if (this.muted || !this.isBgmPlaying || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const barIndex = Math.floor(currentStep / 16) % 4;
        const stepInBar = currentStep % 16;

        // --- 1. DRUMS (Kick, Snare, Hi-Hat) ---
        // KICK (Steps 0, 6, 8, 14)
        if (stepInBar === 0 || stepInBar === 6 || stepInBar === 8 || stepInBar === 14) {
          const kickOsc = this.ctx.createOscillator();
          const kickGain = this.ctx.createGain();
          kickOsc.frequency.setValueAtTime(140, now);
          kickOsc.frequency.exponentialRampToValueAtTime(32, now + 0.08);
          kickGain.gain.setValueAtTime(0.35, now);
          kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
          kickOsc.connect(kickGain);
          kickGain.connect(this.bgmGain);
          kickOsc.start(now);
          kickOsc.stop(now + 0.09);
        }

        // SNARE (Steps 4, 12)
        if (stepInBar === 4 || stepInBar === 12) {
          if (this.noiseBuffer) {
            const snareNoise = this.ctx.createBufferSource();
            snareNoise.buffer = this.noiseBuffer;
            const snareFilter = this.ctx.createBiquadFilter();
            snareFilter.type = 'highpass';
            snareFilter.frequency.setValueAtTime(800, now);
            const snareGain = this.ctx.createGain();
            snareGain.gain.setValueAtTime(0.2, now);
            snareGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            snareNoise.connect(snareFilter);
            snareFilter.connect(snareGain);
            snareGain.connect(this.bgmGain);
            snareNoise.start(now);
            snareNoise.stop(now + 0.12);
          }
        }

        // HI-HAT (Every 8th note, accent on offbeats)
        if (stepInBar % 2 === 0) {
          if (this.noiseBuffer) {
            const hatNoise = this.ctx.createBufferSource();
            hatNoise.buffer = this.noiseBuffer;
            const hatFilter = this.ctx.createBiquadFilter();
            hatFilter.type = 'highpass';
            hatFilter.frequency.setValueAtTime(5000, now);
            const hatGain = this.ctx.createGain();
            const isOpen = stepInBar === 2 || stepInBar === 6 || stepInBar === 10 || stepInBar === 14;
            const dur = isOpen ? 0.06 : 0.025;
            const vol = isOpen ? 0.08 : 0.04;
            hatGain.gain.setValueAtTime(vol, now);
            hatGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
            hatNoise.connect(hatFilter);
            hatFilter.connect(hatGain);
            hatGain.connect(this.bgmGain);
            hatNoise.start(now);
            hatNoise.stop(now + dur);
          }
        }

        // --- 2. BASSLINE (Resonant Synthwave Sawtooth) ---
        // Plays on steps 0, 2, 3, 5, 8, 10, 11, 13 (Cool syncopated synthwave drive)
        if ([0, 2, 3, 5, 8, 10, 11, 13].includes(stepInBar)) {
          const bassOsc = this.ctx.createOscillator();
          const bassFilter = this.ctx.createBiquadFilter();
          const bassGain = this.ctx.createGain();

          const bassChord = bassChords[barIndex];
          const isOctaveUp = stepInBar === 3 || stepInBar === 11;
          const bassFreq = isOctaveUp ? bassChord[1] : bassChord[0];

          bassOsc.type = 'sawtooth';
          bassOsc.frequency.setValueAtTime(bassFreq, now);

          bassFilter.type = 'lowpass';
          bassFilter.frequency.setValueAtTime(600, now);
          bassFilter.frequency.exponentialRampToValueAtTime(140, now + 0.15);

          bassGain.gain.setValueAtTime(0.22, now);
          bassGain.gain.exponentialRampToValueAtTime(0.005, now + 0.16);

          bassOsc.connect(bassFilter);
          bassFilter.connect(bassGain);
          bassGain.connect(this.bgmGain);

          bassOsc.start(now);
          bassOsc.stop(now + 0.16);
        }

        // --- 3. SYNTH ARPEGGIO & MELODY ---
        // Fast 16th-note arpeggiator
        const arpNotes = arpChords[barIndex];
        const arpFreq = arpNotes[stepInBar % arpNotes.length];

        const arpOsc = this.ctx.createOscillator();
        const arpFilter = this.ctx.createBiquadFilter();
        const arpGain = this.ctx.createGain();

        arpOsc.type = stepInBar % 4 === 0 ? 'sawtooth' : 'square';
        arpOsc.frequency.setValueAtTime(arpFreq, now);

        arpFilter.type = 'bandpass';
        arpFilter.frequency.setValueAtTime(1200, now);
        arpFilter.Q.setValueAtTime(3, now);

        arpGain.gain.setValueAtTime(0.06, now);
        arpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        arpOsc.connect(arpFilter);
        arpFilter.connect(arpGain);
        arpGain.connect(this.bgmGain);

        arpOsc.start(now);
        arpOsc.stop(now + 0.1);

        currentStep = (currentStep + 1) % 64;
      } catch (e) {}
    }, 122);
  }

  stopBgm() {
    this.isBgmPlaying = false;
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
  }

  playTone(freq, type, duration, startVol = 0.3, endVol = 0) {
    if (this.muted || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(startVol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, endVol), this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn(e);
    }
  }

  playKill() {
    if (this.muted || !this.ctx) return;
    this.init();
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);

      this.playTone(800, 'square', 0.1, 0.4, 0.01);
    } catch (e) {}
  }

  playStun() {
    if (this.muted || !this.ctx) return;
    this.init();
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.setValueAtTime(110, now + 0.1);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    } catch (e) {}
  }

  playTaskComplete() {
    if (this.muted || !this.ctx) return;
    this.init();
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        this.playTone(freq, 'sine', 0.2, 0.3, 0.01);
      }, idx * 60);
    });
  }

  playPanic() {
    if (this.muted || !this.ctx) return;
    this.init();
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.linearRampToValueAtTime(900, now + 0.25);
      osc.frequency.linearRampToValueAtTime(600, now + 0.5);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    } catch (e) {}
  }

  playVent() {
    if (this.muted || !this.ctx) return;
    this.init();
    // Metal vent swoosh sound
    this.playTone(180, 'square', 0.25, 0.4, 0.01);
    setTimeout(() => this.playTone(90, 'sine', 0.2, 0.3, 0.01), 100);
  }

  playCrown() {
    if (this.muted || !this.ctx) return;
    this.init();
    this.playTone(440, 'triangle', 0.4, 0.4, 0.01);
    setTimeout(() => this.playTone(554.37, 'triangle', 0.4, 0.4, 0.01), 150);
    setTimeout(() => this.playTone(659.25, 'triangle', 0.6, 0.5, 0.01), 300);
  }

  playStep() {
    if (this.muted || !this.ctx) return;
    this.init();
    this.playTone(120 + Math.random() * 40, 'sine', 0.05, 0.05, 0.001);
  }
}

export const soundManager = new SoundEngine();
