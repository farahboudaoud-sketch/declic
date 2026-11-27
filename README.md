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
| `worker/` | Le serveur d'aide (Cloudflare Worker) : garde la clé de l'API Claude secrète, vérifie le code d'accès, limite les demandes |
| `tests/` | Tests automatiques (`npm test`) |
| `.github/workflows/` | Mise en ligne automatique du site et du serveur |

## Mise en ligne du site

À chaque `push` sur `main`, le workflow **Site** lance les tests puis publie le dossier `site/` sur GitHub Pages.

## Activer l'aide par IA (synonymes, reformulation, liens)

Sans cette étape, le site marche déjà pour l'aération, les syllabes et la lecture à voix haute. Pour l'aide intelligente :

1. **Clé API Claude** : sur [console.anthropic.com](https://console.anthropic.com), crée une clé dans *API Keys*. Dans *Limits*, fixe une **limite de dépenses mensuelle** : c'est la vraie protection contre les mauvaises surprises.
2. **Compte Cloudflare** (gratuit) : sur [dash.cloudflare.com](https://dash.cloudflare.com), ouvre *Workers & Pages* une première fois pour choisir ton sous-domaine `workers.dev`. Note ton **Account ID** (affiché sur cette page). Puis, dans *My Profile → API Tokens → Create Token*, choisis le modèle **Edit Cloudflare Workers**.
3. **Secrets GitHub** : dans le dépôt, *Settings → Secrets and variables → Actions → New repository secret*, ajoute :
   - `CLOUDFLARE_API_TOKEN` : le token Cloudflare ;
   - `CLOUDFLARE_ACCOUNT_ID` : l'Account ID ;
   - `ANTHROPIC_API_KEY` : la clé API Claude ;
   - `CODES_ACCES` : les codes à donner aux élèves, séparés par des virgules (par exemple `SVT5,MATHS3`). Un code par classe permet d'en retirer un sans toucher aux autres.
4. **Déployer le serveur** : onglet *Actions → Serveur d'aide → Run workflow*. Le résumé du workflow affiche l'adresse du serveur (`https://declic-ia.<ton-sous-domaine>.workers.dev`).
5. **Relier le site au serveur** : *Settings → Secrets and variables → Actions*, onglet **Variables**, crée `DECLIC_API_URL` avec cette adresse. Relance ensuite le workflow **Site**.

Pour changer les codes d'accès : modifie le secret `CODES_ACCES` puis relance le workflow **Serveur d'aide**.

Réglages du serveur (dans `worker/wrangler.toml`) : le modèle utilisé (`MODELE`, Claude Haiku par défaut), le nombre maximum de demandes par code et par jour (`LIMITE_JOUR`) et les sites autorisés à appeler le serveur (`ORIGINES`).

## Travailler sur le projet

```bash
npm test                          # tests (syllabes, phrases, extraction PDF, serveur)
python3 -m http.server -d site    # site en local sur http://localhost:8000
cd worker && npx wrangler dev     # serveur d'aide en local (secrets dans worker/.dev.vars)
```

## Limites connues

- Les PDF scannés (images de pages) ne sont pas lus : il faudrait de la reconnaissance de caractères.
- Les formules mathématiques sont souvent mal extraites des PDF.
- Les mises en page en plusieurs colonnes peuvent mélanger les lignes.
- La lecture à voix haute utilise les voix installées sur l'appareil : leur qualité varie selon le navigateur.

## Crédits

[PDF.js](https://mozilla.github.io/pdf.js/) (Apache 2.0) · polices [Atkinson Hyperlegible](https://www.brailleinstitute.org/freefont/), [Lexend](https://www.lexend.com/) et [Andika](https://software.sil.org/andika/) (SIL Open Font License) · icônes [Tabler](https://tabler.io/icons) (MIT).
