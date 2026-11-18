/**
 * The guides, in French and in English.
 *
 * Every statement here describes the software in this repository. Numbers and
 * names come from the API source (apps/api/src/config.ts, routes and
 * services): when they change there, change them here. Nothing is promised
 * that the code does not do.
 */
import { SITE_ORIGIN } from '../site/config.ts';
import { code, h2, l, note, p, same, table, terms, ul, type Guide } from './types.ts';

const O = SITE_ORIGIN;
const TARGET = 'https://example.com/blog/launch';
const ENC = encodeURIComponent(TARGET);

const quickstart: Guide = {
  id: 'quickstart',
  title: l('Démarrage en cinq minutes', 'Five-minute quick start'),
  nav: l('Démarrage rapide', 'Quick start'),
  description: l(
    'Premier appel à l’API Omnillink en cinq minutes : métadonnées, capture d’écran, contenu lisible, gestion des erreurs.',
    'Your first call to the Omnillink API in five minutes: metadata, screenshot, readable content, error handling.',
  ),
  lead: l(
    'Une requête `GET`, une URL en paramètre. Ce guide vous mène du premier appel à une intégration qui gère les erreurs.',
    'One `GET` request, one URL as a parameter. This guide takes you from the first call to an integration that handles errors.',
  ),
  blocks: [
    h2('first-call', '1. Premier appel', '1. First call'),
    p(
      'Aucune inscription ni clé n’est nécessaire. Passez l’adresse de la page dans `url`, encodée pour une URL.',
      'No sign-up and no key are needed. Pass the address of the page in `url`, URL-encoded.',
    ),
    code('bash', 'Terminal', 'Terminal', `curl "${O}/api/v1/meta?url=${ENC}"`),
    p(
      'La réponse est une enveloppe JSON : `status`, le résultat dans `data`, et `meta` qui dit si la réponse vient du cache, par quel chemin la page a été lue et en combien de temps.',
      'The answer is a JSON envelope: `status`, the result in `data`, and `meta`, which says whether the answer came from the cache, which path read the page and how long it took.',
    ),
    h2('in-code', '2. Dans votre code', '2. In your code'),
    code(
      'js',
      'JavaScript',
      'JavaScript',
      `const params = new URLSearchParams({ url: "${TARGET}" });
const response = await fetch(\`${O}/api/v1/meta?\${params}\`);
const body = await response.json();

if (body.status !== "success") {
  throw new Error(\`\${body.code}: \${body.message}\`);
}
console.log(body.data.title, body.data.image?.url);`,
    ),
    p(
      'Appuyez-vous sur `body.code` pour traiter une erreur : il est stable, alors que `message` est destiné aux humains. La liste complète est dans [Codes d’erreur](/docs/errors).',
      'Rely on `body.code` to handle an error: it is stable, whereas `message` is meant for humans. The full list is in [Error codes](/docs/errors).',
    ),
    h2('image', '3. Une capture dans une balise', '3. A screenshot in a tag'),
    p(
      '`/screenshot` renvoie l’image elle-même. Son adresse fonctionne donc directement dans un attribut `src`.',
      '`/screenshot` returns the image itself, so its address works directly in a `src` attribute.',
    ),
    code('html', 'HTML', 'HTML', `<img src="${O}/api/v1/screenshot?url=${ENC}&device=mobile" alt="example.com" />`),
    h2('content', '4. Du texte pour un modèle', '4. Text for a model'),
    p(
      '`/content` renvoie la partie lisible de la page. Avec `format=markdown`, la réponse est le Markdown lui-même, sans enveloppe JSON.',
      '`/content` returns the readable part of the page. With `format=markdown`, the answer is the Markdown itself, without a JSON envelope.',
    ),
    code('bash', 'Terminal', 'Terminal', `curl "${O}/api/v1/content?url=${ENC}&format=markdown"`),
    h2('next', '5. Et ensuite', '5. What next'),
    ul(
      l('Essayez chaque paramètre dans le [bac à sable](/playground), qui génère le code correspondant.', 'Try every parameter in the [playground](/playground), which generates the matching code.'),
      l('Lisez la [référence de l’API](/docs) pour le détail des paramètres et des réponses.', 'Read the [API reference](/docs) for the details of parameters and responses.'),
      l('Vérifiez les [limites et quotas](/docs/limits) avant de passer en production.', 'Check the [limits and quotas](/docs/limits) before going to production.'),
      l('Hébergez votre propre instance avec le [guide d’auto-hébergement](/docs/self-hosting).', 'Host your own instance with the [self-hosting guide](/docs/self-hosting).'),
    ),
  ],
};

const selfHosting: Guide = {
  id: 'self-hosting',
  title: l('Auto-hébergement', 'Self-hosting'),
  nav: l('Auto-hébergement', 'Self-hosting'),
  description: l(
    'Héberger Omnillink : Node.js en local ou sur un serveur, déploiement sur Vercel, variables d’environnement, Redis et clés d’API.',
    'Hosting Omnillink: Node.js locally or on a server, deployment on Vercel, environment variables, Redis and API keys.',
  ),
  lead: l(
    'Omnillink est un logiciel libre sous licence MIT. Il vous faut Node.js 22 ou plus récent ; Redis est facultatif.',
    'Omnillink is free software under the MIT licence. You need Node.js 22 or newer; Redis is optional.',
  ),
  blocks: [
    h2('node', 'Avec Node.js', 'With Node.js'),
    code(
      'bash',
      'Terminal',
      'Terminal',
      `git clone https://github.com/kayzen-lyon/linkforge.git
cd linkforge
npm install
npx playwright-core install chromium
cp .env.example .env
npm run dev`,
    ),
    p(
      'L’API écoute sur `http://localhost:3000`. `npm run build` puis `npm start` lancent la version compilée.',
      'The API listens on `http://localhost:3000`. `npm run build` then `npm start` run the compiled version.',
    ),
    h2('vercel', 'Sur Vercel', 'On Vercel'),
    p(
      'Le dépôt contient la configuration d’un déploiement en une seule fonction serverless, qui sert à la fois l’API et ce site. Le dossier racine du projet Vercel est `apps/api`.',
      'The repository contains the configuration of a single serverless function deployment that serves both the API and this site. The root directory of the Vercel project is `apps/api`.',
    ),
    ul(
      l('Sur Vercel, Chromium vient du paquet `@sparticuz/chromium`, prévu pour les fonctions serverless.', 'On Vercel, Chromium comes from the `@sparticuz/chromium` package, which is made for serverless functions.'),
      l('Sans Redis, le cache vit en mémoire, instance par instance. Ajoutez `REDIS_URL` pour le partager.', 'Without Redis the cache lives in memory, per instance. Add `REDIS_URL` to share it.'),
      l('Le premier rendu d’une instance froide est plus lent : Chromium doit d’abord démarrer.', 'The first render of a cold instance is slower: Chromium has to start first.'),
    ),
    h2('environment', 'Variables d’environnement', 'Environment variables'),
    p('Toutes sont facultatives. Les valeurs par défaut conviennent à un essai local.', 'All of them are optional. The defaults suit a local trial.'),
    table(
      [l('Variable', 'Variable'), l('Défaut', 'Default'), l('Rôle', 'Purpose')],
      [
        [same('`PORT`, `HOST`'), same('`3000`, `0.0.0.0`'), l('Adresse d’écoute.', 'Listening address.')],
        [same('`REDIS_URL`'), l('vide', 'empty'), l('Cache partagé. Vide : cache en mémoire.', 'Shared cache. Empty: in-memory cache.')],
        [same('`API_KEYS`'), l('vide', 'empty'), l('Clés acceptées dans `x-api-key`, séparées par des virgules, de 16 à 256 caractères.', 'Keys accepted in `x-api-key`, comma-separated, 16 to 256 characters.')],
        [same('`RATE_LIMIT_MAX`'), same('`60`'), l('Requêtes par fenêtre et par adresse IP.', 'Requests per window and per IP address.')],
        [same('`RATE_LIMIT_KEY_MAX`'), same('`600`'), l('Requêtes par fenêtre et par clé.', 'Requests per window and per key.')],
        [same('`RATE_LIMIT_WINDOW_MS`'), same('`60000`'), l('Durée de la fenêtre.', 'Length of the window.')],
        [same('`CACHE_*_TTL_SECONDS`'), same('`3600`'), l('Durée de cache par point d’accès : `META`, `SCREENSHOT`, `PDF`, `EXTRACT`, `CONTENT`.', 'Cache lifetime per endpoint: `META`, `SCREENSHOT`, `PDF`, `EXTRACT`, `CONTENT`.')],
        [same('`HTTP_TIMEOUT_MS`'), same('`10000`'), l('Délai de la lecture HTTP.', 'Timeout of the HTTP read.')],
        [same('`BROWSER_NAVIGATION_TIMEOUT_MS`'), same('`20000`'), l('Délai de navigation dans Chromium.', 'Navigation timeout in Chromium.')],
        [same('`BROWSER_MAX_CONCURRENCY`'), same('`4`'), l('Pages rendues en parallèle (2 en serverless).', 'Pages rendered in parallel (2 on serverless).')],
        [same('`REQUEST_DEADLINE_MS`'), same('`55000`'), l('Délai global d’une requête.', 'Overall deadline of a request.')],
        [same('`SSRF_ALLOWED_PORTS`'), same('`80,443`'), l('Ports de destination autorisés.', 'Allowed destination ports.')],
        [same('`CORS_ORIGIN`'), same('`*`'), l('Origines autorisées à appeler l’API depuis un navigateur.', 'Origins allowed to call the API from a browser.')],
      ],
    ),
    note(
      '`SSRF_ALLOW_PRIVATE_NETWORKS=true` autorise les adresses locales et privées. Ce réglage sert aux tests : l’API refuse de démarrer avec lui quand `NODE_ENV=production`.',
      '`SSRF_ALLOW_PRIVATE_NETWORKS=true` allows local and private addresses. It exists for tests: the API refuses to start with it when `NODE_ENV=production`.',
    ),
    h2('check', 'Vérifier l’installation', 'Checking the installation'),
    code('bash', 'Terminal', 'Terminal', 'curl http://localhost:3000/health'),
    p(
      'La réponse donne la durée de fonctionnement, le type de cache et l’état du pool de navigateurs. La page [État](/status) affiche la même chose pour cette instance.',
      'The answer gives the uptime, the cache backend and the state of the browser pool. The [Status](/status) page shows the same for this instance.',
    ),
  ],
};

const sdk: Guide = {
  id: 'sdk',
  title: l('SDK TypeScript et composant link-preview', 'TypeScript SDK and the link-preview element'),
  nav: l('SDK et composant', 'SDK and element'),
  description: l(
    'Le client TypeScript d’Omnillink et l’élément `<link-preview>` : installation, création du client, appels typés, carte d’aperçu prête à poser.',
    'The Omnillink TypeScript client and the `<link-preview>` element: installation, creating the client, typed calls, a drop-in preview card.',
  ),
  lead: l(
    'Le dépôt contient un client TypeScript sans dépendance et un élément personnalisé `<link-preview>`. Tous deux se trouvent dans `packages/sdk`.',
    'The repository contains a dependency-free TypeScript client and a `<link-preview>` custom element. Both live in `packages/sdk`.',
  ),
  blocks: [
    note(
      'Le paquet `@omnillink/sdk` est construit depuis le dépôt. Sa publication sur le registre npm n’est pas confirmée à ce jour : en attendant, installez-le depuis `packages/sdk`.',
      'The `@omnillink/sdk` package is built from the repository. Its publication on the npm registry is not confirmed at this time: until then, install it from `packages/sdk`.',
    ),
    h2('client', 'Le client', 'The client'),
    code(
      'js',
      'TypeScript',
      'TypeScript',
      `import { createClient } from '@omnillink/sdk';

const omnillink = createClient({ baseUrl: '${O}' });

const { data, meta } = await omnillink.meta('${TARGET}');
console.log(data.title, data.image?.url, meta.cached);`,
    ),
    table(
      [l('Option', 'Option'), l('Défaut', 'Default'), l('Rôle', 'Purpose')],
      [
        [same('`baseUrl`'), same('–'), l('Origine de l’instance. `/api/v1` est ajouté pour vous.', 'Origin of the instance. `/api/v1` is appended for you.')],
        [same('`apiKey`'), same('–'), l('Envoyée dans l’en-tête `x-api-key`.', 'Sent in the `x-api-key` header.')],
        [same('`fetch`'), l('`fetch` global', 'global `fetch`'), l('Votre propre implémentation, pour les tests par exemple.', 'Your own implementation, for tests for instance.')],
        [same('`timeoutMs`'), same('`30000`'), l('Délai d’une requête entière. `0` le désactive.', 'Time allowed for a whole request. `0` disables it.')],
      ],
    ),
    p(
      'Les méthodes `meta`, `extract`, `content`, `screenshot` et `pdf` reprennent les paramètres de l’API. Les méthodes JSON renvoient `{ data, meta }`.',
      'The `meta`, `extract`, `content`, `screenshot` and `pdf` methods take the parameters of the API. The JSON methods resolve to `{ data, meta }`.',
    ),
    h2('element', 'L’élément `<link-preview>`', 'The `<link-preview>` element'),
    p(
      'Un point d’entrée séparé enregistre l’élément. Il affiche une carte d’aperçu à partir de `/meta`.',
      'A separate entry point registers the element. It renders a preview card from `/meta`.',
    ),
    code(
      'html',
      'HTML',
      'HTML',
      `<script type="module">
  import '@omnillink/sdk/element';
</script>

<link-preview url="${TARGET}" base-url="${O}"></link-preview>`,
    ),
    p(
      'Le [bac à sable](/playground) génère cette balise pour l’adresse que vous testez. Le détail des options est dans le fichier `README.md` du paquet.',
      'The [playground](/playground) generates this tag for the address you are testing. The options are detailed in the `README.md` of the package.',
    ),
  ],
};

const aiAgents: Guide = {
  id: 'ai-agents',
  title: l('Omnillink pour les agents IA', 'Omnillink for AI agents'),
  nav: l('Agents IA', 'AI agents'),
  description: l(
    'Donner à un modèle le contenu d’une page web : Markdown propre, citations numérotées, liens et images, fichiers llms.txt.',
    'Giving a model the content of a web page: clean Markdown, numbered citations, links and images, llms.txt files.',
  ),
  lead: l(
    'Un modèle de langage lit mal le HTML brut : menus, scripts et bandeaux noient le texte. `/content` lui donne la partie lisible de la page.',
    'A language model reads raw HTML badly: menus, scripts and banners drown the text. `/content` gives it the readable part of the page.',
  ),
  blocks: [
    h2('markdown', 'Du Markdown en une requête', 'Markdown in one request'),
    code('bash', 'Terminal', 'Terminal', `curl "${O}/api/v1/content?url=${ENC}&format=markdown"`),
    ul(
      l('`format=json` (défaut) renvoie `title`, `excerpt`, `text`, `markdown`, `wordCount`, `readingTimeMinutes`, ainsi que les liens et les images du contenu.', '`format=json` (default) returns `title`, `excerpt`, `text`, `markdown`, `wordCount`, `readingTimeMinutes`, plus the links and images of the content.'),
      l('`format=markdown` et `format=text` renvoient le texte seul, prêt à insérer dans un prompt.', '`format=markdown` and `format=text` return the text alone, ready to drop into a prompt.'),
      l('`citations=true` remplace les liens par des renvois numérotés, avec la liste des adresses à la fin.', '`citations=true` replaces links with numbered references, with the list of addresses at the end.'),
      l('`mainContent=false` garde toute la page au lieu du seul contenu principal ; `include` et `exclude` acceptent des sélecteurs CSS.', '`mainContent=false` keeps the whole page instead of the main content only; `include` and `exclude` take CSS selectors.'),
    ),
    h2('budget', 'Maîtriser la taille', 'Keeping the size under control'),
    p(
      'Le texte et le Markdown sont coupés à 500 000 caractères ; le champ `truncated` le signale. `wordCount` vous permet d’estimer le coût d’un appel avant d’envoyer le texte à un modèle.',
      'Text and Markdown are cut at 500,000 characters; the `truncated` field reports it. `wordCount` lets you estimate the cost of a call before sending the text to a model.',
    ),
    h2('tool', 'En faire un outil', 'Turning it into a tool'),
    p(
      'Le document OpenAPI décrit chaque point d’accès avec ses paramètres : la plupart des cadres d’agents savent en tirer une définition d’outil.',
      'The OpenAPI document describes every endpoint with its parameters: most agent frameworks can derive a tool definition from it.',
    ),
    code('bash', 'Terminal', 'Terminal', `curl "${O}/api/v1/openapi.json"`),
    h2('llms', 'Fichiers llms.txt', 'llms.txt files'),
    p(
      'Ce site publie [/llms.txt](/llms.txt), un sommaire de la documentation, et [/llms-full.txt](/llms-full.txt), qui en contient le texte complet en un seul fichier.',
      'This site publishes [/llms.txt](/llms.txt), a table of contents of the documentation, and [/llms-full.txt](/llms-full.txt), which holds its full text in a single file.',
    ),
    note(
      'Le contenu extrait vient d’un site tiers. Traitez-le comme une donnée non fiable : il peut contenir des instructions destinées à détourner un agent.',
      'Extracted content comes from a third-party site. Treat it as untrusted data: it may contain instructions meant to hijack an agent.',
    ),
  ],
};

const recipes: Guide = {
  id: 'recipes',
  title: l('Recettes', 'Recipes'),
  nav: l('Recettes', 'Recipes'),
  description: l(
    'Quatre intégrations courantes avec Omnillink : aperçus de liens dans un blog, images de partage, veille de prix, archivage en PDF.',
    'Four common integrations with Omnillink: link previews in a blog, share images, price monitoring, PDF archiving.',
  ),
  lead: l('Quatre usages courants, avec le code minimal pour chacun.', 'Four common uses, with the minimal code for each.'),
  blocks: [
    h2('link-previews', 'Aperçus de liens dans un blog', 'Link previews in a blog'),
    p(
      'Appelez `/meta` au moment de la publication, ou côté serveur, et gardez le résultat avec l’article. Vous n’appelez pas l’API à chaque visite.',
      'Call `/meta` at publication time, or on the server, and keep the result with the article. You do not call the API on every visit.',
    ),
    code(
      'js',
      'JavaScript',
      'JavaScript',
      `async function linkCard(url) {
  const params = new URLSearchParams({ url });
  const response = await fetch(\`${O}/api/v1/meta?\${params}\`);
  const { status, data } = await response.json();
  if (status !== "success") return null;
  return {
    title: data.title ?? new URL(data.url).hostname,
    description: data.description,
    image: data.image?.url ?? null,
    site: data.publisher,
  };
}`,
    ),
    h2('share-images', 'Images de partage', 'Share images'),
    p(
      'Capturez une page conçue pour cela, à la taille attendue par les réseaux sociaux. `selector` limite la capture à un élément.',
      'Capture a page designed for the purpose, at the size social networks expect. `selector` limits the capture to one element.',
    ),
    code(
      'html',
      'HTML',
      'HTML',
      `<meta property="og:image"
  content="${O}/api/v1/screenshot?url=${encodeURIComponent('https://example.com/cards/launch')}&width=1200&height=630&format=jpeg" />`,
    ),
    h2('price-watch', 'Veille de prix', 'Price monitoring'),
    p(
      'Décrivez les champs une fois ; rappelez la même requête à intervalles réguliers. `ttl` fixe la durée pendant laquelle la réponse reste en cache.',
      'Describe the fields once; call the same request at regular intervals. `ttl` sets how long the answer stays cached.',
    ),
    code(
      'bash',
      'Terminal',
      'Terminal',
      `curl -G "${O}/api/v1/extract" \\
  --data-urlencode "url=https://example.com/product/42" \\
  --data-urlencode 'fields={"name":{"selector":"h1"},"price":{"selector":".price","type":"number"}}' \\
  --data-urlencode "ttl=900"`,
    ),
    h2('pdf-archive', 'Archivage en PDF', 'PDF archiving'),
    p(
      '`/pdf` rend la page avec sa feuille de style d’impression. `force=true` garantit une copie de la page telle qu’elle est à cet instant.',
      '`/pdf` renders the page with its print stylesheet. `force=true` guarantees a copy of the page as it is at that moment.',
    ),
    code('bash', 'Terminal', 'Terminal', `curl -o archive.pdf "${O}/api/v1/pdf?url=${ENC}&format=A4&force=true"`),
    note(
      'Vérifiez que vous avez le droit de copier et de conserver les pages que vous archivez ou collectez.',
      'Check that you are allowed to copy and keep the pages you archive or collect.',
    ),
  ],
};

const ERROR_ROWS: ReadonlyArray<readonly [string, string, string, string, string, string]> = [
  ['EINVALIDPARAMS', '400', 'Un paramètre est manquant ou a une valeur invalide.', 'Comparez la requête à la référence ; le message nomme le paramètre.', 'A parameter is missing or has an invalid value.', 'Compare the request with the reference; the message names the parameter.'],
  ['EINVALIDURL', '400', 'L’`url` est mal formée ou n’est ni `http` ni `https`.', 'Envoyez une adresse absolue et encodez-la (`encodeURIComponent`).', 'The `url` is malformed or is neither `http` nor `https`.', 'Send an absolute address and encode it (`encodeURIComponent`).'],
  ['EUNAUTHORIZED', '401', 'La clé envoyée dans `x-api-key` n’est pas connue de l’instance.', 'Corrigez la clé, ou retirez l’en-tête pour un appel anonyme.', 'The key sent in `x-api-key` is not known to the instance.', 'Fix the key, or remove the header for an anonymous call.'],
  ['EFORBIDDENURL', '403', 'La destination est privée, locale ou interne, ou son port n’est pas autorisé.', 'Seules les pages publiques sont lisibles. Pour un intranet, hébergez votre instance dans ce réseau.', 'The destination is private, local or internal, or its port is not allowed.', 'Only public pages can be read. For an intranet, host your own instance inside that network.'],
  ['EEMBEDNOTFOUND', '404', 'Le chemin demandé avec `embed` n’existe pas pour cette page, ou vaut `null`.', 'Appelez `/meta` sans `embed` pour voir les champs disponibles ; prévoyez une image de repli.', 'The path requested with `embed` does not exist for this page, or is `null`.', 'Call `/meta` without `embed` to see the available fields; plan a fallback image.'],
  ['ESELECTORNOTFOUND', '404', 'Le `selector` ne correspond à aucun élément visible.', 'Vérifiez le sélecteur dans le navigateur ; ajoutez `waitForSelector` si l’élément arrive tard.', 'The `selector` matches no visible element.', 'Check the selector in a browser; add `waitForSelector` if the element appears late.'],
  ['ENOTHTML', '422', 'La cible est une image, un PDF ou un autre fichier, pas une page HTML.', 'Utilisez ce point d’accès sur une page ; `/screenshot` accepte les autres types.', 'The target is an image, a PDF or another file, not an HTML page.', 'Use this endpoint on a page; `/screenshot` accepts other types.'],
  ['ETOOLARGE', '422', 'Le PDF ou le résultat généré dépasse la taille maximale.', 'Réduisez la page : désactivez `printBackground`, ou ciblez une page plus courte.', 'The PDF or the generated output exceeds the maximum size.', 'Make the page smaller: turn `printBackground` off, or target a shorter page.'],
  ['ERATELIMIT', '429', 'Trop de requêtes dans la fenêtre en cours.', 'Attendez le délai de `retry-after`. Mettez vos résultats en cache, ou utilisez une clé.', 'Too many requests in the current window.', 'Wait for the `retry-after` delay. Cache your results, or use a key.'],
  ['EBROWSER', '500', 'Chromium a planté ou n’a pas pu démarrer.', 'Réessayez. Si l’erreur persiste sur votre instance, vérifiez l’installation de Chromium.', 'Chromium crashed or could not start.', 'Retry. If the error persists on your instance, check the Chromium installation.'],
  ['EINTERNAL', '500', 'Erreur inattendue du serveur.', 'Réessayez ; si elle se répète, ouvrez un ticket avec l’en-tête `x-request-id` de la réponse.', 'Unexpected server error.', 'Retry; if it happens again, open an issue with the `x-request-id` header of the response.'],
  ['EUNREACHABLE', '502', 'Le site cible ne répond pas : nom introuvable, connexion refusée, erreur TLS.', 'Vérifiez l’adresse dans un navigateur. Le site peut être en panne ou bloquer les robots.', 'The target site does not answer: unknown name, refused connection, TLS error.', 'Check the address in a browser. The site may be down or blocking bots.'],
  ['ETARGETSTATUS', '502', 'Le site cible a répondu par une erreur HTTP (404, 403, 500…).', 'Le message donne le statut. Vérifiez que la page existe et qu’elle est publique.', 'The target site answered with an HTTP error (404, 403, 500…).', 'The message gives the status. Check that the page exists and is public.'],
  ['EBUSY', '503', 'Trop de rendus en attente sur l’instance.', 'Réessayez après quelques secondes, avec un délai croissant.', 'Too many renders are queued on the instance.', 'Retry after a few seconds, with an increasing delay.'],
  ['ETIMEOUT', '504', 'Le site cible n’a pas répondu à temps.', 'Réessayez. Pour une page lente, `render=never` évite le navigateur.', 'The target site did not answer in time.', 'Retry. For a slow page, `render=never` avoids the browser.'],
];

const errors: Guide = {
  id: 'errors',
  title: l('Codes d’erreur', 'Error codes'),
  nav: l('Codes d’erreur', 'Error codes'),
  description: l(
    'Tous les codes d’erreur de l’API Omnillink, avec leur statut HTTP, leur cause probable et la correction à apporter.',
    'Every error code of the Omnillink API, with its HTTP status, its likely cause and how to fix it.',
  ),
  lead: l(
    'Toute erreur a la même forme JSON, y compris sur les points d’accès qui renvoient une image ou un PDF.',
    'Every error has the same JSON shape, including on the endpoints that return an image or a PDF.',
  ),
  blocks: [
    code('json', 'Réponse', 'Response', JSON.stringify({ status: 'fail', code: 'EFORBIDDENURL', message: 'Destination is not allowed' }, null, 2)),
    ul(
      l('`status` vaut `fail` quand la requête est en cause (4xx), `error` quand le serveur ou la cible est en cause (5xx).', '`status` is `fail` when the request is at fault (4xx), `error` when the server or the target is at fault (5xx).'),
      l('`code` est stable : c’est lui que votre code doit tester.', '`code` is stable: it is what your code should test.'),
      l('`message` est en anglais, destiné aux humains, et peut évoluer.', '`message` is in English, meant for humans, and may change.'),
    ),
    h2('codes', 'Causes et corrections', 'Causes and fixes'),
    table(
      [l('Code', 'Code'), same('HTTP'), l('Cause probable', 'Likely cause'), l('Que faire', 'What to do')],
      ERROR_ROWS.map(([name, http, causeFr, fixFr, causeEn, fixEn]) => [same(`\`${name}\``), same(http), l(causeFr, causeEn), l(fixFr, fixEn)]),
    ),
    h2('retry', 'Quand réessayer', 'When to retry'),
    ul(
      l('Réessayez `EBUSY`, `ETIMEOUT`, `EUNREACHABLE`, `EBROWSER` et `EINTERNAL`, avec un délai croissant.', 'Retry `EBUSY`, `ETIMEOUT`, `EUNREACHABLE`, `EBROWSER` and `EINTERNAL`, with an increasing delay.'),
      l('Réessayez `ERATELIMIT` après le délai de l’en-tête `retry-after`.', 'Retry `ERATELIMIT` after the delay given by the `retry-after` header.'),
      l('Ne réessayez pas les autres codes 4xx : la même requête donnera la même erreur.', 'Do not retry the other 4xx codes: the same request will give the same error.'),
    ),
  ],
};

const limits: Guide = {
  id: 'limits',
  title: l('Limites et quotas', 'Limits and quotas'),
  nav: l('Limites et quotas', 'Limits and quotas'),
  description: l(
    'Débits, tailles et durées appliqués par l’API Omnillink, avec les valeurs par défaut et les variables qui les règlent.',
    'Rates, sizes and durations applied by the Omnillink API, with the defaults and the variables that set them.',
  ),
  lead: l(
    'Ce sont les valeurs par défaut du logiciel. L’exploitant d’une instance peut en changer certaines ; elles sont alors indiquées avec leur variable.',
    'These are the defaults of the software. The operator of an instance can change some of them; those are listed with their variable.',
  ),
  blocks: [
    h2('rate', 'Débit', 'Request rate'),
    table(
      [l('Limite', 'Limit'), l('Défaut', 'Default'), l('Réglage', 'Setting')],
      [
        [l('Requêtes par minute, sans clé (par adresse IP)', 'Requests per minute, without a key (per IP address)'), same('60'), same('`RATE_LIMIT_MAX`')],
        [l('Requêtes par minute, avec une clé (par clé)', 'Requests per minute, with a key (per key)'), same('600'), same('`RATE_LIMIT_KEY_MAX`')],
        [l('Adresses par appel à `/meta/batch`', 'Addresses per `/meta/batch` call'), same('10'), same('–')],
      ],
    ),
    p(
      'Les en-têtes `x-ratelimit-limit`, `x-ratelimit-remaining` et `x-ratelimit-reset` accompagnent chaque réponse. Le [bac à sable](/playground) affiche le quota restant après chaque appel.',
      'The `x-ratelimit-limit`, `x-ratelimit-remaining` and `x-ratelimit-reset` headers come with every response. The [playground](/playground) shows the remaining quota after each call.',
    ),
    h2('sizes', 'Tailles', 'Sizes'),
    table(
      [l('Limite', 'Limit'), l('Valeur', 'Value'), l('Réglage', 'Setting')],
      [
        [l('Longueur de `url`', 'Length of `url`'), l('2 048 caractères', '2,048 characters'), same('–')],
        [l('Corps d’une page lue en HTTP', 'Body of a page read over HTTP'), l('5 Mo', '5 MB'), same('`HTTP_MAX_BODY_BYTES`')],
        [l('Hauteur d’une capture pleine page', 'Height of a full-page screenshot'), same('12 000 px'), same('–')],
        [l('Fenêtre de capture', 'Screenshot viewport'), l('320 à 2560 px de large, 240 à 2160 px de haut', '320 to 2560 px wide, 240 to 2160 px high'), same('–')],
        [l('Pages d’un PDF', 'Pages of a PDF'), same('100'), same('–')],
        [l('Poids d’un PDF', 'Size of a PDF'), l('10 Mo (4 Mo en serverless)', '10 MB (4 MB on serverless)'), same('`PDF_MAX_BYTES`')],
        [l('Champs d’une extraction', 'Fields of an extraction'), l('20 champs, 100 valeurs par champ, 10 000 caractères par valeur', '20 fields, 100 values per field, 10,000 characters per value'), same('–')],
        [l('Texte de `/content`', 'Text of `/content`'), l('500 000 caractères, 500 liens, 200 images', '500,000 characters, 500 links, 200 images'), same('–')],
      ],
    ),
    h2('durations', 'Durées', 'Durations'),
    table(
      [l('Limite', 'Limit'), l('Défaut', 'Default'), l('Réglage', 'Setting')],
      [
        [l('Lecture HTTP', 'HTTP read'), same('10 s'), same('`HTTP_TIMEOUT_MS`')],
        [l('Navigation dans Chromium', 'Navigation in Chromium'), same('20 s'), same('`BROWSER_NAVIGATION_TIMEOUT_MS`')],
        [l('Requête entière', 'Whole request'), same('55 s'), same('`REQUEST_DEADLINE_MS`')],
        [l('Attente `waitFor`', '`waitFor` wait'), l('0 à 10 000 ms', '0 to 10,000 ms'), same('–')],
        [l('Redirections suivies', 'Redirects followed'), same('5'), same('`HTTP_MAX_REDIRECTS`')],
        [l('Durée de cache', 'Cache lifetime'), l('1 h ; `ttl` de 60 à 86 400 s', '1 h; `ttl` from 60 to 86,400 s'), same('`CACHE_*_TTL_SECONDS`')],
      ],
    ),
  ],
};

const security: Guide = {
  id: 'security',
  title: l('Sécurité', 'Security'),
  nav: l('Sécurité', 'Security'),
  description: l(
    'Le modèle de menace d’Omnillink : protection contre les attaques SSRF, ce qui est couvert, ce qui ne l’est pas, et comment signaler une faille.',
    'The threat model of Omnillink: protection against SSRF attacks, what is covered, what is not, and how to report a vulnerability.',
  ),
  lead: l(
    'Une API qui visite des adresses fournies par ses utilisateurs est une cible classique. Voici ce que le logiciel fait, et ce qu’il ne fait pas.',
    'An API that visits addresses supplied by its users is a classic target. Here is what the software does, and what it does not do.',
  ),
  blocks: [
    h2('threat', 'La menace : SSRF', 'The threat: SSRF'),
    p(
      'Dans une attaque SSRF, quelqu’un demande au serveur de lire une adresse qu’il ne peut pas atteindre lui-même : un service interne, l’interface d’administration d’un routeur, ou le service de métadonnées d’un hébergeur cloud.',
      'In an SSRF attack, someone asks the server to read an address they cannot reach themselves: an internal service, the admin interface of a router, or the metadata service of a cloud host.',
    ),
    h2('covered', 'Ce qui est couvert', 'What is covered'),
    ul(
      l('Seuls `http` et `https` sont acceptés, sans identifiants dans l’adresse, sur une liste de ports autorisés (80 et 443 par défaut).', 'Only `http` and `https` are accepted, without credentials in the address, on a list of allowed ports (80 and 443 by default).'),
      l('`localhost`, les noms internes et toute adresse non routable publiquement sont refusés : plages privées, bouclage, lien local dont `169.254.169.254`, CGNAT, IPv6 ULA, adresses IPv4 mappées.', '`localhost`, internal names and any address that is not publicly routable are refused: private ranges, loopback, link-local including `169.254.169.254`, CGNAT, IPv6 ULA, IPv4-mapped addresses.'),
      l('Les notations inhabituelles, comme `0x7f.1` ou `2130706433`, sont normalisées avant le contrôle.', 'Unusual notations, such as `0x7f.1` or `2130706433`, are normalised before the check.'),
      l('Un seul enregistrement DNS privé suffit à refuser un nom d’hôte.', 'A single private DNS record is enough to refuse a host name.'),
      l('En HTTP, la résolution DNS validée est épinglée à la connexion, et chaque redirection est revalidée.', 'Over HTTP, the validated DNS resolution is pinned to the connection, and every redirect is validated again.'),
      l('Dans le navigateur, chaque requête est interceptée et validée, sous-ressources, redirections et iframes comprises. WebSockets et service workers sont coupés.', 'In the browser, every request is intercepted and validated, including sub-resources, redirects and iframes. WebSockets and service workers are cut off.'),
    ),
    h2('not-covered', 'Ce qui ne l’est pas', 'What is not covered'),
    ul(
      l('Le contenu des pages lues n’est pas filtré : traitez toute réponse comme une donnée non fiable, et ne l’injectez jamais telle quelle dans du HTML.', 'The content of the pages read is not filtered: treat every answer as untrusted data, and never inject it as is into HTML.'),
      l('L’API ne vérifie pas que vous avez le droit de lire, copier ou conserver une page. Cette responsabilité est la vôtre.', 'The API does not check that you are allowed to read, copy or keep a page. That responsibility is yours.'),
      l('Les limites connues et leur état sont décrits dans le [README du dépôt](https://github.com/kayzen-lyon/linkforge#readme) et dans `SECURITY.md`.', 'Known limits and their status are described in the [repository README](https://github.com/kayzen-lyon/linkforge#readme) and in `SECURITY.md`.'),
    ),
    h2('site', 'Ce site', 'This site'),
    ul(
      l('Il ne charge aucun script tiers et ne dépose aucun cookie.', 'It loads no third-party script and sets no cookies.'),
      l('Les réponses de l’API n’y sont jamais interprétées comme du HTML : elles sont affichées comme du texte.', 'API answers are never interpreted as HTML here: they are displayed as text.'),
      l('La clé d’API saisie dans le bac à sable reste en mémoire dans l’onglet ; elle n’est ni enregistrée ni ajoutée aux liens de partage.', 'The API key typed in the playground stays in memory in the tab; it is neither saved nor added to share links.'),
    ),
    h2('report', 'Signaler une faille', 'Reporting a vulnerability'),
    p(
      'Écrivez à [contact@kayzen-lyon.fr](mailto:contact@kayzen-lyon.fr) plutôt que d’ouvrir un ticket public. Le fichier [/.well-known/security.txt](/.well-known/security.txt) reprend ce contact.',
      'Write to [contact@kayzen-lyon.fr](mailto:contact@kayzen-lyon.fr) rather than opening a public issue. The [/.well-known/security.txt](/.well-known/security.txt) file gives the same contact.',
    ),
  ],
};

const glossary: Guide = {
  id: 'glossary',
  title: l('Glossaire', 'Glossary'),
  nav: l('Glossaire', 'Glossary'),
  description: l(
    'Les termes employés dans la documentation d’Omnillink : Open Graph, JSON-LD, oEmbed, SSRF, rendu, navigateur sans interface, TTL.',
    'The terms used in the Omnillink documentation: Open Graph, JSON-LD, oEmbed, SSRF, rendering, headless browser, TTL.',
  ),
  lead: l('Les termes de cette documentation, en quelques mots.', 'The terms of this documentation, in a few words.'),
  blocks: [
    terms(
      [same('Open Graph'), l('Balises `og:*` qu’une page déclare pour décrire son titre, son image et son résumé lors d’un partage.', '`og:*` tags a page declares to describe its title, image and summary when it is shared.')],
      [same('Twitter Cards'), l('Balises `twitter:*`, équivalent propre au réseau X des balises Open Graph.', '`twitter:*` tags, the equivalent of Open Graph tags for the X network.')],
      [same('JSON-LD'), l('Bloc de données structurées, en JSON, qui décrit le contenu d’une page selon le vocabulaire schema.org.', 'A block of structured data, in JSON, that describes the content of a page with the schema.org vocabulary.')],
      [same('oEmbed'), l('Format par lequel un site indique comment intégrer l’un de ses contenus : un lecteur vidéo, par exemple.', 'A format through which a site says how to embed one of its contents: a video player, for example.')],
      [l('Aperçu de lien', 'Link preview'), l('Carte affichée à la place d’une adresse : titre, description, image et nom du site.', 'A card shown in place of an address: title, description, image and site name.')],
      [l('URL canonique', 'Canonical URL'), l('Adresse qu’une page désigne comme sa version de référence.', 'The address a page names as its reference version.')],
      [same('SSRF'), l('Server-Side Request Forgery : attaque qui pousse un serveur à lire une adresse interne à la place de l’attaquant.', 'Server-Side Request Forgery: an attack that makes a server read an internal address on behalf of the attacker.')],
      [l('Rebinding DNS', 'DNS rebinding'), l('Attaque où un nom de domaine répond d’abord par une adresse publique, puis par une adresse interne.', 'An attack where a domain name first answers with a public address, then with an internal one.')],
      [l('Navigateur sans interface', 'Headless browser'), l('Navigateur piloté par un programme, sans fenêtre. Omnillink utilise Chromium.', 'A browser driven by a program, without a window. Omnillink uses Chromium.')],
      [l('Rendu', 'Rendering'), l('Exécution du JavaScript d’une page dans un navigateur, pour obtenir le contenu qu’un visiteur verrait.', 'Running the JavaScript of a page in a browser, to get the content a visitor would see.')],
      [l('Application monopage', 'Single-page app'), l('Site dont le HTML initial est presque vide et dont le contenu est construit par JavaScript.', 'A site whose initial HTML is almost empty and whose content is built by JavaScript.')],
      [same('TTL'), l('Time To Live : durée pendant laquelle un résultat reste en cache.', 'Time To Live: how long a result stays in the cache.')],
      [l('Déduplication', 'De-duplication'), l('Regroupement de requêtes identiques simultanées en un seul traitement.', 'Grouping identical simultaneous requests into a single run.')],
      [same('OpenAPI'), l('Format de description d’une API HTTP, lisible par des outils qui en génèrent des clients ou de la documentation.', 'A format that describes an HTTP API, readable by tools that generate clients or documentation from it.')],
      [l('Sélecteur CSS', 'CSS selector'), l('Expression qui désigne des éléments d’une page, comme `.price` ou `article h1`.', 'An expression that designates elements of a page, such as `.price` or `article h1`.')],
    ),
  ],
};

export const GUIDE_LIST: readonly Guide[] = [quickstart, selfHosting, sdk, aiAgents, recipes, errors, limits, security, glossary];
