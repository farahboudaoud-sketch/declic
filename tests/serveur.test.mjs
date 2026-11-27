import { test } from 'node:test';
import assert from 'node:assert/strict';
import serveur from '../worker/src/index.js';
import { extraireJson, nettoyerLignes, decoderEntites, urlAutorisee } from '../worker/src/outils.js';

const ENV = { CODES_ACCES: 'SVT5, MATHS', ANTHROPIC_API_KEY: 'cle-test', ORIGINES: 'https://farahboudaoud-sketch.github.io', LIMITE_JOUR: '50' };

function requete(chemin, corps, code = 'SVT5') {
  return new Request(`https://declic-ia.test${chemin}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Code-Acces': code, Origin: 'https://farahboudaoud-sketch.github.io' },
    body: JSON.stringify(corps),
  });
}

function simulerClaude(texte) {
  const appels = [];
  globalThis.fetch = async (url, options) => {
    appels.push({ url, corps: JSON.parse(options.body) });
    return new Response(JSON.stringify({ content: [{ type: 'text', text: texte }] }), { status: 200 });
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
  const appels = simulerClaude('{"synonymes": ["produisent", "créent", "font", "fabriquent", "trop"], "sens": "ils font eux-mêmes."}');
  const r = await serveur.fetch(requete('/mot', { mot: 'fabriquent', phrase: 'Les plantes fabriquent leur nourriture.' }), ENV);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.deepEqual(d.synonymes, ['produisent', 'créent', 'font', 'fabriquent']);
  assert.equal(d.sens, 'ils font eux-mêmes.');
  assert.equal(appels[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(appels[0].corps.model, 'claude-haiku-5-5');
  assert.match(appels[0].corps.messages[0].content, /fabriquent/);
});

test('reformulation d’un paragraphe en lignes', async () => {
  simulerClaude('Les plantes font leur nourriture.\nOn appelle ça la **photosynthèse**.');
  const r = await serveur.fetch(requete('/paragraphe', { texte: 'La photosynthèse est le processus...', titre: 'La photosynthèse' }), ENV);
  assert.deepEqual((await r.json()).lignes, ['Les plantes font leur nourriture.', 'On appelle ça la **photosynthèse**.']);
});

test('erreur de l’API Claude : message lisible', async () => {
  globalThis.fetch = async () => new Response('surcharge', { status: 529 });
  const r = await serveur.fetch(requete('/phrase', { phrase: 'Une phrase.' }), ENV);
  assert.equal(r.status, 503);
  assert.match((await r.json()).erreur, /réessaie/);
});

test('limite par jour', async () => {
  simulerClaude('ok');
  const env = { ...ENV, CODES_ACCES: 'QUOTA', LIMITE_JOUR: '2' };
  const statuts = [];
  for (let i = 0; i < 3; i++) statuts.push((await serveur.fetch(requete('/phrase', { phrase: 'Une phrase.' }, 'QUOTA'), env)).status);
  assert.deepEqual(statuts, [200, 200, 429]);
});

test('champ manquant', async () => {
  const r = await serveur.fetch(requete('/mot', { mot: '' }), ENV);
  assert.equal(r.status, 400);
});
