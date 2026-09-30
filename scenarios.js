/* Demo scenarios. Test scenarios 1 to 7 follow spec section 12; 8 and 9 test the closed-lane rule; 0 is the showcase. */
var BG_SCENARIOS = (function () {
  var L2 = 2, L1 = 1;
  var list = [];
  // 0. showcase: SLOW, background traffic, one car merges out (safe), one stays in the closed lane (unsafe)
  var bg = [];
  var col = ['#8C97A3', '#6E7F8F', '#A38F7A', '#7C8A6E', '#9B7F86', '#5F6F7F', '#B0A898', '#7D8FA0'];
  function B(at, kmh, v0, extra) {
    var o = { at: at, lane: 2, kmh: kmh, mode: 'idm', v0: v0, color: col[bg.length % col.length] };
    for (var k in extra) o[k] = extra[k];
    bg.push(o);
  }
  B(0, 40, 40, { d: 88, pre: true }); B(0, 41, 41, { d: 54, pre: true }); B(0, 39, 39, { d: 21, pre: true }); B(0, 40, 40, { d: -10, pre: true });
  B(1.8, 40, 40); B(6.8, 40, 40); B(10.8, 41, 41); B(13.6, 40, 40); B(16.4, 39, 39); B(19.2, 40, 40);
  B(22.0, 41, 41); B(24.8, 40, 40); B(29.5, 40, 40); B(32.3, 39, 39); B(35.1, 41, 41); B(37.8, 40, 40); B(40.5, 40, 40);
  bg.push({ at: 3.6, lane: 1, kmh: 40, mode: 'idm', v0: 40, merge: { atD: 88, vy: 0.9 }, color: '#2F6FD0', tag: 'safe' });
  bg.push({ at: 8.4, lane: 1, kmh: 40, mode: 'idm', v0: 40, merge: { atD: 92, vy: 0.9 }, color: '#8C97A3' });
  bg.push({ at: 12.2, lane: 1, kmh: 42, mode: 'script', distracted: true, reactL2: 6.5, color: '#E9ECEF', tag: 'unsafe' });
  list.push({
    id: 'hero', label: 'Showcase: merge vs. no merge', board: 'SLOW', duration: 42, cars: bg,
    inputs: [{ at: 27.0, type: 'remoteSLOW' }],
    caption: 'Board on SLOW with normal traffic. Blue car #6 merges out of the closed lane and stays NORMAL. White car #10 stays in the closed lane and heads for the workers: CAUTION, auto-STOP, then EVACUATE. The siren wakes the driver, who stops short of the work zone. At T+27 s the controller releases traffic.'
  });
  function S(id, label, board, cars, duration, caption, inputs) {
    list.push({ id: id, label: label, board: board, cars: cars, duration: duration, caption: caption, inputs: inputs || [] });
  }
  S('s1', '1. STOP, normal stop', 'STOP', [{ at: 0, kmh: 40, mode: 'script', brakeAtD: { d: 40, decel: 1.6 } }], 14,
    'Board on STOP. The car brakes from 40 m at 1.6 m/s² and stops before the line. Expected: NORMAL the whole time.');
  S('s2', '2. SLOW, normal pass', 'SLOW', [{ at: 0, kmh: 40, mode: 'script' }], 13,
    'Board on SLOW. The car passes at a steady 40 km/h. Expected: NORMAL the whole time.');
  S('s3', '3. SLOW, speeding but can stop', 'SLOW', [{ at: 0, kmh: 60, mode: 'script', reactStop: 2.5 }], 11,
    'Board on SLOW. A car at 60 km/h is not slowing down. The AI switches to STOP; the driver brakes 1 s later and stops. The AI then restores SLOW.');
  S('s4', '4. Same as 3, worker cancels', 'SLOW', [{ at: 0, kmh: 60, mode: 'script', reactStop: 2.5 }], 10,
    'Same as scenario 3, but a worker presses the wristband cancel key at T+2.0 s. The board returns to SLOW and the event counts as a false alarm.',
    [{ at: 2.0, type: 'cancel' }]);
  S('s5', '5. STOP, distracted driver', 'STOP', [{ at: 0, kmh: 54, mode: 'script', distracted: true }], 10,
    'Board on STOP. A distracted driver at 54 km/h never brakes and runs the stop line.');
  S('s6', '6. SLOW, drifting toward workers', 'SLOW', [{ at: 0, kmh: 40, mode: 'script', distracted: true, drift: { atD: 60, vy: 0.6 } }], 13,
    'Board on SLOW. From 60 m the car drifts toward the closed lane at 0.6 m/s and never brakes.');
  S('s7', '7. SLOW, auto-STOP waits', 'SLOW', [{ at: 0, d: 20, kmh: 40, mode: 'script' }, { at: 0, kmh: 58, mode: 'script', reactStop: 2.5 }], 11,
    'Board on SLOW. Car #2 is speeding, but car #1 is too close to stop, so the AI holds the STOP until #1 has passed the line.');
  S('s8', '8. SLOW, merges out (safe)', 'SLOW', [{ at: 0, lane: 1, kmh: 40, mode: 'script', merge: { atD: 88, vy: 0.9 } }], 12,
    'Board on SLOW. A car in the closed lane merges into the open lane from 88 m. Expected: NORMAL the whole time.');
  S('s9', '9. SLOW, stays in closed lane', 'SLOW', [{ at: 0, lane: 1, kmh: 40, mode: 'script', distracted: true }], 13,
    'Board on SLOW. A car in the closed lane never merges and drives straight at the work zone.');
  return list;
})();
if (typeof module !== 'undefined') module.exports = BG_SCENARIOS;
