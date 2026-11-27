import { test } from 'node:test';
import assert from 'node:assert/strict';
import serveur from '../worker/src/index.js';
import { extraireJson, nettoyerLignes, decoderEntites, urlAutorisee } from '../worker/src/outils.js';

const ENV = { CODES_ACCES: 'SVT5, MATHS', ORIGINES: 'https://farahboudaoud-sketch.github.io', LIMITE_JOUR: '50' };

function requete(chemin, corps, code = 'SVT5') {
  return new Request(`https://declic-ia.test${chemin}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Code-Acces': code, Origin: 'https://farahboudaoud-sketch.github.io' },
    body: JSON.stringify(corps),
  });
}

// Simule l'IA de Cloudflare (env.AI) et renvoie la liste des appels reçus.
function simulerIA(texte, format = 'response') {
  const appels = [];
  ENV.AI = {
    async run(modele, entree) {
      appels.push({ modele, entree });
      return format === 'choices' ? { choices: [{ message: { content: texte } }] } : { response: texte };
    },
  };
  return appels;
}

test('outils : JSON au milieu du texte', () => {
  assert.deepEqual(extraireJson('Voici :\n{"a": 1}\nVoilà.'), { a: 1 });
  assert.equal(extraireJson('pas de json'), null);
});

test('outils : lignes sans puces ni numéros', () => {
  assert.deepEqual(nettoyerLignes('- Une phrase.\n\n2. Deux.\n# Titre\nTrois.'), ['Une phrase.', 'Deux.', 'Trois.']);
});

test('outils : entités HTML', () => {
  assert.equal(decoderEntites('l&#39;&eacute;nergie &amp; la lumi&#xE8;re'), "l'énergie & la lumière");
});

test('outils : liens refusés', () => {
  assert.equal(urlAutorisee('file:///etc/passwd'), null);
  assert.equal(urlAutorisee('http://localhost:8080/'), null);
  assert.equal(urlAutorisee('http://192.168.1.2/'), null);
  assert.ok(urlAutorisee('https://fr.wikipedia.org/wiki/Photosynth%C3%A8se'));
});

test('sans code : refusé', async () => {
  const r = await serveur.fetch(requete('/verifier', {}, ''), ENV);
  assert.equal(r.status, 401);
  const r2 = await serveur.fetch(requete('/verifier', {}, 'FAUX'), ENV);
  assert.equal(r2.status, 401);
});

test('code valide et CORS', async () => {
  const r = await serveur.fetch(requete('/verifier', {}, 'MATHS'), ENV);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://farahboudaoud-sketch.github.io');
});

test('aide sur un mot', async () => {
  const appels = simulerIA('Voici : {"synonymes": ["produisent", "créent", "font", "fabriquent", "trop"], "sens": "ils font eux-mêmes."}');
  const r = await serveur.fetch(requete('/mot', { mot: 'fabriquent', phrase: 'Les plantes fabriquent leur nourriture.' }), ENV);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.deepEqual(d.synonymes, ['produisent', 'créent', 'font', 'fabriquent']);
  assert.equal(d.sens, 'ils font eux-mêmes.');
  assert.equal(appels[0].modele, '@cf/mistralai/mistral-small-3.1-24b-instruct');
  assert.equal(appels[0].entree.messages[0].role, 'system');
  assert.match(appels[0].entree.messages[1].content, /fabriquent/);
});

test('reformulation d’un paragraphe en lignes', async () => {
  simulerIA('Les plantes font leur nourriture.\nOn appelle ça la **photosynthèse**.', 'choices');
  const r = await serveur.fetch(requete('/paragraphe', { texte: 'La photosynthèse est le processus...', titre: 'La photosynthèse' }), ENV);
  assert.deepEqual((await r.json()).lignes, ['Les plantes font leur nourriture.', 'On appelle ça la **photosynthèse**.']);
});

test('quota gratuit épuisé : message lisible', async () => {
  ENV.AI = { async run() { throw new Error('4006: you have used up your daily free allocation of 10,000 neurons'); } };
  const r = await serveur.fetch(requete('/phrase', { phrase: 'Une phrase.' }), ENV);
  assert.equal(r.status, 429);
  assert.match((await r.json()).erreur, /limite pour aujourd’hui/);
});

test('IA indisponible : message lisible', async () => {
  ENV.AI = { async run() { throw new Error('InferenceUpstreamError: internal'); } };
  const r = await serveur.fetch(requete('/phrase', { phrase: 'Une phrase.' }), ENV);
  assert.equal(r.status, 502);
  assert.match((await r.json()).erreur, /ne répond pas/);
});

test('limite par jour', async () => {
  simulerIA('ok');
  const env = { ...ENV, CODES_ACCES: 'QUOTA', LIMITE_JOUR: '2' };
  const statuts = [];
  for (let i = 0; i < 3; i++) statuts.push((await serveur.fetch(requete('/phrase', { phrase: 'Une phrase.' }, 'QUOTA'), env)).status);
  assert.deepEqual(statuts, [200, 200, 429]);
});

test('champ manquant', async () => {
  const r = await serveur.fetch(requete('/mot', { mot: '' }), ENV);
  assert.equal(r.status, 400);
});
