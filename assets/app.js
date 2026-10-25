(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const KEY = "pa-pw";
  let DATA = null, current = null, filter = "all", query = "", sortBy = "title";
  const kinds = new Set(); // empty = όλα
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
      return `<button class="tab" role="tab" style="--c:${ch.color}" aria-selected="${ch.id === current.id}" data-ch="${ch.id}" aria-label="${esc(ch.name)}">
        <span class="logo"><img src="assets/logos/${ch.id}.png" alt="${esc(ch.name)}"></span> <small>${pct(x.f + x.p, x.t)}%</small></button>`;
    }).join("");
  }
  function renderSummary() {
    const x = chStats(current);
    document.documentElement.style.setProperty("--ch", current.color);
    $("#summary").innerHTML = `
      ${pie(x.f, x.p, x.t, 92, 16)}
      <div style="flex:1;min-width:240px">
        <h2><span class="logo big"><img src="assets/logos/${current.id}.png" alt=""></span>${esc(current.name)}</h2>
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
  const KINDS = [["Anime", "Anime"], ["Κινούμενα σχέδια", "Cartoon"], ["Ζωντανής δράσης", "Live action"]];
  const kindsOf = (s) => s.kind === "Μικτό" ? ["Κινούμενα σχέδια", "Ζωντανής δράσης"] : [s.kind];
  function renderKinds() {
    $("#kinds").innerHTML = `<button class="chip" data-k="" aria-pressed="${kinds.size === 0}">Όλα</button>` +
      KINDS.map(([k, l]) => `<button class="chip" data-k="${k}" aria-pressed="${kinds.has(k)}">${l}</button>`).join("");
  }
  const year = (v) => { const m = String(v ?? "").match(/(19|20)\d\d/); return m ? +m[0] : null; };
  function sorter(a, b) {
    const t = a.title.localeCompare(b.title, "en", { sensitivity: "base" });
    if (sortBy === "title") return t;
    const [field, dir] = sortBy.split("-");
    const va = field === "prod" ? year(a.years) : year(a.aired), vb = field === "prod" ? year(b.years) : year(b.aired);
    if (va === vb) return t;
    if (va === null) return 1; if (vb === null) return -1;
    return dir === "asc" ? va - vb : vb - va;
  }
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  function renderList() {
    const q = norm(query.trim());
    const rows = current.series.filter((s) => {
      if (q && !norm(s.title).includes(q)) return false;
      if (kinds.size && !kindsOf(s).some((k) => kinds.has(k))) return false;
      const x = stats(s), got = x.f + x.p;
      if (filter === "some") return got > 0;
      if (filter === "done") return x.t > 0 && got >= x.t;
      if (filter === "none") return got === 0;
      return true;
    }).sort(sorter);
    $("#empty").hidden = rows.length > 0;
    $("#list").innerHTML = rows.map((s) => {
      const x = stats(s), isOpen = open.has(current.id + "/" + s.id);
      const meta = [s.kind === "Μικτό" ? "Κινούμενα σχέδια & ζωντανής δράσης" : s.kind, s.years, s.aired ? "1η προβολή " + s.aired : "", s.channel].filter(Boolean).join(" · ");
      return `<li class="item${isOpen ? " open" : ""}">
        <button class="row" data-id="${esc(s.id)}" aria-expanded="${isOpen}">
          ${s.img ? `<span class="ava"><img src="${esc(s.img)}" alt="" loading="lazy">${pie(x.f, x.p, x.t, 16, 4)}</span>` : pie(x.f, x.p, x.t, 30, 7)}
          <span><span class="t">${esc(s.title)}</span><br><span class="m">${esc(meta)}</span></span>
          <span class="count">${x.t ? `<b>${x.f + x.p}</b> / ${x.t}` : "—"}<span class="chev">›</span></span>
        </button>
        ${isOpen ? detail(s) : ""}
      </li>`;
    }).join("");
  }
  function detail(s) {
    let grid = "";
    if (s.eplist && s.eplist.length) {
      const pad = (n, w) => String(n).padStart(w, "0");
      const rows = s.eplist.map((ep, i) => {
        const e = s.episodes[String(i + 1)], st = e ? e.s : "m";
        const code = ep.s != null ? `S${pad(ep.s, 2)}E${pad(ep.e, 3)}` : pad(ep.e, 3);
        const lab = st === "f" ? "βρέθηκε" : st === "p" ? "με ελλείψεις" : "λείπει";
        return `<li class="epl ${st}"><span class="code">${code}</span><span class="et">${esc(ep.t || "")}${e && e.n ? `<small>${esc(e.n)}</small>` : ""}</span><span class="st">${lab}</span></li>`;
      }).join("");
      grid = `<ol class="eplist">${rows}</ol>`;
    } else if (s.total) {
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
    const notes = (s.eplist && s.eplist.length) ? "" : Object.keys(s.episodes).map(Number).sort((a, b) => a - b)
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
    renderTabs(); renderSummary(); renderKinds(); renderChips(); renderList();
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
  $("#kinds").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    const k = b.dataset.k;
    if (!k) kinds.clear(); else kinds.has(k) ? kinds.delete(k) : kinds.add(k);
    renderKinds(); renderList();
  });
  $("#sort").addEventListener("change", (e) => { sortBy = e.target.value; renderList(); });
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
