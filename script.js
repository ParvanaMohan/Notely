"use strict";
// ================= STUDYSYNC =================
const state = { notes: [], filter: "all", search: "", quiz: null };
try { state.notes = JSON.parse(localStorage.getItem("studysync_notes") || "[]"); } catch (e) {}

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const rand = n => Math.floor(Math.random() * n);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = v => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
const capFirst = s => s.charAt(0).toUpperCase() + s.slice(1);
const trimEnd = s => s.replace(/[\s.;:,]+$/, "");
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const short = (s, n) => s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s;
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function saveNotes() { try { localStorage.setItem("studysync_notes", JSON.stringify(state.notes)); } catch (e) { toast("Browser storage is full. Delete some notes."); } }
let toastTimer;
function toast(msg) {
  const t = $("#toast"); if (!t) { alert(msg); return; }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 4000);
}
const openModal = id => { const m = document.getElementById(id); if (m) m.classList.add("open"); };
const closeModal = id => { const m = document.getElementById(id); if (m) m.classList.remove("open"); };
document.addEventListener("click", e => {
  const c = e.target.closest("[data-close]");
  if (c) { closeModal(c.dataset.close); return; }
  if (e.target.classList.contains("modal-backdrop")) e.target.classList.remove("open");
});

// ---------- text analysis ----------
const STOP = new Set(("a an the and or but if then else of in on at to for from by with without as is are was were be been being this that these those it its into than also such can may might will would should could not no nor so very more most other some any each both either which who whom whose what when where why how there their they them we you your our his her he she i about over under between during before after above below up down out off again once here all few many much own same too just only using used use uses based called known given however therefore thus etc via per important different following various several example examples general commonly usually generally typically often sometimes allows allow helps help make makes made need needs because while every one two three first second").split(" "));
const tok = s => s.toLowerCase().match(/[a-z][a-z0-9\-]*/g) || [];

function getSentences(text) {
  const out = [], seen = new Set();
  text.split(/\r?\n+/).forEach(line => {
    line = line.replace(/^\s*([•*\-–]|\d+[.)])\s*/, "").trim();
    if (!line || /^(topic \d+|key terms:)/i.test(line)) return;
    line = line.replace(/\b([a-z])\.([a-z])\./gi, "$1§$2§").replace(/\b(etc|vs|fig|eq|approx)\./gi, "$1§");
    line.replace(/([.!?])\s+(?=["'(\[]?[A-Z0-9])/g, "$1\u0001").split("\u0001").forEach(p => {
      p = p.replace(/§/g, ".").trim();
      const k = p.toLowerCase();
      if (p.split(/\s+/).length >= 5 && p.length <= 400 && !seen.has(k)) { seen.add(k); out.push(p); }
    });
  });
  return out;
}

function extractTerms(sentence, ctx) {
  const terms = [], seen = new Set();
  const add = (text, score) => { text = text.trim(); const k = text.toLowerCase(); if (text.length < 2 || seen.has(k)) return; seen.add(k); terms.push({ text, score }); };
  let m; const bigO = /O\([^)]{1,16}\)/g;
  while ((m = bigO.exec(sentence))) add(m[0], 7);
  const words = [], re = /[A-Za-z][A-Za-z0-9\-]*/g;
  while ((m = re.exec(sentence))) words.push({ w: m[0], i: m.index });
  words.forEach(o => { if (/^[A-Z][A-Z0-9]{1,6}s?$/.test(o.w)) add(o.w, 5); });
  for (let a = 1; a < words.length; a++) {
    if (/^[A-Z][a-z]{2,}/.test(words[a].w) && !STOP.has(words[a].w.toLowerCase())) {
      let b = a;
      while (b + 1 < words.length && /^[A-Z][a-z]+/.test(words[b + 1].w) && !sentence.slice(words[b].i + words[b].w.length, words[b + 1].i).trim()) b++;
      add(sentence.slice(words[a].i, words[b].i + words[b].w.length), 4); a = b;
    }
  }
  for (let a = 0; a < words.length; a++) {
    const w = words[a].w, lw = w.toLowerCase();
    if (STOP.has(lw) || lw.length < 4) continue;
    const nx = words[a + 1];
    if (nx) {
      const nl = nx.w.toLowerCase();
      if (!STOP.has(nl) && nl.length >= 3 && /^\s+$/.test(sentence.slice(words[a].i + w.length, nx.i)) && (ctx.bi[lw + " " + nl] || 0) >= 2) add(w + " " + nx.w, 5);
    }
    if (/^[a-z]/.test(w)) add(w, ((ctx.freq[lw] || 1) >= 2 ? 2 : 1) + (lw.length >= 8 ? 1 : 0) + (w.includes("-") ? 1 : 0));
  }
  return terms;
}

function parseDef(s) {
  const m = trimEnd(s).match(/^(.{3,50}?)\s+(?:is defined as|is known as|is called|are called|are known as|refers to|means|is|are)\s+(.{20,})$/i);
  if (!m) return null;
  const term = m[1].trim().replace(/^(a|an|the)\s+/i, ""), def = m[2].trim();
  if (term.split(/\s+/).length > 5 || /[,;:()]/.test(term)) return null;
  if (/^(it|this|that|these|those|they|there|which|who|what|here|one|each|he|she|we|you)\b/i.test(term)) return null;
  if (/\b(that|which|because|when|if|while|since|but|and|or)\b/i.test(term) || /^(not|no)\b/i.test(def)) return null;
  return { term, def, sentence: s };
}

function analyze(text) {
  const sentences = getSentences(text), freq = {}, bi = {};
  sentences.forEach(s => {
    const w = tok(s);
    w.forEach((x, i) => {
      const ok = x.length > 2 && !STOP.has(x); if (ok) freq[x] = (freq[x] || 0) + 1;
      const y = w[i + 1]; if (ok && y && y.length > 2 && !STOP.has(y)) bi[x + " " + y] = (bi[x + " " + y] || 0) + 1;
    });
  });
  const ctx = { sentences, freq, bi, pool: [], defs: [] }, seen = new Set();
  sentences.forEach(s => {
    extractTerms(s, ctx).forEach(t => { const k = t.text.toLowerCase(); if (t.score >= 2 && !seen.has(k)) { seen.add(k); ctx.pool.push(t); } });
    const d = parseDef(s); if (d) ctx.defs.push(d);
  });
  return ctx;
}

// ---------- EASY examiner-style question maker ----------
// Rules: 5 questions, 4 options each, every option set different from the others.
const termRe = (t, g) => new RegExp("(^|[^A-Za-z0-9])" + reEsc(t) + "(?![A-Za-z0-9])", g ? "g" : "");
const isAcr = t => /^[A-Z0-9]{2,}s?$/.test(t);
function matchCase(opt, ref) {
  if (isAcr(opt) || /^O\(/.test(opt)) return opt;
  return /^[A-Z]/.test(ref) ? capFirst(opt) : opt.charAt(0).toLowerCase() + opt.slice(1);
}

// Distractors: words from the same note that are NOT in this sentence.
// Options already used in earlier questions are pushed to the back so options differ question to question.
function pickDistractors(answer, ctx, sentence, avoid) {
  const a = answer.toLowerCase(), s = (sentence || "").toLowerCase();
  const sameLen = t => Math.abs(t.length - answer.length) <= 4;
  const cands = ctx.pool
    .filter(t => { const k = t.text.toLowerCase(); return k !== a && !a.includes(k) && !k.includes(a) && !s.includes(k) && !/\d/.test(k); })
    .map(t => ({ t: t.text, r: (isAcr(t.text) === isAcr(answer) ? 2 : 0) + (sameLen(t.text) ? 1 : 0) + Math.random() * 1.5 }))
    .sort((x, y) => y.r - x.r).map(x => matchCase(x.t, answer));
  // extra single words from the note as backup
  const extra = Object.keys(ctx.freq).filter(w => w.length >= 5 && !s.includes(w) && w !== a && !a.includes(w)).map(w => matchCase(w, answer));
  const all = cands.concat(shuffle(extra));
  const fresh = all.filter(x => !avoid.has(x.toLowerCase()));
  const stale = all.filter(x => avoid.has(x.toLowerCase()));
  return fresh.concat(stale);
}

function buildQ(type, question, correct, ds, explanation, avoid) {
  const seen = new Set([correct.toLowerCase()]), out = [];
  for (const d of ds) {
    const k = (d || "").toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k); out.push(d); if (out.length === 3) break;
  }
  if (out.length < 3) return null;
  const options = shuffle([correct, ...out]);
  options.forEach(o => avoid.add(o.toLowerCase()));
  return { type, question, options, correct: options.indexOf(correct), explanation };
}

// Easy answer = one short, simple key word/term that sits inside the line
function easyTerm(s, ctx) {
  const ts = extractTerms(s, ctx).filter(t =>
    t.score >= 2 && t.text.length >= 3 && t.text.length <= 18 && t.text.split(/\s+/).length <= 2 &&
    !/^O\(/.test(t.text) && termRe(t.text).test(s) && s.search(termRe(t.text)) > 3);
  if (!ts.length) return null;
  return ts.sort((a, b) => (b.score - a.score) + (Math.random() - .5) * 2)[0];
}

function makeCloze(s, ctx, avoid, usedAns) {
  if (s.split(/\s+/).length > 26) return null;
  const t = easyTerm(s, ctx); if (!t || usedAns.has(t.text.toLowerCase())) return null;
  const q = buildQ("Fill in the blank", "Choose the correct word to complete the line:\n" + s.replace(termRe(t.text, 1), (a, p) => p + "_____"),
    t.text, pickDistractors(t.text, ctx, s, avoid), "From your notes: " + s, avoid);
  if (q) usedAns.add(t.text.toLowerCase());
  return q;
}

function makeDef(d, ctx, avoid, usedAns) {
  if (usedAns.has(d.term.toLowerCase())) return null;
  const f = x => capFirst(short(trimEnd(x.def), 90));
  const others = shuffle(ctx.defs.filter(x => x.term.toLowerCase() !== d.term.toLowerCase())).map(f);
  // if the note has too few other definitions, borrow short lines from other sentences
  const borrowed = shuffle(ctx.sentences.filter(x => x !== d.sentence && x.length < 110)).map(x => short(trimEnd(x), 90));
  const q = buildQ("Definition", "Which of the following best describes " + d.term + "?", f(d),
    others.filter(o => !avoid.has(o.toLowerCase())).concat(borrowed.filter(o => !avoid.has(o.toLowerCase())), others), "From your notes: " + d.sentence, avoid);
  if (q) usedAns.add(d.term.toLowerCase());
  return q;
}

function makeTerm(d, ctx, avoid, usedAns) {
  if (usedAns.has(d.term.toLowerCase())) return null;
  const ds = pickDistractors(d.term, ctx, d.sentence, avoid).map(capFirst);
  const q = buildQ("Identify the term", "Which term is described below?\n“" + capFirst(short(trimEnd(d.def), 110)) + "”", capFirst(d.term), ds, "From your notes: " + d.sentence, avoid);
  if (q) usedAns.add(d.term.toLowerCase());
  return q;
}

function buildQuiz(note, maxQ) {
  maxQ = maxQ || 5;
  const ctx = analyze(note.content);
  if (ctx.sentences.length < 3) return [];
  const qs = [], avoid = new Set(), usedAns = new Set(), usedSent = new Set(), seenQ = new Set();
  const push = q => { if (q && !seenQ.has(q.question)) { qs.push(q); seenQ.add(q.question); return true; } return false; };

  // 1) up to 2 definition-style questions, kept easy
  let defCount = 0;
  for (const d of shuffle(ctx.defs)) {
    if (qs.length >= maxQ || defCount >= 2) break;
    const q = defCount % 2 === 0 ? makeDef(d, ctx, avoid, usedAns) : makeTerm(d, ctx, avoid, usedAns);
    if (push(q)) { usedSent.add(d.sentence); defCount++; }
  }
  // 2) fill the rest with simple fill-in-the-blank lines (shorter lines first = easier)
  const rest = shuffle(ctx.sentences.filter(s => !usedSent.has(s))).sort((a, b) => (a.length > 140) - (b.length > 140));
  for (const s of rest) {
    if (qs.length >= maxQ) break;
    if (push(makeCloze(s, ctx, avoid, usedAns))) usedSent.add(s);
  }
  return shuffle(qs);
}

// ---------- quiz UI ----------
function startQuiz(note) {
  const qs = buildQuiz(note, 5);
  if (!qs.length) { toast("This note needs a few full sentences (5+ words each) to make a quiz."); return; }
  state.quiz = { note, qs, i: 0, score: 0, missed: [] };
  renderQuiz(); openModal("quizModal");
}
function renderQuiz() {
  const box = $("#quizContent"), z = state.quiz; if (!box || !z) return;
  if (z.i >= z.qs.length) {
    const pct = Math.round(z.score / z.qs.length * 100);
    box.innerHTML = `<div class="question-block"><h2>Quiz finished</h2><div class="score-big">${z.score}/${z.qs.length}</div><p>${pct}% correct. ${pct === 100 ? "Perfect!" : pct >= 60 ? "Good work." : "Keep revising."}</p>` +
      (z.missed.length ? "<p><strong>Revise these:</strong></p>" : "") +
      z.missed.map(m => `<div class="review-item"><strong>${esc(m.question.split("\n").pop())}</strong><br>Answer: ${esc(m.options[m.correct])}</div>`).join("") +
      `<button class="btn btn-secondary full" id="retryQuiz" style="margin:14px 0 8px">New questions from this note</button><button class="btn btn-primary full" id="doneQuiz">Done</button></div>`;
    $("#retryQuiz").onclick = () => startQuiz(z.note); $("#doneQuiz").onclick = () => closeModal("quizModal"); return;
  }
  const q = z.qs[z.i];
  box.innerHTML = `<div class="question-block"><div class="quiz-meta"><span class="quiz-type">${esc(q.type)}</span><span>Question ${z.i + 1} of ${z.qs.length}</span></div>` +
    `<div class="quiz-bar"><span style="width:${z.i / z.qs.length * 100}%"></span></div><h3 class="quiz-statement">${esc(q.question)}</h3>` +
    q.options.map((o, k) => `<button class="quiz-answer" data-i="${k}">${String.fromCharCode(65 + k)}. ${esc(o)}</button>`).join("") + `<div id="quizFeedback"></div></div>`;
  $$(".quiz-answer").forEach(b => b.onclick = () => {
    const ok = +b.dataset.i === q.correct;
    $$(".quiz-answer").forEach(x => { x.disabled = true; if (+x.dataset.i === q.correct) x.classList.add("correct"); });
    if (!ok) b.classList.add("wrong");
    if (ok) z.score++; else z.missed.push(q);
    $("#quizFeedback").innerHTML = `<div class="quiz-feedback"><strong>${ok ? "Correct." : "Not quite."}</strong> ${esc(q.explanation)}</div><button class="btn btn-primary full" id="nextQ" style="margin-top:12px">${z.i + 1 < z.qs.length ? "Next question" : "See results"}</button>`;
    $("#nextQ").onclick = () => { z.i++; renderQuiz(); };
  });
}
const previewCache = {};
function updatePreview() {
  const title = $("#previewQuestion"), btns = $$("#quizPreview .quiz-options button"); if (!title) return;
  const note = state.notes.find(n => n.quizEnabled);
  let q = null;
  if (note) { const key = note.id + note.content.length; if (!(key in previewCache)) previewCache[key] = buildQuiz(note, 1)[0] || null; q = previewCache[key]; }
  title.textContent = q ? q.question : note ? "Open a note and tap “Take quiz” to start." : "Create a note to generate your first quiz.";
  btns.forEach((b, i) => { b.style.display = q && i >= q.options.length ? "none" : ""; b.textContent = String.fromCharCode(65 + i) + ". " + (q ? q.options[i] || "" : ["Option one", "Option two", "Option three", "Option four"][i]); });
}

// ---------- notes ----------
function updateStats() {
  const n = state.notes, set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  set("#noteCount", n.length); set("#sharedCount", n.filter(x => x.visibility === "shared").length);
  set("#privateCount", n.filter(x => x.visibility === "private").length); set("#quizCount", n.filter(x => x.quizEnabled).length);
}
function getFilteredNotes() {
  return state.notes.filter(n => {
    if (!`${n.title} ${n.subject} ${n.content}`.toLowerCase().includes(state.search.toLowerCase())) return false;
    if (state.filter === "shared" || state.filter === "private") return n.visibility === state.filter;
    if (state.filter === "pdf") return n.source === "pdf" || n.source === "paste";
    return true;
  });
}
function renderNotes() {
  const grid = $("#noteGrid"), empty = $("#emptyState"); if (!grid || !empty) return;
  const notes = getFilteredNotes(); grid.innerHTML = "";
  notes.forEach(n => {
    const card = document.createElement("article"); card.className = "note-card glass";
    card.innerHTML = `<div class="card-top"><span class="tag">${n.source === "pdf" ? "PDF" : n.source === "paste" ? "PASTED" : n.mode === "exam" ? "EXAM" : "NOTE"}</span><span class="lock">${n.visibility === "private" ? "🔒 Private" : "↗ Shared"}</span></div>` +
      `<h3>${esc(n.title)}</h3><p>${esc(n.content)}</p><div class="card-bottom"><span>${esc(n.subject || "General")} · ${n.mode === "exam" ? "Exam-friendly" : "Study notes"}</span><span class="contributors"><span class="mini-avatar">PM</span>${n.visibility === "shared" ? "+1" : "You"}</span></div>`;
    card.onclick = () => viewNote(n.id); grid.appendChild(card);
  });
  grid.style.display = notes.length ? "grid" : "none"; empty.style.display = notes.length ? "none" : "block";
  updateStats(); updatePreview();
}
function viewNote(id) {
  const n = state.notes.find(x => x.id === id), v = $("#viewerContent"); if (!n || !v) return;
  v.innerHTML = `<span class="eyebrow">NOTE</span><h2>${esc(n.title)}</h2><div class="note-meta"><span class="tag">${n.visibility === "private" ? "Private" : "Shared"}</span><span class="tag">${n.mode === "exam" ? "Exam-friendly" : "Study notes"}</span></div>` +
    `<div class="viewer-content"><pre>${esc(n.content)}</pre></div><button class="btn btn-primary full" id="takeQuizButton"${n.quizEnabled ? "" : " disabled"}>${n.quizEnabled ? "Take quiz from this note" : "Quiz disabled"}</button>` +
    `<button class="btn btn-secondary full" id="deleteNoteButton" style="margin-top:10px">Delete note</button>`;
  openModal("noteViewer");
  $("#takeQuizButton").onclick = () => { closeModal("noteViewer"); startQuiz(n); };
  $("#deleteNoteButton").onclick = () => { if (confirm("Delete this note?")) { state.notes = state.notes.filter(x => x.id !== id); saveNotes(); renderNotes(); closeModal("noteViewer"); } };
}
function setupCreateNote() {
  ["#newNoteButton", "#newNoteHero", "#emptyCreate"].forEach(s => { const b = $(s); if (b) b.addEventListener("click", e => { e.preventDefault(); openModal("noteModal"); }); });
  const form = $("#noteForm"); if (!form) return;
  form.addEventListener("submit", e => {
    e.preventDefault();
    const f = new FormData(form), title = String(f.get("title") || "").trim(), content = String(f.get("content") || "").trim();
    if (!title || !content) { toast("Please enter a title and some content."); return; }
    state.notes.unshift({ id: uid(), title, subject: String(f.get("subject") || "").trim(), content, visibility: f.get("visibility") || "shared", mode: f.get("mode") || "study", quizEnabled: f.get("quizEnabled") === "on", source: "manual", createdAt: new Date().toISOString() });
    saveNotes(); renderNotes(); form.reset(); closeModal("noteModal"); toast("Note created.");
  });
}
function setupSearchFilters() {
  const s = $("#searchInput"); if (s) s.addEventListener("input", e => { state.search = e.target.value; renderNotes(); });
  $$(".filter").forEach(b => b.addEventListener("click", () => { $$(".filter").forEach(x => x.classList.remove("active")); b.classList.add("active"); state.filter = b.dataset.filter; renderNotes(); }));
  const q = $("#openQuizButton");
  if (q) q.addEventListener("click", () => { const list = state.notes.filter(n => n.quizEnabled); if (!list.length) { toast("Create a note with quizzes enabled first."); return; } startQuiz(list[rand(list.length)]); });
}

// ---------- PASTE TEXT -> NOTES (replaces file upload) ----------
function reflow(raw) {
  const lines = raw.split(/\n/).map(l => l.trim()).filter(Boolean), out = []; let buf = "";
  const heading = l => l.length < 70 && l.split(" ").length <= 9 && !/[.!?:;,]$/.test(l) && /^[A-Z0-9]/.test(l);
  lines.forEach(line => {
    if (!buf) { buf = line; return; }
    if (/^([•\-*–]|\d+[.)]\s)/.test(line) || /[.!?:]$/.test(buf) || (heading(buf) && /^[A-Z0-9]/.test(line))) { out.push(buf); buf = line; } else buf += " " + line;
  });
  if (buf) out.push(buf);
  return out.join("\n");
}
function createStudyNotes(text) {
  const sents = analyze(text).sentences.slice(0, 60);
  if (!sents.length) return text.slice(0, 4000);
  const parts = [];
  for (let i = 0; i < sents.length; i += 5) {
    const g = sents.slice(i, i + 5), local = {};
    g.forEach(s => tok(s).forEach(w => { if (w.length > 3 && !STOP.has(w)) local[w] = (local[w] || 0) + 1; }));
    const best = Object.entries(local).sort((a, b) => b[1] - a[1])[0];
    parts.push(`Topic ${parts.length + 1} — ${best ? capFirst(best[0]) : "Overview"}\n${g.join(" ")}`);
  }
  return parts.join("\n\n");
}
function createExamNotes(text) {
  const ctx = analyze(text); if (!ctx.sentences.length) return text.slice(0, 4000);
  const KEY = /definition|important|key|types?|steps?|advantages?|disadvantages?|complexity|algorithm|process|principle|feature|function|difference|purpose|method|classification/i;
  const scored = ctx.sentences.map((s, i) => {
    const w = tok(s).filter(x => x.length > 2 && !STOP.has(x));
    let sc = w.reduce((a, x) => a + (ctx.freq[x] || 0), 0) / Math.sqrt(w.length || 1);
    if (KEY.test(s)) sc *= 1.3; if (parseDef(s)) sc *= 1.4; if (/\d/.test(s)) sc *= 1.1;
    return { s, i, sc };
  });
  const top = scored.sort((a, b) => b.sc - a.sc).slice(0, Math.min(20, Math.max(6, Math.round(scored.length * .4)))).sort((a, b) => a.i - b.i);
  const terms = ctx.pool.slice().sort((a, b) => b.score - a.score).slice(0, 10).map(t => t.text);
  return "• " + top.map(x => x.s).join("\n• ") + (terms.length ? "\n\nKey terms: " + terms.join(", ") : "");
}
function setupPaste() {
  const btn = $("#pasteConvert"), ta = $("#pasteText"), ti = $("#pasteTitle"); if (!btn || !ta) return;
  btn.addEventListener("click", () => {
    const raw = ta.value.trim();
    if (raw.length < 60) { toast("Paste a few lines of text first (copy it from your PDF or book)."); return; }
    const text = reflow(raw);
    const title = (ti && ti.value.trim()) || short(text.split("\n")[0], 60);
    const base = { subject: "Pasted text", visibility: "private", quizEnabled: true, source: "paste", createdAt: new Date().toISOString() };
    state.notes.unshift({ ...base, id: uid(), title: title + " — Exam-friendly", mode: "exam", content: createExamNotes(text) },
                        { ...base, id: uid(), title, mode: "study", content: createStudyNotes(text) });
    saveNotes(); renderNotes(); ta.value = ""; if (ti) ti.value = "";
    toast("Notes created from your text!");
    const n = document.getElementById("notes"); if (n) n.scrollIntoView({ behavior: "smooth" });
  });
}

// ---------- PDF UPLOAD (works from file:// too) ----------
const PDF_SRC = [
  ["https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js", "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js"],
  ["https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"]
];
const loadScript = src => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Could not load " + src)); document.head.appendChild(s); });
async function loadPDFLibrary() {
  if (window.pdfjsLib) return window.pdfjsLib;
  let last;
  for (const [lib, worker] of PDF_SRC) {
    try {
      await loadScript(lib);
      if (!window.pdfjsLib) throw new Error("pdfjsLib missing");
      // Workers cannot load cross-origin from file:// pages, so wrap the worker code in a Blob URL.
      const code = await (await fetch(worker)).text();
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
      return window.pdfjsLib;
    } catch (e) { last = e; window.pdfjsLib = undefined; }
  }
  throw new Error("PDF reader failed to load. Check your internet connection. (" + (last && last.message) + ")");
}
async function extractPDFText(pdf) {
  const pages = [];
  for (let p = 1; p <= Math.min(pdf.numPages, 100); p++) {
    const content = await (await pdf.getPage(p)).getTextContent(), lines = []; let cur = [], lastY = null;
    for (const it of content.items) {
      const y = it.transform ? it.transform[5] : 0;
      if (lastY !== null && Math.abs(y - lastY) > 4) { lines.push(cur.join(" ")); cur = []; }
      cur.push(it.str); lastY = y;
    }
    lines.push(cur.join(" "));
    pages.push(lines.map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n"));
  }
  return pages.join("\n");
}
async function processPDF(file) {
  if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) { toast("Please select a PDF file."); return; }
  toast("Reading your PDF...");
  try {
    const pdfjs = await loadPDFLibrary();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const raw = await extractPDFText(pdf);
    if (raw.replace(/\s/g, "").length < 40) throw new Error("No selectable text found. This looks like a scanned PDF.");
    const text = reflow(raw);
    const first = raw.split("\n").map(l => l.trim()).find(l => l.length >= 4 && l.length <= 90 && l.split(" ").length <= 12 && /[A-Za-z]{3}/.test(l));
    const title = first || file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ");
    const base = { subject: "Imported PDF", visibility: "private", quizEnabled: true, source: "pdf", createdAt: new Date().toISOString() };
    state.notes.unshift({ ...base, id: uid(), title: title + " — Exam-friendly", mode: "exam", content: createExamNotes(text) }, { ...base, id: uid(), title, mode: "study", content: createStudyNotes(text) });
    saveNotes(); renderNotes(); toast("PDF converted into notes!");
    const n = document.getElementById("notes"); if (n) n.scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    console.error("PDF ERROR:", err);
    toast("Could not read this PDF: " + (err && err.message ? err.message : err));
  }
}
// ----- Word (.docx) and text files -----
async function loadJSZip() {
  if (window.JSZip) return window.JSZip;
  const urls = ["https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js", "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"];
  for (const u of urls) { try { await loadScript(u); if (window.JSZip) return window.JSZip; } catch (e) {} }
  throw new Error("Could not load the Word reader. Check your internet connection.");
}
async function extractDocxText(file) {
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const f = zip.file("word/document.xml");
  if (!f) throw new Error("This is not a valid .docx file (old .doc files are not supported — save as .docx).");
  const xml = await f.async("string");
  const dec = s => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  const paras = xml.split(/<\/w:p>/).map(p =>
    dec(p.replace(/<w:tab\/>/g, " ").replace(/<w:br\/>/g, " ").replace(/<(?!\/?w:t[ >])[^>]*>/g, "").replace(/<[^>]+>/g, "")).trim()
  ).filter(Boolean);
  return paras.join("\n");
}

// ----- OCR for scanned PDFs -----
async function ocrPDF(pdf) {
  if (!window.Tesseract) {
    const urls = ["https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js", "https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js"];
    let ok = false;
    for (const u of urls) { try { await loadScript(u); if (window.Tesseract) { ok = true; break; } } catch (e) {} }
    if (!ok) throw new Error("Could not load the OCR reader. Check your internet connection.");
  }
  const worker = await Tesseract.createWorker("eng");
  const total = Math.min(pdf.numPages, 15), out = [];
  try {
    for (let p = 1; p <= total; p++) {
      toast("Scanned PDF — reading page " + p + " of " + total + "...");
      const page = await pdf.getPage(p), vp = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas"); canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
      const r = await worker.recognize(canvas);
      out.push(r.data.text);
    }
  } finally { await worker.terminate(); }
  return out.join("\n");
}

// ----- one entry point for every file type -----
async function processFile(file) {
  const name = file.name || "", ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1];
  const lower = (ext || "").toLowerCase();
  if (!["pdf", "docx", "txt", "md"].includes(lower)) {
    toast(lower === "doc" ? "Old .doc files are not supported. Open it in Word and save as .docx." : "Please choose a PDF, Word (.docx) or .txt file.");
    return;
  }
  toast("Reading " + name + "...");
  try {
    let raw = "";
    if (lower === "pdf") {
      const pdfjs = await loadPDFLibrary();
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      raw = await extractPDFText(pdf);
      if (raw.replace(/\s/g, "").length < 40) raw = await ocrPDF(pdf);   // scanned PDF -> OCR
    } else if (lower === "docx") {
      raw = await extractDocxText(file);
    } else {
      raw = await file.text();
    }
    if (raw.replace(/\s/g, "").length < 40) throw new Error("Could not find readable text in this file.");
    const text = reflow(raw);
    const first = raw.split("\n").map(l => l.trim()).find(l => l.length >= 4 && l.length <= 90 && l.split(" ").length <= 12 && /[A-Za-z]{3}/.test(l));
    const title = first || name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ");
    const base = { subject: "Imported file", visibility: "private", quizEnabled: true, source: "pdf", createdAt: new Date().toISOString() };
    state.notes.unshift({ ...base, id: uid(), title: title + " — Exam-friendly", mode: "exam", content: createExamNotes(text) }, { ...base, id: uid(), title, mode: "study", content: createStudyNotes(text) });
    saveNotes(); renderNotes(); toast("File converted into notes!");
    const n = document.getElementById("notes"); if (n) n.scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    console.error("FILE ERROR:", err);
    toast("Could not read this file: " + (err && err.message ? err.message : err));
  }
}
function setupPDF() {
  const input = $("#pdfInput"); if (!input) return;
  input.accept = ".pdf,.docx,.txt,.md,application/pdf";   // allow Word + text in the file picker
  input.addEventListener("change", async e => { const f = e.target.files[0]; if (f) await processFile(f); input.value = ""; });
  const dz = $(".dropzone");
  if (dz) { dz.addEventListener("dragover", e => e.preventDefault()); dz.addEventListener("drop", e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) processFile(f); }); }
}

// ---------- start ----------
function init() { setupCreateNote(); setupSearchFilters(); setupPDF(); setupPaste(); renderNotes(); console.log("StudySync loaded successfully."); }
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
