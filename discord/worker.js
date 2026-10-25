// Discord bot του Αρχείου Παιδικών Μεταγλωττίσεων — Cloudflare Worker
//
// Μυστικά (Settings → Variables and Secrets του Worker):
//   DISCORD_PUBLIC_KEY  δημόσιο κλειδί της εφαρμογής (Discord Developer Portal → General Information)
//   GITHUB_TOKEN        fine-grained token με δικαίωμα Contents: Read and write στο repository
//   INDEX_KEY           το ίδιο κλειδί με το GitHub secret ARCHIVE_INDEX_KEY
//   ANTHROPIC_API_KEY   κλειδί API του Claude (console.anthropic.com) για την εντολή /πες
//   ALLOWED_ROLE_ID     (προαιρετικό) μόνο μέλη με αυτόν τον ρόλο αλλάζουν δεδομένα

const REPO = "nikkoman/paidika-archeio";
const INDEX_URL = "https://nikkoman.github.io/paidika-archeio/data/index.enc.json";
const TITLES_URL = "https://nikkoman.github.io/paidika-archeio/data/titles.enc.json";
const WHO_URL = "https://nikkoman.github.io/paidika-archeio/data/who.enc.json";
const SITE = "https://nikkoman.github.io/paidika-archeio/";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
const reply = (content, ephemeral = false) =>
  json({ type: 4, data: { content, flags: ephemeral ? 64 : 0, allowed_mentions: { parse: [] } } });

const hex = (h) => new Uint8Array(h.match(/.{2}/g).map((b) => parseInt(b, 16)));
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function verify(req, body, env) {
  const sig = req.headers.get("x-signature-ed25519"), ts = req.headers.get("x-signature-timestamp");
  if (!sig || !ts) return false;
  const key = await crypto.subtle.importKey("raw", hex(String(env.DISCORD_PUBLIC_KEY).trim()), { name: "Ed25519" }, false, ["verify"]);
  return crypto.subtle.verify("Ed25519", key, hex(sig), new TextEncoder().encode(ts + body));
}

async function fetchEnc(env, url) {
  const res = await fetch(url + "?t=" + Date.now());
  if (!res.ok) throw new Error("ευρετήριο HTTP " + res.status);
  const env_ = await res.json();
  const key = await crypto.subtle.importKey("raw", b64(String(env.INDEX_KEY).trim()), "AES-GCM", false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(env_.iv) }, key, b64(env_.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

let cache = { at: 0, rows: null };
async function index(env) {
  if (cache.rows && Date.now() - cache.at < 60_000) return cache.rows;
  cache = { at: Date.now(), rows: await fetchEnc(env, INDEX_URL) };
  return cache.rows;
}

// Τίτλοι επεισοδίων ανά έργο (αλλάζουν σπάνια — κρατιούνται 10 λεπτά)
let tcache = { at: 0, titles: null };
async function titles(env) {
  if (tcache.titles && Date.now() - tcache.at < 600_000) return tcache.titles;
  tcache = { at: Date.now(), titles: await fetchEnc(env, TITLES_URL) };
  return tcache.titles;
}

// Ποιος σημείωσε τι και πότε (αλλάζει με κάθε καταχώριση — 1 λεπτό)
let wcache = { at: 0, who: null };
async function who(env) {
  if (wcache.who && Date.now() - wcache.at < 60_000) return wcache.who;
  wcache = { at: Date.now(), who: await fetchEnc(env, WHO_URL) };
  return wcache.who;
}

// Κανάλια που μοιράζονται την ίδια μεταγλώττιση (άρα και την ίδια πρόοδο)
const channelsOf = (rows, row) => row.d ? rows.filter((r) => r.d === row.d).map((r) => r.cn).join(", ") : row.cn;

const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9α-ω ]/g, "");
const opt = (it, name) => (it.data.options || []).find((o) => o.name === name)?.value;

function parseRange(spec, total) {
  spec = String(spec).trim().toLowerCase();
  if (["όλα", "ολα", "all"].includes(spec)) {
    if (!total) throw new Error("Η σειρά δεν έχει ορισμένο σύνολο επεισοδίων — γράψε συγκεκριμένα επεισόδια.");
    return `1-${total}`;
  }
  spec = spec.replace(/\s+/g, "").replace(/[–—]/g, "-");
  if (!/^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(spec)) throw new Error("Μορφή επεισοδίων: π.χ. `1-12`, `3,5,7` ή `όλα`.");
  for (const part of spec.split(",")) {
    const [a, b = a] = part.split("-").map(Number);
    if (a < 1 || b < a) throw new Error(`Μη έγκυρο εύρος: ${part}`);
    if (total && b > total) throw new Error(`Η σειρά έχει ${total} επεισόδια (ζήτησες έως ${b}).`);
  }
  return spec;
}

async function dispatch(env, payload) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json",
      "User-Agent": "paidika-archeio-bot", "Content-Type": "application/json",
    },
    body: JSON.stringify({ event_type: "archive-update", client_payload: payload }),
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
}


// ---------- /πες : απλή γλώσσα μέσω Claude ----------
const MODEL = "claude-haiku-5-5";
const b64u = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));

const SYSTEM = `Είσαι ο βοηθός ενός ελληνικού Discord server που αρχειοθετεί ψηφιοποιήσεις (από VHS) μεταγλωττισμένων παιδικών σειρών της ελληνικής τηλεόρασης.
Τα μέλη γράφουν σε απλή, καθημερινή γλώσσα (συχνά με greeklish ή ορθογραφικά λάθη) τι βρήκαν ή ρωτούν για την πρόοδο.
Ο κατάλογος σειρών είναι στη μορφή: κλειδί|τίτλος|κανάλια|σύνολο=Ν|βρέθηκαν=Ν|ελλείψεις=Ν.
ΠΡΟΣΟΧΗ: το «σύνολο» είναι πόσα επεισόδια έχει η σειρά, ΟΧΙ πόσα έχουμε. Πόσα έχουμε = βρέθηκαν + ελλείψεις. Μην τα μπερδεύεις.
Κάθε γραμμή είναι μία μεταγλώττιση· όταν γράφει πολλά κανάλια (π.χ. «ΕΡΤ, MEGA»), είναι η ίδια μεταγλώττιση με κοινή πρόοδο, άρα ΜΗΝ ρωτάς για κανάλι.
Ρώτα για κανάλι μόνο αν υπάρχουν διαφορετικές γραμμές με τον ίδιο τίτλο.
Τα επεισόδια αριθμούνται 1..σύνολο με τη σειρά της λίστας του site (όχι S02E05).
Αν ο χρήστης αναφέρει τίτλο επεισοδίου, κύκλο/επεισόδιο (π.χ. «2ος κύκλος επ. 3», «S01E50») ή όνομα αρχείου, κάλεσε το εργαλείο episodes για να δεις τη λίστα με αριθμούς και τίτλους.
Ο τίτλος υπερισχύει: αριθμοί από ονόματα αρχείων μπορεί να ακολουθούν άλλη σειρά (π.χ. παραγωγής). Αν τίτλος και αριθμός διαφωνούν, προτίμησε τον τίτλο και ανέφερέ το στο message.
Αν ο χρήστης περιγράφει το επεισόδιο χωρίς τίτλο ή αριθμό, ψάξε στους τίτλους· αν δεν είσαι σίγουρος, ρώτα δίνοντας 2–3 πιθανές επιλογές.
Κανόνες:
- Καλείς ΠΑΝΤΑ το εργαλείο respond.
- kind="update" μόνο όταν είσαι σίγουρος για τη σειρά ΚΑΙ για τα επεισόδια. Αν η σειρά ταιριάζει σε περισσότερα κανάλια και δεν διευκρινίζεται, kind="clarify" και ρώτα ποιο κανάλι, αναφέροντας τις επιλογές.
- state: "found" (βρέθηκε), "partial" (βρέθηκε με ελλείψεις — πάντα με σύντομη σημείωση στα ελληνικά), "missing" (αναίρεση/λείπει),
  "note" (μόνο σημείωση σε επεισόδιο που έχει ήδη βρεθεί, χωρίς αλλαγή κατάστασης — π.χ. ποιότητα, από ποια κασέτα, παρατηρήσεις· προστίθεται στην υπάρχουσα σημείωση· κενή note = διαγραφή σημείωσης).
- Αν η σημείωση λέει ότι κάτι λείπει ή κόβεται (π.χ. «λείπουν 4 δευτερόλεπτα από τον διάλογο…»), χρησιμοποίησε "partial". Για άλλες παρατηρήσεις χωρίς ελλείψεις, "note".
- Η note να είναι σύντομη (έως 200 χαρακτήρες) και να κρατά τις λεπτομέρειες του χρήστη (ονόματα χαρακτήρων, χρόνους, σημεία).
- range: π.χ. "1-12", "3,5,8". «όλα/ολόκληρο» = 1-σύνολο. Μην ξεπερνάς το σύνολο.
- «Όλα εκτός από Χ» σημαίνει ότι βρέθηκαν όλα τα υπόλοιπα και το Χ ΛΕΙΠΕΙ: π.χ. σε σειρά 40 επεισοδίων, «όλα εκτός από το 1ο» = found "2-40" και τίποτα για το 1.
  «Εκτός από το 5 και 9» = found "1-4,6-8,10-σύνολο". Διάβαζε προσεκτικά άρνηση και εξαιρέσεις.
- Μην ζητάς επιβεβαίωση στο message: για kind="update" το bot δείχνει ήδη κουμπί Επιβεβαίωση. Αν είσαι σίγουρος, κάνε update κατευθείαν.
- Μην γράφεις ότι μια σειρά υπάρχει σε πολλά κανάλια αν στον κατάλογο υπάρχει μόνο μία γραμμή με αυτόν τον τίτλο.
- Αν κάποια επεισόδια ενός εύρους έχουν ελλείψεις, βάλε το εύρος ως found ΚΑΙ ξεχωριστά τα επεισόδια με ελλείψεις ως partial (υπερισχύουν).
- kind="answer" για ερωτήσεις (π.χ. πόσα έχουμε) — απάντησε σύντομα από τον κατάλογο.
- Για «ποιος το έβαλε/πέρασε/σημείωσε» ή «από πού το ξέρουμε», κάλεσε το εργαλείο history και απάντησε π.χ.
  «Σύμφωνα με τον lallasgr, στις 25/10/2026 18:55: βρέθηκαν τα 1-86». Αν δεν υπάρχουν στοιχεία, πες ότι είναι παλιά καταχώριση χωρίς όνομα.
  Όταν απαντάς πόσα έχουμε από μια σειρά και υπάρχουν στοιχεία, ανέφερε σύντομα και ποιος τα πέρασε.
- kind="clarify" αν κάτι είναι ασαφές. Μην μαντεύεις.
- Γράφε message στα ελληνικά, φιλικά και σύντομα.`;

const TOOL = {
  name: "respond",
  description: "Η απάντηση του bot",
  input_schema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["update", "answer", "clarify"] },
      series_key: { type: "string", description: "κλειδί σειράς από τον κατάλογο (μόνο για update)" },
      ops: { type: "array", items: { type: "object", properties: {
        range: { type: "string" }, state: { type: "string", enum: ["found", "partial", "missing", "note"] },
        note: { type: "string" } }, required: ["range", "state"] } },
      message: { type: "string", description: "κείμενο προς τον χρήστη, στα ελληνικά" },
    },
    required: ["kind", "message"],
  },
};

const EPISODES_TOOL = {
  name: "episodes",
  description: "Η λίστα επεισοδίων μιας σειράς: αριθμός (όπως τον χρησιμοποιεί το range), κύκλος/επεισόδιο και τίτλος.",
  input_schema: { type: "object", properties: { series_key: { type: "string" } }, required: ["series_key"] },
};

const HISTORY_TOOL = {
  name: "history",
  description: "Ποιος σημείωσε ποια επεισόδια μιας σειράς, πότε (ώρα Ελλάδας) και με ποια κατάσταση/σημείωση.",
  input_schema: { type: "object", properties: { series_key: { type: "string" } }, required: ["series_key"] },
};

const STATE_WORD = { f: "βρέθηκαν", p: "με ελλείψεις" };
async function historyOf(env, rows, key) {
  const row = rows.find((r) => `${r.c}:${r.i}` === key);
  if (!row) return "Άγνωστο κλειδί σειράς.";
  const list = (row.d && (await who(env))[row.d]) || [];
  // ομαδοποίηση συνεχόμενων επεισοδίων με ίδιο όνομα, ώρα και κατάσταση
  const groups = [];
  for (const [n, st, b, d, note] of list) {
    const g = groups[groups.length - 1];
    if (g && g.b === b && g.d === d && g.st === st && !note && !g.note && g.last === n - 1) { g.last = n; continue; }
    groups.push({ first: n, last: n, st, b, d, note });
  }
  const out = groups.map((g) => `${g.b} — ${g.d} — ${STATE_WORD[g.st] || g.st}: ${g.first === g.last ? g.first : g.first + "-" + g.last}${g.note ? ` («${g.note}»)` : ""}`);
  const old = row.f + row.p - list.length;
  if (old > 0) out.push(`Χωρίς στοιχεία (παλιές καταχωρίσεις): ${old} επεισόδια`);
  return out.length ? out.join("\n") : "Δεν έχει σημειωθεί κανένα επεισόδιο.";
}

async function episodeList(env, rows, key) {
  const row = rows.find((r) => `${r.c}:${r.i}` === key);
  if (!row) return "Άγνωστο κλειδί σειράς.";
  const list = row.w ? (await titles(env))[row.w] : null;
  if (!list) return "Δεν υπάρχουν τίτλοι επεισοδίων για αυτή τη σειρά.";
  return list.map((t, i) => `${i + 1}. ${t}`).join("\n");
}

async function askClaude(env, rows, text) {
  const seen = new Set();
  const catalog = rows.filter((r) => !r.d || !seen.has(r.d) && seen.add(r.d))
    .map((r) => `${r.c}:${r.i}|${r.t}|${channelsOf(rows, r)}|σύνολο=${r.n || "?"}|βρέθηκαν=${r.f}|ελλείψεις=${r.p}`).join("\n");
  const messages = [{ role: "user", content: text }];
  for (let round = 0; round < 4; round++) {
    const last = round === 3;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: env.MODEL || MODEL, max_tokens: 700,
        system: [{ type: "text", text: SYSTEM }, { type: "text", text: "Κατάλογος:\n" + catalog, cache_control: { type: "ephemeral" } }],
        tools: [EPISODES_TOOL, HISTORY_TOOL, TOOL], tool_choice: last ? { type: "tool", name: "respond" } : { type: "any" },
        messages,
      }),
    });
    if (!r.ok) throw new Error("Claude " + r.status + " " + (await r.text()).slice(0, 150));
    const out = await r.json();
    const uses = (out.content || []).filter((c) => c.type === "tool_use");
    const done = uses.find((u) => u.name === "respond");
    if (done) return done.input;
    if (!uses.length) break;
    messages.push({ role: "assistant", content: out.content });
    messages.push({ role: "user", content: await Promise.all(uses.map(async (u) => ({
      type: "tool_result", tool_use_id: u.id, content: await (u.name === "history" ? historyOf : episodeList)(env, rows, u.input.series_key) }))) });
  }
  throw new Error("χωρίς απάντηση");
}

async function followup(it, data) {
  await fetch(`https://discord.com/api/v10/webhooks/${it.application_id}/${it.token}/messages/@original`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ allowed_mentions: { parse: [] }, ...data }),
  });
}

const STATE_LABEL = { found: "✅ βρέθηκαν", partial: "🟧 με ελλείψεις", missing: "↩️ λείπουν", note: "📝 σημείωση" };

async function handleSay(it, env) {
  const text = String(opt(it, "κείμενο") || "").slice(0, 500);
  const user = it.member?.user || it.user || {};
  try {
    if (!env.ANTHROPIC_API_KEY) throw new Error("λείπει το ANTHROPIC_API_KEY");
    const rows = await index(env);
    const a = await askClaude(env, rows, text);
    const head = `> ${text}\n`;
    if (a.kind !== "update") return followup(it, { content: head + a.message });
    const row = rows.find((r) => `${r.c}:${r.i}` === a.series_key);
    if (!row || !Array.isArray(a.ops) || !a.ops.length) return followup(it, { content: head + "Δεν κατάλαβα ποια σειρά ή ποια επεισόδια εννοείς — μπορείς να το γράψεις αλλιώς;" });
    const ops = [];
    for (const op of a.ops) {
      try { ops.push({ range: parseRange(op.range, row.n), state: op.state, note: op.state === "partial" || op.state === "note" ? String(op.note || "").slice(0, 200) : "" }); }
      catch (e) { return followup(it, { content: head + "⚠️ " + e.message }); }
    }
    const lines = ops.map((o) => `${STATE_LABEL[o.state]}: επεισόδια **${o.range}**${o.note ? ` — «${o.note}»` : o.state === "note" ? " — (διαγραφή σημείωσης)" : ""}`).join("\n");
    const payload = b64u(JSON.stringify({ k: `${row.c}:${row.i}`, o: ops, u: user.id }));
    return followup(it, {
      content: head,
      embeds: [{ title: `${row.t} · ${channelsOf(rows, row)}`, url: SITE + "#p=" + payload, color: 0x2e2a6b,
        description: `${a.message ? a.message + "\n\n" : ""}${lines}\n\n_Τίποτα δεν αλλάζει πριν πατήσεις Επιβεβαίωση._` }],
      components: [{ type: 1, components: [
        { type: 2, style: 3, label: "Επιβεβαίωση", custom_id: "say_ok:" + (user.id || "") },
        { type: 2, style: 4, label: "Ακύρωση", custom_id: "say_no:" + (user.id || "") },
      ] }],
    });
  } catch (e) {
    return followup(it, { content: "Σφάλμα: " + e.message });
  }
}

async function handleButton(it, env) {
  const emb = it.message?.embeds?.[0];
  const m = emb?.url?.match(/#p=([A-Za-z0-9_-]+)/);
  if (!m) return json({ type: 7, data: { content: "Η πρόταση έληξε.", embeds: [], components: [] } });
  const p = JSON.parse(unb64u(m[1]));
  const user = it.member?.user || it.user || {};
  const [action, owner] = String(it.data.custom_id).split(":");
  if ((p.u || owner) && user.id !== (p.u || owner))
    return reply("Μόνο όποιος έστειλε το μήνυμα μπορεί να το επιβεβαιώσει ή να το ακυρώσει.", true);
  if (action === "say_no")
    return json({ type: 7, data: { embeds: [{ ...emb, description: "❌ Ακυρώθηκε — δεν άλλαξε τίποτα." }], components: [] } });
  if (env.ALLOWED_ROLE_ID && !(it.member?.roles || []).includes(env.ALLOWED_ROLE_ID))
    return reply("Δεν έχεις δικαίωμα να αλλάζεις το αρχείο.", true);
  const [c, id] = p.k.split(":");
  const rows = await index(env);
  const row = rows.find((r) => r.c === c && r.i === id) || { t: id };
  await dispatch(env, { cmd: "batch", channel: c, id, ops: JSON.stringify(p.o), by: user.global_name || user.username || "Discord",
    title: row.t, range: p.o.map((o) => o.range).join(" "), state: "" });
  cache.at = 0;
  const lines = p.o.map((o) => `${STATE_LABEL[o.state]}: επεισόδια **${o.range}**${o.note ? ` — «${o.note}»` : o.state === "note" ? " — (διαγραφή σημείωσης)" : ""}`).join("\n");
  return json({ type: 7, data: { embeds: [{ ...emb, description: `${lines}\n\n✅ **Καταχωρήθηκε.** Το site ενημερώνεται σε 1–2 λεπτά.` }], components: [] } });
}

async function handle(it, env, ctx) {
  // Αυτόματη συμπλήρωση ονόματος σειράς
  if (it.type === 4) {
    const q = norm(String((it.data.options || []).find((o) => o.focused)?.value || ""));
    let rows;
    try { rows = await index(env); }
    catch (e) { return json({ type: 8, data: { choices: [{ name: ("Σφάλμα: " + e.message).slice(0, 100), value: "error" }] } }); }
    const hits = rows.filter((r) => !q || norm(r.t).includes(q)).slice(0, 25);
    return json({ type: 8, data: { choices: hits.map((r) => ({
      name: `${r.t} · ${r.cn} (${r.f + r.p}/${r.n || "?"})`.slice(0, 100), value: `${r.c}:${r.i}` })) } });
  }
  if (it.type === 3) return handleButton(it, env);
  if (it.type !== 2) return reply("Άγνωστη ενέργεια.", true);

  const cmd = it.data.name;
  if (cmd === "πες") {
    ctx.waitUntil(handleSay(it, env));
    return json({ type: 5 }); // «Το bot σκέφτεται…»
  }
  const rows = await index(env);
  const key = String(opt(it, "σειρά") || "");
  const row = rows.find((r) => `${r.c}:${r.i}` === key) || rows.find((r) => norm(r.t) === norm(key));
  if (!row) return reply("Δεν βρέθηκε η σειρά. Διάλεξέ τη από τη λίστα που εμφανίζεται καθώς γράφεις.", true);

  if (cmd === "πρόοδος") {
    const got = row.f + row.p;
    const pct = row.n ? Math.round((got / row.n) * 100) : 0;
    return reply(`**${row.t}** · ${row.cn}: ${got}/${row.n || "?"} βρέθηκαν (${pct}%)` +
      (row.p ? ` — ${row.p} με ελλείψεις` : "") + `\n${SITE}`);
  }

  if (env.ALLOWED_ROLE_ID && !(it.member?.roles || []).includes(env.ALLOWED_ROLE_ID))
    return reply("Δεν έχεις δικαίωμα να αλλάζεις το αρχείο.", true);

  const state = { "βρέθηκε": "found", "ελλείψεις": "partial", "λείπει": "missing" }[cmd];
  if (!state) return reply("Άγνωστη εντολή.", true);
  let range;
  try { range = parseRange(opt(it, "επεισόδια"), row.n); } catch (e) { return reply(e.message, true); }
  const note = state === "partial" ? String(opt(it, "σημείωση") || "").slice(0, 200) : "";
  const by = it.member?.user?.global_name || it.member?.user?.username || it.user?.username || "Discord";

  try {
    await dispatch(env, { cmd: "mark", channel: row.c, id: row.i, range, state, note, by, title: row.t });
  } catch (e) {
    return reply(`Κάτι πήγε στραβά με την ενημέρωση (${e.message}). Δοκίμασε ξανά σε λίγο.`, true);
  }
  cache.at = 0;
  const label = { found: "✅ βρέθηκαν", partial: "🟧 με ελλείψεις", missing: "↩️ σημειώθηκαν ως λείπουν" }[state];
  return reply(`**${row.t}** · ${row.cn} — επεισόδια ${range} ${label}${note ? ` («${note}»)` : ""}.\n` +
    `Το site ενημερώνεται σε 1–2 λεπτά.`);
}

export default {
  async fetch(req, env, ctx) {
    if (req.method !== "POST") {
      if (new URL(req.url).pathname === "/check") {
        const out = [];
        out.push("DISCORD_PUBLIC_KEY: " + (env.DISCORD_PUBLIC_KEY ? "ok (" + env.DISCORD_PUBLIC_KEY.length + " χαρακτήρες)" : "ΛΕΙΠΕΙ"));
        out.push("GITHUB_TOKEN: " + (env.GITHUB_TOKEN ? "ok" : "ΛΕΙΠΕΙ"));
        out.push("ANTHROPIC_API_KEY: " + (env.ANTHROPIC_API_KEY ? "ok" : "ΛΕΙΠΕΙ (χρειάζεται για το /πες)"));
        out.push("INDEX_KEY: " + (env.INDEX_KEY ? "ok (" + env.INDEX_KEY.trim().length + " χαρακτήρες)" : "ΛΕΙΠΕΙ"));
        try {
          const r = await fetch(INDEX_URL + "?t=" + Date.now());
          out.push("Ευρετήριο: HTTP " + r.status);
          cache.at = 0;
          const rows = await index(env);
          out.push("Αποκρυπτογράφηση: ok, " + rows.length + " σειρές");
        } catch (e) { out.push("Σφάλμα: " + e.name + " " + e.message); }
        return new Response(out.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
      }
      return new Response("Αρχείο Παιδικών Μεταγλωττίσεων — Discord bot", { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    const body = await req.text();
    if (!(await verify(req, body, env))) return new Response("invalid signature", { status: 401 });
    const it = JSON.parse(body);
    if (it.type === 1) return json({ type: 1 }); // PING
    try { return await handle(it, env, ctx); }
    catch (e) { return reply("Σφάλμα: " + e.message, true); }
  },
};
