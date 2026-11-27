import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paragraphesDepuisMarkdown, nettoyerMarkdownEnLigne } from '../site/js/texte.js';

const COURS = `---
titre: Cours
auteur: Farah
---

# La régression linéaire

La **régression linéaire** cherche une droite qui passe
au plus près des points. Voir [la doc](https://scikit-learn.org) ![schéma](img.png)

## Étapes
1. Charger les données
2. Entraîner le modèle
- [x] fait
* point *important* avec un nom_de_variable

> Une citation
> sur deux lignes.

\`\`\`python
from sklearn.linear_model import LinearRegression
modele = LinearRegression()  # **pas du gras**
\`\`\`

| Modèle | Score |
|---|---:|
| Linéaire | 0,82 |

Titre souligné
--------------

***

Fin du cours.<!-- commentaire -->
`;

test('markdown : structure complète d’un cours', () => {
  const p = paragraphesDepuisMarkdown(COURS);
  assert.deepEqual(p, [
    { type: 'titre', texte: 'La régression linéaire' },
    { type: 'para', texte: 'La régression linéaire cherche une droite qui passe au plus près des points. Voir la doc' },
    { type: 'titre', texte: 'Étapes' },
    { type: 'para', texte: '1. Charger les données' },
    { type: 'para', texte: '2. Entraîner le modèle' },
    { type: 'para', texte: '• ☑ fait' },
    { type: 'para', texte: '• point important avec un nom_de_variable' },
    { type: 'para', texte: 'Une citation sur deux lignes.' },
    { type: 'code', texte: 'from sklearn.linear_model import LinearRegression\nmodele = LinearRegression()  # **pas du gras**' },
    { type: 'para', texte: 'Modèle – Score' },
    { type: 'para', texte: 'Linéaire – 0,82' },
    { type: 'titre', texte: 'Titre souligné' },
    { type: 'para', texte: 'Fin du cours.' },
  ]);
});

test('markdown : mise en forme en ligne', () => {
  assert.equal(nettoyerMarkdownEnLigne('Un `code`, du ~~barré~~, un \\*astérisque\\* et <https://exemple.fr>'), 'Un code, du barré, un *astérisque* et https://exemple.fr');
  assert.equal(nettoyerMarkdownEnLigne('2 * 3 * 4 reste un calcul'), '2 * 3 * 4 reste un calcul');
});

test('markdown : texte sans aucune balise', () => {
  assert.deepEqual(paragraphesDepuisMarkdown('Bonjour.\nSuite.\n\nAutre paragraphe.'), [
    { type: 'para', texte: 'Bonjour. Suite.' },
    { type: 'para', texte: 'Autre paragraphe.' },
  ]);
});
