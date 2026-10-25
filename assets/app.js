(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const KEY = "pa-pw";
  let DATA = null, current = null, filter = "all", query = "";
  const open = new Set();

  // ---------- storage helpers (never required to work) ----------
  const store = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
    del: (k) => { try { sessionStorage.removeItem(k); } catch {} },
  };

  // ---------- crypto ----------
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function decrypt(env, pw) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt: b64(env.salt), iterations: env.iter },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(env.iv) }, key, b64(env.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  async function unlock(pw) {
    const res = await fetch("data/archive.enc.json?v=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("load");
    return decrypt(await res.json(), pw);
  }

  // ---------- numbers ----------
  function stats(s) {
    let f = 0, p = 0;
    for (const k in s.episodes) {
      const n = +k;
      if (s.total && n > s.total) continue;
      if (s.episodes[k].s === "f") f++; else if (s.episodes[k].s === "p") p++;
    }
    return { f, p, t: s.total || 0 };
  }
  function chStats(ch) {
    let f = 0, p = 0, t = 0, done = 0, any = 0;
    for (const s of ch.series) {
      const x = stats(s); f += x.f; p += x.p; t += x.t;
      if (x.t && x.f + x.p >= x.t) done++;
      if (x.f + x.p > 0) any++;
    }
    return { f, p, t, done, any, n: ch.series.length };
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  // ---------- pie (SVG donut) ----------
  function pie(f, p, t, size, stroke) {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r, cx = size / 2;
    const seg = (v, off, col) => v > 0
      ? `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${col}" stroke-width="${stroke}"
           stroke-dasharray="${(v / t) * c} ${c}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cx})"/>` : "";
    const base = `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${t ? "var(--missing)" : "var(--line)"}" stroke-width="${stroke}"/>`;
    const fo = t ? (f / t) * c : 0;
    return `<svg class="pie" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">${base}${t ? seg(f, 0, "var(--found)") + seg(p, fo, "var(--partial)") : ""}</svg>`;
  }

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- render ----------
  function renderTabs() {
    $("#tabs").innerHTML = DATA.channels.map((ch) => {
      const x = chStats(ch);
      return `<button class="tab" role="tab" style="--c:${ch.color}" aria-selected="${ch.id === current.id}" data-ch="${ch.id}">
        <span class="dot"></span>${esc(ch.name)} <small>${pct(x.f + x.p, x.t)}%</small></button>`;
    }).join("");
  }
  function renderSummary() {
    const x = chStats(current);
    document.documentElement.style.setProperty("--ch", current.color);
    $("#summary").innerHTML = `
      ${pie(x.f, x.p, x.t, 92, 16)}
      <div style="flex:1;min-width:240px">
        <h2>${esc(current.name)}</h2>
        <div class="stats" style="margin-top:8px">
          <div class="stat"><b>${x.n}</b><span>σειρές</span></div>
          <div class="stat"><b>${x.t.toLocaleString("el-GR")}</b><span>επεισόδια</span></div>
          <div class="stat"><b>${(x.f + x.p).toLocaleString("el-GR")}</b><span>βρέθηκαν</span></div>
          <div class="stat"><b>${pct(x.f + x.p, x.t)}%</b><span>ολοκλήρωση</span></div>
        </div>
        <div class="legend"><span><i style="background:var(--found)"></i>βρέθηκε</span>
          <span><i style="background:var(--partial)"></i>βρέθηκε με ελλείψεις</span>
          <span><i style="background:var(--missing)"></i>λείπει</span>
          <span>${x.done} σειρές ολοκληρωμένες · ${x.any} με κάτι</span></div>
      </div>`;
  }
  const FILTERS = [["all", "Όλες"], ["some", "Έχει βρεθεί κάτι"], ["done", "Ολοκληρωμένες"], ["none", "Τίποτα ακόμα"]];
  function renderChips() {
    $("#chips").innerHTML = FILTERS.map(([k, l]) =>
      `<button class="chip" data-f="${k}" aria-pressed="${filter === k}">${l}</button>`).join("");
  }
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  function renderList() {
    const q = norm(query.trim());
    const rows = current.series.filter((s) => {
      if (q && !norm(s.title).includes(q)) return false;
      const x = stats(s), got = x.f + x.p;
      if (filter === "some") return got > 0;
      if (filter === "done") return x.t > 0 && got >= x.t;
      if (filter === "none") return got === 0;
      return true;
    });
    $("#empty").hidden = rows.length > 0;
    $("#list").innerHTML = rows.map((s) => {
      const x = stats(s), isOpen = open.has(current.id + "/" + s.id);
      const meta = [s.kind, s.years, s.aired ? "1η προβολή " + s.aired : "", s.channel].filter(Boolean).join(" · ");
      return `<li class="item${isOpen ? " open" : ""}">
        <button class="row" data-id="${esc(s.id)}" aria-expanded="${isOpen}">
          ${pie(x.f, x.p, x.t, 30, 7)}
          <span><span class="t">${esc(s.title)}</span><br><span class="m">${esc(meta)}</span></span>
          <span class="count">${x.t ? `<b>${x.f + x.p}</b> / ${x.t}` : "—"}<span class="chev">›</span></span>
        </button>
        ${isOpen ? detail(s) : ""}
      </li>`;
    }).join("");
  }
  function detail(s) {
    let grid = "";
    if (s.total) {
      const cells = [];
      for (let i = 1; i <= s.total; i++) {
        const e = s.episodes[String(i)], cls = e ? e.s : "";
        const tip = `Επεισόδιο ${i}: ${e ? (e.s === "f" ? "βρέθηκε" : "βρέθηκε με ελλείψεις") : "λείπει"}${e && e.n ? " — " + e.n : ""}`;
        cells.push(`<span class="ep ${cls}${e && e.n ? " has-note" : ""}" title="${esc(tip)}">${i}</span>`);
      }
      grid = `<div class="eps">${cells.join("")}</div>`;
    } else {
      grid = `<p class="no-total">Δεν έχει οριστεί ακόμα ο αριθμός επεισοδίων για αυτή τη σειρά.</p>`;
    }
    const notes = Object.keys(s.episodes).map(Number).sort((a, b) => a - b)
      .filter((n) => s.episodes[n].n)
      .map((n) => `<li><b>Επ. ${n}</b>${esc(s.episodes[n].n)}</li>`).join("");
    return `<div class="detail">
      ${grid}
      ${notes ? `<ul class="notes">${notes}</ul>` : ""}
      ${s.notes ? `<p class="meta">${esc(s.notes)}</p>` : ""}
      ${s.gddb ? `<p class="meta"><a href="${esc(s.gddb)}" target="_blank" rel="noopener">Σελίδα στο GreekDubDB ↗</a></p>` : ""}
    </div>`;
  }
  function renderAll() {
    renderTabs(); renderSummary(); renderChips(); renderList();
    const d = DATA.updated ? new Date(DATA.updated) : null;
    $("#updated").textContent = d ? "Τελευταία ενημέρωση: " + d.toLocaleDateString("el-GR", { day: "numeric", month: "long", year: "numeric" }) : "";
  }

  // ---------- events ----------
  $("#tabs").addEventListener("click", (e) => {
    const b = e.target.closest(".tab"); if (!b) return;
    current = DATA.channels.find((c) => c.id === b.dataset.ch);
    renderAll(); window.scrollTo({ top: 0 });
  });
  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    filter = b.dataset.f; renderChips(); renderList();
  });
  $("#search").addEventListener("input", (e) => { query = e.target.value; renderList(); });
  $("#list").addEventListener("click", (e) => {
    const b = e.target.closest(".row"); if (!b) return;
    const k = current.id + "/" + b.dataset.id;
    open.has(k) ? open.delete(k) : open.add(k);
    renderList();
  });
  $("#logout").addEventListener("click", () => { store.del(KEY); location.reload(); });

  async function start(pw, silent) {
    const msg = $("#lock-msg");
    try {
      DATA = await unlock(pw);
      store.set(KEY, pw);
      current = DATA.channels[0];
      $("#lock").hidden = true; $("#app").hidden = false;
      renderAll();
    } catch (err) {
      store.del(KEY);
      if (!silent) msg.textContent = err.message === "load" ? "Δεν φορτώθηκαν τα δεδομένα. Δοκίμασε ξανά." : "Λάθος κωδικός.";
    }
  }
  $("#lock-form").addEventListener("submit", (e) => {
    e.preventDefault(); $("#lock-msg").textContent = "";
    start($("#pw").value, false);
  });
  const saved = store.get(KEY);
  if (saved) start(saved, true); else $("#pw").focus();
})();
