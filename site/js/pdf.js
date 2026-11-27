// Lecture d'un PDF directement dans le navigateur avec PDF.js : le fichier n'est envoyé nulle part.
import * as pdfjs from '../vendor/pdfjs/pdf.min.mjs';
import { paragraphesDepuisPages } from './texte.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

export async function lirePdf(donnees, progression) {
  const tache = pdfjs.getDocument({
    data: new Uint8Array(donnees),
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/cmaps/',
    cMapPacked: true,
    isEvalSupported: false,
  });
  const doc = await tache.promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vue = page.getViewport({ scale: 1 });
    const contenu = await page.getTextContent();
    const items = contenu.items
      .filter((it) => typeof it.str === 'string')
      .map((it) => {
        const [, , c, d, e, f] = it.transform;
        return { str: it.str, x: e, y: f, w: it.width, h: Math.hypot(c, d) || it.height };
      });
    pages.push({ hauteur: vue.height, items });
    progression?.(n, doc.numPages);
    page.cleanup();
  }
  let titre = '';
  try {
    titre = (await doc.getMetadata())?.info?.Title || '';
  } catch { /* pas de métadonnées */ }
  await tache.destroy();
  const paragraphes = paragraphesDepuisPages(pages);
  const nbCaracteres = paragraphes.reduce((s, p) => s + p.texte.length, 0);
  return { titre, paragraphes, scanne: nbCaracteres < 40 * pages.length && nbCaracteres < 400 };
}
