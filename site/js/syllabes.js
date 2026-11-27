// Découpage d'un mot français en syllabes écrites (comme à l'école : ta-ble, pho-to-syn-thè-se).
// Règles simples, sans dictionnaire : le résultat est bon pour la grande majorité des mots courants.

const VOYELLES = 'aeiouyàâäéèêëîïôöùûüÿœæ';

// Groupes de consonnes qu'on ne sépare pas en début de syllabe.
const ATTAQUES_2 = new Set([
  'bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'kl', 'kr', 'pl', 'pr', 'tr', 'vr',
  'ch', 'ph', 'gn', 'th', 'rh', 'qu', 'gu',
]);
const ATTAQUES_3 = new Set(['chr', 'chl', 'phr', 'phl', 'thr']);

// Voyelles qui commencent une nouvelle syllabe quand elles suivent une autre voyelle.
const COUPE_AVANT = new Set(['é', 'è', 'ê', 'ë', 'ï', 'ü']);

const estVoyelle = (c) => VOYELLES.includes(c);

// Type de chaque lettre : 'V' (voyelle) ou 'C' (consonne), selon le contexte.
function typesLettres(m) {
  const types = [];
  for (let i = 0; i < m.length; i++) {
    const c = m[i];
    let t = estVoyelle(c) ? 'V' : 'C';
    // Le « u » de « qu » et de « gu » devant e, i, y se comporte comme une consonne.
    if (c === 'u' && i > 0 && (m[i - 1] === 'q' || (m[i - 1] === 'g' && i + 1 < m.length && 'eiyéèêë'.includes(m[i + 1])))) {
      t = 'C';
    }
    // Le « y » entre deux voyelles se comporte comme une consonne (cra-yon, vo-ya-ge).
    if (c === 'y' && i > 0 && i + 1 < m.length && estVoyelle(m[i - 1]) && estVoyelle(m[i + 1])) {
      t = 'C';
    }
    types.push(t);
  }
  // « qu » en début de mot : le u reste consonne même si q est seul.
  return types;
}

// Découpe une suite de lettres (sans tiret ni apostrophe) en syllabes.
function syllabesSimple(original) {
  const m = original.toLowerCase();
  if (m.length <= 2) return [original];
  const types = typesLettres(m);

  // Repérer les noyaux vocaliques (suites de voyelles), en coupant les hiatus.
  const noyaux = []; // [debut, fin) en indices
  let i = 0;
  while (i < m.length) {
    if (types[i] !== 'V') { i++; continue; }
    let debut = i;
    let j = i + 1;
    while (j < m.length && types[j] === 'V') {
      const reste = m.slice(j);
      // « iè », « iê » restent ensemble (lu-miè-re, fiè-vre), mais on coupe po-è-te, na-ïf, cri-é.
      const coupeAvant = COUPE_AVANT.has(m[j]) && !('iy'.includes(m[j - 1]) && 'èê'.includes(m[j]));
      // Après « é », on coupe (cré-er, thé-â-tre), sauf pour les fins muettes (an-née, ar-mées).
      const apresE = m[j - 1] === 'é' && !/^e(s|nt)?$/.test(reste);
      if (coupeAvant || apresE) {
        noyaux.push([debut, j]);
        debut = j;
      }
      j++;
    }
    noyaux.push([debut, j]);
    i = j;
  }
  if (noyaux.length <= 1) return [original];

  // Placer les coupures entre deux noyaux.
  const coupures = [];
  for (let k = 0; k < noyaux.length - 1; k++) {
    const finV = noyaux[k][1];
    const debutV = noyaux[k + 1][0];
    const amas = m.slice(finV, debutV);
    if (amas.length <= 1) {
      coupures.push(finV);
      continue;
    }
    let attaque = 1;
    if (amas.length >= 3 && ATTAQUES_3.has(amas.slice(-3))) attaque = 3;
    else if (ATTAQUES_2.has(amas.slice(-2))) attaque = 2;
    coupures.push(debutV - attaque);
  }

  const res = [];
  let prec = 0;
  for (const c of coupures) {
    res.push(original.slice(prec, c));
    prec = c;
  }
  res.push(original.slice(prec));
  return res.filter((s) => s.length > 0);
}

// Découpe un mot complet. Les tirets et apostrophes restent collés à la partie qui les précède.
export function syllabes(mot) {
  if (!mot) return [];
  if (!/[\p{L}]/u.test(mot)) return [mot];
  const parties = mot.split(/(?<=[-'’])/u);
  const res = [];
  for (const partie of parties) {
    const lettres = partie.replace(/[-'’]+$/u, '');
    const suffixe = partie.slice(lettres.length);
    const sylls = lettres ? syllabesSimple(lettres) : [];
    if (sylls.length === 0) {
      if (res.length) res[res.length - 1] += suffixe;
      else res.push(suffixe);
      continue;
    }
    sylls[sylls.length - 1] += suffixe;
    res.push(...sylls);
  }
  return res;
}
