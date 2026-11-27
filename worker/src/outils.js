// Fonctions sans dépendance, testées avec Node.

// Récupère le premier objet JSON d'une réponse de l'IA (même si elle ajoute du texte autour).
export function extraireJson(texte) {
  const debut = texte.indexOf('{');
  const fin = texte.lastIndexOf('}');
  if (debut === -1 || fin <= debut) return null;
  try {
    return JSON.parse(texte.slice(debut, fin + 1));
  } catch {
    return null;
  }
}

// Une phrase par ligne, sans puces ni numéros ajoutés par l'IA.
export function nettoyerLignes(texte) {
  return texte
    .split('\n')
    .map((l) => l.replace(/^\s*([-•*]\s+|\d+[.)]\s+)/u, '').trim())
    .filter((l) => l && !/^#+\s/.test(l));
}

const ENTITES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', agrave: 'à', acirc: 'â', auml: 'ä',
  ccedil: 'ç', icirc: 'î', iuml: 'ï', ocirc: 'ô', ouml: 'ö', ugrave: 'ù', ucirc: 'û', uuml: 'ü',
  Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Agrave: 'À', Acirc: 'Â', Ccedil: 'Ç', Icirc: 'Î', Ocirc: 'Ô', Ucirc: 'Û',
  oelig: 'œ', OElig: 'Œ', aelig: 'æ', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', deg: '°', euro: '€', times: '×', middot: '·', shy: '',
};

export function decoderEntites(texte) {
  return texte.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (tout, nom) => {
    if (nom[0] === '#') {
      const n = nom[1] === 'x' || nom[1] === 'X' ? parseInt(nom.slice(2), 16) : parseInt(nom.slice(1), 10);
      try { return String.fromCodePoint(n); } catch { return tout; }
    }
    return ENTITES[nom] ?? tout;
  });
}

// N'accepte que les adresses web publiques (http ou https).
export function urlAutorisee(brute) {
  let url;
  try {
    url = new URL(brute);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const hote = url.hostname.toLowerCase();
  if (
    hote === 'localhost' || hote.endsWith('.local') || hote.endsWith('.internal')
    || /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(hote)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hote)
    || hote.includes(':') || hote.startsWith('[')
  ) return null;
  return url;
}

export function blocsPropres(blocs) {
  const vus = new Set();
  const res = [];
  for (const b of blocs) {
    const texte = decoderEntites(b.texte).replace(/\s+/g, ' ').trim();
    if (texte.length < 2 || vus.has(texte)) continue;
    vus.add(texte);
    res.push({ type: b.type, texte });
  }
  return res;
}
