import {
  BALANCE_TARGET,
  BETS,
  CANNON,
  H,
  MAX_FISH,
  SPECIES,
  START_BALANCE,
  TOTAL_WEIGHT,
  W,
  WIN_RATE,
  LOSS_RATE,
  PLATFORM_RATE,
  formatNum,
  type Species,
} from "./config";
import {
  drawBullet,
  drawCannon,
  drawCoin,
  drawCrosshair,
  drawFish,
  drawLock,
  drawNet,
  drawPopup,
  drawRays,
  drawSeaweed,
  makeBackground,
  makeVignette,
  type FishView,
} from "./draw";
import { sfx } from "./sound";

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));

export interface Snapshot {
  balance: number;
  lastWin: number;
  shots: number;
  wins: number;
  losses: number;
  platformCuts: number;
  totalBet: number;
  totalWon: number;
}

export interface BigWinInfo {
  amount: number;
  mult: number;
  name: string;
}

export interface EngineCallbacks {
  onChange: (s: Snapshot) => void;
  onBigWin: (info: BigWinInfo) => void;
  onNoFunds: (balance: number) => void;
  onAccept: (wagerId: string, stake: number, outcome: { win: boolean; platformCut: boolean; targetId: number | null }, snapshot: EngineRecovery) => Promise<string | { wagerId: string; win: boolean } | null>;
  onComplete: (wagerId: string, claim: number) => Promise<boolean>;
  onCheckpoint: (snapshot: EngineRecovery) => void;
}

interface PendingShot {
  wagerId: string; bet: number; level: number; tx: number; ty: number; win: boolean; platformCut: boolean; targetId: number | null;
}
export interface EngineRecovery {
  fish: Fish[]; bullets: (Omit<Bullet, "target"> & { targetId: number | null })[];
  pending: PendingShot | null; nextId: number; time: number; spawnTimer: number;
}

interface Fish extends FishView {
  id: number;
  vx: number;
  vy: number;
  baseY: number;
  wobbleAmp: number;
  wobbleSpeed: number;
  drift: number;
  t: number;
  claimed: boolean;
  dyingT: number;
  remove: boolean;
}

interface Bullet {
  wagerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  win: boolean;
  target: Fish | null;
  bet: number;
  level: number;
  travelled: number;
  maxDist: number;
  platformCut: boolean;
}

interface Net {
  x: number;
  y: number;
  r: number;
  t: number;
  life: number;
  win: boolean;
}

interface Coin {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  burst: number;
  stage: 0 | 1;
  sx: number;
  sy: number;
  f: number;
  r: number;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  size: number;
  t: number;
  life: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  size: number;
  color: string;
}

interface Bubble {
  x: number;
  y: number;
  r: number;
  s: number;
  ph: number;
}

const BULLET_SPEED = 980;
const FIRE_COOLDOWN = 0.27;

export class FishingEngine {
  private ctx: CanvasRenderingContext2D;
  private dpr: number;
  private bg: HTMLCanvasElement;
  private vignette: HTMLCanvasElement;
  private raf = 0;
  private last = 0;
  private time = 0;
  private destroyed = false;

  private fish: Fish[] = [];
  private bullets: Bullet[] = [];
  private nets: Net[] = [];
  private coins: Coin[] = [];
  private popups: Popup[] = [];
  private particles: Particle[] = [];
  private bubbles: Bubble[] = [];
  private nextId = 1;
  private spawnTimer = 0;

  private cannonAngle = -Math.PI / 2;
  private recoil = 0;
  private cooldown = 0;
  private shake = 0;
  private coinSfxGate = 0;

  private pointer = { x: W / 2, y: 260, down: false, inside: false };
  private locked: Fish | null = null;
  private auto = false;
  private inputEnabled = false;
  private betIdx = 2;
  private customBet: number | null = null;

  private balance = START_BALANCE;
  private accepting = false;
  private pendingShot: PendingShot | null = null;
  private lastWin = 0;
  private shots = 0;
  private wins = 0;
  private losses = 0;
  private platformCuts = 0;
  private totalBet = 0;
  private totalWon = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private cb: EngineCallbacks,
  ) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * this.dpr);
    canvas.height = Math.round(H * this.dpr);
    this.ctx = canvas.getContext("2d")!;
    this.bg = makeBackground();
    this.vignette = makeVignette();

    for (let i = 0; i < 34; i++) {
      this.bubbles.push({ x: rand(0, W), y: rand(0, H), r: rand(2, 7), s: rand(18, 55), ph: rand(0, TAU) });
    }
    for (let i = 0; i < 5; i++) this.spawnWave(true);

    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerleave", this.onLeave);
    canvas.addEventListener("contextmenu", this.onContext);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("blur", this.onUp);
  }

  /* ------------------------------ public API ------------------------------ */

  start() {
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.destroyed) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      if (this.bullets.length || this.pendingShot) this.cb.onCheckpoint(this.snapshot());
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.emit();
  }

  destroy() {
    if (this.raf) this.cb.onCheckpoint(this.snapshot());
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerleave", this.onLeave);
    this.canvas.removeEventListener("contextmenu", this.onContext);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("blur", this.onUp);
  }

  private snapshot(): EngineRecovery {
    return {
      fish: this.fish, bullets: this.bullets.map(({ target, ...bullet }) => ({ ...bullet, targetId: target?.id ?? null })),
      pending: this.pendingShot, nextId: this.nextId, time: this.time, spawnTimer: this.spawnTimer,
    };
  }

  async restore(saved: EngineRecovery, activeIds: string[]) {
    const accepted = new Set(activeIds);
    this.fish = saved.fish;
    this.nextId = saved.nextId;
    this.time = saved.time;
    this.spawnTimer = saved.spawnTimer;
    this.bullets = saved.bullets.filter(bullet => accepted.has(bullet.wagerId)).map(({ targetId, ...bullet }) => ({
      ...bullet, target: this.fish.find(fish => fish.id === targetId) ?? null,
    }));
    this.auto = false;
    this.pointer.down = false;
    if (saved.pending && accepted.has(saved.pending.wagerId)) {
      this.pendingShot = saved.pending;
      await this.launchPendingShot();
    }
  }

  setBetIndex(i: number) {
    this.betIdx = Math.max(0, Math.min(BETS.length - 1, i));
  }

  setCustomBet(v: number | null) {
    this.customBet = v !== null && Number.isFinite(v) && v > 0 ? v : null;
  }

  setAuto(v: boolean) {
    this.auto = v;
    if (!v) this.locked = null;
  }

  setInputEnabled(v: boolean) {
    this.inputEnabled = v;
    if (!v) this.pointer.down = false;
  }

  setBalance(v: number) {
    this.balance = Math.max(0, Math.round(v * 100) / 100);
    this.emit();
  }

  reset() {
    this.lastWin = 0;
    this.shots = 0;
    this.wins = 0;
    this.losses = 0;
    this.platformCuts = 0;
    this.totalBet = 0;
    this.totalWon = 0;
    this.emit();
  }

  /* ------------------------------ input ------------------------------ */

  private toGame(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  }

  private onDown = (e: PointerEvent) => {
    const p = this.toGame(e);
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    this.pointer.inside = true;
    if (!this.inputEnabled) return;
    e.preventDefault();
    this.pointer.down = true;
    if (this.auto) {
      const f = this.fish.find((fi) => !fi.dying && this.hitsFish(fi, p.x, p.y, 22));
      if (f) this.locked = f;
    }
  };

  private onMove = (e: PointerEvent) => {
    const p = this.toGame(e);
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    this.pointer.inside = true;
  };

  private onLeave = () => {
    this.pointer.inside = false;
  };

  private onUp = () => {
    this.pointer.down = false;
  };

  private onContext = (e: Event) => e.preventDefault();

  /* ------------------------------ helpers ------------------------------ */

  private emit() {
    this.cb.onChange({
      balance: this.balance,
      lastWin: this.lastWin,
      shots: this.shots,
      wins: this.wins,
      losses: this.losses,
      platformCuts: this.platformCuts,
      totalBet: this.totalBet,
      totalWon: this.totalWon,
    });
  }

  private hitsFish(f: Fish, x: number, y: number, pad: number) {
    const rx = f.sp.w * f.sp.hit[0] + pad;
    const ry = f.sp.h * f.sp.hit[1] + pad;
    const dx = (x - f.x) / rx;
    const dy = (y - f.y) / ry;
    return dx * dx + dy * dy <= 1;
  }

  private eligible(f: Fish) {
    return !f.dying && !f.claimed && !f.remove && f.x > 25 && f.x < W - 25 && f.y > 40 && f.y < H - 140;
  }

  private pickTarget(x: number, y: number): Fish | null {
    let best: Fish | null = null;
    let bestD = Infinity;
    for (const f of this.fish) {
      if (!this.eligible(f)) continue;
      const d = Math.hypot(f.x - x, f.y - y) - f.sp.w * f.sp.hit[0];
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  private pickSpecies(): Species {
    let r = Math.random() * TOTAL_WEIGHT;
    for (const sp of SPECIES) {
      r -= sp.weight;
      if (r <= 0) return sp;
    }
    return SPECIES[0];
  }

  private spawnWave(initial = false) {
    const sp = this.pickSpecies();
    let count = sp.school ? randInt(sp.school[0], sp.school[1]) : 1;
    count = Math.min(count, MAX_FISH - this.fish.length);
    if (count <= 0) return;
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const baseY = rand(95, 505);
    const speed = rand(sp.speed[0], sp.speed[1]);
    const startX = initial ? rand(120, W - 120) : dir === 1 ? -sp.w * 0.7 : W + sp.w * 0.7;
    for (let i = 0; i < count; i++) {
      const off = i * (sp.w * 0.9 + rand(0, 18));
      const x = startX - dir * off;
      const by = Math.max(90, Math.min(520, baseY + rand(-34, 34) * (i > 0 ? 1 : 0)));
      this.fish.push({
        id: this.nextId++,
        sp,
        x,
        y: by,
        dir,
        tilt: 0,
        phase: rand(0, TAU),
        flash: 0,
        alpha: 1,
        spin: 0,
        dying: false,
        vx: dir * (speed + rand(-5, 5)),
        vy: 0,
        baseY: by,
        wobbleAmp: rand(sp.wobble[0], sp.wobble[1]),
        wobbleSpeed: rand(0.9, 1.7),
        drift: rand(-5, 5),
        t: rand(0, 10),
        claimed: false,
        dyingT: 0,
        remove: false,
      });
    }
    this.fish.sort((a, b) => b.sp.w - a.sp.w);
  }

  /* ------------------------------ firing ------------------------------ */

  private clampAngle(a: number) {
    let r = a;
    if (r > 0) r = r > Math.PI / 2 ? -Math.PI + 0.12 : -0.12;
    return Math.max(-Math.PI + 0.12, Math.min(-0.12, r));
  }

  private async fire(tx: number, ty: number): Promise<boolean> {
    if (this.accepting) return false;
    if (this.pendingShot) return this.launchPendingShot();
    const bet = this.customBet ?? BETS[this.betIdx];
    if (this.balance < bet) {
      this.cooldown = 0.5;
      sfx.error();
      this.auto = false;
      this.cb.onNoFunds(this.balance);
      return false;
    }
    if (!this.fish.some((f) => this.eligible(f))) return false;

    const r = Math.random();
    let win = false;
    let platformCut = false;

    if (r < WIN_RATE) {
      win = true;
    } else if (r < WIN_RATE + LOSS_RATE) {
      win = false;
    } else {
      win = false;
      platformCut = true;
    }

    const target = this.pickTarget(tx, ty);
    if (target) target.claimed = true;
    else win = false;

    this.pendingShot = { wagerId: crypto.randomUUID(), bet, level: this.betIdx, tx, ty, win, platformCut, targetId: target?.id ?? null };
    this.cb.onCheckpoint(this.snapshot());
    return this.launchPendingShot();
  }

  private async launchPendingShot() {
    const shot = this.pendingShot;
    if (!shot) return false;
    const { wagerId, bet, level, tx, ty, platformCut, targetId } = shot;
    let win = shot.win;
    const target = this.fish.find(fish => fish.id === targetId) ?? null;
    this.accepting = true;
    const accepted = await this.cb.onAccept(wagerId, bet, { win, platformCut, targetId }, this.snapshot());
    this.accepting = false;
    if (!accepted) { if (target) target.claimed = false; this.auto = false; this.pointer.down = false; return false; }
    if (typeof accepted !== "string") win = accepted.win && target !== null;
    if (!win && target) target.claimed = false;
    this.pendingShot = null;
    this.totalBet += bet;
    this.shots += 1;

    const angle = win && target
      ? this.clampAngle(Math.atan2(target.y - CANNON.y, target.x - CANNON.x))
      : this.clampAngle(Math.atan2(ty - CANNON.y, tx - CANNON.x));
    this.cannonAngle = angle;
    const muzzle = 66 + level * 4 + 30;
    const x = CANNON.x + Math.cos(angle) * muzzle;
    const y = CANNON.y + Math.sin(angle) * muzzle;
    const dist = Math.hypot(tx - x, ty - y);

    this.bullets.push({
      wagerId,
      x,
      y,
      vx: Math.cos(angle) * BULLET_SPEED,
      vy: Math.sin(angle) * BULLET_SPEED,
      win,
      target,
      bet,
      level,
      travelled: 0,
      maxDist: Math.max(70, dist),
      platformCut,
    });

    this.cooldown = FIRE_COOLDOWN;
    this.recoil = 12;
    sfx.shoot();
    for (let i = 0; i < 4; i++) {
      this.particles.push({
        x,
        y,
        vx: rand(-40, 40),
        vy: rand(-90, -30),
        t: 0,
        life: rand(0.4, 0.8),
        size: rand(2, 4),
        color: "rgba(255,255,255,0.7)",
      });
    }
    this.emit();
    return true;
  }

  /* ------------------------------ resolution ------------------------------ */

  private async resolveLoss(b: Bullet, x: number, y: number) {
    if (!await this.cb.onComplete(b.wagerId, 0)) { this.auto = false; this.pointer.down = false; return; }
    if (b.platformCut) {
      this.platformCuts += 1;
    } else {
      this.losses += 1;
    }
    const r = 56 + b.level * 8;
    this.nets.push({ x, y, r, t: 0, life: 0.7, win: false });
    let hit = false;
    for (const f of this.fish) {
      if (f.dying) continue;
      if (this.hitsFish(f, x, y, r * 0.55)) {
        f.flash = 0.3;
        hit = true;
      }
    }
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        x,
        y,
        vx: rand(-110, 110),
        vy: rand(-110, 110),
        t: 0,
        life: rand(0.3, 0.6),
        size: rand(2, 4),
        color: "rgba(190,235,255,0.9)",
      });
    }
    if (hit) sfx.hit();
    else sfx.net();
    this.emit();
  }

  private async resolveWin(b: Bullet, f: Fish) {
    const mult = f.sp.mult;
    const payout = Math.round(b.bet * mult);
    if (!await this.cb.onComplete(b.wagerId, payout)) { this.auto = false; this.pointer.down = false; return; }
    this.wins += 1;
    this.totalWon += payout;
    this.lastWin = payout;

    f.dying = true;
    f.claimed = true;
    f.dyingT = 0;
    f.flash = 0;

    this.nets.push({ x: f.x, y: f.y, r: Math.max(86, f.sp.w * 0.58), t: 0, life: 0.9, win: true });

    const n = Math.max(6, Math.min(22, Math.round(5 + mult * 0.7)));
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(80, 260);
      this.coins.push({
        x: f.x + rand(-12, 12),
        y: f.y + rand(-12, 12),
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 140,
        t: -i * 0.03,
        burst: rand(0.35, 0.55),
        stage: 0,
        sx: 0,
        sy: 0,
        f: 0,
        r: 13 + Math.min(5, mult * 0.2),
      });
    }
    for (let i = 0; i < 16; i++) {
      const a = rand(0, TAU);
      const s = rand(60, 220);
      this.particles.push({
        x: f.x,
        y: f.y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        t: 0,
        life: rand(0.5, 1),
        size: rand(3, 6),
        color: Math.random() < 0.5 ? "rgba(255,240,140,0.95)" : "rgba(255,255,255,0.95)",
      });
    }
    this.popups.push({
      x: f.x,
      y: f.y - 10,
      text: `+${formatNum(payout)}`,
      size: 30 + Math.min(26, mult * 1.2),
      t: 0,
      life: 1.5,
    });

    if (mult >= 6) this.shake = Math.max(this.shake, mult >= 20 ? 14 : 8);
    sfx.win(mult);
    if (mult >= 10) {
      sfx.bigWin();
      this.cb.onBigWin({ amount: payout, mult, name: f.sp.name });
    }
    this.emit();
  }

  /* ------------------------------ update ------------------------------ */

  private update(dt: number) {
    this.time += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.recoil = Math.max(0, this.recoil - dt * 70);
    this.shake = Math.max(0, this.shake - dt * 28);
    this.coinSfxGate = Math.max(0, this.coinSfxGate - dt);

    // lock-on validity
    if (this.locked && (this.locked.dying || this.locked.remove || !this.eligibleOrClaimed(this.locked))) {
      this.locked = null;
    }

    // aim
    let aimX = this.pointer.x;
    let aimY = this.pointer.y;
    if (this.auto && this.locked) {
      aimX = this.locked.x;
      aimY = this.locked.y;
    }
    const want = this.clampAngle(Math.atan2(aimY - CANNON.y, aimX - CANNON.x));
    this.cannonAngle += (want - this.cannonAngle) * Math.min(1, dt * 16);

    // fire
    if (this.inputEnabled && this.cooldown <= 0) {
      if (this.pointer.down) this.fire(this.pointer.x, this.pointer.y);
      else if (this.auto) this.fire(aimX, aimY);
    }

    // spawn
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnWave();
      this.spawnTimer = this.fish.length < 11 ? rand(0.25, 0.6) : rand(0.8, 1.8);
    }

    // fish
    for (const f of this.fish) {
      f.t += dt;
      f.flash = Math.max(0, f.flash - dt);
      if (f.dying) {
        f.dyingT += dt;
        f.spin += dt * 9;
        f.y += 38 * dt;
        f.alpha = 1 - f.dyingT / 0.95;
        if (f.alpha <= 0) f.remove = true;
        continue;
      }
      f.x += f.vx * dt;
      f.baseY += f.drift * dt;
      f.baseY = Math.max(90, Math.min(520, f.baseY));
      const ang = f.t * f.wobbleSpeed + f.phase;
      f.y = f.baseY + Math.sin(ang) * f.wobbleAmp;
      f.vy = Math.cos(ang) * f.wobbleAmp * f.wobbleSpeed;
      f.tilt = Math.max(-0.45, Math.min(0.45, Math.atan2(f.vy, Math.abs(f.vx)) * 0.9));
      if ((f.vx > 0 && f.x > W + f.sp.w) || (f.vx < 0 && f.x < -f.sp.w)) f.remove = true;
    }
    this.fish = this.fish.filter((f) => !f.remove);

    // bullets
    const keep: Bullet[] = [];
    for (const b of this.bullets) {
      let alive = true;
      if (b.win) {
        let tg = b.target;
        if (!tg || tg.dying || !this.fish.includes(tg)) {
          tg = this.pickTarget(b.x, b.y);
          if (tg) {
            tg.claimed = true;
            b.target = tg;
          } else {
            // no fish left to land on – plain miss
            b.win = false;
            b.target = null;
            b.maxDist = b.travelled + 60;
          }
        }
        if (b.win && tg) {
          const dx = tg.x - b.x;
          const dy = tg.y - b.y;
          const d = Math.hypot(dx, dy) || 1;
          const step = BULLET_SPEED * dt;
          b.vx = (dx / d) * BULLET_SPEED;
          b.vy = (dy / d) * BULLET_SPEED;
          if (d <= step + 6 || this.hitsFish(tg, b.x, b.y, 8)) {
            this.resolveWin(b, tg);
            alive = false;
          } else {
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.travelled += step;
          }
        }
      }
      if (alive && !b.win) {
        const step = BULLET_SPEED * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.travelled += step;
        const hitF = this.fish.find((f) => !f.dying && this.hitsFish(f, b.x, b.y, 8));
        if (hitF || b.travelled >= b.maxDist || b.x < -20 || b.x > W + 20 || b.y < -20) {
          this.resolveLoss(b, b.x, b.y);
          alive = false;
        }
      }
      if (alive) keep.push(b);
    }
    this.bullets = keep;

    // nets
    for (const n of this.nets) n.t += dt;
    this.nets = this.nets.filter((n) => n.t < n.life);

    // coins
    for (const c of this.coins) {
      c.t += dt;
      if (c.t < 0) continue;
      if (c.stage === 0) {
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.vy += 620 * dt;
        c.vx *= 0.97;
        if (c.t >= c.burst) {
          c.stage = 1;
          c.sx = c.x;
          c.sy = c.y;
        }
      } else {
        c.f += dt / 0.75;
        const e = c.f * c.f;
        c.x = c.sx + (BALANCE_TARGET.x - c.sx) * e;
        c.y = c.sy + (BALANCE_TARGET.y - c.sy) * e;
      }
    }
    for (const c of this.coins) {
      if (c.stage === 1 && c.f >= 1 && this.coinSfxGate <= 0) {
        sfx.coin();
        this.coinSfxGate = 0.08;
      }
    }
    this.coins = this.coins.filter((c) => !(c.stage === 1 && c.f >= 1));

    // popups & particles
    for (const p of this.popups) p.t += dt;
    this.popups = this.popups.filter((p) => p.t < p.life);
    for (const p of this.particles) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
    this.particles = this.particles.filter((p) => p.t < p.life);

    // bubbles
    for (const b of this.bubbles) {
      b.y -= b.s * dt;
      b.x += Math.sin(this.time * 1.5 + b.ph) * 8 * dt;
      if (b.y < -10) {
        b.y = H + 10;
        b.x = rand(0, W);
      }
    }
  }

  private eligibleOrClaimed(f: Fish) {
    return f.x > 10 && f.x < W - 10 && f.y > 20 && f.y < H - 120;
  }

  /* ------------------------------ draw ------------------------------ */

  private draw() {
    const ctx = this.ctx;
    const t = this.time;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (this.shake > 0.4) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    ctx.drawImage(this.bg, 0, 0);
    drawRays(ctx, t);
    drawSeaweed(ctx, t);

    // bubbles
    ctx.save();
    for (const b of this.bubbles) {
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, Math.max(1, b.r * 0.22), 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    for (const f of this.fish) drawFish(ctx, f, t);

    if (this.auto && this.locked) drawLock(ctx, this.locked.x, this.locked.y, this.locked.sp.w * 0.5 + 14, t);

    for (const n of this.nets) drawNet(ctx, n.x, n.y, n.r, n.t / n.life, n.win);

    for (const p of this.particles) {
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = Math.max(0, k);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + k * 0.5), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const b of this.bullets) drawBullet(ctx, b.x, b.y, b.vx, b.vy, b.level);

    drawCannon(ctx, this.cannonAngle, this.betIdx, this.recoil, t);

    for (const c of this.coins) {
      if (c.t < 0) continue;
      drawCoin(ctx, c.x, c.y, c.stage === 1 ? c.r * (1 - c.f * 0.35) : c.r, t + c.burst * 10);
    }

    for (const p of this.popups) {
      const k = p.t / p.life;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.55 : 1.15 - Math.min(0.15, (k - 0.15) * 0.4);
      drawPopup(ctx, p.x, p.y - k * 70, p.text, p.size, k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3, pop);
    }
    ctx.restore();

    ctx.drawImage(this.vignette, 0, 0);

    if (this.inputEnabled && this.pointer.inside) drawCrosshair(ctx, this.pointer.x, this.pointer.y);
  }
}
