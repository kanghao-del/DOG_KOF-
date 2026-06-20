/* =========================================================================
   狗皇 · DOG KOF  —  a troll fighting game
   Single-file engine (no build step). Open index.html in a browser.
   Design rule: use the player's fighting-game instincts AGAINST them.
   ========================================================================= */
"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;
const GROUND = 470;
const WALL_L = 40, WALL_R = W - 40;
const FPS = 60;

/* ----------------------------- tiny SFX ------------------------------- */
const SFX = (() => {
  let ac = null;
  function ensure() { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); return ac; }
  function tone(freq, dur, type = "square", vol = 0.2, slideTo = null) {
    try {
      const a = ensure(); const o = a.createOscillator(); const g = a.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, a.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur);
      g.gain.setValueAtTime(vol, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
      o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + dur);
    } catch (e) {}
  }
  function noise(dur, vol = 0.3) {
    try {
      const a = ensure(); const n = a.sampleRate * dur;
      const buf = a.createBuffer(1, n, a.sampleRate); const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = a.createBufferSource(); s.buffer = buf;
      const g = a.createGain(); g.gain.value = vol; s.connect(g); g.connect(a.destination); s.start();
    } catch (e) {}
  }
  return {
    resume() { try { ensure().resume(); } catch (e) {} },
    light() { tone(420, 0.05, "square", 0.12); },
    heavy() { tone(180, 0.09, "sawtooth", 0.2, 90); noise(0.06, 0.18); },
    block() { tone(700, 0.05, "square", 0.1); noise(0.04, 0.1); },
    whiff() { tone(300, 0.06, "sine", 0.05, 600); },
    fireball() { tone(220, 0.25, "sawtooth", 0.18, 660); },
    dragon() { tone(150, 0.3, "square", 0.2, 880); },
    super() { tone(120, 0.6, "sawtooth", 0.25, 1200); },
    bark() { tone(520, 0.06, "square", 0.18, 200); setTimeout(() => tone(380, 0.08, "square", 0.16, 150), 70); },
    hurt() { tone(160, 0.12, "triangle", 0.18, 80); },
    ko() { tone(110, 0.5, "sawtooth", 0.3, 55); },
    horn() { tone(440, 0.12, "square", 0.2); setTimeout(() => tone(440, 0.12, "square", 0.2), 160); },
    troll() { tone(660, 0.08, "square", 0.15); setTimeout(() => tone(990, 0.08, "square", 0.15), 90); setTimeout(() => tone(1320, 0.12, "square", 0.15), 180); },
    laugh() { [0,1,2,3].forEach(i => setTimeout(() => tone(300 + i % 2 * 120, 0.07, "square", 0.12), i * 110)); },
  };
})();

/* --------------------------- input manager ---------------------------- */
const Keys = {};
const Pressed = {}; // edge-triggered, cleared each frame
const KEYMAP = {
  a: "left", arrowleft: "left", d: "right", arrowright: "right",
  w: "up", arrowup: "up", " ": "up",
  s: "down", arrowdown: "down",
  j: "lp", k: "hp", u: "lk", i: "hk", h: "throw", o: "super",
};
window.addEventListener("keydown", (e) => {
  const k = (e.key || "").toLowerCase();
  const m = KEYMAP[k];
  if (!m) return;
  e.preventDefault();
  if (!Keys[m]) Pressed[m] = true;
  Keys[m] = true;
});
window.addEventListener("keyup", (e) => {
  const m = KEYMAP[(e.key || "").toLowerCase()];
  if (m) Keys[m] = false;
});
// 窗口失焦时清空按键状态，避免切回窗口时误触发一次攻击
window.addEventListener("blur", () => {
  for (const k in Keys) Keys[k] = false;
  for (const k in Pressed) Pressed[k] = false;
});

/* ------------------------------ helpers ------------------------------- */
const rnd = (a, b) => a + Math.random() * (b - a);
const choice = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/* ------------------------------ moves --------------------------------- */
// frames at 60fps. reach measured forward from center.
const MOVES = {
  lp:    { startup: 3,  active: 3,  recovery: 7,  dmg: 4,  reach: 78,  hy: 96, hh: 26, kb: 3,  hs: 9,  bs: 7,  meter: 4,  sfx: "light", launch: 0 },
  hp:    { startup: 7,  active: 4,  recovery: 17, dmg: 9,  reach: 90,  hy: 100,hh: 34, kb: 7,  hs: 16, bs: 11, meter: 7,  sfx: "heavy", launch: 0 },
  lk:    { startup: 5,  active: 4,  recovery: 10, dmg: 5,  reach: 86,  hy: 60, hh: 30, kb: 4,  hs: 11, bs: 8,  meter: 4,  sfx: "light", launch: 0 },
  hk:    { startup: 11, active: 5,  recovery: 21, dmg: 12, reach: 100, hy: 70, hh: 40, kb: 11, hs: 18, bs: 12, meter: 8,  sfx: "heavy", launch: 5 },
  fireball: { startup: 9, active: 1, recovery: 26, dmg: 8, reach: 0, hy: 0, hh: 0, kb: 6, hs: 14, bs: 9, meter: 6, sfx: "fireball", proj: true },
  dragon:   { startup: 4, active: 10, recovery: 28, dmg: 14, reach: 70, hy: 40, hh: 150, kb: 8, hs: 22, bs: 13, meter: 8, sfx: "dragon", launch: 16, inv: true, rise: true },
  super:    { startup: 8, active: 14, recovery: 30, dmg: 28, reach: 220, hy: 30, hh: 170, kb: 16, hs: 30, bs: 18, meter: 0, sfx: "super", launch: 18, inv: true },
  throw:    { startup: 3, active: 2, recovery: 18, dmg: 12, reach: 56, hy: 90, hh: 60, kb: 12, hs: 30, bs: 0, meter: 5, sfx: "heavy", unblock: true, launch: 8 },
};

/* ---------------------------- projectile ------------------------------ */
class Projectile {
  constructor(x, y, dir, owner, opts = {}) {
    this.x = x; this.y = y; this.dir = dir; this.owner = owner;
    this.vx = (opts.speed || 8) * dir;
    this.dmg = opts.dmg || 8; this.kb = opts.kb || 6; this.hs = opts.hs || 14; this.bs = opts.bs || 9;
    this.r = opts.r || 18; this.dead = false; this.hit = false;
    this.color = opts.color || "#7fe0ff"; this.life = 180; this.super = !!opts.super;
  }
  get box() { return { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 }; }
  update() {
    this.x += this.vx; this.life--;
    if (this.x < WALL_L - 40 || this.x > WALL_R + 40 || this.life <= 0) this.dead = true;
  }
  draw() {
    const t = performance.now() / 60;
    ctx.save();
    ctx.translate(this.x, this.y);
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, this.r + 6);
    g.addColorStop(0, "#fff"); g.addColorStop(0.4, this.color); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, this.r + 6 + Math.sin(t) * 3, this.r + Math.cos(t) * 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/* ------------------------------ fighter ------------------------------- */
class Fighter {
  constructor(opts) {
    this.name = opts.name;
    this.isPlayer = !!opts.isPlayer;
    this.color = opts.color;
    this.x = opts.x; this.y = GROUND;
    this.vx = 0; this.vy = 0;
    this.w = 56; this.h = 140;
    this.facing = opts.facing; // 1 right, -1 left
    this.maxhp = 200; this.hp = 200;
    this.meter = 0;
    this.state = "idle";
    this.move = null; this.timer = 0; this.moveHit = false;
    this.stun = 0; this.grounded = true;
    this.blocking = false; this.flash = 0;
    this.dragonCount = 0; this.cursed = false;
    this.revivedOnce = false;
    this.dashCD = 0; this.lastTap = { left: -99, right: -99 };
    this.taunt = 0;        // fishing taunt timer
    this.combo = 0; this.comboTimer = 0;
    this.bubble = null; this.bubbleT = 0;
    this.bounced = false;   // has this launch already triggered a ground bounce
    this.autoUkemi = false; // AI flag: tech-roll on next landing
  }
  get back() { return -this.facing; } // direction "away" from opponent
  get bodyBox() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }
  get cx() { return this.x; }
  get cy() { return this.y - this.h / 2; }

  say(text, t = 70) { this.bubble = text; this.bubbleT = t; }

  hurtboxActive() {
    return this.state === "attack" && this.move && !this.move.proj &&
      this.timer >= this.move.startup && this.timer < this.move.startup + this.move.active;
  }
  attackBox() {
    const m = this.move;
    const front = this.facing > 0 ? this.x : this.x - m.reach;
    return { x: front, y: this.y - m.hy - m.hh, w: m.reach, h: m.hh + (m.rise ? 40 : 0) };
  }

  faceOpponent(op) { if (this.state === "idle" || this.state === "walk") this.facing = op.x >= this.x ? 1 : -1; }

  canAct() {
    return this.stun <= 0 && this.state !== "launched" && this.state !== "ko" &&
      this.state !== "attack";
  }

  startMove(name) {
    const m = MOVES[name];
    if (!m) return;
    // 超必杀真正发动时才扣气，避免硬直/被覆盖时白扣
    if (name === "super") {
      if (this.meter < 100) return;
      this.meter = 0;
    }
    // 升龙诅咒 — only the human player is cursed for spamming reversals.
    if (name === "dragon" && this.isPlayer) {
      this.dragonCount++;
      if (this.dragonCount % 4 === 0) { triggerDragonCurse(this); return; }
    }
    this.move = m; this.moveName = name; this.timer = 0; this.moveHit = false;
    this.state = "attack";
    if (this.grounded) this.vx = 0; // 地面出招时清掉水平速度，防止走路/冲刺滑进攻击
    if (m.rise) { this.vy = -7; this.grounded = false; }
    if (m.proj) { /* spawned during active */ }
    SFX[m.sfx] && SFX[m.sfx]();
  }

  hitBy(att, m, fromProjectile = false, attacker = null) {
    if (this.state === "ko") return;
    // invincible reversal frames
    if (this.move && this.move.inv && this.state === "attack" && this.timer < this.move.startup + 3) return;
    const awayHeld = (this.isPlayer ? playerHeld(this.back) : this.aiWantsBlock);
    const canBlock = awayHeld && this.state !== "attack" && this.state !== "launched" && this.grounded;
    const blocked = !m.unblock && (canBlock || this.blocking);
    if (blocked) {
      const dmg = Math.max(1, Math.round(m.dmg * 0.12));
      this.hp = Math.max(0, this.hp - dmg);
      this.stun = m.bs; this.state = "block"; this.blocking = true;
      this.vx = att.facing * 3; this.flash = 4;
      SFX.block(); spawnSpark(this.cx + this.facing * 20, this.cy, "#bff", 6);
      floaty(this.cx, this.y - this.h - 8, "GUARD", "#9cf", 18);
      this.combo = 0;
      return;
    }
    // clean hit
    const wasAir = !this.grounded || this.state === "launched";
    this.hp = Math.max(0, this.hp - m.dmg);
    this.stun = m.hs; this.flash = 6;
    this.vx = att.facing * m.kb;
    if (m.launch) { this.vy = -m.launch; this.grounded = false; this.state = "launched"; this.bounced = false; }
    else { this.state = "hurt"; }
    this.move = null;
    this.combo = 0; // 挨打后自己的连击数归零
    SFX.hurt();
    spawnSpark(this.cx, this.cy, this.color, 10);
    addShake(m.dmg * 0.4);
    addHitstop(m.dmg > 9 ? 6 : 3);
    // combo tracking on attacker
    if (attacker) {
      attacker.combo++; attacker.comboTimer = 45;
      if (attacker.combo >= 2) floaty(this.cx, this.y - this.h - 20, attacker.combo + " HIT!", "#ffd23f", 22);
    }
    if (this.hp <= 0) this.die();
  }

  die() {
    // 狗皇诈尸: once per match, just as you think you've won — it gets back up.
    if (!this.isPlayer && !this.revivedOnce && Math.random() < 0.7) {
      this.revivedOnce = true; this.hp = Math.round(this.maxhp * 0.18);
      this.stun = 20; this.flash = 8; this.vy = -6; this.grounded = false; this.move = null;
      banner("狗 皇 诈 尸", "#ff5a4c", 70); SFX.troll(); addShake(12);
      this.say(choice(["还没完呢", "你以为赢了？", "起来！", "刚才是假摔"]), 100);
      danmaku(choice(["诈尸了！！", "我就知道", "主播血压拉满", "这游戏有毒"]));
      return;
    }
    this.state = "ko"; this.vy = -8; this.vx = this.back * 4; this.grounded = false;
    SFX.ko();
  }

  applyIntent(cmd) {
    if (!this.canAct()) {
      // can still hold block direction while in blockstun handled elsewhere
      return;
    }
    this.blocking = false;
    // crouch
    const crouch = cmd.down && this.grounded;
    // movement
    if (this.grounded) {
      if (cmd.up) { this.vy = -15; this.grounded = false; this.state = "jump"; SFX.whiff(); }
      else if (cmd.left || cmd.right) {
        const dir = cmd.right ? 1 : -1;
        // block if holding away from opponent —— 仍可后撤步，不再被钉在原地
        if (dir === this.back && !cmd.attackThisFrame) {
          this.vx = dir * (cmd.dash ? 6 : 2.4);
          this.state = cmd.down ? "crouch" : "block";
          this.blocking = true;
        } else if (!cmd.attackThisFrame) {
          this.vx = dir * (cmd.dash ? 7.5 : 3.2);
          this.state = cmd.dash ? "dash" : "walk";
        }
      } else {
        this.vx *= 0.6; this.state = crouch ? "crouch" : "idle";
      }
    }
    // attacks
    if (cmd.special === "dragon") this.startMove("dragon");
    else if (cmd.special === "fireball") this.startMove("fireball");
    else if (cmd.super) this.startMove("super");
    else if (cmd.throw) this.startMove("throw");
    else if (cmd.hk) this.startMove("hk");
    else if (cmd.hp) this.startMove("hp");
    else if (cmd.lk) this.startMove("lk");
    else if (cmd.lp) this.startMove("lp");
  }

  update() {
    if (this.flash > 0) this.flash--;
    if (this.bubbleT > 0 && --this.bubbleT === 0) this.bubble = null;
    if (this.comboTimer > 0 && --this.comboTimer === 0) this.combo = 0;
    if (this.stun > 0) this.stun--;

    // 硬直结束后，从 hurt / block 状态恢复到 idle，否则 canAct 会一直挡住输入
    if (this.stun <= 0 && this.grounded && (this.state === "hurt" || this.state === "block")) {
      this.state = "idle";
      this.blocking = false;
    }

    // attack timeline
    if (this.state === "attack" && this.move) {
      this.timer++;
      const m = this.move;
      if (m.proj && this.timer === m.startup) {
        projectiles.push(new Projectile(
          this.x + this.facing * 50, this.y - 80, this.facing, this,
          { dmg: m.dmg, kb: m.kb, hs: m.hs, bs: m.bs, color: this.isPlayer ? "#7fe0ff" : "#ffcf6b" }
        ));
      }
      if (this.timer >= m.startup + m.active + m.recovery) {
        this.move = null; this.state = "idle";
      }
    }

    // physics
    this.vy += world.gravity;
    this.x += this.vx;
    this.y += this.vy;
    if (this.y >= GROUND) {
      const fallVy = this.vy;
      this.y = GROUND; this.vy = 0;
      // 地面弹反：被击飞落地时若冲击速度够大，弹起一次（每次launch只弹一次）
      if (this.state === "launched" && !this.bounced && fallVy > 6) {
        this.bounced = true;
        this.vy = -fallVy * 0.3;
        this.y = GROUND - 1;
        spawnSpark(this.cx, GROUND, "#ff9a3c", 7);
        SFX.block();
        // 不设 grounded=true，角色继续在空中
      } else {
        if (!this.grounded) {
          // 落地事件
          if (this.cursed) { this.cursed = false; this.stun = 90; this.hp = Math.max(0, this.hp - 15);
            addShake(14); floaty(this.cx, this.y - this.h - 20, "活该", "#ff6b6b", 26); SFX.laugh(); }
          if (this.state === "launched") {
            // 受身：落地瞬间持有方向键则翻滚减硬直
            const ukemiDir = this.isPlayer
              ? (Keys.left ? -1 : Keys.right ? 1 : 0)
              : (this.autoUkemi ? (Math.random() < 0.5 ? 1 : -1) : 0);
            if (ukemiDir) {
              this.vx = ukemiDir * 4.5; this.stun = 8;
              floaty(this.cx, this.y - this.h - 10,
                this.isPlayer ? "受身！" : "受身",
                this.isPlayer ? "#7fe0ff" : "#ffb14c", 20);
              SFX.whiff();
            } else {
              this.stun = Math.max(this.stun, 22); // 硬着地
            }
            this.autoUkemi = false;
            this.state = "idle";
          } else if (this.state === "jump" || this.state === "ko") {
            if (this.state !== "ko") this.state = "idle";
          }
        }
        this.grounded = true;
      }
    } else this.grounded = false;

    // friction & walls
    if (this.grounded) this.vx *= 0.7;
    this.x = clamp(this.x, WALL_L + this.w / 2, WALL_R - this.w / 2);

    if (this.state === "dash" && this.dashCD > 0) this.dashCD--;
  }
}

function playerHeld(dir) {
  // dir is -1 (left) or 1 (right) in world space; account for control invert
  let left = Keys.left, right = Keys.right;
  if (troll.invert) { const t = left; left = right; right = t; }
  return dir < 0 ? left : right;
}

/* --------------------- dragon curse (signature troll) ----------------- */
function triggerDragonCurse(f) {
  f.cursed = true; f.vy = -34; f.grounded = false; f.state = "launched";
  f.move = null; f.stun = 6;
  stats.curses++;
  banner("升 龙 诅 咒", "#ff5a4c", 70);
  floaty(f.cx, f.y - f.h, "第四次升龙 = 飞出地图", "#ffd23f", 50);
  SFX.troll(); addShake(10);
  dog.say(choice(["你的升龙我背下来了", "就知道你要按", "升龙真好玩对吧？", "再按一个试试"]), 90);
  danmaku(choice(["哈哈哈哈飞了", "升龙诅咒经典", "主播破防", "这也行？？", "我不玩了"]));
}

/* ------------------------------ AI ------------------------------------ */
// 狗皇: bait, fake-out, fish, and learn the player's habits.
class DogAI {
  constructor(self, foe) {
    this.self = self; this.foe = foe;
    this.timer = 0; this.action = null; this.actTime = 0;
    this.aiWantsBlock = false; this.holdBlock = 0;
    this.moveCounts = {}; this.jumpReads = 0;
    this.aggro = 0.5; this.level = 1; // bumped between rounds
    this.feint = 0;
  }
  observe(cmd) {
    // learn what the human spams
    for (const k of ["lp", "hp", "lk", "hk", "throw"]) if (cmd[k]) this.moveCounts[k] = (this.moveCounts[k] || 0) + 1;
    if (cmd.special) this.moveCounts[cmd.special] = (this.moveCounts[cmd.special] || 0) + 1;
  }
  favorite() {
    let best = null, n = 0;
    for (const k in this.moveCounts) if (this.moveCounts[k] > n) { n = this.moveCounts[k]; best = k; }
    return { move: best, count: n };
  }
  think() {
    const s = this.self, f = this.foe;
    const cmd = { left: false, right: false, up: false, down: false };
    s.aiWantsBlock = false;
    if (s.state === "ko" || s.stun > 0 || s.cursed) return cmd;

    // AI 受身：下落阶段且接近地面时，按概率开启 autoUkemi
    if (s.state === "launched" && s.vy > 3 && s.y > GROUND - 80) {
      if (!s.autoUkemi) s.autoUkemi = Math.random() < 0.28 * this.level;
    }

    if (!s.canAct()) return cmd;

    const dist = Math.abs(f.x - s.x);
    s.facing = f.x >= s.x ? 1 : -1;
    const towardFoe = f.x >= s.x ? 1 : -1;

    // ----- reactive defense / reads -----
    const fav = this.favorite();
    const reactChance = 0.35 + this.level * 0.18;

    // anti-air read
    if (!f.grounded && f.vy < 0 && dist < 150 && Math.random() < 0.5 + this.level * 0.15) {
      s.startMove("dragon"); this.actTime = 0;
      if (Math.random() < 0.4) s.say(choice(["跳？读到了", "空中挨打吧", "这跳我见过八百次了"]), 55);
      return cmd;
    }
    // block read: foe entering attack startup in range
    if (f.state === "attack" && f.timer <= (f.move ? f.move.startup : 4) && dist < 150) {
      if (Math.random() < reactChance) {
        s.aiWantsBlock = true; this.holdBlock = 12;
        cmd[towardFoe > 0 ? "left" : "right"] = true;
        if (fav.move && this.moveCounts[fav.move] > 12 && Math.random() < 0.5)
          s.say(choice(["又是这招", "这招我背烂了", "可以换一个吗"]), 45);
        return cmd;
      }
    }
    if (this.holdBlock > 0) {
      this.holdBlock--;
      s.aiWantsBlock = true;
      cmd[towardFoe > 0 ? "left" : "right"] = true;
      // 格挡结束后追打一拳
      if (this.holdBlock === 0 && dist < 130) {
        s.startMove(Math.random() < 0.5 ? "lp" : "lk");
      }
      return cmd;
    }

    // ----- timed decisions -----
    this.actTime--;
    if (this.actTime > 0) {
      if (this.action === "approach") cmd[towardFoe > 0 ? "right" : "left"] = true;
      else if (this.action === "retreat") cmd[towardFoe > 0 ? "left" : "right"] = true;
      else if (this.action === "feint_punish") {
        cmd[towardFoe > 0 ? "left" : "right"] = true; // 退步
        if (this.actTime <= 3 && dist < 120) {
          // 假动作时间到：突然反扑（投技或轻拳）
          s.startMove(Math.random() < 0.55 ? "throw" : "lp");
          this.action = null;
        }
      }
      else if (this.action === "fish") { s.taunt = 8; }
      return cmd;
    }

    // pick a new action
    const r = Math.random();
    if (dist > 360) {
      if (r < 0.45 + this.level * 0.1) { s.startMove("fireball"); }
      else { this.action = "approach"; this.actTime = rnd(20, 40); cmd[towardFoe > 0 ? "right" : "left"] = true; }
    } else if (dist > 150) {
      if (r < 0.2) { s.startMove("fireball"); }
      else if (r < 0.35 && this.level >= 2) {
        this.action = "fish"; this.actTime = rnd(25, 45);
        s.say(choice(["来啊", "打我啊", "站桩给你打", "怎么不来", "打不到对吧"]), 45); s.taunt = 8;
      }
      else if (r < 0.7) { this.action = "approach"; this.actTime = rnd(16, 32); cmd[towardFoe > 0 ? "right" : "left"] = true; }
      else { this.action = "retreat"; this.actTime = rnd(10, 20); cmd[towardFoe > 0 ? "left" : "right"] = true; }
    } else {
      // 近距离——多层假动作与混乱压制
      if (r < 0.17 && this.level >= 1) {
        // feint_punish：退步骗升龙，等窗口再反扑
        this.action = "feint_punish"; this.actTime = 14;
        cmd[towardFoe > 0 ? "left" : "right"] = true;
        if (Math.random() < 0.5) s.say(choice(["假动作", "来嘛来按升龙", "看好了——", "我退了你怎么办"]), 55);
      }
      else if (r < 0.32) { s.startMove("throw"); }
      else if (r < 0.50) { s.startMove("lk"); }
      else if (r < 0.65) { s.startMove("lp"); }
      else if (r < 0.79) { s.startMove("hp"); }
      else if (r < 0.89) { s.startMove("dragon"); }
      else { this.action = "retreat"; this.actTime = rnd(8, 16); cmd[towardFoe > 0 ? "left" : "right"] = true; }
      this.actTime = Math.max(this.actTime, 8);
    }
    return cmd;
  }
}

/* --------------------------- stage hazards ---------------------------- */
// The scene is the third fighter.
class Scooter {
  constructor() {
    this.dir = Math.random() < 0.5 ? 1 : -1;
    this.x = this.dir > 0 ? WALL_L - 80 : WALL_R + 80;
    this.y = GROUND; this.speed = 10 * this.dir; this.dead = false; this.warn = 40; this.hits = new Set();
  }
  get box() { return { x: this.x - 50, y: this.y - 60, w: 100, h: 60 }; }
  update() {
    if (this.warn > 0) { this.warn--; return; }
    this.x += this.speed;
    if (this.x < WALL_L - 120 || this.x > WALL_R + 120) this.dead = true;
    for (const fr of [player, dog]) {
      if (!this.hits.has(fr) && fr.state !== "ko" && aabb(this.box, fr.bodyBox)) {
        this.hits.add(fr);
        fr.hp = Math.max(0, fr.hp - 14); fr.vx = this.dir * 14; fr.vy = -10; fr.grounded = false;
        fr.state = "launched"; fr.stun = 24; fr.flash = 6;
        SFX.horn(); addShake(10); spawnSpark(fr.cx, fr.cy, "#ff0", 12);
        if (fr.hp <= 0) fr.die();
        floaty(fr.cx, fr.y - fr.h, "外卖到了", "#ffd23f", 28);
      }
    }
  }
  draw() {
    if (this.warn > 0) {
      const x = this.dir > 0 ? WALL_L + 30 : WALL_R - 30;
      ctx.save(); ctx.globalAlpha = 0.5 + Math.sin(performance.now() / 60) * 0.4;
      ctx.fillStyle = "#ff0"; ctx.font = "bold 40px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(this.dir > 0 ? "外卖→" : "←外卖", x, GROUND - 120); ctx.restore();
      return;
    }
    ctx.save(); ctx.translate(this.x, this.y); ctx.scale(this.dir, 1);
    // scooter body
    ctx.fillStyle = "#ffd23f"; ctx.fillRect(-44, -46, 70, 26);
    ctx.fillStyle = "#333"; ctx.fillRect(-30, -20, 18, 18); ctx.fillRect(10, -20, 18, 18);
    ctx.beginPath(); ctx.arc(-21, -2, 12, 0, 7); ctx.arc(19, -2, 12, 0, 7); ctx.fill();
    // rider (外卖员)
    ctx.fillStyle = "#1e9eff"; ctx.fillRect(-12, -86, 22, 40);
    ctx.fillStyle = "#ffcf9c"; ctx.beginPath(); ctx.arc(0, -92, 11, 0, 7); ctx.fill();
    ctx.fillStyle = "#1e9eff"; ctx.fillRect(-6, -100, 14, 10); // helmet
    ctx.restore();
  }
}

class FallingObject {
  constructor() {
    this.x = rnd(WALL_L + 80, WALL_R - 80); this.y = -40; this.vy = 0; this.dead = false; this.done = false;
    this.kind = choice(["秋裤", "板砖", "广场舞音响", "外卖", "键盘"]);
  }
  get box() { return { x: this.x - 24, y: this.y - 24, w: 48, h: 48 }; }
  update() {
    if (this.done) { this.life = (this.life || 20) - 1; if (this.life <= 0) this.dead = true; return; }
    this.vy += 0.9; this.y += this.vy;
    for (const fr of [player, dog]) {
      if (fr.state !== "ko" && aabb(this.box, fr.bodyBox)) {
        fr.hp = Math.max(0, fr.hp - 8); fr.vy = -7; fr.grounded = false; fr.state = "launched"; fr.stun = 18; fr.flash = 5;
        SFX.heavy(); addShake(7); spawnSpark(this.x, this.y, "#aaa", 10);
        floaty(fr.cx, fr.y - fr.h, this.kind + "！", "#fff", 24);
        if (fr.hp <= 0) fr.die();
        this.done = true; return;
      }
    }
    if (this.y >= GROUND) { this.y = GROUND; this.done = true; spawnSpark(this.x, GROUND, "#aaa", 8); SFX.heavy(); }
  }
  draw() {
    ctx.save(); ctx.translate(this.x, this.y);
    ctx.fillStyle = "#caa"; ctx.fillRect(-22, -22, 44, 44);
    ctx.fillStyle = "#000"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(this.kind, 0, 5); ctx.restore();
  }
}

/* --------------------------- troll manager ---------------------------- */
// random cognitive-backstab events that mess with player expectations.
const troll = {
  invert: false, invertT: 0,
  swapBars: false, swapT: 0,
  flip: false, flipT: 0,
  nextEvent: 360,
  curseCount: 0,
  tick() {
    if (this.invertT > 0 && --this.invertT === 0) { this.invert = false; banner("操作恢复", "#9cf", 30); }
    if (this.swapT > 0 && --this.swapT === 0) this.swapBars = false;
    if (this.flipT > 0 && --this.flipT === 0) this.flip = false;
    if (state !== "fight") return;
    if (--this.nextEvent <= 0) { this.fire(); this.nextEvent = rnd(420, 720); }
  },
  fire() {
    const events = [
      () => { this.invert = true; this.invertT = 260; banner("操作反转", "#ff5a4c", 50); SFX.troll(); danmaku("左右反了哈哈"); },
      () => { hazards.push(new Scooter()); danmaku(choice(["车来了！", "注意外卖", "送的什么餐"])); },
      () => { for (let i = 0; i < 3; i++) setTimeout(() => hazards.push(new FallingObject()), i * 350); danmaku("天降正义"); },
      () => { this.swapBars = true; this.swapT = 300; banner("血条对调", "#ffd23f", 50); SFX.troll(); danmaku("血条换了？？"); },
      () => { world.gravity = 0.35; setTimeout(() => world.gravity = 0.9, 5000); banner("月球重力", "#9cf", 50); SFX.troll(); danmaku("起飞咯"); },
      () => { this.flip = true; this.flipT = 200; banner("镜 像 世 界", "#c77dff", 50); SFX.troll(); danmaku("我头晕"); },
      () => { dog.say(choice(["其实我让着你", "认真你就输了", "看好了——假动作", "下一招我不告诉你"]), 90); danmaku("狗皇嘴硬"); },
    ];
    choice(events)();
  },
  reset() { this.invert = this.swapBars = this.flip = false; this.invertT = this.swapT = this.flipT = 0; this.nextEvent = rnd(360, 540); },
};

/* ---------------------- particles / fx / banners ---------------------- */
const particles = [];
function spawnSpark(x, y, color, n) {
  for (let i = 0; i < n; i++) particles.push({ x, y, vx: rnd(-4, 4), vy: rnd(-5, 1), life: rnd(12, 24), color, r: rnd(2, 5) });
}
const floats = [];
function floaty(x, y, text, color, size) { floats.push({ x, y, text, color, size, life: 50, vy: -0.8 }); }

let shake = 0; function addShake(v) { shake = Math.min(24, shake + v); }
let hitstop = 0; function addHitstop(v) { hitstop = Math.max(hitstop, v); }

const danmakus = [];
function danmaku(text) { danmakus.push({ x: W + 20, y: rnd(40, 180), text, color: choice(["#fff", "#ffd23f", "#7fe0ff", "#ff9cf0"]), speed: rnd(2.5, 4) }); }

let bannerText = "", bannerColor = "#fff", bannerT = 0;
function banner(text, color, t) { bannerText = text; bannerColor = color; bannerT = t; }

/* ------------------------------ world --------------------------------- */
const world = { gravity: 0.9 };
const projectiles = [];
const hazards = [];

let player, dog, ai;
let state = "menu"; // menu | intro | fight | roundend | matchend
let roundTimer = 60 * FPS;
let round = 1, pWins = 0, dWins = 0;
let introT = 0, roundEndT = 0;
let stats = { curses: 0, jumps: 0, hits: 0, blocks: 0 };

function newFighters() {
  player = new Fighter({ name: "打工人", isPlayer: true, color: "#4cd2ff", x: 280, facing: 1 });
  dog = new Fighter({ name: "狗皇", isPlayer: false, color: "#ffb14c", x: 680, facing: -1 });
  dog.maxhp = 220; dog.hp = 220; dog.revivedOnce = false;
  ai = new DogAI(dog, player);
}

function startMatch() {
  round = 1; pWins = 0; dWins = 0;
  stats = { curses: 0, jumps: 0, hits: 0, blocks: 0 };
  newFighters(); troll.reset();
  startRound();
  document.getElementById("startScreen").classList.add("hidden");
  document.getElementById("endScreen").classList.add("hidden");
}

function startRound() {
  player.x = 280; player.hp = player.maxhp; player.state = "idle"; player.vx = player.vy = 0; player.stun = 0; player.move = null; player.dragonCount = 0; player.cursed = false; player.facing = 1;
  dog.x = 680; dog.hp = dog.maxhp; dog.state = "idle"; dog.vx = dog.vy = 0; dog.stun = 0; dog.move = null; dog.facing = -1;
  ai.level = round; ai.aggro = 0.4 + round * 0.15; ai.moveCounts = {};
  projectiles.length = 0; hazards.length = 0;
  roundTimer = 60 * FPS;
  world.gravity = 0.9; troll.reset();
  state = "intro"; introT = 150;
  // fake round troll on round 2+
  if (round >= 2 && Math.random() < 0.6) {
    banner("ROUND " + round, "#fff", 60);
    setTimeout(() => banner("假 的", "#ff5a4c", 40), 700);
    setTimeout(() => { banner("ROUND " + round, "#ffd23f", 50); SFX.troll(); }, 1200);
  } else banner("ROUND " + round, "#fff", 90);
  SFX.bark();
}

/* ---------------- special-move motion detection (player) -------------- */
const dirHistory = []; // {dir:'f'/'b'/'d'/'u'/'n', t}
let frameCount = 0;
function recordDir() {
  let left = Keys.left, right = Keys.right;
  if (troll.invert) { const t = left; left = right; right = t; }
  const towardRight = player.facing > 0;
  const fwd = towardRight ? right : left;
  const back = towardRight ? left : right;
  let h = fwd ? "f" : (back ? "b" : "n");
  let v = Keys.down ? "d" : (Keys.up ? "u" : "n");
  const token = v === "d" ? (h === "f" ? "df" : "d") : h;
  const last = dirHistory[dirHistory.length - 1];
  if (!last || last.dir !== token) dirHistory.push({ dir: token, t: frameCount });
  while (dirHistory.length && frameCount - dirHistory[0].t > 30) dirHistory.shift();
}
function hasMotion(seq, window = 18) {
  // seq like ['f','d','f'] ; allow 'df' to satisfy 'd' or 'f'
  let idx = 0;
  for (let i = 0; i < dirHistory.length; i++) {
    if (frameCount - dirHistory[i].t > window) continue;
    const d = dirHistory[i].dir;
    const need = seq[idx];
    const ok = d === need || (d === "df" && (need === "d" || need === "f"));
    if (ok) { idx++; if (idx >= seq.length) return true; }
  }
  return false;
}
function detectSpecial() {
  // dragon (DP): f, d, f  — check first (more specific)
  if (hasMotion(["f", "d", "f"], 20)) return "dragon";
  if (hasMotion(["d", "f"], 16)) return "fireball";
  return null;
}

/* ------------------------- per-frame command -------------------------- */
function buildPlayerCmd() {
  let left = Keys.left, right = Keys.right;
  if (troll.invert) { const t = left; left = right; right = t; }
  // dash via double-tap
  let dash = false;
  for (const d of ["left", "right"]) {
    const held = d === "left" ? left : right;
    if (Pressed[troll.invert ? (d === "left" ? "right" : "left") : d]) {
      if (frameCount - player.lastTap[d] < 14) dash = true;
      player.lastTap[d] = frameCount;
    }
  }
  const wantSpecial = (Pressed.lp || Pressed.hp || Pressed.lk || Pressed.hk) ? detectSpecial() : null;
  // dragon needs a strong button (hp/hk), fireball any punch — keep lenient
  let special = null;
  if (wantSpecial === "dragon" && (Pressed.hp || Pressed.hk || Pressed.lp)) special = "dragon";
  else if (wantSpecial === "fireball" && (Pressed.lp || Pressed.hp)) special = "fireball";

  const cmd = {
    left, right, up: Keys.up, down: Keys.down, dash,
    lp: Pressed.lp && !special, hp: Pressed.hp && !special,
    lk: Pressed.lk, hk: Pressed.hk && special !== "dragon",
    throw: Pressed.throw,
    super: Pressed.super && player.meter >= 100,
    special,
    attackThisFrame: !!(Pressed.lp || Pressed.hp || Pressed.lk || Pressed.hk || Pressed.throw || Pressed.super),
  };
  // stats
  if (Pressed.up) stats.jumps++;
  return cmd;
}

/* --------------------------- hit resolution --------------------------- */
function resolveHits() {
  const pairs = [[player, dog], [dog, player]];
  for (const [att, def] of pairs) {
    if (att.hurtboxActive() && !att.moveHit) {
      if (aabb(att.attackBox(), def.bodyBox)) {
        const reach = Math.abs(att.x - def.x);
        if (att.moveName === "throw" && reach > MOVES.throw.reach + 20) continue;
        att.moveHit = true;
        const before = def.hp;
        def.hitBy(att, att.move, false, att);
        // meter gain
        att.meter = clamp(att.meter + att.move.meter, 0, 100);
        def.meter = clamp(def.meter + 2, 0, 100);
        if (att.isPlayer) {
          if (def.state === "block") stats.blocks++;
          else if (def.hp < before) stats.hits++;
        }
        // dog learns
        if (def === dog && att.isPlayer) { /* nothing */ }
      }
    }
  }
  // projectiles
  for (const p of projectiles) {
    if (p.dead || p.hit) continue;
    const target = p.owner === player ? dog : player;
    if (target.state !== "ko" && aabb(p.box, target.bodyBox)) {
      p.hit = true; p.dead = true;
      const m = { dmg: p.dmg, kb: p.kb, hs: p.hs, bs: p.bs };
      target.hitBy({ facing: p.dir }, m, true, p.owner);
      p.owner.meter = clamp(p.owner.meter + 5, 0, 100);
    }
  }
}

/* ------------------------------ update -------------------------------- */
function update() {
  frameCount++;
  troll.tick();
  if (bannerT > 0) bannerT--;

  // particles always update (even during hitstop) for snappy feel
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.3; if (--p.life <= 0) particles.splice(i, 1);
  }
  for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.y += f.vy; if (--f.life <= 0) floats.splice(i, 1); }
  for (let i = danmakus.length - 1; i >= 0; i--) { const d = danmakus[i]; d.x -= d.speed; if (d.x < -200) danmakus.splice(i, 1); }
  if (shake > 0) shake *= 0.85;

  if (hitstop > 0) { hitstop--; return; }

  if (state === "intro") {
    player.faceOpponent(dog); dog.faceOpponent(player);
    if (--introT <= 0) { state = "fight"; banner("FIGHT!", "#ffd23f", 50); SFX.bark(); }
    return;
  }
  if (state === "roundend") {
    player.update(); dog.update();
    if (--roundEndT <= 0) {
      if (pWins >= 2 || dWins >= 2) endMatch();
      else { round++; startRound(); }
    }
    return;
  }
  if (state !== "fight") return;

  // round timer
  if (--roundTimer <= 0) { judgeByHealth(); }

  // commands
  recordDir();
  const pcmd = buildPlayerCmd();
  player.faceOpponent(dog);
  player.applyIntent(pcmd);

  const acmd = ai.think();
  ai.observe(pcmd);
  // map ai movement command to intent
  dog.applyIntent({
    left: acmd.left, right: acmd.right, up: acmd.up, down: acmd.down,
    lp: false, hp: false, lk: false, hk: false, throw: false, special: null,
    attackThisFrame: false,
  });

  player.update(); dog.update();
  for (const p of projectiles) p.update();
  for (const h of hazards) h.update();
  for (let i = projectiles.length - 1; i >= 0; i--) if (projectiles[i].dead) projectiles.splice(i, 1);
  for (let i = hazards.length - 1; i >= 0; i--) if (hazards[i].dead) hazards.splice(i, 1);

  resolveHits();

  // taunt decay
  if (dog.taunt > 0) dog.taunt--;
  if (player.taunt > 0) player.taunt--;

  // KO check
  if (player.hp <= 0 || dog.hp <= 0) maybeEndRound();
}

function maybeEndRound() {
  if (state !== "fight") return;
  if (player.hp <= 0 && dog.hp <= 0) finishRound(null);
  else if (dog.hp <= 0) finishRound(player);
  else if (player.hp <= 0) finishRound(dog);
}
function judgeByHealth() {
  if (player.hp > dog.hp) finishRound(player);
  else if (dog.hp > player.hp) finishRound(dog);
  else finishRound(null);
}
function finishRound(winner) {
  state = "roundend"; roundEndT = 150;
  if (winner === player) { pWins++; banner("K.O.", "#4cd2ff", 120); danmaku(choice(["主播牛逼", "赢了一把", "运气好"])); }
  else if (winner === dog) { dWins++; banner("狗皇胜", "#ff5a4c", 120); dog.say(choice(["菜", "就这？", "回去练练", "下一个"]), 120); danmaku(choice(["哈哈哈输了", "狗皇赢", "再来！", "破防了吧"])); }
  else { banner("DOUBLE K.O.", "#ffd23f", 120); }
  SFX.ko();
}
function endMatch() {
  state = "matchend";
  const won = pWins > dWins;
  document.getElementById("endTitle").textContent = won ? "你赢了？！" : "狗 皇 胜";
  document.getElementById("endTitle").style.color = won ? "#4cd2ff" : "#ff5a4c";
  document.getElementById("endSub").textContent = won
    ? "你居然打赢了狗皇。它说它让着你。"
    : choice(["再来一把？我知道你不服。", "你越懂格斗，死得越惨。", "升龙诅咒了解一下。"]);
  document.getElementById("statline").textContent =
    `比分  你 ${pWins} : ${dWins} 狗皇\n升龙诅咒触发  ${stats.curses} 次\n你按了 ${stats.jumps} 次跳\n命中  ${stats.hits}  ·  被招架 ${stats.blocks}`;
  document.getElementById("endScreen").classList.remove("hidden");
}

/* ------------------------------ render -------------------------------- */
function drawBackground() {
  // sky
  const g = ctx.createLinearGradient(0, 0, 0, GROUND);
  g.addColorStop(0, "#2a1a4a"); g.addColorStop(1, "#6a3a6a");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND);
  // city silhouette
  ctx.fillStyle = "#1a1030";
  for (let i = 0; i < 14; i++) {
    const bx = i * 75, bh = 60 + ((i * 53) % 120);
    ctx.fillRect(bx, GROUND - bh, 60, bh);
    ctx.fillStyle = "#ffd23f22";
    for (let wy = GROUND - bh + 10; wy < GROUND - 10; wy += 18)
      for (let wx = bx + 8; wx < bx + 52; wx += 16) if ((wx + wy + i) % 3 === 0) ctx.fillRect(wx, wy, 6, 8);
    ctx.fillStyle = "#1a1030";
  }
  // crowd
  ctx.fillStyle = "#0d0820";
  ctx.fillRect(0, GROUND - 26, W, 26);
  for (let i = 0; i < 40; i++) {
    const hx = (i * 27 + (frameCount * 0.2 % 27)) % W;
    const bob = Math.sin(frameCount / 12 + i) * 2;
    ctx.beginPath(); ctx.arc(hx, GROUND - 18 + bob, 6, 0, 7); ctx.fill();
  }
  // floor
  const fg = ctx.createLinearGradient(0, GROUND, 0, H);
  fg.addColorStop(0, "#3a2a20"); fg.addColorStop(1, "#1a120c");
  ctx.fillStyle = fg; ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.strokeStyle = "#00000040";
  for (let x = -((frameCount) % 60); x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, GROUND); ctx.lineTo(x - 30, H); ctx.stroke(); }
}

function poseFor(f) {
  // 缓动函数：ease-in-out
  const ease = t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  const c01 = t => Math.max(0, Math.min(1, t));

  let armX = 0, armY = 0;          // 主攻击臂（前臂）XY 偏移
  let legX = 0, legY = 0;          // 前腿 XY 偏移
  let crouch = 0;                   // 蹲伏高度
  let bodyRot = 0;                  // 身体旋转（弧度），正值=前倾
  let guardX = -12, guardY = 0;    // 防守臂（后臂）端点偏移
  let bothArms = false;             // 双臂出招（波动拳/超必杀/投技）

  if (f.state === "crouch") { crouch = 26; }

  if (!f.grounded && (f.state === "jump" || f.state === "launched")) {
    // 空中：腿收起，双臂平衡
    legX = -6; legY = -16; armX = 8; armY = -8; guardX = -6; guardY = -8;
  }

  if (f.state === "hurt") {
    // 受击后仰：手臂飞起、身体后倾
    const t = c01(f.stun / 16);
    armX = 8 * t; armY = -14 * t; guardX = 2; guardY = -10 * t; bodyRot = 0.09 * t;
  }

  if (f.state === "block" || (f.state === "crouch" && f.blocking)) {
    // 格挡或蹲防时双臂收拢护面
    armX = -14; armY = -10; guardX = -4; guardY = -8; bodyRot = -0.06;
  }

  if (f.state === "walk") {
    // 走路：腿脚摆动、手臂对应反摆
    const s = Math.sin(frameCount * 0.28);
    legX = s * 11; armX = -s * 5;
  }

  if (f.state === "dash") {
    // 冲刺：大幅前倾，腿蹬出
    legX = 20; bodyRot = 0.13; armX = 12;
  }

  if (f.state === "attack" && f.move) {
    const inS = f.timer < f.move.startup;
    const inA = !inS && f.timer < f.move.startup + f.move.active;
    // 各阶段进度 0→1
    const su = f.move.startup > 0 ? c01(f.timer / f.move.startup) : 1;
    const re = f.move.recovery > 0 ? c01((f.timer - f.move.startup - f.move.active) / f.move.recovery) : 0;
    const eSu = ease(su), eRe = ease(re);

    switch (f.moveName) {
      case "lp": // 快刺拳：简短蓄力→快速伸出→收回
        if (inS)      { armX = -6 * eSu; bodyRot = -0.04 * eSu; }
        else if (inA) { armX = f.move.reach * 0.76; armY = 2; bodyRot = 0.05; }
        else          { armX = f.move.reach * 0.76 * (1 - eRe); bodyRot = 0.05 * (1 - eRe); }
        break;

      case "hp": // 勾拳：大幅后摆蓄力→前冲甩臂→前倾
        if (inS)      { armX = -22 * eSu; armY = 8 * eSu; bodyRot = -0.15 * eSu; }
        else if (inA) { armX = f.move.reach * 0.84; armY = -4; bodyRot = 0.17; }
        else          { armX = f.move.reach * 0.84 * (1 - eRe); armY = -4 * (1 - eRe); bodyRot = 0.17 * (1 - eRe); }
        break;

      case "lk": // 前踢：腿微撤蓄力→踢出→收腿
        if (inS)      { legX = -8 * eSu; bodyRot = -0.04 * eSu; }
        else if (inA) { legX = f.move.reach * 0.74; legY = -8; bodyRot = 0.06; armX = -6; }
        else          { legX = f.move.reach * 0.74 * (1 - eRe); legY = -8 * (1 - eRe); bodyRot = 0.06 * (1 - eRe); }
        break;

      case "hk": // 回旋踢：大幅蓄力→高踢→落地重心转移
        if (inS)      { legX = -12 * eSu; bodyRot = -0.13 * eSu; armX = 8 * eSu; }
        else if (inA) { legX = f.move.reach * 0.86; legY = -30; bodyRot = 0.16; armX = -8; armY = -8; }
        else          { legX = f.move.reach * 0.86 * (1 - eRe); legY = -30 * (1 - eRe); bodyRot = 0.16 * (1 - eRe); }
        break;

      case "dragon": // 升龙：蓄力低姿→猛然拔地而起，手臂斜向上
        if (inS)      { armX = 14 * eSu; armY = 8 * eSu; bodyRot = 0.08 * eSu; }
        else if (inA) {
          const ac = c01((f.timer - f.move.startup) / f.move.active);
          armX = 26; armY = -34 - ac * 26; bodyRot = -0.15;
        }
        else          { armX = 26 * (1 - eRe); armY = -34 * (1 - eRe); bodyRot = -0.15 * (1 - eRe); }
        break;

      case "fireball": // 双掌前推
        bothArms = true;
        if (inS)      { armX = 10 + 26 * eSu; armY = -4 * eSu; bodyRot = 0.05 * eSu; }
        else if (inA) { armX = 38; armY = -6; bodyRot = 0.07; }
        else          { armX = 38 * (1 - eRe); bodyRot = 0.07 * (1 - eRe); }
        break;

      case "super": // 全力一击：大幅后摆→双臂全开冲出
        bothArms = true;
        if (inS)      { armX = -20 * eSu; bodyRot = -0.18 * eSu; }
        else if (inA) { armX = 56; armY = -4; bodyRot = 0.19; }
        else          { armX = 56 * (1 - eRe); bodyRot = 0.19 * (1 - eRe); }
        break;

      case "throw": // 投技：双手抓取
        bothArms = true;
        if (inS)      { armX = f.move.reach * 0.5; bodyRot = 0.06; }
        else if (inA) { armX = f.move.reach * 0.8; armY = -6; bodyRot = 0.11; }
        else          { armX = f.move.reach * 0.8 * (1 - eRe); bodyRot = 0.11 * (1 - eRe); }
        break;
    }
  }

  return { armX, armY, legX, legY, crouch, bodyRot, guardX, guardY, bothArms };
}

function drawHuman(f) {
  const { armX, armY, legX, legY, crouch, bodyRot, guardX, guardY, bothArms } = poseFor(f);
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.scale(f.facing, 1);
  if (f.flash > 0) ctx.globalAlpha = 0.6;
  const air = !f.grounded;
  const topY = -f.h + crouch + (air ? 6 : 0);

  // 腿（在身体旋转外，腿是支撑基础）
  ctx.strokeStyle = "#2a3a6a"; ctx.lineWidth = 12; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-4, -10); ctx.lineTo(-10 - (air ? 10 : 0), legY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(6, -10); ctx.lineTo(14 + legX, (air ? -10 : 0) + legY); ctx.stroke();

  // 身体旋转（让躯干/头/手臂跟随发力方向倾斜）
  ctx.save();
  ctx.rotate(bodyRot);

  // 防守臂（后臂，稍暗）
  ctx.save();
  ctx.globalAlpha *= 0.75;
  ctx.strokeStyle = f.color; ctx.lineWidth = 9; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-6, topY + 20); ctx.lineTo(guardX, topY + 26 + guardY); ctx.stroke();
  ctx.fillStyle = "#e0a870";
  ctx.beginPath(); ctx.arc(guardX, topY + 26 + guardY, 5, 0, 7); ctx.fill();
  ctx.restore();

  // 身体（道服）
  ctx.fillStyle = f.color;
  ctx.fillRect(-16, topY, 32, f.h - crouch - 30);
  ctx.fillStyle = "#fff"; ctx.fillRect(-4, topY, 8, f.h - crouch - 30);
  ctx.fillStyle = "#e33"; ctx.fillRect(-16, topY + (f.h - crouch - 30) - 10, 32, 8);

  // 主攻击臂（前臂）
  ctx.strokeStyle = f.color; ctx.lineWidth = 11;
  ctx.beginPath(); ctx.moveTo(0, topY + 18); ctx.lineTo(18 + armX, topY + 22 + armY); ctx.stroke();
  ctx.fillStyle = "#ffcf9c";
  ctx.beginPath(); ctx.arc(18 + armX, topY + 22 + armY, 7, 0, 7); ctx.fill();

  // 双臂出招时的第二只手（波动拳/超必/投技）
  if (bothArms) {
    ctx.strokeStyle = f.color; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(-5, topY + 22); ctx.lineTo(-5 + armX * 0.72, topY + 28 + armY); ctx.stroke();
    ctx.fillStyle = "#ffcf9c";
    ctx.beginPath(); ctx.arc(-5 + armX * 0.72, topY + 28 + armY, 6, 0, 7); ctx.fill();
  }

  // 头
  ctx.fillStyle = "#ffcf9c"; ctx.beginPath(); ctx.arc(0, topY - 12, 14, 0, 7); ctx.fill();
  ctx.fillStyle = "#222"; ctx.fillRect(-12, topY - 22, 24, 8);
  ctx.fillStyle = "#000"; ctx.fillRect(6, topY - 14, 4, 4);

  ctx.restore(); // 结束身体旋转
  ctx.restore(); // 结束 translate+scale
}

function drawDog(f) {
  const { armX, armY, legX, legY, crouch, bodyRot, guardX, guardY, bothArms } = poseFor(f);
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.scale(f.facing, 1);
  if (f.flash > 0) ctx.globalAlpha = 0.6;
  const air = !f.grounded;
  const topY = -f.h + crouch + (air ? 6 : 0);

  // 披风（在腿/身体旋转外，随体型飘动）
  ctx.fillStyle = "#a01818";
  ctx.beginPath(); ctx.moveTo(-14, topY + 4); ctx.lineTo(-34, f.h * 0 - 6); ctx.lineTo(-10, -6); ctx.closePath(); ctx.fill();

  // 腿
  ctx.strokeStyle = "#b97a36"; ctx.lineWidth = 13; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-4, -10); ctx.lineTo(-12 - (air ? 8 : 0), legY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(6, -10); ctx.lineTo(14 + legX, (air ? -8 : 0) + legY); ctx.stroke();

  // 身体旋转
  ctx.save();
  ctx.rotate(bodyRot);

  // 防守臂（后臂，稍暗）
  ctx.save();
  ctx.globalAlpha *= 0.75;
  ctx.strokeStyle = "#d99a4e"; ctx.lineWidth = 11; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-6, topY + 18); ctx.lineTo(guardX - 2, topY + 24 + guardY); ctx.stroke();
  ctx.fillStyle = "#a06828";
  ctx.beginPath(); ctx.arc(guardX - 2, topY + 24 + guardY, 6, 0, 7); ctx.fill();
  ctx.restore();

  // 壮硕身体
  ctx.fillStyle = "#d99a4e";
  ctx.beginPath(); ctx.moveTo(-20, topY + 6); ctx.lineTo(20, topY + 6); ctx.lineTo(16, -8); ctx.lineTo(-16, -8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#c98a3e"; ctx.fillRect(-16, topY + 18, 32, 6);

  // 主攻击臂（前臂）
  ctx.strokeStyle = "#d99a4e"; ctx.lineWidth = 13;
  ctx.beginPath(); ctx.moveTo(0, topY + 16); ctx.lineTo(20 + armX, topY + 20 + armY); ctx.stroke();
  ctx.fillStyle = "#b97a36";
  ctx.beginPath(); ctx.arc(20 + armX, topY + 20 + armY, 8, 0, 7); ctx.fill();

  // 双臂出招时第二只手
  if (bothArms) {
    ctx.strokeStyle = "#d99a4e"; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(-6, topY + 20); ctx.lineTo(-6 + armX * 0.72, topY + 26 + armY); ctx.stroke();
    ctx.fillStyle = "#b97a36";
    ctx.beginPath(); ctx.arc(-6 + armX * 0.72, topY + 26 + armY, 7, 0, 7); ctx.fill();
  }

  // 头（柴犬）
  ctx.fillStyle = "#e3a85a"; ctx.beginPath(); ctx.arc(2, topY - 14, 17, 0, 7); ctx.fill();
  ctx.fillStyle = "#e3a85a";
  ctx.beginPath(); ctx.moveTo(-12, topY - 26); ctx.lineTo(-4, topY - 16); ctx.lineTo(-16, topY - 14); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(14, topY - 26); ctx.lineTo(6, topY - 16); ctx.lineTo(18, topY - 14); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(8, topY - 8, 8, 0, 7); ctx.fill();
  ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(13, topY - 10, 3, 0, 7); ctx.fill();
  ctx.fillStyle = f.taunt > 0 ? "#ff0" : "#000"; ctx.fillRect(6, topY - 18, 4, 4);

  // 皇冠
  ctx.fillStyle = "#ffd23f";
  ctx.beginPath();
  ctx.moveTo(-10, topY - 28); ctx.lineTo(-10, topY - 36); ctx.lineTo(-4, topY - 30);
  ctx.lineTo(2, topY - 40); ctx.lineTo(8, topY - 30); ctx.lineTo(14, topY - 36); ctx.lineTo(14, topY - 28);
  ctx.closePath(); ctx.fill();

  ctx.restore(); // 结束身体旋转
  ctx.restore(); // 结束 translate+scale
}

function drawBubble(f) {
  if (!f.bubble) return;
  ctx.save();
  ctx.font = "bold 16px 'Microsoft YaHei', sans-serif"; ctx.textAlign = "center";
  const w = ctx.measureText(f.bubble).width + 24;
  const bx = f.x, by = f.y - f.h - 34;
  ctx.fillStyle = "rgba(0,0,0,0.78)"; ctx.strokeStyle = f.color; ctx.lineWidth = 2;
  roundRect(bx - w / 2, by - 22, w, 30, 8); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx - 6, by + 8); ctx.lineTo(bx + 6, by + 8); ctx.lineTo(bx, by + 16); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.fillText(f.bubble, bx, by - 2);
  ctx.restore();
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawHealthBars() {
  const left = troll.swapBars ? dog : player;
  const right = troll.swapBars ? player : dog;
  drawBar(40, 30, 360, left, false);
  drawBar(W - 40 - 360, 30, 360, right, true);
  // names
  ctx.font = "bold 18px 'Microsoft YaHei', sans-serif"; ctx.fillStyle = "#fff";
  ctx.textAlign = "left"; ctx.fillText(left.name, 44, 70);
  ctx.textAlign = "right"; ctx.fillText(right.name, W - 44, 70);
  // round pips
  for (let i = 0; i < 2; i++) {
    ctx.fillStyle = (troll.swapBars ? dWins : pWins) > i ? "#ffd23f" : "#444";
    ctx.beginPath(); ctx.arc(44 + i * 18, 80, 6, 0, 7); ctx.fill();
    ctx.fillStyle = (troll.swapBars ? pWins : dWins) > i ? "#ffd23f" : "#444";
    ctx.beginPath(); ctx.arc(W - 44 - i * 18, 80, 6, 0, 7); ctx.fill();
  }
  // timer
  ctx.font = "bold 34px monospace"; ctx.textAlign = "center"; ctx.fillStyle = "#fff";
  ctx.fillText(Math.ceil(roundTimer / FPS), W / 2, 56);
}
function drawBar(x, y, w, f, flip) {
  const pct = clamp(f.hp / f.maxhp, 0, 1);
  ctx.fillStyle = "#000"; ctx.fillRect(x - 2, y - 2, w + 4, 26);
  ctx.fillStyle = "#3a0000"; ctx.fillRect(x, y, w, 22);
  const bw = w * pct;
  const col = pct > 0.5 ? "#5ad24c" : pct > 0.25 ? "#ffd23f" : "#ff5a4c";
  ctx.fillStyle = col;
  if (flip) ctx.fillRect(x + w - bw, y, bw, 22); else ctx.fillRect(x, y, bw, 22);
  // meter
  ctx.fillStyle = "#001"; ctx.fillRect(x, y + 26, w, 8);
  ctx.fillStyle = f.meter >= 100 ? "#ff00d0" : "#00d0ff";
  const mw = w * clamp(f.meter / 100, 0, 1);
  if (flip) ctx.fillRect(x + w - mw, y + 26, mw, 8); else ctx.fillRect(x, y + 26, mw, 8);
}

function render() {
  ctx.save();
  // screen flip troll
  if (troll.flip) { ctx.translate(W, 0); ctx.scale(-1, 1); }
  // shake
  if (shake > 0.5) ctx.translate(rnd(-shake, shake), rnd(-shake, shake));

  drawBackground();

  // hazards behind fighters? scooter should be in front for impact; draw behind for now
  for (const h of hazards) if (h instanceof FallingObject) h.draw();

  // draw fighters (back one first)
  const order = player.x <= dog.x ? [player, dog] : [dog, player];
  for (const f of order) { (f === dog ? drawDog : drawHuman)(f); drawBubble(f); }

  for (const h of hazards) if (h instanceof Scooter) h.draw();
  for (const p of projectiles) p.draw();

  // particles
  for (const p of particles) { ctx.globalAlpha = clamp(p.life / 20, 0, 1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
  ctx.globalAlpha = 1;
  // floaties
  for (const f of floats) {
    ctx.globalAlpha = clamp(f.life / 50, 0, 1);
    ctx.font = `bold ${f.size}px 'Microsoft YaHei', sans-serif`; ctx.textAlign = "center";
    ctx.fillStyle = "#000"; ctx.fillText(f.text, f.x + 2, f.y + 2);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;

  ctx.restore(); // end flip/shake (UI stays normal)

  // UI
  drawHealthBars();

  // combo counter
  if (player.combo >= 2 && player.comboTimer > 0) {
    ctx.font = "bold 30px 'Microsoft YaHei', sans-serif"; ctx.fillStyle = "#ffd23f"; ctx.textAlign = "left";
    ctx.fillText(player.combo + " 连击", 44, 130);
  }

  // danmaku
  ctx.font = "bold 18px 'Microsoft YaHei', sans-serif"; ctx.textAlign = "left";
  for (const d of danmakus) { ctx.fillStyle = "#000"; ctx.fillText(d.text, d.x + 2, d.y + 2); ctx.fillStyle = d.color; ctx.fillText(d.text, d.x, d.y); }

  // banner
  if (bannerT > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(bannerT / 30, 0, 1);
    ctx.font = "900 86px 'Microsoft YaHei', sans-serif"; ctx.textAlign = "center";
    ctx.fillStyle = bannerColor; ctx.shadowColor = bannerColor; ctx.shadowBlur = 30;
    ctx.fillText(bannerText, W / 2, H / 2 - 30);
    ctx.restore();
  }
}

/* ------------------------------ loop ---------------------------------- */
let acc = 0, lastT = 0;
function loop(t) {
  if (!lastT) lastT = t;
  let dt = t - lastT; lastT = t;
  if (dt > 100) dt = 100;
  acc += dt;
  const step = 1000 / FPS;
  let guard = 0;
  while (acc >= step && guard++ < 5) {
    if (state !== "menu") update();
    for (const k in Pressed) delete Pressed[k]; // consume edge presses each step
    acc -= step;
  }
  render();
  requestAnimationFrame(loop);
}

/* ----------------------------- wiring --------------------------------- */
document.getElementById("startBtn").addEventListener("click", () => { SFX.resume(); startMatch(); });
document.getElementById("againBtn").addEventListener("click", () => { SFX.resume(); startMatch(); });

newFighters();
requestAnimationFrame(loop);
