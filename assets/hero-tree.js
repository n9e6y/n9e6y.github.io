// Hero animation: Monte Carlo tree search (select, expand, rollout, backprop, re-root).
// Ported from animation/hero-anims.js. Monochrome: everything is drawn in the page's --ink-rgb,
// so it follows the theme. Pointer input comes from the hero section (the canvas itself has
// pointer-events: none): hover steers the search; click / tap sends a burst of expansion toward that spot.
// Tune it live in working_on_it/hero-lab.html (local only).

// ---- Tuning: change these to find the sweet spot ----
const TREE = {
  speed: 0.7,              // overall speed. 0 = frozen, 0.5 = half, 2 = double
  center: [0.7, 0.5],    // where the root sits, as a share of hero width / height
  spread: [0.5, 0.5],    // how far the outer ring reaches, as a share of hero width / height
  depth: 9,              // number of rings the tree grows outward
  rootBranches: 4,       // children of the root
  branches: 4,           // children of every other node
  density: 650,          // hero area (px²) per node. Lower = more nodes
  minNodes: 120,         // node cap on small screens
  maxNodes: 1000,        // node cap on large screens
  probeEvery: 40,        // frames between new search probes. Lower = busier
  maxProbes: 7,          // probes travelling at once
  probeSpeed: 0.13,      // how fast a probe walks down the tree
  backupSpeed: 0.18,     // how fast the result walks back up
  explore: 0,            // UCT exploration. Higher = wider and bushier, lower = deeper and narrower
  rerootAfter: 200,      // root visits (once the tree is full) before it moves to its best child
  // Hover.
  cursorPull: 1.7,       // how strongly hovering steers the search. 0 = ignore the cursor
  hoverGlow: 0.5,        // how much branches near the cursor light up. 0 = off, 1 = as bright as a click burst
  hoverRadius: 140,      // reach of that glow, px
  hoverBusy: 4,          // probes come this many times as often while hovering. 1 = no change
  // Click / tap: a burst of search toward that spot.
  burstProbes: 8,        // probes launched at once on click
  burstTime: 120,        // frames the burst keeps feeding probes (60 = 1 second)
  burstPerFrame: 2,      // extra probes per frame while the burst lasts
  burstPull: 4,          // how hard the burst steers toward the click (cursorPull is the gentle version)
  burstFocus: 12,        // how narrow the burst's aim is. 1 = whole half of the tree, 12 = tight cone, 30 = laser
  burstNodes: 0.6,       // extra node room during a burst, as a share of the cap (0.6 = +60%)
  burstHold: 240,        // frames after a burst before the tree may re-root (prune) again
  burstGlow: 0.999,      // how slowly burst branches fade from bright to normal. Closer to 1 = longer glow
  // Look.
  rotate: 0.0003,        // slow spin per frame. 0 = still
  edgeAlpha: [0.03, 0.61], // opacity of the faintest and busiest edges
  rootRing: 0,           // radius of the ring around the root, px
};

(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };

  class Tree {
    constructor(canvas, target) {
      this.c = canvas; this.ctx = canvas.getContext('2d'); this.target = target || canvas;
      this.m = { x: -1e4, y: -1e4, in: false };
      this.running = false; this._g = 0; this.w = 0; this.h = 0;
      this._bind();
      this.resize();
      new ResizeObserver(() => this.resize()).observe(canvas);
    }
    ink(a) { return 'rgba(' + this.rgb + ',' + a + ')'; }
    _bind() {
      const pos = e => { const r = this.c.getBoundingClientRect(); this.m.x = e.clientX - r.left; this.m.y = e.clientY - r.top; };
      const t = this.target;
      t.addEventListener('pointermove', e => { pos(e); this.m.in = true; });
      t.addEventListener('pointerleave', () => { this.m.in = false; this.m.x = this.m.y = -1e4; });
      t.addEventListener('pointerdown', e => {
        if (e.button !== 0 || e.target.closest('a, button, input')) return;
        pos(e); this.m.in = true; this.onDown();
      });
    }
    resize() {
      const w = this.c.clientWidth, h = this.c.clientHeight; if (!w || !h) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (w === this.w && h === this.h && this._dpr === dpr) return;
      this.w = w; this.h = h; this._dpr = dpr;
      this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.init(); this.step(0); this.render();
    }
    start() {
      if (this.running) return; this.running = true; const g = ++this._g; let last = performance.now();
      const loop = t => {
        if (!this.running || g !== this._g) return;
        const dt = clamp((t - last) / 16.667, 0, 3) * TREE.speed; last = t;
        this.step(dt); this.render();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
    stop() { this.running = false; }
    render() {
      this.rgb = getComputedStyle(document.documentElement).getPropertyValue('--ink-rgb').trim() || '13,13,13';
      this.ctx.clearRect(0, 0, this.w, this.h);
      this.draw(this.ctx);
    }

    init() {
      this.cx = this.w * TREE.center[0]; this.cy = this.h * TREE.center[1];
      this.maxD = TREE.depth; this.maxNodes = clamp(Math.round(this.w * this.h / TREE.density), TREE.minNodes, TREE.maxNodes); this.rot = rand(0, TAU);
      this.dying = []; this.agents = []; this.spawnT = 0; this.fx = null; this.burst = null; this.hold = 0;
      this.root = this.mk(null); this.live = [this.root]; this.layout(); this.root.x = this.root.tx; this.root.y = this.root.ty;
    }
    mk(p) { const n = { p, ch: [], N: 0, V: 0, q: p ? p.q + gauss() * 0.7 : 0, x: p ? p.x : this.cx, y: p ? p.y : this.cy, tx: 0, ty: 0, ang: 0, al: p ? 0 : 1, size: 1, hot: this.burst ? 1 : 0 }; if (p) { p.ch.push(n); this.live.push(n); } return n; }
    layout() {
      const rx = this.w * TREE.spread[0] / this.maxD, ry = this.h * TREE.spread[1] / this.maxD; this.rx = rx; this.ry = ry;
      const sz = n => { let s = 1; for (const c of n.ch) s += sz(c); n.size = s; return s; }; sz(this.root);
      const pl = (n, a0, a1, d) => {
        const a = (a0 + a1) / 2; n.ang = a; n.tx = this.cx + Math.cos(a) * d * rx; n.ty = this.cy + Math.sin(a) * d * ry; if (!n.ch.length) return;
        let tot = 0; for (const c of n.ch) tot += Math.pow(c.size, 0.7); let cur = a0;
        for (const c of n.ch) { const sp = (a1 - a0) * Math.pow(c.size, 0.7) / tot; pl(c, cur, cur + sp, d + 1); cur += sp; }
      };
      pl(this.root, this.rot, this.rot + TAU, 0);
    }
    bias() { return this.m.in ? Math.atan2((this.m.y - this.cy) / this.ry, (this.m.x - this.cx) / this.rx) : null; }
    spawn() {
      let n = this.root; const path = [n], B = this.burst;
      const bias = B ? B.ang : this.bias(), pull = B ? TREE.burstPull : TREE.cursorPull;
      const cap = this.maxNodes * (B ? 1 + TREE.burstNodes : 1);
      for (;;) {
        const d = path.length - 1, mc = d === 0 ? TREE.rootBranches : TREE.branches;
        if (d < this.maxD && n.ch.length < mc && this.live.length < cap && (n.ch.length === 0 || Math.random() < (B ? d / this.maxD : 0.3))) { path.push(this.mk(n)); break; }
        if (!n.ch.length) break;
        const ln = Math.log(n.N + 1); let best = null, bs = -1e9;
        for (const c of n.ch) { let s = (c.N ? c.V / c.N : 0.5) + TREE.explore * Math.sqrt(ln / (c.N + 1)) + rand(0, 0.3); if (bias !== null) { const cs = Math.cos(c.ang - bias); s += pull * (B ? 2 * Math.pow((1 + cs) / 2, TREE.burstFocus) - 1 : cs); } if (s > bs) { bs = s; best = c; } }
        n = best; path.push(n);
      }
      const leaf = path[path.length - 1];
      this.agents.push({ path, p: 0, ph: 'down', r: Math.random() < 1 / (1 + Math.exp(-leaf.q)) ? 1 : 0, roll: null, rt: 0, k: 0 });
    }
    at(P, p) { const i = Math.min(P.length - 1, Math.floor(p)), f = p - i; if (i >= P.length - 1) return [P[i].x, P[i].y]; return [P[i].x + (P[i + 1].x - P[i].x) * f, P[i].y + (P[i + 1].y - P[i].y) * f]; }
    move(target) {
      const r = this.root; if (!r.ch.length) return;
      const c = target || r.ch.reduce((a, b) => b.N > a.N ? b : a);
      const keep = new Set(), walk = n => { keep.add(n); n.ch.forEach(walk); }; walk(c);
      for (const n of this.live) if (!keep.has(n)) { n.al = Math.min(n.al, 1); this.dying.push(n); }
      this.fx = { from: r, to: c, t: 1 }; r.ch = r.ch.filter(z => z !== c); c.p = null;
      this.root = c; this.live = [...keep]; this.agents = [];
    }
    step(dt) {
      this.rot += TREE.rotate * dt;
      const busy = this.m.in ? Math.max(1, TREE.hoverBusy) : 1;
      this.spawnT -= dt * busy; if (this.spawnT <= 0 && this.agents.length < TREE.maxProbes * busy) { this.spawn(); this.spawnT = TREE.probeEvery; }
      if (this.burst) {
        for (let i = 0; i < TREE.burstPerFrame && dt > 0; i++) this.spawn();
        this.burst.t -= dt; if (this.burst.t <= 0) { this.burst = null; this.hold = TREE.burstHold; }
      }
      const keep = [];
      for (const g of this.agents) {
        const P = g.path;
        if (g.ph === 'down') {
          g.p += TREE.probeSpeed * dt;
          if (g.p >= P.length - 1) {
            g.p = P.length - 1; g.ph = 'roll'; g.rt = 0; const L = P[P.length - 1];
            let a = L.p ? Math.atan2(L.ty - this.cy, L.tx - this.cx) : rand(0, TAU); const pts = [[0, 0]]; let px = 0, py = 0;
            for (let k = 0; k < 7; k++) { a += rand(-0.9, 0.9); px += Math.cos(a) * 8; py += Math.sin(a) * 8; pts.push([px, py]); } g.roll = pts;
          }
        } else if (g.ph === 'roll') { g.rt += dt / 28; if (g.rt >= 1) { g.ph = 'up'; g.p = P.length - 1; g.k = P.length; } }
        else { g.p -= TREE.backupSpeed * dt; while (g.k > 0 && g.p <= g.k - 1) { g.k--; P[g.k].N++; P[g.k].V += g.r; } if (g.p <= 0) continue; }
        keep.push(g);
      }
      this.agents = keep;
      if (this.hold > 0) this.hold -= dt;
      if (!this.burst && this.hold <= 0 && this.live.length >= this.maxNodes && this.root.N > TREE.rerootAfter) this.move(null);
      this.layout();
      const k = 1 - Math.pow(0.92, dt);
      const cool = Math.pow(TREE.burstGlow, dt);
      for (const n of this.live) { n.x += (n.tx - n.x) * k; n.y += (n.ty - n.y) * k; n.al = Math.min(1, n.al + 0.04 * dt); n.hot *= cool; }
      // Hover: branches near the cursor warm up (same glow as a burst, fading the same way).
      if (this.m.in && TREE.hoverGlow > 0) {
        const R = TREE.hoverRadius;
        for (const n of this.live) { const d = Math.hypot(n.x - this.m.x, n.y - this.m.y); if (d < R) n.hot = Math.max(n.hot, TREE.hoverGlow * (1 - d / R)); }
      }
      for (const n of this.dying) { n.al -= 0.022 * dt; n.x += (n.x - this.cx) * 0.006 * dt; n.y += (n.y - this.cy) * 0.006 * dt; }
      this.dying = this.dying.filter(n => n.al > 0);
      if (this.fx) { this.fx.t -= 0.015 * dt; if (this.fx.t <= 0) this.fx = null; }
    }
    draw(x) {
      const [a0, a1] = TREE.edgeAlpha;
      const lw = n => 0.5 + Math.min(2.4, Math.log1p(n.N) * 0.42) + n.hot, la = n => a0 + Math.min(a1, Math.log1p(n.N) * 0.085) + 0.6 * n.hot;
      const F = a => this.ink(a);
      for (const n of this.dying) { if (!n.p) continue; x.strokeStyle = F(la(n) * n.al); x.lineWidth = lw(n); x.beginPath(); x.moveTo(n.p.x, n.p.y); x.lineTo(n.x, n.y); x.stroke(); }
      if (this.fx) { const f = this.fx; x.strokeStyle = F(0.85 * f.t); x.lineWidth = 2; x.beginPath(); x.moveTo(f.from.x, f.from.y); x.lineTo(f.to.x, f.to.y); x.stroke(); }
      for (const n of this.live) { if (!n.p) continue; x.strokeStyle = F(la(n) * n.al); x.lineWidth = lw(n); x.beginPath(); x.moveTo(n.p.x, n.p.y); x.lineTo(n.x, n.y); x.stroke(); }
      for (const n of this.dying) { x.fillStyle = F(0.3 * n.al); x.beginPath(); x.arc(n.x, n.y, 1.2, 0, TAU); x.fill(); }
      for (const n of this.live) { x.fillStyle = F((0.3 + Math.min(0.5, n.N * 0.03) + 0.6 * n.hot) * n.al); x.beginPath(); x.arc(n.x, n.y, 1.1 + Math.min(2.2, Math.log1p(n.N) * 0.35), 0, TAU); x.fill(); }
      for (const g of this.agents) {
        const P = g.path;
        if (g.ph === 'down') {
          const pos = this.at(P, g.p), i = Math.floor(g.p); x.strokeStyle = F(0.5); x.lineWidth = 1.3; x.beginPath(); x.moveTo(P[0].x, P[0].y);
          for (let k = 1; k <= i && k < P.length; k++) x.lineTo(P[k].x, P[k].y); x.lineTo(pos[0], pos[1]); x.stroke();
          x.fillStyle = F(1); x.beginPath(); x.arc(pos[0], pos[1], 2.1, 0, TAU); x.fill();
        } else if (g.ph === 'roll') {
          const L = P[P.length - 1], pts = g.roll, m = Math.max(1, Math.ceil(g.rt * (pts.length - 1)));
          x.setLineDash([2, 3]); x.strokeStyle = F(0.55 * (1 - g.rt * 0.5)); x.lineWidth = 1; x.beginPath(); x.moveTo(L.x, L.y);
          for (let k = 1; k <= m; k++) x.lineTo(L.x + pts[k][0], L.y + pts[k][1]); x.stroke(); x.setLineDash([]);
          if (g.rt > 0.8) { const e = pts[pts.length - 1]; x.fillStyle = F(g.r ? 0.9 : 0.5); x.beginPath(); x.arc(L.x + e[0], L.y + e[1], 1.8, 0, TAU); x.fill(); }
        } else { const pos = this.at(P, Math.max(0, g.p)); x.fillStyle = F(g.r ? 0.9 : 0.6); x.beginPath(); x.arc(pos[0], pos[1], 1.8, 0, TAU); x.fill(); }
      }
      const r = this.root; x.strokeStyle = F(0.9); x.lineWidth = 1.2; x.beginPath(); x.arc(r.x, r.y, TREE.rootRing, 0, TAU); x.stroke();
      x.fillStyle = F(1); x.beginPath(); x.arc(r.x, r.y, 2.2, 0, TAU); x.fill();
    }
    // Click / tap: aim the search at that spot and flood it with probes.
    onDown() {
      const ang = Math.atan2((this.m.y - this.cy) / this.ry, (this.m.x - this.cx) / this.rx);
      this.burst = { ang, t: TREE.burstTime };
      for (let i = 0; i < TREE.burstProbes; i++) this.spawn();
    }
  }

  // ---- Mount on the hero ----
  const canvas = document.getElementById('tree');
  if (!canvas) return;
  const hero = canvas.parentElement;
  const tree = new Tree(canvas, hero);
  // Handle for the local tuning page (working_on_it/hero-lab.html): edit config live, regrow after shape changes.
  window.heroTree = { config: TREE, tree, regrow: () => { tree.init(); tree.step(0); tree.render(); } };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let onScreen = true;
  const resume = () => { if (!reduce && onScreen && !document.hidden) tree.start(); };
  // Don't burn CPU when the hero is scrolled away or the tab is hidden.
  new IntersectionObserver(e => { onScreen = e[0].isIntersecting; onScreen ? resume() : tree.stop(); }).observe(hero);
  document.addEventListener('visibilitychange', () => { document.hidden ? tree.stop() : resume(); });
  // Reduced motion shows one still frame of a grown tree; redraw it when the theme changes.
  if (reduce) { for (let i = 0; i < 900; i++) tree.step(1); tree.render(); }
  new MutationObserver(() => { if (!tree.running) tree.render(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  resume();
})();
