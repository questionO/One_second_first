import type { RunSummary } from './game/types';
export type Settings = { volume: number; muted: boolean; reducedMotion: boolean; lowQuality: boolean };
export type SaveData = { version: 1; tutorialDone: boolean; settings: Settings; best: RunSummary | null; recent: RunSummary[] };
export const SAVE_KEY = 'one-second-first.save.v1';
export function defaults(): SaveData { return { version: 1, tutorialDone: false, settings: { volume: 0.35, muted: false, reducedMotion: false, lowQuality: false }, best: null, recent: [] }; }
function validSummary(v: unknown): v is RunSummary {
  if (!v || typeof v !== 'object') return false;
  const s = v as RunSummary;
  return ['seed','score','ticks','borrowCount','settlements','lostPending','wave'].every(k => typeof s[k as keyof RunSummary] === 'number' && Number.isSafeInteger(s[k as keyof RunSummary]) && Number(s[k as keyof RunSummary]) >= 0)
    && typeof s.rulesVersion === 'string' && typeof s.deathReason === 'string';
}
export class SaveStore {
  data = defaults();
  persistent = true;
  private pendingRuns: RunSummary[] = [];
  private savedSettings = { ...this.data.settings };
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'> | null) {
    try {
      if (!storage) throw new Error('Storage unavailable');
      this.data = readSave(storage.getItem(SAVE_KEY));
      this.savedSettings = { ...this.data.settings };
    } catch { this.persistent = false; return; }
    this.persist();
  }
  persist() {
    try {
      if (!this.storage) throw new Error('Unavailable');
      const latest = readSave(this.storage.getItem(SAVE_KEY));
      this.data.best = better(this.data.best, latest.best) ? this.data.best : latest.best;
      this.data.recent = [...this.pendingRuns, ...latest.recent].slice(0,20);
      this.data.tutorialDone ||= latest.tutorialDone;
      const current = this.data.settings, saved = this.savedSettings;
      this.data.settings = {
        volume: current.volume !== saved.volume ? current.volume : latest.settings.volume,
        muted: current.muted !== saved.muted ? current.muted : latest.settings.muted,
        reducedMotion: current.reducedMotion !== saved.reducedMotion ? current.reducedMotion : latest.settings.reducedMotion,
        lowQuality: current.lowQuality !== saved.lowQuality ? current.lowQuality : latest.settings.lowQuality,
      };
      this.storage.setItem(SAVE_KEY, JSON.stringify(this.data));
      this.pendingRuns = []; this.savedSettings = { ...this.data.settings }; this.persistent = true;
    }
    catch { this.persistent = false; }
  }
  record(s: RunSummary): boolean {
    const record = { ...s };
    if (better(record, this.data.best)) this.data.best = record;
    this.pendingRuns = [record, ...this.pendingRuns].slice(0,20);
    this.data.recent = [record, ...this.data.recent].slice(0,20); this.persist();
    return this.data.best === record;
  }
}
function better(a: RunSummary | null, b: RunSummary | null): boolean {
  return !!a && (!b || a.score > b.score || (a.score === b.score && a.ticks > b.ticks));
}
function readSave(text: string | null): SaveData {
  const data = defaults();
  let v;
  try { v = text ? JSON.parse(text) : null; } catch { return data; }
  if (typeof v?.version === 'number' && v.version > 1) throw new Error('Unsupported save version');
  if (v?.version === 1 && typeof v.tutorialDone === 'boolean' && v.settings && Array.isArray(v.recent)) {
    data.tutorialDone = v.tutorialDone;
    const s = v.settings;
    data.settings = {
      volume: typeof s.volume === 'number' && Number.isFinite(s.volume) ? Math.max(0, Math.min(1, s.volume)) : 0.35,
      muted: s.muted === true, reducedMotion: s.reducedMotion === true, lowQuality: s.lowQuality === true,
    };
    data.best = validSummary(v.best) ? v.best : null;
    data.recent = v.recent.filter(validSummary).slice(0,20);
  }
  return data;
}
