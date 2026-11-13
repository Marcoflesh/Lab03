/* Smart Parking – simulation engine ("backend" layer)
   Pure math, no DOM access. The interface only asks it questions such as
   "how busy is the lot at 10:30?" and never displays any of these formulas.

   Model
   -----
   Occupancy over the day is a mixture of Gaussian bells (hours of the day, t):

       g_i(t) = exp( -(t - mu_i)^2 / (2 * sigma_i^2) )
       O(t)   = clamp( b + sum_i A_i * g_i(t) + w(t),  O_min, O_max )

   - Bells with sigma = 0.42 h, spaced every 30 min, build the busy period of
     the morning and early afternoon (the lot looks almost full from 9:10 to
     13:00). Wider bells shape the slow afternoon and evening decay.
   - w(t) is a tiny deterministic wobble so the curve is not perfectly smooth.

   Traffic (how many cars come and go) follows the slope of the curve:

       dO/dt = sum_i A_i * g_i(t) * ( -(t - mu_i) / sigma_i^2 ) + w'(t)
       lambda(t) = c0 + c1 * |dO/dt|          (expected sensor events per second)

   and the number of events in a time step is drawn from a Poisson law with
   that mean. Daylight (for the map shading) is a pair of logistic curves. */
(function () {
  "use strict";

  var BASE = 0.03;
  var O_MIN = 0.02;
  var O_MAX = 0.985;

  // [mu (hour), sigma (hours), amplitude A]
  var BELLS = [
    [5.5, 0.42, 0.008], [6.0, 0.42, 0.025], [6.5, 0.42, 0.019], [7.0, 0.42, 0.134],
    [7.5, 0.42, 0.034], [8.0, 0.42, 0.314], [8.5, 0.42, 0.040], [9.0, 0.42, 0.512],
    [9.5, 0.42, 0.402], [10.0, 0.42, 0.450], [10.5, 0.42, 0.432], [11.0, 0.42, 0.453],
    [11.5, 0.42, 0.435], [12.0, 0.42, 0.448], [12.5, 0.42, 0.420], [13.0, 0.42, 0.466],
    [13.5, 0.42, 0.289], [14.0, 0.42, 0.400], [14.5, 0.42, 0.199], [15.0, 0.42, 0.283],
    [16.0, 0.80, 0.444], [17.0, 0.90, 0.109], [18.0, 0.90, 0.192], [19.0, 1.00, 0.024],
    [20.0, 1.10, 0.052], [21.5, 1.30, 0.010]
  ];

  var TWO_PI = 2 * Math.PI;

  function gauss(t, mu, sigma) {
    var z = (t - mu) / sigma;
    return Math.exp(-0.5 * z * z);
  }

  function wobble(t) {
    return 0.006 * Math.sin(TWO_PI * t / 1.9 + 0.7) + 0.004 * Math.sin(TWO_PI * t / 0.7 + 2.3);
  }
  function wobbleSlope(t) {
    return 0.006 * (TWO_PI / 1.9) * Math.cos(TWO_PI * t / 1.9 + 0.7) +
           0.004 * (TWO_PI / 0.7) * Math.cos(TWO_PI * t / 0.7 + 2.3);
  }

  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

  /* Expected fraction of occupied spaces at hour t (0..24). */
  function occupancy(t) {
    var sum = BASE;
    for (var i = 0; i < BELLS.length; i++) sum += BELLS[i][2] * gauss(t, BELLS[i][0], BELLS[i][1]);
    return clamp(sum + wobble(t), O_MIN, O_MAX);
  }

  /* dO/dt, change of occupancy per hour. */
  function occupancySlope(t) {
    var d = 0;
    for (var i = 0; i < BELLS.length; i++) {
      var mu = BELLS[i][0], s = BELLS[i][1], a = BELLS[i][2];
      d += a * gauss(t, mu, s) * (-(t - mu) / (s * s));
    }
    return d + wobbleSlope(t);
  }

  /* Number of occupied spaces expected at hour t for a lot of `total` spaces. */
  function busyCount(t, total) {
    return Math.round(occupancy(t) * total);
  }

  /* Expected sensor events (cars arriving / leaving) per real second. */
  function churnPerSecond(t) {
    return Math.min(8, 1.0 + 10 * Math.abs(occupancySlope(t)));
  }

  /* Poisson draw (Knuth). Fine for the small means used here. */
  function poisson(lambda) {
    if (lambda <= 0) return 0;
    var L = Math.exp(-lambda), k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L && k < 60);
    return k - 1;
  }

  /* Daylight factor 0..1 (logistic sunrise ~6:30 and sunset ~19:20). */
  function daylight(t) {
    var up = 1 / (1 + Math.exp(-(t - 6.5) * 2.2));
    var down = 1 / (1 + Math.exp((t - 19.3) * 2.2));
    return up * down;
  }

  window.ParkingSimulation = {
    occupancy: occupancy,
    busyCount: busyCount,
    churnPerSecond: churnPerSecond,
    poisson: poisson,
    daylight: daylight
  };
})();
