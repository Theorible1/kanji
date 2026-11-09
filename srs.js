// Logique de mémoire de l'appli kanji (sans interface) : paliers, révisions, réglage, absences.
// Toutes les fonctions reçoivent "maintenant" (ms) pour pouvoir être testées en simulant le temps.
"use strict";

const H = 3600 * 1000, J = 24 * H;
const SRS = {
  ACQUIS: 11,
  // délai avant la révision suivante quand la tuile est AU palier p (après une bonne réponse ou un placement)
  INTERVALLE: { 1: 4 * H, 2: 8 * H, 3: J, 4: 2 * J, 5: 7 * J, 6: 14 * J, 7: 30 * J, 8: 120 * J, 9: 30 * J, 10: 30 * J },
  CHRONO: { 9: 30, 10: 12 },                 // secondes pour répondre aux paliers chronométrés
  NOMS: { 0: "À apprendre", 1: "Apprenti 1", 2: "Apprenti 2", 3: "Apprenti 3", 4: "Apprenti 4",
          5: "Confirmé 1", 6: "Confirmé 2", 7: "Maîtrisé", 8: "Expert", 9: "Chrono 30 s", 10: "Chrono 12 s", 11: "Acquis" },
  // réglage : réponse juste + « tu le connaissais comment ? »
  CONFIANCE: { tres_peu: 0, un_peu: 2, moyen: 3, bien: 5, tres_bien: 7 },
  RETOMBEE_ACQUIS: J,                        // onglet Acquis : une erreur -> palier 10, revu 1 jour plus tard
};

function idTuile(kanji, type) { return kanji + ":" + type; }       // type : "sens" | "lecture"

function etatVide() { return { version: 1, tuiles: {}, journal: [] }; }

// une tuile : { palier, due, absencePenalisee, statut }
// statut : absent = jamais testée ; "a_apprendre" = ratée au test de réglage ; "placee" = sur l'échelle (palier >= 1)
function tuile(etat, id) { return etat.tuiles[id]; }

function placer(etat, id, palier, maintenant) {
  if (palier <= 0) {
    etat.tuiles[id] = { statut: "a_apprendre", palier: 0, due: null, absencePenalisee: false };
  } else {
    etat.tuiles[id] = { statut: "placee", palier, due: palier >= SRS.ACQUIS ? null : maintenant + SRS.INTERVALLE[palier],
                        absencePenalisee: false };
  }
}

// tuile apprise après la fiche : entre au palier 1
function apprendre(etat, id, maintenant) { placer(etat, id, 1, maintenant); }

// absence : retard > 2 x l'intervalle -> descend d'1 palier (une seule fois par retard)
function appliquerAbsences(etat, maintenant) {
  let n = 0;
  for (const t of Object.values(etat.tuiles)) {
    if (t.statut !== "placee" || t.palier < 1 || t.palier >= SRS.ACQUIS || t.absencePenalisee) continue;
    const retard = maintenant - t.due;
    if (retard > 2 * SRS.INTERVALLE[t.palier]) {
      t.palier = Math.max(1, t.palier - 1);
      t.absencePenalisee = true;
      n++;
    }
  }
  return n;
}

function revisionsDues(etat, maintenant) {
  return Object.entries(etat.tuiles)
    .filter(([, t]) => t.statut === "placee" && t.palier >= 1 && t.palier < SRS.ACQUIS && t.due <= maintenant)
    .sort((a, b) => a[1].due - b[1].due)
    .map(([id]) => id);
}

function prochaineRevision(etat) {
  let min = null;
  for (const t of Object.values(etat.tuiles))
    if (t.statut === "placee" && t.palier < SRS.ACQUIS && (min === null || t.due < min)) min = t.due;
  return min;
}

// réponse à une révision. juste : bool. Retourne le nouveau palier.
function repondre(etat, id, juste, maintenant) {
  const t = etat.tuiles[id];
  const avant = t.palier;
  if (juste) t.palier = Math.min(SRS.ACQUIS, t.palier + 1);
  else t.palier = t.palier >= 9 ? t.palier - 1 : Math.max(1, t.palier - 2);
  t.due = t.palier >= SRS.ACQUIS ? null : maintenant + SRS.INTERVALLE[t.palier];
  t.absencePenalisee = false;
  etat.journal.push([maintenant, id, juste ? 1 : 0, avant, t.palier]);
  if (etat.journal.length > 5000) etat.journal.splice(0, etat.journal.length - 5000);
  return t.palier;
}

// onglet Acquis : erreur -> palier 10, revu après RETOMBEE_ACQUIS
function repondreAcquis(etat, id, juste, maintenant) {
  const t = etat.tuiles[id];
  if (!juste) {
    t.palier = 10;
    t.due = maintenant + SRS.RETOMBEE_ACQUIS;
    t.absencePenalisee = false;
  }
  etat.journal.push([maintenant, id, juste ? 1 : 0, SRS.ACQUIS, t.palier, "acquis"]);
  return t.palier;
}

// kanji suivant pour une leçon : premier kanji (dans l'ordre) dont une tuile n'est pas placée
function kanjiSuivant(etat, listeKanji) {
  for (const k of listeKanji)
    for (const type of ["sens", "lecture"]) {
      const t = etat.tuiles[idTuile(k, type)];
      if (!t || t.statut !== "placee") return k;
    }
  return null;
}

// kanji suivant pour le test de réglage : premier kanji dont une tuile n'a jamais été testée
function kanjiSuivantReglage(etat, listeKanji) {
  for (const k of listeKanji)
    for (const type of ["sens", "lecture"])
      if (!etat.tuiles[idTuile(k, type)]) return k;
  return null;
}

function compter(etat, listeKanji) {
  const c = { jamais: 0, a_apprendre: 0, paliers: {} };
  for (let p = 1; p <= SRS.ACQUIS; p++) c.paliers[p] = 0;
  for (const k of listeKanji)
    for (const type of ["sens", "lecture"]) {
      const t = etat.tuiles[idTuile(k, type)];
      if (!t) c.jamais++;
      else if (t.statut !== "placee") c.a_apprendre++;
      else c.paliers[t.palier]++;
    }
  return c;
}

// ---------- génération des QCM ----------
function melanger(a, alea = Math.random) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(alea() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const sansParentheses = (s) => s.replace(/[()]/g, "");
const radical = (s) => s.replace(/\(.*\)/, "");

const VOISEE = { "か": "が", "き": "ぎ", "く": "ぐ", "け": "げ", "こ": "ご", "さ": "ざ", "し": "じ", "す": "ず", "せ": "ぜ", "そ": "ぞ",
  "た": "だ", "ち": "ぢ", "つ": "づ", "て": "で", "と": "ど", "は": "ば", "ひ": "び", "ふ": "ぶ", "へ": "べ", "ほ": "ぼ" };
const SOURDE = Object.fromEntries(Object.entries(VOISEE).map(([a, b]) => [b, a]));
const RANGEE_O = "おこごそぞとどのほぼぽもよろょ", RANGEE_U = "うくぐすずつづぬふぶぷむゆるゅ";

// pièges réalistes à partir d'une lecture (voisement, voyelle longue, petit っ, ゃゅょ)
function pieges(lecture) {
  const okuri = (lecture.match(/\(.*\)/) || [""])[0];
  const r = radical(lecture);
  const res = new Set();
  const c0 = r[0];
  if (VOISEE[c0]) res.add(VOISEE[c0] + r.slice(1));
  if (SOURDE[c0]) res.add(SOURDE[c0] + r.slice(1));
  const fin = r[r.length - 1];
  if (r.length >= 2 && (fin === "う" || fin === "い") && (RANGEE_O + RANGEE_U + "えけげせぜてでねへべぺめれ").includes(r[r.length - 2]))
    res.add(r.slice(0, -1));                                   // こう -> こ
  else if (RANGEE_O.includes(fin) || RANGEE_U.includes(fin)) res.add(r + "う");    // こ -> こう
  if (r.includes("っ")) res.add(r.replace("っ", ""));
  // pas de piège « がく -> がっ » : c'est une vraie forme dans les mots (学校 がっこう, 一緒 いっしょ)
  const petits = { "ゃ": "ゅ", "ゅ": "ょ", "ょ": "ゅ" };
  for (const [a, b] of Object.entries(petits)) if (r.includes(a)) { res.add(r.replace(a, b)); break; }
  return [...res].filter((x) => x && x !== r).map((x) => x + okuri);
}

// toutes les lectures valables du kanji, normalisées, pour ne jamais proposer une autre bonne réponse comme piège
function lecturesInterdites(fiche) {
  const s = new Set();
  for (const l of fiche.toutes) { s.add(l); }
  for (const l of fiche.lectures) { s.add(sansParentheses(l)); s.add(radical(l)); }
  return s;
}

function qcmLecture(fiche, toutesFiches, alea = Math.random) {
  const bonne = fiche.lectures[Math.floor(alea() * fiche.lectures.length)];
  const interdit = lecturesInterdites(fiche);
  // jamais une lecture valable, ni sa forme raccourcie en っ (がっ, いっ) qui existe dans les mots composés
  const contracte = new Set([...interdit].filter((l) => l.length >= 2 && "くつきち".includes(l[l.length - 1])).map((l) => l.slice(0, -1) + "っ"));
  const ok = (x) => !interdit.has(sansParentheses(x)) && !interdit.has(radical(x)) && !contracte.has(radical(x)) && x !== bonne;
  const choix = new Set();
  for (const p of melanger(pieges(bonne), alea)) { if (choix.size >= 2) break; if (ok(p)) choix.add(p); }
  const autres = melanger(toutesFiches.filter((f) => f.kanji !== fiche.kanji).flatMap((f) => f.lectures), alea);
  // de préférence même forme (avec ou sans okurigana entre parenthèses), puis longueur proche : la forme ne trahit pas la réponse
  const paren = (x) => x.includes("(");
  const ecart = (x) => (paren(x) !== paren(bonne) ? 100 : 0) + Math.abs(radical(x).length - radical(bonne).length);
  autres.sort((a, b) => ecart(a) - ecart(b));
  for (const a of autres) { if (choix.size >= 3) break; if (ok(a) && !choix.has(a)) choix.add(a); }
  return { bonne, options: melanger([bonne, ...choix], alea) };
}

function qcmSens(fiche, toutesFiches, alea = Math.random) {
  const bonne = fiche.sens;
  const mots = new Set(bonne.split(/[ ,]+/));
  const autres = melanger(toutesFiches.filter((f) => f.kanji !== fiche.kanji), alea)
    .map((f) => f.sens).filter((s) => s !== bonne && !s.split(/[ ,]+/).some((m) => m.length > 3 && mots.has(m)));
  const choix = [...new Set(autres)].slice(0, 3);
  return { bonne, options: melanger([bonne, ...choix], alea) };
}

const SRSLib = { SRS, H, J, idTuile, etatVide, tuile, placer, apprendre, appliquerAbsences, revisionsDues, prochaineRevision,
  repondre, repondreAcquis, kanjiSuivant, kanjiSuivantReglage, compter, melanger, pieges, qcmLecture, qcmSens };
if (typeof window !== "undefined") window.SRSLib = SRSLib;
