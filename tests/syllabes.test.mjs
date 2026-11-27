import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syllabes } from '../site/js/syllabes.js';

const attendus = {
  table: 'ta-ble',
  photosynthèse: 'pho-to-syn-thè-se',
  instruction: 'ins-truc-tion',
  montagne: 'mon-ta-gne',
  crayon: 'cra-yon',
  voyage: 'vo-ya-ge',
  théâtre: 'thé-â-tre',
  poète: 'po-è-te',
  naïf: 'na-ïf',
  maïs: 'ma-ïs',
  Noël: 'No-ël',
  banque: 'ban-que',
  langue: 'lan-gue',
  guitare: 'gui-ta-re',
  quatre: 'qua-tre',
  fille: 'fil-le',
  année: 'an-née',
  énergie: 'é-ner-gie',
  chocolat: 'cho-co-lat',
  obstacle: 'obs-ta-cle',
  simple: 'sim-ple',
  produire: 'pro-dui-re',
  éléphant: 'é-lé-phant',
  arbre: 'ar-bre',
  exemple: 'e-xem-ple',
  carbone: 'car-bo-ne',
  enrhumé: 'en-rhu-mé',
  réussir: 'ré-us-sir',
  créer: 'cré-er',
  plantes: 'plan-tes',
  lumière: 'lu-miè-re',
  fièvre: 'fiè-vre',
  société: 'so-ci-é-té',
  soleil: 'so-leil',
  oiseau: 'oi-seau',
  Photosynthèse: 'Pho-to-syn-thè-se',
  le: 'le',
  et: 'et',
};

for (const [mot, attendu] of Object.entries(attendus)) {
  test(`syllabes de « ${mot} »`, () => {
    assert.equal(syllabes(mot).join('-'), attendu);
  });
}

test('mot composé : le tiret reste collé', () => {
  assert.deepEqual(syllabes('peut-être'), ['peut-', 'ê', 'tre']);
});

test('les syllabes recomposent toujours le mot', () => {
  for (const mot of ['aujourd’hui', 'l’énergie', 'arc-en-ciel', 'x', '', 'CO2', 'statistique']) {
    assert.equal(syllabes(mot).join(''), mot);
  }
});
