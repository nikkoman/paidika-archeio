// Discord bot του Αρχείου Παιδικών Μεταγλωττίσεων — Cloudflare Worker
//
// Μυστικά (Settings → Variables and Secrets του Worker):
//   DISCORD_PUBLIC_KEY  δημόσιο κλειδί της εφαρμογής (Discord Developer Portal → General Information)
//   GITHUB_TOKEN        fine-grained token με δικαίωμα Contents: Read and write στο repository
//   INDEX_KEY           το ίδιο κλειδί με το GitHub secret ARCHIVE_INDEX_KEY
//   ANTHROPIC_API_KEY   κλειδί API του Claude (console.anthropic.com) για την εντολή /πες
//   ALLOWED_ROLE_ID     (προαιρετικό) μόνο μέλη με αυτόν τον ρόλο αλλάζουν δεδομένα
//   ADMIN_USERS         (προαιρετικό) Discord usernames διαχειριστών, χωρισμένα με κόμμα (αντικαθιστά τη λίστα ADMINS)
//   ADMIN_ROLE_ID       (προαιρετικό) ρόλος διαχειριστή

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
Ο κατάλογος σειρών είναι στη μορφή: κλειδί|τίτλος / ελληνικός τίτλος|κανάλια|σύνολο=Ν|βρέθηκαν=Ν|ελλείψεις=Ν|άγνωστα=Ν.
«άγνωστα» = επεισόδια που κάποιος είπε ότι έχουμε, χωρίς να πει ποια. Πόσα έχουμε = βρέθηκαν + ελλείψεις + άγνωστα.
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
- Αν ο χρήστης λέει μόνο πλήθος χωρίς ποια (π.χ. «έχουμε 45 από τα 65»), ΜΗΝ το κάνεις found 1-45. Κάνε op state="count" με count=45
  (σημαίνει «έχουμε 45, άγνωστο ποια») και στο message ζήτα του ευγενικά, αν μπορεί, να στείλει με νέο /πες ποια ακριβώς είναι
  (αριθμούς ή τίτλους), ώστε να σημειωθούν συγκεκριμένα. count=0 διαγράφει αυτή την ένδειξη.
- Μην ζητάς επιβεβαίωση στο message: για kind="update" το bot δείχνει ήδη κουμπί Επιβεβαίωση. Αν είσαι σίγουρος, κάνε update κατευθείαν.
- Μην γράφεις ότι μια σειρά υπάρχει σε πολλά κανάλια αν στον κατάλογο υπάρχει μόνο μία γραμμή με αυτόν τον τίτλο.
- Αν κάποια επεισόδια ενός εύρους έχουν ελλείψεις, βάλε το εύρος ως found ΚΑΙ ξεχωριστά τα επεισόδια με ελλείψεις ως partial (υπερισχύουν).
- kind="answer" για ερωτήσεις (π.χ. πόσα έχουμε) — απάντησε σύντομα από τον κατάλογο.
- Για «ποιος το έβαλε/πέρασε/σημείωσε» ή «από πού το ξέρουμε», κάλεσε το εργαλείο history και απάντησε π.χ.
  «Σύμφωνα με τον lallasgr, στις 25/10/2026 18:55: βρέθηκαν τα 1-86». Αν δεν υπάρχουν στοιχεία, πες ότι είναι παλιά καταχώριση χωρίς όνομα.
  Όταν απαντάς πόσα έχουμε από μια σειρά και υπάρχουν στοιχεία, ανέφερε σύντομα και ποιος τα πέρασε.
- kind="clarify" αν κάτι είναι ασαφές. Μην μαντεύεις.
- Κάθε update αφορά ΜΙΑ σειρά. Αν ζητηθεί αλλαγή σε πολλές ή «σε όλες τις σειρές», ΜΗΝ προτείνεις να το κάνεις:
  kind="answer" και εξήγησε ότι το bot αλλάζει μία σειρά τη φορά και ότι μαζικές αλλαγές κάνει μόνο διαχειριστής.
- Μαζικό «λείπει» (πάνω από 10 επεισόδια) ή αναίρεση επεισοδίων άλλου μέλους επιτρέπεται μόνο σε διαχειριστές· το bot το ελέγχει μόνο του.
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
        range: { type: "string" }, state: { type: "string", enum: ["found", "partial", "missing", "note", "count"] },
        note: { type: "string" }, count: { type: "integer", description: "μόνο για state=count" } }, required: ["state"] } },
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
  const all = (row.d && (await who(env))[row.d]) || [];
  const list = all.filter((x) => x[2]);
  // ομαδοποίηση συνεχόμενων επεισοδίων με ίδιο όνομα, ώρα και κατάσταση
  const groups = [];
  for (const [n, st, b, d, note] of list) {
    const g = groups[groups.length - 1];
    if (g && g.b === b && g.d === d && g.st === st && !note && !g.note && g.last === n - 1) { g.last = n; continue; }
    groups.push({ first: n, last: n, st, b, d, note });
  }
  const out = groups.map((g) => `${g.b} — ${g.d} — ${STATE_WORD[g.st] || g.st}: ${g.first === g.last ? g.first : g.first + "-" + g.last}${g.note ? ` («${g.note}»)` : ""}`);
  if (row.cl) out.push(`${row.cl.b || "άγνωστος"} — ${row.cl.d || "παλιά"} — είπε ότι έχουμε ${row.cl.n} επεισόδια χωρίς να πει ποια (τώρα άγνωστα: ${row.u || 0})`);
  const old = all.length - list.length;
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

// Για να μη στέλνεται όλος ο κατάλογος (~1.400 σειρές) στο Claude, κρατάμε τις σειρές που μοιάζουν με το μήνυμα
// (αγγλικός ή ελληνικός τίτλος, και σε greeklish) ή, αν δεν ταιριάζει καμία, του καναλιού που αναφέρεται.
// Αν δεν βρεθεί τίποτα, στέλνεται ολόκληρος ο κατάλογος όπως πριν.
const GR = { α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x",
  ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t", υ: "i", φ: "f", χ: "ch", ψ: "ps", ω: "o" };
const latin = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/ου/g, "ou").replace(/μπ/g, "b").replace(/ντ/g, "d").replace(/γκ/g, "g").replace(/[α-ω]/g, (c) => GR[c] || c)
  .replace(/ou/g, "u").replace(/ch/g, "k").replace(/h/g, "").replace(/y/g, "i").replace(/w/g, "o").replace(/c/g, "k").replace(/[^a-z0-9]+/g, " ").trim();
const grams = (s) => { const g = new Set(); for (const w of latin(s).split(" ")) if (w.length > 2) for (let i = 0; i + 3 <= w.length; i++) g.add(w.slice(i, i + 3)); return g; };
// Βάρος κάθε τριγράμματος: σπάνια (π.χ. «gum») μετράνε πολύ, συχνά (π.χ. «adv», «the») λίγο
let idfCache = { rows: null, idf: null };
function idfOf(rows) {
  if (idfCache.rows === rows) return idfCache.idf;
  const df = new Map();
  for (const r of rows) for (const g of new Set([...grams(r.t), ...grams(r.g || "")])) df.set(g, (df.get(g) || 0) + 1);
  const idf = new Map([...df].map(([g, n]) => [g, Math.log(rows.length / n)]));
  idfCache = { rows, idf };
  return idf;
}
function candidates(rows, text) {
  const msg = grams(text), words = " " + latin(text) + " ", idf = idfOf(rows);
  const score = (title) => {
    let all = 0, hit = 0;
    for (const g of grams(title || "")) { const w = idf.get(g) || 0; all += w; if (msg.has(g)) hit += w; }
    return all ? hit / all : 0;
  };
  const scored = rows.map((r) => [r, Math.max(score(r.t), score((r.g || "").replace(/\(\d{4}\)/g, "")))]).sort((a, b) => b[1] - a[1]);
  const best = scored.length ? scored[0][1] : 0;
  const hits = best >= 0.5 ? scored.filter(([, s]) => s >= Math.max(0.35, best * 0.6)).slice(0, 30).map(([r]) => r) : [];
  const chans = [...new Set(rows.map((r) => r.cn))].filter((cn) => words.includes(" " + latin(cn) + " "));
  if (hits.length) {
    // όλα τα κανάλια όπου υπάρχουν τα ίδια έργα, ώστε να φαίνονται οι διαφορετικές μεταγλωττίσεις
    const works = new Set(hits.map((r) => r.w));
    return rows.filter((r) => works.has(r.w) || hits.includes(r));
  }
  if (chans.length) return rows.filter((r) => chans.includes(r.cn));
  return rows;
}

async function askClaude(env, rows, text) {
  const seen = new Set(), pick = candidates(rows, text), partial = pick.length < rows.length;
  const catalog = pick.filter((r) => !r.d || !seen.has(r.d) && seen.add(r.d))
    .map((r) => `${r.c}:${r.i}|${r.t}${r.g ? " / " + r.g : ""}|${channelsOf(rows, r)}|σύνολο=${r.n || "?"}|βρέθηκαν=${r.f}|ελλείψεις=${r.p}|άγνωστα=${r.u || 0}`).join("\n");
  const messages = [{ role: "user", content: text }];
  for (let round = 0; round < 4; round++) {
    const last = round === 3;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: env.MODEL || MODEL, max_tokens: 700,
        system: [{ type: "text", text: SYSTEM }, { type: "text", text: (partial ? "Κατάλογος (μόνο οι σειρές που μοιάζουν με το μήνυμα· αν η σειρά του χρήστη δεν είναι εδώ, kind=\"clarify\" και ζήτα τον τίτλο όπως γράφεται στο site):\n" : "Κατάλογος:\n") + catalog, cache_control: { type: "ephemeral" } }],
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

const STATE_LABEL = { found: "✅ βρέθηκαν", partial: "🟧 με ελλείψεις", missing: "↩️ λείπουν", note: "📝 σημείωση", count: "🔢 πλήθος" };
const opLine = (o) => o.state === "count"
  ? (o.count ? `🔢 έχουμε **${o.count}** επεισόδια (άγνωστο ποια)` : "🔢 διαγραφή του «άγνωστο ποια»")
  : `${STATE_LABEL[o.state]}: επεισόδια **${o.range}**${o.note ? ` — «${o.note}»` : o.state === "note" ? " — (διαγραφή σημείωσης)" : ""}`;

// ---------- failsafe: τι επιτρέπεται χωρίς δικαιώματα διαχειριστή ----------
const MAX_REMOVE = 10;
// Διαχειριστές = Discord usernames (όχι nicknames). Χωρίς περιορισμούς στο failsafe.
// Η λίστα ζει στο repo (data/admins.json), ώστε να αλλάζει χωρίς νέο deploy· το ADMINS είναι εφεδρικό
// αν δεν διαβαστεί το αρχείο. Ο ιδιοκτήτης (OWNER) είναι πάντα διαχειριστής.
const OWNER = "dr_slump";
const ADMINS = ["dr_slump", "diafanos", "tasmanix"];
const ADMINS_URL = SITE + "data/admins.json";
let acache = { at: 0, list: null };
async function adminList(env) {
  if (env.ADMIN_USERS) return String(env.ADMIN_USERS).split(",").map((u) => u.trim().toLowerCase());
  if (!acache.list || Date.now() - acache.at > 60_000) {
    try {
      const r = await fetch(ADMINS_URL + "?t=" + Date.now(), { cf: { cacheTtl: 0 } });
      const j = r.ok ? await r.json() : null;
      acache = { at: Date.now(), list: Array.isArray(j?.admins) ? j.admins.map((u) => String(u).toLowerCase()) : acache.list || ADMINS };
    } catch { acache = { at: Date.now(), list: acache.list || ADMINS }; }
  }
  return [OWNER, ...acache.list];
}
const displayName = (it) => { const u = it.member?.user || it.user || {}; return u.global_name || u.username || "Discord"; };
async function isAdmin(it, env) {
  const username = String((it.member?.user || it.user || {}).username || "").toLowerCase();
  if (username && (await adminList(env)).includes(username)) return true;
  return !!(env.ADMIN_ROLE_ID && (it.member?.roles || []).includes(env.ADMIN_ROLE_ID));
}
function expand(spec) {
  const out = [];
  for (const part of String(spec || "").split(",").filter(Boolean)) {
    const [a, b = a] = part.split("-").map(Number);
    for (let n = a; n <= b && out.length < 5000; n++) out.push(n);
  }
  return out;
}
// «77, 79 (@diafanos), 80 (@tasmanix)»: tag μέλους μετά από κάθε συνεχόμενη ομάδα ίδιου μέλους
// (tag όταν έχουμε Discord id — χωρίς ειδοποίηση, βλ. allowed_mentions — αλλιώς το όνομα)
const ownerTag = (o) => o.u ? `<@${o.u}>` : o.b || "παλιά καταχώριση";
function withOwners(eps, byEp) {
  const out = [], list = eps.slice(0, 10);
  list.forEach((n, i) => {
    const o = byEp.get(n), next = list[i + 1];
    out.push(next !== undefined && ownerTag(byEp.get(next)) === ownerTag(o) ? String(n) : `${n} (${ownerTag(o)})`);
  });
  return out.join(", ") + (eps.length > 10 ? "…" : "");
}
// «1-3,5» από [1,2,3,5]
function compress(nums) {
  const s = [...new Set(nums)].sort((x, y) => x - y), out = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(i === j ? `${s[i]}` : `${s[i]}-${s[j]}`);
    i = j;
  }
  return out.join(",");
}
// Αφαιρεί από το αίτημα ό,τι δεν επιτρέπεται και κρατά τα υπόλοιπα.
// Επιστρέφει { ops, warn } (warn = τι παραλείφθηκε και γιατί) ή { deny } αν δεν μένει τίποτα.
async function guard(it, env, row, ops) {
  if (await isAdmin(it, env)) return { ops, warn: "" };
  const me = displayName(it);
  const removing = ops.filter((o) => o.state === "missing").flatMap((o) => expand(o.range));
  if (removing.length > MAX_REMOVE)
    return { deny: `Για ασφάλεια, «λείπει» γίνεται έως ${MAX_REMOVE} επεισόδια τη φορά (ζήτησες ${removing.length}). Για περισσότερα, ρώτα έναν διαχειριστή.` };
  const marks = row.d ? (await who(env))[row.d] || [] : [];
  const byEp = new Map(marks.map(([n, , b, , , u]) => [n, { b, u }]));
  const myId = (it.member?.user || it.user || {}).id;
  const mine = (o) => (o.u && myId ? o.u === myId : o.b === me);
  const foreignOf = (o) => byEp.has(o) && !mine(byEp.get(o));
  const warns = [];
  // «λείπει» σε επεισόδια άλλου μέλους ή παλιάς καταχώρισης χωρίς όνομα (όσα δεν έχουν βρεθεί δεν πειράζονται)
  const foreign = removing.filter(foreignOf);
  if (foreign.length)
    warns.push(`Τα επεισόδια ${withOwners(foreign, byEp)} τα είχε περάσει άλλο μέλος, οπότε δεν τα αλλάζω. Μπορείς να αναιρέσεις μόνο ό,τι πέρασες εσύ — για τα υπόλοιπα ρώτα έναν διαχειριστή.`);
  const foreignNotes = ops.filter((o) => o.state === "note" && !o.note).flatMap((o) => expand(o.range)).filter(foreignOf);
  if (foreignNotes.length)
    warns.push(`Η σημείωση στα επεισόδια ${withOwners(foreignNotes, byEp)} είναι από άλλο μέλος — μόνο ένας διαχειριστής μπορεί να τη σβήσει.`);
  const claimBlocked = row.cl && !mine(row.cl);
  const kept = [];
  for (const o of ops) {
    if (o.state === "count" && !o.count && claimBlocked) {
      warns.push(`Το «έχουμε Ν, άγνωστο ποια» το είχε περάσει άλλο μέλος (${ownerTag(row.cl)}) — μόνο εκείνο ή ένας διαχειριστής μπορεί να το σβήσει.`);
      continue;
    }
    if (o.state === "missing" || (o.state === "note" && !o.note)) {
      const left = expand(o.range).filter((n) => !foreignOf(n));
      if (left.length) kept.push({ ...o, range: compress(left) });
      continue;
    }
    kept.push(o);
  }
  const warn = warns.join("\n");
  return kept.length ? { ops: kept, warn } : { deny: warn || "Δεν έμεινε τίποτα να αλλάξει." };
}

// Βγάζει από το αίτημα ό,τι υπάρχει ήδη στη βάση με την ίδια κατάσταση και λέει από ποιον/πότε.
// Επιστρέφει { ops, info } (info = κείμενο για τα ήδη ενημερωμένα, κενό αν δεν υπάρχουν).
async function already(env, row, ops) {
  const marks = row.d ? (await who(env))[row.d] || [] : [];
  const cur = new Map(marks.map(([n, s, b, d, note, u]) => [n, { s, b, d, note: note || "", u }]));
  const same = (o, n) => {
    const e = cur.get(n);
    if (o.state === "missing") return !e;
    if (!e) return false;
    if (o.state === "found") return e.s === "f";
    if (o.state === "partial") return e.s === "p" && (!o.note || e.note.includes(o.note));
    return false;
  };
  const dup = [], kept = [];
  for (const o of ops) {
    if (!["found", "partial", "missing"].includes(o.state)) { kept.push(o); continue; }
    const eps = expand(o.range), left = eps.filter((n) => !same(o, n));
    dup.push(...eps.filter((n) => same(o, n)).map((n) => [n, o.state]));
    if (left.length) kept.push({ ...o, range: compress(left) });
  }
  if (!dup.length) return { ops: kept, info: "" };
  // ομάδες ανά κατάσταση + μέλος + ημερομηνία: «1-24 βρέθηκαν από @X στις 25/10/2026 20:11»
  const when = (d) => { const m = String(d || "").match(/^(\d{4})-(\d\d)-(\d\d) (\d\d:\d\d)/); return m ? ` στις ${m[3]}/${m[2]}/${m[1]} ${m[4]}` : ""; };
  const groups = new Map();
  for (const [n, st] of dup) {
    const e = cur.get(n);
    const by = st === "missing" ? "" : e.u || e.b ? ` από ${ownerTag(e)}${when(e.d)}` : " (παλιά καταχώριση)";
    const k = `${st}|${by}`;
    (groups.get(k) || groups.set(k, []).get(k)).push(n);
  }
  const word = { found: "βρέθηκαν", partial: "με ελλείψεις", missing: "λείπουν ήδη" };
  const parts = [...groups].slice(0, 6).map(([k, ns]) => {
    const [st, by] = k.split("|");
    return `${compress(ns)} ${word[st]}${by}`;
  });
  return { ops: kept, info: `Υπάρχουν ήδη ενημερωμένα στη βάση — επεισόδια ${parts.join(" · ")}${groups.size > 6 ? " …" : ""}.` };
}

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
    let ops = [];
    for (const op of a.ops) {
      if (op.state === "count") {
        const n = Math.max(0, Math.floor(Number(op.count) || 0));
        if (row.n && n > row.n) return followup(it, { content: head + `⚠️ Η σειρά έχει ${row.n} επεισόδια (είπες ${n}).` });
        ops.push({ range: "", state: "count", count: n });
        continue;
      }
      try { ops.push({ range: parseRange(op.range, row.n), state: op.state, note: op.state === "partial" || op.state === "note" ? String(op.note || "").slice(0, 200) : "" }); }
      catch (e) { return followup(it, { content: head + "⚠️ " + e.message }); }
    }
    const g = await guard(it, env, row, ops);
    if (g.deny) return followup(it, { content: head + "🛑 " + g.deny });
    const al = await already(env, row, g.ops);
    ops = al.ops;
    if (!ops.length) return followup(it, { content: head + "ℹ️ " + al.info + (g.warn ? "\n⚠️ " + g.warn : "") + "\nΔεν χρειάζεται καμία αλλαγή." });
    const lines = ops.map(opLine).join("\n") + (al.info ? "\n\nℹ️ " + al.info : "") + (g.warn ? "\n\n⚠️ " + g.warn : "");
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
  const g = await guard(it, env, row, p.o);
  if (g.deny) return json({ type: 7, data: { embeds: [{ ...emb, description: "🛑 " + g.deny }], components: [] } });
  p.o = g.ops;
  await dispatch(env, { cmd: "batch", channel: c, id, ops: JSON.stringify(p.o), by: user.global_name || user.username || "Discord", uid: user.id,
    title: row.t, range: p.o.map((o) => o.state === "count" ? `πλήθος ${o.count}` : o.range).join(" "), state: "" });
  cache.at = 0;
  const lines = p.o.map(opLine).join("\n") + (g.warn ? "\n\n⚠️ " + g.warn : "");
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
  const g = await guard(it, env, row, [{ state, range }]);
  if (g.deny) return reply("🛑 " + g.deny, true);
  const al = await already(env, row, g.ops);
  if (!al.ops.length) return reply("ℹ️ " + al.info + (g.warn ? "\n⚠️ " + g.warn : "") + "\nΔεν χρειάζεται καμία αλλαγή.", true);
  range = al.ops[0].range;
  const extra = (al.info ? "\nℹ️ " + al.info : "") + (g.warn ? "\n⚠️ " + g.warn : "");
  const note = state === "partial" ? String(opt(it, "σημείωση") || "").slice(0, 200) : "";
  const by = it.member?.user?.global_name || it.member?.user?.username || it.user?.username || "Discord";

  try {
    await dispatch(env, { cmd: "mark", channel: row.c, id: row.i, range, state, note, by, uid: (it.member?.user || it.user || {}).id, title: row.t });
  } catch (e) {
    return reply(`Κάτι πήγε στραβά με την ενημέρωση (${e.message}). Δοκίμασε ξανά σε λίγο.`, true);
  }
  cache.at = 0;
  const label = { found: "✅ βρέθηκαν", partial: "🟧 με ελλείψεις", missing: "↩️ σημειώθηκαν ως λείπουν" }[state];
  return reply(`**${row.t}** · ${row.cn} — επεισόδια ${range} ${label}${note ? ` («${note}»)` : ""}.${extra}\n` +
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
