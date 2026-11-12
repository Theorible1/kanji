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
  // kanji : une carte par sens différent (k:日:s0, k:日:s1) et une par prononciation (k:日:l:にち)
  // mots : mot -> traduction (m:mot:sens) et mot -> kana (m:mot:lecture)
  // jumelles (même affichage, même réponse) : une seule carte, celle du kanji ; ALIAS : id du mot -> id de la carte
  const CARTES = [], ALIAS = {}, PROPRES = {}, DES_MOTS = {};
  const idsSens = (k) => PAR_KANJI[k].sensCartes.map((_, i) => `k:${k}:s${i}`);
  const idsLectures = (k) => PAR_KANJI[k].lectures.map((l) => `k:${k}:l:${l}`);
  for (const f of FICHES) {
    PROPRES[f.kanji] = [...idsSens(f.kanji), ...idsLectures(f.kanji)];
    DES_MOTS[f.kanji] = [];
    for (const id of PROPRES[f.kanji]) CARTES.push({ id, phase: "kanji", niveau: f.niveau, prerequis: [] });
  }
  for (const m of MOTS) {
    // déblocage : pour chaque kanji, ses cartes de sens et la prononciation utilisée dans le mot (ou, à défaut, une de ses prononciations)
    const pre = [];
    for (const [k, lec] of m.pre) {
      const g = { kanji: k, groupes: idsSens(k).map((id) => [id]) };
      g.groupes.push(lec ? [`k:${k}:l:${lec}`] : idsLectures(k));
      pre.push(g);
    }
    const ids = [];
    for (const ty of m.lecture ? ["sens", "lecture"] : ["sens"]) {
      const id = `m:${m.mot}:${ty}`, jumelle = ty === "sens" ? m.js : m.jl;
      if (jumelle) ALIAS[id] = jumelle;
      else CARTES.push({ id, phase: m.phase, niveau: m.niveau, pre });
      ids.push(jumelle || id);
    }
    for (const k of m.kanji) DES_MOTS[k].push({ niveau: m.niveau, ids });
  }
  for (const c of CARTES) if (c.pre) c.prerequis = c.pre.flatMap((g) => g.groupes);
  const IDS = CARTES.map((c) => c.id);
  // ce qu'on travaille (Paramètres) : "N5", "N4" ou "N5N4". En N4 seul, les kanji N5 sont supposés connus (pas de prérequis).
  const CHOIX_NIVEAUX = { N5: "N5 seulement", N4: "N4 seulement", N5N4: "N5 + N4" };
  const actifs = {};
  function cartesActives() {
    const ch = (etat && CHOIX_NIVEAUX[etat.reglages.niveaux]) ? etat.reglages.niveaux : "N5N4";
    if (!actifs[ch]) {
      const ok = (niv) => ch.includes(niv);
      const cartes = CARTES.filter((c) => ok(c.niveau)).map((c) => Object.assign({}, c,
        { prerequis: c.pre ? c.pre.filter((g) => ok(PAR_KANJI[g.kanji].niveau)).flatMap((g) => g.groupes) : [] }));
      actifs[ch] = { choix: ch, cartes, ids: cartes.map((c) => c.id) };
    }
    return actifs[ch];
  }
  function info(id) {
    const p = id.split(":");
    if (p[0] === "m") return { genre: "m", type: p[2], mot: PAR_MOT[p[1]], cle: p[1] };
    const fiche = PAR_KANJI[p[1]];
    if (p[2][0] === "s") return { genre: "k", type: "sens", fiche, cle: p[1], idx: +p[2].slice(1) };
    return { genre: "k", type: "lecture", fiche, cle: p[1], lecture: p.slice(3).join(":") };
  }
  // maîtrise d'un kanji (0 à 1) : une carte vaut rang / 11 ; moitié ses cartes propres, moitié les cartes de ses mots
  function maitrise(k) {
    const ch = cartesActives().choix;
    const moy = (ids) => ids.reduce((s, id) => s + L.rangDe(etat, id) / S.ACQUIS, 0) / ids.length;
    const mots = [...new Set(DES_MOTS[k].filter((m) => ch.includes(m.niveau)).flatMap((m) => m.ids))];
    return mots.length ? (moy(PROPRES[k]) + moy(mots)) / 2 : moy(PROPRES[k]);
  }

  // ---------- état ----------
  // progression d'une ancienne version : chaque ancienne carte donne son rang aux cartes qui la remplacent
  const plan = (id, version) => {
    const p = id.split(":");
    if (version >= 3 || p[0] !== "k") return [ALIAS[id] || id];
    if (!PAR_KANJI[p[1]]) return [];
    return p[2] === "sens" ? idsSens(p[1]) : idsLectures(p[1]);
  };
  let etat;
  function charger() {
    try { etat = L.migrer(JSON.parse(localStorage.getItem(CLE)), plan, maintenant()); } catch (e) { etat = L.etatVide(); }
  }
  function sauver() {
    L.noterHistorique(etat, cartesActives().ids, maintenant());
    try { localStorage.setItem(CLE, JSON.stringify(etat)); } catch (e) { alerte("Impossible d'enregistrer la progression sur ce téléphone."); }
  }
  charger();

  // ---------- thème (repris du dashboard ; défaut = futuriste confort · ardoise, celui de style.css) ----------
  const THEME_DEFAUT = "futur-confort-ardoise";
  const NOMS_THEMES = Object.fromEntries((window.THEMES || []).flatMap(([, ts]) => ts));
  // choix du thème (Options) : familles et noms courts ; COULEURS_THEMES : [fond, accent] de chaque thème (repris de themes.css) pour sa pastille
  const FAMILLES_THEMES = [
    ["Simples", [["auto", "auto"], ["light", "clair"], ["dark", "sombre"]]],
    ["Confort", [["futur-confort-ardoise", "ardoise"], ["futur-confort-pervenche", "pervenche"], ["futur-confort-ivoire", "ivoire"], ["papier", "papier"], ["penombre", "pénombre"], ["futur-confort", "sombre doux"]]],
    ["Futuristes", [["futuriste", "néon"], ["futur-ambre", "ambre"], ["futur-vert", "terminal"], ["futur-violet", "violet"]]],
    ["Fun", [["synthwave", "synthwave"], ["holo", "holo"], ["cyberpunk", "cyberpunk"], ["licorne", "licorne"], ["lcd", "LCD rétro"], ["cartoon", "cartoon"]]],
  ];
  const COULEURS_THEMES = { auto: ["linear-gradient(90deg, #f6f6f3 50%, #0d0d0d 50%)", "#3987e5"], light: ["#f6f6f3", "#2a78d6"], dark: ["#0d0d0d", "#3987e5"],
    "futur-confort-ardoise": ["#16181c", "#7ea3c4"], "futur-confort-pervenche": ["#16181c", "#9a98d0"], "futur-confort-ivoire": ["#16181c", "#b8b09b"],
    papier: ["#efe6d3", "#2f6db5"], penombre: ["#1b1d21", "#6d9fd6"], "futur-confort": ["#16181c", "#d9b25f"],
    futuriste: ["#05070f", "#00d8f0"], "futur-ambre": ["#0c0802", "#ffae1f"], "futur-vert": ["#020a04", "#39ff78"], "futur-violet": ["#08040f", "#b66dff"],
    synthwave: ["#14062a", "#ff5ccd"], holo: ["#eef3f8", "#3a6df0"], cyberpunk: ["#0a0a0a", "#fcee0a"], licorne: ["#fdf2fb", "#b545cf"], lcd: ["#cfc8b8", "#1d2418"], cartoon: ["#fff6dc", "#2f80ed"] };
  const sombre = matchMedia("(prefers-color-scheme: dark)");
  function appliquerTheme() {
    let t = etat.reglages.theme || THEME_DEFAUT;
    if (!NOMS_THEMES[t]) t = THEME_DEFAUT;
    try { localStorage.setItem("kanjiApp.theme", t); } catch (e) {}
    if (t === "auto") t = sombre.matches ? "dark" : "light";
    if (t === THEME_DEFAUT) document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    // éclair des bonnes réponses : doré dans les thèmes où le vert ne ressort pas, vert ailleurs
    document.documentElement.toggleAttribute("data-flash-or", ["futur-confort", "futur-confort-ivoire", "futur-ambre", "futur-vert", "cyberpunk", "lcd"].includes(t));
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
  // prononciation d'un kanji : lecture au-dessus du kanji, kana qui suivent écrits après (一つ avec ひと au-dessus de 一)
  function lectureHTML(k, l) {
    const d = L.decoupe(l);
    return `${d.avant ? `(${esc(d.avant)})` : ""}<ruby>${esc(k)}<rt>${esc(d.rad)}</rt></ruby>${esc(d.okuri)}`;
  }
  // l'exemple utilise-t-il cette prononciation du kanji ? (sons modifiés compris : ひ -> び ou ぴ, いち -> いっ)
  const QUE_KANA = /^[\u3040-\u30ffー]*$/;
  function exempleUtilise(k, l, e) {
    const i = e.mot.indexOf(k);
    if (i < 0) return false;
    const d = L.decoupe(l), avant = e.mot.slice(0, i), apres = e.mot.slice(i + k.length);
    if (!d.rad) return false;
    const debut = QUE_KANA.test(avant) ? avant : null, fin = QUE_KANA.test(apres) ? apres : null;
    if (d.okuri && fin && fin[0] !== d.okuri[0]) return false;          // 開く n'utilise pas あ(ける)
    const formes = new Set([d.rad]);
    const c = d.rad[0], code = c.charCodeAt(0);
    if ("かきくけこさしすせそたちつてとはひふへほ".includes(c)) formes.add(String.fromCharCode(code + 1) + d.rad.slice(1));
    if ("はひふへほ".includes(c)) formes.add(String.fromCharCode(code + 2) + d.rad.slice(1));
    for (const f of [...formes]) if (f.length >= 2 && "つくちき".includes(f[f.length - 1])) formes.add(f.slice(0, -1) + "っ");
    return [...formes].some((f) => (debut !== null && fin !== null ? e.kana === debut + f + fin
      : debut !== null ? e.kana.startsWith(debut + f) : fin !== null ? e.kana.endsWith(f + fin) : e.kana.includes(f)));
  }
  function ficheHTML(id, neutre) {
    const x = info(id);
    if (neutre) x.type = "";
    if (x.genre === "k") {
      const f = x.fiche;
      const ex = f.exemples.map((e) => `<li class="${x.type === "lecture" && exempleUtilise(f.kanji, x.lecture, e) ? "fort" : ""}"><span class="jp">${esc(e.mot)}</span> <span class="kana">${esc(e.kana)}</span> <span class="fr">${esc(e.fr)}</span></li>`).join("");
      const sens = f.sensCartes.map((s, i) => `<span class="${x.type === "sens" && x.idx === i ? "fort" : ""}">${esc(i ? s : maj(s))}</span>`).join(", ");
      const lect = f.lectures.map((l) => `<span class="${x.type === "lecture" && x.lecture === l ? "fort" : ""}">${lectureHTML(f.kanji, l)}</span>`).join(" ・ ");
      return `<div class="fiche">
        <div class="fiche-tete"><span class="fiche-k jp">${esc(f.kanji)}</span>${etoile(f.niveau)}
          <div><div class="fiche-sens">${sens}</div>
          <div class="fiche-lect jp">${lect}</div>
          <div class="fiche-info">Kanji ${f.niveau} · ${f.traits} traits</div></div></div>
        <ul class="fiche-ex">${ex}</ul></div>`;
    }
    const m = x.mot;
    const comp = m.kanji.map((k) => `<li><span class="jp">${esc(k)}</span>${etoile(PAR_KANJI[k].niveau)} <span class="fr">${esc(PAR_KANJI[k].sens)}</span></li>`).join("");
    return `<div class="fiche">
      <div class="fiche-mot jp">${motHTML(m, true)}</div>
      <div class="fiche-lect jp ${x.type === "lecture" ? "fort" : ""}">${esc(m.kana)}</div>
      <div class="fiche-sens ${x.type === "sens" ? "fort" : ""}">${esc(maj(m.fr))}</div>
      <div class="fiche-info">Mot ${m.phase === "combo" ? "de vocabulaire niveau 1 (kanji tous à connaître)" : "de vocabulaire niveau 2 (furigana sur les kanji hors liste)"}${m.special ? " · lecture particulière" : ""}</div>
      <ul class="fiche-ex">${comp}</ul></div>`;
  }
  function onglets(actif) { document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("actif", b.dataset.vue === actif)); }
  // objectif du jour (en secondes de travail, calculé d'après les habitudes ; 0 = pas encore d'objectif) et cartes déjà faites aujourd'hui
  const butDuJour = () => L.objectifDuJour(etat, maintenant());
  const cartesDuJour = () => L.cartesDuJour(etat, maintenant());
  // les 4 objectifs. cle : compteur de L.objectifs ; k : indice dans une ligne de projection [r5, acquis, r2, r6] ;
  // h : indice dans l'historique [r5, acquis, total, r2, r6] ; part : part des cartes à atteindre ; c : couleur de sa courbe (« En feu » seulement)
  const OBJECTIFS = [
    { nom: "Tout découvert", regle: "toutes les cartes au rang 2 ou plus", cle: "r2", k: 2, h: 3, part: 1 },
    { nom: "Prêt pour le combat", regle: "75 % des cartes au rang 5 ou plus", cle: "r5", k: 0, h: 0, part: 0.75 },
    { nom: "En feu 🔥", regle: "toutes les cartes au rang 6 ou plus", cle: "r6", k: 3, h: 4, part: 1, c: "c2" },
    { nom: "Maître des kanji", regle: "toutes les cartes acquises", cle: "acquis", k: 1, h: 1, part: 1 },
  ];
  const cibleObjectif = (o, tot) => Math.ceil(o.part * tot);
  // objectif du jour atteint (le feu d'artifice a déjà été tiré aujourd'hui)
  const jourFini = () => { const j = L.cleJour(maintenant()); return !!(etat.profil.atteints || {})[j] || etat.profil.fini === j; };
  const atteindre = () => { (etat.profil.atteints || (etat.profil.atteints = {}))[L.cleJour(maintenant())] = 1; sauver(); };

  // ---------- chronométrage du temps actif ----------
  let cache = 0, debutCache = null;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) debutCache = performance.now();
    else if (debutCache !== null) { cache += performance.now() - debutCache; debutCache = null; }
  });
  // temps actif passé sur la carte en cours (question + correction + note), appli en arrière-plan non comptée
  let debutQuestion = 0;
  const tempsQuestion = () => Math.max(0, (performance.now() - debutQuestion - cache - (debutCache !== null ? performance.now() - debutCache : 0)) / 1000);

  // ---------- une question (QCM 4 choix + « Je ne sais pas ») ----------
  // rappel(res) avec res = "juste" | "faux" | "jsp" | "temps"
  // opts : titre, chrono (s), texteErreur, bonus (objectif du jour atteint : la croix est mise en avant),
  //        reste (nombre de cartes avant l'objectif du jour, affiché pour les 5 dernières)
  let minuteur = null;
  function poser(id, opts, rappel) {
    const x = info(id);
    let g, visuel, consigne;
    const grand = (txt, html) => { const lg = [...txt].length; return `<div class="q-mot jp" style="font-size:${Math.min(76, Math.floor(320 / Math.max(lg, 2)))}px">${html}</div>`; };
    if (x.genre === "k" && x.type === "sens") {
      g = L.qcmSens(x.fiche, x.idx, FICHES);
      visuel = `<div class="q-kanji jp">${esc(x.fiche.kanji)}</div>`;
      consigne = "Que signifie ce kanji ?" + (x.fiche.sensCartes.length > 1 ? ` (un de ses ${x.fiche.sensCartes.length} sens)` : "");
    } else if (x.genre === "k") {
      g = L.qcmLecture(x.fiche, x.lecture, FICHES);
      const aff = L.affichageLecture(x.fiche.kanji, x.lecture);
      visuel = aff === x.fiche.kanji ? `<div class="q-kanji jp">${esc(aff)}</div>` : grand(aff, esc(aff));
      consigne = "Comment ça se lit ?";
    } else {
      g = x.type === "sens" ? L.qcmSensMot(x.mot, MOTS, PAR_KANJI) : L.qcmLectureMot(x.mot, MOTS, PAR_KANJI);
      visuel = grand(x.mot.mot, motHTML(x.mot, false));
      consigne = x.type === "sens" ? "Que signifie ce mot ?" : "Comment se lit ce mot ?";
    }
    if (x.type === "sens") g.options = g.options.map(maj), g.bonne = maj(g.bonne);
    window.__bonne = g.bonne; window.__carte = id;   // tests
    ecran.innerHTML = `
      <div class="q-tete"><span>${esc(opts.titre || "")}</span>${opts.chrono ? `<span class="chrono" id="chrono">${opts.chrono} s</span>` : ""}
        ${opts.jeu && opts.bonus ? `<span class="t-jour fait">Objectif ✓</span>` : ""}
        <button class="quitter ${opts.bonus ? "fort" : ""}" id="b-quit" aria-label="Arrêter">✕</button></div>
      ${opts.chrono ? `<div class="barre"><div id="barre"></div></div>` : ""}
      ${opts.reste ? `<div class="encore">Encore <b>${opts.reste}</b> avant l'objectif</div>` : ""}
      ${visuel}
      <p class="consigne">${consigne}</p>
      <div class="options">
        ${g.options.map((o, i) => `<button class="opt ${x.type === "lecture" ? "jp" : ""}" data-i="${i}">${esc(o)}</button>`).join("")}
        <button class="opt jsp" data-i="jsp">Je ne sais pas</button>
      </div>
      <div id="correction"></div>`;
    $("#b-quit").onclick = () => { clearInterval(minuteur); accueil(); };
    cache = 0; debutCache = document.hidden ? performance.now() : null;
    const debut = debutQuestion = performance.now();
    let fini = false;
    const secondes = () => Math.max(0, (performance.now() - debut - cache) / 1000);
    const finir = (res, choisi) => {
      if (fini) return; fini = true;
      clearInterval(minuteur);
      let bonneBtn = null;
      document.querySelectorAll(".opt").forEach((b) => {
        const v = b.dataset.i === "jsp" ? null : g.options[+b.dataset.i];
        if (v === g.bonne) { b.classList.add("bonne"); bonneBtn = b; }
        else { b.disabled = true; if (b === choisi) b.classList.add("mauvaise"); }
      });
      if (res === "juste") { bonneBtn.disabled = true; flash(); setTimeout(() => rappel(res), 450); return; }
      // erreur : on laisse le temps de lire ; on avance avec « Continuer » ou en touchant la bonne réponse
      const titres = { faux: "Raté", jsp: "Voici la réponse", temps: "Temps écoulé" };
      $("#correction").innerHTML = `<div class="retour ko">${titres[res]}</div>${opts.texteErreur ? `<p class="palier">${opts.texteErreur}</p>` : ""}
        ${ficheHTML(id)}<button class="gros" id="b-suite">Continuer</button>
        ${res === "temps" ? "" : `<button class="lien missclick" id="b-miss">J'ai missclick, déso bro</button>`}`;
      const suite = () => rappel(res);
      $("#b-suite").onclick = suite;
      // erreur de doigt : la réponse compte comme juste (nouvelle carte : on passe à la note ; sinon le rang monte)
      if ($("#b-miss")) $("#b-miss").onclick = () => { flash(); rappel("juste"); };
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

  // ---------- petites récompenses ----------
  // bonne réponse : un éclair sur les côtés de l'écran (vert, ou doré selon le thème)
  function flash() {
    const f = document.createElement("div");
    f.className = "flash";
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 650);
  }
  // petite explosion au milieu de l'écran avec un message (série de bonnes réponses, carte en feu, carte acquise) :
  // elle se joue sur la carte qu'on vient de finir, la suivante n'arrive qu'après (un toucher la passe)
  function feter(textes, ensuite) {
    const d = document.createElement("div");
    d.className = "boum";
    const couleurs = ["--or", "--vert", "--accent-ink", "--orange"];
    d.innerHTML = `<div class="boum-centre">${Array.from({ length: 18 }, (_, i) =>
      `<i style="--a:${i * 20}deg;--d:${110 + (i % 3) * 34}px;background:var(${couleurs[i % 4]})"></i>`).join("")}
      <div class="boum-msg">${textes.map((t) => `<span>${t}</span>`).join("")}</div></div>`;
    document.body.appendChild(d);
    let fini = false;
    const fin = () => { if (fini) return; fini = true; clearTimeout(minuterie); d.remove(); ensuite(); };
    const minuterie = setTimeout(fin, 1300);
    d.onclick = fin;
    window.__fete = { fin, textes };   // tests
  }

  // ---------- feu d'artifice (objectif du jour atteint) ----------
  function feuDArtifice(titre, ensuite) {
    const c = document.createElement("canvas");
    c.className = "feu";
    const msg = document.createElement("div");
    msg.className = "feu-msg";
    msg.innerHTML = titre + "<span>Touche l'écran pour continuer</span>";
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

  // ---------- JOUER : cartes jouables du rang le plus haut au plus bas, puis nouvelles cartes ; feu d'artifice à l'objectif du jour ----------
  function jouer() {
    const budget = () => L.tempsHabituel(etat, maintenant()) * 60;   // temps habituel d'une journée : sert à décider d'avancer des cartes
    const session = { rattrapage: [], depuis: 0, challenge: null, faites: 0, nouvelles: 0, serie: 0, reste: 0,
      bonus: jourFini() };   // objectif du jour déjà atteint : on joue en plus, sans nouvel arrêt
    // bonnes réponses d'affilée dans la séance : une petite fête toutes les 5
    const serie = (juste) => {
      const n = session.serie = juste ? session.serie + 1 : 0;
      return juste && n % 5 === 0 ? [`${n >= 20 ? "🚀" : n >= 15 ? "💥" : n >= 10 ? "🔥" : "⚡"} ${n} d'affilée !`] : [];
    };
    const puis = (fetes) => (fetes.length ? feter(fetes, suivante) : suivante());
    const nomCarte = (id) => { const x = info(id); return `${x.genre === "k" ? "Kanji" : "Mot"} · ${x.type}`; };
    const compter = (id, juste, rang) => L.enregistrerReponse(etat, juste, L.tempsActif(etat, tempsQuestion()), maintenant(), L.typeCarte(id), rang);
    // prochaine carte : rattrapage (3 cartes après l'erreur), cartes à échéance, cartes avancées (jour à venir trop chargé), nouvelle carte
    const choisir = (t) => {
      const dues = L.aJouer(etat, t).dues;
      if (session.rattrapage.length && (session.depuis >= 3 || !dues.length)) return { genre: "rattrapage", id: session.rattrapage[0] };
      if (dues.length) return { genre: "revision", id: dues[0], dues };
      const av = L.aAvancer(etat, t, budget());
      if (av) return { genre: "avance", id: av };
      const pr = L.prochaineNouvelle(etat, cartesActives().cartes);
      if (pr.carte) return { genre: "nouvelle", id: pr.carte.id };
      // plus rien d'autre à proposer : une carte mise de côté (3 erreurs de suite au rang 1) revient, sans rien dire
      const loin = L.prochaineLointaine(etat);
      if (loin) { L.ramener(etat, loin, t); return { genre: "revision", id: loin, dues: [loin] }; }
      return { genre: "rien", pr };
    };
    const suivante = () => {
      const t = maintenant(), auj = L.cleJour(t), but = butDuJour(), fait = cartesDuJour();
      session.reste = 0;
      if (!session.bonus && but > 0) {
        // temps habituel atteint : on propose 5 cartes de plus (profil.encore = [jour, nombre de cartes à atteindre])
        // les 5 cartes sont faites : feu d'artifice (une seule fois par jour)
        const enc = etat.profil.encore;
        if (enc && enc[0] === auj && fait >= enc[1]) return finObjectif();
      }
      const c = choisir(t);
      if (c.genre === "rien") return finJeu(c.pr);
      if (!session.bonus && but > 0) {
        let enc = etat.profil.encore;
        if (!enc || enc[0] !== auj) {
          // prévision : la carte qui arrive (on connaît son rang, donc le travail qu'elle demande) est-elle celle
          // où l'objectif sera atteint ? Oui si l'objectif tombe avant le milieu de cette carte.
          const prevu = c.genre === "rattrapage" ? 0 : L.coutCarte(etat, c.id);
          if (L.effortDuJour(etat, t) + prevu / 2 >= but) { enc = etat.profil.encore = [auj, fait + S.BUT_RAB]; sauver(); }
        }
        if (enc && enc[0] === auj) session.reste = enc[1] - fait;   // compte à rebours
      }
      if (c.genre === "rattrapage") { session.rattrapage.shift(); return rattraper(c.id); }
      if (c.genre === "revision") {
        const chronos = c.dues.filter((id) => S.CHRONO[etat.tuiles[id].rang]);
        if (session.challenge === null) {
          session.challenge = chronos.length ? "en cours" : "aucun";
          if (chronos.length) return annonceChallenge(chronos, suivante);
        }
        if (session.challenge === "en cours" && !chronos.length) { session.challenge = "fini"; alerte("Challenge terminé ! Place aux autres cartes."); }
        return reviser(c.id, false);
      }
      if (session.challenge === "en cours") session.challenge = "fini";
      if (c.genre === "avance") return reviser(c.id, true);
      nouvelle(c.id);
    };
    const reviser = (id, avance) => {
      const avant = etat.tuiles[id].rang;
      poser(id, { jeu: true, bonus: session.bonus, reste: session.reste, chrono: S.CHRONO[avant] || null, titre: `${avance ? "En avance · " : ""}${L.nomRang(avant)}` }, (res) => {
        const juste = res === "juste";
        compter(id, juste, avant);
        const apres = L.repondre(etat, id, juste, maintenant());
        session.faites++; session.depuis++;
        // une carte mise de côté ne revient pas « à revoir » : elle disparaît de la séance
        if (!juste) { if (!etat.tuiles[id].loin) session.rattrapage.push(id); session.depuis = 0; }
        sauver();
        const fetes = serie(juste);
        if (apres === S.ACQUIS) fetes.push("🏆 Carte acquise pour de bon !");
        else if (juste && apres === 6) fetes.push("🔥 Une carte de plus en feu !");
        puis(fetes);
      });
    };
    const rattraper = (id) => {
      session.depuis = 0;
      poser(id, { jeu: true, bonus: session.bonus, reste: session.reste, titre: "À revoir (ne change pas le rang)" }, (res) => {
        L.ajouterTemps(etat, L.tempsActif(etat, tempsQuestion()), maintenant()); sauver();
        if (res !== "juste") session.rattrapage.push(id);
        suivante();
      });
    };
    const nouvelle = (id) => {
      const x = info(id);
      poser(id, { jeu: true, bonus: session.bonus, reste: session.reste, titre: `Nouvelle carte · ${nomCarte(id)}`, texteErreur: "Carte ajoutée au rang 1 : tu la revois demain." }, (res) => {
        session.depuis++;
        if (res !== "juste") {
          compter(id, false, 0); serie(false);
          session.nouvelles++; L.placer(etat, id, 1, maintenant(), false); sauver(); return suivante();
        }
        const niveaux = [["tres_peu", "Très peu (c'était de la chance)"], ["un_peu", "Un peu"], ["moyen", "Moyen"], ["bien", "Bien"], ["tres_bien", "Très bien"]];
        const aff = x.genre === "m" ? motHTML(x.mot, false) : esc(x.type === "lecture" ? L.affichageLecture(x.cle, x.lecture) : x.cle);
        // tant que la carte n'est pas notée, rien n'est enregistré : quitter ici (croix, appli fermée) = carte jamais jouée
        ecran.innerHTML = `<div class="q-tete"><span>Nouvelle carte · ${nomCarte(id)}</span><button class="quitter ${session.bonus ? "fort" : ""}" id="b-quit" aria-label="Arrêter">✕</button></div>
          <div class="retour ok">Juste !</div>
          <div class="q-mot petit jp">${aff}</div>
          <p class="consigne">Tu le connaissais comment ?</p>
          <div class="options">${niveaux.map(([k, tx]) => `<button class="opt" data-c="${k}">${tx}</button>`).join("")}</div>`;
        $("#b-quit").onclick = accueil;
        scrollTo(0, 0);
        document.querySelectorAll("[data-c]").forEach((b) => b.onclick = () => {
          const r = S.CONFIANCE[b.dataset.c];
          compter(id, true, 0);
          L.placer(etat, id, r, maintenant(), true); sauver();
          session.nouvelles++;
          const fetes = serie(true);
          if (r >= 6) fetes.push("🔥 En feu du premier coup !");
          puis(fetes);
        });
      });
    };
    const bilan = () => `${session.faites} carte${session.faites > 1 ? "s" : ""} revue${session.faites > 1 ? "s" : ""} et ${session.nouvelles} nouvelle${session.nouvelles > 1 ? "s" : ""} dans cette séance.`;
    // objectif du jour atteint : feu d'artifice, puis Continuer ou Arrêter (la séance continue alors jusqu'à la croix)
    const finObjectif = () => {
      atteindre();
      feuDArtifice("Objectif du jour atteint !", () => {
        ecran.innerHTML = `<div class="retour ok">Objectif atteint 🎉</div>
          <p class="info">${bilan()}</p>
          <button class="gros" id="b-continuer">Continuer sur ma lancée</button>
          <button class="second" id="b-stop">Arrêter pour aujourd'hui</button>`;
        $("#b-stop").onclick = accueil;
        $("#b-continuer").onclick = () => { session.bonus = true; suivante(); };
      });
    };
    const finJeu = (pr) => {
      // plus de carte avant l'objectif : ce n'est pas un objectif raté, la journée compte comme réussie
      if (!session.bonus && cartesDuJour() > 0 && butDuJour() > 0 && !jourFini()) atteindre();
      const prochaine = L.prochaineOuverture(etat);
      const msg = pr.phase === "fini" ? "Toutes les cartes ont été vues. Bravo !"
        : `Les prochains mots se débloquent quand les cartes de leurs kanji sont au rang 5 (${pr.attente} carte(s) en attente).`;
      ecran.innerHTML = `<div class="retour ok">Plus rien à faire pour l'instant</div>
        <p class="info">${msg}</p>${prochaine ? `<p class="info">Prochaine carte ${duree(prochaine - maintenant())}.</p>` : ""}
        <p class="info">${bilan()}</p>
        <button class="gros" id="b-fin">Retour à l'accueil</button>`;
      $("#b-fin").onclick = accueil;
    };
    const demarrer = () => {
      const n = L.appliquerRetards(etat, maintenant());
      if (n) sauver();
      if (session.bonus) alerte("Objectif du jour déjà atteint : c'est du bonus !");
      suivante();
    };
    // objectif changé : la 1re fois, on demande quoi faire des cartes commencées hors objectif
    const hors = etat.reglages.demanderObjectif ? horsObjectif() : [];
    delete etat.reglages.demanderObjectif;
    if (!hors.length) return demarrer();
    sauver();
    ecran.innerHTML = `<div class="retour ok">Nouvel objectif : ${CHOIX_NIVEAUX[cartesActives().choix]}</div>
      <p class="info"><b>${hors.length}</b> carte(s) déjà commencée(s) ne font pas partie de ton objectif.</p>
      <button class="gros" id="b-retirer">Les retirer de mes cartes à revoir</button>
      <p class="aide">Elles sont mises en pause avec leur progression. Si tu les remets dans ton objectif, elles reprennent là où elles en étaient.</p>
      <button class="second" id="b-garder">Les garder</button>`;
    $("#b-retirer").onclick = () => { const n = L.pauser(etat, hors, maintenant()); sauver(); alerte(`${n} carte(s) mise(s) en pause.`); demarrer(); };
    $("#b-garder").onclick = demarrer;
  }

  // cartes commencées, non acquises, actives, mais hors de l'objectif
  function horsObjectif() {
    const dans = new Set(cartesActives().ids);
    return Object.entries(etat.tuiles).filter(([id, t]) => !dans.has(id) && !t.pause && t.rang < S.ACQUIS).map(([id]) => id);
  }

  // ---------- annonce CHALLENGE (cartes chronométrées en tête de séance) ----------
  function annonceChallenge(ids, ensuite) {
    const n30 = ids.filter((id) => etat.tuiles[id].rang === 9).length, n12 = ids.length - n30;
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
  // courbe : progression réelle (trait plein) puis estimation (pointillés) avec repères à 1 mois, 6 mois, 1 an
  const REPERES = [[30, "1 mois"], [182, "6 mois"], [365, "1 an"]];
  let projection = null;                     // { cle, points } : recalculée quand le jour ou la progression change
  const cleProjection = () => `${L.cleJour(maintenant())}|${etat.journal.length}|${cartesActives().choix}`;
  const assezDeDonnees = () => etat.profil.reponses.length >= 20;
  function courbe(P) {
    const ids = cartesActives().ids, tot = ids.length;
    const o = L.objectifs(etat, ids);
    const auj = L.cleJour(maintenant());
    // jours d'avant la v12.2 : pas de compteurs rang 2 et rang 6, ils ne sont pas tracés
    const h = Object.entries(etat.historique).filter(([c, v]) => c < auj && v.length >= 5).sort();
    h.push([auj, [o.r5, o.acquis, tot, o.r2, o.r6]]);
    const traces = OBJECTIFS.filter((x) => x.c);            // courbe : « En feu » seulement
    // avancement d'un objectif en % (arrondi vers le bas : 100 % seulement s'il est atteint)
    const pc = (v, x) => `${Math.floor(Math.min(1, v / cibleObjectif(x, tot)) * 100)} %`;
    const pastille = (x) => `<span class="pastille ${x.c || "vide"}"></span>`;
    const tete = OBJECTIFS.map((x) => `<div class="obj">${pastille(x)}<span>${x.nom}</span><b>${Math.min(o[x.cle], cibleObjectif(x, tot))}/${cibleObjectif(x, tot)}</b></div>`).join("");
    if (h.length < 2 && !P) return `${tete}${assezDeDonnees() ? `<p class="aide legende-c">Calcul de l'estimation…</p>` : ""}`;
    const W = 320, Ht = 132, g = 6, d = W - 6, bas = Ht - 20;
    const y = (f) => bas - Math.min(1, f) * (bas - 8);
    const x0 = !P ? d : (h.length >= 2 ? g + 0.34 * (d - g) : g);          // position d'aujourd'hui
    const jour = (c) => new Date(c + "T00:00:00").getTime();
    const t0 = jour(h[0][0]), t1 = jour(auj);
    const xh = (c) => (t1 > t0 ? g + ((jour(c) - t0) / (t1 - t0)) * (x0 - g) : x0);
    const ligneH = (x) => h.map(([c, v]) => `${xh(c).toFixed(1)},${y(v[x.h] / v[2]).toFixed(1)}`).join(" ");
    const legende = `<p class="aide legende-c">Trait plein : ta progression · pointillés : estimation</p>`;
    let prev = "", table = "";
    if (P) {
      // échelle : un tiers de la largeur pour le 1er mois, un tiers jusqu'à 6 mois, un tiers jusqu'à 1 an
      const xp = (j) => x0 + (d - x0) * (j <= 30 ? j / 90 : j <= 182 ? 1 / 3 + (j - 30) / 456 : 2 / 3 + (j - 182) / 549);
      const jours = []; for (let j = 0; j < P.length; j += (j < 30 ? 1 : 4)) jours.push(j);
      if (jours[jours.length - 1] !== P.length - 1) jours.push(P.length - 1);
      const ligneP = (k) => jours.map((j) => `${xp(j).toFixed(1)},${y(P[j][k] / tot).toFixed(1)}`).join(" ");
      prev = `<line x1="${x0}" x2="${x0}" y1="6" y2="${bas}" class="rep"/><text x="${x0}" y="${Ht - 6}" text-anchor="${h.length >= 2 ? "middle" : "start"}" class="rep-t">auj.</text>
        ${REPERES.map(([j, nom], i) => `<line x1="${xp(j).toFixed(1)}" x2="${xp(j).toFixed(1)}" y1="6" y2="${bas}" class="rep"/><text x="${xp(j).toFixed(1)}" y="${Ht - 6}" text-anchor="${i === 2 ? "end" : "middle"}" class="rep-t">${nom}</text>`).join("")}
        ${traces.map((x) => `<polyline points="${ligneP(x.k)}" class="${x.c} est"/>`).join("")}`;
      const col = (x) => `<td>${pc(P[0][x.k], x)}</td>${REPERES.map(([j]) => `<td>${pc(P[Math.min(j, P.length - 1)][x.k], x)}</td>`).join("")}`;
      table = `<table class="proj"><tr><th>Estimation</th><th>auj.</th>${REPERES.map(([, nom]) => `<th>${nom}</th>`).join("")}</tr>
        ${OBJECTIFS.map((x) => `<tr><td>${pastille(x)}${x.nom}</td>${col(x)}</tr>`).join("")}</table>${legende}`;
    }
    return `${tete}<svg viewBox="0 0 ${W} ${Ht}" class="courbe" role="img" aria-label="Progression réelle et estimation">
      <line x1="${g}" x2="${d}" y1="${y(1)}" y2="${y(1)}" class="but"/><text x="${g + 2}" y="${y(1) + 11}" class="but-t">100 %</text>
      <line x1="${g}" x2="${d}" y1="${y(0)}" y2="${y(0)}" class="axe"/>${prev}
      ${traces.map((x) => `<polyline points="${ligneH(x)}" class="${x.c}"/>`).join("")}</svg>
      ${P ? table : `<div class="courbe-dates"><span>${h[0][0].slice(5).split("-").reverse().join("/")}</span><span>aujourd'hui</span></div>
        ${assezDeDonnees() ? `<p class="aide legende-c">Calcul de l'estimation…</p>` : ""}`}`;
  }
  function accueil() {
    onglets("accueil");
    clearInterval(minuteur);
    const t = maintenant();
    const retards = L.appliquerRetards(etat, t);
    if (retards) { sauver(); alerte(`${retards} carte${retards > 1 ? "s" : ""} redescendue${retards > 1 ? "s" : ""} d'un rang (pas vue${retards > 1 ? "s" : ""} à temps).`); }
    const act = cartesActives();
    const pr = L.prochaineNouvelle(etat, act.cartes);
    const nb = cartesDuJour(), min = Math.floor(L.tempsJour(etat, t) / 60);
    let sous;
    const fini = jourFini();
    if (fini) sous = "Objectif du jour atteint ✓ (continue si tu veux)";
    else if (L.aJouer(etat, t).dues.length || pr.carte || L.prochaineLointaine(etat)) sous = nb ? "On continue ?" : "C'est parti !";
    else { const p = L.prochaineOuverture(etat); sous = p ? `Prochaine carte ${duree(p - t)}` : "Rien à faire"; }
    const cle = cleProjection();
    const P = projection && projection.cle === cle ? projection.points : null;
    ecran.innerHTML = `
      <h1><img class="logo-mini" src="nihon-192.png" alt="">Kanji JLPT <span class="sous">${{ N5: "N5", N4: "N4", N5N4: "N5 · N4" }[act.choix]}</span></h1>
      <button class="gros jouer" id="b-jouer">▶ Jouer<span>${sous}</span></button>
      <div class="carte-info temps-jour">
        <div class="tj-texte"><span>Aujourd'hui</span><b>${fini ? "✓ " : ""}${nb} carte${nb > 1 ? "s" : ""} · ${min} min</b></div>
      </div>
      <div class="carte-info" id="bloc-courbe">${courbe(P)}</div>`;
    $("#b-jouer").onclick = jouer;
    if (!P && assezDeDonnees()) setTimeout(() => {
      projection = { cle, points: L.projeter(etat, act.cartes, maintenant(), { graine: Math.floor(L.debutJour(maintenant()) / L.J) }) };
      const bloc = $("#bloc-courbe");
      if (bloc && cleProjection() === cle) bloc.innerHTML = courbe(projection.points);
    }, 30);
  }

  // ---------- Acquis ----------
  function vueAcquis() {
    onglets("acquis");
    const ids = IDS.filter((id) => L.rangDe(etat, id) === S.ACQUIS);
    ecran.innerHTML = `<h1>Acquis</h1>
      <p class="info">${ids.length} carte${ids.length > 1 ? "s" : ""} acquise${ids.length > 1 ? "s" : ""}.</p>
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
        poser(id, { chrono: 12, titre: `Acquis · ${n}/${total}`, texteErreur: "La carte redescend au rang 9 : elle revient dans 30 jours." }, (res) => {
          L.ajouterTemps(etat, L.tempsActif(etat, tempsQuestion()), maintenant());
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
  const GROUPES = [["Pas vues", "g0", 0], ["Rang 1 à 4", "g1", 4], ["Rang 5 et 6", "g2", 6], ["Rang 7 et 8", "g3", 8], ["Rang 9 et 10", "g4", 10], ["Acquis", "g5", 11]];
  const groupe = (r) => GROUPES.find((x) => r <= x[2])[1];
  // maîtrise d'un kanji en 5 couleurs
  const MAITRISES = [["Pas commencé", "m0"], ["Débuté (moins de 40 %)", "m1"], ["En cours (40 à 74 %)", "m2"], ["Solide (75 % et plus)", "m3"], ["Acquis (100 %)", "m4"]];
  const couleurMaitrise = (p) => (p <= 0 ? "m0" : p < 0.4 ? "m1" : p < 0.75 ? "m2" : p < 0.9999 ? "m3" : "m4");
  function etatCarte(id) {
    const t = etat.tuiles[id];
    if (!t) return "pas encore vue";
    if (t.rang >= S.ACQUIS) return "Acquis";
    if (t.pause) return `${L.nomRang(t.rang)}, en pause`;
    if (t.loin) return `${L.nomRang(t.rang)}, revient plus tard`;
    const f = L.fenetre(t), n = maintenant();
    return `${L.nomRang(t.rang)}, ${f.due <= n ? "à revoir maintenant" : "revient " + duree(f.due - n)}`;
  }
  function vueProgres() {
    onglets("progres");
    const act = cartesActives();
    const niveauK = (c) => PAR_KANJI[c.id.split(":")[1]].niveau;
    const familles = [["Kanji N5", (c) => c.phase === "kanji" && niveauK(c) === "N5"],
      ["Kanji N4", (c) => c.phase === "kanji" && niveauK(c) === "N4"],
      ["Vocabulaire niveau 1", (c) => c.phase === "combo"], ["Vocabulaire niveau 2", (c) => c.phase === "mixte"]];
    const barres = familles.map(([nom, fn]) => {
      const ids = act.cartes.filter(fn).map((c) => c.id);
      if (!ids.length) return "";
      const cpt = {}; for (const id of ids) { const g = groupe(L.rangDe(etat, id)); cpt[g] = (cpt[g] || 0) + 1; }
      const segs = GROUPES.map(([, c]) => cpt[c] ? `<div class="${c}" style="flex:${cpt[c]}"></div>` : "").join("");
      const acq = cpt.g5 || 0, nouv = cpt.g0 || 0;
      return `<div class="fam"><div class="fam-t"><span>${nom}</span><span>${ids.length - nouv} commencées · ${acq} acquises / ${ids.length}</span></div><div class="pile">${segs}</div></div>`;
    }).join("");
    const kanjis = FICHES.filter((f) => act.choix.includes(f.niveau));
    const moyenne = kanjis.reduce((s, f) => s + maitrise(f.kanji), 0) / kanjis.length;
    ecran.innerHTML = `<h1>Progrès <span class="sous">${{ N5: "N5", N4: "N4", N5N4: "N5 · N4" }[act.choix]}</span></h1>
      <h2>Cartes</h2>${barres}
      <div class="legende-g">${GROUPES.map(([n, c]) => `<span class="${c}">${n}</span>`).join("")}</div>
      <h2>Maîtrise des kanji <span class="sous">moyenne ${Math.round(moyenne * 100)} %</span></h2>
      <div class="legende-g">${MAITRISES.map(([n, c]) => `<span class="${c}">${n}</span>`).join("")}</div>
      <div class="grille">${kanjis.map((f) => `<button class="case ${couleurMaitrise(maitrise(f.kanji))} jp" data-k="${esc(f.kanji)}">${esc(f.kanji)}</button>`).join("")}</div>`;
    document.querySelectorAll(".case").forEach((b) => b.onclick = () => {
      const k = b.dataset.k, p = maitrise(k);
      const lignes = PROPRES[k].map((id) => {
        const x = info(id);
        return `<li><span>${x.type === "sens" ? `Sens « ${esc(x.fiche.sensCartes[x.idx])} »` : `Lecture <span class="jp">${esc(L.reponseLecture(x.lecture))}</span>`}</span><span>${etatCarte(id)}</span></li>`;
      }).join("");
      const mots = [...new Set(DES_MOTS[k].filter((m) => act.choix.includes(m.niveau)).flatMap((m) => m.ids))];
      const vues = mots.filter((id) => L.introduite(etat, id)).length;
      const moyMots = mots.length ? Math.round((mots.reduce((s, id) => s + L.rangDe(etat, id) / S.ACQUIS, 0) / mots.length) * 100) : 0;
      ecran.innerHTML = `${ficheHTML(`k:${k}:s0`, true)}
        <div class="carte-info"><div class="maitrise"><span>Maîtrise</span><b class="${couleurMaitrise(p)}">${Math.round(p * 100)} %</b></div>
        <ul class="cartes-k">${lignes}
          <li><span>Mots qui utilisent ce kanji</span><span>${mots.length ? `${vues}/${mots.length} cartes vues, ${moyMots} %` : "aucun"}</span></li></ul></div>
        <button class="gros" id="b-r">Retour</button>`;
      $("#b-r").onclick = vueProgres;
      scrollTo(0, 0);
    });
  }

  // ---------- Paramètres ----------
  function vueOptions() {
    onglets("options");
    const t = maintenant();
    const tenu = L.tempsTenu(etat, t);
    const n = etat.profil.reponses.length;
    const ch = cartesActives().choix;
    const compte = (k) => `${FICHES.filter((f) => k.includes(f.niveau)).length} kanji · ${MOTS.filter((m) => k.includes(m.niveau)).length} mots`;
    const taux = Math.round(L.tauxReussite(etat) * 100);
    // stats : jours d'affilée (aujourd'hui compris s'il est joué, sinon jusqu'à hier), temps total, cartes commencées
    const joue = (i) => (etat.profil.jours[L.cleJour(L.plusJours(t, -i))] || 0) > 0;
    let serie = 0; for (let i = joue(0) ? 0 : 1; joue(i); i++) serie++;
    const minTotal = Math.round(Object.values(etat.profil.jours).reduce((s, x) => s + x, 0) / 60);
    const vues = cartesActives().ids.filter((id) => L.introduite(etat, id)).length;
    const themeActif = NOMS_THEMES[etat.reglages.theme] ? etat.reglages.theme : THEME_DEFAUT;
    const tend = L.tendance(etat);
    ecran.innerHTML = `<h1>Paramètres</h1>
      <section class="panneau">
        <h2>Objectif</h2>
        <div class="segments" role="radiogroup">${Object.entries(CHOIX_NIVEAUX).map(([k, nom]) =>
          `<button class="seg ${k === ch ? "actif" : ""}" data-niv="${k}" role="radio" aria-checked="${k === ch}"><b>${{ N5: "N5", N4: "N4", N5N4: "N5 + N4" }[k]}</b><span>${compte(k)}</span></button>`).join("")}</div>
      </section>
      <details class="panneau" id="d-theme">
        <summary>Thème</summary>
        ${FAMILLES_THEMES.map(([fam, ts]) => `<div class="th-fam">${fam}</div><div class="th-grille">${ts.map(([k, nom]) => {
          const [page, accent] = COULEURS_THEMES[k];
          return `<button class="th ${k === themeActif ? "actif" : ""}" data-th="${k}" aria-pressed="${k === themeActif}"><i style="background:${page};border-color:${accent}"><i style="background:${accent}"></i></i><span>${nom}</span></button>`;
        }).join("")}</div>`).join("")}
      </details>
      <details class="panneau" id="d-stats">
        <summary>Mes stats</summary>
        <div class="tuiles-stat">
          <div class="stat"><b>${taux} %</b><span>bonnes réponses</span></div>
          <div class="stat"><b>${Math.round(L.secondesParCarte(etat))} s</b><span>par carte</span></div>
          <div class="stat"><b>${tenu === null ? "–" : Math.round(tenu) + "′"}</b><span>tenu / jour</span></div>
          <div class="stat"><b>${serie}</b><span>jour${serie > 1 ? "s" : ""} d'affilée</span></div>
          <div class="stat"><b>${minTotal >= 60 ? `${Math.floor(minTotal / 60)} h ${String(minTotal % 60).padStart(2, "0")}` : minTotal + "′"}</b><span>temps total</span></div>
          <div class="stat"><b>${vues}</b><span>cartes vues</span></div>
        </div>
        <div class="th-fam st-titre">Temps par type de carte</div>
        <div class="tuiles-stat t4">${[["ks", "kanji sens"], ["kl", "kanji lecture"], ["ms", "mot sens"], ["ml", "mot lecture"]].map(([ty, nom]) =>
          `<div class="stat"><b>${etat.profil.reponses.some((x) => x[3] === ty) ? Math.round(L.secondesParType(etat, ty)) + " s" : "–"}</b><span>${nom}</span></div>`).join("")}</div>
        <div class="th-fam st-titre">Réussite par rang</div>
        <div class="tuiles-stat t5">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((r) =>
          `<div class="stat"><b>${etat.profil.reponses.some((x) => x[4] === r) ? Math.round(L.tauxParRang(etat, r) * 100) + " %" : "–"}</b><span>rang ${r}</span></div>`).join("")}</div>
        <div class="th-fam st-titre">Tendance${tend ? ` (${tend.n} dernières réponses)` : ""}</div>
        <div class="tuiles-stat t2">
          <div class="stat"><b>${tend ? `${Math.round(tend.taux[0] * 100)} → ${Math.round(tend.taux[1] * 100)} %` : "–"}</b><span>bonnes réponses</span></div>
          <div class="stat"><b>${tend ? `${Math.round(tend.secondes[0])} → ${Math.round(tend.secondes[1])} s` : "–"}</b><span>par carte</span></div>
        </div>
      </details>
      <section class="panneau">
        <h2>Mise à jour</h2>
        <p class="ligne-reglage">Version installée <b id="v-inst" class="version">…</b></p>
        <button class="second" id="b-maj">Chercher une mise à jour</button>
      </section>
      ${installee() ? "" : `<section class="panneau">
        <h2>Installer sur le téléphone</h2>
        <button class="second" id="b-inst">Installer sur le téléphone</button>
        <p class="aide" id="p-inst">${invitation ? "Un appui, puis « Installer »." : aideInstallation()}</p>
      </section>`}
      <section class="panneau">
        <h2>Sauvegarde</h2>
        <div class="deux">
          <button class="second" id="b-sauv">Sauvegarder</button>
          <label class="second fichier">Restaurer<input type="file" id="f-rest" accept=".json,application/json"></label>
        </div>
      </section>
      <details class="panneau" id="d-regles">
        <summary>Règles de l'appli</summary>
        <h3>Accueil</h3>
        <ul class="regles">
          <li><b>Les 4 objectifs</b> : ${OBJECTIFS.map((o, i) => `${i + 1}. <b>${o.nom}</b> : ${o.regle}`).join(" ; ")}. Ils comptent toutes les cartes de ton choix N5 / N4 / N5 + N4.</li>
          <li><b>Aujourd'hui</b> : le nombre de cartes faites et le temps passé.</li>
          <li><b>Courbe</b> : elle montre l'objectif « En feu 🔥 ». Trait plein : ta progression réelle, à partir du 2e jour. Pointillés : une estimation à 1 mois, 6 mois et 1 an, calculée d'après ton rythme réel (temps par jour, réussite, vitesse) et refaite chaque jour, à partir d'une vingtaine de réponses. Ce n'est pas une garantie.</li>
          <li><b>Tableau</b> : l'avancement estimé de chaque objectif (100 % = objectif atteint).</li>
        </ul>
        <h3>Jouer</h3>
        <ul class="regles">
          <li><b>Jouer</b> : d'abord les cartes à revoir, de la mieux connue à la moins connue (les cartes chronométrées en premier), puis les nouvelles cartes. Tu t'arrêtes quand tu veux avec la croix ✕.</li>
          <li><b>Objectif du jour</b> : rien à régler. L'appli regarde combien de cartes tu fais d'habitude et te fixe un objectif à ta portée, qui s'adapte à toi de jour en jour. Les 5 dernières cartes sont décomptées, puis c'est le feu d'artifice ; tu peux continuer ensuite. Le premier jour, il n'y a pas encore d'objectif : joue comme tu le sens.</li>
          <li><b>Encouragements</b> : un éclair sur les côtés à chaque bonne réponse, une petite explosion toutes les 5 bonnes réponses d'affilée, quand une carte passe « en feu » (rang 6) et quand elle est acquise.</li>
          <li><b>Erreur de doigt</b> : sous « Continuer », le bouton « J'ai missclick, déso bro » compte ta réponse comme juste.</li>
          <li><b>Rangs</b> : chaque carte a un rang de 1 à 10, puis Acquis. Délai avant de la revoir : rangs 1 et 2 : 1 jour, rang 3 : 2 jours, rang 4 : 3 jours, rang 5 : 1 semaine, rang 6 : 2 semaines, rang 7 : 1 mois, rangs 8 et 9 : 80 jours, rang 10 : 1 mois. Les rangs 9 et 10 sont chronométrés (30 s puis 12 s).</li>
          <li><b>Réponse</b> : juste = +1 rang, erreur = -1 rang. Une carte ratée qui se retrouve au rang 1 revient 3 h plus tard. Dans la séance, une carte ratée repasse 3 cartes plus tard, sans effet sur son rang.</li>
          <li><b>Nouvelle carte</b> : ratée, elle entre au rang 1. Réussie, ta note la place : très peu = rang 1, un peu = 2, moyen = 5, bien = 7, très bien = 8. Si tu quittes avant de la noter, elle n'est pas comptée : elle reviendra comme une nouvelle carte.</li>
          <li><b>Retard</b> : une carte a quelques jours de marge pour être revue (1 jour aux rangs 1 à 4, 7 à 16 jours ensuite). Passé ce délai, elle descend d'un rang, sans que ce soit compté comme une erreur.</li>
          <li><b>Ordre des nouvelles cartes</b> : les kanji seuls, puis le vocabulaire niveau 1 (tous les kanji du mot sont à connaître), puis le niveau 2 (furigana sur les kanji hors liste), les mots les plus courts d'abord. Un mot arrive quand, pour chacun de ses kanji, le sens et la prononciation utilisée dans le mot sont au rang 5.</li>
          <li><b>Temps</b> : plus d'une minute sur une carte ne compte pas (téléphone posé).</li>
        </ul>
        <h3>Progrès</h3>
        <ul class="regles">
          <li><b>Maîtrise des kanji</b> : la couleur d'un kanji compte toutes ses cartes : ses sens, ses prononciations et les mots qui l'utilisent. Touche un kanji pour le détail.</li>
          <li><b>Calcul</b> : une carte vaut son rang sur 11 (0 % si pas encore vue, 100 % si acquise). La maîtrise compte pour moitié les cartes du kanji et pour moitié celles de ses mots.</li>
        </ul>
        <h3>Acquis</h3>
        <ul class="regles">
          <li><b>Entraînement</b> : tu t'entraînes sur ce que tu as déjà acquis, avec 12 s par question. Une bonne réponse ne change rien. Une erreur fait redescendre la carte au rang 9 (chrono 30 s) : elle revient dans Jouer 30 jours plus tard.</li>
        </ul>
        <h3>Options</h3>
        <ul class="regles">
          <li><b>Objectif N5 / N4</b> : les nouvelles cartes, la progression et l'onglet Progrès suivent ton choix. Si tu le changes, au prochain Jouer l'appli te demande si tu gardes ou retires les cartes commencées qui n'en font plus partie. En N4 seul, les kanji N5 sont supposés connus.</li>
          <li><b>Thème</b> : les thèmes du dashboard SUPERVISOR3000. Le changement est immédiat.</li>
          <li><b>Mes stats</b> : bonnes réponses sur tes 200 dernières cartes revues (50 % au départ, tant qu'il y a moins de 30 réponses) ; secondes par carte ; temps tenu par jour (moyenne des 7 derniers jours, après 7 jours d'utilisation) ; jours joués d'affilée ; temps total passé ; cartes déjà vues. Temps par type de carte : moyenne des 50 dernières cartes de ce type. Réussite par rang : tes 60 dernières réponses à ce rang. Tendance : tes dernières réponses comparées aux précédentes (à partir de 40 réponses).</li>
          <li><b>Mise à jour</b> : l'appli vérifie toute seule à chaque ouverture et te prévient quand une nouvelle version est prête.</li>
          <li><b>Sauvegarde</b> : ta progression est enregistrée sur ce téléphone. Fais une sauvegarde de temps en temps (fichier dans Téléchargements).</li>
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
    document.querySelectorAll("[data-th]").forEach((bt) => bt.onclick = () => {
      etat.reglages.theme = bt.dataset.th; sauver(); appliquerTheme();
      document.querySelectorAll("[data-th]").forEach((x) => { const a = x === bt; x.classList.toggle("actif", a); x.setAttribute("aria-pressed", a); });
      alerte(`Thème : ${bt.textContent}`);
    });
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
          ["Oui, restaurer", "gros", () => { etat = L.migrer(e2, plan, maintenant()); sauver(); appliquerTheme(); alerte("Sauvegarde restaurée."); accueil(); }],
          ["Annuler", "second", null]]);
      }).catch(() => alerte("Ce fichier n'est pas une sauvegarde valable."));
    };
    $("#b-raz").onclick = () => {
      const nb = Object.keys(etat.tuiles).length;
      fenetre("Tout effacer ?", `Toute ta progression sera perdue (<b>${nb}</b> carte(s) commencée(s)). C'est définitif, sauf si tu as une sauvegarde.`, [
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
  window.__app = { accueil, etat: () => etat, recharger: () => { projection = null; charger(); appliquerTheme(); accueil(); }, CARTES, ALIAS, maitrise, info,
    projection: () => projection };   // tests
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
