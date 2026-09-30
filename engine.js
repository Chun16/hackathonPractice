/* BatonGuard decision engine (spec v1.1) + demo traffic simulator.
   The decision part (sections 4 to 8 of the spec) only reads vehicle data and returns decisions.
   The simulator part moves vehicles, workers and cones; it is not part of the logic spec. */
var BG = (function () {
  var KMH = 1 / 3.6;

  /* ---------- Spec section 10: every logic constant lives here ---------- */
  var C = {
    TICK: 0.1,
    RANGE_MIN: -25, RANGE_MAX: 100,
    SPEED_LIMIT_KMH: 40, SPEEDING_KMH: 50, MIN_SPEED_KMH: 10, STOPPED_KMH: 5,
    DRAC_EARLY: 2.0, DRAC_L1: 3.0, DRAC_L2: 4.5,
    COMFORT_DECEL: 3.0, REACTION_TIME: 1.0, TRUCK_FACTOR: 0.8,
    BRAKING_ACCEL: -0.5, MIN_AGE: 1.0,
    DRIFT_VY: 0.5, ZONE_TIME: 3.0, CLOSED_TIME: 3.0, PREDICT_HORIZON: 5.0,
    VEHICLE_HALF_WIDTH: 1.0, LANE_WIDTH: 3.5,
    TAPER_START_D: 55, TAPER_END_D: 25, CLOSED_END_D: -25,
    ZONE_D_MIN: -20, ZONE_D_MAX: 0, ZONE_Y_MIN: 0.5, ZONE_Y_MAX: 4.5,
    CONFIRM_K: 3, CONFIRM_N: 5, DOWNGRADE_HOLD: 1.0,
    RAN_STOP_GRACE: 3.0, STOP_REACT_GRACE: 1.5, RESTORE_HOLD: 3.0,
    FLASH_L1_HZ: 1, FLASH_L2_HZ: 4
  };
  function TK(sec) { return Math.round(sec / C.TICK); }
  var T_MIN_AGE = TK(C.MIN_AGE), T_DOWN = TK(C.DOWNGRADE_HOLD), T_RAN = TK(C.RAN_STOP_GRACE),
      T_REACT = TK(C.STOP_REACT_GRACE), T_RESTORE = TK(C.RESTORE_HOLD), T_REACTION = TK(C.REACTION_TIME);
  var V_SPEEDING = C.SPEEDING_KMH * KMH, V_MIN = C.MIN_SPEED_KMH * KMH, V_STOPPED = C.STOPPED_KMH * KMH;

  /* ---------- Simulation-only constants ---------- */
  var SIM = {
    VEH_LEN: 4.5, TRUCK_LEN: 9.0, LANE1_Y: 1.75, LANE2_Y: -1.75,
    IDM_A: 1.4, IDM_B: 2.0, IDM_S0: 2.5, IDM_T: 1.3,
    STOP_TARGET_D: 1.0,           // IDM drivers stop about 1 m before the line
    WORKER_EVAC_V: 1.8, WORKER_RETURN_V: 1.0, WORKER_SAFE_Y: 5.9, WORKER_RETURN_AFTER: 4.0,
    DRIFT_MAX_Y: 3.0
  };

  /* ---------- Geometry (spec section 2) ---------- */
  function coneY(d) {
    if (d > C.TAPER_START_D || d < C.CLOSED_END_D) return null;
    if (d >= C.TAPER_END_D) return C.LANE_WIDTH * (d - C.TAPER_END_D) / (C.TAPER_START_D - C.TAPER_END_D);
    return 0;
  }
  function inClosed(d, edge) { var c = coneY(d); return c !== null && edge > c; }
  function inZone(d, edge) {
    return d >= C.ZONE_D_MIN && d <= C.ZONE_D_MAX && edge >= C.ZONE_Y_MIN && edge <= C.ZONE_Y_MAX;
  }

  /* ---------- Section 4 calculations ---------- */
  function factor(c) { return c.type === 'truck' ? C.TRUCK_FACTOR : 1; }
  function canStop(c) {
    var r = c.d - c.v * C.REACTION_TIME;
    if (r <= 0) return false;
    return (c.v * c.v) / (2 * r) <= C.COMFORT_DECEL * factor(c);
  }
  function predict(c, aged) {
    var a = aged ? Math.min(c.a, 0) : 0;
    var tz = Infinity, tc = Infinity, pts = [];
    var n = Math.round(C.PREDICT_HORIZON / C.TICK);
    for (var i = 0; i <= n; i++) {
      var t = i * C.TICK, dd;
      if (a < 0) { var te = Math.min(t, c.v / -a); dd = c.d - (c.v * te + 0.5 * a * te * te); }
      else dd = c.d - c.v * t;
      var yy = c.y + c.vy * t, edge = yy + C.VEHICLE_HALF_WIDTH;
      if (tz === Infinity && inZone(dd, edge)) tz = t;
      if (tc === Infinity && inClosed(dd, edge)) tc = t;
      if (i % 2 === 0) pts.push([dd, yy]);
    }
    return { tz: tz, tc: tc, pts: pts };
  }

  var LEVEL_NAME = ['NORMAL', 'CAUTION', 'EVACUATE'];
  var REASON_TEXT = {
    ZONE_3S: 'Entering worker zone within 3 s',
    DRAC_CRITICAL: 'May not stop even braking hard',
    RAN_STOP: 'Ran the stop line',
    DRAC_HIGH: 'Needs hard braking to stop',
    NOT_BRAKING: 'Not braking when it should',
    SPEEDING: 'Speeding and not slowing down',
    CLOSED_LANE: 'Heading into the closed lane',
    DRIFT: 'Drifting toward workers'
  };

  /* ---------- Sim state ---------- */
  function createSim(scn) {
    var S = {
      scn: scn, k: 0, t: 0,
      board: scn.board, source: 'controller', stopK: scn.board === 'STOP' ? -100000 : null,
      triggerId: null, prevBoard: null, l2Lock: false, held: false,
      sup: {}, sys: 0, prevSys: 0, primary: null, l0T: 0, l2StartK: null,
      cars: [], nextId: 1, pending: scn.cars.slice().sort(function (a, b) { return a.at - b.at; }),
      inputs: (scn.inputs || []).map(function (x) { return { k: TK(x.at), type: x.type, scripted: true }; }),
      queued: [], log: [], events: [], ev: null, watched: 0,
      out: { flash: 0, siren: false, wrist: 'none', wristUntil: -1, lastMsg: '' },
      workers: [], cones: []
    };
    (scn.workers || DEFAULT_WORKERS).forEach(function (w) {
      S.workers.push({ d: w.d, y: w.y, homeD: w.d, homeY: w.y, evac: false });
    });
    buildCones(S);
    return S;
  }
  var DEFAULT_WORKERS = [{ d: -5, y: 2.3 }, { d: -11, y: 1.3 }, { d: -16, y: 3.0 }];
  function buildCones(S) {
    for (var d = C.TAPER_START_D; d >= C.TAPER_END_D - 0.01; d -= 3) S.cones.push({ d: d, y: coneY(d) - 0.15, knocked: 0 });
    for (d = C.TAPER_END_D - 4; d >= C.CLOSED_END_D - 6; d -= 4) S.cones.push({ d: d, y: -0.15, knocked: 0 });
  }

  function spawn(S, sp) {
    var lane = sp.lane || 2;
    var c = {
      id: S.nextId++, type: sp.type || 'car', lane0: lane,
      d: sp.d != null ? sp.d : 100, v: sp.kmh * KMH, y: sp.y != null ? sp.y : (lane === 1 ? SIM.LANE1_Y : SIM.LANE2_Y), vy: 0,
      a: 0, vHist: [], ageT: 0, spawnK: S.k, prevD: null,
      drv: sp, color: sp.color || null, tag: sp.tag || null,
      hist: [], conf: 0, below: 0, maxBelow: 0, raw: 0, reasons: [], ranStop: false, cleared: false, gone: false,
      drac: 0, tz: Infinity, tc: Infinity, pts: [], inRange: false,
      brk: 0, mergeOn: false, mergeDone: false, stopAt: null, d0: 0, y0: 0
    };
    c.d0 = c.d; c.y0 = c.y;
    if (sp.pre) { c.ageT = 20; for (var i = 0; i < 20; i++) c.vHist.push(c.v); }
    S.cars.push(c);
    return c;
  }

  function say(S, msg, kind) { S.log.push({ t: S.t, msg: msg, kind: kind || 'info' }); }

  /* ---------- Section 8 inputs ---------- */
  function doCancel(S, why) {
    var any = false;
    S.cars.forEach(function (c) {
      if (!c.gone && c.inRange && c.conf === 1) {
        S.sup[c.id] = true; c.conf = 0; c.hist = []; c.below = 0; c.maxBelow = 0; any = true;
      }
    });
    if (S.source === 'ai_auto') { S.board = S.prevBoard || 'SLOW'; S.source = 'controller'; S.l2Lock = false; S.stopK = null; clearCleared(S); }
    if (S.ev) { S.ev.cancelled = true; }
    say(S, why + ': alert cancelled, counted as a false alarm', 'cancel');
    return any;
  }
  function setStop(S, source) {
    if (S.board !== 'STOP') {
      S.board = 'STOP'; S.stopK = S.k;
      // v1.1: vehicles that cannot stop at the moment of the switch are cleared to pass
      S.cars.forEach(function (c) { if (!c.gone && c.inRange && c.d > 0 && !canStop(c)) c.cleared = true; });
    }
    S.source = source;
  }
  function clearCleared(S) { S.cars.forEach(function (c) { c.cleared = false; c.ranStop = false; }); }
  function applyInput(S, type, scripted) {
    var who = scripted ? 'Scripted ' : '';
    if (type === 'cancel') {
      if (S.sys === 2) { say(S, who + (who ? 'wristband' : 'Wristband') + ' cancel ignored: EVACUATE cannot be cancelled', 'muted'); return; }
      if (S.sys === 1) { doCancel(S, who + 'Wristband cancel'); return; }
      if (S.source === 'ai_auto' && !S.l2Lock) {
        S.board = 'SLOW'; S.source = 'controller'; S.stopK = null; clearCleared(S);
        say(S, who + 'Wristband cancel: AI STOP released early (not a false alarm)', 'info'); return;
      }
      say(S, who + (who ? 'wristband' : 'Wristband') + ' cancel: nothing to cancel', 'muted'); return;
    }
    if (type === 'remoteSTOP') {
      setStop(S, 'controller'); S.l2Lock = false;
      say(S, who + 'Controller pressed STOP', 'info'); return;
    }
    if (type === 'remoteSLOW') {
      if (S.sys === 2) { say(S, who + (who ? 'controller' : 'Controller') + ' SLOW ignored during EVACUATE', 'muted'); return; }
      if (S.sys === 1) doCancel(S, who + 'Controller SLOW during CAUTION');
      if (S.board === 'STOP') { S.board = 'SLOW'; S.stopK = null; clearCleared(S); }
      S.source = 'controller'; S.l2Lock = false;
      say(S, who + 'Controller pressed SLOW', 'info');
    }
  }

  /* ---------- Section 5 and 6: per-vehicle level ---------- */
  function evaluate(S, c) {
    c.vHist.push(c.v); if (c.vHist.length > 11) c.vHist.shift();
    c.a = c.vHist.length >= 11 ? (c.vHist[10] - c.vHist[0]) / 1.0 : 0;
    var aged = c.ageT >= T_MIN_AGE;
    var k = factor(c);
    c.drac = (c.d > 0 && c.v >= V_MIN) ? c.v * c.v / (2 * c.d) : 0;
    var braking = !aged || c.a <= C.BRAKING_ACCEL;
    var p = predict(c, aged); c.tz = p.tz; c.tc = p.tc; c.pts = p.pts;
    var drift = aged && c.vy >= C.DRIFT_VY && c.d > C.ZONE_D_MIN;
    var closed = aged && c.v >= V_MIN && c.d > C.ZONE_D_MIN && c.tc <= C.CLOSED_TIME;
    var R = [];
    if (S.board === 'STOP') {
      var since = S.k - S.stopK;
      if (!c.cleared && c.prevD !== null && c.prevD > 0 && c.d <= 0 && c.v >= V_MIN && since >= T_RAN) c.ranStop = true;
      if (c.ranStop && c.v < V_STOPPED) c.ranStop = false;
      if (c.tz <= C.ZONE_TIME) R.push([2, 'ZONE_3S']);
      if (!c.cleared) {
        if (c.drac > C.DRAC_L2 * k) R.push([2, 'DRAC_CRITICAL']);
        if (c.ranStop) R.push([2, 'RAN_STOP']);
        if (c.drac > C.DRAC_L1 * k) R.push([1, 'DRAC_HIGH']);
        if (since >= T_REACT && c.drac > C.DRAC_EARLY * k && !braking) R.push([1, 'NOT_BRAKING']);
      }
      if (closed) R.push([1, 'CLOSED_LANE']);
      if (drift) R.push([1, 'DRIFT']);
    } else {
      if (c.tz <= C.ZONE_TIME) R.push([2, 'ZONE_3S']);
      if (c.v > V_SPEEDING && !braking) R.push([1, 'SPEEDING']);
      if (closed) R.push([1, 'CLOSED_LANE']);
      if (drift) R.push([1, 'DRIFT']);
    }
    var raw = 0; R.forEach(function (r) { if (r[0] > raw) raw = r[0]; });
    if (S.sup[c.id]) {
      if (raw === 2) { delete S.sup[c.id]; }
      else if (raw === 1) raw = 0;
    }
    c.raw = raw; c.reasons = R.filter(function (r) { return r[0] === raw && raw > 0; }).map(function (r) { return r[1]; });
    c.allReasons = R.map(function (r) { return r[1]; });
    // section 6 debounce
    c.hist.push(raw); if (c.hist.length > C.CONFIRM_N) c.hist.shift();
    var old = c.conf;
    for (var L = 2; L >= 1; L--) {
      if (L > c.conf && c.hist.filter(function (h) { return h >= L; }).length >= C.CONFIRM_K) { c.conf = L; break; }
    }
    if (raw < c.conf) {
      c.below++; c.maxBelow = Math.max(c.maxBelow, raw);
      if (c.below >= T_DOWN) { c.conf = c.maxBelow; c.below = 0; c.maxBelow = 0; }
    } else { c.below = 0; c.maxBelow = 0; }
    if (c.conf !== old) {
      say(S, '#' + c.id + ' ' + LEVEL_NAME[old] + ' to ' + LEVEL_NAME[c.conf] +
        (c.conf > 0 ? ': ' + c.reasons.map(function (r) { return REASON_TEXT[r]; }).join(', ') : ''),
        c.conf === 2 ? 'l2' : c.conf === 1 ? 'l1' : 'l0');
    }
  }

  function pickPrimary(list) {
    var best = null;
    list.forEach(function (c) {
      if (c.conf === 0) return;
      if (!best) { best = c; return; }
      if (c.conf !== best.conf) { if (c.conf > best.conf) best = c; return; }
      var cPast = c.d <= C.ZONE_D_MIN, bPast = best.d <= C.ZONE_D_MIN;
      if (cPast !== bPast) { if (!cPast) best = c; return; }
      if (c.d < best.d) best = c;
    });
    return best;
  }

  /* ---------- One tick: spec section 11 ---------- */
  function tick(S) {
    var k = S.k; S.t = Math.round(k) / 10;
    // spawn vehicles scheduled for this tick
    while (S.pending.length && TK(S.pending[0].at) <= k) { var c0 = spawn(S, S.pending.shift()); say(S, '#' + c0.id + ' entered view', 'muted'); }
    // range bookkeeping
    S.cars.forEach(function (c) {
      if (c.gone) return;
      if (c.d < C.RANGE_MIN) { c.gone = true; c.inRange = false; delete S.sup[c.id]; return; }
      var was = c.inRange;
      c.inRange = c.d <= C.RANGE_MAX;
      if (c.inRange && !was) S.watched++;
    });
    // 1. inputs
    var ins = S.inputs.filter(function (x) { return x.k === k; }).concat(S.queued);
    S.queued = [];
    ins.forEach(function (x) { applyInput(S, x.type, x.scripted); });
    // 2. per vehicle
    var live = S.cars.filter(function (c) { return !c.gone && c.inRange; });
    live.forEach(function (c) { evaluate(S, c); });
    // 3. system level and primary vehicle
    S.prevSys = S.sys;
    S.sys = live.reduce(function (m, c) { return Math.max(m, c.conf); }, 0);
    S.primary = pickPrimary(live);
    if (S.sys === 2 && S.prevSys !== 2) S.l2StartK = k;
    if (S.sys !== 2) S.l2StartK = null;
    if (S.sys > 0 && S.prevSys === 0) {
      S.ev = { start: S.t, end: null, id: S.primary ? S.primary.id : null, type: S.primary ? S.primary.type : '',
        first: S.primary ? S.primary.reasons[0] : '', maxReason: S.primary ? S.primary.reasons[0] : '', max: S.sys,
        action: S.board === 'STOP' ? 'Board already STOP' : 'pending', cancelled: false, locked: false };
    }
    // 4. sign board
    S.held = false;
    if (S.board === 'SLOW') {
      var cand = live.filter(function (c) { return c.d > 0 && c.conf >= 1 && !S.sup[c.id]; });
      if (cand.length) {
        cand.sort(function (a, b) { return b.conf - a.conf || a.d - b.d; });
        var trig = cand[0];
        var blocked = live.filter(function (c) { return c.d > 0 && !canStop(c); });
        if (!blocked.length) {
          S.prevBoard = 'SLOW'; setStop(S, 'ai_auto'); S.triggerId = trig.id;
          say(S, 'AI switched the board to STOP (trigger #' + trig.id + ')', 'board');
          if (S.ev) S.ev.action = S.ev.action === 'Held: vehicle too close' ? 'Auto-STOP after hold' : 'Auto-STOP';
        } else {
          S.held = true;
          if (S.ev && S.ev.action === 'pending') { S.ev.action = 'Held: vehicle too close'; say(S, 'Auto-STOP held: #' + blocked[0].id + ' is too close to stop', 'board'); }
        }
      }
    }
    if (S.source === 'ai_auto' && !S.l2Lock && (S.sys === 2 || (S.ev && S.ev.max === 2))) {
      S.l2Lock = true; say(S, 'Board locked on STOP: controller must release after EVACUATE', 'board');
      if (S.ev) S.ev.locked = true;
    }
    S.l0T = S.sys === 0 ? S.l0T + 1 : 0;
    if (S.source === 'ai_auto' && !S.l2Lock && S.l0T >= T_RESTORE) {
      var tc = null; S.cars.forEach(function (c) { if (c.id === S.triggerId) tc = c; });
      if (!tc || tc.gone || !tc.inRange || tc.v < V_STOPPED) {
        S.board = S.prevBoard || 'SLOW'; S.source = 'controller'; S.stopK = null; clearCleared(S);
        S.out.wrist = 'double'; S.out.wristUntil = k + 8;
        say(S, 'AI restored the board to SLOW. Wristband: two light buzzes', 'board');
      }
    }
    // 5. outputs
    S.out.flash = S.sys; S.out.siren = S.sys === 2;
    if (S.sys === 2) { S.out.wrist = 'strong'; S.out.wristUntil = k + 1; }
    else if (S.sys === 1 && S.prevSys === 0) { S.out.wrist = 'short'; S.out.wristUntil = k + 3; }
    else if (k > S.out.wristUntil) S.out.wrist = 'none';
    // 6. events and focus metric
    if (S.ev) {
      if (S.sys > S.ev.max) { S.ev.max = S.sys; if (S.primary) { S.ev.id = S.primary.id; S.ev.type = S.primary.type; S.ev.maxReason = S.primary.reasons[0]; } }
      if (S.source === 'ai_auto' && S.ev.action === 'pending' && S.board === 'STOP') S.ev.action = 'Auto-STOP';
      if (S.sys === 0) {
        S.ev.end = S.t; if (S.ev.action === 'pending') S.ev.action = 'No board change';
        S.events.push(S.ev); S.ev = null;
      }
    }
    // simulation step
    physics(S);
    S.k++;
  }

  /* ---------- Simulator: drivers, workers, cones ---------- */
  function stopPerceived(S, c) {
    if (S.board !== 'STOP' || c.cleared || c.drv.distracted || c.d <= 0) return false;
    return (S.k - Math.max(S.stopK, c.spawnK)) >= T_REACTION;
  }
  function leaderOf(S, c) {
    var best = null, bestGap = Infinity;
    S.cars.forEach(function (o) {
      if (o === c || o.gone || o.d >= c.d) return;
      if (Math.abs(o.y - c.y) >= 2.0) return;
      var gap = c.d - (o.d + (o.type === 'truck' ? SIM.TRUCK_LEN : SIM.VEH_LEN));
      if (gap <= 0) return;
      if (gap < bestGap) { bestGap = gap; best = { gap: gap, v: o.v }; }
    });
    return best;
  }
  function idmTerm(v, gap, vl) {
    var sStar = SIM.IDM_S0 + v * SIM.IDM_T + v * (v - vl) / (2 * Math.sqrt(SIM.IDM_A * SIM.IDM_B));
    sStar = Math.max(sStar, 0);
    return (sStar / Math.max(gap, 0.1)) * (sStar / Math.max(gap, 0.1));
  }
  function physics(S) {
    var dt = C.TICK;
    S.cars.forEach(function (c) {
      if (c.gone) return;
      c.d0 = c.d; c.y0 = c.y; c.prevD = c.d;
      var dv = c.drv, acc = 0;
      // lateral
      if (dv.merge && !c.mergeDone && c.d <= dv.merge.atD) { c.mergeOn = true; c.vy = -dv.merge.vy; }
      if (dv.drift && c.d <= dv.drift.atD) c.vy = c.y < SIM.DRIFT_MAX_Y ? dv.drift.vy : 0;
      // longitudinal
      if (dv.mode === 'idm') {
        var v0 = dv.v0 * KMH;
        var term = 0;
        var L = leaderOf(S, c);
        if (L) term = Math.max(term, idmTerm(c.v, L.gap, L.v));
        if (stopPerceived(S, c)) term = Math.max(term, idmTerm(c.v, c.d - (SIM.STOP_TARGET_D - SIM.IDM_S0), 0));
        acc = SIM.IDM_A * (1 - Math.pow(c.v / v0, 4) - term);
        acc = Math.max(acc, -7);
      } else {
        if (!c.brk && dv.brakeAtD && c.d <= dv.brakeAtD.d) c.brk = dv.brakeAtD.decel;
        if (!c.brk && dv.reactStop && stopPerceived(S, c)) c.brk = dv.reactStop;
        if (dv.reactL2 && S.sys === 2 && S.l2StartK !== null && S.k - S.l2StartK >= T_REACTION) c.brk = Math.max(c.brk, dv.reactL2);
        acc = c.brk ? -c.brk : 0;
      }
      var nv = c.v + acc * dt;
      if (nv < 0) { c.d -= (c.v * c.v) / (2 * -acc); c.v = 0; }
      else { c.d -= (c.v + nv) / 2 * dt; c.v = nv; }
      c.y += c.vy * dt;
      if (c.mergeOn && c.y <= SIM.LANE2_Y) { c.y = SIM.LANE2_Y; c.vy = 0; c.mergeOn = false; c.mergeDone = true; }
      if (c.v === 0 && c.stopAt === null) c.stopAt = c.d;
      if (c.inRange) c.ageT++;
      // knock cones
      var len = c.type === 'truck' ? SIM.TRUCK_LEN : SIM.VEH_LEN;
      S.cones.forEach(function (q) {
        if (!q.knocked && q.d >= c.d - 0.3 && q.d <= c.d + len && Math.abs(q.y - c.y) < 1.05) { q.knocked = q.y > c.y ? 1 : -1; }
      });
    });
    // workers: evacuate on EVACUATE, return after the system has been NORMAL for a while
    var ret = S.sys === 0 && S.l0T >= TK(SIM.WORKER_RETURN_AFTER);
    S.workers.forEach(function (w) {
      if (S.sys === 2) w.evac = true;
      else if (ret) w.evac = false;
      var ty = w.evac ? SIM.WORKER_SAFE_Y : w.homeY, sp = (w.evac ? SIM.WORKER_EVAC_V : SIM.WORKER_RETURN_V) * dt;
      w.y0 = w.y;
      if (Math.abs(ty - w.y) <= sp) w.y = ty; else w.y += (ty > w.y ? sp : -sp);
    });
  }

  function run(scn, untilT, extra) {
    var S = createSim(scn);
    var n = TK(untilT);
    var ex = (extra || []).slice();
    while (S.k <= n) {
      ex.forEach(function (x) { if (x.k === S.k) S.queued.push({ type: x.type, scripted: false }); });
      tick(S);
    }
    return S;
  }

  return { C: C, SIM: SIM, KMH: KMH, TK: TK, coneY: coneY, inZone: inZone, inClosed: inClosed, canStop: canStop,
    createSim: createSim, tick: tick, run: run, LEVEL_NAME: LEVEL_NAME, REASON_TEXT: REASON_TEXT };
})();
if (typeof module !== 'undefined') module.exports = BG;
