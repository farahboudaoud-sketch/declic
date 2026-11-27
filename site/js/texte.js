// Transformations de texte : reconstruction des paragraphes d'un PDF, découpage en phrases et en mots.
// Aucune dépendance au navigateur : ce module est testé avec Node.

const PUCE = /^([•·▪‣◦○●■□➢➤►✓✔–—-]|\(?\d{1,2}[.)]|\(?[a-z][.)])\s+/u;
const FIN_PHRASE = /[.!?…:»"”)]$/u;

const ABREVIATIONS = new Set([
  'm', 'mme', 'mmes', 'mlle', 'mlles', 'mm', 'dr', 'pr', 'me', 'st', 'ste', 'etc', 'ex', 'cf', 'p', 'pp',
  'fig', 'env', 'av', 'apr', 'vol', 'chap', 'éd', 'no', 'n°', 'art', 'al', 'resp', 'max', 'min', 'approx', 'c-à-d', 'cad',
]);

function mediane(valeurs) {
  if (!valeurs.length) return 0;
  const v = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// ---------- Phrases et mots ----------

// Découpe un paragraphe en phrases, sans couper après les abréviations ni les initiales.
export function decouperPhrases(texte) {
  const t = texte.replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const phrases = [];
  let debut = 0;
  const re = /([.!?…]+)(["»”)\]]*)\s+(?=["«“(\[]?\s?[\p{Lu}\d])/gu;
  let m;
  while ((m = re.exec(t)) !== null) {
    const fin = m.index + m[1].length + m[2].length;
    const avant = t.slice(debut, m.index);
    const dernierMot = (avant.match(/([\p{L}°-]+)$/u) || [])[1] || '';
    const ponct = m[1];
    if (ponct === '.') {
      // Initiale (« J. Dupont ») ou abréviation (« M. », « ex. »).
      if (/^\p{Lu}$/u.test(dernierMot) || ABREVIATIONS.has(dernierMot.toLowerCase())) continue;
    }
    phrases.push(t.slice(debut, fin).trim());
    debut = m.index + m[0].length;
  }
  const reste = t.slice(debut).trim();
  if (reste) phrases.push(reste);
  return phrases;
}

const ELISION = /^(l|d|j|m|n|s|t|c|qu|jusqu|lorsqu|puisqu|quoiqu|presqu)['’]/iu;

// Découpe une phrase en jetons : mots (cliquables) et le reste (ponctuation, espaces, nombres).
export function decouperMots(phrase) {
  const jetons = [];
  const re = /[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*['’]?/gu;
  let prec = 0;
  let m;
  while ((m = re.exec(phrase)) !== null) {
    if (m.index > prec) jetons.push({ type: 'autre', texte: phrase.slice(prec, m.index) });
    let mot = m[0];
    // Séparer l'élision (« l'énergie » → « l' » + « énergie ») pour que le clic porte sur le vrai mot.
    const el = mot.match(ELISION);
    if (el && el[0].length < mot.length) {
      jetons.push({ type: 'elision', texte: el[0] });
      mot = mot.slice(el[0].length);
    }
    jetons.push({ type: 'mot', texte: mot });
    prec = m.index + m[0].length;
  }
  if (prec < phrase.length) jetons.push({ type: 'autre', texte: phrase.slice(prec) });
  return jetons;
}

// ---------- Texte collé ----------

export function paragraphesDepuisTexte(brut) {
  const blocs = brut.replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  const res = [];
  for (const bloc of blocs) {
    const lignes = bloc.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lignes.length) continue;
    if (lignes.length === 1 && lignes[0].length < 80 && !/[.!?;,:…]$/u.test(lignes[0]) && !PUCE.test(lignes[0])) {
      res.push({ type: 'titre', texte: lignes[0] });
      continue;
    }
    let courant = '';
    for (const ligne of lignes) {
      if (PUCE.test(ligne) && courant) {
        res.push({ type: 'para', texte: courant });
        courant = ligne;
      } else {
        courant = joindreLignes(courant, ligne);
      }
    }
    if (courant) res.push({ type: 'para', texte: courant });
  }
  return res;
}

// ---------- PDF ----------

function joindreLignes(a, b) {
  if (!a) return b;
  // Mot coupé en fin de ligne : « photo-\nsynthèse » → « photosynthèse ».
  if (/\p{L}-$/u.test(a) && /^\p{Ll}/u.test(b)) return a.slice(0, -1) + b;
  return `${a} ${b}`.replace(/\s+/g, ' ');
}

// Regroupe les morceaux de texte d'une page en lignes.
export function lignesDepuisItems(items) {
  const morceaux = items
    .filter((it) => it.str && it.str.trim() !== '')
    .map((it) => ({ ...it, h: it.h || 10 }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const lignes = [];
  for (const it of morceaux) {
    let ligne = null;
    for (let k = lignes.length - 1; k >= 0 && k >= lignes.length - 3; k--) {
      if (Math.abs(lignes[k].y - it.y) <= 0.5 * Math.max(lignes[k].h, it.h)) { ligne = lignes[k]; break; }
    }
    if (!ligne) {
      ligne = { y: it.y, h: it.h, items: [] };
      lignes.push(ligne);
    }
    ligne.items.push(it);
    ligne.h = Math.max(ligne.h, it.h);
  }
  return lignes.map((l) => {
    const its = l.items.sort((a, b) => a.x - b.x);
    let texte = '';
    let finPrec = null;
    for (const it of its) {
      if (finPrec !== null) {
        const ecart = it.x - finPrec;
        if (ecart > 0.15 * it.h && !texte.endsWith(' ') && !it.str.startsWith(' ')) texte += ' ';
      }
      texte += it.str;
      finPrec = it.x + (it.w || 0);
    }
    const hauteurs = its.map((it) => it.h);
    return {
      texte: texte.replace(/\s+/g, ' ').trim(),
      y: l.y,
      x: its[0].x,
      xFin: finPrec,
      h: mediane(hauteurs),
    };
  }).filter((l) => l.texte);
}

const signature = (texte) => texte.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();

// pages : [{ hauteur, items: [{ str, x, y, w, h }] }] → [{ type: 'titre' | 'para', texte }]
export function paragraphesDepuisPages(pages) {
  const parPage = pages.map((p) => ({ hauteur: p.hauteur || 842, lignes: lignesDepuisItems(p.items) }));

  // En-têtes et pieds de page répétés, numéros de page.
  const nbPages = parPage.length;
  const compte = new Map();
  for (const p of parPage) {
    const vues = new Set();
    for (const l of p.lignes) {
      const bord = l.y > p.hauteur * 0.9 || l.y < p.hauteur * 0.1;
      if (!bord) continue;
      const s = signature(l.texte);
      if (!vues.has(s)) { vues.add(s); compte.set(s, (compte.get(s) || 0) + 1); }
    }
  }
  for (const p of parPage) {
    p.lignes = p.lignes.filter((l) => {
      const bord = l.y > p.hauteur * 0.9 || l.y < p.hauteur * 0.1;
      if (!bord) return true;
      if (/^(page\s*)?\d+(\s*(\/|sur)\s*\d+)?$/iu.test(l.texte)) return false;
      if (nbPages >= 2 && (compte.get(signature(l.texte)) || 0) >= Math.ceil(nbPages * 0.6)) return false;
      return true;
    });
  }

  const toutes = parPage.flatMap((p) => p.lignes);
  if (!toutes.length) return [];
  const hCorps = mediane(toutes.flatMap((l) => Array(Math.min(20, Math.ceil(l.texte.length / 10))).fill(l.h)));
  const ecarts = [];
  for (const p of parPage) {
    for (let k = 1; k < p.lignes.length; k++) {
      const e = p.lignes[k - 1].y - p.lignes[k].y;
      if (e > 0 && Math.abs(p.lignes[k].h - hCorps) < hCorps * 0.2) ecarts.push(e);
    }
  }
  const interligne = mediane(ecarts) || hCorps * 1.3;
  const largeurMax = Math.max(...toutes.map((l) => l.xFin - l.x));

  const estTitre = (l) => l.h >= hCorps * 1.15 && l.texte.length < 120 && !/[.;,]$/u.test(l.texte);

  const blocs = [];
  let courant = null;
  let lignePrec = null;
  const fermer = () => { if (courant && courant.texte.trim()) blocs.push(courant); courant = null; };

  parPage.forEach((p, numPage) => {
    p.lignes.forEach((l, k) => {
      const titre = estTitre(l);
      let nouveau = false;
      if (!courant) nouveau = true;
      else if (titre) {
        // Un titre sur deux lignes reste un seul titre.
        nouveau = !(courant.type === 'titre' && k > 0 && Math.abs(l.h - lignePrec.h) < 1 && lignePrec.y - l.y < l.h * 2);
      } else if (courant.type === 'titre') nouveau = true;
      else if (PUCE.test(l.texte)) nouveau = true;
      else if (k === 0) {
        // Changement de page : on continue la phrase si elle n'était pas finie.
        nouveau = FIN_PHRASE.test(courant.texte);
      } else {
        const ecart = lignePrec.y - l.y;
        const finie = FIN_PHRASE.test(lignePrec.texte);
        const courte = lignePrec.xFin - lignePrec.x < largeurMax * 0.8;
        const retrait = l.x > lignePrec.x + 1.5 * hCorps;
        nouveau = ecart > interligne * 1.45 || (finie && courte) || (finie && retrait);
      }
      if (nouveau) {
        fermer();
        courant = { type: titre ? 'titre' : 'para', texte: l.texte, page: numPage + 1 };
      } else {
        courant.texte = joindreLignes(courant.texte, l.texte);
      }
      lignePrec = l;
    });
  });
  fermer();
  return blocs.map(({ type, texte, page }) => ({ type, texte: texte.replace(/\s+/g, ' ').trim(), page }));
}

// Identifiant court et stable pour un document (sert de clé pour le stockage local).
export function empreinte(texte) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
