// Library Checker website — small, dependency-free helpers.
(function () {
  "use strict";

  // ── Mobile menu ──
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("open")) {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      }
    });
  }

  // ── Supported libraries: live search + country filter ──
  var search = document.getElementById("lib-search");
  if (search) {
    var rows = Array.prototype.slice.call(document.querySelectorAll(".lib-row"));
    var chips = Array.prototype.slice.call(document.querySelectorAll(".chip"));
    var count = document.getElementById("lib-count");
    var empty = document.getElementById("lib-empty");
    var country = "all";

    var apply = function () {
      var q = search.value.trim().toLowerCase();
      var shown = 0;
      rows.forEach(function (row) {
        var match = (country === "all" || row.dataset.country === country) &&
                    (!q || row.dataset.name.indexOf(q) !== -1);
        row.hidden = !match;
        if (match) shown++;
      });
      count.textContent = shown + " of " + rows.length + " libraries";
      empty.hidden = shown !== 0;
    };

    search.addEventListener("input", apply);
    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        country = chip.dataset.country;
        chips.forEach(function (c) { c.setAttribute("aria-pressed", String(c === chip)); });
        apply();
      });
    });
    apply();
  }

  // ── Contact form ──
  var form = document.getElementById("contact-form");
  if (form) {
    var status = document.getElementById("form-status");
    var button = form.querySelector("button[type=submit]");
    var openedAt = Date.now();

    var show = function (kind, text) {
      status.className = "form-status " + kind;
      status.textContent = text;
      status.hidden = false;
    };

    // Pre-select a topic from a link such as /contact?topic=library
    var topic = new URLSearchParams(location.search).get("topic");
    if (topic && form.elements.topic) {
      Array.prototype.forEach.call(form.elements.topic.options, function (o) {
        if (o.value === topic) form.elements.topic.value = topic;
      });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      status.hidden = true;
      button.disabled = true;
      button.textContent = "Sending…";

      fetch("/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.elements.name.value,
          email: form.elements.email.value,
          topic: form.elements.topic.value,
          message: form.elements.message.value,
          website: form.elements.website.value,
          elapsed: Date.now() - openedAt
        })
      })
        .then(function (resp) {
          return resp.json().catch(function () { return {}; }).then(function (data) {
            return { ok: resp.ok, data: data };
          });
        })
        .then(function (r) {
          if (r.ok) {
            show("ok", "Thanks — your message is on its way. We'll reply to the email address you gave.");
            form.reset();
          } else {
            show("err", r.data.error || "Something went wrong. Please try again in a moment.");
          }
        })
        .catch(function () {
          show("err", "Couldn't reach the server. Check your connection and try again.");
        })
        .then(function () {
          button.disabled = false;
          button.textContent = "Send message";
        });
    });
  }
})();
