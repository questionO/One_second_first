import type { RunSummary } from './game/types';
import { RULES_VERSION } from './game/balance';
export type Settings = { volume: number; muted: boolean; reducedMotion: boolean; lowQuality: boolean };
export type SaveData = { version: 3; tutorialDone: boolean; settings: Settings; best: RunSummary | null; recent: RunSummary[] };
export const SAVE_KEY = 'one-second-first.save.v3';
export const PREVIOUS_SAVE_KEY = 'one-second-first.save.v2';
export const LEGACY_SAVE_KEY = 'one-second-first.save.v1';
export function defaults(): SaveData { return { version: 3, tutorialDone: false, settings: { volume: 0.35, muted: false, reducedMotion: false, lowQuality: false }, best: null, recent: [] }; }
function validSummary(v: unknown): v is RunSummary {
  if (!v || typeof v !== 'object') return false;
  const s = v as RunSummary;
  return ['seed','score','ticks','borrowCount','settlements','lostPending','wave','kills','level'].every(k => typeof s[k as keyof RunSummary] === 'number' && Number.isSafeInteger(s[k as keyof RunSummary]) && Number(s[k as keyof RunSummary]) >= 0)
    && s.rulesVersion === RULES_VERSION && s.level>=1 && typeof s.deathReason === 'string';
}
export class SaveStore {
  data = defaults();
  persistent = true;
  private pendingRuns: RunSummary[] = [];
  private savedSettings = { ...this.data.settings };
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'> | null) {
    try {
      if (!storage) throw new Error('Storage unavailable');
      const current=storage.getItem(SAVE_KEY);
      this.data = readSave(current);
      if(current===null) {
        for(const [key,version] of [[PREVIOUS_SAVE_KEY,2],[LEGACY_SAVE_KEY,1]] as const){
          let old;try{old=JSON.parse(storage.getItem(key)??'null');}catch{}
          if(old?.version===version&&old.settings){this.data.settings=readSettings(old.settings);break;}
        }
      } else this.savedSettings = { ...this.data.settings };
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
    if(!validSummary(s)) return false;
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
  if (typeof v?.version === 'number' && v.version > 3) throw new Error('Unsupported save version');
  if (v?.version === 3 && typeof v.tutorialDone === 'boolean' && v.settings && Array.isArray(v.recent)) {
    data.tutorialDone = v.tutorialDone;
    data.settings = readSettings(v.settings);
    data.best = validSummary(v.best) ? v.best : null;
    data.recent = v.recent.filter(validSummary).slice(0,20);
  }
  return data;
}
function readSettings(value:unknown):Settings {
  const s=(value&&typeof value==='object'?value:{}) as Partial<Settings>;
  return {volume:typeof s.volume==='number'&&Number.isFinite(s.volume)?Math.max(0,Math.min(1,s.volume)):0.35,
    muted:s.muted===true,reducedMotion:s.reducedMotion===true,lowQuality:s.lowQuality===true};
}
