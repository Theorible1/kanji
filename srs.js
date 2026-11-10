// Logique de l'appli kanji (sans interface) : paliers, révisions, nouvelles cartes, profil, prévision.
// Toutes les fonctions reçoivent "maintenant" (ms) pour pouvoir être testées en simulant le temps.
"use strict";

const H = 3600 * 1000, J = 24 * H;
const SRS = {
  ACQUIS: 11,
  CONFIRME: 5,                               // palier qui débloque les mots (kanji « Confirmé 1 »)
  // délai avant la révision suivante quand la carte est AU palier p
  INTERVALLE: { 1: 4 * H, 2: 8 * H, 3: J, 4: 2 * J, 5: 7 * J, 6: 14 * J, 7: 30 * J, 8: 120 * J, 9: 30 * J, 10: 30 * J },
  CHRONO: { 9: 30, 10: 12 },                 // secondes pour répondre aux paliers chronométrés
  NOMS: { 0: "Nouvelle", 1: "Apprenti 1", 2: "Apprenti 2", 3: "Apprenti 3", 4: "Apprenti 4",
          5: "Confirmé 1", 6: "Confirmé 2", 7: "Maîtrisé", 8: "Expert", 9: "Chrono 30 s", 10: "Chrono 12 s", 11: "Acquis" },
  // nouvelle carte réussie + « tu le connaissais comment ? »
  CONFIANCE: { tres_peu: 1, un_peu: 2, moyen: 3, bien: 5, tres_bien: 7 },
  RETOMBEE_ACQUIS: J,                        // onglet Acquis : erreur -> palier 10, revue 1 jour plus tard
  PAUSE_MAX: 30,                             // s : au-delà, on considère que le téléphone a été posé
  OBJECTIF_DEFAUT: 10,                       // min de révision par jour
  JOURS_PREVISION: 5,
};

function etatVide() { return { version: 2, tuiles: {}, journal: [], profil: { reponses: [], jours: {} }, historique: {}, reglages: { objectif: SRS.OBJECTIF_DEFAUT } }; }

// version 1 (kanji seulement, ids « 日:sens ») -> version 2 (ids « k:日:sens »)
function migrer(e) {
  if (!e || !e.tuiles) return etatVide();
  const v = etatVide();
  if (!e.version || e.version < 2) {
    for (const [id, t] of Object.entries(e.tuiles)) {
      if (t.statut !== "placee") continue;                      // les « à apprendre » repassent en nouvelles cartes
      v.tuiles["k:" + id] = t;
    }
    v.journal = e.journal || [];
    return v;
  }
  return Object.assign(v, e, { profil: Object.assign(v.profil, e.profil || {}), reglages: Object.assign(v.reglages, e.reglages || {}) });
}

function placer(etat, id, palier, maintenant) {
  etat.tuiles[id] = { statut: "placee", palier, due: palier >= SRS.ACQUIS ? null : maintenant + SRS.INTERVALLE[palier], absencePenalisee: false };
}

function introduite(etat, id) { const t = etat.tuiles[id]; return !!t && t.statut === "placee"; }

// absence : retard > 2 x l'intervalle -> descend d'1 palier (une seule fois par retard)
function appliquerAbsences(etat, maintenant) {
  let n = 0;
  for (const t of Object.values(etat.tuiles)) {
    if (t.statut !== "placee" || t.pause || t.palier < 1 || t.palier >= SRS.ACQUIS || t.absencePenalisee) continue;
    if (maintenant - t.due > 2 * SRS.INTERVALLE[t.palier]) { t.palier = Math.max(1, t.palier - 1); t.absencePenalisee = true; n++; }
  }
  return n;
}

// ordre : les cartes les mieux connues d'abord (donc les chrono en premier), puis les plus anciennes
function revisionsDues(etat, maintenant) {
  return Object.entries(etat.tuiles)
    .filter(([, t]) => t.statut === "placee" && !t.pause && t.palier >= 1 && t.palier < SRS.ACQUIS && t.due <= maintenant)
    .sort((a, b) => b[1].palier - a[1].palier || a[1].due - b[1].due).map(([id]) => id);
}

// cartes hors de l'objectif : mises en pause avec leur progression, puis reprises là où elles en étaient
function pauser(etat, ids, maintenant) {
  let n = 0;
  for (const id of ids) {
    const t = etat.tuiles[id];
    if (t && t.statut === "placee" && !t.pause && t.palier < SRS.ACQUIS) { t.pause = maintenant; n++; }
  }
  return n;
}
function reprendre(etat, ids, maintenant) {
  let n = 0;
  for (const id of ids) {
    const t = etat.tuiles[id];
    if (t && t.pause) { if (t.due !== null) t.due += maintenant - t.pause; delete t.pause; n++; }
  }
  return n;
}

function prochaineRevision(etat) {
  let min = null;
  for (const t of Object.values(etat.tuiles)) if (t.statut === "placee" && !t.pause && t.palier < SRS.ACQUIS && (min === null || t.due < min)) min = t.due;
  return min;
}

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

function repondreAcquis(etat, id, juste, maintenant) {
  const t = etat.tuiles[id];
  if (!juste) { t.palier = 10; t.due = maintenant + SRS.RETOMBEE_ACQUIS; t.absencePenalisee = false; }
  etat.journal.push([maintenant, id, juste ? 1 : 0, SRS.ACQUIS, t.palier, "acquis"]);
  return t.palier;
}

// ---------- nouvelles cartes : kanji seuls, puis mots « combo », puis mots « mixtes » ----------
// cartes : liste ordonnée de { id, phase: "kanji"|"combo"|"mixte", prerequis: [kanji à connaître] }
function kanjiConfirme(etat, k) {
  return ["sens", "lecture"].every((ty) => { const t = etat.tuiles[`k:${k}:${ty}`]; return t && t.statut === "placee" && t.palier >= SRS.CONFIRME; });
}
function prochaineNouvelle(etat, cartes, exclues) {
  for (const phase of ["kanji", "combo", "mixte"]) {
    const restantes = cartes.filter((c) => c.phase === phase && !introduite(etat, c.id) && !(exclues && exclues.has(c.id)));
    if (!restantes.length) continue;
    const prete = restantes.find((c) => c.prerequis.every((k) => kanjiConfirme(etat, k)));
    return prete ? { carte: prete, phase } : { carte: null, phase, attente: restantes.length };
  }
  return { carte: null, phase: "fini" };
}

// ---------- profil : réussite et temps par carte ----------
function enregistrerReponse(etat, juste, secondes, maintenant) {
  const p = etat.profil;
  p.reponses.push([maintenant, juste ? 1 : 0, Math.round(secondes * 10) / 10]);
  if (p.reponses.length > 300) p.reponses.splice(0, p.reponses.length - 300);
  const jour = cleJour(maintenant);
  p.jours[jour] = Math.round(((p.jours[jour] || 0) + secondes) * 10) / 10;
}
// réussite : 50 % au départ, puis les 200 dernières réponses (démarrage en douceur : 20 réponses fictives à 50 %)
function tauxReussite(etat) {
  const r = etat.profil.reponses.slice(-200);
  return (r.reduce((s, x) => s + x[1], 0) + 10) / (r.length + 20);
}
function secondesParCarte(etat) {
  const r = etat.profil.reponses.slice(-100);
  if (!r.length) return 10;
  return Math.max(3, (r.reduce((s, x) => s + x[2], 0) + 10 * 5) / (r.length + 5));   // démarrage : 10 s
}
// temps actif d'une réponse : au-delà de PAUSE_MAX, le téléphone a été posé -> on compte le temps moyen
function tempsActif(etat, secondesBrutes) {
  return secondesBrutes > SRS.PAUSE_MAX ? secondesParCarte(etat) : secondesBrutes;
}

function cleJour(ms) { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function debutJour(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }

// ---------- prévision des prochains jours (simulation) ----------
// Chaque carte suit sa propre chaîne de révisions ; réussite tirée au hasard avec le taux de l'utilisateur ;
// une erreur coûte une révision de plus (rattrapage dans la séance). Moyenne sur plusieurs tirages.
function simuler(etat, maintenant, opts = {}) {
  const jours = opts.jours || SRS.JOURS_PREVISION, tirages = opts.tirages || 30;
  const p = opts.taux !== undefined ? opts.taux : tauxReussite(etat);
  const sec = opts.secondes || secondesParCarte(etat);
  const alea = opts.alea || Math.random;
  const d0 = debutJour(maintenant), fin = d0 + (jours + 1) * J;
  const cartes = Object.values(etat.tuiles).filter((t) => t.statut === "placee" && !t.pause && t.palier < SRS.ACQUIS).map((t) => [t.palier, t.due]);
  for (const x of opts.ajouts || []) cartes.push(x);
  const compte = new Array(jours + 1).fill(0);
  for (let n = 0; n < tirages; n++) {
    for (const [pal0, due0] of cartes) {
      let pal = pal0, t = Math.max(due0, maintenant);
      while (t < fin && pal < SRS.ACQUIS) {
        const jour = Math.floor((t - d0) / J);
        compte[jour] += 1;
        if (alea() < p) pal = Math.min(SRS.ACQUIS, pal + 1);
        else { compte[jour] += 1; pal = pal >= 9 ? pal - 1 : Math.max(1, pal - 2); }
        if (pal >= SRS.ACQUIS) break;
        t += SRS.INTERVALLE[pal];
      }
    }
  }
  return compte.map((c) => ({ revisions: c / tirages, minutes: (c / tirages) * sec / 60 }));   // [0] = aujourd'hui
}

// temps réellement tenu : moyenne des 7 derniers jours (jours à 0 compris), seulement après 7 jours d'utilisation
function tempsTenu(etat, maintenant) {
  const jours = Object.keys(etat.profil.jours).sort();
  if (!jours.length) return null;
  const premier = new Date(jours[0] + "T00:00:00").getTime();
  if (debutJour(maintenant) - premier < 7 * J) return null;
  let total = 0;
  for (let i = 1; i <= 7; i++) total += etat.profil.jours[cleJour(debutJour(maintenant) - i * J + H)] || 0;
  return total / 7 / 60;
}
// budget de révision par jour (min) : l'objectif, ou ce que l'utilisateur tient vraiment s'il tient moins
function budget(etat, maintenant) {
  const objectif = etat.reglages.objectif || SRS.OBJECTIF_DEFAUT;
  const tenu = tempsTenu(etat, maintenant);
  if (tenu !== null && tenu < objectif * 0.9) return { minutes: Math.max(2, tenu * 1.15), objectif, tenu, adapte: true };
  return { minutes: objectif, objectif, tenu, adapte: false };
}
// peut-on prendre une nouvelle carte (placée au palier opts.palier, Apprenti 1 par défaut) sans dépasser le budget sur les 5 prochains jours ?
function nouvelleSupportable(etat, maintenant, opts = {}) {
  const b = budget(etat, maintenant);
  const pal = opts.palier || 1;
  const prev = simuler(etat, maintenant, Object.assign({}, opts, { ajouts: [[pal, maintenant + SRS.INTERVALLE[pal]]] }));
  const pire = Math.max(...prev.slice(1).map((x) => x.minutes));
  return { ok: pire <= b.minutes, pire, budget: b, prevision: prev };
}

// mode sans impact : une carte placée à ce palier laisse-t-elle les 5 prochains jours sous le budget ?
// (vrai d'office si sa 1re révision tombe après ces 5 jours : Confirmé 1 et au-delà)
function sansImpact(etat, maintenant, palier, opts = {}) {
  const fin = debutJour(maintenant) + ((opts.jours || SRS.JOURS_PREVISION) + 1) * J;
  if (palier >= SRS.ACQUIS || maintenant + SRS.INTERVALLE[palier] >= fin) return true;
  return nouvelleSupportable(etat, maintenant, Object.assign({}, opts, { palier })).ok;
}

// ---------- progression vers les 2 objectifs ----------
function objectifs(etat, ids) {
  let horsApprenti = 0, acquis = 0;
  for (const id of ids) {
    const t = etat.tuiles[id];
    if (t && t.statut === "placee" && t.palier >= SRS.CONFIRME) horsApprenti++;
    if (t && t.statut === "placee" && t.palier >= SRS.ACQUIS) acquis++;
  }
  return { total: ids.length, horsApprenti, acquis };
}
function noterHistorique(etat, ids, maintenant) {
  const o = objectifs(etat, ids);
  etat.historique[cleJour(maintenant)] = [o.horsApprenti, o.acquis, o.total];
}

// ---------- QCM ----------
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

// pièges phonétiques (voisement, voyelle longue, っ retiré, ゃゅょ)
function pieges(lecture) {
  const okuri = (lecture.match(/\(.*\)/) || [""])[0];
  const r = radical(lecture);
  const res = new Set();
  if (!r) return [];
  const c0 = r[0];
  if (VOISEE[c0]) res.add(VOISEE[c0] + r.slice(1));
  if (SOURDE[c0]) res.add(SOURDE[c0] + r.slice(1));
  const fin = r[r.length - 1];
  if (r.length >= 2 && (fin === "う" || fin === "い") && (RANGEE_O + RANGEE_U + "えけげせぜてでねへべぺめれ").includes(r[r.length - 2])) res.add(r.slice(0, -1));
  else if (RANGEE_O.includes(fin) || RANGEE_U.includes(fin)) res.add(r + "う");
  if (r.includes("っ")) res.add(r.replace("っ", ""));
  const petits = { "ゃ": "ゅ", "ゅ": "ょ", "ょ": "ゅ" };
  for (const [a, b] of Object.entries(petits)) if (r.includes(a)) { res.add(r.replace(a, b)); break; }
  return [...res].filter((x) => x && x !== r).map((x) => x + okuri);
}

function lecturesInterdites(fiche) {
  const s = new Set(fiche.toutes);
  for (const l of fiche.lectures) { s.add(sansParentheses(l)); s.add(radical(l)); }
  return s;
}

// QCM lecture d'un kanji seul
function qcmLecture(fiche, toutesFiches, alea = Math.random) {
  const bonne = fiche.lectures[Math.floor(alea() * fiche.lectures.length)];
  const interdit = lecturesInterdites(fiche);
  const contracte = new Set([...interdit].filter((l) => l.length >= 2 && "くつきち".includes(l[l.length - 1])).map((l) => l.slice(0, -1) + "っ"));
  const ok = (x) => !interdit.has(sansParentheses(x)) && !interdit.has(radical(x)) && !contracte.has(radical(x)) && x !== bonne;
  const choix = new Set();
  for (const p of melanger(pieges(bonne), alea)) { if (choix.size >= 2) break; if (ok(p)) choix.add(p); }
  const paren = (x) => x.includes("(");
  const ecart = (x) => (paren(x) !== paren(bonne) ? 100 : 0) + Math.abs(radical(x).length - radical(bonne).length);
  const autres = melanger(toutesFiches.filter((f) => f.kanji !== fiche.kanji).flatMap((f) => f.lectures), alea).sort((a, b) => ecart(a) - ecart(b));
  for (const a of autres) { if (choix.size >= 3) break; if (ok(a) && !choix.has(a)) choix.add(a); }
  return { bonne, options: melanger([bonne, ...choix], alea) };
}

function qcmSensTexte(bonne, candidats, alea = Math.random) {
  const mots = new Set(bonne.toLowerCase().split(/[ ,()]+/).filter((m) => m.length > 3));
  const autres = melanger(candidats, alea).filter((s) => s !== bonne && !s.toLowerCase().split(/[ ,()]+/).some((m) => mots.has(m)));
  return { bonne, options: melanger([bonne, ...[...new Set(autres)].slice(0, 3)], alea) };
}
function qcmSens(fiche, toutesFiches, alea = Math.random) {
  return qcmSensTexte(fiche.sens, toutesFiches.filter((f) => f.kanji !== fiche.kanji).map((f) => f.sens), alea);
}
// sens d'un mot : de préférence des mots du même type (nom, verbe…)
function qcmSensMot(mot, tousMots, alea = Math.random) {
  const meme = tousMots.filter((m) => m.mot !== mot.mot && m.type === mot.type).map((m) => m.fr);
  const autres = tousMots.filter((m) => m.mot !== mot.mot && m.type !== mot.type).map((m) => m.fr);
  return qcmSensTexte(mot.fr, [...melanger(meme, alea), ...melanger(autres, alea)].slice(0, 40), alea);
}

// lecture d'un mot : on modifie les morceaux des kanji à connaître (autre lecture du même kanji, pièges phonétiques) ;
// les morceaux en furigana et en kana ne bougent pas (sinon le furigana trahirait la réponse).
function qcmLectureMot(mot, tousMots, parKanji, alea = Math.random) {
  const bonne = mot.kana;
  const valides = new Set([bonne, ...(mot.autresLectures || [])]);
  const choix = new Set();
  const kIdx = mot.seg.map((s, i) => (s[2] === "k" ? i : -1)).filter((i) => i >= 0);
  const toutesF = Object.values(parKanji);
  const variantesSeg = (s) => {
    const v = new Set(pieges(s[1]));
    for (const ch of s[0]) {
      const f = parKanji[ch];
      if (f) for (const l of f.lectures) { v.add(radical(l)); for (const p of pieges(radical(l))) v.add(p); }
    }
    // pas assez de variantes : lectures d'autres kanji de longueur proche, au même endroit (le furigana reste juste)
    if (v.size < 6) {
      const lg = s[1].length;
      const autresL = melanger(toutesF.flatMap((f) => f.lectures.map(radical)), alea).filter((x) => Math.abs(x.length - lg) <= 1);
      for (const x of autresL) { if (v.size >= 8) break; v.add(x); }
    }
    v.delete(s[1]);
    return [...v].filter((x) => x);
  };
  for (let essai = 0; essai < 60 && choix.size < 3 && kIdx.length; essai++) {
    const seg = mot.seg.map((s) => s[1]);
    const nb = essai < 30 ? 1 : 2;
    for (let n = 0; n < nb; n++) {
      const i = kIdx[Math.floor(alea() * kIdx.length)];
      const vs = variantesSeg(mot.seg[i]);
      if (vs.length) seg[i] = vs[Math.floor(alea() * vs.length)];
    }
    const c = seg.join("");
    if (!valides.has(c)) choix.add(c);
  }
  if (choix.size < 3) {                     // repli (mots à lecture particulière) : pièges phonétiques, puis autres mots
    for (const p of melanger(pieges(bonne), alea)) { if (choix.size >= 3) break; if (!valides.has(p)) choix.add(p); }
    const lg = bonne.length;
    const autres = melanger(tousMots.filter((m) => m.mot !== mot.mot), alea).sort((a, b) => Math.abs(a.kana.length - lg) - Math.abs(b.kana.length - lg));
    for (const m of autres) { if (choix.size >= 3) break; if (!valides.has(m.kana)) choix.add(m.kana); }
  }
  return { bonne, options: melanger([bonne, ...[...choix].slice(0, 3)], alea) };
}

const SRSLib = { SRS, H, J, etatVide, migrer, placer, introduite, appliquerAbsences, revisionsDues, pauser, reprendre, prochaineRevision, repondre,
  repondreAcquis, kanjiConfirme, prochaineNouvelle, enregistrerReponse, tauxReussite, secondesParCarte, tempsActif, cleJour, debutJour,
  simuler, tempsTenu, budget, nouvelleSupportable, sansImpact, objectifs, noterHistorique, melanger, pieges, qcmLecture, qcmSens, qcmSensMot, qcmLectureMot };
if (typeof window !== "undefined") window.SRSLib = SRSLib;
