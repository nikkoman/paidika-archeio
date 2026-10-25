# Αρχείο Μεταγλωττίσεων Παιδικών Σειρών — σημειώσεις για το Claude

Αυτό το αρχείο φορτώνεται αυτόματα σε κάθε νέα συνεδρία Claude (Claude Code) που ανοίγει το repository,
ώστε να συνεχίζει τη δουλειά χωρίς να χρειάζεται η αρχική συζήτηση. Γλώσσα επικοινωνίας με τον ιδιοκτήτη: **ελληνικά**.

## Τι είναι
- Site (GitHub Pages): https://nikkoman.github.io/paidika-archeio/ — με κωδικό (τον γνωρίζει ο ιδιοκτήτης· **δεν** γράφεται στο repo).
- Οδηγός για τα μέλη (δημόσιος, χωρίς κωδικό): https://nikkoman.github.io/paidika-archeio/manual.html
- Περιεχόμενο: μεταγλωττισμένες **παιδικές σειρές** (όχι ταινίες) με **έτος παραγωγής (1ο επεισόδιο) έως 2009**,
  ανεξάρτητα από το πότε προβλήθηκαν ή μεταγλωττίστηκαν (ακόμη και 2025). Κριτήριο από 10/2026· πριν ήταν «1η προβολή έως 2003».
  14 καρτέλες (~1.438 σειρές, 10/2026): ANT1 (+ANT1 Plus), MEGA (+Mega Kids), STAR, ΣΚΑΪ (101 + μόνο παιδικά του 78),
  ΕΡΤ (ΕΡΤ/ΕΤ1/ΝΕΤ/ΕΤ2/ΕΤ3/ΕΡΤ2/ERT Kids/Ertflix/ΥΕΝΕΔ…), ALTER, NEW Channel (GreekDubDB 62), K-T.V. (23), Alpha (34 + Alpha Kids 166),
  Channel 9 (7), Fox Kids (20), Jetix (28), Nickelodeon (6), Disney (ένδειξη ροής ανά σειρά: Disney Channel 44, Junior 19, Disney+ 253, XD 1).
  Ζωντανής δράσης μόνο κατάλληλες για κάτω των 15 (π.χ. Ρεξ)· ελληνικές παραγωγές ΕΡΤ ναι· τηλενουβέλες/σαπουνόπερες όχι.
  ~160 νέα έργα χωρίς λίστα επεισοδίων (όχι σε TVmaze/Wikipedia)· σειρές >250 επεισοδίων (Σιν Τσαν, Πέππα κ.λπ.) περιμένουν
  από το Discord πόσα προβλήθηκαν. Σημειώσεις/scripts: `/mnt/project-files/epektasi-2009/`.
- Τα μέλη ενός Discord server ψηφιοποιούν VHS και σημειώνουν ανά επεισόδιο: βρέθηκε / με ελλείψεις (+σημείωση) / λείπει.

## Πηγές & κανόνες δεδομένων
- Κύρια πηγή σειρών: GreekDubDB (network pages: ANT1 id=9, MEGA 4, STAR 2, ΣΚΑΪ 101, ALTER 22,
  ΕΡΤ 3,5,8,18,223,71,37,219). Μόνο πρωτότυποι τίτλοι· «The X» γράφεται «X, The».
  Τίτλος σε άλλη ευρωπαϊκή γλώσσα (γαλλικά, ιταλικά, γερμανικά…): **αγγλικός τίτλος και σε παρένθεση ο πρωτότυπος**
  (π.χ. «Shagma: Spartakus and the Sun Beneath the Sea (Les Mondes Engloutis)», «New Adventures of Lucky Luke, The (Les Nouvelles…)»)·
  επίσημος αγγλικός όπου υπάρχει, αλλιώς μετάφραση. Το ίδιο και για ιαπωνικούς τίτλους σε romaji (π.χ. «Peter Pan: The Animated Series (Peter Pan no Bōken)»). **Ελληνικές παραγωγές: τίτλοι (σειράς και επεισοδίων) πάντα στα ελληνικά.** Λίστα 10/2026: `/mnt/project-files/titloi/agglikoi-titloi.md`.
- Αντιστοίχιση επεισοδίων από αρχεία (π.χ. .mp4): ο **τίτλος** του αρχείου μετράει περισσότερο από την αρίθμηση.
- Έτος παραγωγής = το έτος δίπλα στον τύπο στη σελίδα τίτλου της GreekDubDB (`t-year`)· αυτό κρίνει αν μπαίνει μια σειρά (≤ 2009).
- Έτη προβολής: «1η προβολή» = έτος μεταγλώττισης GreekDubDB, ποτέ πριν την ίδρυση του καναλιού
  (ANT1 1990, MEGA 1989, STAR/ΣΚΑΪ 1993, ALTER 1994)· τότε `airedApprox: true` και `dubyear` κρατά το αρχικό.
  Ο χρήστης θέλει ακριβή έτη **μόνο** αν τα γράφει η GreekDubDB — όχι εικασίες.
- Λίστες επεισοδίων: μόνο από πηγές (Wikipedia, TheTVDB, TVmaze, ANN…), **ποτέ τίτλοι από μνήμη**· κενός τίτλος αν λείπει.
  Τίτλοι πάντα **στα αγγλικά** (επίσημη αγγλική μετάφραση TheTVDB όπου υπάρχει, αλλιώς μετάφραση από τον πρωτότυπο τίτλο), **εκτός** από τις ελληνικές παραγωγές, που κρατούν τους ελληνικούς τίτλους. Μορφή εμφάνισης SxxExxx· anime χωρίς κύκλους απόλυτη αρίθμηση (`"s": null`).
- Αποφάσεις του χρήστη για σύνολα: TMNT 1987 ANT1 χωρίς Red Sky (169) · Captain Planet MEGA 65 · Nintama ANT1 47 (1ο intro) ·
  Dr. Slump ANT1 έως 50 · Pokémon STAR 587 (πριν το 16:9) · Thomas STAR/ALTER κύκλοι 1–10 (262, κοινή μεταγλώττιση) ·
  Sesame Street ΕΡΤ 70s–80s, STAR 80s–90s (~2600, κατά προσέγγιση) · One Piece ALTER 106 · Oggy ALTER κύκλοι 1–2 (156 σκετς) ·
  Crayon Shin-chan STAR έως 525 (πριν το 16:9) · Peppa Pig όλα (447) σε όλα τα κανάλια · Animaniacs K-T.V. όλα (274) μέχρι αποδείξεως του αντιθέτου ·
  Fairly OddParents: Disney κύκλοι 1–4 (92), Nickelodeon κύκλοι 5–10 (177, χωριστό `work` g293-s5) ·
  Batman: The Animated Series ANT1 65· τα 20 επόμενα χωριστή σειρά «Adventures of Batman & Robin, The» (`work` g123-br, ίδια καταχώριση GreekDubDB).
- Αποφάσεις για μεταγλωττίσεις (έλεγχος GreekDubDB, 10/2026): Heathcliff MEGA (1989) χωριστά από STAR (1993) ·
  New Adventures of Lucky Luke (Les Nouvelles Aventures…) μόνο ALTER (η ΕΡΤ2 έχει δική της του 2017) · Delfy ΕΡΤ/ALTER διαφορετικές μεταγλωττίσεις.
- Δεν μπαίνει σειρά σε κανάλι όπου μεταγλωττίστηκε μόνο ένα ειδικό/μεμονωμένο επεισόδιο (π.χ. DuckTales MEGA = μόνο «A DuckTales Valentine», Tintin 1957 ALTER = μόνο «Υπόθεση Κάλκιουλους»· αφαιρέθηκαν 10/2026).
- **Μόνο έργα με μεταγλώττιση/φωνές.** Δεν μπαίνουν μαγκαζίνα που απλώς πρόβαλλαν άλλες σειρές, ούτε ταινίες
  (Ουράνιο Τόξο ΕΡΤ, Legend of the North Wind K-T.V. αφαιρέθηκαν 10/2026). **Μένουν** όμως οι εκπομπές με μεταγλωττισμένο
  παρουσιαστή, αφήγηση ή εκφώνηση (ντοκιμαντέρ, τηλεπαιχνίδια, εκπαιδευτικές, π.χ. Mythbusters, Takeshi's Castle, American Gladiators)
  και τα κινούμενα σχέδια με μόνο αφηγητή — απόφαση του χρήστη 10/2026.
- Εικόνες χαρακτήρων: **δεν** τις αναζητούμε/ανεβάζουμε εμείς (πνευματικά δικαιώματα)· μόνο URL που δίνει ο χρήστης (`archive.py image`).

## Δομή δεδομένων
- `data/archive.enc.json`: όλα τα δεδομένα, κρυπτογραφημένα (AES-GCM, PBKDF2-SHA256 από τον κωδικό του site).
- `channels[].series[]` → `id, title, gr (ελληνικός τίτλος GreekDubDB· για αναζήτηση site και /πες), kind, years, aired, airedApprox, dubyear, total, notes, gddb, channel(ΕΡΤ), img, work, dub`.
- `works{work: {eplist}}` (λίστα επεισοδίων ανά έργο) · `dubs{dub: {episodes: {"7": {"s":"f|p","n":"…","b":"όνομα","d":"YYYY-MM-DD HH:MM"}}}}` (πρόοδος ανά μεταγλώττιση· `b/d` = ποιος/πότε, ώρα Ελλάδας, από το Discord).
  Προαιρετικά `dubs[dub].claim = {n, b, d}`: «έχουμε n επεισόδια, άγνωστο ποια» (`archive.py claim` ή op `count` στο `batch`)· το site δείχνει τα μη σημειωμένα ως «άγνωστο ποια» (μπλε).
  Προαιρετικά `src` ανά επεισόδιο = πηγές/κασέτες (π.χ. «Λίστα 2025: 21-111 · old web»)· εμφανίζεται με 📼, δεν αλλάζει χρώμα, κρατιέται όταν αλλάζει η κατάσταση.
  Σοβαρότητα: `p` (πορτοκαλί) μόνο για σοβαρές ελλείψεις (λεπτά/μισό επεισόδιο/μεγάλο μέρος κακή πηγή)· μικρά θέματα = `f` με σημείωση (ανοιχτό πράσινο στο site, κουμπί «📝 Σημειώσεις»).
  Ίδια μεταγλώττιση σε 2 κανάλια = ίδιο `dub` → κοινή πρόοδος. `work` = GreekDubDB title id (`g123`).
- `data/index.enc.json`: μικρό ευρετήριο για το Discord bot (κλειδί `ARCHIVE_INDEX_KEY`)· `data/titles.enc.json`: τίτλοι επεισοδίων ανά έργο, `data/who.enc.json`: ποιος/πότε ανά επεισόδιο — και τα δύο για το /πες (ίδιο κλειδί, γράφονται από το `index`).

## Εργαλεία
`tools/archive.py` (χρειάζεται `ARCHIVE_PASSWORD`, και `ARCHIVE_INDEX_KEY` για `index`):
`find`, `mark`, `batch`, `total`, `eplist`, `image`, `samedub`, `splitdub`, `decrypt`/`encrypt`, `index`.
Μετά από αλλαγή δεδομένων: `index` (αν υπάρχει το κλειδί) → commit → `git pull --rebase` → push
(το bot κάνει συχνά commits, άρα πάντα rebase πριν το push). Ποτέ commit αποκρυπτογραφημένου JSON.
Μετά από αλλαγή σε `assets/*.js|css`: ανανέωσε το `?v=` στο `index.html` (cache).

## Discord bot
- Cloudflare Worker `paidika-bot` (https://paidika-bot.me-600.workers.dev, έλεγχος: `/check`), κώδικας `discord/worker.js`.
  Ο ιδιοκτήτης τον επικολλά χειροκίνητα στο Cloudflare (Edit code → Deploy) μετά από κάθε αλλαγή.
  **Κάθε φορά** που αλλάζει ο Worker, δώσε στον ιδιοκτήτη και τα δύο links (μπαίνει από διαφορετικά PC):
  κώδικας https://github.com/nikkoman/paidika-archeio/blob/main/discord/worker.js (κουμπί «Copy raw file») ·
  Cloudflare https://dash.cloudflare.com/?to=/:account/workers/services/view/paidika-bot/production
- Εντολές (`discord/commands.json`, καταχώριση με workflow «Καταχώριση εντολών Discord»):
  `/πες` (απλή γλώσσα μέσω Claude Haiku, με κουμπί Επιβεβαίωση· δέχεται και σκέτη σημείωση ανά επεισόδιο, op `"note"` στο `batch`, που προστίθεται χωρίς αλλαγή κατάστασης· κενή = διαγραφή), `/βρέθηκε`, `/ελλείψεις`, `/λείπει`, `/πρόοδος`.
- Failsafe (στον κώδικα του Worker, `guard`): μία σειρά ανά αίτημα· χωρίς δικαιώματα διαχειριστή (Discord usernames στο **`data/admins.json`** — ο ιδιοκτήτης ζητά «βάλε/βγάλε admin τον Χ» και απλώς αλλάζουμε αυτό το αρχείο, χωρίς deploy· το bot το ξαναδιαβάζει κάθε λεπτό· `dr_slump` = ιδιοκτήτης, πάντα admin· εφεδρικά `ADMINS` στο worker.js, ή `ADMIN_ROLE_ID`· **μην** ορίζεται `ADMIN_USERS` στο Cloudflare γιατί παρακάμπτει το αρχείο)
  «λείπει» έως 10 επεισόδια τη φορά και μόνο σε επεισόδια που πέρασε ο ίδιος (όχι άλλο μέλος ή παλιές καταχωρίσεις).
  Ό,τι υπάρχει ήδη με την ίδια κατάσταση αφαιρείται με ℹ️ «υπάρχει ήδη ενημερωμένο στη βάση από @Χ στις …».
  Τα μη επιτρεπτά αφαιρούνται από το αίτημα και τα υπόλοιπα περνούν, με ⚠️ που γράφει ποιο μέλος (tag από το Discord id `u` ανά επεισόδιο).
- Ροή: Worker → GitHub `repository_dispatch` → `.github/workflows/archive-update.yml` → commit → Pages.
  Το workflow **δεν** έχει concurrency group (ακύρωνε αιτήματα σε αναμονή)· σε σύγκρουση ξαναεφαρμόζει πάνω στο τελευταίο main.
- Secrets Worker: `DISCORD_PUBLIC_KEY`, `GITHUB_TOKEN`, `INDEX_KEY`, `ANTHROPIC_API_KEY` (προαιρ. `ALLOWED_ROLE_ID`).
  Secrets GitHub: `ARCHIVE_PASSWORD`, `ARCHIVE_INDEX_KEY`, `DISCORD_APP_ID`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`.

## Νέα συνεδρία — πρώτα βήματα
- Ζήτα από τον ιδιοκτήτη τον κωδικό του site (`ARCHIVE_PASSWORD`) και το `ARCHIVE_INDEX_KEY` — δεν υπάρχουν στο repo.
- Πρόσθεση σειράς: ο χρήστης δίνει τίτλο/link GreekDubDB + κανάλι (+ τυχόν περιορισμό επεισοδίων).
  Δεν υπάρχει εντολή `add`: `decrypt` σε αρχείο εκτός repo → προσθήκη στο `channels[].series[]` (`work`=`g<id>`, `dub`=`<work>@<έτος>`,
  έλεγχος αν το ίδιο `work`/μεταγλώττιση υπάρχει ήδη σε άλλο κανάλι) → `encrypt` → `eplist` από πηγές → `index` → commit/push.
- Νέο κανάλι: νέο στοιχείο στο `channels[]` (`id`, `name`, `series`) + λογότυπο `assets/logos/<id>.png` (από τον χρήστη).

## Εκκρεμότητες / ιδέες
- Μεταγενέστερες μεταγλωττίσεις (π.χ. Nils 2008) ως «ταμπέλες» μέσα στη σειρά, χωρίς να φορτώνεται η λίστα — συμφωνήθηκε ως ιδέα, δεν έχει υλοποιηθεί.
- Herman & Katnip (ANT1): ο χρήστης θα πει ποια σκετς περιλαμβάνει.
- ~62 σειρές χωρίς αξιόπιστους τίτλους επεισοδίων (μένουν με αριθμημένα κουτάκια).
