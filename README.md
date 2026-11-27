# Déclic

**Lire ses cours plus facilement.** Déclic est un site d'aide à la lecture pensé pour les personnes dyslexiques : il aère un cours en PDF (ou une page web, ou un texte collé) et aide quand un mot bloque.

Adresse du site : **https://farahboudaoud-sketch.github.io/declic/**

## Ce que fait le site

- **Import** : un PDF (lu directement dans le navigateur, il n'est envoyé nulle part), un lien vers une page web ou un PDF en ligne, ou un texte collé.
- **Onglet Adaptation** : le texte original aéré, une phrase par ligne. Chaque mot est cliquable et ouvre une bulle avec :
  - le découpage en syllabes et la lecture à voix haute du mot ou de la phrase ;
  - des synonymes adaptés à la phrase et le sens du mot ici (aide par IA) ;
  - un bouton pour reformuler la phrase plus simplement (aide par IA).
- **Onglet Reformulation** : le texte entier reformulé paragraphe par paragraphe, avec les termes clés du cours gardés en gras, et un lien « Voir l'original » qui renvoie au même endroit dans l'onglet Adaptation. Les paragraphes ne sont reformulés qu'au moment où on les fait défiler, puis gardés en mémoire.
- **Réglages** (barre d'icônes à gauche, qui s'ouvre au survol, au toucher, et peut être épinglée) : police (Atkinson Hyperlegible, Lexend, Andika, Verdana), taille, interligne, espacement des mots et des lettres, couleur de fond (crème, bleu, vert, sombre), syllabes en couleur, ligne de lecture (suit la souris ou les flèches ↑ ↓), lecture à voix haute du texte avec la vitesse réglable.
- **Confidentialité** : les documents et les réglages restent dans le navigateur de l'élève. Seuls le mot, la phrase ou le paragraphe pour lesquels on demande de l'aide sont envoyés au serveur d'aide.

## Organisation du dépôt

| Dossier | Contenu |
| --- | --- |
| `site/` | Le site (HTML, CSS, JavaScript sans étape de compilation), publié sur GitHub Pages |
| `worker/` | Le serveur d'aide (Cloudflare Worker) : interroge Workers AI, vérifie le code d'accès, limite les demandes, récupère le texte des liens |
| `tests/` | Tests automatiques (`npm test`) |
| `.github/workflows/` | Mise en ligne automatique du site et du serveur |

## Mise en ligne du site

À chaque `push` sur `main`, le workflow **Site** lance les tests puis publie le dossier `site/` sur GitHub Pages.

## Aide par IA (synonymes, reformulation, liens)

Le serveur d'aide tourne sur Cloudflare Workers et utilise **Workers AI**, l'IA de Cloudflare : aucune clé d'IA à gérer, et c'est gratuit jusqu'à 10 000 « neurons » par jour (de quelques centaines à plus d'un millier d'aides selon le modèle). Quand le quota du jour est épuisé, les élèves voient un message « l'aide revient demain matin » : aucune facture possible sur le plan gratuit. Le quota se remet à zéro chaque jour à 1 h (heure de Paris, 2 h en été).

Mise en place (déjà faite) :

1. Compte Cloudflare gratuit, page *Workers & Pages* ouverte une fois (cela crée le sous-domaine `workers.dev`).
2. Token API créé avec le modèle **Edit Cloudflare Workers** (*My Profile → API Tokens*).
3. Secrets GitHub (*Settings → Secrets and variables → Actions*) :
   - `CLOUDFLARE_API_TOKEN` : le token ;
   - `CLOUDFLARE_ACCOUNT_ID` : l'identifiant du compte (visible dans l'adresse du tableau de bord) ;
   - `CODES_ACCES` : les codes à donner aux élèves, séparés par des virgules (par exemple `SOLEIL-5A,LUNE-4B`). Un code par classe permet d'en retirer un sans toucher aux autres.

Le serveur est en ligne à l’adresse `https://declic-ia.farah-boudaoud.workers.dev`. Le workflow **Serveur d’aide** déploie le serveur à chaque modification du dossier `worker/`, puis le teste en ligne avec le premier code d'accès (résultat visible dans le résumé du workflow). L'adresse du serveur est inscrite dans `site/js/config.js`.

Pour changer les codes d'accès : modifie le secret `CODES_ACCES`, puis relance le workflow **Serveur d'aide** (*Actions → Serveur d'aide → Run workflow*).

Réglages du serveur (dans `worker/wrangler.toml`) : le modèle (`MODELE`, Mistral Small 3.1 par défaut ; Gemma 4 permet environ trois fois plus d'aides par jour), le nombre maximum de demandes par code et par jour (`LIMITE_JOUR`) et les sites autorisés à appeler le serveur (`ORIGINES`).

## Travailler sur le projet

```bash
npm test                          # tests (syllabes, phrases, extraction PDF, serveur)
python3 -m http.server -d site    # site en local sur http://localhost:8000
cd worker && npx wrangler dev     # serveur d'aide en local (codes dans worker/.dev.vars, IA via le compte Cloudflare)
```

## Limites connues

- Les PDF scannés (images de pages) ne sont pas lus : il faudrait de la reconnaissance de caractères.
- Les formules mathématiques sont souvent mal extraites des PDF.
- Les mises en page en plusieurs colonnes peuvent mélanger les lignes.
- La lecture à voix haute utilise les voix installées sur l'appareil : leur qualité varie selon le navigateur.

## Crédits

[PDF.js](https://mozilla.github.io/pdf.js/) (Apache 2.0) · polices [Atkinson Hyperlegible](https://www.brailleinstitute.org/freefont/), [Lexend](https://www.lexend.com/) et [Andika](https://software.sil.org/andika/) (SIL Open Font License) · icônes [Tabler](https://tabler.io/icons) (MIT).
