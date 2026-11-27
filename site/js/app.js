import { decouperPhrases, decouperMots, paragraphesDepuisTexte, empreinte } from './texte.js';
import { syllabes } from './syllabes.js';
import * as stockage from './stockage.js';
import * as ia from './ia.js';

const $ = (s, racine = document) => racine.querySelector(s);
const $$ = (s, racine = document) => [...racine.querySelectorAll(s)];
const icone = (nom, classe = '') => `<svg class="ico ${classe}" aria-hidden="true"><use href="img/icones.svg#${nom}"></use></svg>`;
const echapper = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const PUCE = /^([•·▪‣◦○●■□➢➤►✓✔–—-]|\(?\d{1,2}[.)])\s/u;

let doc = null; // { id, titre, paragraphes: [{ type, texte }] }
let ongletActif = 'adaptation';

// ======================================================================
// Rendu du texte
// ======================================================================

function htmlMots(texte) {
  return decouperMots(texte).map((j) => {
    if (j.type !== 'mot') return echapper(j.texte);
    const syl = syllabes(j.texte).map((s) => `<span class="syl">${echapper(s)}</span>`).join('');
    return `<span class="mot">${syl}</span>`;
  }).join('');
}

// Ligne reformulée : les termes clés arrivent entre ** et restent en gras.
function htmlLigneReformulee(ligne) {
  return ligne.split(/\*\*(.+?)\*\*/g)
    .map((morceau, i) => (i % 2 ? `<strong class="terme">${htmlMots(morceau)}</strong>` : htmlMots(morceau)))
    .join('');
}

function rendreAdaptation() {
  const p = $('#panneau-adaptation');
  p.innerHTML = doc.paragraphes.map((b, i) => {
    if (b.type === 'titre') return `<h2 class="titre phrase" data-p="${i}">${htmlMots(b.texte)}</h2>`;
    const phrases = decouperPhrases(b.texte).map((ph) => `<span class="phrase">${htmlMots(ph)}</span>`).join('');
    const puce = PUCE.test(b.texte) ? ' puce' : '';
    return `<div class="para${puce}" data-p="${i}">${phrases}</div>`;
  }).join('') || '<p class="vide">Ce document ne contient pas de texte.</p>';
}

// ======================================================================
// Ouverture d'un document
// ======================================================================

function afficherAccueil() {
  arreterLecture();
  fermerBulle();
  doc = null;
  document.body.classList.remove('en-lecture');
  $('#vue-lecture').hidden = true;
  $('#vue-accueil').hidden = false;
  $('#onglets').hidden = true;
  $('#titre-doc').hidden = true;
  document.title = 'Déclic – lire ses cours plus facilement';
  rendreRecents();
  window.scrollTo(0, 0);
}

function ouvrirDocument(nouveau, { historique = true } = {}) {
  doc = nouveau;
  stockage.sauverDoc(doc);
  $('#vue-accueil').hidden = true;
  $('#vue-lecture').hidden = false;
  $('#onglets').hidden = false;
  $('#titre-doc').hidden = false;
  $('#titre-doc').textContent = doc.titre;
  document.title = `${doc.titre} – Déclic`;
  document.body.classList.add('en-lecture');
  $('#panneau-reformulation').dataset.doc = '';
  rendreAdaptation();
  choisirOnglet('adaptation');
  messageAccueil('');
  window.scrollTo(0, 0);
  if (historique) history.pushState({ doc: doc.id }, '', '#lire');
}

function creerDocument(titre, paragraphes) {
  const titrePropre = (titre || '').trim()
    || paragraphes.find((p) => p.type === 'titre')?.texte
    || (paragraphes[0]?.texte || 'Document').slice(0, 60);
  const id = empreinte(titrePropre + paragraphes.map((p) => p.texte).join('\n').slice(0, 5000));
  return { id, titre: titrePropre, paragraphes };
}

function messageAccueil(texte, erreur = false) {
  const m = $('#message-accueil');
  m.textContent = texte;
  m.classList.toggle('erreur', erreur);
}

async function ouvrirPdf(donnees, nomFichier) {
  messageAccueil('Lecture du PDF…');
  try {
    const { lirePdf } = await import('./pdf.js');
    const res = await lirePdf(donnees, (n, total) => messageAccueil(`Lecture du PDF… page ${n} sur ${total}`));
    if (res.scanne || !res.paragraphes.length) {
      messageAccueil('Ce PDF semble être une image scannée : Déclic ne sait pas encore lire ce type de document. Essaie avec un PDF où l’on peut sélectionner le texte.', true);
      return;
    }
    const nom = (nomFichier || '').replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim();
    ouvrirDocument(creerDocument(nom || res.titre, res.paragraphes));
  } catch (e) {
    console.error(e);
    messageAccueil('Impossible de lire ce PDF. Il est peut-être protégé ou abîmé.', true);
  }
}

async function ouvrirFichier(fichier) {
  if (!fichier) return;
  if (!/pdf$/i.test(fichier.type) && !/\.pdf$/i.test(fichier.name)) {
    messageAccueil('Choisis un fichier PDF.', true);
    return;
  }
  ouvrirPdf(await fichier.arrayBuffer(), fichier.name);
}

async function ouvrirLien(url) {
  if (!ia.iaDisponible()) {
    messageAccueil('L’ouverture de liens arrive bientôt. En attendant, copie le texte de la page et utilise « Coller un texte ».', true);
    return;
  }
  if (!stockage.code() && !(await demanderCode())) return;
  messageAccueil('Récupération de la page…');
  try {
    const res = await ia.chargerLien(url);
    if (res.pdf) {
      const nom = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
      await ouvrirPdf(res.pdf, nom);
      return;
    }
    if (!res.paragraphes?.length) {
      messageAccueil('Je n’ai pas trouvé de texte à lire sur cette page.', true);
      return;
    }
    ouvrirDocument(creerDocument(res.titre, res.paragraphes));
  } catch (e) {
    if (e instanceof ia.ErreurCode) {
      stockage.definirCode('');
      if (await demanderCode()) ouvrirLien(url);
      return;
    }
    messageAccueil(e.message, true);
  }
}

function rendreRecents() {
  const liste = stockage.listeDocs();
  $('#recents').hidden = liste.length === 0;
  $('#liste-recents').innerHTML = liste.map((d) => `
    <li>
      <button type="button" class="ouvrir-doc" data-id="${d.id}">
        ${icone('file-text')}<span>${echapper(d.titre)}</span>
        <span class="date">${new Date(d.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
      </button>
      <button type="button" class="icone-btn oublier-doc" data-id="${d.id}" aria-label="Retirer « ${echapper(d.titre)} » de la liste">${icone('trash')}</button>
    </li>`).join('');
}

// ======================================================================
// Onglets
// ======================================================================

function choisirOnglet(nom) {
  if (nom !== ongletActif) arreterLecture();
  ongletActif = nom;
  fermerBulle();
  for (const n of ['adaptation', 'reformulation']) {
    const actif = n === nom;
    const bouton = $(`#onglet-${n}`);
    bouton.setAttribute('aria-selected', String(actif));
    bouton.tabIndex = actif ? 0 : -1;
    $(`#panneau-${n}`).hidden = !actif;
  }
  if (nom === 'reformulation') rendreReformulation();
}

const panneauActif = () => $(`#panneau-${ongletActif}`);

// ======================================================================
// Onglet Reformulation
// ======================================================================

let observateur = null;
let fileReform = [];
let enCours = 0;

function rendreReformulation() {
  const p = $('#panneau-reformulation');
  if (!ia.iaDisponible()) {
    p.dataset.doc = '';
    p.innerHTML = `<div class="vide">${icone('sparkles', 'ico-grand')}<p>La reformulation complète arrive bientôt.<br>En attendant, clique sur un mot dans l’onglet Adaptation pour l’écouter et voir ses syllabes.</p></div>`;
    return;
  }
  if (!stockage.code()) {
    p.dataset.doc = '';
    p.innerHTML = `<div class="vide">${icone('key', 'ico-grand')}<p>Pour voir le texte reformulé, entre le code d’accès donné par ton prof.</p><button type="button" class="btn btn-principal" data-action="code">Entrer le code</button></div>`;
    return;
  }
  if (p.dataset.doc === doc.id) return;
  p.dataset.doc = doc.id;
  const deja = stockage.lireReformulations(doc.id);
  let numero = 0;
  p.innerHTML = doc.paragraphes.map((b, i) => {
    if (b.type === 'titre') return `<h2 class="titre phrase" data-p="${i}">${htmlMots(b.texte)}</h2>`;
    // Les lignes courtes (puces, phrases brèves) restent telles quelles, sans appel à l'IA.
    if (b.texte.length < 90) {
      return `<div class="para${PUCE.test(b.texte) ? ' puce' : ''}" data-p="${i}">${htmlLignes([b.texte])}</div>`;
    }
    numero += 1;
    const corps = deja[i] ? htmlLignes(deja[i]) : '<div class="chargement" aria-label="Reformulation en cours"><span></span><span></span><span></span></div>';
    const aFaire = !deja[i];
    return `<section class="bloc-reform" data-p="${i}"${aFaire ? ' data-a-faire="1"' : ''}>
      <div class="bloc-tete"><span>Paragraphe ${numero}</span><button type="button" class="lien" data-action="original" data-p="${i}">${icone('arrow-back-up')}Voir l’original</button></div>
      <div class="bloc-corps">${corps}</div></section>`;
  }).join('');

  // On ne reformule que les paragraphes qui approchent de l'écran, pour ne rien payer d'inutile.
  observateur?.disconnect();
  fileReform = [];
  observateur = new IntersectionObserver((entrees) => {
    for (const e of entrees) {
      if (!e.isIntersecting) continue;
      observateur.unobserve(e.target);
      fileReform.push(e.target);
    }
    traiterFile();
  }, { rootMargin: '800px 0px' });
  $$('[data-a-faire]', p).forEach((el) => observateur.observe(el));
}

const htmlLignes = (lignes) => lignes.map((l) => `<span class="phrase">${htmlLigneReformulee(l)}</span>`).join('');

function traiterFile() {
  while (enCours < 2 && fileReform.length) {
    const bloc = fileReform.shift();
    if (!bloc.isConnected) continue;
    enCours += 1;
    reformulerBloc(bloc).finally(() => {
      enCours -= 1;
      traiterFile();
    });
  }
}

async function reformulerBloc(bloc) {
  const docId = doc.id;
  const i = Number(bloc.dataset.p);
  const para = doc.paragraphes[i];
  let titre = '';
  for (let k = i - 1; k >= 0; k--) if (doc.paragraphes[k].type === 'titre') { titre = doc.paragraphes[k].texte; break; }
  const corps = $('.bloc-corps', bloc);
  try {
    const res = await ia.reformulerParagraphe(para.texte, titre);
    const lignes = (res.lignes || []).filter(Boolean);
    if (!lignes.length) throw new Error('Réponse vide.');
    stockage.sauverReformulation(docId, i, lignes);
    if (doc?.id === docId) {
      corps.innerHTML = htmlLignes(lignes);
      bloc.removeAttribute('data-a-faire');
    }
  } catch (e) {
    if (e instanceof ia.ErreurCode) {
      stockage.definirCode('');
      $('#panneau-reformulation').dataset.doc = '';
      if (ongletActif === 'reformulation') rendreReformulation();
      return;
    }
    corps.innerHTML = `<div class="erreur-bloc">${icone('alert-circle')}<span>${echapper(e.message)}</span><button type="button" class="lien" data-action="reessayer">Réessayer</button></div>`;
  }
}

function voirOriginal(i) {
  choisirOnglet('adaptation');
  const cible = $(`#panneau-adaptation [data-p="${i}"]`);
  if (!cible) return;
  cible.scrollIntoView({ behavior: 'smooth', block: 'center' });
  cible.classList.remove('surbrillance');
  void cible.offsetWidth;
  cible.classList.add('surbrillance');
}

// ======================================================================
// Bulle d'aide sur un mot
// ======================================================================

const bulle = $('#bulle');
let motActif = null;
let jetonBulle = 0;

function fermerBulle() {
  bulle.hidden = true;
  motActif?.classList.remove('actif');
  motActif = null;
  jetonBulle += 1;
}

function placerBulle() {
  if (!motActif) return;
  const r = motActif.getBoundingClientRect();
  const largeur = bulle.offsetWidth;
  const hauteur = bulle.offsetHeight;
  let gauche = r.left + window.scrollX - 24;
  gauche = Math.max(window.scrollX + 12, Math.min(gauche, window.scrollX + document.documentElement.clientWidth - largeur - 12));
  let haut = r.bottom + window.scrollY + 10;
  if (r.bottom + hauteur + 20 > window.innerHeight && r.top - hauteur - 10 > 70) haut = r.top + window.scrollY - hauteur - 10;
  bulle.style.left = `${gauche}px`;
  bulle.style.top = `${haut}px`;
}

function texteMot(el) {
  return el.textContent;
}

function ouvrirBulle(motEl) {
  if (motActif === motEl) { fermerBulle(); return; }
  fermerBulle();
  motActif = motEl;
  motEl.classList.add('actif');
  const mot = texteMot(motEl);
  const phraseEl = motEl.closest('.phrase');
  const phrase = phraseEl?.textContent.trim() || mot;
  const sylls = syllabes(mot);
  const jeton = jetonBulle;

  bulle.innerHTML = `
    <div class="bulle-tete">
      <div>
        <div class="bulle-mot">${echapper(mot)}</div>
        ${sylls.length > 1 ? `<div class="bulle-syl">${sylls.map(echapper).join(' · ')}</div>` : ''}
      </div>
      <button type="button" class="icone-btn" data-action="fermer" aria-label="Fermer">${icone('x')}</button>
    </div>
    <div class="bulle-actions">
      <button type="button" class="puce-btn" data-action="ecouter-mot">${icone('volume')}Écouter</button>
      <button type="button" class="puce-btn" data-action="ecouter-phrase">${icone('volume')}La phrase</button>
    </div>
    <div class="bulle-section" id="bulle-ia"></div>`;
  bulle.hidden = false;
  bulle.dataset.mot = mot;
  bulle.dataset.phrase = phrase;
  remplirAideIa(mot, phrase, jeton);
  placerBulle();
}

const cacheMots = new Map();

async function remplirAideIa(mot, phrase, jeton) {
  const zone = $('#bulle-ia', bulle);
  if (!ia.iaDisponible()) {
    zone.innerHTML = '<p class="bulle-note">Les synonymes et la reformulation arrivent bientôt.</p>';
    return;
  }
  if (!stockage.code()) {
    zone.innerHTML = `<p class="bulle-note">Pour voir les synonymes et reformuler la phrase, entre le code d’accès.</p>
      <button type="button" class="puce-btn" data-action="code">${icone('key')}Entrer le code</button>`;
    placerBulle();
    return;
  }
  zone.innerHTML = `<p class="bulle-note">${icone('loader-2', 'tourne')} Recherche du sens…</p>
    <div class="bulle-actions"><button type="button" class="puce-btn" data-action="reformuler">${icone('refresh')}Reformuler la phrase</button></div>
    <div id="bulle-reform"></div>`;
  placerBulle();
  const cle = `${mot.toLowerCase()}|${phrase}`;
  try {
    let res = cacheMots.get(cle);
    if (!res) {
      res = await ia.aideMot(mot, phrase);
      cacheMots.set(cle, res);
    }
    if (jeton !== jetonBulle) return;
    const syn = (res.synonymes || []).filter(Boolean);
    const note = zone.querySelector('.bulle-note');
    note.outerHTML = `
      <p><span class="bulle-etiquette">Synonymes :</span> ${syn.length ? syn.map(echapper).join(', ') : '<span class="bulle-note">pas de synonyme simple pour ce mot</span>'}</p>
      ${res.sens ? `<p><span class="bulle-etiquette">Sens ici :</span> ${echapper(res.sens)}</p>` : ''}`;
  } catch (e) {
    if (jeton !== jetonBulle) return;
    if (e instanceof ia.ErreurCode) {
      stockage.definirCode('');
      remplirAideIa(mot, phrase, jeton);
      return;
    }
    const note = zone.querySelector('.bulle-note');
    if (note) note.innerHTML = `${icone('alert-circle')} ${echapper(e.message)}`;
  }
  placerBulle();
}

async function reformulerPhraseBulle() {
  const zone = $('#bulle-reform', bulle);
  if (!zone) return;
  const jeton = jetonBulle;
  const phrase = bulle.dataset.phrase;
  const para = motActif?.closest('[data-p]');
  const contexte = para ? doc.paragraphes[Number(para.dataset.p)]?.texte : '';
  zone.innerHTML = `<p class="bulle-note">${icone('loader-2', 'tourne')} Reformulation…</p>`;
  placerBulle();
  try {
    const res = await ia.reformulerPhrase(phrase, contexte);
    if (jeton !== jetonBulle) return;
    const texte = (res.reformulation || '').replace(/\*\*/g, '');
    zone.innerHTML = `<div class="bulle-reform">${echapper(texte)}</div>
      <div class="bulle-actions"><button type="button" class="puce-btn" data-action="ecouter-reform">${icone('volume')}Écouter</button></div>`;
    zone.dataset.texte = texte;
  } catch (e) {
    if (jeton !== jetonBulle) return;
    if (e instanceof ia.ErreurCode) {
      stockage.definirCode('');
      remplirAideIa(bulle.dataset.mot, phrase, jeton);
      return;
    }
    zone.innerHTML = `<p class="bulle-note">${icone('alert-circle')} ${echapper(e.message)}</p>`;
  }
  placerBulle();
}

bulle.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const action = b.dataset.action;
  if (action === 'fermer') fermerBulle();
  else if (action === 'ecouter-mot') dire(bulle.dataset.mot);
  else if (action === 'ecouter-phrase') dire(bulle.dataset.phrase);
  else if (action === 'ecouter-reform') dire($('#bulle-reform', bulle)?.dataset.texte || '');
  else if (action === 'reformuler') reformulerPhraseBulle();
  else if (action === 'code') {
    const mot = bulle.dataset.mot;
    const phrase = bulle.dataset.phrase;
    const jeton = jetonBulle;
    if (await demanderCode()) {
      if (jeton === jetonBulle) remplirAideIa(mot, phrase, jeton);
      $('#panneau-reformulation').dataset.doc = '';
    }
  }
});

// ======================================================================
// Lecture à voix haute
// ======================================================================

const synthese = 'speechSynthesis' in window ? window.speechSynthesis : null;
let lecture = { active: false, enPause: false, phrases: [], index: 0, jeton: 0 };

function voixFrancaise() {
  const voix = synthese?.getVoices() || [];
  return voix.find((v) => v.lang === 'fr-FR' && /google|natural|neural|amélie|thomas/i.test(v.name))
    || voix.find((v) => v.lang === 'fr-FR')
    || voix.find((v) => v.lang?.startsWith('fr'));
}

function enonce(texte) {
  const u = new SpeechSynthesisUtterance(texte);
  u.lang = 'fr-FR';
  const v = voixFrancaise();
  if (v) u.voice = v;
  u.rate = reglages.vitesse;
  return u;
}

function dire(texte) {
  if (!synthese || !texte) return;
  arreterLecture();
  synthese.speak(enonce(texte));
}

function majBoutonLecture() {
  const enLecture = lecture.active && !lecture.enPause;
  $('#btn-lire').innerHTML = icone(enLecture ? 'player-pause' : 'player-play');
  $('#btn-lire').setAttribute('aria-label', enLecture ? 'Mettre en pause' : 'Lire à voix haute');
}

function lirePhraseSuivante(jeton) {
  if (jeton !== lecture.jeton) return;
  $$('.phrase.lue').forEach((el) => el.classList.remove('lue'));
  if (lecture.index >= lecture.phrases.length) { arreterLecture(); return; }
  const el = lecture.phrases[lecture.index];
  el.classList.add('lue');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const u = enonce(el.textContent);
  u.onend = () => { lecture.index += 1; lirePhraseSuivante(jeton); };
  u.onerror = (ev) => { if (ev.error !== 'interrupted' && ev.error !== 'canceled') { lecture.index += 1; lirePhraseSuivante(jeton); } };
  synthese.speak(u);
}

function basculerLecture() {
  if (!synthese) {
    alert('Ton navigateur ne sait pas lire à voix haute.');
    return;
  }
  if (lecture.active) {
    if (lecture.enPause) synthese.resume(); else synthese.pause();
    lecture.enPause = !lecture.enPause;
    majBoutonLecture();
    return;
  }
  const phrases = $$('.phrase', panneauActif());
  if (!phrases.length) return;
  const active = phrases.findIndex((p) => p.classList.contains('active'));
  synthese.cancel();
  lecture = { active: true, enPause: false, phrases, index: Math.max(0, active), jeton: lecture.jeton + 1 };
  majBoutonLecture();
  lirePhraseSuivante(lecture.jeton);
}

function arreterLecture() {
  lecture.jeton += 1;
  lecture.active = false;
  lecture.enPause = false;
  synthese?.cancel();
  $$('.phrase.lue').forEach((el) => el.classList.remove('lue'));
  majBoutonLecture();
}

// ======================================================================
// Réglages et volet
// ======================================================================

const POLICES = {
  atkinson: "'Atkinson Hyperlegible', Verdana, sans-serif",
  lexend: "'Lexend', Verdana, sans-serif",
  andika: "'Andika', Verdana, sans-serif",
  verdana: 'Verdana, Tahoma, sans-serif',
};
const DEFAUTS = { police: 'atkinson', taille: 20, interligne: 2, mots: 0.15, lettres: 0.02, fond: 'creme', syllabes: false, ligne: true, vitesse: 0.9 };
const reglages = { ...DEFAUTS, ...stockage.lire('reglages', {}) };

function appliquerReglages() {
  const s = document.documentElement.style;
  s.setProperty('--police', POLICES[reglages.police] || POLICES.atkinson);
  s.setProperty('--taille', `${reglages.taille}px`);
  s.setProperty('--interligne', reglages.interligne);
  s.setProperty('--espace-mots', `${reglages.mots}em`);
  s.setProperty('--espace-lettres', `${reglages.lettres}em`);
  document.body.dataset.fond = reglages.fond;
  document.body.classList.toggle('syllabes-on', reglages.syllabes);
  document.body.classList.toggle('ligne-on', reglages.ligne);
  $$('.pastille').forEach((p) => p.setAttribute('aria-checked', String(p.dataset.fond === reglages.fond)));
  if (!motActif) return;
  requestAnimationFrame(placerBulle);
}

function initReglages() {
  const champs = { police: '#r-police', taille: '#r-taille', interligne: '#r-interligne', mots: '#r-mots', lettres: '#r-lettres', vitesse: '#r-vitesse' };
  for (const [cle, sel] of Object.entries(champs)) {
    const el = $(sel);
    el.value = reglages[cle];
    el.addEventListener('input', () => {
      reglages[cle] = cle === 'police' ? el.value : Number(el.value);
      stockage.ecrire('reglages', reglages);
      appliquerReglages();
    });
  }
  for (const [cle, sel] of Object.entries({ syllabes: '#r-syllabes', ligne: '#r-ligne' })) {
    const el = $(sel);
    el.checked = reglages[cle];
    el.addEventListener('change', () => {
      reglages[cle] = el.checked;
      stockage.ecrire('reglages', reglages);
      appliquerReglages();
    });
  }
  $$('.pastille').forEach((p) => p.addEventListener('click', () => {
    reglages.fond = p.dataset.fond;
    stockage.ecrire('reglages', reglages);
    appliquerReglages();
  }));
  appliquerReglages();
}

// Le volet s'ouvre au survol (après un court délai), au toucher ou au clavier, et peut être épinglé.
function initVolet() {
  const volet = $('#volet');
  let epingle = stockage.lire('volet-epingle', false);
  let tOuvrir = null;
  let tFermer = null;
  const ouvrir = (oui) => volet.classList.toggle('ouvert', oui || epingle);
  const majEpingle = () => {
    $('#btn-epingle').setAttribute('aria-pressed', String(epingle));
    $('#lbl-epingle').textContent = epingle ? 'Détacher' : 'Garder ouvert';
    $('#btn-epingle use').setAttribute('href', `img/icones.svg#${epingle ? 'pinned-off' : 'pin'}`);
    ouvrir(epingle);
  };
  volet.addEventListener('mouseenter', () => { clearTimeout(tFermer); tOuvrir = setTimeout(() => ouvrir(true), 300); });
  volet.addEventListener('mouseleave', () => {
    clearTimeout(tOuvrir);
    if (volet.contains(document.activeElement) && document.activeElement.matches('select')) return;
    tFermer = setTimeout(() => ouvrir(false), 500);
  });
  volet.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' && !volet.classList.contains('ouvert')) {
      e.preventDefault();
      ouvrir(true);
    }
  });
  volet.addEventListener('focusin', () => ouvrir(true));
  volet.addEventListener('focusout', (e) => { if (!volet.contains(e.relatedTarget)) ouvrir(false); });
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' && !volet.contains(e.target)) ouvrir(false);
  });
  $('#btn-epingle').addEventListener('click', () => {
    epingle = !epingle;
    stockage.ecrire('volet-epingle', epingle);
    majEpingle();
  });
  $('#btn-lire').addEventListener('click', basculerLecture);
  $('#btn-stop').addEventListener('click', arreterLecture);
  majEpingle();
}

// ======================================================================
// Code d'accès
// ======================================================================

function demanderCode() {
  const dlg = $('#dialogue-code');
  const champ = $('#champ-code');
  const erreur = $('#erreur-code');
  champ.value = stockage.code();
  erreur.textContent = '';
  dlg.showModal();
  champ.focus();
  return new Promise((resolve) => {
    const finir = (ok) => {
      $('#form-code').removeEventListener('submit', valider);
      $('#btn-code-annuler').removeEventListener('click', annuler);
      dlg.removeEventListener('cancel', annuler);
      if (dlg.open) dlg.close();
      resolve(ok);
    };
    const annuler = () => finir(false);
    const valider = async (e) => {
      e.preventDefault();
      const code = champ.value.trim();
      if (!code) { erreur.textContent = 'Entre un code.'; return; }
      if (!ia.iaDisponible()) { stockage.definirCode(code); finir(true); return; }
      erreur.textContent = 'Vérification…';
      try {
        await ia.verifierCode(code);
        stockage.definirCode(code);
        finir(true);
      } catch (err) {
        erreur.textContent = err instanceof ia.ErreurCode ? 'Ce code ne marche pas. Vérifie-le avec ton prof.' : err.message;
      }
    };
    $('#form-code').addEventListener('submit', valider);
    $('#btn-code-annuler').addEventListener('click', annuler);
    dlg.addEventListener('cancel', annuler);
  });
}

// ======================================================================
// Événements
// ======================================================================

function initEvenements() {
  $('#btn-accueil').addEventListener('click', () => {
    if (doc) history.pushState({}, '', location.pathname);
    afficherAccueil();
  });
  window.addEventListener('popstate', (e) => {
    const id = e.state?.doc;
    const d = id && stockage.chargerDoc(id);
    if (d) ouvrirDocument(d, { historique: false });
    else afficherAccueil();
  });

  // Import
  $('#fichier').addEventListener('change', (e) => { ouvrirFichier(e.target.files[0]); e.target.value = ''; });
  const depot = $('#depot');
  for (const type of ['dragenter', 'dragover']) {
    document.addEventListener(type, (e) => {
      if (!$('#vue-accueil').hidden && e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        depot.classList.add('survol');
      }
    });
  }
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) depot.classList.remove('survol'); });
  document.addEventListener('drop', (e) => {
    if ($('#vue-accueil').hidden) return;
    e.preventDefault();
    depot.classList.remove('survol');
    ouvrirFichier(e.dataTransfer.files[0]);
  });
  $('#form-lien').addEventListener('submit', (e) => {
    e.preventDefault();
    ouvrirLien($('#champ-lien').value.trim());
  });
  $('#btn-coller').addEventListener('click', () => {
    const texte = $('#texte-colle').value;
    const paragraphes = paragraphesDepuisTexte(texte);
    if (!paragraphes.length) { messageAccueil('Colle d’abord un texte.', true); return; }
    $('#texte-colle').value = '';
    ouvrirDocument(creerDocument('', paragraphes));
  });
  $('#liste-recents').addEventListener('click', (e) => {
    const ouvrir = e.target.closest('.ouvrir-doc');
    const oublier = e.target.closest('.oublier-doc');
    if (ouvrir) {
      const d = stockage.chargerDoc(ouvrir.dataset.id);
      if (d) ouvrirDocument(d);
      else { stockage.oublierDoc(ouvrir.dataset.id); rendreRecents(); }
    } else if (oublier) {
      stockage.oublierDoc(oublier.dataset.id);
      rendreRecents();
    }
  });
  $('#btn-code').addEventListener('click', demanderCode);

  // Onglets (clic et flèches du clavier)
  $('#onglet-adaptation').addEventListener('click', () => choisirOnglet('adaptation'));
  $('#onglet-reformulation').addEventListener('click', () => choisirOnglet('reformulation'));
  $('#onglets').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const suivant = ongletActif === 'adaptation' ? 'reformulation' : 'adaptation';
    choisirOnglet(suivant);
    $(`#onglet-${suivant}`).focus();
  });

  // Clics dans le texte
  for (const panneau of [$('#panneau-adaptation'), $('#panneau-reformulation')]) {
    panneau.addEventListener('click', async (e) => {
      const action = e.target.closest('[data-action]');
      if (action) {
        if (action.dataset.action === 'original') voirOriginal(Number(action.dataset.p));
        else if (action.dataset.action === 'code') {
          if (await demanderCode()) { panneau.dataset.doc = ''; rendreReformulation(); }
        } else if (action.dataset.action === 'reessayer') {
          const bloc = action.closest('.bloc-reform');
          $('.bloc-corps', bloc).innerHTML = '<div class="chargement"><span></span><span></span><span></span></div>';
          fileReform.push(bloc);
          traiterFile();
        }
        return;
      }
      const mot = e.target.closest('.mot');
      if (mot) ouvrirBulle(mot);
    });
    // Ligne de lecture : suit la souris.
    panneau.addEventListener('pointerover', (e) => {
      if (!reglages.ligne || lecture.active) return;
      const ph = e.target.closest('.phrase');
      if (!ph || ph.classList.contains('active')) return;
      $$('.phrase.active').forEach((el) => el.classList.remove('active'));
      ph.classList.add('active');
    });
  }

  // Clavier : flèches haut/bas pour déplacer la ligne de lecture, Échap pour fermer la bulle.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !bulle.hidden) { fermerBulle(); return; }
    if (!doc || !reglages.ligne || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    if (e.target.closest('input, select, textarea, [role="tab"]')) return;
    const phrases = $$('.phrase', panneauActif());
    if (!phrases.length) return;
    e.preventDefault();
    let i = phrases.findIndex((p) => p.classList.contains('active'));
    i = e.key === 'ArrowDown' ? Math.min(phrases.length - 1, i + 1) : Math.max(0, i - 1);
    phrases.forEach((p) => p.classList.remove('active'));
    phrases[i].classList.add('active');
    phrases[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  // Fermer la bulle en cliquant ailleurs.
  document.addEventListener('pointerdown', (e) => {
    if (bulle.hidden || bulle.contains(e.target) || e.target.closest('.mot, dialog')) return;
    fermerBulle();
  });
  window.addEventListener('resize', placerBulle);
}

// ======================================================================
// Démarrage
// ======================================================================

initReglages();
initVolet();
initEvenements();
synthese?.addEventListener?.('voiceschanged', () => {});
if (location.hash === '#lire') {
  const dernier = stockage.listeDocs()[0];
  const d = dernier && stockage.chargerDoc(dernier.id);
  if (d) {
    history.replaceState({ doc: d.id }, '', '#lire');
    ouvrirDocument(d, { historique: false });
  } else {
    history.replaceState({}, '', location.pathname);
    afficherAccueil();
  }
} else {
  afficherAccueil();
}
