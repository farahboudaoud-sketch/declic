// Bouton « Envoyer vers Déclic » (favori à glisser dans la barre du navigateur).
// Il s'exécute sur la page du cours, là où l'élève est connecté : il lit le texte affiché
// et ouvre Déclic avec ce texte dans l'adresse (après le #, donc jamais envoyé à un serveur).

/* Cette fonction est convertie en texte : elle ne doit utiliser que ses propres variables. */
function envoyerVersDeclic(adresseDeclic) {
  const SELECTEUR = 'h1,h2,h3,h4,p,li,blockquote,pre,dd,figcaption';
  const EXCLUS = 'nav,header,footer,aside,button,form,[aria-hidden="true"],[role="navigation"]';
  const propre = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  const selection = String(window.getSelection ? window.getSelection() : '').trim();
  const racine = document.querySelector('main, article, [role="main"]') || document.body;
  const blocs = [];
  let texte = '';
  if (selection.length > 40) {
    texte = selection;
  } else {
    racine.querySelectorAll(SELECTEUR).forEach((el) => {
      if (el.closest(EXCLUS)) return;
      const parent = el.parentElement && el.parentElement.closest(SELECTEUR);
      if (parent && racine.contains(parent)) return;
      const t = propre(el.innerText);
      if (t.length < 2) return;
      const titre = /^H\d$/.test(el.tagName);
      blocs.push({ type: titre ? 'titre' : 'para', texte: el.tagName === 'LI' ? `• ${t}` : t });
    });
    texte = racine.innerText || '';
  }
  const longueur = blocs.reduce((s, b) => s + b.texte.length, 0);
  if (longueur < 40 && propre(texte).length < 40) {
    alert('Déclic ne trouve pas de texte sur cette page. Sélectionne le texte du cours, puis reclique sur le favori.');
    return;
  }
  const donnees = { type: 'declic-texte', titre: document.title, blocs: longueur >= 200 ? blocs : [], texte: longueur >= 200 ? '' : texte };
  const adresse = `${adresseDeclic}#recevoir=${encodeURIComponent(JSON.stringify(donnees))}`;
  if (adresse.length > 1800000) {
    alert('Cette page est trop longue. Sélectionne une partie du texte, puis reclique sur le favori.');
    return;
  }
  const fenetre = window.open(adresse, '_blank');
  if (!fenetre) alert('Ton navigateur a bloqué l’ouverture de Déclic : autorise les fenêtres pop-up pour ce site.');
}

export function lienFavori(adresseDeclic) {
  return `javascript:${encodeURIComponent(`(${envoyerVersDeclic.toString()})(${JSON.stringify(adresseDeclic)})`)}`;
}

// Lit le texte reçu dans l'adresse (#recevoir=…). Renvoie null si rien d'exploitable.
export function lireTexteRecu(fragment) {
  if (!fragment.startsWith('#recevoir=')) return null;
  let d;
  try {
    d = JSON.parse(decodeURIComponent(fragment.slice('#recevoir='.length)));
  } catch {
    return null;
  }
  if (!d || d.type !== 'declic-texte') return null;
  const blocs = Array.isArray(d.blocs)
    ? d.blocs
      .filter((b) => b && typeof b.texte === 'string')
      .slice(0, 3000)
      .map((b) => ({ type: b.type === 'titre' ? 'titre' : 'para', texte: b.texte.slice(0, 20000) }))
    : [];
  return {
    titre: typeof d.titre === 'string' ? d.titre.slice(0, 200) : '',
    blocs,
    texte: typeof d.texte === 'string' ? d.texte.slice(0, 500000) : '',
  };
}
