'use strict';
/* ============================================================
   NIGHTSHADE SPELLSLINGING — CRT post-processing & animated background
   (Balatro-style: curved glass, chromatic aberration that spikes
   on impacts, rolling scan band, gentle flicker, and a
   posterised swirling-paint backdrop.)

   Quality levels (saved per browser):
     high - everything, incl. SVG curvature + RGB split + bloom
     low  - overlays + background only (no SVG filter)
     off  - static scanlines, still background
   ============================================================ */

const CRT = {
  level: 'high',
  wrap: null,
  offR: null, offB: null,
  base: 0.7,        // resting RGB split in px
  pulseAmt: 0,      // decays back to 0
  t0: performance.now(),

  init() {
    this.wrap = document.getElementById('screenWrap');
    this.offR = document.getElementById('crtOffR');
    this.offB = document.getElementById('crtOffB');
    document.getElementById('crtMap').setAttribute('href', this.barrelMap());
    let saved = null;
    try { saved = localStorage.getItem('cardgrave.crt'); } catch (e) { /* storage blocked */ }
    this.level = saved || 'high';
    this.autoTune = !saved; // only second-guess the default, never the player's choice
    Backdrop.init();
    this.apply();
    requestAnimationFrame((t) => this.frame(t));
  },

  /* If the full filter can't hold ~40fps on this machine, quietly drop to 'low'. */
  perf: { frames: 0, slow: 0, last: 0 },
  watchPerf(now) {
    const p = this.perf;
    const dt = now - p.last;
    p.last = now;
    if (!this.autoTune || this.level !== 'high' || document.hidden || dt > 250) return;
    p.frames++;
    if (dt > 25) p.slow++;
    if (p.frames >= 180) {
      if (p.slow / p.frames > 0.5) {
        this.level = 'low';
        this.apply();
        if (typeof toast === 'function') toast('CRT set to LOW for smoother play (TV button to change).');
      }
      this.autoTune = false;
    }
  },

  setLevel(level) {
    this.autoTune = false;
    this.level = level;
    try { localStorage.setItem('cardgrave.crt', level); } catch (e) { /* storage blocked */ }
    this.apply();
  },

  cycle() {
    const order = ['high', 'low', 'off'];
    this.setLevel(order[(order.indexOf(this.level) + 1) % order.length]);
    return this.level;
  },

  apply() {
    document.body.dataset.crt = this.level;
    this.wrap.style.filter = this.level === 'high' ? 'url(#crtFilter)' : 'none';
    if (this.level === 'off') Backdrop.drawOnce();
  },

  /* Displacement map that pulls the edges in like curved tube glass. */
  barrelMap() {
    const w = 640, h = 360;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const x = cv.getContext('2d');
    const img = x.createImageData(w, h);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const nx = (px / (w - 1)) * 2 - 1, ny = (py / (h - 1)) * 2 - 1;
        const r2 = nx * nx + ny * ny;
        const i = (py * w + px) * 4;
        img.data[i] = 128 + nx * r2 * 0.5 * 127;
        img.data[i + 1] = 128 + ny * r2 * 0.5 * 127;
        img.data[i + 2] = 128;
        img.data[i + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    return cv.toDataURL();
  },

  /* Kick the colour split and shake the picture; strength 0..1. */
  pulse(strength = 0.5, shake = false) {
    if (this.level === 'off') return;
    this.pulseAmt = Math.min(1.5, this.pulseAmt + strength);
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
    this.watchPerf(now);
    if (this.level !== 'off') {
      // Resting aberration breathes slowly; impacts add on top and decay.
      this.pulseAmt *= 0.9;
      if (this.pulseAmt < 0.01) this.pulseAmt = 0;
      if (this.level === 'high') {
        const split = this.base + Math.sin(t * 1.7) * 0.25 + this.pulseAmt * 7;
        const jy = this.pulseAmt * (Math.random() - 0.5) * 3;
        this.offR.setAttribute('dx', (-split).toFixed(2));
        this.offR.setAttribute('dy', jy.toFixed(2));
        this.offB.setAttribute('dx', split.toFixed(2));
        this.offB.setAttribute('dy', (-jy).toFixed(2));
      }
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
      uniform vec2 res; uniform float t;
      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);
        float r = length(uv);
        float ang = atan(uv.y, uv.x) + t * 0.06 - r * 1.6 + sin(t * 0.21) * 0.4;
        vec2 p = vec2(cos(ang), sin(ang)) * r * 2.6;
        for (int i = 0; i < 5; i++) {
          p += 0.55 * vec2(sin(p.y * 1.35 + t * 0.33 + float(i)), cos(p.x * 1.15 - t * 0.27 - float(i) * 0.7));
        }
        float v = 0.5 + 0.5 * sin(p.x * 1.3 + p.y * 1.1 + t * 0.25);
        v = v * 0.85 + 0.15 * (1.0 - smoothstep(0.2, 1.3, r));
        float q = floor(clamp(v, 0.0, 0.999) * 4.0);
        vec3 c = vec3(0.561, 0.604, 0.424);                 // #8f9a6c
        if (q > 0.5) c = vec3(0.639, 0.678, 0.498);         // #a3ad7f
        if (q > 1.5) c = vec3(0.702, 0.737, 0.541);         // #b3bc8a
        if (q > 2.5) c = vec3(0.765, 0.796, 0.608);         // #c3cb9b
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
    this.gl.uniform1f(this.uT, t);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  },
  frame(t) { if (++this.tick % 2 === 0) this.draw(t); }, // 30fps is plenty for slow paint
  drawOnce() { this.draw((performance.now() - CRT.t0) / 1000); },
};
