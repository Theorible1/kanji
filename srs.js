// Logique de l'appli kanji (sans interface) : rangs, fenêtres de jeu, retards, nouvelles cartes, profil, projection.
// Toutes les fonctions reçoivent "maintenant" (ms) pour pouvoir être testées en simulant le temps.
"use strict";

const H = 3600 * 1000, J = 24 * H;
const SRS = {
  ACQUIS: 11,
  DEBLOCAGE: 5,                              // rang des cartes d'un kanji qui débloque ses mots
  // délai en jours du calendrier quand la carte est AU rang r (jour 0 = jour de la dernière réponse)
  DELAI: { 1: 1, 2: 1, 3: 2, 4: 3, 5: 7, 6: 14, 7: 30, 8: 80, 9: 80, 10: 30 },
  COURT: 3 * H,                              // après une erreur qui laisse la carte au rang 1
  CHRONO: { 9: 30, 10: 12 },                 // secondes pour répondre aux rangs chronométrés
  // nouvelle carte réussie + « tu le connaissais comment ? »
  CONFIANCE: { tres_peu: 1, un_peu: 2, moyen: 5, bien: 7, tres_bien: 8 },
  ACQUIS_RATE: { rang: 9, delai: 30 },       // onglet Acquis : erreur -> rang 9, revue 30 jours plus tard
  PAUSE_MAX: 60,                             // s : au-delà, on considère que le téléphone a été posé
  OBJECTIF_DEFAUT: 10,                       // min par jour supposées tant qu'on ne connaît pas le rythme de la personne
  ECHECS_MAX: 3,                             // erreurs de suite au rang 1 avant de mettre la carte de côté (elle revient à la fin)
  BUT_PART: 0.85,                            // objectif du jour = 85 % du temps habituel
  BUT_RAB: 5,                                // cartes proposées en plus quand ce temps est atteint (« Encore 5 avant l'objectif »)
  BUT_JOURS: 7,                              // jours joués pris en compte
};
// intervalles de la version 2 (v11), pour retrouver la date de la dernière réponse à la migration
const ANCIEN = { 1: 4 * H, 2: 8 * H, 3: J, 4: 2 * J, 5: 7 * J, 6: 14 * J, 7: 30 * J, 8: 120 * J, 9: 30 * J, 10: 30 * J };

const nomRang = (r) => (r >= SRS.ACQUIS ? "Acquis" : `Rang ${r}`);
function cleJour(ms) { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function debutJour(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
// début du jour situé n jours du calendrier après ms (insensible aux changements d'heure)
function plusJours(ms, n) { const d = new Date(ms); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d.getTime(); }

// marges en jours : [avant l'échéance, après l'échéance]
function marges(rang, delai) {
  if (rang <= 4) return [0, 1];
  if (rang <= 6) return [5, 7];
  if (rang === 7) return [5, 10];
  return [Math.round(delai * 0.1), Math.round(delai * 0.2)];
}
// fenêtre d'une carte : ouvre (jouable à partir de), due (échéance), limite (à partir de là : descente d'un rang)
// carte = { rang, base (ms de la dernière réponse ou de la descente), court, retard, delai (jours, cas particulier), pause }
function fenetre(t) {
  if (t.rang >= SRS.ACQUIS) return null;
  if (t.court) { const o = t.base + SRS.COURT; return { ouvre: o, due: o, limite: Infinity }; }
  const delai = t.delai || SRS.DELAI[t.rang];
  const [av, ap] = marges(t.rang, delai);
  const limite = t.rang <= 1 ? Infinity : plusJours(t.base, delai + ap + 1);
  if (t.retard) return { ouvre: t.base, due: t.base, limite };
  return { ouvre: plusJours(t.base, delai - av), due: plusJours(t.base, delai), limite };
}

function etatVide() { return { version: 3, tuiles: {}, journal: [], profil: { reponses: [], jours: {}, cibles: {}, atteints: {} }, historique: {}, reglages: {} }; }

// plan(id, version) -> ids des cartes actuelles qui reprennent la progression de l'ancienne carte « id »
function migrer(e, plan, maintenant) {
  if (!e || !e.tuiles) return etatVide();
  const v = etatVide();
  let tuiles = e.tuiles, version = e.version || 1;
  if (version < 2) {                                            // v1 : kanji seulement, ids « 日:sens »
    tuiles = {};
    for (const [id, t] of Object.entries(e.tuiles)) if (t.statut === "placee") tuiles["k:" + id] = t;
  }
  const poser = (id, nt) => {
    for (const cible of (plan ? plan(id, version) : [id])) {
      const deja = v.tuiles[cible];
      if (!deja || nt.rang > deja.rang) v.tuiles[cible] = Object.assign({}, nt);   // cartes fusionnées : le rang le plus haut
    }
  };
  for (const [id, t] of Object.entries(tuiles)) {
    if (version >= 3) { poser(id, t); continue; }
    if (t.statut !== "placee") continue;
    // v2 -> v3 : même rang, échéance recalculée avec les nouveaux délais, aucun retard le jour du passage
    const rang = Math.max(1, Math.min(SRS.ACQUIS, t.palier || 1));
    const ref = t.pause || maintenant;
    let base = rang >= SRS.ACQUIS ? ref : t.due - ANCIEN[rang];
    if (!(base <= ref)) base = ref;
    const nt = { rang, base };
    if (rang < SRS.ACQUIS && ref >= fenetre(nt).limite) nt.base = plusJours(ref, -SRS.DELAI[rang]);   // due aujourd'hui
    if (t.pause) nt.pause = t.pause;
    poser(id, nt);
  }
  v.journal = e.journal || [];
  v.historique = e.historique || {};
  v.profil = Object.assign(v.profil, e.profil || {});
  v.reglages = Object.assign(v.reglages, e.reglages || {});
  return v;
}

function rangDe(etat, id) { const t = etat.tuiles[id]; return t ? t.rang : 0; }
function introduite(etat, id) { return !!etat.tuiles[id]; }
function noter(etat, ligne) {
  etat.journal.push(ligne);
  if (etat.journal.length > 5000) etat.journal.splice(0, etat.journal.length - 5000);
}
// nouvelle carte : juste = 1 (réussie, rang choisi par la note) ou 0 (ratée, rang 1)
function placer(etat, id, rang, maintenant, juste) {
  etat.tuiles[id] = { rang, base: maintenant };
  noter(etat, [maintenant, id, juste === undefined ? 1 : (juste ? 1 : 0), 0, rang]);
}

// réponse à une carte déjà vue : +1 rang si juste, -1 sinon ; une erreur qui laisse au rang 1 fait revenir 3 h plus tard
function appliquer(t, juste, maintenant) {
  t.rang = juste ? Math.min(SRS.ACQUIS, t.rang + 1) : Math.max(1, t.rang - 1);
  t.base = maintenant;
  delete t.retard; delete t.delai; delete t.court;
  if (!juste && t.rang === 1) t.court = true;
  return t.rang;
}
function repondre(etat, id, juste, maintenant) {
  const t = etat.tuiles[id], avant = t.rang;
  appliquer(t, juste, maintenant);
  // carte qui ne décolle pas : 3 erreurs de suite au rang 1 -> mise de côté, elle revient quand il n'y a plus rien d'autre
  if (avant === 1 && !juste) {
    t.echecs = (t.echecs || 0) + 1;
    if (t.echecs >= SRS.ECHECS_MAX) { t.loin = true; delete t.echecs; }
  } else delete t.echecs;
  noter(etat, [maintenant, id, juste ? 1 : 0, avant, t.rang]);
  return t.rang;
}
function repondreAcquis(etat, id, juste, maintenant) {
  const t = etat.tuiles[id];
  if (!juste) { t.rang = SRS.ACQUIS_RATE.rang; t.base = maintenant; t.delai = SRS.ACQUIS_RATE.delai; delete t.retard; delete t.court; }
  noter(etat, [maintenant, id, juste ? 1 : 0, SRS.ACQUIS, t.rang, "acquis"]);
  return t.rang;
}

// retard : passé la date limite, la carte descend d'un rang (pas une erreur), devient jouable tout de suite,
// et redescend encore si elle n'est pas vue après le délai du nouveau rang + sa marge, comptés depuis la descente
function appliquerRetards(etat, maintenant) {
  let n = 0;
  for (const t of Object.values(etat.tuiles)) {
    if (t.pause || t.rang < 2 || t.rang >= SRS.ACQUIS) continue;
    let f = fenetre(t), touche = false;
    while (t.rang > 1 && maintenant >= f.limite) {
      t.rang -= 1; t.base = f.limite; t.retard = true; delete t.delai; delete t.court;
      touche = true; f = fenetre(t);
    }
    if (touche) n++;
  }
  return n;
}

// cartes jouables maintenant : dues (échéance atteinte) et avance (fenêtre ouverte, échéance pas encore atteinte)
// ordre : du rang le plus haut au plus bas, puis la date limite la plus proche
function aJouer(etat, maintenant) {
  const dues = [], avance = [];
  for (const [id, t] of Object.entries(etat.tuiles)) {
    if (t.pause || t.loin || t.rang >= SRS.ACQUIS) continue;
    const f = fenetre(t);
    if (f.ouvre > maintenant) continue;
    (f.due <= maintenant ? dues : avance).push([id, t.rang, f.due <= maintenant ? f.limite : f.due]);
  }
  const tri = (a, b) => b[1] - a[1] || a[2] - b[2] || (a[0] < b[0] ? -1 : 1);
  return { dues: dues.sort(tri).map((x) => x[0]), avance: avance.sort(tri).map((x) => x[0]) };
}
// carte à avancer : si un des jours à venir s'annonce plus chargé que le temps du jour (budget en s),
// on avance la carte la mieux connue parmi celles de ce jour dont la fenêtre est déjà ouverte
function aAvancer(etat, maintenant, budget, jours = 10) {
  const charge = {}, ouvertes = [], sec = {};
  const cout = (id) => { const ty = typeCarte(id); return sec[ty] || (sec[ty] = secondesParType(etat, ty)); };
  const fin = plusJours(maintenant, jours + 1);
  for (const [id, t] of Object.entries(etat.tuiles)) {
    if (t.pause || t.loin || t.rang >= SRS.ACQUIS) continue;
    const f = fenetre(t);
    if (f.due <= maintenant || f.due >= fin) continue;
    charge[f.due] = (charge[f.due] || 0) + cout(id);
    if (f.ouvre <= maintenant) ouvertes.push([id, t.rang, f.due]);
  }
  const cand = ouvertes.filter((x) => charge[x[2]] > budget).sort((a, b) => b[1] - a[1] || a[2] - b[2] || (a[0] < b[0] ? -1 : 1));
  return cand.length ? cand[0][0] : null;
}
function prochaineOuverture(etat) {
  let min = null;
  for (const t of Object.values(etat.tuiles)) {
    if (t.pause || t.loin || t.rang >= SRS.ACQUIS) continue;
    const o = fenetre(t).due;
    if (min === null || o < min) min = o;
  }
  return min;
}

// carte mise de côté (3 erreurs de suite au rang 1) : la plus ancienne d'abord ; ramener = elle redevient jouable tout de suite
function prochaineLointaine(etat) {
  let id = null, base = Infinity;
  for (const [i, t] of Object.entries(etat.tuiles)) if (t.loin && !t.pause && t.base < base) { id = i; base = t.base; }
  return id;
}
function ramener(etat, id, maintenant) {
  const t = etat.tuiles[id];
  delete t.loin; delete t.court; delete t.echecs;
  t.base = plusJours(maintenant, -SRS.DELAI[1]);
}

// cartes hors de l'objectif : mises en pause avec leur progression, puis reprises là où elles en étaient
function pauser(etat, ids, maintenant) {
  let n = 0;
  for (const id of ids) {
    const t = etat.tuiles[id];
    if (t && !t.pause && t.rang < SRS.ACQUIS) { t.pause = maintenant; n++; }
  }
  return n;
}
function reprendre(etat, ids, maintenant) {
  let n = 0;
  for (const id of ids) {
    const t = etat.tuiles[id];
    if (t && t.pause) { t.base += maintenant - t.pause; delete t.pause; n++; }
  }
  return n;
}

// ---------- nouvelles cartes : kanji seuls, puis mots « combo », puis mots « mixtes » ----------
// cartes : liste ordonnée de { id, phase, prerequis } ; prerequis = groupes d'ids de cartes,
// chaque groupe est rempli quand au moins une de ses cartes est au rang 5 ou plus
function debloquee(etat, carte) {
  return carte.prerequis.every((g) => g.some((id) => rangDe(etat, id) >= SRS.DEBLOCAGE));
}
function prochaineNouvelle(etat, cartes) {
  for (const phase of ["kanji", "combo", "mixte"]) {
    let attente = 0, prete = null;
    for (const c of cartes) {
      if (c.phase !== phase || etat.tuiles[c.id]) continue;
      attente++;
      if (!prete && debloquee(etat, c)) { prete = c; break; }
    }
    if (prete) return { carte: prete, phase };
    if (attente) return { carte: null, phase, attente };
  }
  return { carte: null, phase: "fini" };
}

// ---------- profil : réussite et temps par carte ----------
// type de carte : ks (kanji -> sens), kl (kanji -> prononciation), ms (mot -> traduction), ml (mot -> kana)
function typeCarte(id) { const p = id.split(":"); return p[0] + (p[2][0] === "s" ? "s" : "l"); }
// réponses : [date, juste, secondes, type, rang avant la réponse (0 = nouvelle carte)]
function enregistrerReponse(etat, juste, secondes, maintenant, type, rang) {
  const p = etat.profil;
  p.reponses.push([maintenant, juste ? 1 : 0, Math.round(secondes * 10) / 10, type || "", rang === undefined ? null : rang]);
  if (p.reponses.length > 1000) p.reponses.splice(0, p.reponses.length - 1000);
  ajouterTemps(etat, secondes, maintenant);
}
function ajouterTemps(etat, secondes, maintenant) {
  const jour = cleJour(maintenant);
  etat.profil.jours[jour] = Math.round(((etat.profil.jours[jour] || 0) + secondes) * 10) / 10;
}
function tempsJour(etat, maintenant) { return etat.profil.jours[cleJour(maintenant)] || 0; }
const revisions = (etat) => etat.profil.reponses.filter((x) => x[4] !== 0);
// réussite : 50 % au départ, puis les 200 dernières révisions (démarrage en douceur : 20 réponses fictives à 50 %)
function tauxReussite(etat) {
  const r = revisions(etat).slice(-200);
  return (r.reduce((s, x) => s + x[1], 0) + 10) / (r.length + 20);
}
// réussite à un rang donné : ses 60 dernières réponses à ce rang, tirées vers la réussite générale tant qu'il y en a peu
function tauxParRang(etat, rang) {
  const r = etat.profil.reponses.filter((x) => x[4] === rang).slice(-60);
  return (r.reduce((s, x) => s + x[1], 0) + 5 * tauxReussite(etat)) / (r.length + 5);
}
function secondesParCarte(etat) {
  const r = etat.profil.reponses.slice(-100);
  if (!r.length) return 10;
  return Math.max(3, (r.reduce((s, x) => s + x[2], 0) + 10 * 5) / (r.length + 5));   // démarrage : 10 s
}
function secondesParType(etat, type) {
  const g = secondesParCarte(etat);
  const r = etat.profil.reponses.filter((x) => x[3] === type).slice(-50);
  return Math.max(3, (r.reduce((s, x) => s + x[2], 0) + g * 3) / (r.length + 3));
}
// temps que la prochaine présentation de cette carte devrait prendre
function estimation(etat, id) { return secondesParType(etat, typeCarte(id)); }
// temps actif d'une carte : au-delà de PAUSE_MAX, le téléphone a été posé -> on compte le temps moyen
function tempsActif(etat, secondesBrutes) {
  return secondesBrutes > SRS.PAUSE_MAX ? secondesParCarte(etat) : secondesBrutes;
}
// évolution récente : les 50 dernières réponses contre les 50 d'avant (null s'il n'y en a pas assez)
function tendance(etat) {
  const r = etat.profil.reponses;
  if (r.length < 40) return null;
  const n = Math.min(50, Math.floor(r.length / 2));
  const moy = (a, i) => a.reduce((s, x) => s + x[i], 0) / a.length;
  const rec = r.slice(-n), av = r.slice(-2 * n, -n);
  return { n, taux: [moy(av, 1), moy(rec, 1)], secondes: [moy(av, 2), moy(rec, 2)] };
}
// temps réellement tenu : moyenne des 7 derniers jours (jours à 0 compris), seulement après 7 jours d'utilisation
function tempsTenu(etat, maintenant) {
  const jours = Object.keys(etat.profil.jours).sort();
  if (!jours.length) return null;
  const premier = new Date(jours[0] + "T00:00:00").getTime();
  if (debutJour(maintenant) - premier < 7 * J) return null;
  let total = 0;
  for (let i = 1; i <= 7; i++) total += etat.profil.jours[cleJour(plusJours(maintenant, -i))] || 0;
  return total / 7 / 60;
}

// temps habituel par jour (min) : temps tenu sur 7 jours, sinon moyenne des jours joués avant aujourd'hui, sinon 10 min
function tempsHabituel(etat, maintenant) {
  const tenu = tempsTenu(etat, maintenant);
  if (tenu) return tenu;
  const auj = cleJour(maintenant);
  const v = Object.entries(etat.profil.jours).filter(([j, s]) => j < auj && s > 0).map(([, s]) => s);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length / 60 : SRS.OBJECTIF_DEFAUT;
}

// ---------- objectif du jour automatique (v13.1) ----------
// On ne demande plus de temps par jour : on regarde quand la personne s'arrête d'habitude, et on fixe un objectif
// de temps un peu en dessous. Quand il est atteint, on propose 5 cartes de plus, puis le feu d'artifice.
// cartes jouées par jour (révisions et nouvelles cartes de Jouer ; ni les « à revoir », ni l'onglet Acquis), d'après le journal
function cartesParJour(etat) {
  const n = {};
  for (const x of etat.journal) { if (x[5]) continue; const j = cleJour(x[0]); n[j] = (n[j] || 0) + 1; }
  return n;
}
function cartesDuJour(etat, maintenant) { return cartesParJour(etat)[cleJour(maintenant)] || 0; }
// travail d'une journée, en secondes. Pour plus de fiabilité, on fait la moyenne de deux mesures :
// - le temps réellement passé à réviser ;
// - le temps que les cartes jouées prennent d'habitude : temps moyen du type de carte, alourdi par le taux d'erreur
//   de la personne au rang de la carte (une erreur coûte un rattrapage, comme dans la projection).
// renvoie la fonction (id, rang) -> secondes que cette carte devrait prendre à ce rang (rang 0 = nouvelle carte)
function couts(etat) {
  const taux = { 0: tauxReussite(etat) }, sec = {};
  for (let r = 1; r <= 10; r++) taux[r] = tauxParRang(etat, r);
  for (const ty of ["ks", "kl", "ms", "ml"]) sec[ty] = secondesParType(etat, ty);
  return (id, rang) => (sec[typeCarte(id)] || sec.ks) * (2 - (taux[rang] !== undefined ? taux[rang] : taux[0]));
}
// travail que la prochaine carte devrait demander : sert à prévoir sur quelle carte l'objectif du jour sera atteint
function coutCarte(etat, id) { return couts(etat)(id, rangDe(etat, id)); }
function effortParJour(etat) {
  const cout = couts(etat), prevu = {}, e = {};
  for (const x of etat.journal) {
    if (x[5]) continue;
    const j = cleJour(x[0]);
    prevu[j] = (prevu[j] || 0) + cout(x[1], x[3]);
  }
  for (const j of Object.keys(prevu)) { const reel = etat.profil.jours[j] || 0; e[j] = reel > 0 ? (reel + prevu[j]) / 2 : prevu[j]; }
  return e;
}
function effortDuJour(etat, maintenant) { return effortParJour(etat)[cleJour(maintenant)] || 0; }
// objectif (en secondes de travail) calculé pour aujourd'hui ; 0 = pas encore d'objectif (premier jour : on observe)
// - 85 % de la moyenne des 7 derniers jours joués (les plus récents comptent plus)
// - objectif raté la dernière fois : il est proposé plus tôt (ce qui a été fait ce jour-là, moins la place des 5 cartes en plus)
// - pas joué hier : encore 20 % de moins
function calculerObjectif(etat, maintenant) {
  const auj = cleJour(maintenant), e = effortParJour(etat), n = cartesParJour(etat), p = etat.profil;
  const joues = Object.keys(e).filter((j) => j < auj).sort().slice(-SRS.BUT_JOURS);
  if (!joues.length) return 0;
  let somme = 0, poids = 0;
  joues.forEach((j, i) => { somme += e[j] * (i + 1); poids += i + 1; });
  let but = SRS.BUT_PART * somme / poids;
  const dernier = joues[joues.length - 1];
  if ((p.cibles || {})[dernier] > 0 && !(p.atteints || {})[dernier]) but = Math.min(but, e[dernier] - SRS.BUT_RAB * e[dernier] / n[dernier]);
  if (dernier !== cleJour(plusJours(maintenant, -1))) but *= 0.8;
  return Math.max(1, Math.round(but));
}
// objectif du jour : calculé une fois, puis gardé toute la journée (profil.cibles ; on garde 60 jours)
function objectifDuJour(etat, maintenant) {
  const p = etat.profil, auj = cleJour(maintenant);
  if (!p.cibles) p.cibles = {};
  if (!p.atteints) p.atteints = {};
  if (p.cibles[auj] === undefined) {
    p.cibles[auj] = calculerObjectif(etat, maintenant);
    const cles = Object.keys(p.cibles).sort();
    for (const c of cles.slice(0, Math.max(0, cles.length - 60))) { delete p.cibles[c]; delete p.atteints[c]; }
  }
  return p.cibles[auj];
}

// ---------- progression vers les 4 objectifs ----------
// r2, r5, r6 : nombre de cartes au rang 2, 5, 6 ou plus ; acquis : cartes acquises (rang5 = ancien nom de r5)
function objectifs(etat, ids) {
  let r2 = 0, r5 = 0, r6 = 0, acquis = 0;
  for (const id of ids) {
    const r = rangDe(etat, id);
    if (r >= 2) r2++;
    if (r >= SRS.DEBLOCAGE) r5++;
    if (r >= 6) r6++;
    if (r >= SRS.ACQUIS) acquis++;
  }
  return { total: ids.length, r2, r5, r6, acquis, rang5: r5 };
}
// historique d'un jour : [r5, acquis, total, r2, r6] (r2 et r6 ajoutés en v12.2 : absents des jours plus anciens)
function noterHistorique(etat, ids, maintenant) {
  const o = objectifs(etat, ids);
  etat.historique[cleJour(maintenant)] = [o.r5, o.acquis, o.total, o.r2, o.r6];
}

// ---------- projection : on rejoue les séances jour par jour avec le rythme réel de l'utilisateur ----------
// opts : jours (365), minutes (temps par jour : le temps habituel de la personne), graine
// retour : [[cartes au rang 5 et plus, cartes acquises, au rang 2 et plus, au rang 6 et plus], ...] pour aujourd'hui (indice 0) puis chaque jour
function projeter(etat, cartes, maintenant, opts = {}) {
  const jours = opts.jours || 365;
  const minutes = opts.minutes !== undefined ? opts.minutes : tempsHabituel(etat, maintenant);
  const budget = minutes * 60;
  let graine = opts.graine || 12345;
  const alea = () => { graine |= 0; graine = graine + 0x6D2B79F5 | 0; let x = Math.imul(graine ^ graine >>> 15, 1 | graine); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
  const e = { tuiles: {}, profil: etat.profil, reglages: etat.reglages };
  for (const [id, t] of Object.entries(etat.tuiles)) { e.tuiles[id] = Object.assign({}, t); delete e.tuiles[id].loin; }
  const taux = {}, sec = {};
  for (let r = 1; r <= 10; r++) taux[r] = opts.taux !== undefined ? opts.taux : tauxParRang(etat, r);
  for (const ty of ["ks", "kl", "ms", "ml"]) sec[ty] = opts.secondes || secondesParType(etat, ty);
  // rang de départ des nouvelles cartes : comme les 100 dernières découvertes ; sinon ratée -> 1, réussie -> 2
  const departs = etat.journal.filter((x) => x[3] === 0).slice(-100).map((x) => x[4]);
  const tauxNouv = opts.taux !== undefined ? opts.taux : tauxReussite(etat);
  const depart = () => (departs.length >= 10 ? departs[Math.floor(alea() * departs.length)] : (alea() < tauxNouv ? 2 : 1));
  const reste = { kanji: [], combo: [], mixte: [] };
  for (const c of cartes) if (!e.tuiles[c.id]) reste[c.phase].push(c);
  const nouvelle = () => {
    for (const ph of ["kanji", "combo", "mixte"]) {
      const l = reste[ph];
      if (!l.length) continue;
      const i = l.findIndex((c) => debloquee(e, c));
      return i < 0 ? null : l.splice(i, 1)[0];
    }
    return null;
  };
  const ids = cartes.map((c) => c.id);
  const compter = () => { const o = objectifs(e, ids); return [o.r5, o.acquis, o.r2, o.r6]; };
  const res = [compter()];
  for (let d = 1; d <= jours; d++) {
    const t = plusJours(maintenant, d) + 12 * H;
    appliquerRetards(e, t);
    let temps = 0;
    for (const id of aJouer(e, t).dues) {
      const cout = sec[typeCarte(id)];
      if (temps + cout > budget) break;
      const tu = e.tuiles[id], juste = alea() < taux[tu.rang];
      appliquer(tu, juste, t);
      temps += juste ? cout : 2 * cout;                      // une erreur coûte un rattrapage dans la séance
    }
    for (;;) {
      if (temps + sec.ks > budget) break;
      const c = nouvelle();
      if (!c) break;
      e.tuiles[c.id] = { rang: depart(), base: t };
      temps += sec[typeCarte(c.id)];
    }
    res.push(compter());
  }
  return res;
}

// ---------- QCM ----------
function melanger(a, alea = Math.random) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(alea() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const sansParentheses = (s) => s.replace(/[()]/g, "");
const radical = (s) => s.replace(/\(.*?\)/g, "");
// « (お)かね » / « ひと(つ) » -> avant (politesse), radical (lecture du kanji), okuri (kana écrits après le kanji)
function decoupe(lecture) {
  const m = lecture.match(/^(?:\((.*?)\))?([^()]*)(?:\((.*)\))?$/) || [null, "", lecture, ""];
  return { avant: m[1] || "", rad: m[2], okuri: m[3] || "" };
}
// carte de prononciation : le kanji suivi de ses kana (一つ) ; réponse sans parenthèses (ひとつ)
function affichageLecture(kanji, lecture) { const d = decoupe(lecture); return (d.avant ? `(${d.avant})` : "") + kanji + d.okuri; }
function reponseLecture(lecture) { const d = decoupe(lecture); return (d.avant ? `(${d.avant})` : "") + d.rad + d.okuri; }

const VOISEE = { "か": "が", "き": "ぎ", "く": "ぐ", "け": "げ", "こ": "ご", "さ": "ざ", "し": "じ", "す": "ず", "せ": "ぜ", "そ": "ぞ",
  "た": "だ", "ち": "ぢ", "つ": "づ", "て": "で", "と": "ど", "は": "ば", "ひ": "び", "ふ": "ぶ", "へ": "べ", "ほ": "ぼ" };
const SOURDE = Object.fromEntries(Object.entries(VOISEE).map(([a, b]) => [b, a]));
const RANGEE_O = "おこごそぞとどのほぼぽもよろょ", RANGEE_U = "うくぐすずつづぬふぶぷむゆるゅ";

// pièges phonétiques sur un radical (voisement, voyelle longue, っ retiré, ゃゅょ)
function pieges(r) {
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
  return [...res].filter((x) => x && x !== r);
}

function lecturesInterdites(fiche) {
  const s = new Set(fiche.toutes);
  for (const l of fiche.lectures) { s.add(sansParentheses(l)); s.add(decoupe(l).rad); }
  return s;
}

// QCM d'une prononciation d'un kanji : toutes les propositions gardent les kana affichés après le kanji,
// et aucun piège n'est une lecture valable du kanji
function qcmLecture(fiche, lecture, toutesFiches, alea = Math.random) {
  const d = decoupe(lecture);
  const forme = (r) => (d.avant ? `(${d.avant})` : "") + r + d.okuri;
  const bonne = forme(d.rad);
  const interdit = lecturesInterdites(fiche);
  const contracte = new Set([...interdit].filter((l) => l.length >= 2 && "くつきち".includes(l[l.length - 1])).map((l) => l.slice(0, -1) + "っ"));
  const ok = (r) => r && r !== d.rad && !interdit.has(r) && !interdit.has(r + d.okuri) && !contracte.has(r);
  const choix = new Set();
  for (const p of melanger(pieges(d.rad), alea)) { if (choix.size >= 2) break; if (ok(p)) choix.add(p); }
  const ecart = (x) => (!!x[1] !== !!d.okuri ? 100 : 0) + Math.abs(x[0].length - d.rad.length);
  const autres = melanger(toutesFiches.filter((f) => f.kanji !== fiche.kanji).flatMap((f) => f.lectures.map((l) => { const x = decoupe(l); return [x.rad, x.okuri]; })), alea)
    .sort((a, b) => ecart(a) - ecart(b));
  for (const [r] of autres) { if (choix.size >= 3) break; if (ok(r)) choix.add(r); }
  return { bonne, options: melanger([bonne, ...[...choix].map(forme)], alea) };
}

// sens : un piège ne doit jamais être une réponse valable. On écarte toute proposition qui reprend un des sens
// interdits (morceau identique, ou mot de plus de 3 lettres en commun).
const morceaux = (s) => s.toLowerCase().split(/[,;]/).map((x) => x.replace(/\(.*?\)/g, "").trim()).filter(Boolean);
const motsLongs = (s) => s.toLowerCase().split(/[^\p{L}]+/u).filter((m) => m.length > 3);
function filtreSens(interdits) {
  const P = new Set(), M = new Set();
  for (const s of interdits) { for (const p of morceaux(s)) P.add(p); for (const m of motsLongs(s)) M.add(m); }
  return (cand) => !morceaux(cand).some((p) => P.has(p)) && !motsLongs(cand).some((m) => M.has(m));
}
function qcmSensTexte(bonne, candidats, interdits, alea = Math.random) {
  const libre = filtreSens([bonne, ...interdits]);
  const choix = [];
  for (const c of melanger([...new Set(candidats)], alea)) {
    if (choix.length >= 3) break;
    if (c !== bonne && libre(c) && filtreSens(choix)(c)) choix.push(c);     // pas deux pièges qui disent la même chose
  }
  return { bonne, options: melanger([bonne, ...choix], alea) };
}
// carte de sens n° i d'un kanji : on écarte tous les sens connus du kanji (ses autres cartes comprises)
function qcmSens(fiche, i, toutesFiches, alea = Math.random) {
  return qcmSensTexte(fiche.sensCartes[i], toutesFiches.filter((f) => f.kanji !== fiche.kanji).flatMap((f) => f.sensCartes), fiche.interdits, alea);
}
// sens d'un mot : de préférence des mots du même type (nom, verbe…) ; si le mot est un kanji seul, ses sens sont écartés
function qcmSensMot(mot, tousMots, parKanji, alea = Math.random) {
  const meme = tousMots.filter((m) => m.mot !== mot.mot && m.type === mot.type).map((m) => m.fr);
  const autres = tousMots.filter((m) => m.mot !== mot.mot && m.type !== mot.type).map((m) => m.fr);
  const f = parKanji && parKanji[mot.mot];
  const interdits = f ? f.interdits : [];
  const r = qcmSensTexte(mot.fr, melanger(meme, alea).slice(0, 40), interdits, alea);
  if (r.options.length < 4) return qcmSensTexte(mot.fr, [...meme, ...autres], interdits, alea);
  return r;
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

const SRSLib = { SRS, H, J, nomRang, cleJour, debutJour, plusJours, marges, fenetre, etatVide, migrer, rangDe, introduite, placer, repondre,
  repondreAcquis, appliquerRetards, aJouer, aAvancer, prochaineOuverture, pauser, reprendre, debloquee, prochaineNouvelle,
  typeCarte, enregistrerReponse, ajouterTemps, tempsJour, tauxReussite, tauxParRang, secondesParCarte, secondesParType, estimation, tempsActif,
  tendance, tempsTenu, tempsHabituel, cartesParJour, cartesDuJour, effortParJour, effortDuJour, coutCarte, calculerObjectif, objectifDuJour, prochaineLointaine, ramener, objectifs, noterHistorique, projeter, melanger, decoupe, affichageLecture, reponseLecture, pieges, filtreSens,
  qcmLecture, qcmSens, qcmSensMot, qcmLectureMot };
if (typeof window !== "undefined") window.SRSLib = SRSLib;
