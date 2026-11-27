import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decouperPhrases, decouperMots, paragraphesDepuisTexte, paragraphesDepuisPages, empreinte } from '../site/js/texte.js';

test('découpe en phrases simples', () => {
  assert.deepEqual(
    decouperPhrases('La plante pousse. Elle a besoin de lumière ! Pourquoi ? Parce que.'),
    ['La plante pousse.', 'Elle a besoin de lumière !', 'Pourquoi ?', 'Parce que.'],
  );
});

test('ne coupe pas après une abréviation ou une initiale', () => {
  assert.deepEqual(
    decouperPhrases('Voir M. Dupont et J. Martin, cf. Annexe 2. Ensuite on lit.'),
    ['Voir M. Dupont et J. Martin, cf. Annexe 2.', 'Ensuite on lit.'],
  );
});

test('ne coupe pas après un numéro de liste', () => {
  assert.deepEqual(decouperPhrases('1. Charger les données. Puis les nettoyer.'), ['1. Charger les données.', 'Puis les nettoyer.']);
  assert.deepEqual(decouperPhrases('Il y en a 2. Ensuite on compte.'), ['Il y en a 2.', 'Ensuite on compte.']);
});

test('ne coupe pas dans un nombre décimal', () => {
  assert.deepEqual(decouperPhrases('Pi vaut 3.14 environ. Voilà.'), ['Pi vaut 3.14 environ.', 'Voilà.']);
});

test('les mots séparent l’élision', () => {
  const j = decouperMots("L'énergie du soleil, c'est vital.");
  const mots = j.filter((x) => x.type === 'mot').map((x) => x.texte);
  assert.deepEqual(mots, ['énergie', 'du', 'soleil', 'est', 'vital']);
  assert.equal(j.map((x) => x.texte).join(''), "L'énergie du soleil, c'est vital.");
});

test('texte collé : titres, paragraphes, puces', () => {
  const p = paragraphesDepuisTexte('La photosynthèse\n\nLes plantes produisent\nleur énergie.\n\n- premier point\n- second point');
  assert.deepEqual(p.map((x) => x.type), ['titre', 'para', 'para', 'para']);
  assert.equal(p[1].texte, 'Les plantes produisent leur énergie.');
  assert.equal(p[3].texte, '- second point');
});

// Construit une page factice : chaque ligne = [texte, y, x, hauteur, largeur]
function page(lignes, hauteur = 800) {
  return { hauteur, items: lignes.map(([str, y, x = 50, h = 10, w]) => ({ str, x, y, h, w: w ?? str.length * 5 })) };
}

test('PDF : lignes jointes, mot coupé recollé, paragraphes séparés', () => {
  const pages = [page([
    ['La photosynthèse', 700, 50, 16],
    ['Les plantes fabriquent leur propre nourriture grâce à la photo-', 670, 50, 10, 450],
    ['synthèse. Elles utilisent la lumière du soleil pour cela et ce', 657, 50, 10, 450],
    ['processus est essentiel.', 644, 50, 10, 150],
    ['Un deuxième paragraphe commence ici et il continue encore un peu', 620, 50, 10, 450],
    ['sur la ligne suivante.', 607, 50, 10, 140],
    ['3', 30, 300, 10],
  ])];
  const p = paragraphesDepuisPages(pages);
  assert.equal(p.length, 3);
  assert.equal(p[0].type, 'titre');
  assert.equal(p[0].texte, 'La photosynthèse');
  assert.match(p[1].texte, /grâce à la photosynthèse\. Elles/);
  assert.match(p[1].texte, /processus est essentiel\.$/);
  assert.equal(p[2].texte, 'Un deuxième paragraphe commence ici et il continue encore un peu sur la ligne suivante.');
});

test('PDF : la phrase continue sur la page suivante, en-tête répété supprimé', () => {
  const entete = (n) => [`Cours de SVT - chapitre ${n}`, 780, 50, 9, 200];
  const pages = [
    page([entete(1), ['Début du texte qui continue', 700, 50, 10, 450]]),
    page([entete(2), ['sur la page suivante.', 700, 50, 10, 120]]),
    page([entete(3), ['Nouveau paragraphe.', 700, 50, 10, 120]]),
  ];
  const p = paragraphesDepuisPages(pages);
  assert.deepEqual(p.map((x) => x.texte), ['Début du texte qui continue sur la page suivante.', 'Nouveau paragraphe.']);
});

test('PDF : morceaux sur la même ligne regroupés avec espaces', () => {
  const pages = [{ hauteur: 800, items: [
    { str: 'Bonjour', x: 50, y: 700, h: 10, w: 35 },
    { str: 'tout', x: 90, y: 700.5, h: 10, w: 20 },
    { str: 'le monde.', x: 112, y: 700, h: 10, w: 45 },
  ] }];
  assert.equal(paragraphesDepuisPages(pages)[0].texte, 'Bonjour tout le monde.');
});

test('empreinte stable', () => {
  assert.equal(empreinte('abc'), empreinte('abc'));
  assert.notEqual(empreinte('abc'), empreinte('abd'));
});
