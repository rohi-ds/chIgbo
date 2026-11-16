/* chIgbo — learn Igbo. Vanilla JS, no build step, everything stored locally. */
(function () {
  'use strict';

  // ------------------------------------------------------------- utilities
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var main = $('#main');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function key(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/-/g, '').replace(/[^a-z0-9 ]+/g, '').trim();
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDate(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dayNum(s) { var d = parseDate(s); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }
  function addDays(s, n) { var d = parseDate(s); d.setDate(d.getDate() + n); return dateStr(d); }
  function today() { return dateStr(new Date()); }

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    var a = hash(String(seed));
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rand) {
    var a = arr.slice(); rand = rand || Math.random;
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  // ------------------------------------------------------------------ store
  var KEY = 'chigbo.v1';
  var state = load();
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* private mode */ }
    s = s || {};
    s.settings = Object.assign({ theme: 'dark', cursor: true, sound: true, voice: true, notation: true }, s.settings);
    s.cards = s.cards || {};
    s.days = s.days || {};
    s.custom = s.custom || [];
    s.xp = s.xp || 0;
    return s;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
    refreshChrome();
  }
  function day(d) {
    d = d || today();
    if (!state.days[d]) state.days[d] = { words: null, xp: 0 };
    return state.days[d];
  }
  function addXp(n) { day().xp = (day().xp || 0) + n; state.xp += n; }
  function level() { return Math.floor(Math.sqrt(state.xp / 60)) + 1; }
  function levelSpan() {
    var l = level(), lo = 60 * (l - 1) * (l - 1), hi = 60 * l * l;
    return { lo: lo, hi: hi, pct: Math.round(100 * (state.xp - lo) / (hi - lo)) };
  }
  function streak() {
    var d = today(), n = 0;
    if (!(state.days[d] && state.days[d].xp > 0)) d = addDays(d, -1);
    while (state.days[d] && state.days[d].xp > 0) { n++; d = addDays(d, -1); }
    return n;
  }
  function bestStreak() {
    var ds = Object.keys(state.days).filter(function (d) { return state.days[d].xp > 0; }).sort();
    var best = 0, run = 0, prev = null;
    ds.forEach(function (d) {
      run = prev && dayNum(d) - dayNum(prev) === 1 ? run + 1 : 1;
      best = Math.max(best, run); prev = d;
    });
    return best;
  }

  // ------------------------------------------------------------- dictionary
  var DICT = (window.CHIGBO_DICT && window.CHIGBO_DICT.entries) || [];
  var META = (window.CHIGBO_DICT && window.CHIGBO_DICT.meta) || {};
  var byId = {}, byWord = {}, ALL = [];
  function index() {
    ALL = DICT.concat(state.custom);
    byId = {}; byWord = {};
    ALL.forEach(function (e) {
      byId[e.i] = e;
      if (e._k === undefined) { e._k = key(e.w); e._g = (e.g || '').toLowerCase(); }
      var w = e.w.toLowerCase();
      if (!byWord[w]) byWord[w] = e;
    });
  }
  index();

  var TOPICS = [
    ['people', 'People'], ['body', 'Body'], ['food', 'Food'], ['animals', 'Animals'], ['nature', 'Nature'],
    ['home', 'Home & things'], ['time', 'Time'], ['numbers', 'Numbers'], ['qualities', 'Qualities'],
    ['feelings', 'Feelings'], ['greetings', 'Greetings'], ['belief', 'Belief'], ['titles', 'Titles & society']
  ];
  var POS = { noun: 'noun', verb: 'verb', ideophone: 'ideophone', name: 'name', numeral: 'numeral', phrase: 'phrase', other: '' };

  // ------------------------------------------------------------------ tones
  var TONE_CH = { '˥': '5', '˦': '4', '˧': '3', '˨': '2', '˩': '1', '/': 'r', '\\': 'f' };
  function tonesFromBracket(s) {
    return s.trim().split(/\s+/).map(function (t) {
      if (TONE_CH[t]) return TONE_CH[t];
      var m = /^\((\d)-(\d)\)$/.exec(t);
      return m ? (m[1] < m[2] ? 'r' : 'f') : '';
    }).join('');
  }
  function toneSvg(t, cls) {
    if (!t) return '';
    var step = 13, h = 16, w = t.length * step + 1, out = '';
    for (var i = 0; i < t.length; i++) {
      var c = t[i], x = i * step + 2, y1, y2;
      if (c === 'r') { y1 = h - 3; y2 = 3; }
      else if (c === 'f') { y1 = 3; y2 = h - 3; }
      else { y1 = y2 = h - 3 - (+c - 1) * (h - 6) / 4; }
      out += '<line x1="' + x + '" y1="' + y1.toFixed(1) + '" x2="' + (x + 8) + '" y2="' + y2.toFixed(1) + '"/>';
    }
    return '<svg class="tone ' + (cls || '') + '" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h +
      '" role="img" aria-label="Tone melody: ' + toneWords(t) + '">' + out + '</svg>';
  }
  function toneWords(t) {
    var n = { '5': 'high', '4': 'high', '3': 'step-down', '2': 'step-down', '1': 'low', r: 'rising', f: 'falling' };
    return t.split('').map(function (c) { return n[c]; }).join(', ');
  }
  var audio = null;
  function playTones(t) {
    if (!t || !state.settings.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      var f = function (l) { return 233 * Math.pow(2, (l - 1) * 2.5 / 12); };
      var at = audio.currentTime + 0.03, len = 0.24, gap = 0.05;
      t.split('').forEach(function (c) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = 'triangle';
        var a = c === 'r' ? 1 : c === 'f' ? 5 : +c, b = c === 'r' ? 5 : c === 'f' ? 1 : +c;
        o.frequency.setValueAtTime(f(a), at);
        o.frequency.linearRampToValueAtTime(f(b), at + len);
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.34, at + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, at + len);
        o.connect(g).connect(audio.destination);
        o.start(at); o.stop(at + len + 0.02);
        at += len + gap;
      });
    } catch (e) { /* no audio */ }
  }
  // ---------------------------------------------------------- pronunciation
  // A say-it-like-this respelling built from the spelling and the tone melody:
  // syllables split by hyphens, CAPITALS for a high tone, ↓ where the pitch
  // steps down, ↗ ↘ for glides.
  var DIGRAPHS = ['ch', 'gb', 'gh', 'gw', 'kp', 'kw', 'sh'];
  var CONS_SAY = { c: 'k' };
  var VOW_SAY = { a: 'ah', e: 'ay', i: 'ee', 'ị': 'ih', o: 'oh', 'ọ': 'aw', u: 'oo', 'ụ': 'uh', m: 'm', n: 'n', 'ṅ': 'ng' };
  function isVowel(c) { return !!c && 'aeiouịọụ'.indexOf(c) >= 0; }
  function bare(s) { return String(s).normalize('NFD').replace(/[̀́̂̄̌]/g, '').normalize('NFC'); }
  // Every vowel is a beat of its own, and so is a nasal (m, n, ṅ) that is not
  // followed by a vowel: mmanya = m-ma-nya. tools/build_dictionary.py nuclei()
  // counts syllables the same way, so the tone melody lines up.
  function syllables(word) {
    var w = bare(word.toLowerCase()), out = [], i = 0, onset = '';
    var skip = function (j) { while (j < w.length && "’'`".indexOf(w[j]) >= 0) j++; return j; };
    while (i < w.length) {
      var c = w[i];
      if (isVowel(c)) { out.push({ on: onset, v: c }); onset = ''; i++; }
      else if (c === 'm' || c === 'n' || c === 'ṅ') {
        var j = skip(i + 1), nx = w[j] || '';
        if (isVowel(nx)) { onset += c === 'ṅ' ? 'ng' : c; i++; }
        else if (c === 'n' && (nx === 'w' || nx === 'y') && isVowel(w[j + 1])) { onset += 'n' + nx; i = j + 1; }
        else { out.push({ on: onset, v: c }); onset = ''; i++; }
      } else if (/[a-z]/.test(c)) {
        var two = w.substr(i, 2);
        if (DIGRAPHS.indexOf(two) >= 0) { onset += (CONS_SAY[two] || two); i += 2; }
        else { onset += (CONS_SAY[c] || c); i++; }
      } else { if ("’'`".indexOf(c) < 0) onset = ''; i++; }
    }
    return out;
  }
  function respell(e) {
    if (e._r !== undefined) return e._r;
    var syl = syllables(e.w), t = e.t || '';
    if (!syl.length) return (e._r = '');
    var marks = t.length === syl.length, top = 5;
    e._r = syl.map(function (s, n) {
      var txt = s.on + VOW_SAY[s.v];
      if (!marks) return txt;
      var c = t[n];
      if (c === 'r') return txt + '↗';
      if (c === 'f') return txt.toUpperCase() + '↘';
      if (c === '1') return txt;
      var step = +c < top; top = +c;
      return (step ? '↓' : '') + txt.toUpperCase();
    }).join('-');
    return e._r;
  }
  function pron(e, cls) {
    var r = respell(e);
    return r ? '<p class="pron ' + (cls || '') + '" title="Say it like this. CAPITALS = high pitch, ↓ = the pitch steps down"><span>say</span> ' + esc(r) + '</p>' : '';
  }

  // Computer voice: few devices ship an Igbo voice, so fall back to one whose
  // vowels are close (Yoruba, Swahili, Italian...) and follow it with the true
  // tone melody.
  var voices = [];
  function loadVoices() { try { voices = window.speechSynthesis.getVoices() || []; } catch (e) { voices = []; } }
  if (window.speechSynthesis) {
    loadVoices();
    try { window.speechSynthesis.addEventListener('voiceschanged', loadVoices); } catch (e) { /* older browsers */ }
  }
  function pickVoice() {
    var want = ['ig', 'yo', 'ha', 'sw', 'it', 'es', 'id', 'pt', 'en'];
    for (var i = 0; i < want.length; i++) {
      for (var j = 0; j < voices.length; j++) if ((voices[j].lang || '').toLowerCase().indexOf(want[i]) === 0) return voices[j];
    }
    return voices[0] || null;
  }
  function say(e) {
    if (!e || !state.settings.sound) return;
    var v = state.settings.voice && window.speechSynthesis ? (voices.length || loadVoices(), pickVoice()) : null;
    if (!v) return playTones(e.t);
    try {
      var en = (v.lang || '').toLowerCase().indexOf('en') === 0;
      var ig = (v.lang || '').toLowerCase().indexOf('ig') === 0;
      var text = en ? respell(e).toLowerCase().replace(/[↗↘↓]/g, '').replace(/-/g, ' ')
        : ig ? bare(e.w).toLowerCase()
        : bare(e.w).toLowerCase().replace(/ị/g, 'i').replace(/ọ/g, 'o').replace(/ụ/g, 'u').replace(/ṅ/g, 'ng').replace(/gh/g, 'g').replace(/-/g, '');
      var u = new SpeechSynthesisUtterance(text);
      u.voice = v; u.lang = v.lang; u.rate = 0.75;
      var done = false, after = function () { if (!done) { done = true; playTones(e.t); } };
      u.onend = after; u.onerror = after;
      setTimeout(after, 2500); // some sandboxes swallow speech silently
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (err) { playTones(e.t); }
  }

  function chime(ok) {
    if (!state.settings.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      var at = audio.currentTime + 0.01;
      (ok ? [523, 784] : [220, 180]).forEach(function (hz, i) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = ok ? 'sine' : 'triangle'; o.frequency.value = hz;
        g.gain.setValueAtTime(0.0001, at + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.09, at + i * 0.09 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + i * 0.09 + 0.22);
        o.connect(g).connect(audio.destination); o.start(at + i * 0.09); o.stop(at + i * 0.09 + 0.25);
      });
    } catch (e) { /* no audio */ }
  }

  // -------------------------------------------------------------------- SRS
  var GAP = [0, 1, 2, 4, 8, 16, 32];
  var BOX_NAME = ['New', 'Learning', 'Learning', 'Familiar', 'Familiar', 'Strong', 'Mastered'];
  function card(id, create) {
    if (!state.cards[id] && create) {
      state.cards[id] = { box: 0, due: dayNum(today()), seen: 0, right: 0, wrong: 0, added: today() };
    }
    return state.cards[id];
  }
  function grade(id, ok) {
    var c = card(id, true);
    c.seen++;
    if (ok) { c.right++; c.box = Math.min(6, c.box + 1); }
    else { c.wrong++; c.box = 1; }
    c.due = dayNum(today()) + GAP[c.box];
  }
  function myIds() { return Object.keys(state.cards).filter(function (i) { return byId[i]; }); }
  function dueIds() {
    var t = dayNum(today());
    return myIds().filter(function (i) { return state.cards[i].due <= t; })
      .sort(function (a, b) { return state.cards[a].due - state.cards[b].due || state.cards[a].box - state.cards[b].box; });
  }
  function toggleSave(id) {
    if (state.cards[id]) { delete state.cards[id]; toast('Removed from your words'); }
    else { card(id, true); toast('Added to your words'); }
    save();
  }

  // ------------------------------------------------------------ daily words
  var poolCache = null;
  function pool() {
    if (poolCache) return poolCache;
    var core = DICT.filter(function (e) { return e.k; }).map(function (e) { return e.i; });
    var rest = DICT.filter(function (e) { return e.q === 1 && !e.k; }).map(function (e) { return e.i; });
    poolCache = shuffle(core, rng('chigbo-core')).concat(shuffle(rest, rng('chigbo-rest')));
    return poolCache;
  }
  function usedDaily() {
    var u = {};
    Object.keys(state.days).forEach(function (d) { (state.days[d].words || []).forEach(function (i) { u[i] = 1; }); });
    return u;
  }
  function dailyWords() {
    var d = day();
    if (d.words && d.words.every(function (i) { return byId[i]; })) return d.words;
    var used = usedDaily(), out = [], p = pool();
    for (var i = 0; i < p.length && out.length < 3; i++) {
      if (!used[p[i]] && !state.cards[p[i]]) out.push(p[i]);
    }
    for (i = 0; i < p.length && out.length < 3; i++) if (out.indexOf(p[i]) < 0 && !used[p[i]]) out.push(p[i]);
    d.words = out;
    out.forEach(function (id) { card(id, true); });
    save();
    return out;
  }

  // ------------------------------------------------------------------- quiz
  var QUIZ_LEN = 15;
  function distractors(e, rand) {
    var same = ALL.filter(function (x) {
      return x.q && x.i !== e.i && x.p === e.p && x._k !== e._k && x._g !== e._g && x.g && x.g.length < 60;
    });
    if (same.length < 12) same = ALL.filter(function (x) { return x.q && x.i !== e.i && x._g !== e._g; });
    // prefer distractors of similar gloss length so the answer doesn't stand out
    var picked = shuffle(same, rand).slice(0, 24).sort(function (a, b) {
      return Math.abs(a.g.length - e.g.length) - Math.abs(b.g.length - e.g.length);
    }).slice(0, 8);
    picked = shuffle(picked, rand);
    var out = [], seen = {};
    seen[e._g] = seen[e._k] = 1;
    picked.forEach(function (x) {
      if (out.length < 3 && !seen[x._g] && !seen[x._k]) { out.push(x.i); seen[x._g] = seen[x._k] = 1; }
    });
    return out;
  }
  function makeItems(ids, seed) {
    var rand = rng(seed);
    return shuffle(ids, rand).map(function (id, n) {
      var e = byId[id];
      var opts = shuffle([id].concat(distractors(e, rand)), rand);
      return { id: id, dir: rand() < 0.5 ? 'en' : 'igbo', opts: opts, pick: null };
    });
  }
  function dailyQuiz() {
    var d = day();
    if (d.quiz && d.quiz.items && d.quiz.items.every(function (q) { return byId[q.id] && q.opts.every(function (o) { return byId[o]; }); })) return d.quiz;
    var ids = dailyWords().slice(), have = {};
    ids.forEach(function (i) { have[i] = 1; });
    dueIds().forEach(function (i) {
      if (ids.length < 9 && !have[i] && byId[i].g) { ids.push(i); have[i] = 1; }
    });
    var p = shuffle(pool().slice(0, Math.max(240, Object.keys(state.cards).length * 3)), rng('quiz-' + today()));
    for (var i = 0; i < p.length && ids.length < QUIZ_LEN; i++) {
      if (!have[p[i]] && !state.cards[p[i]]) { ids.push(p[i]); have[p[i]] = 1; }
    }
    for (i = 0; i < p.length && ids.length < QUIZ_LEN; i++) if (!have[p[i]]) { ids.push(p[i]); have[p[i]] = 1; }
    d.quiz = { items: makeItems(ids, 'q-' + today()), pos: 0, done: false };
    save();
    return d.quiz;
  }
  function quizScore(q) { return q.items.filter(function (x) { return x.pick === x.id; }).length; }

  // -------------------------------------------------------------- rendering
  function posTag(e) { return POS[e.p] ? '<span class="tag">' + POS[e.p] + '</span>' : ''; }
  function wordLabel(e) { return esc(e.w) + (e.n ? '<sup>' + e.n + '</sup>' : ''); }
  function playBtn(e, label) {
    return '<button class="play" data-act="say" data-id="' + esc(e.i) + '" aria-label="Hear ' + esc(e.w) + '" title="Hear it: an approximate computer voice, then the tone melody">' +
      '<svg viewBox="0 0 24 24"><path d="M5 9v6h4l5 4V5L9 9z"/><path d="M17 9a4 4 0 0 1 0 6"/></svg>' + (label ? '<span>' + label + '</span>' : '') + '</button>';
  }
  function saveBtn(id) {
    var on = !!state.cards[id];
    return '<button class="star' + (on ? ' on' : '') + '" data-act="save" data-id="' + esc(id) + '" aria-pressed="' + on + '" aria-label="' +
      (on ? 'Remove from your words' : 'Add to your words') + '" title="' + (on ? 'In your words' : 'Add to your words') + '">' +
      '<svg viewBox="0 0 24 24"><path d="M6 4h12v17l-6-4-6 4z"/></svg></button>';
  }
  function boxPips(id) {
    var c = state.cards[id]; if (!c) return '';
    var s = '';
    for (var i = 1; i <= 6; i++) s += '<i' + (i <= c.box ? ' class="on"' : '') + '></i>';
    return '<span class="pips" title="' + BOX_NAME[c.box] + '">' + s + '</span>';
  }
  function renderDef(text) {
    var h = esc(text);
    h = h.replace(/\[([^\]]*)\]/g, function (m, inner) {
      if (!/[˥˦˧˨˩\/\\]/.test(inner)) return m;
      var t = tonesFromBracket(inner.replace(/&#39;/g, "'"));
      return t ? toneSvg(t, 'inline') : m;
    });
    h = h.replace(/\|([^|]*)\|/g, function (m, w) {
      var hit = byWord[bare(w.toLowerCase().replace(/&#39;/g, "'")).replace(/^-/, '')];
      return hit ? '<a class="igbo" href="#word-' + encodeURIComponent(hit.i) + '" data-word="' + esc(hit.i) + '">' + w + '</a>'
        : '<span class="igbo">' + w + '</span>';
    });
    h = h.replace(/_([^_]+)_/g, '<em>$1</em>');
    h = h.replace(/\s\((\d)\)\s/g, '</p><p><b class="sense">$1</b> ').replace(/^\((\d)\)\s/, '<b class="sense">$1</b> ');
    return '<p>' + h + '</p>';
  }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('show'); }, 1900);
  }

  function refreshChrome() {
    var s = streak();
    $('#sideStreak').innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z"/></svg><b>' + s + '</b><span>day' + (s === 1 ? '' : 's') + '</span>';
    $('#sideStreak').classList.toggle('lit', !!(state.days[today()] && state.days[today()].xp > 0));
    var q = state.days[today()] && state.days[today()].quiz;
    $('#navQuizDot').hidden = !!(q && q.done);
    var due = dueIds().length;
    $('#navDue').hidden = !due; $('#navDue').textContent = due > 99 ? '99+' : due;
    document.documentElement.dataset.theme = state.settings.theme;
    var meta = $('meta[name=theme-color]');
    if (meta) meta.content = state.settings.theme === 'dark' ? '#14100d' : '#f7f0e4';
    if (window.ChiCursor) window.ChiCursor.set(state.settings.cursor);
  }

  // ------------------------------------------------------------------ Today
  function viewToday() {
    var ids = dailyWords(), q = day().quiz, due = dueIds().length, s = streak();
    var now = new Date();
    var nice = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    var answered = q ? q.items.filter(function (x) { return x.pick; }).length : 0;
    var h = '<header class="page-head"><p class="eyebrow">' + esc(nice) + '</p>' +
      '<h1>Today’s three words</h1>' +
      '<p class="lede">Three new Igbo words each day. Tap the speaker to hear how the tones rise and fall, then lock them in with the daily quiz.</p></header>';
    h += '<section class="trio">';
    ids.forEach(function (id, n) {
      var e = byId[id];
      h += '<article class="word-card" style="--n:' + n + '">' +
        '<div class="wc-top"><span class="wc-num">' + (n + 1) + '</span>' + posTag(e) + saveBtn(id) + '</div>' +
        '<h2 class="igbo-big" lang="ig">' + wordLabel(e) + '</h2>' +
        '<div class="wc-tone">' + toneSvg(e.t, 'big') + playBtn(e) + '</div>' + pron(e) +
        '<p class="wc-gloss">' + esc(e.g) + '</p>' +
        '<button class="link" data-word="' + esc(id) + '">Full entry <span aria-hidden="true">→</span></button>' +
        '</article>';
    });
    h += '</section>';

    h += '<section class="grid-2">';
    h += '<a class="cta ' + (q && q.done ? 'done' : '') + '" href="#quiz">' +
      '<div><p class="eyebrow">Daily quiz</p>' +
      (q && q.done
        ? '<h3>Done — ' + quizScore(q) + ' / ' + q.items.length + '</h3><p>Come back tomorrow for a fresh fifteen, or look over your answers.</p>'
        : answered
          ? '<h3>Pick up where you left off</h3><p>' + answered + ' of ' + QUIZ_LEN + ' answered.</p>'
          : '<h3>Fifteen questions</h3><p>Today’s words, a few you are due to revisit, and some new ones.</p>') +
      '</div><span class="cta-go" aria-hidden="true">' + (q && q.done ? '✓' : '→') + '</span></a>';
    h += '<a class="cta alt" href="#practice">' +
      '<div><p class="eyebrow">Review</p>' +
      (due ? '<h3>' + plural(due, 'word') + ' ready</h3><p>Words come back just before you would forget them.</p>'
        : '<h3>All caught up</h3><p>Nothing due. Play a matching round or study ahead.</p>') +
      '</div><span class="cta-go" aria-hidden="true">→</span></a>';
    h += '</section>';

    // trail of recent days
    var trail = Object.keys(state.days).filter(function (d) { return d !== today() && (state.days[d].words || []).length; }).sort().reverse().slice(0, 6);
    if (trail.length) {
      h += '<section class="panel"><h3 class="panel-title">Your word trail</h3><ul class="trail">';
      trail.forEach(function (d) {
        h += '<li><time>' + parseDate(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + '</time><span>';
        state.days[d].words.forEach(function (id) {
          var e = byId[id]; if (!e) return;
          h += '<button class="chip-word" data-word="' + esc(id) + '"><b lang="ig">' + esc(e.w) + '</b> ' + esc(e.g) + '</button>';
        });
        h += '</span></li>';
      });
      h += '</ul></section>';
    }
    h += readingGuide(!trail.length && s < 2);
    main.innerHTML = h;
  }

  function readingGuide(open) {
    return '<details class="panel guide"' + (open ? ' open' : '') + '><summary><h3 class="panel-title">How to read Igbo</h3><span class="hint">letters and tones</span></summary>' +
      '<div class="guide-grid">' +
      [['a', 'ah, as in “father”'], ['e', 'ay, as in “they”'], ['i', 'ee, as in “see”'], ['ị', 'ih, as in “sit”'], ['o', 'oh, as in “go”'], ['ọ', 'aw, as in “law”'], ['u', 'oo, as in “food”'], ['ụ', 'uh — a short oo, as in “put”'],
        ['ṅ', 'ng, as in “sing”'], ['ch', 'as in “church”'], ['gh', 'a voiced, gargled g'],
        ['gw · kw', 'g or k with rounded lips'], ['nw · ny', 'n with rounded lips · ny as in “canyon”'], ['m · n', 'before a consonant: hummed as a beat of its own'],
        ['gb · kp', 'both consonants at once']].map(function (r) {
        return '<div><b lang="ig">' + r[0] + '</b><span>' + r[1] + '</span></div>';
      }).join('') + '</div>' +
      '<p class="guide-note">Igbo is a tone language: the same letters can mean different things at a different pitch — <span class="igbo" lang="ig">akwa</span> is “cry”, “cloth”, “egg” or “bed” depending on the melody. Each word here carries a small melody line ' +
      toneSvg('513', 'inline') + ' — a low bar is a low tone, a high bar a high tone, and a bar part-way down is a <i>step-down</i>: a high tone pitched a little lower than the one before it. </p><p class="guide-note"><b>Say-it guides.</b> Every word has a respelling such as <span class="pron inline">AH-kwah</span> for <span class="igbo" lang="ig">akwa</span> “cloth”: read it as plain English syllables, raise your pitch on CAPITALS and drop a step at ↓. A lone <i>m</i> or <i>n</i> is hummed. The speaker plays a computer voice, usually borrowed from another language (few devices have an Igbo voice), followed by the hummed tone melody, so trust the melody and the guide over the voice.</p>' +
      '<p class="guide-note"><b>Verbs</b> are listed as bare roots, the way Igbo dictionaries do: <span class="igbo" lang="ig">li</span> “to eat”. The infinitive adds <span class="igbo" lang="ig">i-</span> or <span class="igbo" lang="ig">ị-</span> in front. <b>Dialect.</b> The words come from a dictionary of Onitsha (Ọ̀nị̀chà) Igbo, so some differ from Standard Igbo: <span class="igbo" lang="ig">ụno</span> for <span class="igbo" lang="ig">ụlọ</span> “house”, <span class="igbo" lang="ig">mmili</span> for <span class="igbo" lang="ig">mmiri</span> “water”.</p></details>';
  }

  // ------------------------------------------------------------------- Quiz
  var session = null; // { quiz, daily, title }
  function viewQuiz(arg) {
    if (arg === 'more') {
      if (!session || session.daily || session.quiz.done) session = { quiz: extraQuiz(), daily: false };
    } else {
      session = { quiz: dailyQuiz(), daily: true };
    }
    drawQuiz();
  }
  function extraQuiz() {
    var mine = shuffle(myIds().filter(function (i) { return byId[i].g; })).slice(0, 6);
    var have = {}; mine.forEach(function (i) { have[i] = 1; });
    var p = shuffle(pool().slice(0, 400));
    for (var i = 0; i < p.length && mine.length < 10; i++) if (!have[p[i]]) mine.push(p[i]);
    return { items: makeItems(mine, 'x' + Date.now()), pos: 0, done: false };
  }
  function drawQuiz() {
    var q = session.quiz;
    if (q.done) return drawResults();
    var it = q.items[q.pos], e = byId[it.id], answered = it.pick != null;
    var h = '<div class="quiz">' +
      '<div class="quiz-bar"><a class="back" href="#today" aria-label="Leave quiz">✕</a><div class="segs" role="progressbar" aria-valuemin="0" aria-valuemax="' + q.items.length + '" aria-valuenow="' + q.pos + '">';
    q.items.forEach(function (x, i) {
      h += '<i class="' + (x.pick == null ? (i === q.pos ? 'now' : '') : x.pick === x.id ? 'ok' : 'no') + '"></i>';
    });
    h += '</div><span class="quiz-count">' + (q.pos + 1) + ' / ' + q.items.length + '</span></div>';

    h += '<div class="prompt">';
    if (it.dir === 'en') {
      h += '<p class="eyebrow">What does this mean?</p><h1 class="igbo-huge" lang="ig">' + wordLabel(e) + '</h1>' +
        '<div class="wc-tone center">' + toneSvg(e.t, 'big') + playBtn(e) + '</div>' + pron(e, 'center');
    } else {
      h += '<p class="eyebrow">Which Igbo word means</p><h1 class="gloss-huge">' + esc(e.g) + '</h1>';
    }
    h += '</div><div class="opts' + (it.dir === 'igbo' ? ' igbo-opts' : '') + '">';
    it.opts.forEach(function (o, i) {
      var x = byId[o], cls = '';
      if (answered) cls = o === it.id ? ' ok' : o === it.pick ? ' no' : ' dim';
      h += '<button class="opt' + cls + '" data-act="pick" data-id="' + esc(o) + '"' + (answered ? ' disabled' : '') + '>' +
        '<kbd>' + (i + 1) + '</kbd><span' + (it.dir === 'igbo' ? ' lang="ig"' : '') + '>' + (it.dir === 'en' ? esc(x.g) : wordLabel(x)) + '</span></button>';
    });
    h += '</div>';
    if (answered) {
      var ok = it.pick === it.id;
      h += '<div class="verdict ' + (ok ? 'ok' : 'no') + '"><div><b>' + (ok ? 'Correct' : 'Not quite') + '</b>' +
        '<p><span class="igbo" lang="ig">' + esc(e.w) + '</span> — ' + esc(e.g) + '</p>' + pron(e) +
        '<button class="link" data-word="' + esc(e.i) + '">See the full entry</button></div>' +
        '<button class="btn primary" data-act="next" id="nextBtn">' + (q.pos === q.items.length - 1 ? 'Finish' : 'Next') + ' <kbd>↵</kbd></button></div>';
    } else {
      h += '<p class="keys-hint">Press <kbd>1</kbd>–<kbd>4</kbd> to answer</p>';
    }
    h += '</div>';
    main.innerHTML = h;
    if (answered) { var b = $('#nextBtn'); if (b) b.focus({ preventScroll: true }); }
  }
  function pick(id) {
    var q = session.quiz, it = q.items[q.pos];
    if (it.pick != null) return;
    it.pick = id;
    var ok = id === it.id;
    grade(it.id, ok);
    if (ok) addXp(10);
    chime(ok);
    save();
    drawQuiz();
  }
  function nextQ() {
    var q = session.quiz;
    if (q.items[q.pos].pick == null) return;
    if (q.pos < q.items.length - 1) q.pos++;
    else { q.done = true; addXp(session.daily ? 25 : 10); }
    save();
    drawQuiz();
    window.scrollTo(0, 0);
  }
  function drawResults() {
    var q = session.quiz, n = quizScore(q), tot = q.items.length, pct = Math.round(100 * n / tot);
    var line = pct === 100 ? 'Flawless.' : pct >= 80 ? 'Strong round.' : pct >= 50 ? 'Solid — the missed ones will come back sooner.' : 'Tough round. They will come back tomorrow.';
    var C = 2 * Math.PI * 52;
    var h = '<div class="results"><div class="ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="ring-bg"/>' +
      '<circle cx="60" cy="60" r="52" class="ring-fg" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - n / tot)).toFixed(1) + '"/></svg>' +
      '<div class="ring-num"><b>' + n + '</b><span>of ' + tot + '</span></div></div>' +
      '<h1>' + (session.daily ? 'Daily quiz complete' : 'Practice round complete') + '</h1><p class="lede">' + line + '</p>' +
      '<div class="row-btns"><a class="btn primary" href="#quiz-more" data-act="more">Practice more</a>' +
      '<a class="btn" href="#practice">Review cards</a><a class="btn ghost" href="#today">Back to today</a></div>' +
      '<ul class="answers">';
    q.items.forEach(function (it) {
      var e = byId[it.id], ok = it.pick === it.id;
      h += '<li class="' + (ok ? 'ok' : 'no') + '"><button data-word="' + esc(e.i) + '"><i>' + (ok ? '✓' : '✕') + '</i><b lang="ig">' + esc(e.w) + '</b><span>' + esc(e.g) + '</span>' + toneSvg(e.t) + '</button></li>';
    });
    h += '</ul></div>';
    main.innerHTML = h;
  }

  // --------------------------------------------------------------- Practice
  var prac = null;
  function viewPractice(mode) {
    if (mode === 'flash') return startFlash(false);
    if (mode === 'ahead') return startFlash(true);
    if (mode === 'match') return startMatch();
    if (mode === 'type') return startType();
    prac = null;
    var due = dueIds().length, mine = myIds().length;
    var h = '<header class="page-head"><p class="eyebrow">Practice</p><h1>Make it stick</h1>' +
      '<p class="lede">Your collection holds ' + plural(mine, 'word') + '. Each right answer pushes a word further out; a miss brings it back tomorrow.</p></header>' +
      '<section class="modes">' +
      mode_('flash', 'Flashcards', due ? plural(due, 'card') + ' due now' : 'Nothing due — study ahead', 'M4 6h12a2 2 0 0 1 2 2v10H6a2 2 0 0 1-2-2zM8 6V4h10a2 2 0 0 1 2 2v10', due ? '' : 'ahead', due) +
      mode_('match', 'Match pairs', 'Six words, six meanings, against the clock', 'M4 5h6v6H4zM14 13h6v6h-6zM10 8h2a2 2 0 0 1 2 2v3', '') +
      mode_('type', 'Type it', 'Recall the Igbo word from its meaning', 'M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8', '') +
      '<a class="mode" href="#quiz-more"><svg viewBox="0 0 24 24"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg><div><h3>Quick quiz</h3><p>Ten extra multiple-choice questions</p></div></a>' +
      '</section>';
    h += '<section class="panel"><h3 class="panel-title">How strong is your collection?</h3>' + boxChart() + '</section>';
    main.innerHTML = h;
  }
  function mode_(id, title, sub, path, alt, badge) {
    return '<a class="mode" href="#practice-' + (alt || id) + '"><svg viewBox="0 0 24 24"><path d="' + path + '"/></svg><div><h3>' + title +
      (badge ? ' <em class="count">' + badge + '</em>' : '') + '</h3><p>' + sub + '</p></div></a>';
  }
  function boxChart() {
    var counts = [0, 0, 0, 0, 0, 0, 0], ids = myIds();
    ids.forEach(function (i) { counts[state.cards[i].box]++; });
    if (!ids.length) return '<p class="empty">No words yet — today’s three will appear here.</p>';
    var groups = [['New', counts[0]], ['Learning', counts[1] + counts[2]], ['Familiar', counts[3] + counts[4]], ['Strong', counts[5]], ['Mastered', counts[6]]];
    var h = '<div class="boxbar">';
    groups.forEach(function (g, i) { if (g[1]) h += '<i class="b' + i + '" style="flex:' + g[1] + '" title="' + g[0] + ': ' + g[1] + '"></i>'; });
    h += '</div><ul class="legend">';
    groups.forEach(function (g, i) { h += '<li><i class="b' + i + '"></i>' + g[0] + ' <b>' + g[1] + '</b></li>'; });
    return h + '</ul>';
  }
  function practicePool(min) {
    var ids = myIds().filter(function (i) { return byId[i].g && byId[i].g.length < 60; });
    if (ids.length < min) {
      var have = {}; ids.forEach(function (i) { have[i] = 1; });
      var p = pool();
      for (var i = 0; i < p.length && ids.length < min; i++) if (!have[p[i]]) ids.push(p[i]);
    }
    return ids;
  }
  function pracHead(title, right) {
    return '<div class="quiz-bar"><a class="back" href="#practice" aria-label="Back to practice">✕</a><h2 class="prac-title">' + title + '</h2><span class="quiz-count">' + (right || '') + '</span></div>';
  }
  function pracDone(title, line, again) {
    main.innerHTML = '<div class="results"><div class="burst" aria-hidden="true">✦</div><h1>' + title + '</h1><p class="lede">' + line + '</p>' +
      '<div class="row-btns"><a class="btn primary" href="#practice-' + again + '" data-act="again" data-mode="' + again + '">Go again</a><a class="btn" href="#practice">Other modes</a><a class="btn ghost" href="#today">Today</a></div></div>';
  }

  // flashcards
  function startFlash(ahead) {
    var ids = dueIds();
    if (ahead || !ids.length) ids = shuffle(myIds()).slice(0, 12);
    else ids = ids.slice(0, 20);
    if (!ids.length) { main.innerHTML = pracHead('Flashcards') + '<p class="empty big">Your collection is empty. Visit <a href="#today">Today</a> to get your first three words.</p>'; return; }
    prac = { mode: 'flash', ids: ids, pos: 0, flipped: false, right: 0, ahead: ahead || !dueIds().length };
    drawFlash();
  }
  function drawFlash() {
    var p = prac;
    if (p.pos >= p.ids.length) { save(); return pracDone('Deck cleared', p.right + ' of ' + p.ids.length + ' remembered.', 'flash'); }
    var e = byId[p.ids[p.pos]];
    main.innerHTML = '<div class="quiz">' + pracHead('Flashcards', (p.pos + 1) + ' / ' + p.ids.length) +
      '<button class="flash' + (p.flipped ? ' flipped' : '') + '" data-act="flip" aria-label="Flip card">' +
      '<span class="flash-face front"><span class="eyebrow">Igbo</span><span class="igbo-huge" lang="ig">' + wordLabel(e) + '</span>' + toneSvg(e.t, 'big') + pron(e, 'center') + '<span class="keys-hint">tap or press space to flip</span></span>' +
      '<span class="flash-face back"><span class="eyebrow">Meaning</span><span class="gloss-huge">' + esc(e.g) + '</span><span class="igbo" lang="ig">' + esc(e.w) + '</span></span>' +
      '</button>' +
      '<div class="flash-actions">' + playBtn(e, 'Hear it') +
      (p.flipped ? '<button class="btn bad" data-act="flash-no">Again <kbd>1</kbd></button><button class="btn good" data-act="flash-yes">Got it <kbd>2</kbd></button>'
        : '<button class="btn primary" data-act="flip">Show meaning</button>') +
      '<button class="link" data-word="' + esc(e.i) + '">Entry</button></div></div>';
  }
  function flashGrade(ok) {
    var p = prac; if (!p || p.mode !== 'flash' || !p.flipped) return;
    grade(p.ids[p.pos], ok);
    if (ok) { p.right++; addXp(4); }
    p.pos++; p.flipped = false;
    save(); drawFlash();
  }

  // match
  function startMatch() {
    var ids = shuffle(practicePool(6)).slice(0, 6);
    var tiles = [];
    ids.forEach(function (id) { tiles.push({ id: id, side: 'w' }); tiles.push({ id: id, side: 'g' }); });
    prac = { mode: 'match', tiles: shuffle(tiles), sel: null, done: {}, miss: 0, start: Date.now(), wrong: null };
    drawMatch();
  }
  function drawMatch() {
    var p = prac, left = 6 - Object.keys(p.done).length;
    var h = '<div class="quiz wide">' + pracHead('Match pairs', left ? left + ' to go' : '') + '<div class="match">';
    p.tiles.forEach(function (t, i) {
      var e = byId[t.id], cls = t.side === 'w' ? ' is-igbo' : '';
      if (p.done[t.id]) cls += ' gone';
      if (p.sel === i) cls += ' sel';
      if (p.wrong && (p.wrong[0] === i || p.wrong[1] === i)) cls += ' shake';
      h += '<button class="tile' + cls + '" data-act="tile" data-i="' + i + '"' + (p.done[t.id] ? ' disabled' : '') + (t.side === 'w' ? ' lang="ig"' : '') + '>' +
        (t.side === 'w' ? esc(e.w) : esc(e.g)) + '</button>';
    });
    h += '</div><p class="keys-hint">Pair each Igbo word with its meaning</p></div>';
    main.innerHTML = h;
  }
  function tile(i) {
    var p = prac; if (!p || p.mode !== 'match') return;
    var t = p.tiles[i]; p.wrong = null;
    if (p.sel == null) { p.sel = i; if (t.side === 'w') playTones(byId[t.id].t); return drawMatch(); }
    if (p.sel === i) { p.sel = null; return drawMatch(); }
    var a = p.tiles[p.sel];
    if (a.side === t.side) { p.sel = i; return drawMatch(); }
    if (a.id === t.id) {
      p.done[t.id] = 1; p.sel = null; chime(true); addXp(3);
      card(t.id, true); grade(t.id, true);
      if (Object.keys(p.done).length === 6) {
        var secs = Math.round((Date.now() - p.start) / 1000);
        addXp(10); save();
        return pracDone('All matched', secs + ' seconds, ' + plural(p.miss, 'slip') + '.', 'match');
      }
    } else { p.miss++; p.wrong = [p.sel, i]; p.sel = null; chime(false); }
    save(); drawMatch();
  }

  // type it
  function startType() {
    var ids = shuffle(practicePool(8).filter(function (i) { return byId[i].w.length <= 14 && byId[i].w.indexOf(' ') < 0; })).slice(0, 8);
    prac = { mode: 'type', ids: ids, pos: 0, right: 0, state: null, hint: 0, val: '' };
    drawType();
  }
  function drawType() {
    var p = prac;
    if (p.pos >= p.ids.length) { save(); return pracDone('Round complete', p.right + ' of ' + p.ids.length + ' spelled from memory.', 'type'); }
    var e = byId[p.ids[p.pos]];
    var h = '<div class="quiz">' + pracHead('Type it', (p.pos + 1) + ' / ' + p.ids.length) +
      '<div class="prompt"><p class="eyebrow">Write the Igbo word for</p><h1 class="gloss-huge">' + esc(e.g) + '</h1>' +
      (p.hint ? '<p class="hint-line" lang="ig">' + esc(e.w.slice(0, p.hint)) + '<span>' + new Array(Math.max(0, e.w.length - p.hint) + 1).join('·') + '</span></p>' : '') + '</div>' +
      '<form class="type-form" data-act="type-form" autocomplete="off"><input id="typeIn" class="type-in ' + (p.state || '') + '" lang="ig" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="type here" value="' + esc(p.val) + '"' + (p.state ? ' readonly' : '') + ' aria-label="Your answer">' +
      '<div class="glyphs">' + ['ị', 'ọ', 'ụ', 'ṅ'].map(function (g) { return '<button type="button" class="glyph" data-act="glyph" data-g="' + g + '" lang="ig">' + g + '</button>'; }).join('') +
      '<button type="button" class="link" data-act="hint">Hint</button></div>';
    if (p.state) {
      h += '<div class="verdict ' + (p.state === 'no' ? 'no' : 'ok') + '"><div><b>' + (p.state === 'ok' ? 'Correct' : p.state === 'near' ? 'Right word — watch the dots' : 'Not quite') + '</b>' +
        '<p><span class="igbo" lang="ig">' + esc(e.w) + '</span> — ' + esc(e.g) + '</p>' + pron(e) + '</div><button class="btn primary" id="nextBtn">Next <kbd>↵</kbd></button></div>';
    } else h += '<button class="btn primary block">Check</button>';
    h += '</form></div>';
    main.innerHTML = h;
    var inp = $('#typeIn');
    if (p.state) $('#nextBtn').focus({ preventScroll: true });
    else { inp.focus({ preventScroll: true }); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }
  function typeSubmit() {
    var p = prac, e = byId[p.ids[p.pos]];
    if (p.state) { p.pos++; p.state = null; p.hint = 0; p.val = ''; return drawType(); }
    var v = $('#typeIn').value.trim();
    if (!v) return;
    p.val = v;
    var exact = v.toLowerCase().normalize('NFC') === e.w.toLowerCase().normalize('NFC');
    var near = key(v) === e._k;
    p.state = exact ? 'ok' : near ? 'near' : 'no';
    var ok = exact || near;
    card(e.i, true); grade(e.i, ok && !p.hint);
    if (ok) { p.right++; addXp(p.hint ? 3 : 8); }
    chime(ok); say(e); save(); drawType();
  }

  // -------------------------------------------------------------- Dictionary
  var dq = { q: '', filter: 'all', letter: '', shown: 60 };
  function search() {
    var q = key(dq.q), raw = dq.q.trim().toLowerCase(), f = dq.filter, L = dq.letter;
    var res = [];
    for (var i = 0; i < ALL.length; i++) {
      var e = ALL[i];
      if (f === 'mine' && !state.cards[e.i]) continue;
      if (f === 'core' && !e.k) continue;
      if (f === 'added' && !e.custom) continue;
      if (f.indexOf('t:') === 0 && !(e.c && e.c.indexOf(f.slice(2)) >= 0)) continue;
      if (f.indexOf('p:') === 0 && e.p !== f.slice(2)) continue;
      if (L && e._k.charAt(0) !== L) continue;
      if (!q) { res.push([0, i, e]); continue; }
      var s = -1;
      if (e._k === q) s = 0;
      else if (e._k.replace(/ /g, '') === q.replace(/ /g, '')) s = 1;
      else if (e._g === raw || e._g === 'to ' + raw || e._g === 'a ' + raw) s = 2;
      else if (e._k.indexOf(q) === 0) s = 3;
      else if (new RegExp('(^|[^a-z])' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)').test(e._g)) s = 4;
      else if (e._k.indexOf(q) > 0) s = 5;
      else if (e._g.indexOf(raw) >= 0) s = 6;
      else if (q.length > 2 && e.d && e.d.toLowerCase().indexOf(raw) >= 0) s = 7;
      if (s >= 0) res.push([s, i, e]);
    }
    if (q) res.sort(function (a, b) { return a[0] - b[0] || a[2]._g.length - b[2]._g.length || a[1] - b[1]; });
    return res.map(function (r) { return r[2]; });
  }
  function viewDictionary() {
    var letters = 'abcdefghijklmnoprstuvwyz'.split('');
    var h = '<header class="page-head row"><div><p class="eyebrow">Dictionary</p><h1>' + ALL.length.toLocaleString() + ' Igbo words</h1></div>' +
      '<button class="btn" data-act="add-word">+ Add a word</button></header>' +
      '<div class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>' +
      '<input id="dq" type="search" placeholder="Search Igbo or English — try “water” or “mmili”" value="' + esc(dq.q) + '" aria-label="Search the dictionary" autocomplete="off" spellcheck="false"><kbd>/</kbd></div>' +
      '<div class="chips" id="chips">' + chip('all', 'All') + chip('mine', 'My words') + chip('core', 'Core') +
      (state.custom.length ? chip('added', 'Added by me') : '') +
      TOPICS.map(function (t) { return chip('t:' + t[0], t[1]); }).join('') +
      chip('p:verb', 'Verbs') + chip('p:noun', 'Nouns') + chip('p:phrase', 'Phrases') + chip('p:name', 'Names') + '</div>' +
      '<div class="letters" id="letters">' + letters.map(function (l) {
        return '<button data-act="letter" data-l="' + l + '"' + (dq.letter === l ? ' class="on"' : '') + '>' + l + '</button>';
      }).join('') + '</div>' +
      '<div id="dres"></div>';
    main.innerHTML = h;
    drawResultsList();
  }
  function chip(id, label) {
    return '<button class="chip' + (dq.filter === id ? ' on' : '') + '" data-act="filter" data-f="' + id + '">' + label + '</button>';
  }
  function drawResultsList() {
    var res = search(), box = $('#dres');
    if (!box) return;
    var h = '<p class="res-count">' + (res.length ? plural(res.length, 'entry').replace('entrys', 'entries') : 'No entries') +
      (dq.q ? ' for “' + esc(dq.q) + '”' : '') + '</p>';
    if (!res.length) {
      h += '<div class="empty big"><p>Nothing matched. Igbo spelling varies — try without accents, or search by the English meaning.</p>' +
        '<button class="btn" data-act="add-word">Add “' + esc(dq.q) + '” yourself</button></div>';
    } else {
      h += '<ul class="entries">';
      res.slice(0, dq.shown).forEach(function (e) {
        h += '<li><button class="entry" data-word="' + esc(e.i) + '"><span class="entry-w" lang="ig">' + wordLabel(e) + '</span>' + toneSvg(e.t) +
          '<span class="entry-g">' + esc(e.g) + '<i class="entry-p">' + esc(respell(e)) + '</i></span>' + boxPips(e.i) + posTag(e) + '</button>' + saveBtn(e.i) + '</li>';
      });
      h += '</ul>';
      if (res.length > dq.shown) h += '<button class="btn block" data-act="more-results" id="moreRes">Show more (' + (res.length - dq.shown) + ' left)</button>';
    }
    box.innerHTML = h;
  }

  function openEntry(id) {
    var e = byId[id]; if (!e) return;
    var dlg = $('#entryDialog'), c = state.cards[id];
    var twins = ALL.filter(function (x) { return x._k === e._k && x.i !== e.i; });
    var h = '<div class="sheet-head"><div>' + posTag(e) + (e.c || []).map(function (t) {
      var n = TOPICS.filter(function (x) { return x[0] === t; })[0];
      return '<span class="tag soft">' + (n ? n[1] : t) + '</span>';
    }).join('') + (e.k ? '<span class="tag gold">core</span>' : '') + (e.custom ? '<span class="tag gold">added by you</span>' : '') + '</div>' +
      '<div class="sheet-tools">' + saveBtn(id) + '<button class="icon-btn" data-act="close" aria-label="Close">✕</button></div></div>' +
      '<h2 class="igbo-huge" lang="ig">' + wordLabel(e) + '</h2>' +
      '<div class="wc-tone">' + toneSvg(e.t, 'big') + playBtn(e, 'Hear it') + (e.t ? '<span class="tone-words">' + toneWords(e.t) + '</span>' : '') + '</div>' + pron(e, 'lead') +
      (e.v ? '<p class="alt">also <span class="igbo" lang="ig">' + e.v.map(esc).join(', ') + '</span></p>' : '') +
      '<p class="gloss-lead">' + esc(e.g) + '</p>';
    if (e.d && plainLen(e.d) > e.g.length + 6) h += '<div class="def">' + renderDef(e.d) + '</div>';
    if (state.settings.notation && e.o && e.o !== e.w) {
      h += '<p class="orig"><span>With tone marks</span> <span class="ipa">' + esc(e.o) + '</span></p>';
    }
    if (c) {
      h += '<div class="mastery"><span>' + BOX_NAME[c.box] + '</span>' + boxPips(id) + '<span class="muted">' +
        (c.seen ? c.right + ' right · ' + c.wrong + ' missed' : 'not practised yet') + '</span></div>';
    }
    if (twins.length) {
      h += '<div class="twins"><p class="eyebrow">Same spelling, other meanings</p>';
      twins.slice(0, 8).forEach(function (x) {
        h += '<button class="chip-word" data-word="' + esc(x.i) + '"><b lang="ig">' + wordLabel(x) + '</b> ' + toneSvg(x.t) + ' ' + esc(x.g) + '</button>';
      });
      h += '</div>';
    }
    if (e.custom) h += '<button class="link danger" data-act="del-custom" data-id="' + esc(id) + '">Delete this word</button>';
    dlg.innerHTML = h;
    if (!dlg.open) dlg.showModal();
    dlg.scrollTop = 0;
    if (window.ChiCursor) window.ChiCursor.rehome();
  }
  function plainLen(d) { return d.replace(/\[[^\]]*\]/g, '').replace(/[|_]/g, '').length; }

  function openAddWord() {
    var dlg = $('#formDialog');
    dlg.innerHTML = '<form method="dialog" id="addForm"><div class="sheet-head"><h2>Add a word</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>' +
      '<p class="muted">Heard a word from family or a friend? Add it and it joins your dictionary and your practice deck.</p>' +
      '<label>Igbo word<input name="w" required lang="ig" autocapitalize="off" spellcheck="false" value="' + esc(dq.q && !search().length ? dq.q : '') + '"></label>' +
      '<div class="glyphs">' + ['ị', 'ọ', 'ụ', 'ṅ', 'Ị', 'Ọ', 'Ụ', 'Ṅ'].map(function (g) { return '<button type="button" class="glyph" data-act="glyph-add" data-g="' + g + '">' + g + '</button>'; }).join('') + '</div>' +
      '<label>Meaning in English<input name="g" required maxlength="80"></label>' +
      '<label>Notes <span class="muted">(optional — an example sentence, who taught you)</span><textarea name="d" rows="3"></textarea></label>' +
      '<div class="row-btns"><button class="btn primary" value="ok">Add to dictionary</button></div></form>';
    dlg.showModal();
    if (window.ChiCursor) window.ChiCursor.rehome();
  }
  function addWord(form) {
    var w = form.w.value.trim().normalize('NFC'), g = form.g.value.trim(), d = form.d.value.trim();
    if (!w || !g) return;
    var e = { i: 'my:' + Date.now().toString(36), w: w, g: g, d: d ? g + '. ' + d : '', p: /^to /i.test(g) ? 'verb' : 'other', q: 1, custom: 1 };
    state.custom.push(e);
    index();
    card(e.i, true);
    addXp(5);
    save();
    toast('Added “' + w + '”');
    $('#formDialog').close();
    if (route().name === 'dictionary') { dq.filter = 'added'; dq.q = ''; dq.letter = ''; viewDictionary(); }
  }

  // --------------------------------------------------------------- Progress
  function viewProgress() {
    var ids = myIds(), mastered = ids.filter(function (i) { return state.cards[i].box >= 5; }).length;
    var right = 0, seen = 0;
    ids.forEach(function (i) { right += state.cards[i].right; seen += state.cards[i].seen; });
    var sp = levelSpan(), quizzes = Object.keys(state.days).filter(function (d) { return state.days[d].quiz && state.days[d].quiz.done; }).length;
    var h = '<header class="page-head"><p class="eyebrow">Progress</p><h1>Level ' + level() + '</h1>' +
      '<div class="lvl"><div class="lvl-bar"><i style="width:' + sp.pct + '%"></i></div><span>' + state.xp + ' / ' + sp.hi + ' XP</span></div></header>' +
      '<section class="stats">' +
      stat(streak(), 'day streak') + stat(bestStreak(), 'best streak') + stat(ids.length, 'words collected') +
      stat(mastered, 'strong or mastered') + stat(seen ? Math.round(100 * right / seen) + '%' : '—', 'accuracy') + stat(quizzes, 'daily quizzes') +
      '</section>' +
      '<section class="panel"><h3 class="panel-title">Last 18 weeks</h3>' + heatmap() + '</section>' +
      '<section class="panel"><h3 class="panel-title">Collection strength</h3>' + boxChart() + '</section>' +
      '<section class="panel"><h3 class="panel-title">Settings</h3><div class="settings">' +
      toggle('cursor', 'Targeting cursor', 'The trailing reticle. Desktop only.') +
      toggle('sound', 'Sound', 'Tone melodies and answer chimes. On a phone, check that silent mode is off.') +
      toggle('voice', 'Computer voice', 'Speak each word with an approximate borrowed voice before the melody.') +
      toggle('notation', 'Show tone marks', 'The dictionary’s tone-marked spelling beside each entry.') +
      '<div class="set"><div><b>Theme</b><p>Dark bronze or light ivory.</p></div><button class="btn" data-act="theme">' + (state.settings.theme === 'dark' ? 'Switch to light' : 'Switch to dark') + '</button></div>' +
      '<div class="set"><div><b>Your data</b><p>Everything lives in this browser. Export a backup to move devices.</p></div><div class="row-btns tight"><button class="btn" data-act="export">Export</button><label class="btn">Import<input type="file" id="importFile" accept="application/json,.json" hidden></label><button class="btn ghost danger" data-act="reset">Reset</button></div></div>' +
      '</div></section>' +
      '<section class="panel about"><h3 class="panel-title">About the words</h3><p>The dictionary is built from Kay Williamson’s <em>Dictionary of Ònìchà Igbo</em> (2nd edition, edited by Roger Blench, 2006), as digitised by the Igbo API project. It records the Igbo of Onitsha, so some words differ from Standard Igbo. Words are shown in everyday spelling without tone accents; the tone-marked form is kept on every entry (a grave accent is a low tone, a macron a step-down, no accent a high tone). The digitisation was automatic, so a few definitions and examples may sit under the wrong word.</p></section>';
    main.innerHTML = h;
  }
  function stat(n, label) { return '<div class="stat"><b>' + n + '</b><span>' + label + '</span></div>'; }
  function toggle(k, title, sub) {
    return '<div class="set"><div><b>' + title + '</b><p>' + sub + '</p></div><button class="switch' + (state.settings[k] ? ' on' : '') + '" role="switch" aria-checked="' + !!state.settings[k] + '" aria-label="' + title + '" data-act="toggle" data-k="' + k + '"><i></i></button></div>';
  }
  function heatmap() {
    var t = parseDate(today()), end = new Date(t); end.setDate(end.getDate() + (6 - end.getDay()));
    var h = '<div class="heat">';
    for (var w = 17; w >= 0; w--) {
      h += '<div>';
      for (var d = 0; d < 7; d++) {
        var x = new Date(end); x.setDate(end.getDate() - w * 7 - (6 - d));
        var s = dateStr(x), xp = (state.days[s] && state.days[s].xp) || 0;
        var lv = x > t ? 'f' : xp === 0 ? 0 : xp < 60 ? 1 : xp < 150 ? 2 : xp < 260 ? 3 : 4;
        h += '<i class="h' + lv + '" title="' + x.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ': ' + xp + ' XP"></i>';
      }
      h += '</div>';
    }
    return h + '</div><p class="muted small">Each square is a day; brighter means more XP earned.</p>';
  }
  function exportData() {
    var json = JSON.stringify(state);
    try { // a file download where the browser allows it
      var blob = new Blob([json], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'chigbo-backup-' + today() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    } catch (e) { /* the copy box below still works */ }
    var dlg = $('#formDialog');
    dlg.innerHTML = '<div class="sheet-head"><h2>Your backup</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>' +
      '<p class="muted">If no file was downloaded, copy this text and keep it somewhere safe. To restore, paste a backup here and choose Restore.</p>' +
      '<textarea id="backupText" class="backup" rows="7" spellcheck="false" aria-label="Backup data"></textarea>' +
      '<div class="row-btns"><button class="btn primary" data-act="copy-backup">Copy</button><button class="btn" data-act="paste-restore">Restore from this text</button></div>';
    $('#backupText').value = json;
    dlg.showModal();
    if (window.ChiCursor) window.ChiCursor.rehome();
  }
  function restore(text) {
    try {
      var s = JSON.parse(text);
      if (!s || typeof s !== 'object' || !s.cards || !s.days) throw new Error('bad');
      try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
      s.settings = Object.assign({ theme: 'dark', cursor: true, sound: true, voice: true, notation: true }, s.settings);
      s.custom = s.custom || []; s.xp = s.xp || 0;
      state = s; poolCache = null;
      index(); save(); $$('dialog[open]').forEach(function (d) { d.close(); }); go(); toast('Backup restored');
    } catch (e) { toast('That is not an chIgbo backup'); }
  }
  function importData(file) {
    var r = new FileReader();
    r.onload = function () { restore(r.result); };
    r.readAsText(file);
  }

  // ----------------------------------------------------------------- router
  function route() {
    var h = location.hash.replace(/^#\/?/, '') || 'today';
    try { h = decodeURIComponent(h); } catch (e) { /* keep raw */ }
    var cut = h.search(/[-\/]/);
    return cut < 0 ? { name: h, arg: '' } : { name: h.slice(0, cut), arg: h.slice(cut + 1) };
  }
  function go() {
    var r = route();
    if (r.name === 'main') return; // skip-link target, not a view
    if (r.name === 'word') {
      var id = r.arg;
      if (!main.dataset.ready) { main.dataset.ready = '1'; go.last = 'dictionary'; viewDictionary(); mark('dictionary'); refreshChrome(); }
      try { history.replaceState(null, '', '#' + go.last); } catch (e) { /* sandboxed */ }
      return openEntry(id);
    }
    var views = { today: viewToday, quiz: viewQuiz, practice: viewPractice, dictionary: viewDictionary, progress: viewProgress };
    var v = views[r.name] || viewToday;
    go.last = r.name + (r.arg ? '-' + r.arg : '');
    main.dataset.ready = '1';
    v(r.arg);
    mark(views[r.name] ? r.name : 'today');
    main.classList.remove('enter'); void main.offsetWidth; main.classList.add('enter');
    refreshChrome();
  }
  function mark(name) {
    $$('#nav a').forEach(function (a) {
      var on = a.dataset.route === name;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  // ----------------------------------------------------------------- events
  // the page-enter animation should only play on navigation, not on redraws
  ['pointerdown', 'keydown'].forEach(function (t) {
    document.addEventListener(t, function () { main.classList.remove('enter'); }, true);
  });
  document.addEventListener('click', function (ev) {
    var w = ev.target.closest('[data-word]');
    var a = ev.target.closest('[data-act]');
    if (a && a.dataset.act === 'save') { // save buttons can sit next to data-word rows
      ev.preventDefault();
      toggleSave(a.dataset.id);
      $$('[data-act="save"]').forEach(function (b) {
        if (b.dataset.id === a.dataset.id) { var on = !!state.cards[b.dataset.id]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }
      });
      return;
    }
    if (a) {
      var act = a.dataset.act;
      if (act === 'tone') return playTones(a.dataset.t);
      if (act === 'say') return say(byId[a.dataset.id]);
      if (act === 'pick') return pick(a.dataset.id);
      if (act === 'next') return nextQ();
      if (act === 'more') { ev.preventDefault(); session = null; if (route().name === 'quiz' && route().arg === 'more') viewQuiz('more'); else location.hash = '#quiz-more'; return; }
      if (act === 'again') { ev.preventDefault(); if (route().arg === a.dataset.mode) viewPractice(a.dataset.mode); else location.hash = '#practice-' + a.dataset.mode; return; }
      if (act === 'flip') { if (prac) { prac.flipped = !prac.flipped; if (prac.flipped) playTones(byId[prac.ids[prac.pos]].t); drawFlash(); } return; }
      if (act === 'flash-yes') return flashGrade(true);
      if (act === 'flash-no') return flashGrade(false);
      if (act === 'tile') return tile(+a.dataset.i);
      if (act === 'glyph') { var inp = $('#typeIn'); if (inp && !inp.readOnly) { insertAt(inp, a.dataset.g); } return; }
      if (act === 'glyph-add') { insertAt($('#addForm').w, a.dataset.g); return; }
      if (act === 'hint') { if (prac && !prac.state) { prac.val = $('#typeIn').value; prac.hint = Math.min(prac.hint + 1, byId[prac.ids[prac.pos]].w.length); drawType(); } return; }
      if (act === 'filter') { dq.filter = a.dataset.f; dq.shown = 60; $$('#chips .chip').forEach(function (c) { c.classList.toggle('on', c === a); }); return drawResultsList(); }
      if (act === 'letter') { dq.letter = dq.letter === a.dataset.l ? '' : a.dataset.l; dq.shown = 60; $$('#letters button').forEach(function (b) { b.classList.toggle('on', b.dataset.l === dq.letter); }); return drawResultsList(); }
      if (act === 'more-results') { dq.shown += 120; return drawResultsList(); }
      if (act === 'add-word') return openAddWord();
      if (act === 'close') { a.closest('dialog').close(); return; }
      if (act === 'del-custom') {
        state.custom = state.custom.filter(function (x) { return x.i !== a.dataset.id; });
        delete state.cards[a.dataset.id]; index(); save(); $('#entryDialog').close(); toast('Deleted');
        if (route().name === 'dictionary') viewDictionary();
        return;
      }
      if (act === 'toggle') { state.settings[a.dataset.k] = !state.settings[a.dataset.k]; save(); return viewProgress(); }
      if (act === 'theme') { flipTheme(); return viewProgress(); }
      if (act === 'export') return exportData();
      if (act === 'reset') {
        if (a.dataset.armed) {
          try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
          state = load(); index(); save(); location.hash = '#today'; go(); toast('Fresh start');
        } else {
          a.dataset.armed = '1'; a.textContent = 'Erase everything?';
          setTimeout(function () { if (a.isConnected) { delete a.dataset.armed; a.textContent = 'Reset'; } }, 4000);
        }
        return;
      }
      if (act === 'copy-backup') {
        var ta = $('#backupText'); ta.select();
        try { navigator.clipboard.writeText(ta.value).then(function () { toast('Copied'); }, function () {}); } catch (e) { /* selection is the fallback */ }
        return;
      }
      if (act === 'paste-restore') return restore($('#backupText').value);
    }
    if (w) { ev.preventDefault(); openEntry(w.dataset.word); }
  });
  function insertAt(inp, g) {
    var s = inp.selectionStart == null ? inp.value.length : inp.selectionStart, e = inp.selectionEnd == null ? s : inp.selectionEnd;
    inp.value = inp.value.slice(0, s) + g + inp.value.slice(e);
    inp.focus(); inp.setSelectionRange(s + g.length, s + g.length);
  }
  function flipTheme() { state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark'; save(); }
  $('#themeBtn').addEventListener('click', function () { flipTheme(); if (route().name === 'progress') viewProgress(); });

  document.addEventListener('submit', function (ev) {
    if (ev.target.dataset.act === 'type-form') { ev.preventDefault(); typeSubmit(); }
    if (ev.target.id === 'addForm') { ev.preventDefault(); addWord(ev.target); }
  });
  var searchTimer = 0;
  document.addEventListener('input', function (ev) {
    if (ev.target.id === 'dq') {
      dq.q = ev.target.value; dq.shown = 60;
      clearTimeout(searchTimer); searchTimer = setTimeout(drawResultsList, 90);
    }
  });
  document.addEventListener('change', function (ev) {
    if (ev.target.id === 'importFile' && ev.target.files[0]) importData(ev.target.files[0]);
  });
  $$('dialog').forEach(function (d) {
    d.addEventListener('click', function (ev) { if (ev.target === d) d.close(); });
    d.addEventListener('close', function () {
      if (window.ChiCursor) window.ChiCursor.rehome();
      var r = route().name;
      if (r === 'dictionary') drawResultsList();
    });
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName);
    if (document.querySelector('dialog[open]')) return;
    var r = route();
    if (!typing && ev.key === '/' && r.name === 'dictionary') { ev.preventDefault(); $('#dq').focus(); return; }
    if (typing) return;
    if (r.name === 'quiz' && session && !session.quiz.done) {
      var it = session.quiz.items[session.quiz.pos];
      if (/^[1-4]$/.test(ev.key) && it.pick == null && it.opts[+ev.key - 1]) { ev.preventDefault(); pick(it.opts[+ev.key - 1]); }
      else if ((ev.key === 'Enter' || ev.key === 'ArrowRight') && it.pick != null) { ev.preventDefault(); nextQ(); }
    } else if (prac && prac.mode === 'flash' && r.name === 'practice') {
      if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); prac.flipped = !prac.flipped; if (prac.flipped) playTones(byId[prac.ids[prac.pos]].t); drawFlash(); }
      else if (ev.key === '1') flashGrade(false);
      else if (ev.key === '2') flashGrade(true);
    }
  });

  window.addEventListener('hashchange', go);
  if (!DICT.length) {
    main.innerHTML = '<div class="empty big"><h1>Dictionary missing</h1><p>data/dictionary.js did not load. Run <code>python3 tools/build_dictionary.py</code>.</p></div>';
  } else {
    refreshChrome();
    go();
  }
})();
