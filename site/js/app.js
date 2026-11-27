import { decouperPhrases, decouperMots, paragraphesDepuisTexte, paragraphesDepuisMarkdown, empreinte } from './texte.js';
import { syllabes } from './syllabes.js';
import * as stockage from './stockage.js';
import * as ia from './ia.js';
import { lienFavori, lireTexteRecu } from './favori.js';

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

// Bloc de code : affiché tel quel, ni découpé, ni lu à voix haute, ni envoyé à l'IA.
const htmlCode = (b, i) => `<pre class="code" data-p="${i}"><code>${echapper(b.texte)}</code></pre>`;

function rendreAdaptation() {
  const p = $('#panneau-adaptation');
  p.innerHTML = doc.paragraphes.map((b, i) => {
    if (b.type === 'titre') return `<h2 class="titre phrase" data-p="${i}">${htmlMots(b.texte)}</h2>`;
    if (b.type === 'code') return htmlCode(b, i);
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
    ouvrirDocument(creerDocument(nomSansExtension(nomFichier) || res.titre, res.paragraphes));
  } catch (e) {
    console.error(e);
    messageAccueil('Impossible de lire ce PDF. Il est peut-être protégé ou abîmé.', true);
  }
}

const nomSansExtension = (nom) => (nom || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').trim();

function ouvrirMarkdown(texte, nomFichier) {
  const paragraphes = paragraphesDepuisMarkdown(texte);
  if (!paragraphes.length) {
    messageAccueil('Ce fichier ne contient pas de texte à lire.', true);
    return;
  }
  const titre = paragraphes.find((p) => p.type === 'titre')?.texte || nomSansExtension(nomFichier);
  ouvrirDocument(creerDocument(titre, paragraphes));
}

async function ouvrirFichier(fichier) {
  if (!fichier) return;
  const nom = fichier.name || '';
  if (/pdf$/i.test(fichier.type) || /\.pdf$/i.test(nom)) {
    ouvrirPdf(await fichier.arrayBuffer(), nom);
  } else if (/markdown/i.test(fichier.type) || /\.(md|markdown|mdown|mkd)$/i.test(nom)) {
    ouvrirMarkdown(await fichier.text(), nom);
  } else if (/^text\/plain/i.test(fichier.type) || /\.txt$/i.test(nom)) {
    const paragraphes = paragraphesDepuisTexte(await fichier.text());
    if (paragraphes.length) ouvrirDocument(creerDocument(nomSansExtension(nom), paragraphes));
    else messageAccueil('Ce fichier ne contient pas de texte à lire.', true);
  } else {
    messageAccueil('Choisis un fichier PDF ou Markdown (.md).', true);
  }
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
    if (typeof res.markdown === 'string') {
      ouvrirMarkdown(res.markdown, res.titre);
      return;
    }
    if (res.pdf) {
      const nom = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
      await ouvrirPdf(res.pdf, nom);
      return;
    }
    const total = (res.paragraphes || []).reduce((s, p) => s + p.texte.length, 0);
    const pageConnexion = total < 2000 && /connexion|se connecter|identifiant|mot de passe|log ?in|sign ?in|password/i.test((res.paragraphes || []).map((p) => p.texte).join(' '));
    if (!res.paragraphes?.length || total < 80 || pageConnexion) {
      messageAccueil('Cette page demande sans doute une connexion, ou affiche son texte autrement. Ouvre-la dans ton navigateur et utilise le bouton « Envoyer vers Déclic » (juste en dessous).', true);
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
    if (b.type === 'code') return htmlCode(b, i);
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
  const sylHtml = sylls.map((s, k) => `<span class="bs${k % 2}">${echapper(s)}</span>`).join('<span class="bulle-point"> · </span>');

  bulle.innerHTML = `
    <div class="bulle-tete">
      <div class="bulle-titre"><div class="bulle-mot">${echapper(mot)}</div></div>
      <button type="button" class="bulle-ecouter" data-action="ecouter-mot" aria-label="Écouter le mot">${icone('volume')}</button>
      <button type="button" class="icone-btn bulle-fermer" data-action="fermer" aria-label="Fermer">${icone('x')}</button>
    </div>
    ${sylls.length > 1 ? `<div class="bulle-syl">${sylHtml}</div>` : ''}
    <div id="bulle-ia"></div>
    <div id="bulle-reform"></div>
    <div class="bulle-section bulle-actions">
      ${ia.iaDisponible() ? `<button type="button" class="puce-btn" data-action="reformuler">${icone('refresh')}Dire plus simplement</button>` : ''}
      <button type="button" class="puce-btn" data-action="ecouter-phrase">${icone('volume')}Écouter la phrase</button>
      <button type="button" class="puce-btn" data-action="lire-ici">${icone('player-play')}Lire d’ici</button>
    </div>`;
  bulle.hidden = false;
  bulle.dataset.mot = mot;
  bulle.dataset.phrase = phrase;
  remplirAideIa(mot, phrase, jeton);
  placerBulle();
}

const cacheMots = new Map();
const etiquette = (nomIcone, texte) => `<div class="bulle-etiquette">${icone(nomIcone)}${texte}</div>`;
const attente = '<div class="bulle-attente" aria-label="Chargement"><span></span></div>';

async function remplirAideIa(mot, phrase, jeton) {
  const zone = $('#bulle-ia', bulle);
  if (!ia.iaDisponible()) {
    zone.innerHTML = '<div class="bulle-section"><p class="bulle-note">Le sens du mot et les autres mots arrivent bientôt.</p></div>';
    return;
  }
  if (!stockage.code()) {
    zone.innerHTML = `<div class="bulle-section"><p class="bulle-note">Pour voir ce que veut dire le mot, entre le code d’accès.</p>
      <button type="button" class="puce-btn" data-action="code">${icone('key')}Entrer le code</button></div>`;
    placerBulle();
    return;
  }
  zone.innerHTML = `<div class="bulle-section">${etiquette('bulb', 'Ça veut dire')}${attente}</div>
    <div class="bulle-section">${etiquette('arrows-exchange', 'Autres mots')}${attente}</div>`;
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
    zone.innerHTML = `
      ${res.sens ? `<div class="bulle-section">${etiquette('bulb', 'Ça veut dire')}<div class="bulle-texte">${echapper(res.sens)}</div></div>` : ''}
      ${syn.length ? `<div class="bulle-section">${etiquette('arrows-exchange', 'Autres mots')}
        ${syn.map((s) => `<button type="button" class="bulle-chip" data-action="dire" data-texte="${echapper(s)}" aria-label="Écouter « ${echapper(s)} »">${echapper(s)}</button>`).join('')}
      </div>` : ''}`;
  } catch (e) {
    if (jeton !== jetonBulle) return;
    if (e instanceof ia.ErreurCode) {
      stockage.definirCode('');
      remplirAideIa(mot, phrase, jeton);
      return;
    }
    zone.innerHTML = `<div class="bulle-section"><p class="bulle-note">${icone('alert-circle')} ${echapper(e.message)}</p></div>`;
  }
  placerBulle();
}

async function reformulerPhraseBulle() {
  const zone = $('#bulle-reform', bulle);
  if (!zone) return;
  const jeton = jetonBulle;
  if (!stockage.code()) {
    if (!(await demanderCode()) || jeton !== jetonBulle) return;
    remplirAideIa(bulle.dataset.mot, bulle.dataset.phrase, jeton);
  }
  const phrase = bulle.dataset.phrase;
  const para = motActif?.closest('[data-p]');
  const contexte = para ? doc.paragraphes[Number(para.dataset.p)]?.texte : '';
  zone.innerHTML = `<div class="bulle-section">${etiquette('refresh', 'Plus simplement')}${attente}</div>`;
  placerBulle();
  try {
    const res = await ia.reformulerPhrase(phrase, contexte);
    if (jeton !== jetonBulle) return;
    const texte = (res.reformulation || '').replace(/\*\*/g, '');
    zone.dataset.texte = texte;
    zone.innerHTML = `<div class="bulle-section bulle-reform">${etiquette('refresh', 'Plus simplement')}
      <div class="bulle-texte">${echapper(texte)}</div>
      <button type="button" class="puce-btn" data-action="ecouter-reform">${icone('volume')}Écouter</button></div>`;
  } catch (e) {
    if (jeton !== jetonBulle) return;
    if (e instanceof ia.ErreurCode) {
      stockage.definirCode('');
      zone.innerHTML = '';
      remplirAideIa(bulle.dataset.mot, phrase, jeton);
      return;
    }
    zone.innerHTML = `<div class="bulle-section"><p class="bulle-note">${icone('alert-circle')} ${echapper(e.message)}</p></div>`;
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
  else if (action === 'dire') dire(b.dataset.texte);
  else if (action === 'reformuler') reformulerPhraseBulle();
  else if (action === 'lire-ici') {
    const phraseEl = motActif?.closest('.phrase');
    const index = $$('.phrase', panneauActif()).indexOf(phraseEl);
    fermerBulle();
    demarrerLecture(Math.max(0, index));
  }
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
// etat : 'arret', 'lecture' ou 'pause'. La pause est gérée par Déclic (et non par la fonction pause
// du navigateur, peu fiable) : on coupe la voix et, à la reprise, on relit la phrase en cours.
const lecture = { etat: 'arret', phrases: [], index: 0, jeton: 0 };

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

// Certains navigateurs coupent les énoncés trop longs : on découpe les longues phrases aux virgules.
function morceauxAParler(texte) {
  const t = texte.replace(/\s+/g, ' ').trim();
  if (t.length <= 180) return [t];
  const res = [];
  let courant = '';
  for (const bout of t.split(/(?<=[,;:])\s+/)) {
    if (courant && (courant + ' ' + bout).length > 180) { res.push(courant); courant = bout; } else courant = courant ? `${courant} ${bout}` : bout;
  }
  if (courant) res.push(courant);
  return res;
}

function dire(texte) {
  if (!synthese || !texte) return;
  arreterLecture();
  for (const m of morceauxAParler(texte)) synthese.speak(enonce(m));
}

function marquerPhraseLue() {
  $$('.phrase.lue').forEach((el) => el.classList.remove('lue'));
  const el = lecture.phrases[lecture.index];
  if (!el) return;
  el.classList.add('lue');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function lirePhrase(jeton) {
  if (jeton !== lecture.jeton) return;
  if (lecture.index >= lecture.phrases.length) { arreterLecture(); return; }
  marquerPhraseLue();
  const morceaux = morceauxAParler(lecture.phrases[lecture.index].textContent);
  let k = 0;
  const suivant = () => {
    if (jeton !== lecture.jeton) return;
    if (k >= morceaux.length) {
      lecture.index += 1;
      lirePhrase(jeton);
      return;
    }
    const u = enonce(morceaux[k++]);
    u.onend = suivant;
    u.onerror = (ev) => {
      if (jeton !== lecture.jeton || ev.error === 'interrupted' || ev.error === 'canceled') return;
      suivant();
    };
    synthese.speak(u);
  };
  suivant();
}

// Coupe la voix puis relance la lecture à lecture.index (petit délai : certains navigateurs ignorent
// un énoncé lancé juste après une coupure).
function relancer() {
  lecture.jeton += 1;
  const jeton = lecture.jeton;
  synthese.cancel();
  setTimeout(() => lirePhrase(jeton), 80);
}

// Première phrase visible à l'écran : la lecture part de ce que l'élève voit.
function indexDepart(phrases) {
  const haut = document.querySelector('.entete').getBoundingClientRect().bottom + 8;
  const i = phrases.findIndex((p) => {
    const r = p.getBoundingClientRect();
    return r.bottom > haut && r.top < window.innerHeight;
  });
  return Math.max(0, i);
}

function demarrerLecture(index) {
  if (!synthese) {
    alert('Ton navigateur ne sait pas lire à voix haute.');
    return;
  }
  const phrases = $$('.phrase', panneauActif());
  if (!phrases.length) return;
  lecture.phrases = phrases;
  lecture.index = Math.min(Math.max(0, index ?? indexDepart(phrases)), phrases.length - 1);
  lecture.etat = 'lecture';
  majLecteur();
  relancer();
}

function mettreEnPause() {
  if (lecture.etat !== 'lecture') return;
  lecture.etat = 'pause';
  lecture.jeton += 1;
  synthese.cancel();
  majLecteur();
}

function reprendreLecture() {
  if (lecture.etat !== 'pause') return;
  lecture.etat = 'lecture';
  majLecteur();
  relancer();
}

function basculerLecture() {
  if (lecture.etat === 'lecture') mettreEnPause();
  else if (lecture.etat === 'pause') reprendreLecture();
  else demarrerLecture();
}

function changerPhrase(decalage) {
  if (lecture.etat === 'arret') return;
  lecture.index = Math.min(Math.max(0, lecture.index + decalage), lecture.phrases.length - 1);
  if (lecture.etat === 'lecture') relancer();
  else marquerPhraseLue();
}

function arreterLecture() {
  lecture.jeton += 1;
  lecture.etat = 'arret';
  synthese?.cancel();
  $$('.phrase.lue').forEach((el) => el.classList.remove('lue'));
  majLecteur();
}

// Met à jour la barre de lecture flottante et le bouton du volet.
function majLecteur() {
  const { etat } = lecture;
  const principal = $('#lect-lire');
  const libelle = etat === 'lecture' ? 'Pause' : etat === 'pause' ? 'Reprendre' : 'Écouter';
  principal.innerHTML = `${icone(etat === 'lecture' ? 'player-pause' : 'player-play')}<span>${libelle}</span>`;
  principal.setAttribute('aria-label', etat === 'lecture' ? 'Mettre en pause' : etat === 'pause' ? 'Reprendre la lecture' : 'Lire à voix haute');
  for (const id of ['#lect-prec', '#lect-suiv', '#lect-stop']) $(id).hidden = etat === 'arret';
  $('#lecteur').classList.toggle('actif', etat !== 'arret');
  $('#lecteur').dataset.etat = etat;
  $('#btn-lire').innerHTML = icone(etat === 'lecture' ? 'player-pause' : 'player-play');
  $('#btn-lire').setAttribute('aria-label', principal.getAttribute('aria-label'));
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
  $('#lect-lire').addEventListener('click', basculerLecture);
  $('#lect-prec').addEventListener('click', () => changerPhrase(-1));
  $('#lect-suiv').addEventListener('click', () => changerPhrase(1));
  $('#lect-stop').addEventListener('click', arreterLecture);
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
  const favori = $('#lien-favori');
  favori.href = lienFavori(location.origin + location.pathname);
  favori.addEventListener('click', (e) => {
    e.preventDefault();
    messageAccueil('Ne clique pas dessus ici : glisse ce bouton dans ta barre de favoris, puis utilise-le sur la page de ton cours.');
  });

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
      if (!reglages.ligne || lecture.etat !== 'arret') return;
      const ph = e.target.closest('.phrase');
      if (!ph || ph.classList.contains('active')) return;
      $$('.phrase.active').forEach((el) => el.classList.remove('active'));
      ph.classList.add('active');
    });
  }

  // Clavier : flèches haut/bas pour déplacer la ligne de lecture, Échap pour fermer la bulle.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !bulle.hidden) { fermerBulle(); return; }
    // Pendant la lecture : Espace = pause / reprise, flèches gauche et droite = phrase précédente / suivante.
    if (lecture.etat !== 'arret' && !e.target.closest('input, select, textarea, button, [role="tab"], dialog')) {
      if (e.key === ' ') { e.preventDefault(); basculerLecture(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); changerPhrase(-1); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); changerPhrase(1); return; }
    }
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
const recu = lireTexteRecu(location.hash);
if (recu) {
  history.replaceState({}, '', location.pathname);
  const paragraphes = recu.blocs.length ? recu.blocs : paragraphesDepuisTexte(recu.texte);
  const titre = recu.titre.replace(/\s+[|–—-]\s+[^|–—-]{1,30}$/u, '').trim();
  if (paragraphes.length) ouvrirDocument(creerDocument(titre, paragraphes));
  else {
    afficherAccueil();
    messageAccueil('Déclic n’a rien reçu à lire. Sélectionne le texte du cours, puis reclique sur le favori.', true);
  }
} else if (location.hash === '#lire') {
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
