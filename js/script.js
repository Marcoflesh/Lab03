/* Smart Parking – Tec de Monterrey (Lab 3)
   All sensor data is simulated. */
(function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";

  /* Geometry of the five parking bays, in the image's own coordinates (672 x 550).
     Each bay has two columns of spaces along an axis running from "top" to "bottom". */
  var BAYS = [
    { id: "A", top: [132, 262], bottom: [238, 494], n: 20 },
    { id: "B", top: [218, 205], bottom: [334, 446], n: 21 },
    { id: "C", top: [308, 165], bottom: [402, 388], n: 20 },
    { id: "D", top: [395, 110], bottom: [491, 326], n: 19 },
    { id: "E", top: [475, 70],  bottom: [592, 293], n: 19 }
  ];
  var COLUMN_OFFSETS = [-16, 15];
  var SPOT_WIDTH = 30;
  var START_BUSY_CHANCE = 0.62;   // lot starts fairly busy
  var TARGET_OCCUPANCY = 0.62;    // simulation drifts around this level
  var FEED_LIMIT = 8;

  var spots = [];
  var timer = null;

  var el = {
    lot: document.getElementById("lot"),
    spotsG: document.getElementById("spots"),
    zoneG: document.getElementById("zoneLabels"),
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
    auto: document.getElementById("autoToggle"),
    speed: document.getElementById("speed"),
    live: document.getElementById("liveStatus"),
    liveText: document.getElementById("liveText"),
    lastReading: document.getElementById("lastReading"),
    announce: document.getElementById("announce")
  };

  /* ---------- helpers ---------- */
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function timeStr(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); }
  function rand(min, max) { return min + Math.random() * (max - min); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function statusWord(s) { return s === "busy" ? "occupied" : "available"; }

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

          spots.push({
            id: id, bay: bay.id, el: r,
            status: Math.random() < START_BUSY_CHANCE ? "busy" : "free",
            updated: new Date()
          });
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

  function updateDashboard() {
    var total = spots.length;
    var busy = spots.filter(function (s) { return s.status === "busy"; }).length;
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
    else { state = "plenty"; label = "Plenty of space"; }
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
    var now = new Date();
    var li = document.createElement("li");
    li.innerHTML = '<span class="dot ' + kind + '"></span><time>' + timeStr(now) + "</time><span>" + text + "</span>";
    el.feed.insertBefore(li, el.feed.firstChild);
    while (el.feed.children.length > FEED_LIMIT) el.feed.removeChild(el.feed.lastChild);
    el.lastReading.textContent = timeStr(now);
  }

  function ping(s) {
    s.el.classList.remove("ping");
    void s.el.getBoundingClientRect(); // restart the animation
    s.el.classList.add("ping");
  }

  /* ---------- state changes ---------- */
  function setStatus(s, status, source) {
    if (s.status === status) return;
    s.status = status;
    s.updated = new Date();
    paintSpot(s);
    ping(s);
    if (source === "manual") {
      addFeed("info", "Manual override: <b>" + s.id + "</b> set to " + statusWord(status));
    } else {
      addFeed(status, status === "busy"
        ? "Sensor <b>" + s.id + "</b> detected a vehicle"
        : "Sensor <b>" + s.id + "</b> reports space clear");
    }
    updateDashboard();
  }

  /* One simulated sensor event: a car arrives or leaves. */
  function simulateEvent() {
    var free = spots.filter(function (s) { return s.status === "free"; });
    var busy = spots.filter(function (s) { return s.status === "busy"; });
    var occ = busy.length / spots.length;
    // drift toward the target occupancy
    var pArrival = Math.min(0.8, Math.max(0.2, 0.5 + (TARGET_OCCUPANCY - occ) * 1.2));
    var arrival = Math.random() < pArrival;
    if (arrival && free.length === 0) arrival = false;
    if (!arrival && busy.length === 0) arrival = true;
    if (arrival) setStatus(pick(free), "busy", "sensor");
    else setStatus(pick(busy), "free", "sensor");
  }

  function tick() {
    var events = 1 + Math.floor(Math.random() * 3);
    for (var i = 0; i < events; i++) simulateEvent();
    scheduleNext();
  }

  function scheduleNext() {
    clearTimeout(timer);
    if (!el.auto.checked) return;
    var base = parseInt(el.speed.value, 10);
    timer = setTimeout(tick, base * rand(0.6, 1.4));
  }

  function setLive(on) {
    el.live.setAttribute("data-on", on ? "true" : "false");
    el.liveText.textContent = on ? "Sensors live" : "Sensors paused";
  }

  function bulk(fn, message) {
    spots.forEach(function (s) {
      var next = fn();
      if (s.status !== next) { s.status = next; s.updated = new Date(); paintSpot(s); }
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
    setStatus(s, s.status === "busy" ? "free" : "busy", "manual");
    el.announce.textContent = "Space " + s.id + " is now " + statusWord(s.status) + ". " + el.free.textContent + " available.";
  }

  function showTip(s, x, y) {
    el.tip.innerHTML = "<strong>" + s.id + "</strong>" + statusWord(s.status) + ", updated " + timeStr(s.updated);
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

  el.auto.addEventListener("change", function () {
    setLive(el.auto.checked);
    scheduleNext();
  });
  el.speed.addEventListener("change", scheduleNext);

  document.getElementById("btnRandom").addEventListener("click", function () {
    bulk(function () { return Math.random() < START_BUSY_CHANCE ? "busy" : "free"; }, "All sensors re-read (randomized)");
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
  updateDashboard();
  addFeed("info", "Sensor network online: " + spots.length + " spaces");
  setLive(true);
  scheduleNext();
})();
