(function () {
  var C = BG.C, SIM = BG.SIM;
  var W = 880, H = 620;
  /* Virtual camera behind and above the approaching traffic (scene rebuilt from CCTV + radar). */
  var V = { CX: 440, F: 10247, FH: 235980, H0: -768.1, DCAM: 250, XCAM: -1.0 };
  function P(d, y, h) { var z = V.DCAM - d; return [V.CX + V.F * (-y - V.XCAM) / z, V.H0 + (V.FH - V.F * (h || 0)) / z, z]; }
  function U(d) { return V.F / (V.DCAM - d); } // pixels per metre at distance d

  var canvas = document.getElementById('scene'), ctx = canvas.getContext('2d');
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var scale = 1;
  function fit() {
    var r = canvas.getBoundingClientRect(); if (!r.width) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.width * dpr * H / W); scale = canvas.width / W;
  }
  if (window.ResizeObserver) new ResizeObserver(fit).observe(canvas);
  window.addEventListener('resize', fit);

  var LV = { 0: '#2EE6C5', 1: '#FF9A4D', 2: '#FF4D52' };
  var LVINK = { 0: '#062A24', 1: '#1A0A02', 2: '#1F0507' };

  /* ---------- drawing helpers ---------- */
  function gpoly(pts, fill, stroke, lw, dash) {
    ctx.beginPath();
    pts.forEach(function (p, i) { var q = P(p[0], p[1], p[2] || 0); if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]); });
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.save(); ctx.setLineDash(dash || []); ctx.lineWidth = lw || 1; ctx.strokeStyle = stroke; ctx.stroke(); ctx.restore(); }
  }
  function rr(x, y, w, h, r, fill) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
  function chip(text, x, y, bg, ink, size, align) {
    size = size || 11;
    ctx.font = '600 ' + size + 'px "IBM Plex Mono", ui-monospace, monospace';
    var w = ctx.measureText(text).width + 12, h = size + 8;
    if (align === 'center') x -= w / 2;
    x = Math.max(4, Math.min(W - w - 4, x)); y = Math.max(4, Math.min(H - h - 4, y));
    rr(x, y, w, h, 3, bg); ctx.fillStyle = ink; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(text, x + 6, y + h / 2 + 0.5);
    return { x: x, y: y, w: w, h: h };
  }
  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    function c(v) { return Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))); }
    return 'rgb(' + c(r) + ',' + c(g) + ',' + c(b) + ')';
  }

  /* ---------- static scene ---------- */
  function drawGround(nowMs) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#4E5F45'); g.addColorStop(1, '#5E7650');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    var D0 = -90, D1 = 140;
    // carriageway (lanes + shoulder)
    gpoly([[D0, 4.6], [D1, 4.6], [D1, -3.9], [D0, -3.9]], '#3A4047');
    gpoly([[D0, 4.6], [D1, 4.6], [D1, 3.5], [D0, 3.5]], '#484E55');
    // median strip and guard rail
    gpoly([[D0, -3.9], [D1, -3.9], [D1, -4.3], [D0, -4.3]], '#6B6F72');
    gpoly([[D0, -4.9], [D1, -4.9], [D1, -5.05], [D0, -5.05]], '#B8BDC2');
    // edge lines
    gpoly([[D0, 3.58], [D1, 3.58], [D1, 3.44], [D0, 3.44]], 'rgba(245,245,240,.9)');
    gpoly([[D0, -3.44], [D1, -3.44], [D1, -3.58], [D0, -3.58]], 'rgba(245,245,240,.9)');
    // lane divider (dashed)
    for (var d = D0; d < D1; d += 12) gpoly([[d, 0.07], [d + 3, 0.07], [d + 3, -0.07], [d, -0.07]], 'rgba(245,245,240,.85)');
    // closed area tint (taper + closed lane)
    var tint = 'rgba(255,140,40,.13)';
    gpoly([[C.TAPER_START_D, 3.5], [C.TAPER_END_D, 0], [C.CLOSED_END_D - 8, 0], [C.CLOSED_END_D - 8, 3.5]], tint);
    // closed-lane hatching
    ctx.save(); ctx.beginPath();
    [[C.TAPER_START_D, 3.5], [C.TAPER_END_D, 0], [C.CLOSED_END_D - 8, 0], [C.CLOSED_END_D - 8, 3.5]].forEach(function (p, i) { var q = P(p[0], p[1]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
    ctx.closePath(); ctx.clip();
    for (d = C.TAPER_START_D; d > C.CLOSED_END_D - 20; d -= 5) gpoly([[d, 3.5], [d - 1.2, 3.5], [d - 3.4, 0], [d - 2.2, 0]], 'rgba(255,170,60,.10)');
    ctx.restore();
    // worker zone
    var z = [[C.ZONE_D_MAX, C.ZONE_Y_MIN], [C.ZONE_D_MAX, C.ZONE_Y_MAX], [C.ZONE_D_MIN, C.ZONE_Y_MAX], [C.ZONE_D_MIN, C.ZONE_Y_MIN]];
    gpoly(z, 'rgba(255,150,50,.22)', '#FFA23F', 2, [8, 6]);
    // stop line across the open lane
    gpoly([[0.45, 0], [0.45, -3.44], [0, -3.44], [0, 0]], '#F4F6F7');
    // sensor coverage wedge from the trailer toward approaching traffic
    var sweep = reduced ? 0.5 : (nowMs / 2600) % 1;
    gpoly([[6, 8.0], [100, 4.6], [100, -3.8]], 'rgba(61,219,196,.05)');
    var sy = 4.6 - sweep * 8.4;
    ctx.save(); ctx.globalAlpha = 0.35;
    var a0 = P(6, 8.0), a1 = P(100, sy);
    ctx.strokeStyle = 'rgba(61,219,196,.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.stroke();
    ctx.restore();
  }

  function drawCone(q, nowMs) {
    var p = P(q.d, q.y), u = U(q.d), h = 0.7 * u, w = 0.42 * u;
    if (q.knocked) {
      var x = p[0] + q.knocked * -0.35 * u;
      ctx.fillStyle = '#FF6A1A'; ctx.beginPath(); ctx.ellipse(x, p[1] - 0.12 * u, 0.36 * u, 0.13 * u, q.knocked * 0.3, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#F4F4F0'; ctx.fillRect(x - 0.05 * u, p[1] - 0.22 * u, 0.1 * u, 0.2 * u);
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(p[0], p[1], w * 0.6, h * 0.07, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#22262B'; ctx.fillRect(p[0] - w * 0.55, p[1] - h * 0.08, w * 1.1, h * 0.08);
    ctx.fillStyle = '#FF6A1A'; ctx.beginPath(); ctx.moveTo(p[0] - w * 0.42, p[1] - h * 0.08); ctx.lineTo(p[0] + w * 0.42, p[1] - h * 0.08); ctx.lineTo(p[0] + w * 0.08, p[1] - h); ctx.lineTo(p[0] - w * 0.08, p[1] - h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#F4F4F0'; ctx.beginPath(); ctx.moveTo(p[0] - w * 0.29, p[1] - h * 0.42); ctx.lineTo(p[0] + w * 0.29, p[1] - h * 0.42); ctx.lineTo(p[0] + w * 0.2, p[1] - h * 0.62); ctx.lineTo(p[0] - w * 0.2, p[1] - h * 0.62); ctx.closePath(); ctx.fill();
  }

  // LED dot bitmaps for the VMS panel
  var ledCache = {};
  function ledDots(text) {
    if (ledCache[text]) return ledCache[text];
    var cw = 40, ch = 16, oc = document.createElement('canvas'); oc.width = cw; oc.height = ch;
    var o = oc.getContext('2d'); o.fillStyle = '#000'; o.fillRect(0, 0, cw, ch);
    o.fillStyle = '#fff'; o.font = 'bold 14px Arial, sans-serif'; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillText(text, cw / 2, ch / 2 + 1);
    var data = o.getImageData(0, 0, cw, ch).data, dots = [];
    for (var y = 0; y < ch; y++) for (var x = 0; x < cw; x++) if (data[(y * cw + x) * 4] > 110) dots.push([x, y]);
    ledCache[text] = { dots: dots, cw: cw, ch: ch };
    return ledCache[text];
  }

  function drawTrailer(S, nowMs) {
    var d = 6, y = 8.0, p = P(d, y), u = U(d), bx = p[0], by = p[1];
    function X(m) { return bx + m * u; }
    function Y(h) { return by - h * u; }
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(bx, by, 1.5 * u, 0.25 * u, 0, 0, 6.283); ctx.fill();
    // drawbar toward traffic
    ctx.fillStyle = '#C99A06'; ctx.beginPath(); ctx.moveTo(X(-0.5), Y(0.55)); ctx.lineTo(X(0.5), Y(0.55)); ctx.lineTo(X(0.08), Y(0.35)); ctx.lineTo(X(-0.08), Y(0.35)); ctx.closePath(); ctx.fill();
    // wheels
    ctx.fillStyle = '#16191C'; ctx.fillRect(X(-1.12), Y(0.62), 0.24 * u, 0.62 * u); ctx.fillRect(X(0.88), Y(0.62), 0.24 * u, 0.62 * u);
    ctx.fillStyle = '#D9DCDF'; ctx.fillRect(X(-1.08), Y(0.42), 0.16 * u, 0.2 * u); ctx.fillRect(X(0.92), Y(0.42), 0.16 * u, 0.2 * u);
    // chassis body
    rr(X(-0.95), Y(1.3), 1.9 * u, 0.8 * u, 0.06 * u, '#F2B705');
    ctx.fillStyle = '#D69F00'; ctx.fillRect(X(-0.95), Y(0.62), 1.9 * u, 0.12 * u);
    ctx.fillStyle = '#1B1E21'; ctx.fillRect(X(-0.3), Y(1.12), 0.6 * u, 0.24 * u);
    // posts
    ctx.fillStyle = '#9EA4AA'; ctx.fillRect(X(-0.55), Y(1.62), 0.1 * u, 0.34 * u); ctx.fillRect(X(0.45), Y(1.62), 0.1 * u, 0.34 * u);
    // panel
    var pw = 2.6, ph = 1.55, pb = 1.6;
    rr(X(-pw / 2), Y(pb + ph), pw * u, ph * u, 0.04 * u, '#F2B705');
    ctx.fillStyle = '#0B0D0F'; ctx.fillRect(X(-pw / 2 + 0.08), Y(pb + ph - 0.08), (pw - 0.16) * u, (ph - 0.26) * u);
    // strip under the face (plain, no brand)
    ctx.fillStyle = '#E5AA00'; ctx.fillRect(X(-pw / 2 + 0.08), Y(pb + 0.16), (pw - 0.16) * u, 0.1 * u);
    // LED text
    var txt = S.board, L = ledDots(txt), col = txt === 'STOP' ? '#FF3B30' : '#FFB020';
    var fx = X(-pw / 2 + 0.16), fy = Y(pb + ph - 0.14), fw = (pw - 0.32) * u, fh = (ph - 0.4) * u;
    var cell = Math.min(fw / L.cw, fh / L.ch), ox = fx + (fw - cell * L.cw) / 2, oy = fy + (fh - cell * L.ch) / 2;
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    for (var yy = 0; yy < L.ch; yy += 1) for (var xx = 0; xx < L.cw; xx += 2) ctx.fillRect(ox + xx * cell, oy + yy * cell, cell * 0.5, cell * 0.5);
    ctx.fillStyle = col;
    L.dots.forEach(function (q) { ctx.fillRect(ox + q[0] * cell + cell * 0.1, oy + q[1] * cell + cell * 0.1, cell * 0.78, cell * 0.78); });
    // top crossbar, mast, dome camera, radar
    var top = pb + ph;
    ctx.fillStyle = '#DADDE0'; ctx.fillRect(X(-1.2), Y(top + 0.24), 2.4 * u, 0.1 * u);
    ctx.fillRect(X(-0.05), Y(top + 1.3), 0.1 * u, 1.06 * u);
    ctx.strokeStyle = '#E8EAEC'; ctx.lineWidth = Math.max(1.5, 0.09 * u); ctx.beginPath();
    ctx.moveTo(X(0), Y(top + 1.3)); ctx.quadraticCurveTo(X(0), Y(top + 1.62), X(-0.35), Y(top + 1.62)); ctx.quadraticCurveTo(X(-0.62), Y(top + 1.62), X(-0.62), Y(top + 1.32)); ctx.stroke();
    ctx.fillStyle = '#F1F2F3'; ctx.fillRect(X(-0.76), Y(top + 1.34), 0.28 * u, 0.1 * u);
    ctx.fillStyle = '#3F7FB5'; ctx.beginPath(); ctx.arc(X(-0.62), Y(top + 1.22), 0.15 * u, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#2F3439'; ctx.fillRect(X(0.25), Y(top + 0.5), 0.34 * u, 0.24 * u);
    // radar ping
    if (!reduced) {
      var ph2 = (nowMs % 1400) / 1400;
      ctx.strokeStyle = 'rgba(61,219,196,' + (0.6 * (1 - ph2)).toFixed(2) + ')'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(X(0.42), Y(top + 0.38), (0.2 + ph2 * 1.2) * u, Math.PI * 0.55, Math.PI * 1.45); ctx.stroke();
    }
    // beacons on the panel corners (flash per section 7.1)
    var on = false;
    if (S.out.flash === 1) on = reduced ? true : Math.floor(nowMs / 500) % 2 === 0;
    if (S.out.flash === 2) on = reduced ? true : Math.floor(nowMs / 125) % 2 === 0;
    [-1, 1].forEach(function (k) {
      var lx = X(k * 1.12), ly = Y(top + 0.12), r = Math.max(2.5, 0.12 * u);
      ctx.fillStyle = on ? '#FFC02E' : '#5A4712'; ctx.beginPath(); ctx.arc(lx, ly, r, 0, 6.283); ctx.fill();
      if (on) { ctx.fillStyle = 'rgba(255,192,46,.3)'; ctx.beginPath(); ctx.arc(lx, ly, r * 2.8, 0, 6.283); ctx.fill(); }
    });
    return [X(-pw / 2), Y(top + 1.7)];
  }

  function drawArrowBoard(nowMs) {
    var d = 62, y = 4.1, p = P(d, y), u = U(d), bx = p[0], by = p[1];
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(bx, by, 0.9 * u, 0.15 * u, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#16191C'; ctx.fillRect(bx - 0.75 * u, by - 0.45 * u, 0.18 * u, 0.45 * u); ctx.fillRect(bx + 0.57 * u, by - 0.45 * u, 0.18 * u, 0.45 * u);
    rr(bx - 0.7 * u, by - 0.95 * u, 1.4 * u, 0.55 * u, 0.04 * u, '#F2B705');
    ctx.fillStyle = '#9EA4AA'; ctx.fillRect(bx - 0.04 * u, by - 1.3 * u, 0.08 * u, 0.4 * u);
    rr(bx - 0.8 * u, by - 2.2 * u, 1.6 * u, 0.95 * u, 0.04 * u, '#101316');
    var step = reduced ? 3 : Math.floor(nowMs / 280) % 4;
    ctx.fillStyle = '#FFB020';
    for (var i = 0; i < 3; i++) {
      if (i > step - 1 && step < 3) continue;
      var cx = bx + (-0.45 + i * 0.3) * u, cy = by - 1.72 * u, s = 0.2 * u;
      ctx.beginPath(); ctx.moveTo(cx - s * 0.5, cy - s); ctx.lineTo(cx + s * 0.6, cy); ctx.lineTo(cx - s * 0.5, cy + s); ctx.lineTo(cx - s * 0.1, cy); ctx.closePath(); ctx.fill();
    }
  }

  function drawWorker(w, f, S, nowMs) {
    var y = w.y0 + (w.y - w.y0) * f, p = P(w.d, y), u = U(w.d), sx = p[0], sy = p[1];
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(sx, sy, u * 0.35, u * 0.07, 0, 0, 6.283); ctx.fill();
    var moving = Math.abs(w.y - w.y0) > 0.001, sw = moving && !reduced ? Math.sin(nowMs / 90) * 0.1 : 0;
    ctx.fillStyle = '#2B3138'; ctx.fillRect(sx - u * (0.17 + sw), sy - u * 0.85, u * 0.14, u * 0.85); ctx.fillRect(sx + u * (0.03 + sw), sy - u * 0.85, u * 0.14, u * 0.85);
    ctx.fillStyle = '#FF8A00'; ctx.fillRect(sx - u * 0.26, sy - u * 1.48, u * 0.52, u * 0.66);
    ctx.fillStyle = '#E9E9E2'; ctx.fillRect(sx - u * 0.26, sy - u * 1.22, u * 0.52, u * 0.06); ctx.fillRect(sx - u * 0.04, sy - u * 1.48, u * 0.08, u * 0.66);
    ctx.fillStyle = '#D9A58A'; ctx.beginPath(); ctx.arc(sx, sy - u * 1.6, u * 0.13, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#F4F4F0'; ctx.beginPath(); ctx.arc(sx, sy - u * 1.65, u * 0.15, Math.PI, 6.283); ctx.fill();
    // wristband buzz
    var wm = S.out.wrist;
    if (wm !== 'none') {
      var col = wm === 'strong' ? '255,77,82' : wm === 'double' ? '46,230,197' : '255,154,77';
      var per = wm === 'strong' ? 260 : 420, ph = reduced ? 0.4 : (nowMs % per) / per;
      ctx.strokeStyle = 'rgba(' + col + ',' + (0.9 * (1 - ph)).toFixed(2) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx + u * 0.3, sy - u * 1.0, u * (0.1 + ph * 0.35), 0, 6.283); ctx.stroke();
    }
  }

  function carBox(c, f) {
    var d = c.d0 + (c.d - c.d0) * f, y = c.y0 + (c.y - c.y0) * f;
    return { d: d, y: y, len: c.type === 'truck' ? SIM.TRUCK_LEN : SIM.VEH_LEN };
  }
  function drawCar(c, f, S) {
    var b = carBox(c, f), d = b.d, y = b.y, len = b.len, hw = 0.9, dr = d + len;
    var yaw = Math.max(-0.7, Math.min(0.7, c.vy * 0.45));
    function Yat(s) { return y + yaw * (1 - s / len); } // s = distance from front
    var body = c.color || '#8C97A3';
    ctx.save();
    var fade = c.d < C.RANGE_MIN + 6 ? Math.max(0, (c.d - C.RANGE_MIN + 1) / 7) : 1; ctx.globalAlpha = Math.max(0.15, Math.min(1, fade + 0.15));
    // shadow
    gpoly([[d - 0.2, Yat(0) + hw + 0.15], [dr + 0.3, Yat(len) + hw + 0.15], [dr + 0.3, Yat(len) - hw - 0.15], [d - 0.2, Yat(0) - hw - 0.15]], 'rgba(0,0,0,.35)');
    // body top (bonnet + boot)
    gpoly([[d, Yat(0) + hw, 0.85], [dr, Yat(len) + hw, 0.85], [dr, Yat(len) - hw, 0.85], [d, Yat(0) - hw, 0.85]], shade(body, 0.08));
    // cabin: roof and rear window
    var c0 = 1.2, c1 = len - 0.9, ch = 1.45, cw = 0.78;
    gpoly([[d + c0, Yat(c0) + cw, ch], [d + c1, Yat(c1) + cw, ch], [d + c1, Yat(c1) - cw, ch], [d + c0, Yat(c0) - cw, ch]], shade(body, -0.12));
    gpoly([[d + c1, Yat(c1) + cw, ch], [dr - 0.25, Yat(len - 0.25) + hw * 0.95, 0.88], [dr - 0.25, Yat(len - 0.25) - hw * 0.95, 0.88], [d + c1, Yat(c1) - cw, ch]], '#1C2733');
    // rear face
    var yr = Yat(len);
    gpoly([[dr, yr + hw, 0.25], [dr, yr + hw, 0.88], [dr, yr - hw, 0.88], [dr, yr - hw, 0.25]], shade(body, -0.25));
    var braking = c.a <= -0.5 || c.v < 0.3;
    var tl = braking ? '#FF2A2A' : '#9E1B1B';
    gpoly([[dr, yr + hw - 0.02, 0.62], [dr, yr + hw - 0.02, 0.78], [dr, yr + hw - 0.36, 0.78], [dr, yr + hw - 0.36, 0.62]], tl);
    gpoly([[dr, yr - hw + 0.36, 0.62], [dr, yr - hw + 0.36, 0.78], [dr, yr - hw + 0.02, 0.78], [dr, yr - hw + 0.02, 0.62]], tl);
    if (braking) {
      [yr + hw - 0.19, yr - hw + 0.19].forEach(function (ty) { var q = P(dr, ty, 0.7), u = U(dr); ctx.fillStyle = 'rgba(255,40,40,.28)'; ctx.beginPath(); ctx.arc(q[0], q[1], 0.32 * u, 0, 6.283); ctx.fill(); });
    }
    gpoly([[dr, yr + 0.26, 0.36], [dr, yr + 0.26, 0.5], [dr, yr - 0.26, 0.5], [dr, yr - 0.26, 0.36]], '#E7E8E4');
    gpoly([[dr, yr + hw, 0], [dr, yr + hw, 0.3], [dr, yr + hw - 0.3, 0.3], [dr, yr + hw - 0.3, 0]], '#121417');
    gpoly([[dr, yr - hw + 0.3, 0], [dr, yr - hw + 0.3, 0.3], [dr, yr - hw, 0.3], [dr, yr - hw, 0]], '#121417');
    ctx.restore();
  }

  function pathText(c, S) {
    if (c.conf > 0) return c.reasons.map(function (r) { return BG.REASON_TEXT[r]; }).join(' · ');
    if (S.sup[c.id]) return 'Cancelled by worker';
    if (c.ageT < 10) return 'Tracking';
    if (c.cleared) return 'Cleared to pass';
    if (c.vy <= -0.3) return 'Merging into the open lane';
    if (c.v < 0.3) return c.y > 0 ? 'Stopped in the closed lane' : (c.d > 0 && c.d < 4 ? 'Stopped at the line' : 'Stopped in queue');
    if (S.board === 'STOP' && c.a <= -0.5 && c.d > 0) return 'Slowing for the STOP board';
    if (c.d <= 0) return 'Past the stop line';
    return c.y > 0 ? 'In the closed lane' : 'Keeping to the open lane';
  }

  function drawOverlay(c, f, S) {
    var b = carBox(c, f), key = c.conf, col = LV[key], hi = key > 0;
    ctx.save();
    // predicted path (5 s)
    if (c.pts && c.pts.length > 1 && c.v > 0.5 && c.d > C.RANGE_MIN + 2) {
      var dd = b.d - c.d0;
      var pts = c.pts.map(function (q) { return P(q[0] + dd, q[1] + (b.y - c.y0)); });
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.setLineDash(hi ? [1, 9] : [1, 8]);
      ctx.globalAlpha = hi ? 1 : 0.7;
      ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = hi ? 8 : 5;
      ctx.beginPath(); pts.forEach(function (q, i) { if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = hi ? 5 : 3;
      ctx.beginPath(); pts.forEach(function (q, i) { if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.stroke();
      ctx.setLineDash([]);
      var e = pts[pts.length - 1], e0 = pts[Math.max(0, pts.length - 3)], ang = Math.atan2(e[1] - e0[1], e[0] - e0[0]);
      if (Math.hypot(e[0] - e0[0], e[1] - e0[1]) > 0.5) {
        var s = hi ? 11 : 8;
        ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(e[0] + Math.cos(ang) * s, e[1] + Math.sin(ang) * s);
        ctx.lineTo(e[0] + Math.cos(ang + 2.5) * s, e[1] + Math.sin(ang + 2.5) * s); ctx.lineTo(e[0] + Math.cos(ang - 2.5) * s, e[1] + Math.sin(ang - 2.5) * s);
        ctx.closePath(); ctx.stroke(); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // brackets around the car
    var dr = b.d + b.len, a = P(dr, b.y + 1.05, 0), bq = P(dr, b.y - 1.05, 0), t1 = P(b.d + 1.2, b.y, 1.55);
    var x0 = a[0] - 3, x1 = bq[0] + 3, y1 = a[1] + 3, y0 = Math.min(t1[1], P(dr, b.y, 1.5)[1]) - 3;
    var L = Math.max(7, Math.min(x1 - x0, y1 - y0) * 0.28);
    function br() {
      ctx.beginPath();
      ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0);
      ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
      ctx.moveTo(x0, y1 - L); ctx.lineTo(x0, y1); ctx.lineTo(x0 + L, y1);
      ctx.moveTo(x1 - L, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 - L); ctx.stroke();
    }
    ctx.lineCap = 'square'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = hi ? 6 : 4; br();
    ctx.strokeStyle = col; ctx.lineWidth = hi ? 3.5 : 2; br();
    var interesting = c.y > -0.6 || c.vy < -0.2 || c.tag;
    var txt = hi ? '#' + c.id + ' ' + BG.LEVEL_NAME[key] + ' ' + Math.round(c.v * 3.6) + ' km/h' : (interesting ? '#' + c.id + ' NORMAL' : '#' + c.id);
    if (c.cleared && !hi) txt = '#' + c.id + ' CLEARED';
    chip(txt, x0 - 1, y0 - 19, col, LVINK[key], hi ? 12 : 10.5);
    ctx.restore();
  }

  function render(S, f, showAI, nowMs) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawGround(nowMs);
    // depth-sorted objects, far first
    var items = [];
    S.cones.forEach(function (q) { items.push({ z: V.DCAM - q.d, fn: function () { drawCone(q, nowMs); } }); });
    items.push({ z: V.DCAM - 6, fn: function () { drawTrailer(S, nowMs); } });
    items.push({ z: V.DCAM - 62, fn: function () { drawArrowBoard(nowMs); } });
    S.workers.forEach(function (w) { items.push({ z: V.DCAM - w.d, fn: function () { drawWorker(w, f, S, nowMs); } }); });
    var cars = S.cars.filter(function (c) { return !c.gone; });
    cars.forEach(function (c) { var b = carBox(c, f); items.push({ z: V.DCAM - (b.d + b.len), fn: function () { drawCar(c, f, S); } }); });
    items.sort(function (a, b) { return b.z - a.z; });
    items.forEach(function (it) { it.fn(); });
    // labels on the road
    var sq = P(0.2, -3.6); chip('STOP LINE', sq[0] + 8, sq[1] - 10, 'rgba(20,26,32,.85)', '#FFFFFF', 10.5);
    if (showAI) cars.forEach(function (c) { if (c.inRange && c.d > C.RANGE_MIN + 1) drawOverlay(c, f, S); });
    // top fade
    var fg = ctx.createLinearGradient(0, 0, 0, 50); fg.addColorStop(0, 'rgba(12,17,22,.55)'); fg.addColorStop(1, 'rgba(12,17,22,0)');
    ctx.fillStyle = fg; ctx.fillRect(0, 0, W, 50);
    // HUD
    rr(10, H - 36, 212, 26, 3, 'rgba(10,14,18,.8)');
    var rec = reduced || Math.floor(nowMs / 700) % 2 === 0;
    ctx.fillStyle = rec ? '#3DDBC4' : '#1D5E56'; ctx.beginPath(); ctx.arc(23, H - 23, 4.5, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#EAF0F5'; ctx.font = '600 11.5px "IBM Plex Mono", ui-monospace, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('AI SCENE VIEW · CCTV + RADAR', 34, H - 22.5);
    var tt = 'T+ ' + S.t.toFixed(1) + ' s', tw = ctx.measureText(tt).width + 16;
    rr(W - tw - 10, 10, tw, 26, 3, 'rgba(10,14,18,.8)'); ctx.fillStyle = '#EAF0F5'; ctx.fillText(tt, W - tw - 2, 23.5);
    if (S.sys > 0) {
      var pr = S.primary, why = pr ? BG.REASON_TEXT[pr.reasons[0]] : '';
      var bt = 'L' + S.sys + ' ' + BG.LEVEL_NAME[S.sys] + (pr ? ' · #' + pr.id : '');
      ctx.font = '700 20px "Barlow Condensed", "Arial Narrow", sans-serif';
      var bw = Math.min(W - 340, ctx.measureText(bt).width + 28);
      rr(W / 2 - bw / 2, 8, bw, 32, 4, S.sys === 2 ? '#FF4D52' : '#FF9A4D');
      ctx.fillStyle = S.sys === 2 ? '#1F0507' : '#1A0A02'; ctx.textAlign = 'center'; ctx.fillText(bt, W / 2, 24.5);
    }
    var nt = S.held ? 'Auto-STOP held: a car is too close to stop' : (S.l2Lock && S.board === 'STOP') ? 'Board locked on STOP until controller release' : '';
    if (nt) { ctx.font = '600 11px "IBM Plex Mono", ui-monospace, monospace'; var nw = ctx.measureText(nt).width + 12; chip(nt, W - 10 - nw, 44, 'rgba(10,14,18,.88)', S.held ? '#FFB35A' : '#FF8A8D', 11); }
  }

  /* ---------- DOM ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var el = { board: $('boardChip'), alert: $('alertChip'), focus: $('focusChip'), resp: $('resp'), lvl: $('respLvl'), why: $('respWhy'),
    oBoard: $('oBoard'), oFlash: $('oFlash'), oSiren: $('oSiren'), oWrist: $('oWrist'), note: $('respNote'),
    list: $('list'), count: $('count'), evlog: $('evlog'), dec: $('dec'), live: $('live'), caption: $('caption') };
  var rows = {}, lastLive = -1;
  function boardText(S) { return S.board + (S.board === 'STOP' ? (S.source === 'ai_auto' ? ' · AI auto' : ' · controller') : ''); }
  function fmt(n, dg) { return (n >= 0 ? '' : '−') + Math.abs(n).toFixed(dg); }
  function updateDom(S) {
    el.board.textContent = 'Sign board: ' + boardText(S);
    el.alert.textContent = 'Alert: L' + S.sys + ' ' + BG.LEVEL_NAME[S.sys]; el.alert.setAttribute('data-level', S.sys);
    var nev = S.events.length + (S.ev ? 1 : 0);
    el.focus.textContent = 'AI watched ' + S.watched + ' vehicle' + (S.watched === 1 ? '' : 's') + ' · ' + nev + ' needed your attention';
    el.resp.setAttribute('data-level', S.sys);
    el.lvl.textContent = 'L' + S.sys + ' ' + BG.LEVEL_NAME[S.sys];
    var pr = S.primary;
    el.why.textContent = pr ? '#' + pr.id + ': ' + pr.reasons.map(function (r) { return BG.REASON_TEXT[r]; }).join(' · ') : 'No vehicle needs attention.';
    el.oBoard.textContent = boardText(S);
    el.oFlash.textContent = S.out.flash === 2 ? 'High-intensity flash, 4 per second' : S.out.flash === 1 ? 'Amber slow flash, 1 per second' : 'Off';
    el.oSiren.textContent = S.out.siren ? 'On' : 'Off';
    el.oWrist.textContent = { none: 'Quiet', short: 'Short buzz (can cancel)', strong: 'Strong buzz until EVACUATE ends', double: 'Two light buzzes: traffic resumed' }[S.out.wrist];
    var note = '';
    if (S.held) note = 'Auto-STOP held: a vehicle is too close to stop. Beacons and wristbands still warn.';
    else if (S.l2Lock && S.board === 'STOP') note = 'Board locked on STOP after EVACUATE. Controller must release (press SLOW).';
    el.note.hidden = !note; el.note.textContent = note;
    // vehicle list
    var live = S.cars.filter(function (c) { return !c.gone && c.inRange; });
    live.sort(function (a, b) { return b.conf - a.conf || a.d - b.d; });
    el.count.textContent = live.length + ' tracked';
    var MAX = 8, seen = {};
    live.slice(0, MAX).forEach(function (c, i) {
      var r = rows[c.id];
      if (!r) {
        r = document.createElement('article'); r.className = 'veh';
        r.innerHTML = '<div class="r1"><span class="vid"></span><span class="badge"></span><span class="spd"><span class="sv"></span><small>km/h</small></span></div><div class="r2"></div><div class="r3"></div>';
        rows[c.id] = r;
      }
      r.setAttribute('data-level', c.conf);
      r.querySelector('.vid').textContent = '#' + c.id;
      r.querySelector('.badge').textContent = BG.LEVEL_NAME[c.conf];
      r.querySelector('.sv').textContent = Math.round(c.v * 3.6);
      var eta = c.d > 0 && c.v > 0.5 ? (c.d / c.v).toFixed(1) + ' s' : 'n/a';
      r.querySelector('.r2').textContent = 'd ' + fmt(c.d0, 0) + ' m · DRAC ' + (S.board !== 'STOP' ? 'n/a' : c.drac > 9.9 ? '9.9+' : c.drac.toFixed(1)) + ' · ETA ' + eta + ' · lat ' + (c.y0 >= 0 ? '+' : '−') + Math.abs(c.y0).toFixed(1) + ' m ' + (c.vy >= 0 ? '+' : '−') + Math.abs(c.vy).toFixed(1) + ' m/s';
      r.querySelector('.r3').textContent = pathText(c, S);
      if (el.list.children[i] !== r) el.list.insertBefore(r, el.list.children[i] || null);
      seen[c.id] = true;
    });
    Array.prototype.slice.call(el.list.children).forEach(function (n) {
      var id = n.querySelector && n.querySelector('.vid') ? parseInt(n.querySelector('.vid').textContent.slice(1), 10) : null;
      if (n.className === 'more' || !seen[id]) n.remove();
    });
    if (live.length > MAX) { var m = document.createElement('p'); m.className = 'more'; m.textContent = '+' + (live.length - MAX) + ' more, all NORMAL'; el.list.appendChild(m); }
    // event log
    var evs = S.events.concat(S.ev ? [S.ev] : []).slice(-4).reverse();
    el.evlog.innerHTML = '';
    if (!evs.length) { var p0 = document.createElement('p'); p0.className = 'more'; p0.textContent = 'No events yet.'; el.evlog.appendChild(p0); }
    evs.forEach(function (e) {
      var d = document.createElement('div'); d.className = 'ev'; d.setAttribute('data-max', e.max);
      var h = document.createElement('span'); h.className = 'h';
      h.textContent = 'T+' + e.start.toFixed(1) + ' to ' + (e.end === null ? 'now' : e.end.toFixed(1)) + ' · #' + e.id + ' ' + e.type + ' · max L' + e.max;
      var b = document.createElement('span');
      var why = e.first + (e.maxReason && e.maxReason !== e.first ? ' then ' + e.maxReason : '');
      var act = e.action === 'pending' ? 'Board: deciding' : e.action;
      b.textContent = why + ' · ' + act + (e.locked ? ' · locked' : '') + (e.cancelled ? ' · cancelled (false alarm)' : '');
      d.appendChild(h); d.appendChild(b); el.evlog.appendChild(d);
    });
    var decs = S.log.filter(function (l) { return !/entered view/.test(l.msg) && (l.kind !== 'muted' || /ignored|nothing/.test(l.msg)); }).slice(-3).reverse();
    el.dec.innerHTML = '';
    decs.forEach(function (l) { var p = document.createElement('span'); var b = document.createElement('b'); b.textContent = 'T+' + l.t.toFixed(1); p.appendChild(b); p.appendChild(document.createTextNode(l.msg)); el.dec.appendChild(p); });
    if (S.sys !== lastLive) { lastLive = S.sys; el.live.textContent = 'Alert level L' + S.sys + ' ' + BG.LEVEL_NAME[S.sys] + (pr ? ', vehicle ' + pr.id + ': ' + BG.REASON_TEXT[pr.reasons[0]] : ''); }
  }

  /* ---------- controls and loop ---------- */
  var scnSel = $('scn'), playBtn = $('play'), speedSel = $('speed'), aiChk = $('ai'), scrub = $('scrub');
  BG_SCENARIOS.forEach(function (s, i) { var o = document.createElement('option'); o.value = i; o.textContent = s.label; scnSel.appendChild(o); });
  var scn = BG_SCENARIOS[0], S = null, manual = [], acc = 0, playing = !reduced, speed = 1, showAI = true, holdUntil = 0;
  function build(targetK) {
    S = BG.createSim(scn); acc = 0;
    manual = manual.filter(function (m) { return m.k <= targetK; });
    while (S.k <= targetK) { applyManual(); BG.tick(S); }
    rows = {}; el.list.innerHTML = '';
  }
  function applyManual() { manual.forEach(function (m) { if (m.k === S.k) S.queued.push({ type: m.type, scripted: false }); }); }
  function load(i) {
    scn = BG_SCENARIOS[i]; manual = []; holdUntil = 0;
    scrub.max = String(Math.round(scn.duration * 10));
    el.caption.innerHTML = '<b>' + scn.label + '.</b> ' + scn.caption;
    build(0);
  }
  function syncPlay() { playBtn.textContent = playing ? 'Pause' : 'Play'; }
  scnSel.addEventListener('change', function () { load(parseInt(scnSel.value, 10)); playing = true; syncPlay(); });
  playBtn.addEventListener('click', function () { playing = !playing; if (playing && S.t >= scn.duration) { manual = []; build(0); } syncPlay(); });
  $('restart').addEventListener('click', function () { manual = []; holdUntil = 0; build(0); playing = true; syncPlay(); });
  speedSel.addEventListener('change', function () { speed = parseFloat(speedSel.value) || 1; });
  aiChk.addEventListener('change', function () { showAI = aiChk.checked; });
  scrub.addEventListener('input', function () { holdUntil = 0; build(parseInt(scrub.value, 10)); updateDom(S); });
  function press(type) { manual.push({ k: S.k, type: type }); if (!playing) { applyManual(); BG.tick(S); updateDom(S); } }
  $('rStop').addEventListener('click', function () { press('remoteSTOP'); });
  $('rSlow').addEventListener('click', function () { press('remoteSLOW'); });
  $('rCancel').addEventListener('click', function () { press('cancel'); });

  load(0);
  if (reduced) { build(BG.TK(19.0)); }
  syncPlay();
  var last = performance.now(), domAt = 0;
  function frame(now) {
    var dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (playing) {
      if (holdUntil) { if (now >= holdUntil) { holdUntil = 0; manual = []; build(0); } }
      else {
        acc += dt * speed;
        while (acc >= C.TICK) {
          if (S.t >= scn.duration - 1e-9) { acc = 0; holdUntil = now + 2500; break; }
          applyManual(); BG.tick(S); acc -= C.TICK;
        }
      }
    }
    var f = holdUntil || !playing ? 1 : Math.min(1, acc / C.TICK);
    render(S, f, showAI, now);
    if (now - domAt > 100) { domAt = now; updateDom(S); scrub.value = String(Math.min(S.k, parseInt(scrub.max, 10))); }
    requestAnimationFrame(frame);
  }
  fit(); updateDom(S);
  requestAnimationFrame(frame);
})();
