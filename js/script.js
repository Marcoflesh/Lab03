/* Smart Parking – Tec de Monterrey (Lab 3)
   Interface layer. All sensor data is simulated; the occupancy math lives in simulation.js. */
(function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var Sim = window.ParkingSimulation;

  /* Geometry of the five parking bays, in the image's own coordinates (672 x 550). */
  var BAYS = [
    { id: "A", top: [132, 262], bottom: [238, 494], n: 20 },
    { id: "B", top: [218, 205], bottom: [334, 446], n: 21 },
    { id: "C", top: [308, 165], bottom: [402, 388], n: 20 },
    { id: "D", top: [395, 110], bottom: [491, 326], n: 19 },
    { id: "E", top: [475, 70],  bottom: [592, 293], n: 19 }
  ];
  var COLUMN_OFFSETS = [-16, 15];
  var SPOT_WIDTH = 30;
  var FEED_LIMIT = 8;
  var TICK_MS = 250;            // sensor cadence
  var START_MINUTE = 6 * 60;    // the day starts at 06:00
  var MAX_PING = 40;            // limit flashing after big jumps
  var CATCH_UP_BAND = 3;        // allowed gap (spaces) between lot and schedule while running
  var CATCH_UP_STEP = 6;        // max corrections per tick while running

  var spots = [];
  var simMinutes = START_MINUTE;
  var playing = true;
  var dragging = false;
  var resumeAfterDrag = false;
  var lastFeedAt = 0;

  var el = {
    lot: document.getElementById("lot"),
    spotsG: document.getElementById("spots"),
    zoneG: document.getElementById("zoneLabels"),
    shade: document.getElementById("nightShade"),
    wrap: document.getElementById("mapWrap"),
    tip: document.getElementById("tip"),
    sign: document.getElementById("sign"),
    signNumber: document.getElementById("signNumber"),
    signState: document.getElementById("signState"),
    total: document.getElementById("statTotal"),
    busy: document.getElementById("statBusy"),
    free: document.getElementById("statFree"),
    pct: document.getElementById("statPct"),
    meter: document.getElementById("meter"),
    meterFill: document.getElementById("meterFill"),
    zones: document.getElementById("zones"),
    feed: document.getElementById("feed"),
    live: document.getElementById("liveStatus"),
    liveText: document.getElementById("liveText"),
    lastReading: document.getElementById("lastReading"),
    announce: document.getElementById("announce"),
    clock: document.getElementById("clock"),
    clockH: document.getElementById("clockH"),
    clockM: document.getElementById("clockM"),
    play: document.getElementById("btnPlay"),
    speed: document.getElementById("clockSpeed"),
    slider: document.getElementById("timeSlider")
  };

  /* ---------- helpers ---------- */
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function hhmm(minutes) {
    var m = Math.floor(minutes) % 1440;
    return pad(Math.floor(m / 60)) + ":" + pad(m % 60);
  }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function statusWord(s) { return s === "busy" ? "occupied" : "available"; }
  function hours() { return simMinutes / 60; }
  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  }
  function withStatus(status) { return spots.filter(function (s) { return s.status === status; }); }

  /* ---------- build the lot ---------- */
  function buildLot() {
    BAYS.forEach(function (bay) {
      var dx = bay.bottom[0] - bay.top[0];
      var dy = bay.bottom[1] - bay.top[1];
      var len = Math.sqrt(dx * dx + dy * dy);
      var ux = dx / len, uy = dy / len;      // along the bay
      var px = uy, py = -ux;                 // across the bay
      var angle = Math.atan2(py, px) * 180 / Math.PI;
      var step = len / bay.n;

      COLUMN_OFFSETS.forEach(function (off, col) {
        for (var i = 0; i < bay.n; i++) {
          var cx = bay.top[0] + ux * (i + 0.5) * step + px * off;
          var cy = bay.top[1] + uy * (i + 0.5) * step + py * off;
          var h = step * 0.84;
          var num = col * bay.n + i + 1;
          var id = bay.id + "-" + pad(num);

          var r = document.createElementNS(SVG_NS, "rect");
          r.setAttribute("x", -SPOT_WIDTH / 2);
          r.setAttribute("y", -h / 2);
          r.setAttribute("width", SPOT_WIDTH);
          r.setAttribute("height", h);
          r.setAttribute("rx", 1.2);
          r.setAttribute("transform", "translate(" + cx.toFixed(2) + " " + cy.toFixed(2) + ") rotate(" + angle.toFixed(2) + ")");
          r.setAttribute("role", "button");
          r.setAttribute("data-bay", bay.id);
          r.setAttribute("data-index", spots.length);
          r.setAttribute("tabindex", spots.length === 0 ? "0" : "-1");
          r.classList.add("spot");
          el.spotsG.appendChild(r);

          spots.push({ id: id, bay: bay.id, el: r, status: "free", updated: START_MINUTE });
        }
      });

      // zone badge, just beyond the top end of each bay
      var g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", "zone-badge");
      var bx = bay.top[0] - ux * 15 + px * -0.5;
      var by = bay.top[1] - uy * 15 + py * -0.5;
      var c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("cx", bx); c.setAttribute("cy", by); c.setAttribute("r", 9);
      var t = document.createElementNS(SVG_NS, "text");
      t.setAttribute("x", bx); t.setAttribute("y", by + 0.5);
      t.textContent = bay.id;
      g.appendChild(c); g.appendChild(t);
      el.zoneG.appendChild(g);
    });

    el.total.textContent = spots.length;
    spots.forEach(paintSpot);
  }

  function buildZoneList() {
    BAYS.forEach(function (bay) {
      var li = document.createElement("li");
      li.className = "zone";
      li.setAttribute("data-bay", bay.id);
      li.tabIndex = 0;
      li.innerHTML =
        '<span class="zone-letter">' + bay.id + '</span>' +
        '<div class="zone-bar" aria-hidden="true"><span></span></div>' +
        '<span class="zone-count"></span>';
      li.addEventListener("mouseenter", function () { el.lot.setAttribute("data-focus", bay.id); });
      li.addEventListener("focus", function () { el.lot.setAttribute("data-focus", bay.id); });
      li.addEventListener("mouseleave", clearZoneFocus);
      li.addEventListener("blur", clearZoneFocus);
      el.zones.appendChild(li);
    });
  }
  function clearZoneFocus() { el.lot.removeAttribute("data-focus"); }

  /* ---------- rendering ---------- */
  function paintSpot(s) {
    s.el.classList.toggle("free", s.status === "free");
    s.el.classList.toggle("busy", s.status === "busy");
    s.el.setAttribute("aria-label",
      "Space " + s.id + ", " + statusWord(s.status) + ". Press Enter to mark as " +
      (s.status === "busy" ? "available" : "occupied") + ".");
  }

  function ping(s) {
    s.el.classList.remove("ping");
    void s.el.getBoundingClientRect(); // restart the animation
    s.el.classList.add("ping");
  }

  function updateDashboard() {
    var total = spots.length;
    var busy = withStatus("busy").length;
    var free = total - busy;
    var pct = Math.round((busy / total) * 100);
    var frac = busy / total;

    el.busy.textContent = busy;
    el.free.textContent = free;
    el.pct.textContent = pct + "%";
    el.signNumber.textContent = free;
    el.meterFill.style.width = pct + "%";
    el.meter.setAttribute("aria-label", "Occupancy " + pct + " percent");

    var state, label;
    if (free === 0) { state = "full"; label = "Lot full"; }
    else if (frac >= 0.85) { state = "almost"; label = "Almost full"; }
    else if (frac >= 0.6) { state = "plenty"; label = "Filling up"; }
    else if (frac >= 0.25) { state = "plenty"; label = "Plenty of space"; }
    else { state = "plenty"; label = "Almost empty"; }
    el.sign.setAttribute("data-state", state);
    el.meterFill.setAttribute("data-level", state);
    el.signState.textContent = label;

    BAYS.forEach(function (bay, i) {
      var inBay = spots.filter(function (s) { return s.bay === bay.id; });
      var f = inBay.filter(function (s) { return s.status === "free"; }).length;
      var li = el.zones.children[i];
      li.querySelector(".zone-bar span").style.width = Math.round((f / inBay.length) * 100) + "%";
      li.querySelector(".zone-count").innerHTML = "<b>" + f + "</b> free of " + inBay.length;
    });
  }

  function addFeed(kind, text) {
    var li = document.createElement("li");
    li.innerHTML = '<span class="dot ' + kind + '"></span><time>' + hhmm(simMinutes) + "</time><span>" + text + "</span>";
    el.feed.insertBefore(li, el.feed.firstChild);
    while (el.feed.children.length > FEED_LIMIT) el.feed.removeChild(el.feed.lastChild);
  }

  function renderClock() {
    var m = Math.floor(simMinutes) % 1440;
    el.clockH.textContent = pad(Math.floor(m / 60));
    el.clockM.textContent = pad(m % 60);
    if (!dragging) el.slider.value = m;
    el.slider.setAttribute("aria-valuetext", hhmm(m));
    el.lastReading.textContent = hhmm(m);
    var shade = 0.5 * (1 - Sim.daylight(simMinutes / 60));
    el.shade.setAttribute("opacity", shade.toFixed(3));
  }

  /* ---------- state changes ---------- */
  function flip(s, status) {
    s.status = status;
    s.updated = simMinutes;
    paintSpot(s);
  }

  /* Turn `list` of spaces into `status`; returns the count changed. */
  function applyChanges(list, status, withPing) {
    list.forEach(function (s, i) {
      flip(s, status);
      if (withPing && i < MAX_PING) ping(s);
    });
    return list.length;
  }

  function logSensor(s) {
    var now = Date.now();
    if (now - lastFeedAt < 900) return;   // keep the feed readable at high speed
    lastFeedAt = now;
    addFeed(s.status, s.status === "busy"
      ? "Sensor <b>" + s.id + "</b> detected a vehicle"
      : "Sensor <b>" + s.id + "</b> reports space clear");
  }

  /* Bring the lot to the number of cars the schedule expects at this hour. */
  function syncToSchedule(exact) {
    var target = Sim.busyCount(hours(), spots.length);
    var diff = target - withStatus("busy").length;
    var limit = exact ? Infinity : CATCH_UP_STEP;
    if (!exact && Math.abs(diff) < CATCH_UP_BAND) return null;

    var n = Math.min(Math.abs(diff), limit), moved = [];
    if (diff > 0) {
      moved = shuffle(withStatus("free")).slice(0, n);
      applyChanges(moved, "busy", true);
    } else if (diff < 0) {
      moved = shuffle(withStatus("busy")).slice(0, n);
      applyChanges(moved, "free", true);
    }
    return moved.length ? moved[0] : null;
  }

  /* Cars come and go even when the total stays about the same. */
  function churn(dtSeconds) {
    var events = Sim.poisson(Sim.churnPerSecond(hours()) * dtSeconds);
    var first = null;
    for (var i = 0; i < events; i++) {
      var busy = withStatus("busy"), free = withStatus("free");
      if (!busy.length || !free.length) break;
      var leaving = pick(busy), arriving = pick(free);
      flip(leaving, "free"); ping(leaving);
      flip(arriving, "busy"); ping(arriving);
      if (!first) first = arriving;
    }
    return first;
  }

  function tick() {
    if (!playing) return;
    var rate = parseFloat(el.speed.value);              // simulated minutes per real second
    simMinutes = (simMinutes + rate * TICK_MS / 1000) % 1440;
    var moved = syncToSchedule(false);
    var arrived = churn(TICK_MS / 1000);
    var show = arrived || moved;
    if (show) logSensor(show);
    updateDashboard();
    renderClock();
  }

  function jumpTo(minutes) {
    simMinutes = Math.min(1439, Math.max(0, minutes));
    var before = withStatus("busy").length;
    syncToSchedule(true);
    var after = withStatus("busy").length;
    addFeed("info", "Clock set to " + hhmm(simMinutes) + ": " + (after >= before ? "+" : "") + (after - before) + " vehicles");
    updateDashboard();
    renderClock();
  }

  function setPlaying(on) {
    playing = on;
    el.clock.setAttribute("data-playing", on ? "true" : "false");
    el.play.textContent = on ? "Pause" : "Play";
    el.play.setAttribute("aria-pressed", on ? "true" : "false");
    el.live.setAttribute("data-on", on ? "true" : "false");
    el.liveText.textContent = on ? "Sensors live" : "Sensors paused";
  }

  function bulk(pickStatus, message) {
    spots.forEach(function (s) {
      var next = pickStatus();
      if (s.status !== next) flip(s, next);
    });
    addFeed("info", message);
    updateDashboard();
    el.announce.textContent = message + ". " + el.free.textContent + " spaces available.";
  }

  /* ---------- interaction ---------- */
  function spotFromEvent(e) {
    var t = e.target;
    if (!t.classList || !t.classList.contains("spot")) return null;
    return spots[parseInt(t.getAttribute("data-index"), 10)];
  }

  function toggle(s) {
    var next = s.status === "busy" ? "free" : "busy";
    flip(s, next);
    ping(s);
    addFeed("info", "Manual override: <b>" + s.id + "</b> set to " + statusWord(next));
    updateDashboard();
    el.announce.textContent = "Space " + s.id + " is now " + statusWord(next) + ". " + el.free.textContent + " available.";
  }

  function showTip(s, x, y) {
    el.tip.innerHTML = "<strong>" + s.id + "</strong>" + statusWord(s.status) + ", updated " + hhmm(s.updated);
    el.tip.hidden = false;
    el.tip.style.left = x + "px";
    el.tip.style.top = y + "px";
  }
  function hideTip() { el.tip.hidden = true; }

  el.lot.addEventListener("click", function (e) {
    var s = spotFromEvent(e);
    if (s) toggle(s);
  });

  el.lot.addEventListener("pointermove", function (e) {
    var s = spotFromEvent(e);
    if (!s) { hideTip(); return; }
    var box = el.wrap.getBoundingClientRect();
    showTip(s, e.clientX - box.left, e.clientY - box.top);
  });
  el.lot.addEventListener("pointerleave", hideTip);

  el.lot.addEventListener("focusin", function (e) {
    var s = spotFromEvent(e);
    if (!s) return;
    var r = s.el.getBoundingClientRect(), box = el.wrap.getBoundingClientRect();
    showTip(s, r.left - box.left + r.width / 2, r.top - box.top);
  });
  el.lot.addEventListener("focusout", hideTip);

  // keyboard: arrows move between spaces, Enter/Space toggles
  el.lot.addEventListener("keydown", function (e) {
    var s = spotFromEvent(e);
    if (!s) return;
    var i = spots.indexOf(s), next = null;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(s); return; }
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = spots[Math.min(spots.length - 1, i + 1)];
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = spots[Math.max(0, i - 1)];
    if (next) {
      e.preventDefault();
      s.el.setAttribute("tabindex", "-1");
      next.el.setAttribute("tabindex", "0");
      next.el.focus();
    }
  });

  // clock controls
  el.play.addEventListener("click", function () { setPlaying(!playing); });

  el.slider.addEventListener("pointerdown", function () {
    dragging = true;
    resumeAfterDrag = playing;
    if (playing) setPlaying(false);
  });
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    if (resumeAfterDrag) setPlaying(true);
    resumeAfterDrag = false;
  }
  el.slider.addEventListener("pointerup", endDrag);
  el.slider.addEventListener("pointercancel", endDrag);
  el.slider.addEventListener("input", function () {
    jumpTo(parseInt(el.slider.value, 10));
    el.announce.textContent = hhmm(simMinutes) + ", " + el.free.textContent + " spaces available.";
  });

  document.getElementById("btnRandom").addEventListener("click", function () {
    var target = Sim.busyCount(hours(), spots.length);
    var order = shuffle(spots.slice());
    order.forEach(function (s, i) {
      var next = i < target ? "busy" : "free";
      if (s.status !== next) flip(s, next);
    });
    addFeed("info", "All sensors re-read at " + hhmm(simMinutes));
    updateDashboard();
  });
  document.getElementById("btnFill").addEventListener("click", function () {
    bulk(function () { return "busy"; }, "Every space marked occupied");
  });
  document.getElementById("btnEmpty").addEventListener("click", function () {
    bulk(function () { return "free"; }, "Every space marked available");
  });

  /* ---------- start ---------- */
  buildZoneList();
  buildLot();
  syncToSchedule(true);
  updateDashboard();
  renderClock();
  addFeed("info", "Sensor network online: " + spots.length + " spaces");
  setPlaying(true);
  setInterval(tick, TICK_MS);
})();
