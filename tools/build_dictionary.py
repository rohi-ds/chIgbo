#!/usr/bin/env python3
"""Build data/dictionary.js for chIgbo.

Source: Kay Williamson, "Dictionary of Ònìchà Igbo" (2nd edition, edited by
Roger Blench, 2006), in the JSON digitisation published by the Igbo API
project (github.com/nkowaokwu/igbo_api, src/dictionaries/ig-en/ig-en.json).
See tools/source/.

The script
  * tidies the headwords (ŋ → ṅ, stray layout characters, homonym letters),
  * splits each tone-marked headword into a plain spelling (dots kept, tone
    accents removed) and a tone melody, one tone per syllable,
  * pulls out a short gloss, a part-of-speech guess and topics,
  * keeps only the example sentences that actually contain the headword,
  * applies tools/fixes.json and drops anything matched by tools/exclude.txt.

Run:  python3 tools/build_dictionary.py
"""
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "source" / "ig-en.json"
OUT = ROOT / "data" / "dictionary.js"
EXCLUDE = ROOT / "tools" / "exclude.txt"
FIXES = ROOT / "tools" / "fixes.json"

GRAVE, ACUTE, MACRON, CARON, CIRC = "̀", "́", "̄", "̌", "̂"
TONE_MARKS = {GRAVE, ACUTE, MACRON, CARON, CIRC}
DOT_BELOW, DOT_ABOVE = "̣", "̇"
VOWELS = "aeiou"
APOS = "’'`"


# ---------------------------------------------------------------- orthography
def clean(text):
    """Normalise the source's spelling quirks; tone marks are kept."""
    s = unicodedata.normalize("NFC", text)
    s = s.replace("ŋ", "ṅ").replace("Ŋ", "Ṅ")
    s = re.sub(r"[-]", "", s)          # private-use layout glyphs
    s = s.replace("#", " ").replace("`", "’").replace("'", "’")
    s = s.replace("|", "").replace("_", " ")
    return re.sub(r"\s+", " ", s).strip()


def strip_tones(text):
    """Tone-marked spelling -> everyday spelling (ị ọ ụ ṅ keep their dots)."""
    s = unicodedata.normalize("NFD", text)
    s = "".join(c for c in s if c not in TONE_MARKS)
    return unicodedata.normalize("NFC", s)


def search_key(text):
    s = unicodedata.normalize("NFD", text.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9 ]+", "", s.replace("-", "")).strip()


def units(text):
    """[(base letter, combining marks)] for a lower-cased string."""
    out = []
    for ch in unicodedata.normalize("NFD", text.lower()):
        if unicodedata.combining(ch) and out:
            out[-1][1] += ch
        else:
            out.append([ch, ""])
    return out


def nuclei(text):
    """Marks of every tone-bearing unit: each vowel, and each syllabic nasal.

    A nasal (m, n, ṅ) is its own syllable unless a vowel follows it; nw and ny
    before a vowel are single consonants. js/app.js syllables() mirrors this.
    """
    u = units(text)
    n = len(u)
    out = []
    i = 0

    def nxt(j):
        while j < n and u[j][0] in APOS:
            j += 1
        return j

    while i < n:
        ch, marks = u[i]
        if ch in VOWELS:
            out.append(marks)
        elif ch in "mn":
            j = nxt(i + 1)
            after = u[j][0] if j < n else ""
            if after in VOWELS and after:
                pass
            elif (ch == "n" and DOT_ABOVE not in marks and after in ("w", "y")
                  and j + 1 < n and u[j + 1][0] in VOWELS):
                i = j
            else:
                out.append(marks)
        i += 1
    return out


def tones_of(orig):
    """High = 5, low = 1; a downstep (macron) lowers every later high: 3, then 2."""
    level = 5
    out = []
    for marks in nuclei(orig):
        if GRAVE in marks:
            out.append("1")
        elif CARON in marks:
            out.append("r")
        elif CIRC in marks:
            out.append("f")
        else:
            if MACRON in marks:
                level = 3 if level == 5 else 2
            out.append(str(level))
    return "".join(out)


# -------------------------------------------------------------------- glosses
IGBO_MARK = re.compile("[" + GRAVE + MACRON + DOT_BELOW + DOT_ABOVE + "]")


def has_igbo(tok):
    return bool(IGBO_MARK.search(unicodedata.normalize("NFD", tok)))


def cut_example(text):
    """Definitions sometimes run straight on into an example sentence
    ("... clear rubbish Ànyị nà-àkwadebe ... We are preparing ..."): cut there."""
    toks = text.split(" ")
    for j, t in enumerate(toks):
        if t[:1].isupper() and sum(1 for x in toks[j:j + 4] if has_igbo(x)) >= 2:
            return " ".join(toks[:j]).strip()
    return text


TAIL_NOTE = re.compile(
    r"\s*\((?:compare|cf\.?|=|literally|lit\.|see|English|Yoruba|Hausa|from|also|"
    r"Central Igbo|Onitsha|Ẹdo|Igala|Portuguese)[^()]*\)?\s*$", re.I)

BAD_GLOSS_START = (
    "see ", "used ", "in ", "same as", "cf.", "also ", "only in", "variant",
    "indicates", "plural of", "shortened", "short form", "as in", "and ", "is ",
    "e.g.", "i.e.", "form of", "a form of", "central igbo form", "emphasis",
    "emphatic", "suffix", "prefix", "harmoni", "has tone", "dependent",
    "independent", "by the way", "answer to", "reply to", "response to",
)


def make_gloss(defn, verb):
    g = cut_example(defn)
    g = re.split(r"(?<=[a-z)])\. (?=[A-Z])", g)[0]   # first sentence only
    prev = None
    while prev != g:
        prev = g
        g = TAIL_NOTE.sub("", g).strip()
    while re.search(r"\s\([^()]*\)$", g):         # "bird (generic)" -> "bird"
        g = re.sub(r"\s\([^()]*\)$", "", g).strip(" ,:;.")
    if len(g) > 58 and ";" in g:
        g = g.split(";")[0]
    g = g.strip(" ,:;.")
    if verb and g and not g.lower().startswith(BAD_GLOSS_START + ("(", "to ")):
        g = "to " + g
    return g


TOPICS = {
    "people": r"\b(man|woman|child|children|person|people|boy|girl|friend|stranger|slave|servant|wife|husband|father|mother|brother|sister|family|baby|elder|youth|king|chief|doctor|thief|enemy|guest|twin|son|daughter|widow|orphan|parent|relative|in-law|bride|maiden|uncle|aunt|kinsman|kindred)s?\b",
    "body": r"\b(head|hand|foot|feet|leg|arm|eye|ear|nose|mouth|tooth|teeth|tongue|hair|skin|bone|blood|belly|stomach|heart|neck|back|finger|toe|knee|chest|breast|face|throat|shoulder|body|beard|nail|liver|lip|cheek|chin|navel|elbow|waist|buttock|forehead|brain|rib|saliva|sweat|tear|tears)s?\b",
    "animals": r"\b(animal|bird|fish|snake|goat|dog|cow|sheep|fowl|hen|cock|monkey|leopard|elephant|antelope|rat|mouse|insect|ant|fly|bee|spider|lizard|crocodile|tortoise|snail|pig|horse|cat|duck|parrot|eagle|vulture|bat|frog|toad|worm|crab|squirrel|hawk|pigeon|dove|owl|bush-cow|beetle|butterfly|mosquito|scorpion|chameleon|python|hippopotamus|porcupine|caterpillar|grasshopper|cricket|termite|locust)s?\b",
    "food": r"\b(food|yam|plantain|banana|oil|palm-wine|wine|soup|meat|pepper|salt|corn|maize|cassava|rice|bean|beans|eat|drink|cook|kola|fruit|egg|honey|gari|cocoyam|coco-yam|okro|okra|melon|pap|fufu|foofoo|palm-nut|coconut|hungry|hunger|thirst|meal|bread|sugar|groundnut|pumpkin|onion|orange|pineapple|breadfruit)s?\b",
    "nature": r"\b(tree|forest|bush|river|water|rain|sun|moon|star|sky|wind|fire|stone|earth|ground|hill|mountain|sea|leaf|leaves|root|grass|flower|sand|mud|cloud|thunder|lightning|smoke|creeper|plant|shrub|seed|branch|bark|dew|rainbow|lake|pond|swamp|stream|dust|charcoal|ashes|thorn|wood|harmattan)s?\b",
    "home": r"\b(house|room|door|roof|wall|bed|mat|pot|plate|cup|knife|spoon|basket|bag|box|chair|stool|broom|lamp|key|cloth|dress|clothes|hat|cap|shoe|soap|mirror|compound|kitchen|village|town|market|road|path|farm|fence|window|calabash|bottle|needle|rope|axe|hoe|cutlass|matchet|comb|bead|beads|ladder|canoe|drum|gun|bell|ring|mortar|pestle|pillow|yard|well)s?\b",
    "time": r"\b(day|night|morning|evening|afternoon|year|month|week|to-day|today|to-morrow|tomorrow|yesterday|time|season|hour|now|soon|dawn|dusk|noon|midnight|dry season|rainy season|ago|sunday|monday)s?\b",
    "numbers": r"\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|hundred|thousand|first|second|third|half|double|number|count|cowries)\b",
    "belief": r"\b(god|gods|juju|shrine|priest|priestess|sacrifice|charm|spirit|spirits|witch|witchcraft|ancestor|ancestors|oracle|worship|deity|ghost|soul|heaven|curse|blessing|taboo|prayer|pray|medicine|festival|ceremony|burial|funeral|masquerade|church|gospel|diviner|divination)s?\b",
    "titles": r"\b(title|titled|ọzọ|ọzō|chief|chiefs|king|queen|palace|society|age-grade|age grade|rank|royal|throne|ruler|praise-name|staff of office)\b",
    "feelings": r"\b(love|anger|angry|fear|afraid|joy|happy|happiness|sad|sorrow|grief|shame|ashamed|pride|proud|pity|hate|hatred|jealous|jealousy|envy|glad|pain|tired|trouble|worry|patience|kind|kindness|wicked|mercy|laugh|laughter|cry|weep|smile|brave|courage|lazy|laziness|greed|greedy)\b",
    "greetings": r"\b(greeting|greetings|salutation|salute|thanks|thank|welcome|farewell|good-bye|goodbye|goodnight|good morning|please)\b",
    "qualities": r"\b(big|small|large|little|long|short|tall|good|bad|new|old|hot|cold|heavy|light|hard|soft|sweet|bitter|sour|red|black|white|clean|dirty|strong|weak|fat|thin|wide|narrow|deep|quick|slow|beautiful|ugly|rich|poor|wet|dry|full|empty|sharp|blunt|straight|crooked|round|smooth|rough|ripe)\b",
}
TOPIC_RE = {k: re.compile(v, re.I) for k, v in TOPICS.items()}

# English concepts every beginner wants first; entries whose gloss leads with
# one of these (or "to X") are flagged "core" and surface early.
CORE = """water fire house man woman child person people father mother name food
yam meat fish oil salt soup pepper market road farm town village money cloth
head hand foot leg eye ear nose mouth tooth tongue hair body heart blood bone
skin belly neck back day night morning evening year month to-day to-morrow
today tomorrow yesterday sun moon star rain sky wind tree leaf forest river
stone earth ground sand dog goat cow fowl bird snake rat monkey leopard
elephant animal friend stranger king chief wife husband brother sister work
book word language story song dance war death life sleep dream hunger thirst
sickness medicine god door room bed mat pot knife basket bag rope thing place
time one two three four five six seven eight nine ten twenty hundred
to eat to drink to go to come to see to hear to speak to say to know to give
to take to buy to sell to sleep to die to live to run to walk to sit to stand
to laugh to cry to sing to dance to cook to work to call to ask to answer
to love to want to like to have to do to make to build to open to close
to enter to leave to return to wash to cut to kill to carry to bring to send
to write to read to learn to teach to count to pay to play to fight to help
to find to look to hold to tie to throw to fall to rise to fly to swim
to plant to dig to burn to break to cover to hide to meet to marry to bear
to greet to thank to be good to be big to be small to remember to forget
to think to begin to finish to wait to stop to pass to reach to touch
good bad big small new old hot cold long short red black white sweet bitter
yes no here there now who what where when why how all many much
I you he she we they my your""".split("\n")
CORE_SET = set()
for row in CORE:
    toks = row.split()
    i = 0
    while i < len(toks):
        if toks[i] == "to" and i + 1 < len(toks):
            if toks[i + 1] == "be" and i + 2 < len(toks):
                CORE_SET.add("to be " + toks[i + 2]); i += 3
            else:
                CORE_SET.add("to " + toks[i + 1]); i += 2
        else:
            CORE_SET.add(toks[i]); i += 1

LOW_PRIORITY = re.compile(
    r"^(a |an |the )?(tree|timber tree|shrub|creeper|kind of|sort of|type of|name of|village|"
    r"town|river|deity|title|quarter|species|variety|plant|certain|snake|bird|fish|"
    r"yam|dance|praise-name|part of|small tree|big tree|male name|female name|name for)\b", re.I)
NUMBER_RE = re.compile(
    r"(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|"
    r"fifty|hundred|thousand)\b")


def is_core(gloss, word):
    g = gloss.lower().strip(" ?!")
    if len(g) > 34 or " " in word:
        return False
    lead = g.split(";")[0].split(", especially")[0].strip()
    parts = [p.strip() for p in lead.split(",") if p.strip()]
    if not parts:
        return False
    # "bad, evil" counts; "to break, snap off" is a narrower, derived sense
    if any(len(p.split(" ")) > 1 for p in parts[1:]):
        return False
    first = re.sub(r"^(a|an|the) ", "", parts[0])
    return first in CORE_SET


def guess_pos(word, verb, gloss):
    if verb:
        return "verb"
    if word[:1].isupper():
        return "name"
    if NUMBER_RE.match(gloss.lower()):
        return "numeral"
    if " " in word:
        return "phrase"
    if word[:1] in "aeiouịọụ" or re.match(r"[mnṅ][^aeiouịọụ]", word):
        return "noun"
    return "other"


def load_excludes():
    if not EXCLUDE.exists():
        return []
    rows = []
    for line in EXCLUDE.read_text(encoding="utf-8").splitlines():
        line = line.split("#")[0].strip()
        if line:
            rows.append(search_key(line).replace(" ", ""))
    return rows


def load_fixes():
    """{tone-marked headword: meaning | null}.

    A string replaces the entry's first definition where the digitised source
    is wrong; null drops the entry."""
    if not FIXES.exists():
        return {}
    data = json.loads(FIXES.read_text(encoding="utf-8"))
    return {unicodedata.normalize("NFC", k): v for k, v in data.items() if not k.startswith("//")}


HOMONYM = re.compile(r"\s+([A-D])\.$")
JUNK_HEAD = re.compile(r"[=\[\]/;+$0-9]|\.\.\.")
EX_IGBO = ("igbo", "igbo:", "ibgo")
EX_ENGLISH = ("english", "englsih", "englishi", "englihs")


def build():
    excludes = load_excludes()
    fixes = load_fixes()
    raw = json.loads(SRC.read_text(encoding="utf-8"))
    entries = []
    dropped = skipped = 0
    for senses in raw.values():
        for src in senses:
            head = clean(src.get("word", ""))
            defs = [clean(d) for d in src.get("definitions") or []]
            defs = [d for d in defs if d]
            num = 0
            m = HOMONYM.search(head)
            if m:
                num = "ABCD".index(m.group(1)) + 1
                head = head[:m.start()]
            if (not defs or len(head) < 1 or JUNK_HEAD.search(head) or head.isupper() and len(head) < 4
                    or head.count("(") != head.count(")") or len(re.findall(r"(?:^|\s)-", head)) > 1):
                skipped += 1
                continue
            orig = head
            if orig in fixes and fixes[orig] is None:
                dropped += 1
                continue
            verb = bool(re.match(r"(\([^)]*\)\s*)?-", orig))
            # verbs are listed as roots: show "-kpì" as "kpi", tagged as a verb
            shown = re.sub(r"(^|\s)-(?=\S)", r"\1", orig) if verb else orig
            word = strip_tones(shown)
            tones = tones_of(shown)

            fixed = orig in fixes
            if fixed:
                defs[0] = fixes[orig]
            gloss = make_gloss(defs[0], verb)
            pos = guess_pos(word, verb, gloss)

            # example sentences: keep the ones that really use this word
            root = search_key(strip_tones(shown).split(" ")[0].split("(")[0]) if verb else search_key(word)
            exs = []
            for ex in src.get("examples") or []:
                ig = next((clean(ex[k]) for k in EX_IGBO if ex.get(k)), "")
                en = next((clean(ex[k]) for k in EX_ENGLISH if ex.get(k)), "")
                if ig and en and root and root in search_key(ig):
                    exs.append((ig, en))

            body_defs = defs[:9]
            if len(body_defs) == 1:
                body = body_defs[0]
            else:
                body = " ".join("(%d) %s" % (n + 1, d) for n, d in enumerate(body_defs))
            for ig, en in exs[:4]:
                body += " — |%s| %s." % (ig, en.rstrip("."))

            flat = search_key(word + " " + body).replace(" ", "")
            if any(x and x in flat for x in excludes):
                dropped += 1
                continue

            gl = gloss.lower()
            quiz_ok = (
                3 <= len(gloss) <= 58
                and not gl.startswith(BAD_GLOSS_START)
                and "(" not in gloss and ")" not in gloss
                and not re.search(r"[()?!.,’]", word)
                and not word.endswith("-") and not word.startswith("-")
                and len(word) >= 2 and len(word.split(" ")) <= 3
                and not has_igbo(gloss.split(" ")[-1])
                and len(defs) <= 4
            )
            topics = [k for k, rx in TOPIC_RE.items() if rx.search(gloss)]
            variants = []
            for v in src.get("variations") or []:
                v = clean(v)
                if v and v != orig and v not in variants:
                    variants.append(v)
            e = {
                "w": word,
                "o": orig,
                "g": gloss if len(gloss) <= 90 else gloss[:87].rsplit(" ", 1)[0] + "…",
                "d": body,
                "p": pos,
            }
            if num:
                e["n"] = num
            if tones:
                e["t"] = tones
            if variants:
                e["v"] = variants
            if topics:
                e["c"] = topics
            if quiz_ok:
                low = pos == "name" or LOW_PRIORITY.search(gloss) or len(word.split(" ")) > 2
                e["q"] = 2 if low else 1
                if not low and is_core(gloss, word):
                    e["k"] = 1
            entries.append(e)

    # cross-references: "see àkụlō", "compare mbà", "= ìbùa" become links
    known = {e["w"].lower() for e in entries}

    def link(m):
        target = m.group(2)
        bare = strip_tones(target).lower().lstrip("-")
        return "%s |%s|" % (m.group(1), target) if bare in known else m.group(0)

    for e in entries:
        head, sep, tail = e["d"].partition(" — |")
        head = re.sub(r"(\bsee|\bcompare|\balso|=)\s+(-?[^\s;,()|.]+)", link, head)
        e["d"] = head + sep + tail

    def sort_key(e):
        return (search_key(e["w"]), e["w"], e["o"], e.get("n", 0))
    entries.sort(key=sort_key)
    # stable ids: tone-marked spelling + homonym number (kept across rebuilds)
    seen = {}
    for e in entries:
        base = e["o"].replace(" ", "_") + ("#%d" % e["n"] if "n" in e else "")
        seen[base] = seen.get(base, 0) + 1
        e["i"] = base if seen[base] == 1 else "%s~%d" % (base, seen[base])

    meta = {
        "source": "Kay Williamson, Dictionary of Ònìchà Igbo, 2nd edition, ed. Roger Blench (2006)",
        "digitised": "Igbo API, github.com/nkowaokwu/igbo_api",
        "count": len(entries),
        "quiz": sum(1 for e in entries if e.get("q") == 1),
        "core": sum(1 for e in entries if e.get("k")),
    }
    payload = json.dumps({"meta": meta, "entries": entries}, ensure_ascii=False, separators=(",", ":"))
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text("window.CHIGBO_DICT=" + payload + ";\n", encoding="utf-8")
    print(meta, "excluded:", dropped, "unusable source rows:", skipped, "bytes:", OUT.stat().st_size)
    return entries


if __name__ == "__main__":
    build()
