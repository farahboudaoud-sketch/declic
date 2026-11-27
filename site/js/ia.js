// Appels au serveur d'aide Déclic (qui interroge l'IA avec la clé gardée côté serveur).
import { API_URL } from './config.js';
import { code } from './stockage.js';

export class ErreurCode extends Error {
  constructor() { super('Code d’accès manquant ou incorrect.'); }
}

export const iaDisponible = () => Boolean(API_URL);

async function appeler(chemin, corps, codeForce) {
  let r;
  try {
    r = await fetch(API_URL.replace(/\/$/, '') + chemin, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Code-Acces': codeForce ?? code() },
      body: JSON.stringify(corps),
    });
  } catch {
    throw new Error('Impossible de joindre le serveur. Vérifie ta connexion.');
  }
  if (r.status === 401) throw new ErreurCode();
  if (r.status === 429) throw new Error('Beaucoup de demandes pour aujourd’hui : réessaie un peu plus tard.');
  if (!r.ok) {
    const info = await r.json().catch(() => ({}));
    throw new Error(info.erreur || 'Le serveur n’a pas pu répondre. Réessaie dans un moment.');
  }
  return r;
}

export const verifierCode = async (c) => (await appeler('/verifier', {}, c)).json();
export const aideMot = async (mot, phrase) => (await appeler('/mot', { mot, phrase })).json();
export const reformulerPhrase = async (phrase, contexte) => (await appeler('/phrase', { phrase, contexte })).json();
export const reformulerParagraphe = async (texte, titre) => (await appeler('/paragraphe', { texte, titre })).json();

// Renvoie { pdf: ArrayBuffer } pour un lien vers un PDF, sinon { titre, paragraphes }.
export async function chargerLien(url) {
  const r = await appeler('/lien', { url });
  if ((r.headers.get('Content-Type') || '').includes('application/pdf')) {
    return { pdf: await r.arrayBuffer() };
  }
  return r.json();
}
