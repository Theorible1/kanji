// Interface de l'appli kanji. Données : window.KANJI, window.MOTS (data.js). Logique : window.SRSLib (srs.js).
"use strict";
(() => {
  const L = window.SRSLib, S = L.SRS;
  const FICHES = window.KANJI, MOTS = window.MOTS;
  const PAR_KANJI = Object.fromEntries(FICHES.map((f) => [f.kanji, f]));
  const PAR_MOT = Object.fromEntries(MOTS.map((m) => [m.mot, m]));
  const CLE = "kanjiApp.v1";
  const maintenant = () => Date.now() + (window.__decalage || 0);   // __decalage : tests seulement

  // ---------- cartes (ordre d'apprentissage) ----------
  const CARTES = [];
  for (const f of FICHES) for (const ty of ["sens", "lecture"]) CARTES.push({ id: `k:${f.kanji}:${ty}`, phase: "kanji", niveau: f.niveau, prerequis: [] });
  for (const m of MOTS) for (const ty of m.lecture ? ["sens", "lecture"] : ["sens"]) CARTES.push({ id: `m:${m.mot}:${ty}`, phase: m.phase, niveau: m.niveau, prerequis: m.kanji });
  const IDS = CARTES.map((c) => c.id);
  // ce qu'on travaille (Paramètres) : "N5", "N4" ou "N5N4". En N4 seul, les kanji N5 sont supposés connus (pas de prérequis).
  const CHOIX_NIVEAUX = { N5: "N5 seulement", N4: "N4 seulement", N5N4: "N5 + N4" };
  const actifs = {};
  function cartesActives() {
    const ch = (etat && CHOIX_NIVEAUX[etat.reglages.niveaux]) ? etat.reglages.niveaux : "N5N4";
    if (!actifs[ch]) {
      const ok = (niv) => ch.includes(niv);
      const cartes = CARTES.filter((c) => ok(c.niveau)).map((c) => Object.assign({}, c, { prerequis: c.prerequis.filter((k) => ok(PAR_KANJI[k].niveau)) }));
      actifs[ch] = { choix: ch, cartes, ids: cartes.map((c) => c.id) };
    }
    return actifs[ch];
  }
  function info(id) {
    const [genre, cle, type] = id.split(":");
    return genre === "k" ? { genre, type, fiche: PAR_KANJI[cle], cle } : { genre, type, mot: PAR_MOT[cle], cle };
  }

  // ---------- état ----------
  let etat;
  function charger() {
    try { etat = L.migrer(JSON.parse(localStorage.getItem(CLE))); } catch (e) { etat = L.etatVide(); }
  }
  function sauver() {
    L.noterHistorique(etat, cartesActives().ids, maintenant());
    try { localStorage.setItem(CLE, JSON.stringify(etat)); } catch (e) { alerte("Impossible d'enregistrer la progression sur ce téléphone."); }
  }
  charger();

  // ---------- thème (repris du dashboard ; défaut = futuriste confort · ardoise, celui de style.css) ----------
  const THEME_DEFAUT = "futur-confort-ardoise";
  const NOMS_THEMES = Object.fromEntries((window.THEMES || []).flatMap(([, ts]) => ts));
  const sombre = matchMedia("(prefers-color-scheme: dark)");
  function appliquerTheme() {
    let t = etat.reglages.theme || THEME_DEFAUT;
    if (!NOMS_THEMES[t]) t = THEME_DEFAUT;
    try { localStorage.setItem("kanjiApp.theme", t); } catch (e) {}
    if (t === "auto") t = sombre.matches ? "dark" : "light";
    if (t === THEME_DEFAUT) document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue("--page").trim() || "#16181c";
  }
  appliquerTheme();
  sombre.addEventListener("change", () => { if (etat.reglages.theme === "auto") appliquerTheme(); });
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ---------- outils d'affichage ----------
  const $ = (s) => document.querySelector(s);
  const ecran = $("#ecran");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const maj = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  // fenêtre de confirmation (boutons : [[texte, classe, action]] ; toucher le fond = annuler)
  function fenetre(titre, texte, boutons) {
    const f = document.createElement("div");
    f.className = "fenetre";
    f.innerHTML = `<div class="fenetre-boite" role="dialog" aria-modal="true"><h2>${titre}</h2><p>${texte}</p>
      ${boutons.map(([tx, cl], i) => `<button class="${cl}" data-f="${i}">${tx}</button>`).join("")}</div>`;
    document.body.appendChild(f);
    const fermer = () => f.remove();
    f.onclick = (e) => { if (e.target === f) fermer(); };
    f.querySelectorAll("[data-f]").forEach((b) => b.onclick = () => { fermer(); const a = boutons[+b.dataset.f][2]; if (a) a(); });
  }
  function alerte(msg) { const a = document.createElement("div"); a.className = "toast"; a.textContent = msg; document.body.appendChild(a); setTimeout(() => a.remove(), 2200); }
  function duree(ms) {
    if (ms <= 0) return "maintenant";
    const m = Math.round(ms / 60000);
    if (m < 60) return `dans ${m} min`;
    const h = Math.round(ms / 3600000);
    if (h < 48) return `dans ${h} h`;
    return `dans ${Math.round(ms / 86400000)} jours`;
  }
  const etoile = (niv) => `<span class="et ${niv === "N5" ? "n5" : "n4"}">★</span>`;
  // mot avec furigana : seulement sur les kanji hors liste (classe f), ou partout si tout = true
  function motHTML(m, tout) {
    return m.seg.map(([t, l, c]) => (c === "f" || (tout && c === "k")) ? `<ruby>${esc(t)}<rt>${esc(l)}</rt></ruby>` : esc(t)).join("");
  }
  function ficheHTML(id, typeMisEnAvant) {
    const x = info(id);
    if (x.genre === "k") {
      const f = x.fiche;
      const ex = f.exemples.map((e) => `<li><span class="jp">${esc(e.mot)}</span> <span class="kana">${esc(e.kana)}</span> <span class="fr">${esc(e.fr)}</span></li>`).join("");
      return `<div class="fiche">
        <div class="fiche-tete"><span class="fiche-k jp">${esc(f.kanji)}</span>${etoile(f.niveau)}
          <div><div class="fiche-sens ${typeMisEnAvant === "sens" ? "fort" : ""}">${esc(maj(f.sens))}</div>
          <div class="fiche-lect jp ${typeMisEnAvant === "lecture" ? "fort" : ""}">${f.lectures.map(esc).join(" ・ ")}</div>
          <div class="fiche-info">Kanji ${f.niveau} · ${f.traits} traits</div></div></div>
        <ul class="fiche-ex">${ex}</ul></div>`;
    }
    const m = x.mot;
    const comp = m.kanji.map((k) => `<li><span class="jp">${esc(k)}</span>${etoile(PAR_KANJI[k].niveau)} <span class="fr">${esc(PAR_KANJI[k].sens)}</span></li>`).join("");
    return `<div class="fiche">
      <div class="fiche-mot jp">${motHTML(m, true)}</div>
      <div class="fiche-lect jp ${typeMisEnAvant === "lecture" ? "fort" : ""}">${esc(m.kana)}</div>
      <div class="fiche-sens ${typeMisEnAvant === "sens" ? "fort" : ""}">${esc(maj(m.fr))}</div>
      <div class="fiche-info">Mot ${m.phase === "combo" ? "de vocabulaire niveau 1 (kanji tous à connaître)" : "de vocabulaire niveau 2 (furigana sur les kanji hors liste)"}${m.special ? " · lecture particulière" : ""}</div>
      <ul class="fiche-ex">${comp}</ul></div>`;
  }
  function onglets(actif) { document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("actif", b.dataset.vue === actif)); }

  // ---------- chronométrage du temps actif ----------
  let cache = 0, debutCache = null;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) debutCache = performance.now();
    else if (debutCache !== null) { cache += performance.now() - debutCache; debutCache = null; }
  });

  // ---------- une question (QCM 4 choix + « Je ne sais pas ») ----------
  // rappel(res, secondesActives) avec res = "juste" | "faux" | "jsp" | "temps"
  let minuteur = null;
  function poser(id, opts, rappel) {
    const x = info(id);
    let g, visuel, consigne;
    if (x.genre === "k") {
      g = x.type === "sens" ? L.qcmSens(x.fiche, FICHES) : L.qcmLecture(x.fiche, FICHES);
      visuel = `<div class="q-kanji jp">${esc(x.fiche.kanji)}</div>`;
      consigne = x.type === "sens" ? "Que signifie ce kanji ?" : "Quelle lecture (hiragana) ?";
    } else {
      g = x.type === "sens" ? L.qcmSensMot(x.mot, MOTS) : L.qcmLectureMot(x.mot, MOTS, PAR_KANJI);
      const lg = [...x.mot.mot].length;
      visuel = `<div class="q-mot jp" style="font-size:${Math.min(76, Math.floor(320 / Math.max(lg, 2)))}px">${motHTML(x.mot, false)}</div>`;
      consigne = x.type === "sens" ? "Que signifie ce mot ?" : "Comment se lit ce mot ?";
    }
    if (x.type === "sens") g.options = g.options.map(maj), g.bonne = maj(g.bonne);
    window.__bonne = g.bonne;   // tests
    ecran.innerHTML = `
      <div class="q-tete"><span>${esc(opts.titre || "")}</span>${opts.chrono ? `<span class="chrono" id="chrono">${opts.chrono} s</span>` : ""}<button class="quitter" id="b-quit">✕</button></div>
      ${opts.chrono ? `<div class="barre"><div id="barre"></div></div>` : ""}
      ${visuel}
      <p class="consigne">${consigne}</p>
      <div class="options">
        ${g.options.map((o, i) => `<button class="opt ${x.type === "lecture" ? "jp" : ""}" data-i="${i}">${esc(o)}</button>`).join("")}
        <button class="opt jsp" data-i="jsp">Je ne sais pas</button>
      </div>
      <div id="correction"></div>`;
    $("#b-quit").onclick = () => { clearInterval(minuteur); accueil(); };
    cache = 0; debutCache = document.hidden ? performance.now() : null;
    const debut = performance.now();
    let fini = false;
    const secondes = () => Math.max(0, (performance.now() - debut - cache) / 1000);
    const finir = (res, choisi) => {
      if (fini) return; fini = true;
      clearInterval(minuteur);
      const sec = secondes();
      let bonneBtn = null;
      document.querySelectorAll(".opt").forEach((b) => {
        const v = b.dataset.i === "jsp" ? null : g.options[+b.dataset.i];
        if (v === g.bonne) { b.classList.add("bonne"); bonneBtn = b; }
        else { b.disabled = true; if (b === choisi) b.classList.add("mauvaise"); }
      });
      if (res === "juste") { bonneBtn.disabled = true; setTimeout(() => rappel(res, sec), 450); return; }
      // erreur : on laisse le temps de lire ; on avance avec « Continuer » ou en touchant la bonne réponse
      const titres = { faux: "Raté", jsp: "Voici la réponse", temps: "Temps écoulé" };
      $("#correction").innerHTML = `<div class="retour ko">${titres[res]}</div>${opts.texteErreur ? `<p class="palier">${opts.texteErreur}</p>` : ""}
        ${ficheHTML(id, x.type)}<button class="gros" id="b-suite">Continuer</button>`;
      const suite = () => rappel(res, sec);
      $("#b-suite").onclick = suite;
      bonneBtn.onclick = suite;
      bonneBtn.classList.add("cliquable");
      bonneBtn.scrollIntoView({ block: "nearest" });
    };
    document.querySelectorAll(".opt").forEach((b) => b.onclick = () => {
      if (b.dataset.i === "jsp") return finir("jsp", b);
      finir(g.options[+b.dataset.i] === g.bonne ? "juste" : "faux", b);
    });
    if (opts.chrono) {
      minuteur = setInterval(() => {
        const reste = opts.chrono - secondes();
        const c = $("#chrono"), br = $("#barre");
        if (c) c.textContent = `${Math.max(0, Math.ceil(reste))} s`;
        if (br) {
          const r = Math.max(0, reste / opts.chrono);
          br.style.width = `${r * 100}%`;
          br.className = r > .5 ? "plein" : r > .25 ? "moitie" : "fin";
        }
        if (reste <= 0) finir("temps", null);
      }, 100);
    }
  }
  function ajouterTemps(sec) {
    const j = L.cleJour(maintenant());
    etat.profil.jours[j] = Math.round(((etat.profil.jours[j] || 0) + sec) * 10) / 10;
  }


  // ---------- feu d'artifice (révisions du jour terminées) ----------
  function feuDArtifice(ensuite) {
    const c = document.createElement("canvas");
    c.className = "feu";
    const msg = document.createElement("div");
    msg.className = "feu-msg";
    msg.innerHTML = "Révisions du jour terminées !<span>Touche l'écran pour continuer</span>";
    document.body.append(c, msg);
    const ctx = c.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const W = c.width = innerWidth * dpr, Hh = c.height = innerHeight * dpr;
    const cs = getComputedStyle(document.documentElement);
    const couleurs = ["--accent", "--accent-ink", "--or", "--orange", "--vert", "--rouge", "--texte"].map((v) => cs.getPropertyValue(v).trim() || "#d9b25f");
    const fusees = [], eclats = [];
    let t0 = performance.now(), fini = false, dernier = 0;
    const lancer = () => fusees.push({ x: W * (0.15 + Math.random() * 0.7), y: Hh, vx: (Math.random() - .5) * 2 * dpr,
      vy: -(Hh / 60) * (0.75 + Math.random() * 0.25), cible: Hh * (0.15 + Math.random() * 0.35), c: couleurs[Math.floor(Math.random() * couleurs.length)] });
    const exploser = (f) => {
      const n = 70 + Math.floor(Math.random() * 40);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, v = (2 + Math.random() * 4) * dpr;
        eclats.push({ x: f.x, y: f.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vie: 1, c: Math.random() < .2 ? couleurs[6] : f.c });
      }
    };
    const fin = () => { if (fini) return; fini = true; c.remove(); msg.remove(); ensuite(); };
    c.onclick = msg.onclick = fin;
    const image = (t) => {
      if (fini) return;
      const ecoule = t - t0;
      if (ecoule < 3200 && t - dernier > 280) { lancer(); if (Math.random() < .5) lancer(); dernier = t; }
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.fillRect(0, 0, W, Hh);
      ctx.globalCompositeOperation = "lighter";
      for (let i = fusees.length - 1; i >= 0; i--) {
        const f = fusees[i];
        f.x += f.vx; f.y += f.vy; f.vy += 0.12 * dpr;
        ctx.fillStyle = f.c; ctx.fillRect(f.x - dpr, f.y - 3 * dpr, 2 * dpr, 6 * dpr);
        if (f.y <= f.cible || f.vy >= 0) { exploser(f); fusees.splice(i, 1); }
      }
      for (let i = eclats.length - 1; i >= 0; i--) {
        const e = eclats[i];
        e.x += e.vx; e.y += e.vy; e.vy += 0.06 * dpr; e.vx *= .985; e.vy *= .985; e.vie -= .011;
        if (e.vie <= 0) { eclats.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, e.vie); ctx.fillStyle = e.c;
        ctx.beginPath(); ctx.arc(e.x, e.y, 1.8 * dpr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (ecoule > 4300 && !fusees.length) return fin();
      requestAnimationFrame(image);
    };
    requestAnimationFrame(image);
    window.__feu = { fin };   // tests
  }

  // ---------- JOUER : révisions dues, puis nouvelles cartes dosées ----------
  function jouer() {
    // mode après l'objectif atteint : null (pas encore choisi), "normal" (cartes ajoutées quand même), "libre" (sans impact)
    const session = { rattrapage: [], depuis: 0, mode: null, faites: 0, nouvelles: 0, fete: false, vues: new Set(), challenge: null,
      relance: (etat.profil.jours[L.cleJour(maintenant())] || 0) > 0 };   // déjà joué aujourd'hui au moment d'ouvrir la partie
    const nomCarte = (id) => { const x = info(id); return `${x.genre === "k" ? "Kanji" : "Mot"} · ${x.type}`; };
    const suivante = () => {
      const t = maintenant();
      // une carte ratée revient après 3 autres cartes (ou tout de suite s'il n'y a plus rien d'autre)
      const dues = L.revisionsDues(etat, t).filter((id) => !session.rattrapage.includes(id));
      if (session.rattrapage.length && (session.depuis >= 3 || !dues.length)) return rattraper(session.rattrapage.shift());
      if (dues.length && session.challenge === null) {
        const n = dues.filter((id) => S.CHRONO[etat.tuiles[id].palier]).length;
        session.challenge = n ? "en cours" : "aucun";
        if (n) return annonceChallenge(dues.filter((id) => S.CHRONO[etat.tuiles[id].palier]), suivante);
      }
      if (session.challenge === "en cours" && !(dues.length && S.CHRONO[etat.tuiles[dues[0]].palier])) {
        session.challenge = "fini";
        if (dues.length) alerte("Challenge terminé ! Place aux révisions classiques.");
      }
      if (dues.length) return reviser(dues[0], dues.length);
      // plus de révision : feu d'artifice si on vient de les finir, puis nouvelle carte si le budget le permet
      if (session.faites > 0 && !session.fete) { session.fete = true; return feuDArtifice(suivante); }
      const prochaine = L.prochaineNouvelle(etat, cartesActives().cartes, session.mode === "libre" ? session.vues : null);
      if (!prochaine.carte) return finJeu(prochaine);
      if (!session.mode) {
        const s = L.nouvelleSupportable(etat, t);
        if (!s.ok) return objectifAtteint(s);
        // relance après avoir déjà joué aujourd'hui (révisions faites) : on redonne le choix normal / sans impact
        if (session.relance && session.faites === 0 && !session.choix) return choixRelance();
      }
      nouvelle(prochaine.carte.id, session.mode === "libre");
    };
    const reviser = (id, reste) => {
      const t0 = etat.tuiles[id];
      const avant = t0.palier;
      poser(id, { chrono: S.CHRONO[avant] || null, titre: `Révision · ${reste} restante${reste > 1 ? "s" : ""} · ${S.NOMS[avant]}` }, (res, sec) => {
        const juste = res === "juste";
        const actif = S.CHRONO[avant] ? Math.min(sec, S.CHRONO[avant]) : L.tempsActif(etat, sec);
        L.enregistrerReponse(etat, juste, actif, maintenant());
        const apres = L.repondre(etat, id, juste, maintenant());
        session.faites++; session.depuis++;
        if (!juste) { session.rattrapage.push(id); session.depuis = 0; }
        sauver();
        if (apres === S.ACQUIS) alerte("🏆 Carte définitivement acquise !");
        else if (!juste) alerte(`${S.NOMS[avant]} → ${S.NOMS[apres]}`);
        suivante();
      });
    };
    const rattraper = (id) => {
      session.depuis = 0;
      poser(id, { titre: "À revoir (ne change pas le palier)" }, (res, sec) => {
        ajouterTemps(L.tempsActif(etat, sec)); sauver();
        if (res !== "juste") session.rattrapage.push(id);
        suivante();
      });
    };
    // libre = mode sans impact : la carte n'entre dans les révisions que si sa note ne charge pas les 5 prochains jours
    const nouvelle = (id, libre) => {
      const x = info(id);
      const titre = libre ? `Sans impact · ${nomCarte(id)}` : `Nouvelle carte · ${nomCarte(id)}`;
      const texteErreur = libre ? "Pas ajoutée à tes révisions (mode sans impact) : elle reviendra plus tard." : "Carte ajoutée à tes révisions (Apprenti 1).";
      session.choix = true;   // une carte nouvelle a été posée : plus de question de relance dans cette partie
      poser(id, { titre, texteErreur }, (res, sec) => {
        ajouterTemps(L.tempsActif(etat, sec));
        session.depuis++;
        if (res !== "juste") {
          if (libre) { session.vues.add(id); return suivante(); }
          session.nouvelles++; L.placer(etat, id, 1, maintenant()); sauver(); return suivante();
        }
        const niveaux = [["tres_peu", "Très peu (c'était de la chance)"], ["un_peu", "Un peu"], ["moyen", "Moyen"], ["bien", "Bien"], ["tres_bien", "Très bien"]];
        const t = maintenant();
        const garde = libre ? Object.fromEntries(niveaux.map(([k]) => [k, L.sansImpact(etat, t, S.CONFIANCE[k])])) : null;
        ecran.innerHTML = `<div class="retour ok">Juste !</div>
          ${x.genre === "k" ? `<div class="q-kanji petit jp">${esc(x.fiche.kanji)}</div>` : `<div class="q-mot petit jp">${motHTML(x.mot, false)}</div>`}
          <p class="consigne">Tu le connaissais comment ?</p>
          ${libre ? `<p class="info">Mode sans impact : la carte n'entre dans tes révisions que si ta note ne charge pas tes 5 prochains jours.</p>` : ""}
          <div class="options">${niveaux.map(([k, tx]) => `<button class="opt" data-c="${k}">${tx}${libre ? `<span class="effet ${garde[k] ? "oui" : "non"}">${garde[k] ? "ajoutée" : "pas ajoutée"}</span>` : ""}</button>`).join("")}</div>`;
        document.querySelectorAll("[data-c]").forEach((b) => b.onclick = () => {
          const p = S.CONFIANCE[b.dataset.c];
          if (libre && !garde[b.dataset.c]) {
            session.vues.add(id);
            alerte("Pas ajoutée : elle chargerait tes prochains jours. Elle reviendra plus tard.");
            return suivante();
          }
          L.placer(etat, id, p, maintenant()); sauver();
          session.nouvelles++;
          alerte(libre ? `Ajoutée sans impact : ${S.NOMS[p]}` : `Placée : ${S.NOMS[p]}`);
          suivante();
        });
      });
    };
    const objectifAtteint = (s) => {
      const b = s.budget;
      ecran.innerHTML = `<div class="retour ok">Objectif du jour atteint 👍</div>
        <p class="info">Avec une carte de plus, une des 5 prochaines journées monterait à environ <b>${Math.round(s.pire)} min</b>
        de révision, au-dessus de ${b.adapte ? `ce que tu tiens en ce moment (${Math.round(b.minutes)} min)` : `ton objectif (${b.objectif} min)`}.</p>
        <p class="info">${session.faites} révision(s) et ${session.nouvelles} nouvelle(s) carte(s) dans cette séance.</p>
        <button class="gros" id="b-stop">Arrêter pour aujourd'hui</button>
        <button class="second" id="b-libre">Continuer sans impact</button>
        <p class="aide">Tu te testes sur les cartes suivantes. Une carte n'entre dans tes révisions que si tu la connaissais bien (sa 1re révision tombe après les 5 prochains jours) ; sinon elle reviendra plus tard, comme neuve.</p>
        <button class="second" id="b-plus">Continuer en mode normal</button>
        <p class="aide">Les nouvelles cartes entrent dans tes révisions comme d'habitude : tes prochains jours dépasseront ton objectif.</p>`;
      $("#b-stop").onclick = accueil;
      $("#b-libre").onclick = () => { session.mode = "libre"; suivante(); };
      $("#b-plus").onclick = () => { session.mode = "normal"; suivante(); };
    };
    const choixRelance = () => {
      session.choix = true;
      ecran.innerHTML = `<div class="retour ok">Révisions du jour faites ✓</div>
        <p class="info">Tu as encore de la place dans ton objectif. Comment veux-tu continuer ?</p>
        <button class="gros" id="b-normal">Nouvelles cartes</button>
        <p class="aide">Mode normal : les cartes entrent dans tes révisions, jusqu'à ton objectif du jour.</p>
        <button class="second" id="b-libre">Sans impact</button>
        <p class="aide">Tu te testes ; seules les cartes notées Bien ou Très bien entrent dans tes révisions.</p>`;
      $("#b-normal").onclick = suivante;
      $("#b-libre").onclick = () => { session.mode = "libre"; suivante(); };
    };
    const finJeu = (pr) => {
      const prochaine = L.prochaineRevision(etat);
      const msg = pr.phase === "fini" ? "Toutes les cartes ont été vues. Bravo !"
        : `Les prochains mots se débloquent quand tous leurs kanji sont au palier Confirmé 1 (${pr.attente} carte(s) en attente).`;
      ecran.innerHTML = `<div class="retour ok">Plus rien à faire pour l'instant</div>
        <p class="info">${msg}</p>${prochaine ? `<p class="info">Prochaine révision ${duree(prochaine - maintenant())}.</p>` : ""}
        <button class="gros" id="b-fin">Retour à l'accueil</button>`;
      $("#b-fin").onclick = accueil;
    };
    // objectif changé : la 1re fois, on demande quoi faire des cartes commencées hors objectif
    const hors = etat.reglages.demanderObjectif ? horsObjectif() : [];
    delete etat.reglages.demanderObjectif;
    if (!hors.length) return suivante();
    sauver();
    ecran.innerHTML = `<div class="retour ok">Nouvel objectif : ${CHOIX_NIVEAUX[cartesActives().choix]}</div>
      <p class="info"><b>${hors.length}</b> carte(s) déjà commencée(s) ne font pas partie de ton objectif.</p>
      <button class="gros" id="b-retirer">Les retirer de mes révisions</button>
      <p class="aide">Elles sont mises en pause avec leur progression. Si tu les remets dans ton objectif, elles reprennent là où elles en étaient.</p>
      <button class="second" id="b-garder">Les garder dans mes révisions</button>`;
    $("#b-retirer").onclick = () => { const n = L.pauser(etat, hors, maintenant()); sauver(); alerte(`${n} carte(s) mise(s) en pause.`); suivante(); };
    $("#b-garder").onclick = suivante;
  }

  // cartes commencées, non acquises, actives, mais hors de l'objectif
  function horsObjectif() {
    const dans = new Set(cartesActives().ids);
    return Object.entries(etat.tuiles).filter(([id, t]) => !dans.has(id) && t.statut === "placee" && !t.pause && t.palier < S.ACQUIS).map(([id]) => id);
  }

  // ---------- annonce CHALLENGE (cartes chronométrées en tête des révisions) ----------
  function annonceChallenge(ids, ensuite) {
    const n30 = ids.filter((id) => etat.tuiles[id].palier === 9).length, n12 = ids.length - n30;
    const d = document.createElement("div");
    d.className = "challenge";
    d.innerHTML = `<div class="ch-titre">CHALLENGE!</div>
      <div class="ch-nombre">${ids.length}</div>
      <div class="ch-texte">carte${ids.length > 1 ? "s" : ""} chronométrée${ids.length > 1 ? "s" : ""}</div>
      <div class="ch-detail">${[n12 ? `${n12} à 12 s` : "", n30 ? `${n30} à 30 s` : ""].filter(Boolean).join(" · ")}</div>
      <div class="ch-barre"><div></div></div>
      <div class="ch-aide">Touche l'écran pour commencer tout de suite</div>`;
    document.body.appendChild(d);
    let fini = false;
    const go = () => { if (fini) return; fini = true; clearTimeout(minuterie); d.remove(); ensuite(); };
    const minuterie = setTimeout(go, 3500);
    d.onclick = go;
    window.__challenge = { go };   // tests
  }

  // ---------- accueil ----------
  function barresJours(prev, b) {
    const jours = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
    const max = Math.max(b.minutes * 1.25, ...prev.slice(1).map((x) => x.minutes), 1);
    const t = maintenant();
    return `<div class="jours">${prev.slice(1).map((x, i) => {
      const d = new Date(L.debutJour(t) + (i + 1) * L.J + L.H);
      const h = Math.round((x.minutes / max) * 100);
      return `<div class="jour"><div class="col"><div class="val ${x.minutes > b.minutes ? "trop" : ""}" style="height:${h}%"></div>
        <div class="ligne-obj" style="bottom:${(b.minutes / max) * 100}%"></div></div>
        <span class="j-min">${Math.round(x.minutes)}′</span><span class="j-nom">${i === 0 ? "dem." : jours[d.getDay()]}</span></div>`;
    }).join("")}</div>`;
  }
  function courbe() {
    const h = Object.entries(etat.historique).sort();
    const o = L.objectifs(etat, cartesActives().ids);
    const tete = `<div class="obj"><span class="pastille c1"></span>Objectif 1 : sortir d'Apprenti <b>${o.horsApprenti}/${o.total}</b></div>
      <div class="obj"><span class="pastille c2"></span>Objectif 2 : tout acquérir <b>${o.acquis}/${o.total}</b></div>`;
    if (h.length < 2) return `${tete}<p class="aide">La courbe apparaîtra à partir du 2e jour d'utilisation.</p>`;
    const W = 320, Ht = 120, n = h.length;
    const x = (i) => 6 + (i / (n - 1)) * (W - 12);
    const y = (v, tot) => Ht - 6 - (v / tot) * (Ht - 12);
    const ligne = (k) => h.map(([, v], i) => `${x(i).toFixed(1)},${y(v[k], v[2]).toFixed(1)}`).join(" ");
    return `${tete}<svg viewBox="0 0 ${W} ${Ht}" class="courbe" role="img" aria-label="Progression">
      <line x1="6" x2="${W - 6}" y1="${y(1, 1)}" y2="${y(1, 1)}" class="but"/><text x="${W - 8}" y="${y(1, 1) + 11}" text-anchor="end" class="but-t">100 %</text>
      <line x1="6" x2="${W - 6}" y1="${y(0, 1)}" y2="${y(0, 1)}" class="axe"/>
      <polyline points="${ligne(0)}" class="c1"/><polyline points="${ligne(1)}" class="c2"/></svg>
      <div class="courbe-dates"><span>${h[0][0].slice(5).split("-").reverse().join("/")}</span><span>aujourd'hui</span></div>`;
  }
  function accueil() {
    onglets("accueil");
    clearInterval(minuteur);
    const t = maintenant();
    const absents = L.appliquerAbsences(etat, t);
    if (absents) { sauver(); alerte(`${absents} carte(s) redescendue(s) d'un palier après une longue absence.`); }
    const dues = L.revisionsDues(etat, t);
    const act = cartesActives();
    const pr = L.prochaineNouvelle(etat, act.cartes);
    const prev = L.simuler(etat, t);
    const b = L.budget(etat, t);
    let sous;
    if (dues.length) sous = `${dues.length} révision${dues.length > 1 ? "s" : ""} en attente`;
    else if (pr.carte) sous = "Nouvelles cartes disponibles";
    else { const p = L.prochaineRevision(etat); sous = p ? `Prochaine révision ${duree(p - t)}` : "Rien à faire"; }
    const phases = { kanji: "kanji seuls", combo: "vocabulaire niveau 1", mixte: "vocabulaire niveau 2", fini: "tout est vu" };
    const kanjiActifs = act.cartes.filter((c) => c.phase === "kanji");
    const vuesKanji = kanjiActifs.filter((c) => L.introduite(etat, c.id)).length;
    const dem = prev[1];
    ecran.innerHTML = `
      <h1><img class="logo-mini" src="nihon-192.png" alt="">Kanji JLPT <span class="sous">${{ N5: "N5", N4: "N4", N5N4: "N5 · N4" }[act.choix]}</span></h1>
      <button class="gros jouer" id="b-jouer">▶ Jouer<span>${sous}</span></button>
      <div class="carte-info">
        <div class="demain">Demain : <b>${Math.round(dem.revisions)} révision${Math.round(dem.revisions) > 1 ? "s" : ""}</b>, environ <b>${dem.revisions < 0.5 ? 0 : Math.max(1, Math.round(dem.minutes))} min</b></div>
        ${barresJours(prev, b)}
        <p class="aide">Prévision des 5 prochains jours (ligne = ${b.adapte ? `ce que tu tiens : ${Math.round(b.minutes)} min` : `objectif : ${b.objectif} min`}).
        ${b.adapte ? `Tu tiens environ ${Math.round(b.tenu)} min/jour sur 7 jours : j'adapte les nouvelles cartes.` : ""}</p>
      </div>
      <div class="carte-info">${courbe()}</div>
      <p class="aide centre">Phase : ${phases[pr.phase]}${pr.phase === "kanji" ? ` (${Math.floor(vuesKanji / 2)}/${kanjiActifs.length / 2} kanji commencés)` : ""}</p>`;
    $("#b-jouer").onclick = jouer;
  }

  // ---------- Acquis ----------
  function vueAcquis() {
    onglets("acquis");
    const ids = IDS.filter((id) => { const t = etat.tuiles[id]; return t && t.statut === "placee" && t.palier === S.ACQUIS; });
    ecran.innerHTML = `<h1>Acquis</h1>
      <p class="info">${ids.length} carte${ids.length > 1 ? "s" : ""} acquise${ids.length > 1 ? "s" : ""}.</p>
      <p class="aide">Entraîne-toi sur ce que tu as déjà acquis, avec 12 s par question. Une erreur fait redescendre la carte au palier « Chrono 12 s ».</p>
      ${ids.length ? `<button class="gros" id="b-acq">S'entraîner (${Math.min(20, ids.length)} questions)</button>` : ""}`;
    if (!ids.length) return;
    $("#b-acq").onclick = () => {
      const file = L.melanger(ids).slice(0, 20);
      const total = file.length;
      let n = 0, ratees = 0;
      const suivante = () => {
        if (!file.length) {
          ecran.innerHTML = `<div class="retour ok">Entraînement terminé : ${n - ratees}/${n} justes.</div><button class="gros" id="b-fin">Retour</button>`;
          $("#b-fin").onclick = vueAcquis; return;
        }
        const id = file.shift(); n++;
        poser(id, { chrono: 12, titre: `Acquis · ${n}/${total}`, texteErreur: "La carte redescend au palier Chrono 12 s." }, (res, sec) => {
          ajouterTemps(Math.min(sec, 12));
          const juste = res === "juste";
          L.repondreAcquis(etat, id, juste, maintenant()); sauver();
          if (!juste) ratees++;
          suivante();
        });
      };
      suivante();
    };
  }

  // ---------- Progrès ----------
  const GROUPES = [["Nouvelles", "g0", (t) => !t || t.statut !== "placee"], ["Apprenti", "g1", (t) => t.palier <= 4],
    ["Confirmé", "g2", (t) => t.palier <= 6], ["Maîtrisé/Expert", "g3", (t) => t.palier <= 8], ["Chrono", "g4", (t) => t.palier <= 10], ["Acquis", "g5", () => true]];
  function groupe(t) { for (const [n, c, fn] of GROUPES) if ((!t || t.statut !== "placee") ? n === "Nouvelles" : (n !== "Nouvelles" && fn(t))) return c; return "g0"; }
  function vueProgres() {
    onglets("progres");
    const act = cartesActives();
    const familles = [["Kanji N5", (c) => c.phase === "kanji" && c.niveau === "N5"],
      ["Kanji N4", (c) => c.phase === "kanji" && c.niveau === "N4"],
      ["Vocabulaire niveau 1", (c) => c.phase === "combo"], ["Vocabulaire niveau 2", (c) => c.phase === "mixte"]];
    const barres = familles.map(([nom, fn]) => {
      const ids = act.cartes.filter(fn).map((c) => c.id);
      if (!ids.length) return "";
      const cpt = {}; for (const id of ids) { const g = groupe(etat.tuiles[id]); cpt[g] = (cpt[g] || 0) + 1; }
      const segs = GROUPES.map(([, c]) => cpt[c] ? `<div class="${c}" style="flex:${cpt[c]}"></div>` : "").join("");
      const acq = cpt.g5 || 0, nouv = cpt.g0 || 0;
      return `<div class="fam"><div class="fam-t"><span>${nom}</span><span>${ids.length - nouv} commencées · ${acq} acquises / ${ids.length}</span></div><div class="pile">${segs}</div></div>`;
    }).join("");
    const couleurK = (k) => {
      const m = Math.min(...["sens", "lecture"].map((ty) => { const t = etat.tuiles[`k:${k}:${ty}`]; return t && t.statut === "placee" ? t.palier : 0; }));
      return m === 0 ? "g0" : groupe({ statut: "placee", palier: m });
    };
    ecran.innerHTML = `<h1>Progrès <span class="sous">${{ N5: "N5", N4: "N4", N5N4: "N5 · N4" }[act.choix]}</span></h1>${barres}
      <div class="legende-g">${GROUPES.map(([n, c]) => `<span class="${c}">${n}</span>`).join("")}</div>
      <h2>Kanji</h2><p class="aide">Couleur = la moins avancée des 2 cartes du kanji. Touche un kanji pour voir sa fiche.</p>
      <div class="grille">${FICHES.filter((f) => act.choix.includes(f.niveau)).map((f) => `<button class="case ${couleurK(f.kanji)} jp" data-k="${esc(f.kanji)}">${esc(f.kanji)}</button>`).join("")}</div>`;
    document.querySelectorAll(".case").forEach((b) => b.onclick = () => {
      const k = b.dataset.k;
      const det = ["sens", "lecture"].map((ty) => { const t = etat.tuiles[`k:${k}:${ty}`]; return `${ty} : ${!t || t.statut !== "placee" ? "pas encore vue" : S.NOMS[t.palier] + (t.due ? ", révision " + duree(t.due - maintenant()) : "")}`; }).join("<br>");
      ecran.innerHTML = `${ficheHTML(`k:${k}:sens`)}<p class="palier">${det}</p><button class="gros" id="b-r">Retour</button>`;
      $("#b-r").onclick = vueProgres;
    });
  }

  // ---------- Paramètres ----------
  function vueOptions() {
    onglets("options");
    const t = maintenant();
    const b = L.budget(etat, t);
    const n = etat.profil.reponses.length;
    const ch = cartesActives().choix;
    const compte = (k) => { const c = CARTES.filter((x) => k.includes(x.niveau)); return `${c.filter((x) => x.phase === "kanji").length / 2} kanji · ${new Set(c.filter((x) => x.phase !== "kanji").map((x) => x.id.split(":")[1])).size} mots`; };
    const taux = Math.round(L.tauxReussite(etat) * 100);
    ecran.innerHTML = `<h1>Paramètres</h1>
      <section class="panneau">
        <h2>Objectif</h2>
        <div class="segments" role="radiogroup">${Object.entries(CHOIX_NIVEAUX).map(([k, nom]) =>
          `<button class="seg ${k === ch ? "actif" : ""}" data-niv="${k}" role="radio" aria-checked="${k === ch}"><b>${{ N5: "N5", N4: "N4", N5N4: "N5 + N4" }[k]}</b><span>${compte(k)}</span></button>`).join("")}</div>
        <p class="aide">Les nouvelles cartes, la progression et l'onglet Progrès suivent ton objectif. Si tu le changes, au prochain Jouer je te demande si tu gardes ou retires de tes révisions les cartes commencées qui n'en font plus partie.${ch === "N4" ? " En N4 seul, les kanji N5 sont supposés connus." : ""}</p>
      </section>
      <section class="panneau">
        <h2>Temps par jour</h2>
        <label class="ligne-reglage">Révision visée
          <select id="s-obj">${[5, 10, 15, 20, 30, 45, 60].map((m) => `<option value="${m}" ${m === b.objectif ? "selected" : ""}>${m} min</option>`).join("")}</select></label>
        <p class="aide">Jouer propose de nouvelles cartes tant que les 5 prochains jours restent sous ce temps.</p>
      </section>
      <section class="panneau">
        <h2>Thème</h2>
        <select id="s-theme" class="choix-theme" aria-label="Thème">${(window.THEMES || []).map(([fam, ts]) => `<optgroup label="${esc(fam)}">${ts.map(([k, nom]) =>
          `<option value="${k}" ${k === (etat.reglages.theme || THEME_DEFAUT) ? "selected" : ""}>${esc(nom)}</option>`).join("")}</optgroup>`).join("")}</select>
        <p class="aide">Les thèmes du dashboard SUPERVISOR3000. Le changement est immédiat.</p>
      </section>
      <section class="panneau">
        <h2>Ce que l'appli sait de toi</h2>
        <div class="tuiles-stat">
          <div class="stat"><b>${taux} %</b><span>bonnes réponses</span></div>
          <div class="stat"><b>${Math.round(L.secondesParCarte(etat))} s</b><span>par carte</span></div>
          <div class="stat"><b>${b.tenu === null ? "–" : Math.round(b.tenu) + "′"}</b><span>tenu / jour</span></div>
        </div>
        <p class="aide">${n < 30 ? `Réussite : estimation de départ à 50 % (${n} réponse(s) mesurée(s)).` : `Réussite sur tes ${Math.min(n, 200)} dernières révisions.`} ${b.tenu === null ? "Temps tenu : calculé après 7 jours d'utilisation." : "Temps tenu : moyenne des 7 derniers jours."}</p>
      </section>
      <section class="panneau">
        <h2>Mise à jour</h2>
        <p class="ligne-reglage">Version installée <b id="v-inst" class="version">…</b></p>
        <button class="second" id="b-maj">Chercher une mise à jour</button>
        <p class="aide">L'appli vérifie toute seule à chaque ouverture et te prévient quand une nouvelle version est prête.</p>
      </section>
      ${installee() ? "" : `<section class="panneau">
        <h2>Installer sur le téléphone</h2>
        <button class="second" id="b-inst">Installer sur le téléphone</button>
        <p class="aide" id="p-inst">${invitation ? "Un appui, puis « Installer »." : aideInstallation()}</p>
      </section>`}
      <section class="panneau">
        <h2>Sauvegarde</h2>
        <p class="aide">Ta progression est enregistrée sur ce téléphone. Fais une sauvegarde de temps en temps (fichier dans Téléchargements).</p>
        <div class="deux">
          <button class="second" id="b-sauv">Sauvegarder</button>
          <label class="second fichier">Restaurer<input type="file" id="f-rest" accept=".json,application/json"></label>
        </div>
      </section>
      <details class="panneau">
        <summary>Règles de l'appli</summary>
        <ul class="regles">
          <li><b>Ordre</b> : les kanji seuls, puis le vocabulaire niveau 1 (tous les kanji du mot sont à connaître), puis le niveau 2 (furigana sur les kanji hors liste). Un mot arrive quand ses kanji sont au palier Confirmé 1.</li>
          <li><b>Paliers</b> : Apprenti 1 à 4 (4 h, 8 h, 1 j, 2 j), Confirmé 1 et 2 (1 et 2 semaines), Maîtrisé (1 mois), Expert (4 mois), Chrono 30 s, Chrono 12 s (1 mois chacun), Acquis.</li>
          <li><b>Erreur</b> : -2 paliers (-1 aux paliers chrono). Absence très longue : -1 palier.</li>
          <li><b>Temps</b> : une pause de plus de 30 s sur une question ne compte pas.</li>
          <li><b>Objectif atteint</b> : continuer sans impact (seules les cartes notées Bien ou Très bien entrent) ou en mode normal.</li>
        </ul>
      </details>
      <details class="panneau">
        <summary>Sources</summary>
        <p class="aide">Kanji, lectures : KANJIDIC2 (EDRDG, licence CC BY-SA 4.0). Listes N5/N4 : tanos.co.uk (J. Waller, CC BY) et ebooks Kanpai. Listes non officielles (pas de liste officielle depuis 2010).</p>
      </details>
      <details class="panneau vraiment">
        <summary>VRAIMENT !?</summary>
        <p class="aide">Efface toute ta progression pour repartir de zéro (tes réglages sont gardés).</p>
        <button class="second danger" id="b-raz">Tout effacer et recommencer</button>
      </details>`;
    document.querySelectorAll("[data-niv]").forEach((bt) => bt.onclick = () => {
      if (bt.dataset.niv === cartesActives().choix) return;
      etat.reglages.niveaux = bt.dataset.niv;
      L.reprendre(etat, cartesActives().ids, maintenant());     // les cartes en pause qui reviennent dans l'objectif reprennent
      etat.reglages.demanderObjectif = true; sauver();
      alerte(`Objectif : ${CHOIX_NIVEAUX[bt.dataset.niv]}`); vueOptions();
    });
    if ($("#b-inst")) $("#b-inst").onclick = () => {
      if (!invitation) { $("#p-inst").innerHTML = aideInstallation(); alerte("Suis les étapes juste en dessous."); return; }
      invitation.prompt();
      invitation.userChoice.then((c) => { invitation = null; if (c.outcome === "accepted") alerte("Installation en cours…"); vueOptions(); });
    };
    versionInstallee().then((v) => { const el = $("#v-inst"); if (el) el.textContent = v || "inconnue"; });
    $("#b-maj").onclick = () => { $("#b-maj").textContent = "Vérification…"; chercherMaj(true).then(() => { const b = $("#b-maj"); if (b) b.textContent = "Chercher une mise à jour"; }); };
    $("#s-theme").onchange = (e) => { etat.reglages.theme = e.target.value; sauver(); appliquerTheme(); alerte(`Thème : ${NOMS_THEMES[e.target.value]}`); };
    $("#s-obj").onchange =(e) => { etat.reglages.objectif = +e.target.value; sauver(); alerte(`Temps visé : ${e.target.value} min par jour`); };
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
        fenetre("Restaurer cette sauvegarde ?", "Ta progression actuelle sera remplacée par celle du fichier.", [
          ["Oui, restaurer", "gros", () => { etat = L.migrer(e2); sauver(); appliquerTheme(); alerte("Sauvegarde restaurée."); accueil(); }],
          ["Annuler", "second", null]]);
      }).catch(() => alerte("Ce fichier n'est pas une sauvegarde valable."));
    };
    $("#b-raz").onclick = () => {
      const n = Object.values(etat.tuiles).filter((t) => t.statut === "placee").length;
      fenetre("Tout effacer ?", `Toute ta progression sera perdue (<b>${n}</b> carte(s) commencée(s)). C'est définitif, sauf si tu as une sauvegarde.`, [
        ["Sauvegarder d'abord", "second", () => $("#b-sauv").click()],
        ["Oui, tout effacer", "second danger", () => { const r = etat.reglages; etat = L.etatVide(); etat.reglages = r; delete r.demanderObjectif; sauver(); alerte("Progression effacée."); accueil(); }],
        ["Annuler", "gros", null]]);
    };
  }

  // ---------- installation (PWA) ----------
  let invitation = null;                       // fournie par Chrome quand l'appli est installable
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); invitation = e; });
  window.addEventListener("appinstalled", () => { invitation = null; alerte("Appli installée : l'icône est sur ton écran d'accueil."); });
  function installee() {
    return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  }
  function aideInstallation() {
    const chrome = /Chrome\//.test(navigator.userAgent) && !/HeyTap|OppoBrowser|RealmeBrowser|SamsungBrowser|EdgA|OPR\//.test(navigator.userAgent);
    return (chrome ? "" : "<b>Ouvre d'abord ce lien dans Chrome</b> (le navigateur du téléphone ne sait pas toujours installer les applis web).<br>") +
      "Dans Chrome : touche le menu <b>⋮</b> en haut à droite, puis <b>« Installer l'appli »</b> ou <b>« Ajouter à l'écran d'accueil »</b>, puis confirme.<br>" +
      "Si rien ne s'affiche : recharge la page une fois, attends quelques secondes, puis réessaie.";
  }

  // ---------- navigation ----------
  const VUES = { accueil, progres: vueProgres, acquis: vueAcquis, options: vueOptions };
  document.querySelectorAll("nav button").forEach((b) => b.onclick = () => { clearInterval(minuteur); VUES[b.dataset.vue](); });
  window.__app = { accueil, etat: () => etat, recharger: () => { charger(); appliquerTheme(); accueil(); }, CARTES };   // tests
  accueil();
  // ---------- mises à jour : la nouvelle version s'installe en fond, l'utilisateur redémarre quand il veut ----------
  let enregistrement = null, majDemandee = false;
  function bandeauMaj(w) {
    if (document.querySelector(".bandeau-maj")) return;
    const d = document.createElement("div");
    d.className = "bandeau-maj";
    d.innerHTML = `<span><b>Nouvelle version disponible</b>Redémarre l'appli pour l'avoir.</span><button id="b-redem">Redémarrer</button>`;
    document.body.appendChild(d);
    d.querySelector("#b-redem").onclick = () => {
      majDemandee = true;
      d.querySelector("#b-redem").textContent = "…";
      const cible = w || (enregistrement && enregistrement.waiting);
      if (cible) cible.postMessage({ type: "MAJ" });
      setTimeout(() => location.reload(), 4000);   // filet de sécurité si le nouveau service worker tarde
    };
  }
  window.__bandeauMaj = bandeauMaj;   // tests
  function suivreInstallation(w) {
    if (!w) return;
    const verif = () => { if (w.state === "installed" && navigator.serviceWorker.controller) bandeauMaj(w); };
    verif(); w.addEventListener("statechange", verif);
  }
  function versionInstallee() {
    return new Promise((ok) => {
      const c = navigator.serviceWorker && navigator.serviceWorker.controller;
      if (!c) return ok(null);
      const canal = new MessageChannel();
      canal.port1.onmessage = (e) => ok(e.data);
      c.postMessage({ type: "VERSION" }, [canal.port2]);
      setTimeout(() => ok(null), 1500);
    });
  }
  function chercherMaj(manuel) {
    if (!enregistrement) { if (manuel) alerte("Vérification impossible ici (appli pas ouverte depuis internet)."); return Promise.resolve(); }
    return enregistrement.update().then(() => {
      if (!manuel) return;
      if (enregistrement.waiting) { bandeauMaj(enregistrement.waiting); alerte("Mise à jour trouvée : touche « Redémarrer »."); }
      else if (enregistrement.installing) alerte("Mise à jour trouvée : téléchargement en cours…");
      else alerte("Tu as déjà la dernière version.");
    }).catch(() => { if (manuel) alerte("Pas de connexion internet : réessaie plus tard."); });
  }
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      enregistrement = reg;
      if (reg.waiting && navigator.serviceWorker.controller) bandeauMaj(reg.waiting);
      reg.addEventListener("updatefound", () => suivreInstallation(reg.installing));
    }).catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (majDemandee) location.reload(); });
    // vérification à chaque retour dans l'appli (au plus une fois toutes les 10 min)
    let derniere = 0;
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && Date.now() - derniere > 600000) { derniere = Date.now(); chercherMaj(false); }
    });
  }
})();
