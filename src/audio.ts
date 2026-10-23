import type { Settings } from './storage';
import type { RunEvent } from './game/types';
export class GameAudio {
  private context: AudioContext | null = null;
  private voices = new Map<OscillatorNode, GainNode>();
  private disposed = false;
  constructor(private settings: () => Settings) {}
  async unlock() {
    if (this.disposed) return;
    if (!this.context || this.context.state === 'closed') this.context = new AudioContext();
    if (this.context.state !== 'running') await this.context.resume().catch(() => {});
  }
  stop() {
    for (const [oscillator, gain] of this.voices) {
      oscillator.onended = null;
      try { oscillator.stop(); } catch {}
      oscillator.disconnect(); gain.disconnect();
    }
    this.voices.clear();
  }
  destroy() {
    this.disposed = true; this.stop();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
    this.context = null;
  }
  play(event: RunEvent) {
    const s = this.settings(), ctx = this.context;
    if (!ctx || ctx.state !== 'running' || s.muted || s.volume <= 0 || this.voices.size>=12) return;
    const sounds: Record<RunEvent['type'], [number,number,number]> = {
      coin: [880,1320,0.09], borrow: [740,180,0.22], repay: [130,390,0.22],
      settle: [660,1320,0.36], death: [160,42,0.4], wave: [280,320,0.05],
      disarm: [520,1560,0.18],
      hurt:[220,65,0.18],kill:[420,180,0.06],weapon:[540,1080,0.18],volley:[170,880,0.15],
      upgrade:[660,1760,0.3],blast:[140,45,0.12],chain:[980,440,0.08],melee:[300,80,.08],switch:[420,680,.07],boss:[110,55,.5],
    };
    const [start,end,duration] = sounds[event.type];
    let oscillator: OscillatorNode | undefined, gain: GainNode | undefined;
    try {
      oscillator = ctx.createOscillator(); gain = ctx.createGain();
      oscillator.type = event.type === 'death' || event.type === 'repay' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(start,ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(end,ctx.currentTime + duration);
      gain.gain.setValueAtTime(s.volume * 0.16,ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime + duration);
      oscillator.connect(gain); gain.connect(ctx.destination);
      const voice = oscillator, output = gain;
      this.voices.set(voice, output);
      oscillator.onended = () => { voice.disconnect(); output.disconnect(); this.voices.delete(voice); };
      oscillator.start(); oscillator.stop(ctx.currentTime + duration);
    } catch {
      // Audio availability must not interrupt scoring, death, or tutorial transitions.
      if (oscillator) {
        oscillator.onended = null;
        try { oscillator.stop(); } catch {}
        oscillator.disconnect(); this.voices.delete(oscillator);
      }
      gain?.disconnect();
    }
  }
}
