// Library Checker — private stats page. Builds everything with textContent
// (never innerHTML), so nothing from the data can inject markup.
(function () {
  "use strict";

  var form = document.getElementById("admin-form");
  if (!form) return;
  var input = document.getElementById("admin-token");
  var status = document.getElementById("admin-status");
  var out = document.getElementById("stats");
  var token = null;

  var el = function (tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  };
  var num = function (n) { return Number(n || 0).toLocaleString("en-US"); };
  var pct = function (a, b) { return b ? Math.round((a / b) * 100) + "%" : "—"; };
  var say = function (kind, text) { status.className = "form-status " + kind; status.textContent = text; status.hidden = false; };

  function section(title, note) {
    var s = el("section", "stat-section");
    s.appendChild(el("h2", null, title));
    if (note) s.appendChild(el("p", "muted small", note));
    out.appendChild(s);
    return s;
  }

  function cards(parent, items) {
    var grid = el("div", "stat-grid");
    items.forEach(function (it) {
      var c = el("div", "stat-card");
      c.appendChild(el("div", "stat-value", it[1]));
      c.appendChild(el("div", "stat-label", it[0]));
      if (it[2]) c.appendChild(el("div", "stat-note", it[2]));
      grid.appendChild(c);
    });
    parent.appendChild(grid);
  }

  function table(parent, headers, rows) {
    var wrap = el("div", "table-wrap");
    var t = el("table", "compare");
    var head = el("tr");
    headers.forEach(function (h) { var th = el("th", null, h); th.scope = "col"; head.appendChild(th); });
    t.appendChild(el("thead")).appendChild(head);
    var body = el("tbody");
    rows.forEach(function (r) {
      var tr = el("tr");
      r.forEach(function (cell) { tr.appendChild(el("td", null, cell)); });
      body.appendChild(tr);
    });
    if (!rows.length) { var e = el("tr"); var td = el("td", null, "Nothing yet"); td.colSpan = headers.length; e.appendChild(td); body.appendChild(e); }
    t.appendChild(body);
    wrap.appendChild(t);
    parent.appendChild(wrap);
  }

  function bars(parent, title, series) {
    var box = el("div", "chart");
    box.appendChild(el("h3", null, title));
    var max = Math.max.apply(null, series.map(function (p) { return p.value; }).concat([1]));
    var row = el("div", "bars");
    series.forEach(function (p) {
      var bar = el("div", "bar");
      bar.style.height = Math.max(2, Math.round((p.value / max) * 100)) + "%";
      bar.title = p.date + ": " + p.value;
      row.appendChild(bar);
    });
    box.appendChild(row);
    var last = series.reduce(function (a, p) { return a + p.value; }, 0);
    box.appendChild(el("div", "chart-foot", "Last 30 days: " + num(last) + " · peak " + num(max === 1 && last === 0 ? 0 : max) + " in a day"));
    parent.appendChild(box);
  }

  function render(d) {
    out.textContent = "";
    var u = d.users, a = d.activity;

    var s1 = section("Accounts");
    cards(s1, [
      ["Total accounts", num(u.total)],
      ["Email confirmed", num(u.verified), pct(u.verified, u.total) + " of accounts"],
      ["Premium", num(u.premium), pct(u.premium, u.total) + " of accounts"],
      ["Free", num(u.free)],
      ["Joined with Google", num(u.google)],
      ["Signed up, last 7 days", num(u.signups7)],
      ["Signed up, last 30 days", num(u.signups30)],
      ["Ever checked a book", num(u.everChecked), pct(u.everChecked, u.total) + " of accounts"],
    ]);

    var s2 = section("Activity");
    var trend = a.activePrev7 ? (a.active7 >= a.activePrev7 ? "up" : "down") + " from " + num(a.activePrev7) + " the week before" : "";
    cards(s2, [
      ["Active users, last 7 days", num(a.active7), trend],
      ["Book checks, last 7 days", num(a.checks7)],
      ["Book checks, last 30 days", num(a.checks30)],
      ["Shelf scans, last 30 days", num(a.scans30)],
      ["Free users who scanned a shelf", num(a.freeScanners30), "last 30 days"],
      ["Books on watched shelves", num(a.watches), num(a.watchers) + " Premium user(s)"],
    ]);

    var s3 = section("Free limits — who hits them, and do they upgrade?",
      "A person is counted once per period. \"Upgraded\" means they are Premium now. Limit events are recorded from the day this page was added, so early numbers start low.");
    cards(s3, [["Used all 5 daily checks on at least one day", num(d.reachedCheckLimit30), "last 30 days, free accounts (from usage records)"]]);
    table(s3, ["Limit hit", "People, 7 days", "People, 30 days", "Now Premium", "Conversion"],
      d.limits.map(function (l) {
        return [l.label, num(l.last7.users), num(l.last30.users), num(l.last30.upgraded), pct(l.last30.upgraded, l.last30.users)];
      }));

    var s4 = section("Trends");
    var charts = el("div", "chart-grid");
    bars(charts, "Active users per day", d.daily.active);
    bars(charts, "Book checks per day", d.daily.checks);
    bars(charts, "Sign-ups per day", d.daily.signups);
    bars(charts, "Shelf scans per day", d.daily.scans);
    s4.appendChild(charts);

    var s5 = section("What people check", "Last 30 days.");
    table(s5, ["Library", "Checks", "People", "Digital-only"],
      d.topLibraries.map(function (l) { return [l.name || "Unknown", num(l.checks), num(l.users), l.digital_only ? "yes" : ""]; }));
    var mix = el("div", "mt-20");
    s5.appendChild(mix);
    table(mix, ["Result", "Lookups"], d.results.map(function (r) { return [r.status, num(r.n)]; }));

    var s6 = section("Health");
    cards(s6, [
      ["Lookups, last 7 days", num(d.health.lookups7)],
      ["Lookups that failed", num(d.health.errors7), (d.health.errorRate7 * 100).toFixed(1) + "% of lookups"],
    ]);

    out.appendChild(el("p", "muted small", "Generated " + new Date(d.generatedAt).toLocaleString() + " · days are UTC."));
    out.hidden = false;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    token = input.value.trim();
    if (!token) { say("err", "Enter the admin token."); return; }
    var button = form.querySelector("button[type=submit]");
    button.disabled = true;
    status.hidden = true;

    fetch("/admin/stats", { method: "POST", headers: { Authorization: "Bearer " + token } })
      .then(function (resp) {
        return resp.json().catch(function () { return {}; }).then(function (data) { return { ok: resp.ok, data: data }; });
      })
      .then(function (r) {
        if (!r.ok) { out.hidden = true; say("err", r.data.error || "Couldn't load the stats."); return; }
        status.hidden = true;
        render(r.data);
      })
      .catch(function () { say("err", "Couldn't reach the server."); })
      .then(function () { button.disabled = false; });
  });
})();
