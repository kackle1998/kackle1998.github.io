'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — CRT post-processing & animated background
   (Balatro-style: rolling scan band, gentle flicker, flashes and
   shakes on impacts, and a posterised swirling-paint backdrop.)

   Levels (saved per browser):
     low - overlays + animated background (default)
     off - static scanlines, still background
   ============================================================ */

const CRT = {
  level: 'low',
  wrap: null,
  t0: performance.now(),

  init() {
    this.wrap = document.getElementById('screenWrap');
    let saved = null;
    try { saved = localStorage.getItem('cardgrave.crt'); } catch (e) { /* storage blocked */ }
    // Old 'high' saves fall back to 'low'. Unset on the handheld build: off, as its overlays and
    // swirling backdrop are more than a handheld's chip can draw smoothly.
    this.level = saved ? (saved === 'off' ? 'off' : 'low') : /[?&]handheld\b/.test(location.search) ? 'off' : 'low';
    Backdrop.init();
    this.apply();
    requestAnimationFrame((t) => this.frame(t));
  },

  setLevel(level) {
    this.level = level;
    try { localStorage.setItem('cardgrave.crt', level); } catch (e) { /* storage blocked */ }
    this.apply();
  },

  apply() {
    document.body.dataset.crt = this.level;
    if (this.level === 'off') Backdrop.drawOnce();
  },

  /* Flash the screen and optionally shake the picture; strength 0..1. */
  pulse(strength = 0.5, shake = false) {
    if (this.level === 'off') return;
    if (shake) {
      const s = 4 + strength * 8;
      this.wrap.animate([
        { transform: 'translate(0,0)' },
        { transform: `translate(${-s}px, ${s * 0.4}px)` },
        { transform: `translate(${s * 0.8}px, ${-s * 0.5}px)` },
        { transform: `translate(${-s * 0.4}px, ${s * 0.3}px)` },
        { transform: 'translate(0,0)' },
      ], { duration: 280, easing: 'steps(6)' });
    }
    const flash = document.getElementById('crtFlash');
    flash.animate([{ opacity: 0.12 * strength + 0.05 }, { opacity: 0 }], { duration: 220, easing: 'ease-out' });
  },

  /* A brief horizontal tear, used on turn changes. */
  glitch() {
    if (this.level === 'off') return;
    this.pulse(0.6);
    this.wrap.animate([
      { transform: 'translateX(0)', clipPath: 'inset(0 0 0 0)' },
      { transform: 'translateX(6px)', clipPath: 'inset(0 0 0 0)' },
      { transform: 'translateX(-3px)', clipPath: 'inset(0 0 0 0)' },
      { transform: 'translateX(0)', clipPath: 'inset(0 0 0 0)' },
    ], { duration: 160, easing: 'steps(4)' });
  },

  frame(now) {
    const t = (now - this.t0) / 1000;
    if (this.level !== 'off') {
      Flicker.frame(t);
      Backdrop.frame(t);
    }
    requestAnimationFrame((n) => this.frame(n));
  },
};

/* Slow, smooth brightness swell, like an old tube warming; no per-frame noise. */
const Flicker = {
  el: null,
  frame(t) {
    if (!this.el) this.el = document.getElementById('crtFlicker');
    const o = 0.015 + (Math.sin(t * 0.9) * 0.5 + 0.5) * 0.015 + (Math.sin(t * 0.37) * 0.5 + 0.5) * 0.01;
    this.el.style.opacity = o.toFixed(3);
  },
};

/* Posterised swirling paint, drawn with WebGL at low resolution for a pixel look. */
const Backdrop = {
  cv: null, gl: null, prog: null, uRes: null, uT: null, tick: 0, w: 0, h: 0,
  init() {
    this.cv = document.getElementById('bgfx');
    const gl = this.cv.getContext('webgl', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) { this.cv.style.background = this.bd[2]; return; }
    this.gl = gl;
    const vs = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
    const fs = `
      precision mediump float;
      uniform vec2 res; uniform float t; uniform float rot; uniform float warp; uniform vec3 mood; uniform vec2 shape;
      uniform vec2 drift; uniform vec3 pal[5];
      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);
        float r = length(uv) + 1e-4;
        // warp (0..1) winds the paint into a Bejeweled 2 style hyperspace tunnel.
        // mood: the ante's twist, churn and lift; shape: its rings and grade; drift: its rise (see MOODS below).
        float ang = atan(uv.y, uv.x) + rot - r * (mood.x + warp * 10.0) + sin(t * 0.21) * 0.4;
        vec2 p = vec2(cos(ang), sin(ang)) * r * 2.6 + drift;
        for (int i = 0; i < 5; i++) {
          p += mood.y * vec2(sin(p.y * 1.35 + t * 0.33 + float(i)), cos(p.x * 1.15 - t * 0.27 - float(i) * 0.7));
        }
        float v = 0.5 + 0.5 * sin(p.x * 1.3 + p.y * 1.1 + t * 0.25);
        v = v * 0.85 + 0.15 * (1.0 - smoothstep(0.2, 1.3, r));
        v = mix(v, 0.5 + 0.5 * sin(r * 16.0 - t * 0.6 + p.x * 0.25), shape.x);  // orrery rings
        v += mood.z + uv.y * shape.y;                                         // lift, and pale above / deep below
        float tunnel = 0.5 + 0.5 * sin(log(r) * 9.0 + t * 1.4 + ang * 3.0);
        v = mix(v, tunnel, warp);
        float q = floor(clamp(v, 0.0, 0.999) * 4.0);
        vec3 c = pal[0];                                     // the palette's 4 paint tones
        if (q > 0.5) c = pal[1];
        if (q > 1.5) c = pal[2];
        if (q > 2.5) c = pal[3];
        if (warp > 0.6 && r < 0.09 * warp) c = pal[4];       // vortex core
        gl_FragColor = vec4(c, 1.0);
      }`;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { this.gl = null; this.cv.style.background = this.bd[2]; return; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.uRes = gl.getUniformLocation(prog, 'res');
    this.uT = gl.getUniformLocation(prog, 't');
    this.uWarp = gl.getUniformLocation(prog, 'warp');
    this.uRot = gl.getUniformLocation(prog, 'rot');
    this.uMood = gl.getUniformLocation(prog, 'mood');
    this.uShape = gl.getUniformLocation(prog, 'shape');
    this.uDrift = gl.getUniformLocation(prog, 'drift');
    this.uPal = gl.getUniformLocation(prog, 'pal');
    this.setPalette(this.bd);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },
  /* bd: 4 paint tones then the vortex core, as '#rrggbb' (see PALETTES in js/options.js). */
  bd: ['#8f9a6c', '#a3ad7f', '#b3bc8a', '#c3cb9b', '#3b4430'],
  setPalette(bd) {
    this.bd = bd;
    if (!this.gl) { if (this.cv) this.cv.style.background = bd[2]; return; }
    const rgb = bd.flatMap((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255));
    this.gl.uniform3fv(this.uPal, new Float32Array(rgb));
    if (this.w) this.drawOnce();
  },
  resize() {
    if (!this.gl) return;
    // One backdrop pixel ~ one game-art pixel on screen.
    const px = Math.max(2, Math.round(4 * Math.min(window.innerWidth / 1280, window.innerHeight / 720)));
    this.w = Math.ceil(window.innerWidth / px);
    this.h = Math.ceil(window.innerHeight / px);
    this.cv.width = this.w; this.cv.height = this.h;
    this.gl.viewport(0, 0, this.w, this.h);
    this.draw((performance.now() - CRT.t0) / 1000);
  },
  /* Each ante's feel, in how the paint moves (the palette's tones never change): flow is how fast
     it runs, spin how fast it turns, twist how tightly it winds, churn how much it boils, lift
     leans it toward the pale tones (+) or the deep ones (-), ring lays slow concentric rings over
     it, rise carries it upward, and grade makes it paler above and deeper below.
     1, the casino: the original swirl. 2, the celestial: slow orrery rings, wide and pale.
     3, the witchy: a cauldron, boiling and rising, deep at the bottom. */
  MOODS: [
    { flow: 1, spin: 0.06, twist: 1.6, churn: 0.55, lift: 0, ring: 0, rise: 0, grade: 0 },
    { flow: 0.5, spin: 0.02, twist: 0.4, churn: 0.35, lift: 0.06, ring: 0.55, rise: 0, grade: 0 },
    { flow: 1.3, spin: 0, twist: 0.3, churn: 0.8, lift: -0.04, ring: 0, rise: 0.45, grade: 0.25 },
  ],
  mood: null, aim: null, mt: 0, rot: 0, rise: 0, lastT: null,
  /* Ease into ante n's mood over a couple of seconds (snaps when the backdrop is still). */
  setMood(n) {
    const aim = this.MOODS[Math.max(1, Math.min(n || 1, this.MOODS.length)) - 1];
    if (aim === this.aim) return;
    this.aim = aim;
    if (!this.mood || CRT.level === 'off') { this.mood = { ...aim }; this.drawOnce(); }
  },
  draw(t) {
    if (!this.gl) return;
    if (!this.mood) this.mood = { ...(this.aim = this.MOODS[0]) };
    const dt = this.lastT === null ? 0 : Math.max(0, Math.min(0.1, t - this.lastT)), m = this.mood;
    this.lastT = t;
    // Time and turn build up at the mood's own rates, so changing them never jumps the paint.
    const k = 1 - Math.exp(-dt / 0.8);
    for (const f in m) m[f] += (this.aim[f] - m[f]) * k;
    this.mt += dt * m.flow;
    this.rot += dt * m.spin;
    this.rise += dt * m.rise * m.flow;
    this.gl.uniform2f(this.uRes, this.w, this.h);
    this.gl.uniform1f(this.uT, this.mt + this.boost);
    this.gl.uniform1f(this.uRot, this.rot + this.boost * 0.06);
    this.gl.uniform3f(this.uMood, m.twist, m.churn, m.lift);
    this.gl.uniform2f(this.uShape, m.ring, m.grade);
    this.gl.uniform2f(this.uDrift, 0, -this.rise);
    this.gl.uniform1f(this.uWarp, this.warp);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  },
  // 30fps is plenty for slow paint; the vortex gets every frame.
  frame(t) { if (this.warp > 0 || ++this.tick % 2 === 0) this.draw(t); },
  drawOnce() { this.draw((performance.now() - CRT.t0) / 1000); },

  /* End-of-match warp: wind up 1.2s, spin for `hold` seconds, settle 1s. Time runs up to
     15x faster while it spins; `boost` keeps the extra time so the paint doesn't snap
     back. Resolves as it starts to settle, so the result can arrive with the calm. */
  warp: 0, boost: 0,
  vortex(hold = 1.2) {
    return new Promise((done) => {
      if (!this.gl || CRT.level === 'off') { done(); return; }
      const t0 = performance.now(), end = 1.2 + hold;
      let last = t0, settled = false;
      const step = (now) => {
        const e = (now - t0) / 1000;
        this.boost += ((now - last) / 1000) * this.warp * 14;
        last = now;
        this.warp = e < 1.2 ? e / 1.2 : e < end ? 1 : Math.max(0, 1 - (e - end));
        if (e >= end && !settled) { settled = true; done(); }
        if (this.warp > 0 || e < end) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  },
};
