// Interface de l'appli kanji. Données : window.KANJI (data.js). Logique : window.SRSLib (srs.js).
"use strict";
(() => {
  const L = window.SRSLib, S = L.SRS;
  const FICHES = window.KANJI;
  const PAR_KANJI = Object.fromEntries(FICHES.map((f) => [f.kanji, f]));
  const ORDRE = FICHES.map((f) => f.kanji);
  const CLE = "kanjiApp.v1";
  const maintenant = () => Date.now() + (window.__decalage || 0);   // __decalage : tests seulement

  // ---------- état ----------
  let etat;
  function charger() {
    try { etat = JSON.parse(localStorage.getItem(CLE)) || L.etatVide(); } catch (e) { etat = L.etatVide(); }
    if (!etat.tuiles) etat = L.etatVide();
  }
  function sauver() { try { localStorage.setItem(CLE, JSON.stringify(etat)); } catch (e) { alerte("Impossible d'enregistrer la progression sur ce téléphone."); } }
  charger();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ---------- outils d'affichage ----------
  const $ = (s) => document.querySelector(s);
  const ecran = $("#ecran");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function alerte(msg) { const a = document.createElement("div"); a.className = "toast"; a.textContent = msg; document.body.appendChild(a); setTimeout(() => a.remove(), 3500); }
  function duree(ms) {
    if (ms <= 0) return "maintenant";
    const m = Math.round(ms / 60000);
    if (m < 60) return `dans ${m} min`;
    const h = Math.round(ms / 3600000);
    if (h < 48) return `dans ${h} h`;
    return `dans ${Math.round(ms / 86400000)} jours`;
  }
  const etoile = (f) => `<span class="et ${f.niveau === "N5" ? "n5" : "n4"}">★</span>`;
  function ficheHTML(f, typeMisEnAvant) {
    const ex = f.exemples.map((e) => `<li><span class="jp">${esc(e.mot)}</span> <span class="kana">${esc(e.kana)}</span> <span class="fr">${esc(e.fr)}</span></li>`).join("");
    return `<div class="fiche">
      <div class="fiche-tete"><span class="fiche-k jp">${esc(f.kanji)}</span>${etoile(f)}
        <div><div class="fiche-sens ${typeMisEnAvant === "sens" ? "fort" : ""}">${esc(f.sens)}</div>
        <div class="fiche-lect jp ${typeMisEnAvant === "lecture" ? "fort" : ""}">${f.lectures.map(esc).join(" ・ ")}</div>
        <div class="fiche-info">${f.niveau} · ${f.traits} traits</div></div></div>
      <ul class="fiche-ex">${ex}</ul></div>`;
  }
  function onglets(actif) {
    document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("actif", b.dataset.vue === actif));
  }

  // ---------- accueil ----------
  function accueil() {
    onglets("accueil");
    const t = maintenant();
    const absents = L.appliquerAbsences(etat, t);
    if (absents) { sauver(); alerte(`${absents} tuile(s) redescendue(s) d'un palier après une longue absence.`); }
    const dues = L.revisionsDues(etat, t);
    const suivant = L.kanjiSuivant(etat, ORDRE);
    const reglageRestant = L.kanjiSuivantReglage(etat, ORDRE);
    const prochaine = L.prochaineRevision(etat);
    const c = L.compter(etat, ORDRE);
    const acquis = c.paliers[S.ACQUIS];
    let principal;
    if (dues.length) principal = `<button class="gros" id="b-rev">Réviser <b>${dues.length}</b> tuile${dues.length > 1 ? "s" : ""}</button>`;
    else if (suivant) principal = `<p class="info">Aucune révision en attente.</p><button class="gros" id="b-lecon">Nouvelle leçon : <span class="jp">${esc(suivant)}</span> ${etoile(PAR_KANJI[suivant])}</button>`;
    else principal = `<p class="info">Toutes les leçons sont faites. Bravo !</p>`;
    ecran.innerHTML = `
      <h1>Kanji JLPT <span class="sous">N5 · N4</span></h1>
      ${principal}
      <p class="info">${prochaine && !dues.length ? `Prochaine révision ${duree(prochaine - t)}.` : ""}</p>
      <div class="chiffres">
        <div><b>${490 - c.jamais - c.a_apprendre}</b><span>tuiles en cours</span></div>
        <div><b>${acquis}</b><span>acquises</span></div>
        <div><b>${c.jamais + c.a_apprendre}</b><span>à découvrir</span></div>
      </div>
      ${reglageRestant ? `<button class="second" id="b-reglage">Test de réglage (${c.jamais} tuiles jamais testées)</button>
        <p class="aide">Passe les tuiles que tu connais peut-être déjà pour te placer directement au bon palier. Tu peux t'arrêter quand tu veux.</p>` : ""}`;
    if ($("#b-rev")) $("#b-rev").onclick = () => demarrerRevision(dues);
    if ($("#b-lecon")) $("#b-lecon").onclick = () => demarrerLecon(suivant);
    if ($("#b-reglage")) $("#b-reglage").onclick = () => demarrerReglage();
  }

  // ---------- question QCM générique ----------
  // q = { kanji, type, chrono (s ou null), titre }  -> rappel(resultat) : "juste" | "faux" | "jsp" | "temps"
  let minuteur = null;
  function poser(q, rappel) {
    const f = PAR_KANJI[q.kanji];
    const g = q.type === "sens" ? L.qcmSens(f, FICHES) : L.qcmLecture(f, FICHES);
    const consigne = q.type === "sens" ? "Que signifie ce kanji ?" : "Quelle lecture (hiragana) ?";
    ecran.innerHTML = `
      <div class="q-tete"><span>${esc(q.titre || "")}</span>${q.chrono ? `<span class="chrono" id="chrono">${q.chrono} s</span>` : ""}</div>
      ${q.chrono ? `<div class="barre"><div id="barre"></div></div>` : ""}
      <div class="q-kanji jp">${esc(f.kanji)}</div>
      <p class="consigne">${consigne}</p>
      <div class="options">
        ${g.options.map((o, i) => `<button class="opt ${q.type === "lecture" ? "jp" : ""}" data-i="${i}">${esc(o)}</button>`).join("")}
        <button class="opt jsp" data-i="jsp">Je ne sais pas</button>
      </div>`;
    let fini = false;
    const finir = (res, choisi) => {
      if (fini) return; fini = true;
      clearInterval(minuteur);
      document.querySelectorAll(".opt").forEach((b) => {
        b.disabled = true;
        const v = b.dataset.i === "jsp" ? null : g.options[+b.dataset.i];
        if (v === g.bonne) b.classList.add("bonne");
        else if (b === choisi) b.classList.add("mauvaise");
      });
      setTimeout(() => rappel(res, g.bonne), res === "juste" ? 450 : 250);
    };
    document.querySelectorAll(".opt").forEach((b) => b.onclick = () => {
      if (b.dataset.i === "jsp") return finir("jsp", b);
      finir(g.options[+b.dataset.i] === g.bonne ? "juste" : "faux", b);
    });
    if (q.chrono) {
      const debut = performance.now();
      minuteur = setInterval(() => {
        const reste = q.chrono - (performance.now() - debut) / 1000;
        const c = $("#chrono"), br = $("#barre");
        if (c) c.textContent = `${Math.max(0, Math.ceil(reste))} s`;
        if (br) br.style.width = `${Math.max(0, (reste / q.chrono) * 100)}%`;
        if (reste <= 0) finir("temps", null);
      }, 100);
    }
  }

  function retour(res, f, type, palierTexte, suite) {
    const titres = { juste: "Juste !", faux: "Raté", jsp: "Pas grave, voici la réponse", temps: "Temps écoulé" };
    ecran.innerHTML = `<div class="retour ${res === "juste" ? "ok" : "ko"}">${titres[res]}</div>
      ${palierTexte ? `<p class="palier">${palierTexte}</p>` : ""}
      ${ficheHTML(f, type)}
      <button class="gros" id="b-suite">Continuer</button>`;
    $("#b-suite").onclick = suite;
  }

  // ---------- révisions ----------
  function demarrerRevision(ids) {
    const file = L.melanger(ids).map((id) => ({ id, rattrapage: false }));
    let fait = 0;
    const total = file.length;
    const suivante = () => {
      if (!file.length) return finSeance(`Révisions terminées (${total} tuile${total > 1 ? "s" : ""}).`);
      const it = file.shift();
      const [kanji, type] = it.id.split(":");
      const t = etat.tuiles[it.id];
      const chrono = it.rattrapage ? null : (S.CHRONO[t.palier] || null);
      poser({ kanji, type, chrono, titre: `${it.rattrapage ? "À revoir" : "Révision"} · ${fait + 1}/${total} · ${S.NOMS[t.palier]}` }, (res) => {
        const f = PAR_KANJI[kanji];
        if (it.rattrapage) {
          if (res === "juste") return suivante();
          file.push(it);
          return retour(res, f, type, null, suivante);
        }
        fait++;
        const juste = res === "juste";
        const avant = t.palier;
        const apres = L.repondre(etat, it.id, juste, maintenant());
        sauver();
        if (juste) {
          if (apres === S.ACQUIS) return retour("juste", f, type, `🏆 Tuile définitivement acquise !`, suivante);
          return suivante();
        }
        file.push({ id: it.id, rattrapage: true });
        retour(res, f, type, `${S.NOMS[avant]} → ${S.NOMS[apres]}`, suivante);
      });
    };
    suivante();
  }

  function finSeance(msg) {
    ecran.innerHTML = `<div class="retour ok">${esc(msg)}</div><button class="gros" id="b-fin">Retour à l'accueil</button>`;
    $("#b-fin").onclick = accueil;
  }

  // ---------- réglage d'une tuile (leçon et test de réglage) ----------
  function reglerTuile(kanji, type, titre, fin) {
    poser({ kanji, type, chrono: null, titre }, (res) => {
      const id = L.idTuile(kanji, type);
      if (res !== "juste") { L.placer(etat, id, 0, maintenant()); sauver(); return fin(false); }
      const niveaux = [["tres_peu", "Très peu (c'était de la chance)"], ["un_peu", "Un peu"], ["moyen", "Moyen"], ["bien", "Bien"], ["tres_bien", "Très bien"]];
      ecran.innerHTML = `<div class="retour ok">Juste !</div>
        <div class="q-kanji petit jp">${esc(kanji)}</div>
        <p class="consigne">Tu le connaissais comment ?</p>
        <div class="options">${niveaux.map(([k, t]) => `<button class="opt" data-c="${k}">${t}</button>`).join("")}</div>`;
      document.querySelectorAll("[data-c]").forEach((b) => b.onclick = () => {
        L.placer(etat, id, S.CONFIANCE[b.dataset.c], maintenant());
        sauver();
        fin(S.CONFIANCE[b.dataset.c] > 0);
      });
    });
  }

  // ---------- leçon : un kanji ----------
  function demarrerLecon(kanji) {
    const f = PAR_KANJI[kanji];
    const etapes = ["sens", "lecture"].filter((type) => !etat.tuiles[L.idTuile(kanji, type)]);
    let i = 0;
    const etape = () => {
      if (i >= etapes.length) return montrerFiche();
      const type = etapes[i++];
      reglerTuile(kanji, type, `Leçon ${kanji} · étape ${i}/${etapes.length} · ${type === "sens" ? "sens" : "lecture"}`, etape);
    };
    const montrerFiche = () => {
      const aApprendre = ["sens", "lecture"].filter((type) => etat.tuiles[L.idTuile(kanji, type)].statut !== "placee");
      ecran.innerHTML = `<p class="palier">${aApprendre.length ? "À retenir :" : "Déjà connu, tu es placé directement plus haut sur l'échelle."}</p>
        ${ficheHTML(f, aApprendre.length === 1 ? aApprendre[0] : null)}
        <button class="gros" id="b-ok">${aApprendre.length ? "C'est noté" : "Continuer"}</button>`;
      $("#b-ok").onclick = () => {
        for (const type of aApprendre) L.apprendre(etat, L.idTuile(kanji, type), maintenant());
        sauver();
        accueil();
      };
    };
    etape();
  }

  // ---------- test de réglage : toutes les tuiles jamais testées ----------
  function demarrerReglage() {
    const total = 490;
    const suivant = () => {
      const k = L.kanjiSuivantReglage(etat, ORDRE);
      if (!k) return finSeance("Test de réglage terminé !");
      const type = etat.tuiles[L.idTuile(k, "sens")] ? "lecture" : "sens";
      const c = L.compter(etat, ORDRE);
      reglerTuile(k, type, `Réglage · ${total - c.jamais + 1}/${total} · ${type === "sens" ? "sens" : "lecture"}`, suivant);
      const stop = document.createElement("button");
      stop.className = "lien"; stop.textContent = "Arrêter le test (reprise possible)";
      stop.onclick = () => { clearInterval(minuteur); accueil(); };
      ecran.appendChild(stop);
    };
    suivant();
  }

  // ---------- onglet Acquis ----------
  function vueAcquis() {
    onglets("acquis");
    const ids = Object.entries(etat.tuiles).filter(([, t]) => t.statut === "placee" && t.palier === S.ACQUIS).map(([id]) => id);
    ecran.innerHTML = `<h1>Acquis</h1>
      <p class="info">${ids.length} tuile${ids.length > 1 ? "s" : ""} acquise${ids.length > 1 ? "s" : ""}.</p>
      <p class="aide">Entraîne-toi sur ce que tu as déjà acquis, avec 12 s par question. Une erreur fait redescendre la tuile au palier « Chrono 12 s ».</p>
      ${ids.length ? `<button class="gros" id="b-acq">S'entraîner (${Math.min(20, ids.length)} questions)</button>` : ""}`;
    if (!ids.length) return;
    $("#b-acq").onclick = () => {
      const file = L.melanger(ids).slice(0, 20);
      let n = 0, ratees = 0;
      const suivante = () => {
        if (!file.length) { finSeance(`Entraînement terminé : ${n - ratees}/${n} justes.`); return; }
        const id = file.shift(); n++;
        const [kanji, type] = id.split(":");
        poser({ kanji, type, chrono: 12, titre: `Acquis · ${n}/${n + file.length}` }, (res) => {
          const juste = res === "juste";
          L.repondreAcquis(etat, id, juste, maintenant()); sauver();
          if (juste) return suivante();
          ratees++;
          retour(res, PAR_KANJI[kanji], type, `Acquis → ${S.NOMS[10]}`, suivante);
        });
      };
      suivante();
    };
  }

  // ---------- onglet Progrès ----------
  function vueProgres() {
    onglets("progres");
    const groupes = [["Jamais vues", (t) => !t], ["À apprendre", (t) => t && t.statut !== "placee"],
      ["Apprenti", (t) => t && t.statut === "placee" && t.palier <= 4], ["Confirmé", (t) => t && t.statut === "placee" && (t.palier === 5 || t.palier === 6)],
      ["Maîtrisé / Expert", (t) => t && t.statut === "placee" && (t.palier === 7 || t.palier === 8)],
      ["Chrono", (t) => t && t.statut === "placee" && (t.palier === 9 || t.palier === 10)], ["Acquis", (t) => t && t.statut === "placee" && t.palier === S.ACQUIS]];
    const lignes = ["N5", "N4"].map((niv) => {
      const ks = FICHES.filter((f) => f.niveau === niv).map((f) => f.kanji);
      const tuiles = ks.flatMap((k) => ["sens", "lecture"].map((ty) => etat.tuiles[L.idTuile(k, ty)]));
      return `<tr><th>${niv}</th>${groupes.map(([, fn]) => `<td>${tuiles.filter(fn).length}</td>`).join("")}</tr>`;
    }).join("");
    const couleur = (k) => {
      const ps = ["sens", "lecture"].map((ty) => { const t = etat.tuiles[L.idTuile(k, ty)]; return t && t.statut === "placee" ? t.palier : 0; });
      const m = Math.min(...ps);
      return m === 0 ? "g0" : m <= 4 ? "g1" : m <= 6 ? "g2" : m <= 8 ? "g3" : m <= 10 ? "g4" : "g5";
    };
    ecran.innerHTML = `<h1>Progrès</h1>
      <table class="stats"><tr><th></th>${groupes.map(([n]) => `<th>${n}</th>`).join("")}</tr>${lignes}</table>
      <p class="aide">Chaque kanji a 2 tuiles (sens et lecture). Couleur = la moins avancée des deux. Touche un kanji pour voir sa fiche.</p>
      <div class="grille">${FICHES.map((f) => `<button class="case ${couleur(f.kanji)} jp" data-k="${esc(f.kanji)}">${esc(f.kanji)}</button>`).join("")}</div>
      <div class="legende-g"><span class="g0">pas commencé</span><span class="g1">apprenti</span><span class="g2">confirmé</span><span class="g3">maîtrisé</span><span class="g4">chrono</span><span class="g5">acquis</span></div>`;
    document.querySelectorAll(".case").forEach((b) => b.onclick = () => {
      const k = b.dataset.k;
      const det = ["sens", "lecture"].map((ty) => { const t = etat.tuiles[L.idTuile(k, ty)]; return `${ty} : ${!t ? "jamais vue" : t.statut !== "placee" ? "à apprendre" : S.NOMS[t.palier] + (t.due ? ", révision " + duree(t.due - maintenant()) : "")}`; }).join("<br>");
      ecran.innerHTML = `${ficheHTML(PAR_KANJI[k])}<p class="palier">${det}</p><button class="gros" id="b-r">Retour</button>`;
      $("#b-r").onclick = vueProgres;
    });
  }

  // ---------- onglet Options ----------
  function vueOptions() {
    onglets("options");
    ecran.innerHTML = `<h1>Options</h1>
      <p class="aide">Ta progression est enregistrée sur ce téléphone. Fais une sauvegarde de temps en temps (fichier dans Téléchargements) pour ne rien perdre.</p>
      <button class="second" id="b-sauv">Sauvegarder ma progression</button>
      <label class="second fichier">Restaurer une sauvegarde<input type="file" id="f-rest" accept=".json,application/json"></label>
      <button class="second danger" id="b-raz">Tout effacer et recommencer</button>
      <h2>Règles</h2>
      <p class="aide">Paliers : Apprenti 1 à 4 (4 h, 8 h, 1 j, 2 j), Confirmé 1 et 2 (1 et 2 semaines), Maîtrisé (1 mois), Expert (4 mois), puis Chrono 30 s et Chrono 12 s (1 mois chacun) et enfin Acquis.
      Erreur : -2 paliers (-1 aux paliers chrono). Absence très longue : -1 palier. Nouvelle leçon seulement quand il n'y a plus de révision.</p>
      <h2>Sources</h2>
      <p class="aide">Kanji, lectures : KANJIDIC2 (EDRDG, licence CC BY-SA 4.0). Listes N5/N4 : tanos.co.uk (J. Waller, CC BY) et ebooks Kanpai. Listes non officielles (pas de liste officielle depuis 2010).</p>`;
    $("#b-sauv").onclick = () => {
      const blob = new Blob([JSON.stringify(etat)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `kanji-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    $("#f-rest").onchange = (e) => {
      const fi = e.target.files[0]; if (!fi) return;
      fi.text().then((txt) => {
        const e2 = JSON.parse(txt);
        if (!e2 || !e2.tuiles) throw new Error("format");
        if (!confirm("Remplacer la progression actuelle par cette sauvegarde ?")) return;
        etat = e2; sauver(); alerte("Sauvegarde restaurée."); accueil();
      }).catch(() => alerte("Ce fichier n'est pas une sauvegarde valable."));
    };
    $("#b-raz").onclick = () => {
      if (!confirm("Effacer toute ta progression ?")) return;
      if (!confirm("Vraiment ? C'est définitif (sauf si tu as une sauvegarde).")) return;
      etat = L.etatVide(); sauver(); accueil();
    };
  }

  // ---------- navigation ----------
  const VUES = { accueil, progres: vueProgres, acquis: vueAcquis, options: vueOptions };
  document.querySelectorAll("nav button").forEach((b) => b.onclick = () => { clearInterval(minuteur); VUES[b.dataset.vue](); });
  window.__app = { accueil, etat: () => etat, recharger: () => { charger(); accueil(); } };   // tests
  accueil();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
