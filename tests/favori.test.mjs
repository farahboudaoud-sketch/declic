import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lienFavori, lireTexteRecu } from '../site/js/favori.js';

test('le favori est un lien javascript qui vise l’adresse de Déclic', () => {
  const lien = lienFavori('https://exemple.github.io/declic/');
  assert.ok(lien.startsWith('javascript:'));
  const code = decodeURIComponent(lien.slice('javascript:'.length));
  assert.match(code, /https:\/\/exemple\.github\.io\/declic\//);
  assert.doesNotThrow(() => new Function(code));
});

test('texte reçu : blocs nettoyés', () => {
  const d = { type: 'declic-texte', titre: 'Cours', blocs: [{ type: 'titre', texte: 'Titre' }, { type: 'bizarre', texte: 'Para' }, { texte: 3 }], texte: '' };
  const r = lireTexteRecu(`#recevoir=${encodeURIComponent(JSON.stringify(d))}`);
  assert.deepEqual(r.blocs, [{ type: 'titre', texte: 'Titre' }, { type: 'para', texte: 'Para' }]);
  assert.equal(r.titre, 'Cours');
});

test('texte reçu : rien d’exploitable', () => {
  assert.equal(lireTexteRecu('#lire'), null);
  assert.equal(lireTexteRecu('#recevoir=pas-du-json'), null);
  assert.equal(lireTexteRecu(`#recevoir=${encodeURIComponent('{"type":"autre"}')}`), null);
});
