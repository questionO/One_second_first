import Phaser from 'phaser';
import { RULES } from './game/balance';
import type { RunSnapshot } from './game/types';
import type { Settings } from './storage';
const C = { field:0x1c2a50, ink:0xf2f6ff, blue:0x66d9ff, red:0xff765e, gold:0xffd66b };
export class ArenaScene extends Phaser.Scene {
  private pen!: Phaser.GameObjects.Graphics;
  private effects!: Phaser.GameObjects.Graphics;
  private burst = 0;
  private burstX = 0;
  private burstY = 0;
  private lastTime = 0;
  constructor(private read: () => RunSnapshot, private settings: () => Settings, private frame: (delta:number) => void, private debug: () => boolean) { super('arena'); }
  create() { this.pen = this.add.graphics(); this.effects = this.add.graphics();
    const resolution=this.settings().lowQuality?0.75:1; this.scale.setGameSize(960*resolution,540*resolution); }
  update() {
    const now = performance.now();
    const delta = this.lastTime ? now - this.lastTime : 0; this.lastTime = now;
    this.frame(delta); this.draw(delta);
  }
  celebrate() { const s = this.read(); this.burst = 500; this.burstX = s.player.x; this.burstY = s.player.y; }
  private draw(delta:number) {
    if (!this.pen) return;
    const s = this.read(), g = this.pen, f = RULES.field, settings = this.settings();
    const resolution=settings.lowQuality?0.75:1;
    this.pen.setScale(resolution); this.effects.setScale(resolution);
    const accent = s.mode === 'borrow' ? C.blue : s.mode === 'repay' ? C.red : 0x7e93c5;
    g.clear();
    g.fillStyle(C.field,1); g.fillRoundedRect(f.left,f.top,f.right-f.left,f.bottom-f.top,12);
    g.lineStyle(1,0x34466e,0.4);
    for (let x = 60; x < f.right; x += 36) g.lineBetween(x,f.top+1,x,f.bottom-1);
    for (let y = 98; y < f.bottom; y += 36) g.lineBetween(f.left+1,y,f.right-1,y);
    g.lineStyle(s.mode === 'normal' ? 1 : 2,accent,0.65); g.strokeRoundedRect(f.left,f.top,f.right-f.left,f.bottom-f.top,12);
    // Clock marks belong to the playfield boundary, not the collision region.
    g.lineStyle(2,accent,0.55);
    for (let i = 0; i < 30; i++) { const x = f.left+15+i*29.5; g.lineBetween(x,f.top-10,x,f.top-(i%5===0?18:14)); }
    for (const coin of s.coins) {
      g.fillStyle(C.gold,coin.risk?0.11:0.05); g.fillCircle(coin.x,coin.y,16);
      g.lineStyle(1,C.gold,0.9); g.strokeCircle(coin.x,coin.y,9);
      g.fillStyle(C.gold,1); g.fillTriangle(coin.x,coin.y-5,coin.x+4,coin.y,coin.x,coin.y+5);
      g.fillTriangle(coin.x,coin.y-5,coin.x-4,coin.y,coin.x,coin.y+5);
      if (coin.risk) { g.lineStyle(1,C.gold,0.4); g.strokeCircle(coin.x,coin.y,13); }
    }
    for (const l of s.lasers) {
      if (l.warn > 0) {
        g.fillStyle(C.red,0.07); g.fillRect(l.x-5,l.y,l.width+10,l.height);
        g.lineStyle(1,C.red,0.65);
        if(l.width>l.height) { for(let x=l.x;x<l.x+l.width;x+=14)g.lineBetween(x,l.y+6,Math.min(x+6,l.x+l.width),l.y+6); }
        else { for (let y = l.y; y < l.y+l.height; y += 14) g.lineBetween(l.x+6,y,l.x+6,Math.min(y+6,l.y+l.height)); }
        g.lineStyle(2,C.red,0.7); g.strokeCircle(l.x+6,l.y+3,5);
      } else if (l.active > 0) {
        g.fillStyle(C.red,0.15); g.fillRect(l.x-7,l.y,l.width+14,l.height);
        g.fillStyle(C.red,1); g.fillRect(l.x,l.y,l.width,l.height);
        g.fillStyle(C.ink,0.8);
        if(l.width>l.height)g.fillRect(l.x,l.y+4,l.width,4);else g.fillRect(l.x+4,l.y,4,l.height);
      }
    }
    for (const b of s.bullets) {
      if (b.x < f.left-10 || b.x > f.right+10 || b.y < f.top-10 || b.y > f.bottom+10) continue;
      const color = s.mode === 'borrow' ? C.blue : C.red;
      if (!settings.lowQuality) {
        g.lineStyle(s.mode==='repay'?4:2,color,0.22);
        const n = s.mode==='repay'?0.11:0.05; g.lineBetween(b.x-b.vx*n,b.y-b.vy*n,b.x,b.y);
        g.fillStyle(color,0.07); g.fillCircle(b.x,b.y,b.radius+5);
      }
      g.fillStyle(color,1); g.fillCircle(b.x,b.y,b.radius);
      g.fillStyle(C.ink,0.6); g.fillCircle(b.x-1,b.y-1,2);
    }
    const p = s.player;
    g.fillStyle(s.alive ? C.blue : C.red,0.1); g.fillCircle(p.x,p.y,24);
    g.lineStyle(1,s.alive?C.blue:C.red,0.8); g.strokeCircle(p.x,p.y,17);
    g.fillStyle(s.alive?C.ink:C.red,1);
    g.fillTriangle(p.x,p.y-12,p.x+11,p.y+8,p.x,p.y+4);
    g.fillTriangle(p.x,p.y-12,p.x-11,p.y+8,p.x,p.y+4);
    g.fillStyle(C.blue,1); g.fillCircle(p.x,p.y+1,3);
    if (s.deathAt) { g.lineStyle(2,C.red,1); g.strokeCircle(s.deathAt.x,s.deathAt.y,21); g.lineBetween(s.deathAt.x-8,s.deathAt.y-8,s.deathAt.x+8,s.deathAt.y+8); }
    if (this.debug()) {
      g.lineStyle(1,0x8dff95,1); g.strokeCircle(p.x,p.y,RULES.playerRadius);
      for (const b of s.bullets) g.strokeCircle(b.x,b.y,b.radius);
    }
    this.effects.clear();
    if (this.burst > 0) {
      this.burst -= Math.min(delta,50);
      if (!settings.reducedMotion && !settings.lowQuality) {
        const t=1-this.burst/500;
        this.effects.lineStyle(2,C.gold,1-t); this.effects.strokeCircle(this.burstX,this.burstY,18+t*55);
        for(let i=0;i<10;i++) {const a=i*Math.PI/5;this.effects.fillStyle(C.gold,1-t);this.effects.fillCircle(this.burstX+Math.cos(a)*t*65,this.burstY+Math.sin(a)*t*65,2);}
      }
    }
  }
}
