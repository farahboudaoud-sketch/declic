// Extraction du texte principal d'une page HTML avec HTMLRewriter (propre à Cloudflare Workers).
export async function extraireHtml(reponse) {
  let titre = '';
  let ignore = 0;
  let principal = 0;
  let courant = null;
  const tous = [];
  const dansPrincipal = [];
  const rw = new HTMLRewriter()
    .on('title', { text(t) { if (!courant) titre += t.text; } })
    .on('nav, header, footer, aside, script, style, noscript, form, button, svg, template, iframe', {
      element(el) {
        ignore += 1;
        el.onEndTag(() => { ignore -= 1; });
      },
    })
    .on('main, article', {
      element(el) {
        principal += 1;
        el.onEndTag(() => { principal -= 1; });
      },
    })
    .on('h1, h2, h3, h4, p, li, blockquote, dd, figcaption', {
      element(el) {
        if (ignore) return;
        const bloc = { type: /^h\d$/i.test(el.tagName) ? 'titre' : 'para', texte: '' };
        if (el.tagName.toLowerCase() === 'li') bloc.texte = '• ';
        tous.push(bloc);
        if (principal) dansPrincipal.push(bloc);
        courant = bloc;
        el.onEndTag(() => { courant = null; });
      },
      text(t) {
        if (!ignore && courant) courant.texte += t.text;
      },
    });
  await rw.transform(reponse).text();
  const longueur = (liste) => liste.reduce((s, b) => s + b.texte.length, 0);
  return { titre, blocs: longueur(dansPrincipal) > 400 ? dansPrincipal : tous };
}
