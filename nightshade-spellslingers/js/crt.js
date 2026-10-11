'use strict';
/* ============================================================
   NIGHTSHADE SPELLSLINGING — CRT post-processing & animated background
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
    this.level = saved === 'off' ? 'off' : 'low'; // old 'high' saves fall back to 'low'
    Backdrop.init();
    this.apply();
    requestAnimationFrame((t) => this.frame(t));
  },

  setLevel(level) {
    this.level = level;
    try { localStorage.setItem('cardgrave.crt', level); } catch (e) { /* storage blocked */ }
    this.apply();
  },

  cycle() {
    this.setLevel(this.level === 'off' ? 'low' : 'off');
    return this.level === 'off' ? 'off' : 'on';
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
    if (!gl) { this.cv.style.background = '#b3bc8a'; return; }
    this.gl = gl;
    const vs = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
    const fs = `
      precision mediump float;
      uniform vec2 res; uniform float t; uniform float warp;
      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);
        float r = length(uv) + 1e-4;
        // warp (0..1) winds the paint into a Bejeweled 2 style hyperspace tunnel.
        float ang = atan(uv.y, uv.x) + t * 0.06 - r * (1.6 + warp * 10.0) + sin(t * 0.21) * 0.4;
        vec2 p = vec2(cos(ang), sin(ang)) * r * 2.6;
        for (int i = 0; i < 5; i++) {
          p += 0.55 * vec2(sin(p.y * 1.35 + t * 0.33 + float(i)), cos(p.x * 1.15 - t * 0.27 - float(i) * 0.7));
        }
        float v = 0.5 + 0.5 * sin(p.x * 1.3 + p.y * 1.1 + t * 0.25);
        v = v * 0.85 + 0.15 * (1.0 - smoothstep(0.2, 1.3, r));
        float tunnel = 0.5 + 0.5 * sin(log(r) * 9.0 + t * 1.4 + ang * 3.0);
        v = mix(v, tunnel, warp);
        float q = floor(clamp(v, 0.0, 0.999) * 4.0);
        vec3 c = vec3(0.561, 0.604, 0.424);                 // #8f9a6c
        if (q > 0.5) c = vec3(0.639, 0.678, 0.498);         // #a3ad7f
        if (q > 1.5) c = vec3(0.702, 0.737, 0.541);         // #b3bc8a
        if (q > 2.5) c = vec3(0.765, 0.796, 0.608);         // #c3cb9b
        if (warp > 0.6 && r < 0.09 * warp) c = vec3(0.231, 0.267, 0.188); // #3b4430 core
        gl_FragColor = vec4(c, 1.0);
      }`;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { this.gl = null; this.cv.style.background = '#b3bc8a'; return; }
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
    this.resize();
    window.addEventListener('resize', () => this.resize());
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
  draw(t) {
    if (!this.gl) return;
    this.gl.uniform2f(this.uRes, this.w, this.h);
    this.gl.uniform1f(this.uT, t + this.boost);
    this.gl.uniform1f(this.uWarp, this.warp);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  },
  // 30fps is plenty for slow paint; the vortex gets every frame.
  frame(t) { if (this.warp > 0 || ++this.tick % 2 === 0) this.draw(t); },
  drawOnce() { this.draw((performance.now() - CRT.t0) / 1000); },

  /* Victory warp: wind up 1.2s, spin 1.2s, settle 1s. Time runs up to 15x faster
     while it spins; `boost` keeps the extra time so the paint doesn't snap back.
     Resolves as it starts to settle, so the result can arrive with the calm. */
  warp: 0, boost: 0,
  vortex() {
    return new Promise((done) => {
      if (!this.gl || CRT.level === 'off') { done(); return; }
      const t0 = performance.now();
      let last = t0, settled = false;
      const step = (now) => {
        const e = (now - t0) / 1000;
        this.boost += ((now - last) / 1000) * this.warp * 14;
        last = now;
        this.warp = e < 1.2 ? e / 1.2 : e < 2.4 ? 1 : Math.max(0, 1 - (e - 2.4));
        if (e >= 2.4 && !settled) { settled = true; done(); }
        if (this.warp > 0 || e < 2.4) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  },
};
