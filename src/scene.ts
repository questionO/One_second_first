import Phaser from 'phaser';
import { RULES } from './game/balance';
import type { Mode, RunSnapshot } from './game/types';
import type { Settings } from './storage';
const C = { field:0x1c2a50, ink:0xf2f6ff, blue:0x66d9ff, red:0xff765e, gold:0xffd66b };
export class ArenaScene extends Phaser.Scene {
  private pen!: Phaser.GameObjects.Graphics;
  private effects!: Phaser.GameObjects.Graphics;
  private burst = 0;
  private burstX = 0;
  private burstY = 0;
  private burstRun: RunSnapshot | null = null;
  private lastTime = 0;
  private timeVisual = { run: null as RunSnapshot | null, mode: 'normal' as Mode, started: 0, tick: -1,
    origin: {x:0,y:0}, trail: [] as {x:number;y:number;tick:number}[] };
  private runner = { run: null as RunSnapshot | null, tick: 0, x: 0, y: 0, phase: 0, facing: 'right' as 'left' | 'right' | 'up' | 'down', moving: false };
  constructor(private read: () => RunSnapshot, private settings: () => Settings, private frame: (delta:number) => void, private debug: () => boolean) { super('arena'); }
  create() { this.pen = this.add.graphics(); this.effects = this.add.graphics();
    const resolution=this.settings().lowQuality?0.75:1; this.scale.setGameSize(960*resolution,540*resolution); }
  update() {
    const now = performance.now();
    const delta = this.lastTime ? now - this.lastTime : 0; this.lastTime = now;
    this.frame(delta); this.draw(delta);
  }
  celebrate() { const s = this.read(); this.burstRun=s;this.burst = 500; this.burstX = s.player.x; this.burstY = s.player.y; }
  private draw(delta:number) {
    if (!this.pen) return;
    const s = this.read(), g = this.pen, f = RULES.field, settings = this.settings();
    if(this.burstRun!==s||!s.alive) this.burst=0;
    const resolution=settings.lowQuality?0.75:1;
    this.pen.setScale(resolution); this.effects.setScale(resolution);
    const accent = s.mode === 'borrow' ? C.blue : s.mode === 'repay' ? C.red : 0x7e93c5;
    g.clear();
    g.fillStyle(s.mode==='borrow'?0x102b40:s.mode==='repay'?0x302039:C.field,1);
    g.fillRoundedRect(f.left,f.top,f.right-f.left,f.bottom-f.top,12);
    g.lineStyle(1,s.mode==='borrow'?0x4b8da5:s.mode==='repay'?0x78424d:0x34466e,0.4);
    for (let x = 60; x < f.right; x += 36) g.lineBetween(x,f.top+1,x,f.bottom-1);
    for (let y = 98; y < f.bottom; y += 36) g.lineBetween(f.left+1,y,f.right-1,y);
    g.lineStyle(s.mode === 'normal' ? 1 : 2,accent,0.65); g.strokeRoundedRect(f.left,f.top,f.right-f.left,f.bottom-f.top,12);
    // Clock marks belong to the playfield boundary, not the collision region.
    g.lineStyle(2,accent,0.55);
    for (let i = 0; i < 30; i++) { const x = f.left+15+i*29.5; g.lineBetween(x,f.top-10,x,f.top-(i%5===0?18:14)); }
    this.drawTimeField(s,settings);
    this.drawCombat(s,settings);
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
        g.lineStyle(s.mode==='repay'?4:2,color,s.mode==='repay'?0.38:0.22);
        const n = s.mode==='borrow'?0:s.mode==='repay'&&!settings.reducedMotion?0.24:0.05;
        g.lineBetween(b.x-b.vx*n,b.y-b.vy*n,b.x,b.y);
        g.fillStyle(color,0.07); g.fillCircle(b.x,b.y,b.radius+5);
      }
      g.fillStyle(color,1); g.fillCircle(b.x,b.y,b.radius);
      g.fillStyle(C.ink,0.6); g.fillCircle(b.x-1,b.y-1,2);
      if(s.mode==='borrow') {
        g.lineStyle(1,C.ink,0.75);g.strokeCircle(b.x,b.y,b.radius+3);
        g.lineBetween(b.x-2,b.y-b.radius-7,b.x-2,b.y-b.radius-4);
        g.lineBetween(b.x+2,b.y-b.radius-7,b.x+2,b.y-b.radius-4);
        g.fillStyle(C.red,1);g.fillCircle(b.x,b.y,2);
      }
    }
    const p = s.player;
    this.drawRunner(s,settings);
    if(s.invulnerable>0) {g.lineStyle(2,C.ink,settings.reducedMotion?0.7:0.4+0.4*Math.abs(Math.sin(s.tick/4)));g.strokeCircle(p.x,p.y,21);}
    if(s.alive&&s.mode==='borrow') {
      g.lineStyle(2,C.blue,0.25);g.strokeCircle(p.x,p.y,26);
      g.lineStyle(3,C.ink,0.95);g.beginPath();
      g.arc(p.x,p.y,26,-Math.PI/2,-Math.PI/2+Math.PI*2*s.borrowLeft/RULES.borrowTicks);g.strokePath();
    }
    if (s.deathAt) { g.lineStyle(2,C.red,1); g.strokeCircle(s.deathAt.x,s.deathAt.y,21); g.lineBetween(s.deathAt.x-8,s.deathAt.y-8,s.deathAt.x+8,s.deathAt.y+8); }
    if (this.debug()) {
      g.lineStyle(1,0x8dff95,1); g.strokeCircle(p.x,p.y,RULES.playerRadius);
      for (const b of s.bullets) g.strokeCircle(b.x,b.y,b.radius);
    }
    this.effects.clear();
    if (this.burst > 0) {
      if(!s.paused) this.burst -= Math.min(delta,50);
      if (!settings.reducedMotion && !settings.lowQuality) {
        const t=1-this.burst/500;
        this.effects.lineStyle(2,C.gold,1-t); this.effects.strokeCircle(this.burstX,this.burstY,18+t*55);
        for(let i=0;i<10;i++) {const a=i*Math.PI/5;this.effects.fillStyle(C.gold,1-t);this.effects.fillCircle(this.burstX+Math.cos(a)*t*65,this.burstY+Math.sin(a)*t*65,2);}
      }
    }
  }
  private drawCombat(s:RunSnapshot,settings:Settings) {
    const g=this.pen,f=RULES.field;
    for(const drop of s.drops) {
      const {x,y}=drop;
      g.fillStyle(0x172238,1);g.fillRoundedRect(x-14,y-14,28,28,5);
      g.lineStyle(2,C.gold,1);g.strokeRoundedRect(x-14,y-14,28,28,5);
      if(drop.kind==='gun') for(const dy of [-6,0,6]) g.lineBetween(x-6,y,x+7,y+dy);
      else if(drop.kind==='spear') {g.lineBetween(x-8,y,x+8,y);g.lineBetween(x+3,y-5,x+8,y);g.lineBetween(x+3,y+5,x+8,y);}
      else if(drop.kind==='medical'){g.lineStyle(4,0x86e6b2,1);g.lineBetween(x-7,y,x+7,y);g.lineBetween(x,y-7,x,y+7);}
      else if(drop.kind==='ammo'){g.strokeRect(x-7,y-8,5,16);g.strokeRect(x+2,y-8,5,16);}
      else if(drop.kind==='bow'){g.beginPath();g.arc(x-3,y,9,-Math.PI/2,Math.PI/2);g.strokePath();g.lineBetween(x-3,y-9,x-3,y+9);}
      else if(drop.kind==='sword'){g.lineBetween(x-7,y+8,x+7,y-8);g.lineBetween(x-8,y,x,y+8);}
      else if(drop.kind==='hammer'){g.lineBetween(x,y+9,x,y-6);g.fillStyle(C.gold,1);g.fillRect(x-8,y-8,16,7);}
      else {g.lineBetween(x+3,y-9,x-4,y);g.lineBetween(x-4,y,x+4,y);g.lineBetween(x+4,y,x-3,y+9);}
    }
    for(const z of s.zones){
      const color=z.friendly?C.gold:C.red;g.fillStyle(color,z.warn>0?.08:.35);g.lineStyle(2,color,z.warn>0?.65:1);
      if(z.arc!==undefined){g.beginPath();g.moveTo(z.x,z.y);g.arc(z.x,z.y,z.radius,(z.angle??0)-z.arc,(z.angle??0)+z.arc);g.closePath();g.fillPath();g.strokePath();}
      else {g.fillCircle(z.x,z.y,z.radius);g.strokeCircle(z.x,z.y,z.radius);}
    }
    for(const mark of s.marks){const target=s.enemies.find(e=>e.id===mark.target);if(target){g.lineStyle(2,C.blue,.8);g.lineBetween(target.x-7,target.y+7,target.x+7,target.y-7);}}
    if(s.shieldReady){g.lineStyle(2,0x86e6b2,.9);g.strokeCircle(s.player.x,s.player.y,18);}
    for(const e of s.enemies) {
      const {x,y,radius:r}=e,color=e.kind==='chaser'?0xff765e:e.kind==='charger'?0xffab6b:e.kind==='medic'?0x86e6b2:e.kind==='shield'?0x9aabe0:e.boss?0xff4d6a:0xef86ba;
      if(e.phase==='spawn') {
        g.lineStyle(2,color,0.7);g.strokeCircle(x,y,r+9);
        g.lineBetween(x-5,y,x+5,y);g.lineBetween(x,y-5,x,y+5);
        g.lineStyle(3,color,1);g.beginPath();g.arc(x,y,r+9,-Math.PI/2,-Math.PI/2+Math.PI*2*(1-e.timer/90));g.strokePath();continue;
      }
      if(e.phase==='warn'||e.phase==='charge') {
        const length=Math.min(e.kind==='charger'?189:620,
          e.dx>0?(f.right-x)/e.dx:e.dx<0?(f.left-x)/e.dx:Infinity,
          e.dy>0?(f.bottom-y)/e.dy:e.dy<0?(f.top-y)/e.dy:Infinity);
        const endX=x+e.dx*length,endY=y+e.dy*length;
        g.lineStyle(e.phase==='charge'?4:2,color,e.phase==='charge'?0.8:0.5);
        if(e.phase==='warn') for(let t=0;t<1;t+=0.08)g.lineBetween(x+(endX-x)*t,y+(endY-y)*t,x+(endX-x)*Math.min(1,t+0.04),y+(endY-y)*Math.min(1,t+0.04));
        else g.lineBetween(x,y,endX,endY);
        if(e.phase==='warn'&&e.kind==='weaver'&&(e.skill??0)%2===0){
          const a=Math.atan2(e.dy,e.dx);g.lineStyle(2,color,.7);g.beginPath();g.arc(x,y,55,a+.6,a+Math.PI*2-.6);g.strokePath();g.lineStyle(3,C.blue,.9);g.lineBetween(x+e.dx*35,y+e.dy*35,x+e.dx*95,y+e.dy*95);
        }
        if(e.phase==='warn'&&(e.kind==='artillery'&&(e.skill??0)%2===0||e.kind==='shooter'&&s.worldTick>=21600)){
          const a=Math.atan2(e.dy,e.dx),half=e.kind==='artillery'?.44:.25;g.lineStyle(1,color,.45);for(const side of [-1,1])g.lineBetween(x,y,x+Math.cos(a+side*half)*170,y+Math.sin(a+side*half)*170);
        }
        g.lineStyle(2,C.ink,0.8);g.beginPath();g.arc(x,y,r+5,-Math.PI/2,-Math.PI/2+Math.PI*2*(1-e.timer/90));g.strokePath();
      }
      g.fillStyle(color,e.phase==='recover'?0.45:0.95);g.lineStyle(2,color,1);
      if(e.kind==='chaser') {g.fillTriangle(x,y-r,x+r,y+r*0.7,x-r,y+r*0.7);}
      if(e.kind==='charger') {g.fillRoundedRect(x-r,y-r,r*2,r*2,3);g.fillTriangle(x-r,y-r,x-r-5,y-r-6,x-3,y-r);g.fillTriangle(x+r,y-r,x+r+5,y-r-6,x+3,y-r);}
      if(e.kind==='shooter') {g.fillCircle(x,y,r);g.lineStyle(5,color,1);g.lineBetween(x,y,x+(e.dx||1)*(r+7),y+e.dy*(r+7));}
      if(!['chaser','charger','shooter'].includes(e.kind)){
       if(e.kind==='shield'){g.fillRoundedRect(x-r,y-r,r*2,r*2,4);g.lineStyle(4,C.ink,1);g.lineBetween(x+e.dx*r-e.dy*r,y+e.dy*r+e.dx*r,x+e.dx*r+e.dy*r,y+e.dy*r-e.dx*r);}
       else if(e.kind==='medic'){g.fillRect(x-r,y-4,r*2,8);g.fillRect(x-4,y-r,8,r*2);}
       else if(e.kind==='splitter'||e.kind==='larva'){g.fillCircle(x-r*.4,y,r*.7);g.fillCircle(x+r*.4,y,r*.7);}
       else {g.fillTriangle(x,y-r,x+r,y,x,y+r);g.fillTriangle(x,y-r,x-r,y,x,y+r);}
       if(e.boss){g.lineStyle(3,C.gold,1);g.strokeCircle(x,y,r+5);}
      }
      g.fillStyle(0x172238,1);g.fillCircle(x-4,y-2,2);g.fillCircle(x+4,y-2,2);
      if(e.elite) {g.lineStyle(2,C.gold,1);g.strokeCircle(x,y,r+4);g.fillStyle(C.gold,1);g.fillTriangle(x-6,y-r-7,x,y-r-13,x+6,y-r-7);}
      if(e.hp<e.maxHp) {g.fillStyle(0x0c1429,1);g.fillRect(x-r,y+r+5,r*2,3);g.fillStyle(color,1);g.fillRect(x-r,y+r+5,r*2*Math.max(0,e.hp/e.maxHp),3);}
    }
    const boss=s.enemies.find(e=>e.boss);
    if(boss){g.fillStyle(0x0c1429,.9);g.fillRect(300,88,360,8);g.fillStyle(C.red,1);g.fillRect(300,88,360*Math.max(0,boss.hp/boss.maxHp),8);}
    for(const b of s.shots) {
      if(b.x<f.left||b.x>f.right||b.y<f.top||b.y>f.bottom) continue;
      const angle=Math.atan2(b.vy,b.vx),length=s.mode==='borrow'?5:s.mode==='repay'?16:9;
      if(!settings.lowQuality) {g.lineStyle(5,C.gold,0.2);g.lineBetween(b.x-Math.cos(angle)*length,b.y-Math.sin(angle)*length,b.x,b.y);}
      g.lineStyle(3,b.kind==='lightning'?0xc9b9ff:C.gold,1);g.lineBetween(b.x-Math.cos(angle)*length,b.y-Math.sin(angle)*length,b.x,b.y);
      g.fillStyle(C.ink,1);g.fillCircle(b.x,b.y,3);
      if(s.mode==='borrow') {g.lineStyle(1,C.gold,0.8);g.strokeCircle(b.x,b.y,6);}
    }
    for(const fx of s.feedback) {
      const alpha=Math.min(1,(fx.until-s.tick)/15);if(alpha<=0)continue;
      const color=fx.type==='hurt'?C.red:fx.type==='chain'?0xc9b9ff:C.gold;
      g.lineStyle(2,color,alpha);
      if(fx.type==='chain'&&fx.from) g.lineBetween(fx.from.x,fx.from.y,fx.at.x,fx.at.y);
      else if(fx.type==='slash'){g.beginPath();g.arc(fx.at.x,fx.at.y,fx.radius,(fx.angle??0)-(fx.arc??1.2),(fx.angle??0)+(fx.arc??1.2));g.strokePath();}
      else if(fx.type==='thrust'){g.lineStyle(5,color,alpha);g.lineBetween(fx.at.x,fx.at.y,fx.at.x+Math.cos(fx.angle??0)*fx.radius,fx.at.y+Math.sin(fx.angle??0)*fx.radius);}
      else g.strokeCircle(fx.at.x,fx.at.y,fx.radius*(settings.reducedMotion?1:1.2-alpha*0.4));
    }
  }
  private drawTimeField(s:RunSnapshot, settings:Settings) {
    const t=this.timeVisual, g=this.pen, f=RULES.field;
    if(t.run!==s) Object.assign(t,{run:s,mode:s.mode,started:s.tick,tick:-1,origin:{...s.player},trail:[]});
    if(t.mode!==s.mode) Object.assign(t,{mode:s.mode,started:s.tick,origin:{...s.player},trail:[]});
    if(!s.alive||s.mode==='normal') { t.trail=[];return; }
    const age=(s.tick-t.started)/60, motion=!settings.reducedMotion;
    if(s.mode==='borrow') {
      if(!motion||settings.lowQuality) t.trail=[];
      else if(s.tick!==t.tick&&!s.paused) {
        t.trail=t.trail.filter(p=>s.tick-p.tick<18);
        const last=t.trail.at(-1);
        if(!last||s.tick-last.tick>=3&&Math.hypot(s.player.x-last.x,s.player.y-last.y)>4) t.trail.push({...s.player,tick:s.tick});
      }
      t.tick=s.tick;
      for(const p of t.trail) {
        const alpha=(1-(s.tick-p.tick)/18)*0.22;
        g.fillStyle(C.blue,alpha);g.fillCircle(p.x,p.y-11,5);
        g.lineStyle(5,C.blue,alpha);g.lineBetween(p.x,p.y-4,p.x,p.y+8);
        g.lineStyle(2,C.blue,alpha);g.lineBetween(p.x,p.y+7,p.x-4,p.y+14);g.lineBetween(p.x,p.y+7,p.x+4,p.y+14);
      }
      // Draw the freeze wave behind hazards and keep every segment inside the arena.
      if(motion&&age<0.4) {
        const radius=25+age/0.4*950, count=settings.lowQuality?32:64;
        g.lineStyle(5*(1-age/0.4)+1,C.ink,(1-age/0.4)*0.8);
        for(let i=0;i<count;i++) {
          const a=i/count*Math.PI*2,b=(i+1)/count*Math.PI*2;
          const x=t.origin.x+Math.cos(a)*radius,y=t.origin.y+Math.sin(a)*radius;
          const xx=t.origin.x+Math.cos(b)*radius,yy=t.origin.y+Math.sin(b)*radius;
          if(x>f.left&&x<f.right&&y>f.top&&y<f.bottom&&xx>f.left&&xx<f.right&&yy>f.top&&yy<f.bottom) g.lineBetween(x,y,xx,yy);
        }
      }
      g.lineStyle(2,C.blue,0.75);
      for(const [x,y,sx,sy] of [[f.left+4,f.top+4,1,1],[f.right-4,f.top+4,-1,1],[f.left+4,f.bottom-4,1,-1],[f.right-4,f.bottom-4,-1,-1]]) {
        g.lineBetween(x,y,x+sx*42,y);g.lineBetween(x,y,x,y+sy*36);
        g.lineBetween(x,y,x+sx*22,y+sy*18);g.lineBetween(x+sx*22,y+sy*18,x+sx*33,y+sy*16);
      }
    } else {
      const pulse=motion?(1+Math.sin(age*Math.PI*3.6))/2:0.5;
      g.lineStyle(3,C.red,0.55+pulse*0.3);g.strokeRoundedRect(f.left+2,f.top+2,f.right-f.left-4,f.bottom-f.top-4,10);
      g.fillStyle(C.red,0.08+pulse*0.08);
      g.fillRect(f.left,f.top,12,f.bottom-f.top);g.fillRect(f.right-12,f.top,12,f.bottom-f.top);
      if(motion&&!settings.lowQuality) for(let i=0;i<9;i++) {
        const offset=(s.worldTick*2+i*31)%70, y=f.top+18+i*32;
        g.lineStyle(2,C.red,0.45*(1-offset/90));
        g.lineBetween(f.left+offset,y,f.left+offset+15,y-5);
        g.lineBetween(f.right-offset,y,f.right-offset-15,y-5);
      }
    }
  }
  private drawRunner(s:RunSnapshot, settings:Settings) {
    const g=this.pen, p=s.player, runner=this.runner;
    if(runner.run!==s) Object.assign(runner,{run:s,tick:s.tick,x:p.x,y:p.y,phase:0,facing:'right',moving:false});
    if(runner.tick!==s.tick) {
      if(s.alive&&!s.paused) {
        const dx=p.x-runner.x, dy=p.y-runner.y, distance=Math.hypot(dx,dy);
        runner.moving=distance>0.01;
        // Use player travel, so borrowing and repayment never change the running speed.
        if(runner.moving) {
          runner.phase=(runner.phase+distance*0.16)%(Math.PI*2);
          // Keep the current axis near a diagonal so small joystick changes do not flicker the pose.
          const wasVertical=runner.facing==='up'||runner.facing==='down';
          const vertical=Math.abs(dy)>Math.abs(dx)*(wasVertical?0.9:1.1);
          runner.facing=vertical?(dy<0?'up':'down'):(dx<0?'left':'right');
        }
      }
      runner.tick=s.tick;
    }
    runner.x=p.x;runner.y=p.y;
    const stride=runner.moving?(settings.reducedMotion?0.6:Math.sin(runner.phase)):0;
    const bob=runner.moving&&!settings.reducedMotion?-Math.abs(Math.cos(runner.phase))*1.2:0;
    const face=runner.facing==='left'?-1:1, lean=runner.moving?2:0;
    const ink=s.alive?C.ink:C.red, shirt=s.alive?C.blue:C.red;
    const scarf=s.alive?(s.mode==='repay'?C.red:C.gold):C.red;
    const limb=(points:number[][],color:number,width=3.5)=>{
      g.lineStyle(width,color,1);g.beginPath();
      points.forEach(([x,y],i)=>{ if(i===0)g.moveTo(p.x+face*x,p.y+y+bob);else g.lineTo(p.x+face*x,p.y+y+bob); });g.strokePath();
      g.fillStyle(color,1);for(const [x,y] of points)g.fillCircle(p.x+face*x,p.y+y+bob,width/2);
    };
    g.fillStyle(0x080f25,0.45);g.fillEllipse(p.x,p.y+16,25,6);
    g.fillStyle(shirt,0.08);g.fillCircle(p.x,p.y,22);
    if(runner.facing==='up'||runner.facing==='down') {
      const back=runner.facing==='up';
      for(const side of [-1,1]) {
        const swing=stride*side, footX=side*(3+Math.abs(stride)), footY=14-swing*3;
        limb([[side*2,4],[side*3,9-swing*2],[footX,footY]],swing<0?0x557899:ink);
        limb([[footX,footY],[footX+side*2,footY]],shirt,3);
        limb([[side*4,-3],[side*7,1+swing*3],[side*7,-1+swing*5]],ink,3);
      }
      g.fillStyle(shirt,1);g.fillRoundedRect(p.x-5,p.y-5+bob,10,11,3);
      if(!back) { g.fillStyle(ink,1);g.fillCircle(p.x,p.y,2); }
      g.fillStyle(scarf,1);g.fillRoundedRect(p.x-5,p.y-6+bob,10,3,1);
      if(back) g.fillTriangle(p.x-2,p.y-4+bob,p.x+3+stride*2,p.y+5+bob,p.x+4,p.y-4+bob);
      else g.fillTriangle(p.x-4,p.y-5+bob,p.x-9-stride*2,p.y-7+bob,p.x-7,p.y+bob);
      const headY=p.y-11+bob;
      g.fillStyle(back?0x557899:ink,1);g.fillCircle(p.x,headY,5.5);
      g.lineStyle(2,shirt,1);g.lineBetween(p.x-4,headY-3,p.x+4,headY-3);
      if(!back) {
        g.fillStyle(C.field,1);g.fillCircle(p.x-2,headY,1);g.fillCircle(p.x+2,headY,1);
      }
      return;
    }
    for(const side of [-1,1]) {
      const swing=stride*side, foot=runner.moving?swing*9:side*4;
      const footY=14-(runner.moving?Math.max(0,-swing)*5:0);
      limb([[0,4],[swing*5+2,9],[foot,footY]],side===-1?0x557899:ink);
      limb([[foot,footY],[foot+3,footY]],side===-1?0x557899:shirt,3);
    }
    limb([[lean,-4],[-2+stride*5,1],[2+stride*7,-2]],0x557899,3);
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
