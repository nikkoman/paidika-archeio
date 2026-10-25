// Discord bot του Αρχείου Παιδικών Μεταγλωττίσεων — Cloudflare Worker
//
// Μυστικά (Settings → Variables and Secrets του Worker):
//   DISCORD_PUBLIC_KEY  δημόσιο κλειδί της εφαρμογής (Discord Developer Portal → General Information)
//   GITHUB_TOKEN        fine-grained token με δικαίωμα Contents: Read and write στο repository
//   INDEX_KEY           το ίδιο κλειδί με το GitHub secret ARCHIVE_INDEX_KEY
//   ALLOWED_ROLE_ID     (προαιρετικό) μόνο μέλη με αυτόν τον ρόλο αλλάζουν δεδομένα

const REPO = "nikkoman/paidika-archeio";
const INDEX_URL = "https://nikkoman.github.io/paidika-archeio/data/index.enc.json";
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
  const key = await crypto.subtle.importKey("raw", hex(env.DISCORD_PUBLIC_KEY), { name: "Ed25519" }, false, ["verify"]);
  return crypto.subtle.verify("Ed25519", key, hex(sig), new TextEncoder().encode(ts + body));
}

let cache = { at: 0, rows: null };
async function index(env) {
  if (cache.rows && Date.now() - cache.at < 60_000) return cache.rows;
  const env_ = await (await fetch(INDEX_URL + "?t=" + Date.now(), { cf: { cacheTtl: 0 } })).json();
  const key = await crypto.subtle.importKey("raw", b64(env.INDEX_KEY), "AES-GCM", false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(env_.iv) }, key, b64(env_.ct));
  cache = { at: Date.now(), rows: JSON.parse(new TextDecoder().decode(pt)) };
  return cache.rows;
}

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

async function handle(it, env) {
  // Αυτόματη συμπλήρωση ονόματος σειράς
  if (it.type === 4) {
    const q = norm(String((it.data.options || []).find((o) => o.focused)?.value || ""));
    const rows = await index(env);
    const hits = rows.filter((r) => !q || norm(r.t).includes(q)).slice(0, 25);
    return json({ type: 8, data: { choices: hits.map((r) => ({
      name: `${r.t} · ${r.cn} (${r.f + r.p}/${r.n || "?"})`.slice(0, 100), value: `${r.c}:${r.i}` })) } });
  }
  if (it.type !== 2) return reply("Άγνωστη ενέργεια.", true);

  const cmd = it.data.name;
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
  async fetch(req, env) {
    if (req.method !== "POST") return new Response("Αρχείο Παιδικών Μεταγλωττίσεων — Discord bot", { status: 200 });
    const body = await req.text();
    if (!(await verify(req, body, env))) return new Response("invalid signature", { status: 401 });
    const it = JSON.parse(body);
    if (it.type === 1) return json({ type: 1 }); // PING
    try { return await handle(it, env); }
    catch (e) { return reply("Σφάλμα: " + e.message, true); }
  },
};
