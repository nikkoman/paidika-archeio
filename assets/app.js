(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const KEY = "pa-pw";
  let DATA = null, current = null, filter = "all", query = "", sortBy = "title", scope = "all"; // scope: αναζήτηση σε "all" κανάλια ή "ch" (μόνο το τρέχον)
  const kinds = new Set(); // empty = όλα
  const open = new Set();

  // ---------- storage helpers (never required to work) ----------
  const store = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
    del: (k) => { try { sessionStorage.removeItem(k); } catch {} },
  };

  // ---------- κατάσταση οθόνης (επιβιώνει την ανανέωση της σελίδας) ----------
  const UI = "pa-ui";
  // η θέση στη σελίδα κρατιέται στο localStorage, ώστε να επιβιώνει και όταν ο browser σβήνει το sessionStorage
  const ui = {
    get: () => { try { return localStorage.getItem(UI); } catch { return null; } },
    set: (v) => { try { localStorage.setItem(UI, v); } catch {} },
    del: () => { try { localStorage.removeItem(UI); } catch {} },
  };
  function saveUI() {
    if (!current) return;
    ui.set(JSON.stringify({ ch: current.id, filter, query, sortBy, scope, kinds: [...kinds], open: [...open], y: window.scrollY }));
  }
  function restoreUI() {
    let u; try { u = JSON.parse(ui.get() || "null"); } catch { u = null; }
    if (!u) return 0;
    current = chById(u.ch) || current;
    filter = u.filter || "all"; query = u.query || ""; sortBy = u.sortBy || "title"; scope = u.scope || "all";
    (u.kinds || []).forEach((k) => kinds.add(k)); (u.open || []).forEach((k) => open.add(k));
    $("#search").value = query; $("#sort").value = sortBy;
    return u.y || 0;
  }
  // ύψος της σταθερής μπάρας, ώστε οι σειρές που ανοίγουν να μην κρύβονται από κάτω της
  if (window.ResizeObserver) new ResizeObserver(([e]) =>
    document.documentElement.style.setProperty("--bar-h", e.target.offsetHeight + "px")).observe($("#bar"));
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  let saveT = 0;
  window.addEventListener("scroll", () => { clearTimeout(saveT); saveT = setTimeout(saveUI, 200); }, { passive: true });
  window.addEventListener("pagehide", saveUI);

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
  let BYWORK = {};
  const epsOf = (s) => (DATA.dubs[s.dub] || {}).episodes || {};
  const listOf = (s) => (DATA.works[s.work] || {}).eplist || null;
  const totalOf = (s) => s.total || (listOf(s) ? listOf(s).length : 0);
  // «έχουμε Ν, άγνωστο ποια»: όσα από τα Ν δεν έχουν σημειωθεί ακόμα συγκεκριμένα
  const claimOf = (s) => (DATA.dubs[s.dub] || {}).claim || null;
  function stats(s) {
    let f = 0, p = 0;
    const E = epsOf(s), t = totalOf(s), cl = claimOf(s);
    for (const k in E) {
      if (t && +k > t) continue;
      if (E[k].s === "f") f++; else if (E[k].s === "p") p++;
    }
    const u = cl ? Math.max(0, Math.min(cl.n, t || cl.n) - f - p) : 0;
    return { f, p, u, t };
  }
  function indexWorks() {
    BYWORK = {};
    for (const ch of DATA.channels) for (const s of ch.series) (BYWORK[s.work] ||= []).push({ ch, s });
  }
  // καρτέλα «Όλα»: κάθε σειρά (έργο) μία φορά. Η πρόοδός της είναι η ένωση όλων των μεταγλωττίσεων:
  // ένα επεισόδιο μετράει «βρέθηκε» αν βρέθηκε σε οποιοδήποτε κανάλι.
  let ALL = null;
  const RANK = { f: 2, p: 1 };
  function buildAll() {
    const groups = new Map();
    for (const ch of DATA.channels) for (const s of ch.series) {
      const k = s.work || ch.id + "/" + s.id;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ ch, s });
    }
    const series = [];
    for (const [k, g] of groups) {
      const dub = "*all/" + k, E = {}, seen = new Set();
      let total = 0, claim = null, aired = null;
      for (const { s } of g) {
        total = Math.max(total, totalOf(s));
        const cl = claimOf(s); if (cl && (!claim || cl.n > claim.n)) claim = cl;
        if (s.aired && (!aired || s.aired < aired)) aired = s.aired;
        if (seen.has(s.dub)) continue; seen.add(s.dub);
        const e = epsOf(s);
        for (const n in e) if (!E[n] || RANK[e[n].s] > RANK[E[n].s]) E[n] = e[n];
      }
      DATA.dubs[dub] = { episodes: E, ...(claim ? { claim } : {}) };
      const base = g[0].s;
      series.push({ ...base, id: "w-" + k.replace(/[^\w-]/g, "_"), dub, total, aired, airedApprox: false, dubyear: null, channel: "", notes: "", group: g });
    }
    ALL = { id: "all", name: "Όλα τα κανάλια", color: "#6d5bd0", series };
  }
  const chById = (id) => (id === "all" ? ALL : DATA.channels.find((c) => c.id === id));
  // η μεταγλώττιση που δείχνεται πρώτη μέσα σε μια σειρά της καρτέλας «Όλα»: όποια έχει τα περισσότερα
  const pick = {};
  const bestOf = (g) => g.reduce((a, b) => { const x = stats(a.s), y = stats(b.s); return y.f + y.p + y.u > x.f + x.p + x.u ? b : a; });
  const chipLogos = (g) => [...new Map(g.map((o) => [o.ch.id, o.ch])).values()]
    .map((ch) => `<span class="logo" title="${esc(ch.name)}"><img src="assets/logos/${ch.id}.png" alt="${esc(ch.name)}"></span>`).join("");
  function chStats(ch) {
    let f = 0, p = 0, u = 0, t = 0, done = 0, any = 0;
    for (const s of ch.series) {
      const x = stats(s); f += x.f; p += x.p; u += x.u; t += x.t;
      if (x.t && x.f + x.p + x.u >= x.t) done++;
      if (x.f + x.p + x.u > 0) any++;
    }
    return { f, p, u, t, done, any, n: ch.series.length };
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  // ---------- pie (SVG donut) ----------
  function pie(f, p, t, size, stroke, u = 0) {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r, cx = size / 2;
    const seg = (v, off, col) => v > 0
      ? `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${col}" stroke-width="${stroke}"
           stroke-dasharray="${(v / t) * c} ${c}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cx})"/>` : "";
    const base = `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${t ? "var(--missing)" : "var(--line)"}" stroke-width="${stroke}"/>`;
    const fo = t ? (f / t) * c : 0;
    return `<svg class="pie" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">${base}${t ? seg(f, 0, "var(--found)") + seg(p, fo, "var(--partial)") + seg(u, fo + (p / t) * c, "var(--unknown)") : ""}</svg>`;
  }

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- αντιγραφή στο clipboard (για επικόλληση στο /πες) ----------
  const copyBtn = (text, label) =>
    `<span class="cp" role="button" tabindex="0" title="${esc(label)}" aria-label="${esc(label)}" data-copy="${esc(text)}">📋</span>`;
  async function copyText(text, el) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta);
      ta.select(); try { document.execCommand("copy"); } catch {} ta.remove();
    }
    el.textContent = "✓"; el.classList.add("ok");
    setTimeout(() => { el.textContent = "📋"; el.classList.remove("ok"); }, 1200);
  }

  // ---------- render ----------
  function renderTabs() {
    $("#tabs").innerHTML = [ALL, ...DATA.channels].map((ch) => {
      const x = chStats(ch);
      return `<button class="tab" role="tab" style="--c:${ch.color}" aria-selected="${ch.id === current.id}" data-ch="${ch.id}" aria-label="${esc(ch.name)}">
        <span class="logo">${ch === ALL ? `<b class="all-logo">ΟΛΑ</b>` : `<img src="assets/logos/${ch.id}.png" alt="${esc(ch.name)}">`}</span> <small>${pct(x.f + x.p + x.u, x.t)}%</small></button>`;
    }).join("");
  }
  function renderSummary() {
    const x = chStats(current);
    document.documentElement.style.setProperty("--ch", current.color);
    $("#summary").innerHTML = `
      ${pie(x.f, x.p, x.t, 92, 16, x.u)}
      <div style="flex:1;min-width:240px">
        <h2><span class="logo big">${current === ALL ? `<b class="all-logo">ΟΛΑ</b>` : `<img src="assets/logos/${current.id}.png" alt="">`}</span>${esc(current.name)}</h2>
        <div class="stats" style="margin-top:8px">
          <div class="stat"><b>${x.n.toLocaleString("el-GR")}</b><span>σειρές</span></div>
          <div class="stat"><b>${x.t.toLocaleString("el-GR")}</b><span>επεισόδια</span></div>
          <div class="stat"><b>${(x.f + x.p + x.u).toLocaleString("el-GR")}</b><span>βρέθηκαν</span></div>
          <div class="stat"><b>${pct(x.f + x.p + x.u, x.t)}%</b><span>ολοκλήρωση</span></div>
        </div>
        <div class="legend"><span><i style="background:var(--found)"></i>βρέθηκε</span>
          <span><i style="background:var(--found-note)"></i>βρέθηκε, με σημείωση</span>
          <span><i style="background:var(--partial)"></i>βρέθηκε με ελλείψεις</span>
          <span><i style="background:var(--unknown)"></i>έχουμε, άγνωστο ποια</span>
          <span><i style="background:var(--missing)"></i>λείπει</span>
          <span>${x.done} σειρές ολοκληρωμένες · ${x.any} με κάτι</span></div>
      </div>`;
  }
  const FILTERS = [["all", "Όλες"], ["some", "Έχει βρεθεί κάτι"], ["done", "Ολοκληρωμένες"], ["none", "Τίποτα ακόμα"]];
  function renderChips() {
    $("#chips").innerHTML = FILTERS.map(([k, l]) =>
      `<button class="chip" data-f="${k}" aria-pressed="${filter === k}">${l}</button>`).join("");
  }
  const KINDS = [["Anime", "Anime"], ["Κινούμενα σχέδια", "Cartoon"], ["Ζωντανής δράσης", "Live action"], ["Εκπομπή", "Εκπομπές"]];
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
    const va = field === "prod" ? year(a.years) : year(a.aired || a.dubyear), vb = field === "prod" ? year(b.years) : year(b.aired || b.dubyear);
    if (va === vb) return t;
    if (va === null) return 1; if (vb === null) return -1;
    return dir === "asc" ? va - vb : vb - va;
  }
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  function renderList() {
    const q = norm(query.trim()), global = q && scope === "all" && current !== ALL;
    renderScope();
    // με αναζήτηση σε όλα τα κανάλια, η λίστα έχει σειρές από κάθε κανάλι (με το λογότυπό του)
    const pool = global ? DATA.channels.flatMap((ch) => ch.series.map((s) => ({ ch, s }))) : current.series.map((s) => ({ ch: current, s }));
    const rows = pool.filter(({ s }) => {
      if (q && !norm(s.title + " " + (s.gr || "")).includes(q)) return false;
      if (kinds.size && !kindsOf(s).some((k) => kinds.has(k))) return false;
      const x = stats(s), got = x.f + x.p + x.u;
      if (filter === "some") return got > 0;
      if (filter === "done") return x.t > 0 && got >= x.t;
      if (filter === "none") return got === 0;
      return true;
    }).sort((a, b) => sorter(a.s, b.s));
    $("#empty").hidden = rows.length > 0;
    $("#list").innerHTML = rows.map(({ ch, s }) => {
      const x = stats(s), isOpen = open.has(ch.id + "/" + s.id);
      const meta = [s.kind === "Μικτό" ? "Κινούμενα σχέδια & ζωντανής δράσης" : s.kind, s.years, s.aired ? `1η προβολή ${s.airedApprox ? "~" : ""}${s.aired}${s.dubyear && s.dubyear !== s.aired ? ` (μεταγλ. ${s.dubyear})` : ""}` : s.dubyear ? `μεταγλ. ${s.dubyear}` : "", s.channel].filter(Boolean).join(" · ");
      return `<li class="item${isOpen ? " open" : ""}">
        <button class="row" data-ch="${ch.id}" data-id="${esc(s.id)}" aria-expanded="${isOpen}">
          ${pie(x.f, x.p, x.t, 30, 7, x.u)}
          <span class="ttl">${s.group ? `<span class="logos">${chipLogos(s.group)}</span>` : ""}${global ? `<span class="logo" title="${esc(ch.name)}"><img src="assets/logos/${ch.id}.png" alt="${esc(ch.name)}"></span>` : ""}${s.img ? `<img class="ava" src="${esc(s.img)}" alt="" loading="lazy">` : ""}<span><span class="t">${esc(s.title)}</span>${copyBtn(s.title, "Αντιγραφή τίτλου")}<br><span class="m">${esc(meta)}</span></span></span>
          <span class="count">${x.t ? `<b>${x.f + x.p + x.u}</b> / ${x.t}` : "—"}${x.u ? `<span class="unk" title="${x.u} από αυτά: άγνωστο ποια">?</span>` : ""}${!s.group && (BYWORK[s.work] || []).length > 1 ? `<span class="multi" title="Προβλήθηκε και σε άλλο κανάλι">⇄</span>` : ""}<span class="chev">›</span></span>
        </button>
        ${isOpen ? (s.group ? groupDetail(s) : detail(s)) : ""}
      </li>`;
    }).join("");
  }
  function renderScope() {
    const b = $("#scope"), all = scope === "all";
    b.hidden = current === ALL;
    b.setAttribute("aria-pressed", all);
    b.textContent = all ? "Όλα τα κανάλια" : "Μόνο " + current.name;
    $("#search").placeholder = all ? "Αναζήτηση σε όλα τα κανάλια…" : "Αναζήτηση στο " + current.name + "…";
  }
  // «σώζεται λιγότερο από το μισό»: ελλείψεις με σημείωση «(έχουμε) μόνο X λεπτά/δευτερόλεπτα», X < 11 λεπτά
  const mostlyLost = (e) => {
    if (!e || e.s !== "p" || !e.n) return false;
    const m = e.n.match(/(?:μόνο|έχουμε)\s+(\d+)\s*(λεπτ|δευτ)/i);
    return !!m && (m[2].toLowerCase().startsWith("δευτ") || +m[1] < 11);
  };
  const nf = (e) => !e || mostlyLost(e); // «δεν βρέθηκε» για το φίλτρο
  // σειρά της καρτέλας «Όλα»: επιλογή καναλιού/μεταγλώττισης και από κάτω η λεπτομέρεια εκείνου του καναλιού
  function groupDetail(v) {
    const g = v.group;
    if (g.length === 1) return detail(g[0].s, true);
    // προεπιλογή: «Όλα» = η ένωση όλων των καναλιών· αλλιώς ένα συγκεκριμένο κανάλι
    const cur = g[pick[v.id]] ? pick[v.id] : -1;
    const xa = stats(v);
    const optAll = `<button type="button" class="pick" data-v="${esc(v.id)}" data-i="-1" aria-pressed="${cur === -1}" title="Από όλα τα κανάλια μαζί">
        <span class="logo"><b class="all-logo">ΟΛΑ</b></span>${pie(xa.f, xa.p, xa.t, 18, 5, xa.u)}<small>${xa.f + xa.p + xa.u}/${xa.t || "—"}</small></button>`;
    if (cur === -1) return `<div class="picks"><span class="also-h">Κανάλι:</span>${optAll}${opts(g, v, cur)}</div>${detail(bestOf(g).s, true, v)}`;
    const sel = g[cur];
    return picked(g, v, cur, sel, optAll);
  }
  function opts(g, v, cur) {
    return g.map((o, i) => {
      const x = stats(o.s), same = g.findIndex((y) => y.s.dub === o.s.dub) !== i;
      return `<button type="button" class="pick" data-v="${esc(v.id)}" data-i="${i}" aria-pressed="${i === cur}" title="${esc(o.ch.name)}${o.s.channel ? " (" + esc(o.s.channel) + ")" : ""}${same ? " · ίδια μεταγλώττιση" : ""}">
        <span class="logo"><img src="assets/logos/${o.ch.id}.png" alt="${esc(o.ch.name)}"></span>${pie(x.f, x.p, x.t, 18, 5, x.u)}<small>${x.f + x.p + x.u}/${x.t || "—"}</small></button>`;
    }).join("");
  }
  function picked(g, v, cur, sel, optAll) {
    const m = [sel.s.aired ? `1η προβολή ${sel.s.airedApprox ? "~" : ""}${sel.s.aired}` : sel.s.dubyear ? `μεταγλ. ${sel.s.dubyear}` : "", sel.s.channel].filter(Boolean).join(" · ");
    return `<div class="picks"><span class="also-h">Κανάλι:</span>${optAll}${opts(g, v, cur)}</div>${m ? `<p class="meta pick-meta">${esc(sel.ch.name)} · ${esc(m)}</p>` : ""}${detail(sel.s, true)}`;
  }
  // union: η εικονική σειρά της καρτέλας «Όλα» — η κατάσταση κάθε επεισοδίου είναι η καλύτερη από όλα τα κανάλια
  function detail(s, inAll, union) {
    const E = epsOf(union || s), t = totalOf(union || s), L = listOf(s);
    const others = (BYWORK[s.work] || []).filter((o) => o.s !== s);
    const otherDubs = others.filter((o) => o.s.dub !== s.dub);
    const seenDub = new Set();
    const badgeDubs = otherDubs.filter((o) => !seenDub.has(o.s.dub) && seenDub.add(o.s.dub));
    // λογότυπα δίπλα στην κατάσταση: σε ποια κανάλια έχει βρεθεί το επεισόδιο (και το τρέχον), όταν η σειρά παίχτηκε σε >1 κανάλι
    const seenCh = new Set();
    const badgeChs = [{ ch: null, s }, ...others].map((o) => o.ch ? o : { ch: (BYWORK[s.work] || []).find((x) => x.s === s)?.ch, s })
      .filter((o) => o.ch && !seenCh.has(o.ch.id) && seenCh.add(o.ch.id));
    const badges = (i) => badgeChs.length < 2 ? "" : badgeChs.map((o) => {
      const e = epsOf(o.s)[String(i)];
      // στο συγκεκριμένο κανάλι φαίνεται πάντα και το δικό του λογότυπο (κόκκινο αν λείπει), ώστε να είναι σαφές σε ποιο αφορά η κατάσταση
      if (!e && !union && o.s === s) return `<span class="ob m" title="${esc(o.ch.name)}: λείπει"><img src="assets/logos/${o.ch.id}.png" alt="${esc(o.ch.name)}"></span>`;
      return e ? `<span class="ob ${e.s}" title="${esc(o.ch.name)}: ${e.s === "f" ? "βρέθηκε" : "με ελλείψεις"}${e.n ? " — " + esc(e.n) : ""}"><img src="assets/logos/${o.ch.id}.png" alt="${esc(o.ch.name)}"></span>` : "";
    }).join("");
    let grid = "";
    if (L && L.length) {
      const pad = (n, w) => String(n).padStart(w, "0");
      // αν το σύνολο είναι μεγαλύτερο από τη λίστα, τα υπόλοιπα επεισόδια εμφανίζονται χωρίς τίτλο
      const LL = t > L.length ? L.concat(Array.from({ length: t - L.length }, (_, k) => ({ s: null, e: L.length + k + 1 }))) : L.slice(0, t || L.length);
      const rows = LL.map((ep, i) => {
        const e = E[String(i + 1)], st = e ? e.s : "m";
        const code = ep.s != null ? `S${pad(ep.s, 2)}E${pad(ep.e, 3)}` : pad(ep.e, 3);
        const lab = st === "f" ? "βρέθηκε" : st === "p" ? "με ελλείψεις" : "λείπει";
        return `<li class="epl ${st}${nf(e) ? " nf" : ""}${e && e.n ? " has-note" : ""}${e && e.src ? " has-src" : ""}"><span class="code">${code}</span><span class="et">${esc(ep.t || "")}${copyBtn(`${s.title} ${code}${ep.t ? " " + ep.t : ""}`, "Αντιγραφή (σειρά, επεισόδιο, τίτλος)")}${e && e.n ? `<small>📝 ${esc(e.n)}</small>` : ""}${e && e.src ? `<small class="src">📼 ${esc(e.src)}</small>` : ""}</span><span class="st">${badges(i + 1)}<b>${lab}</b></span></li>`;
      }).join("");
      grid = `<ol class="eplist">${rows}</ol>`;
    } else if (t) {
      const cells = [];
      for (let i = 1; i <= t; i++) {
        const e = E[String(i)], cls = e ? e.s : "";
        const other = badgeDubs.some((o) => epsOf(o.s)[String(i)]);
        const tip = `Επεισόδιο ${i}: ${e ? (e.s === "f" ? "βρέθηκε" : "βρέθηκε με ελλείψεις") : "λείπει"}${e && e.n ? " — " + e.n : ""}${e && e.src ? " — Πηγές: " + e.src : ""}${e && e.b ? ` (${e.b}, ${e.d})` : ""}`;
        cells.push(`<span class="ep ${cls}${nf(e) ? " nf" : ""}${e && e.n ? " has-note" : ""}${other ? " other" : ""}" title="${esc(tip)}"${e && (e.n || e.src) ? ` data-n="${i}" role="button" tabindex="0"` : ""}>${i}</span>`);
      }
      grid = `<div class="eps">${cells.join("")}</div>`;
    } else {
      grid = `<p class="no-total">Δεν έχει οριστεί ακόμα ο αριθμός επεισοδίων για αυτή τη σειρά.</p>`;
    }
    const notes = (L && L.length) ? "" : Object.keys(E).map(Number).sort((a, b) => a - b)
      .filter((n) => E[n].n || E[n].src).map((n) => `<li class="${E[n].s}" data-n="${n}"><b>Επ. ${n}</b>${E[n].n ? esc(E[n].n) : ""}${E[n].n && (E[n].nb || E[n].b) ? ` <i>(${esc(E[n].nb || E[n].b)}${E[n].nd || E[n].d ? ", " + esc(E[n].nd || E[n].d) : ""})</i>` : ""}${E[n].src ? `<small class="src">📼 ${esc(E[n].src)}</small>` : ""}</li>`).join("");
    // κουμπί σημειώσεων: στη λίστα με τίτλους φιλτράρει, στα κουτάκια ανοίγει τη λίστα σημειώσεων
    const nNotes = Object.values(E).filter((e) => e.n || e.src).length;
    const notesBtn = nNotes ? `<button class="notes-btn" type="button" aria-expanded="false">📝 Σημειώσεις (${nNotes})</button>` : "";
    // φίλτρο επεισοδίων: όλα / βρέθηκαν (ακόμα και με ελλείψεις, αν σώζεται τουλάχιστον το μισό) / δεν βρέθηκαν
    const N = t || (L ? L.length : 0);
    let nNF = 0; for (let i = 1; i <= N; i++) if (nf(E[String(i)])) nNF++;
    const epf = N && nNF && nNF < N ? `<div class="epf" role="group" aria-label="Φίλτρο επεισοδίων">
      <button type="button" data-ef="" aria-pressed="true">Όλα (${N})</button><button type="button" data-ef="f" aria-pressed="false">Βρέθηκαν (${N - nNF})</button><button type="button" data-ef="m" aria-pressed="false">Δεν βρέθηκαν (${nNF})</button></div>` : "";
    const also = others.map((o) => {
      const same = o.s.dub === s.dub, x = stats(o.s);
      const info = same ? "ίδια μεταγλώττιση · κοινή πρόοδος" : `άλλη μεταγλώττιση${o.s.aired ? " (" + o.s.aired + ")" : ""} · ${x.f + x.p + x.u}/${x.t || "—"} βρέθηκαν`;
      return `<button class="also-item" data-go="${o.ch.id}|${esc(o.s.id)}"><span class="logo"><img src="assets/logos/${o.ch.id}.png" alt="${esc(o.ch.name)}"></span><span>${info}</span>${same ? "" : pie(x.f, x.p, x.t, 18, 5, x.u)}</button>`;
    }).join("");
    const cl = claimOf(s), xs = stats(s);
    const claim = cl && xs.u ? `<p class="claim">Έχουμε <b>${Math.min(cl.n, t || cl.n)}</b> επεισόδια${cl.b ? ` σύμφωνα με τον/την ${esc(cl.b)} (${esc(cl.d)})` : ""}, αλλά <b>${xs.u}</b> από αυτά δεν ξέρουμε ακόμα ποια είναι.
      Αν έχεις τη λίστα, γράψε στο Discord με <code>/πες</code> ποια ακριβώς είναι.</p>` : "";
    return `<div class="detail">
      ${also && !inAll ? `<div class="also"><span class="also-h">Προβλήθηκε επίσης:</span>${also}</div>` : ""}
      ${claim}
      <div class="dtools">${epf}${notesBtn}</div>
      ${grid}
      ${badgeDubs.length && !(L && L.length) ? `<p class="meta">Τα επεισόδια με περίγραμμα έχουν βρεθεί από άλλη μεταγλώττιση.</p>` : ""}
      ${notes ? `<ul class="notes" hidden>${notes}</ul>` : ""}
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
    current = chById(b.dataset.ch);
    renderAll(); window.scrollTo({ top: 0 }); saveUI();
  });
  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    filter = b.dataset.f; renderChips(); renderList(); saveUI();
  });
  $("#kinds").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    const k = b.dataset.k;
    if (!k) kinds.clear(); else kinds.has(k) ? kinds.delete(k) : kinds.add(k);
    renderKinds(); renderList(); saveUI();
  });
  $("#sort").addEventListener("change", (e) => { sortBy = e.target.value; renderList(); saveUI(); });
  $("#scope").addEventListener("click", () => { scope = scope === "all" ? "ch" : "all"; renderList(); saveUI(); });
  $("#search").addEventListener("input", (e) => { query = e.target.value; renderList(); saveUI(); });
  $("#list").addEventListener("click", (e) => {
    const cp = e.target.closest(".cp");
    if (cp) { e.stopPropagation(); copyText(cp.dataset.copy, cp); return; }
    const nb = e.target.closest(".notes-btn");
    if (nb) {
      const d = nb.closest(".detail"), on = nb.getAttribute("aria-expanded") !== "true";
      nb.setAttribute("aria-expanded", on);
      const ul = d.querySelector(".notes"); if (ul) ul.hidden = !on;
      const ol = d.querySelector(".eplist"); if (ol) ol.classList.toggle("only-notes", on);
      return;
    }
    const pk = e.target.closest(".pick");
    if (pk) { if (+pk.dataset.i < 0) delete pick[pk.dataset.v]; else pick[pk.dataset.v] = +pk.dataset.i; renderList(); return; }
    const ef = e.target.closest(".epf button");
    if (ef) {
      const d = ef.closest(".detail");
      d.dataset.ef = ef.dataset.ef;
      d.querySelectorAll(".epf button").forEach((x) => x.setAttribute("aria-pressed", x === ef));
      return;
    }
    const cell = e.target.closest(".ep[data-n]");
    if (cell) {
      const d = cell.closest(".detail"), ul = d.querySelector(".notes");
      if (ul) {
        ul.hidden = false; d.querySelector(".notes-btn")?.setAttribute("aria-expanded", "true");
        ul.querySelectorAll("li").forEach((li) => li.classList.toggle("hl", li.dataset.n === cell.dataset.n));
        ul.querySelector(".hl")?.scrollIntoView({ block: "nearest" });
      }
      return;
    }
    const go = e.target.closest("[data-go]");
    if (go) {
      const [cid, sid] = go.dataset.go.split("|");
      current = chById(cid);
      query = ""; $("#search").value = ""; filter = "all"; kinds.clear();
      open.add(cid + "/" + sid); renderAll();
      const el = [...document.querySelectorAll(".row")].find((r) => r.dataset.id === sid);
      if (el) el.scrollIntoView({ block: "center" });
      saveUI();
      return;
    }
    const b = e.target.closest(".row"); if (!b) return;
    const k = (b.dataset.ch || current.id) + "/" + b.dataset.id;
    open.has(k) ? open.delete(k) : open.add(k);
    renderList(); saveUI();
  });
  $("#list").addEventListener("keydown", (e) => {
    const cp = e.target.closest(".cp");
    if (cp && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); copyText(cp.dataset.copy, cp); }
    const cell = e.target.closest(".ep[data-n]");
    if (cell && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); cell.click(); }
  });
  // ο τίτλος = αρχική: πρώτη καρτέλα, χωρίς αναζήτηση/φίλτρα/ανοιχτές σειρές, στην κορυφή
  $("#home").addEventListener("click", (e) => {
    e.preventDefault();
    current = DATA.channels[0]; filter = "all"; query = ""; sortBy = "title";
    kinds.clear(); open.clear();
    $("#search").value = ""; $("#sort").value = "title";
    renderAll(); window.scrollTo({ top: 0 }); saveUI();
  });
  $("#logout").addEventListener("click", () => { store.del(KEY); ui.del(); location.reload(); });

  async function start(pw, silent) {
    const msg = $("#lock-msg");
    try {
      DATA = await unlock(pw);
      store.set(KEY, pw);
      DATA.works ||= {}; DATA.dubs ||= {};
      // καρτέλες από το κανάλι με τις περισσότερες σειρές προς τις λιγότερες (σταθερή ταξινόμηση στις ισοπαλίες)
      DATA.channels.sort((a, b) => b.series.length - a.series.length);
      indexWorks(); buildAll();
      current = DATA.channels[0];
      const y = restoreUI();
      $("#lock").hidden = true; $("#app").hidden = false;
      document.documentElement.classList.remove("has-pw");
      renderAll();
      if (y) requestAnimationFrame(() => window.scrollTo({ top: y }));
    } catch (err) {
      store.del(KEY);
      document.documentElement.classList.remove("has-pw");
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
