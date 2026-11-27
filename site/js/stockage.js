// Tout est gardé dans le navigateur de l'élève (localStorage) : rien n'est envoyé sur un serveur.
const P = 'declic:';
const MAX_DOCS = 6;

export function lire(cle, defaut) {
  try {
    const v = localStorage.getItem(P + cle);
    return v ? JSON.parse(v) : defaut;
  } catch {
    return defaut;
  }
}

export function ecrire(cle, valeur) {
  try {
    localStorage.setItem(P + cle, JSON.stringify(valeur));
    return true;
  } catch {
    return false;
  }
}

export function supprimer(cle) {
  try { localStorage.removeItem(P + cle); } catch { /* rien */ }
}

export const listeDocs = () => lire('docs', []);

function retirer(id) {
  supprimer(`doc:${id}`);
  supprimer(`reform:${id}`);
}

export function sauverDoc(doc) {
  const liste = listeDocs().filter((d) => d.id !== doc.id);
  liste.unshift({ id: doc.id, titre: doc.titre, date: Date.now() });
  while (liste.length > MAX_DOCS) retirer(liste.pop().id);
  ecrire('docs', liste);
  // Si la place manque, on oublie les plus anciens documents.
  while (!ecrire(`doc:${doc.id}`, doc.paragraphes) && liste.length > 1) {
    retirer(liste.pop().id);
    ecrire('docs', liste);
  }
}

export function chargerDoc(id) {
  const meta = listeDocs().find((d) => d.id === id);
  const paragraphes = lire(`doc:${id}`, null);
  return meta && paragraphes ? { ...meta, paragraphes } : null;
}

export function oublierDoc(id) {
  retirer(id);
  ecrire('docs', listeDocs().filter((d) => d.id !== id));
}

export const lireReformulations = (id) => lire(`reform:${id}`, {});
export function sauverReformulation(id, index, lignes) {
  const r = lireReformulations(id);
  r[index] = lignes;
  ecrire(`reform:${id}`, r);
}

export const code = () => lire('code', '');
export const definirCode = (c) => ecrire('code', c);
