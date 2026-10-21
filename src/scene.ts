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
  private runner = { run: null as RunSnapshot | null, tick: 0, x: 0, y: 0, phase: 0, facing: 1, moving: false };
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
      if (l.delay && l.delay > 0) continue;
      if (l.gate) {
        const warning = l.warn > 0;
        g.fillStyle(C.red,warning?0.09:0.55); g.fillRect(l.x,l.y,l.width,l.height);
        g.lineStyle(warning?1:2,C.red,warning?0.45:0.9);
        g.strokeRect(l.x,l.y,l.width,l.height);
        for (let x=l.x+12; x<l.x+l.width; x+=24) g.lineBetween(x,l.y+4,x,l.y+l.height-4);
        continue;
      }
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
    const gates = s.lasers.filter(l => l.gate && !l.delay && (l.warn > 0 || l.active > 0));
    if (gates.length === 2) {
      const top = gates[0].y + gates[0].height, bottom = gates[1].y;
      g.fillStyle(C.blue,0.08); g.fillRect(f.left,top,f.right-f.left,bottom-top);
      g.lineStyle(2,C.blue,0.7); g.lineBetween(f.left,top,f.right,top); g.lineBetween(f.left,bottom,f.right,bottom);
      for (let x=f.left+22;x<f.right;x+=54) {
        const y=(top+bottom)/2;
        g.lineBetween(x-5,y-5,x,y); g.lineBetween(x,y,x-5,y+5);
      }
    }
    for (const mine of s.mines) {
      const warning = mine.warn > 0, color = warning ? C.gold : C.red;
      g.fillStyle(color,warning?0.06:0.32); g.fillCircle(mine.x,mine.y,mine.radius);
      g.lineStyle(warning?1:3,color,warning?0.5:1); g.strokeCircle(mine.x,mine.y,mine.radius);
      if (warning) {
        g.lineStyle(3,color,0.95); g.beginPath();
        g.arc(mine.x,mine.y,23,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.min(1,mine.warn/RULES.mineWarn)); g.strokePath();
        g.fillStyle(s.mode==='borrow'?C.blue:C.gold,1);
        g.fillTriangle(mine.x,mine.y-12,mine.x+12,mine.y,mine.x,mine.y+12);
        g.fillTriangle(mine.x,mine.y-12,mine.x-12,mine.y,mine.x,mine.y+12);
        g.lineStyle(2,C.field,1); g.lineBetween(mine.x-5,mine.y,mine.x+5,mine.y); g.lineBetween(mine.x,mine.y-5,mine.x,mine.y+5);
      } else {
        g.lineStyle(2,C.red,0.8); g.strokeCircle(mine.x,mine.y,mine.radius*0.65);
        g.lineBetween(mine.x-12,mine.y-12,mine.x+12,mine.y+12); g.lineBetween(mine.x+12,mine.y-12,mine.x-12,mine.y+12);
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
    this.drawRunner(s,settings);
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
  private drawRunner(s:RunSnapshot, settings:Settings) {
    const g=this.pen, p=s.player, runner=this.runner;
    if(runner.run!==s) Object.assign(runner,{run:s,tick:s.tick,x:p.x,y:p.y,phase:0,facing:1,moving:false});
    if(runner.tick!==s.tick) {
      if(s.alive&&!s.paused) {
        const dx=p.x-runner.x, distance=Math.hypot(dx,p.y-runner.y);
        runner.moving=distance>0.01;
        // Use player travel, so borrowing and repayment never change the running speed.
        if(runner.moving) { runner.phase=(runner.phase+distance*0.16)%(Math.PI*2); if(Math.abs(dx)>0.01)runner.facing=Math.sign(dx); }
      }
      runner.tick=s.tick;
    }
    runner.x=p.x;runner.y=p.y;
    const stride=runner.moving?(settings.reducedMotion?0.6:Math.sin(runner.phase)):0;
    const bob=runner.moving&&!settings.reducedMotion?-Math.abs(Math.cos(runner.phase))*1.2:0;
    const face=runner.facing, lean=runner.moving?2:0;
    const ink=s.alive?C.ink:C.red, shirt=s.alive?C.blue:C.red;
    const limb=(points:number[][],color:number,width=3.5)=>{
      g.lineStyle(width,color,1);g.beginPath();
      points.forEach(([x,y],i)=>{ if(i===0)g.moveTo(p.x+face*x,p.y+y+bob);else g.lineTo(p.x+face*x,p.y+y+bob); });g.strokePath();
      g.fillStyle(color,1);for(const [x,y] of points)g.fillCircle(p.x+face*x,p.y+y+bob,width/2);
    };
    g.fillStyle(0x080f25,0.45);g.fillEllipse(p.x,p.y+16,25,6);
    g.fillStyle(shirt,0.08);g.fillCircle(p.x,p.y,22);
    for(const side of [-1,1]) {
      const swing=stride*side, foot=runner.moving?swing*9:side*4;
      const footY=14-(runner.moving?Math.max(0,-swing)*5:0);
      limb([[0,4],[swing*5+2,9],[foot,footY]],side===-1?0x557899:ink);
      limb([[foot,footY],[foot+3,footY]],side===-1?0x557899:shirt,3);
    }
    limb([[lean,-4],[-2+stride*5,1],[2+stride*7,-2]],0x557899,3);
    const scarf=s.alive?(s.mode==='repay'?C.red:C.gold):C.red;
    g.fillStyle(scarf,1);g.fillTriangle(p.x+face*lean,p.y-5+bob,p.x-face*(9+stride*2),p.y-8+bob,p.x-face*6,p.y-3+bob);
    g.fillStyle(shirt,1);g.fillRoundedRect(p.x+face*lean-4,p.y-5+bob,8,11,3);
    g.fillStyle(ink,1);g.fillCircle(p.x,p.y,2);
    limb([[lean,-3],[-2-stride*5,1],[2-stride*7,-2]],ink,3);
    const headX=p.x+face*(lean+1), headY=p.y-11+bob;
    g.fillStyle(ink,1);g.fillCircle(headX,headY,5.5);
    g.lineStyle(2,shirt,1);g.lineBetween(headX-4,headY-3,headX+4,headY-3);
    g.fillStyle(C.field,1);g.fillCircle(headX+face*2.5,headY,1);
  }
}
