// Serveur d'aide de Déclic (Cloudflare Worker).
// Il garde la clé de l'API Claude secrète, vérifie le code d'accès et limite le nombre de demandes.
import { extraireJson, nettoyerLignes, urlAutorisee, blocsPropres } from './outils.js';
import { extraireHtml } from './html.js';

const MODELE_PAR_DEFAUT = 'claude-haiku-5-5';
const compteurs = new Map();

class ErreurPublique extends Error {
  constructor(message, statut = 400) {
    super(message);
    this.statut = statut;
  }
}

function json(donnees, statut, entetes) {
  return new Response(JSON.stringify(donnees), {
    status: statut,
    headers: { ...entetes, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function entetesCors(request, env) {
  const origine = request.headers.get('Origin') || '';
  const autorisees = (env.ORIGINES || '').split(',').map((s) => s.trim()).filter(Boolean);
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Code-Acces',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (!autorisees.length) h['Access-Control-Allow-Origin'] = '*';
  else if (autorisees.includes(origine) || origine.startsWith('http://localhost') || origine.startsWith('http://127.0.0.1')) {
    h['Access-Control-Allow-Origin'] = origine;
  }
  return h;
}

// Limite approximative par code et par jour (comptée par instance du serveur).
function quotaOk(code, env) {
  const limite = Number(env.LIMITE_JOUR || 500);
  const cle = `${code}|${new Date().toISOString().slice(0, 10)}`;
  const n = (compteurs.get(cle) || 0) + 1;
  compteurs.set(cle, n);
  if (compteurs.size > 1000) compteurs.clear();
  return n <= limite;
}

function texteBorne(valeur, max, nom) {
  const t = typeof valeur === 'string' ? valeur.trim() : '';
  if (!t) throw new ErreurPublique(`Il manque ${nom}.`);
  return t.length > max ? t.slice(0, max) : t;
}

async function claude(env, systeme, message, maxTokens) {
  if (!env.ANTHROPIC_API_KEY) throw new ErreurPublique('Le serveur n’est pas encore configuré.', 503);
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: env.MODELE || MODELE_PAR_DEFAUT,
      max_tokens: maxTokens,
      system: systeme,
      messages: [{ role: 'user', content: message }],
    }),
  });
  if (!r.ok) {
    console.error('API Claude', r.status, await r.text());
    if (r.status === 429 || r.status === 529) throw new ErreurPublique('Le service est très demandé : réessaie dans une minute.', 503);
    throw new ErreurPublique('Le service d’aide ne répond pas pour le moment.', 502);
  }
  const donnees = await r.json();
  return (donnees.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
}

// ---------- Les trois aides ----------

const SYSTEME_MOT = `Tu aides des élèves dyslexiques (collège, lycée ou études) à comprendre un mot d'un cours.
Réponds uniquement avec du JSON valide, sans aucun texte autour, au format :
{"synonymes": ["...", "..."], "sens": "..."}
Règles :
- "synonymes" : de 0 à 4 synonymes simples et courants qui conviennent DANS CETTE PHRASE, accordés comme le mot. Liste vide si c'est un petit mot (le, de, et…) ou un terme technique sans vrai synonyme.
- "sens" : ce que veut dire le mot dans cette phrase précise, en une phrase très simple de 15 mots maximum.
- N'invente rien. Si tu n'es pas sûr, reste prudent et général.`;

async function aideMot(env, corps) {
  const mot = texteBorne(corps.mot, 60, 'le mot');
  const phrase = texteBorne(corps.phrase, 1200, 'la phrase');
  const reponse = await claude(env, SYSTEME_MOT, `Mot : « ${mot} »\nPhrase : « ${phrase} »`, 300);
  const res = extraireJson(reponse) || {};
  return {
    synonymes: Array.isArray(res.synonymes) ? res.synonymes.filter((s) => typeof s === 'string').slice(0, 4) : [],
    sens: typeof res.sens === 'string' ? res.sens : '',
  };
}

const SYSTEME_PHRASE = `Tu reformules une phrase de cours pour un élève dyslexique.
- Garde exactement le même sens et toutes les informations, n'en ajoute aucune.
- Utilise des mots simples et des phrases courtes (une idée par phrase).
- Garde les termes techniques du cours ; tu peux les expliquer en quelques mots.
- Garde les nombres, formules, dates et noms propres exacts.
Réponds uniquement avec la reformulation, sans introduction ni guillemets.`;

async function reformulerPhrase(env, corps) {
  const phrase = texteBorne(corps.phrase, 1200, 'la phrase');
  const contexte = typeof corps.contexte === 'string' ? corps.contexte.slice(0, 3000) : '';
  const message = `${contexte ? `Paragraphe où se trouve la phrase (pour le contexte) :\n${contexte}\n\n` : ''}Phrase à reformuler :\n${phrase}`;
  return { reformulation: await claude(env, SYSTEME_PHRASE, message, 400) };
}

const SYSTEME_PARAGRAPHE = `Tu adaptes un paragraphe de cours pour des élèves dyslexiques.
- Garde tout le sens et toutes les informations importantes ; n'en ajoute aucune.
- Fais des phrases courtes et simples, une idée par phrase, avec des mots courants.
- Garde les termes clés du cours tels quels et entoure-les de ** (exemple : **photosynthèse**). Pas plus de trois termes clés par paragraphe.
- Garde les nombres, formules, dates et noms propres exacts.
- Écris une phrase par ligne, sans puces, sans numéros, sans titre.
Réponds uniquement avec le texte adapté.`;

async function reformulerParagraphe(env, corps) {
  const texte = texteBorne(corps.texte, 6000, 'le paragraphe');
  const titre = typeof corps.titre === 'string' ? corps.titre.slice(0, 200) : '';
  const message = `${titre ? `Titre de la partie : ${titre}\n\n` : ''}Paragraphe :\n${texte}`;
  return { lignes: nettoyerLignes(await claude(env, SYSTEME_PARAGRAPHE, message, 1500)) };
}

// ---------- Récupération du texte d'une page web ----------

async function chargerLien(corps, cors) {
  const url = urlAutorisee(typeof corps.url === 'string' ? corps.url.trim() : '');
  if (!url) throw new ErreurPublique('Ce lien n’est pas valide.');
  let r;
  try {
    r = await fetch(url.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Declic/1.0)', Accept: 'text/html,application/pdf;q=0.9,*/*;q=0.5' },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new ErreurPublique('Impossible d’ouvrir ce lien.', 502);
  }
  if (!r.ok) throw new ErreurPublique(`La page ne répond pas (erreur ${r.status}).`, 502);
  const type = r.headers.get('Content-Type') || '';
  const taille = Number(r.headers.get('Content-Length') || 0);
  if (type.includes('application/pdf') || url.pathname.toLowerCase().endsWith('.pdf')) {
    if (taille > 20e6) throw new ErreurPublique('Ce PDF est trop lourd.', 413);
    return new Response(r.body, { status: 200, headers: { ...cors, 'Content-Type': 'application/pdf' } });
  }
  if (!type.includes('html') && !type.includes('text/plain')) throw new ErreurPublique('Ce lien ne mène ni à une page de texte ni à un PDF.');
  if (type.includes('text/plain')) {
    const texte = (await r.text()).slice(0, 200000);
    const blocs = texte.split(/\n\s*\n/).map((t) => ({ type: 'para', texte: t }));
    return json({ titre: url.hostname, paragraphes: blocsPropres(blocs) }, 200, cors);
  }

  const { titre, blocs } = await extraireHtml(r);
  return json({ titre: blocsPropres([{ type: 'titre', texte: titre }])[0]?.texte || url.hostname, paragraphes: blocsPropres(blocs).slice(0, 600) }, 200, cors);
}

// ---------- Point d'entrée ----------

export default {
  async fetch(request, env) {
    const cors = entetesCors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const { pathname } = new URL(request.url);
    if (request.method === 'GET' && pathname === '/') return json({ service: 'Déclic', ok: true }, 200, cors);
    if (request.method !== 'POST') return json({ erreur: 'Méthode non autorisée.' }, 405, cors);

    const code = (request.headers.get('X-Code-Acces') || '').trim();
    const codes = (env.CODES_ACCES || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!code || !codes.includes(code)) return json({ erreur: 'Code d’accès incorrect.' }, 401, cors);
    if (pathname !== '/verifier' && !quotaOk(code, env)) return json({ erreur: 'Limite du jour atteinte.' }, 429, cors);

    let corps;
    try {
      corps = await request.json();
    } catch {
      return json({ erreur: 'Requête invalide.' }, 400, cors);
    }
    try {
      switch (pathname) {
        case '/verifier': return json({ ok: true }, 200, cors);
        case '/mot': return json(await aideMot(env, corps), 200, cors);
        case '/phrase': return json(await reformulerPhrase(env, corps), 200, cors);
        case '/paragraphe': return json(await reformulerParagraphe(env, corps), 200, cors);
        case '/lien': return await chargerLien(corps, cors);
        default: return json({ erreur: 'Adresse inconnue.' }, 404, cors);
      }
    } catch (e) {
      if (e instanceof ErreurPublique) return json({ erreur: e.message }, e.statut, cors);
      console.error(e);
      return json({ erreur: 'Le service d’aide a rencontré un problème.' }, 500, cors);
    }
  },
};
