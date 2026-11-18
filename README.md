# LinkForge

API open-source d'intelligence de liens : métadonnées riches, captures d'écran et aperçus de liens, via une API REST simple.

> Nom de travail. Avant toute publication, vérifiez la disponibilité du nom (npm, GitHub, domaine, marques).

## Démarrage rapide

Prérequis : Node.js ≥ 22.

```bash
npm install
```

```bash
npx playwright-core install chromium
```

```bash
cp .env.example .env
```

```bash
npm run dev
```

L'API écoute sur `http://localhost:3000`. Le playground (optionnel) se lance dans un second terminal :

```bash
npm run dev:web
```

## API

Toutes les routes sont en `GET` sous `/api/v1`. Les réponses JSON ont l'enveloppe `{ "status": "success", "data": …, "meta": { "cached", "source", "durationMs" } }` ; `/screenshot` et `/pdf` renvoient directement le fichier.

En-têtes communs :

| En-tête | Sens | Description |
| --- | --- | --- |
| `x-api-key` | requête | Clé d'API, facultative (voir [Clés d'API et quotas](#clés-dapi-et-quotas)) |
| `x-request-id` | requête / réponse | Identifiant de la requête, présent sur **toutes** les réponses. Celui du client est repris s'il est bien formé (`[A-Za-z0-9_.:-]`, 128 caractères au plus), sinon un UUID est généré |
| `x-cache` | réponse | `HIT` si la réponse vient du cache serveur, `MISS` sinon |
| `cache-control` | réponse | `public, max-age=<ttl>, s-maxage=<ttl>` sur les réponses cachables |

Paramètres communs aux routes cachables (`/meta`, `/screenshot`, `/pdf`, `/extract`, `/content`) :

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `url` | string | — | URL absolue `http(s)` (obligatoire) |
| `force` | boolean | `false` | Ignore le cache en lecture (le résultat frais est tout de même mis en cache) |
| `ttl` | 60–86400 | config serveur | Durée de vie en secondes de cette réponse : entrée du cache serveur et `Cache-Control` |

Un paramètre inconnu est refusé (`400 EINVALIDPARAMS`).

### `GET /api/v1/meta`

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `render` | `auto` \| `never` \| `always` | `auto` | `auto` : HTTP brut, puis navigateur seulement si le résultat est pauvre |
| `embed` | chemin pointé | — | Renvoie une seule valeur de `data` au lieu de l'enveloppe (voir ci-dessous) |

```bash
curl "http://localhost:3000/api/v1/meta?url=https://github.com"
```

```jsonc
{
  "status": "success",
  "data": {
    "url": "https://…",          // URL finale après redirections
    "canonicalUrl": "https://…",
    "title": "…",
    "description": "…",
    "author": "…",
    "publisher": "…",
    "lang": "en",
    "date": "2025-03-04T09:00:00.000Z",
    "image": { "url": "…", "width": 1200, "height": 630, "type": null, "alt": "…" },
    "images": [ /* toutes les images OG / Twitter / JSON-LD */ ],
    "favicon": "https://…",
    "logo": { "url": "https://…" },   // logo JSON-LD, sinon la plus grande icône déclarée ; null sinon
    "video": { "url": "…", "type": "video/mp4", "width": 1280, "height": 720 },  // ou null
    "audio": { "url": "…", "type": "audio/mpeg" },                               // ou null
    "keywords": ["…"],
    "feeds": [ { "url": "…", "title": "…", "type": "application/rss+xml" } ],
    "jsonLd": [ /* blocs JSON-LD, @graph aplati */ ],
    "contentType": "text/html"
  },
  "meta": { "cached": false, "source": "http", "durationMs": 132 }
}
```

- `logo` : `logo` JSON-LD (du nœud ou de son `publisher`), sinon la plus grande icône déclarée par la page. `null` si la page n'en déclare aucune (contrairement à `favicon`, qui retombe sur `/favicon.ico`).
- `video` : `og:video*`, sinon `twitter:player` (`type` vaut alors `text/html` : c'est un lecteur à intégrer), sinon `VideoObject` JSON-LD.
- `audio` : `og:audio*`.
- `keywords` : `<meta name="keywords">`, `news_keywords`, `article:tag` et `keywords` JSON-LD, dédoublonnés (50 au plus).
- `feeds` : flux RSS, Atom et JSON Feed annoncés par `<link rel="alternate">` (20 au plus).

#### `embed`

`embed` est un chemin pointé dans `data` : `image.url`, `logo.url`, `favicon`, `title`, `images.0.url`… La réponse dépend de la valeur trouvée :

| Valeur | Réponse |
| --- | --- |
| URL `http(s)` | `302` vers cette URL — la route s'utilise donc comme un `<img src>` |
| chaîne, nombre, booléen | `200` en `text/plain` |
| objet ou tableau | `200`, le JSON brut (sans enveloppe) |
| absente ou `null` | `404 EEMBEDNOTFOUND` |

```html
<img src="http://localhost:3000/api/v1/meta?url=https://github.com&embed=image.url">
```

### `GET /api/v1/screenshot`

Renvoie directement l'image (utilisable dans un `<img src>`).

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `device` | `desktop` \| `mobile` | `desktop` | 1280×800, ou profil Pixel 7 |
| `width` | 320–2560 | celui du `device` | Largeur du viewport en pixels CSS |
| `height` | 240–2160 | celui du `device` | Hauteur du viewport en pixels CSS |
| `fullPage` | boolean | `false` | Page entière (plafonnée à 12 000 px de haut). Ignoré avec `selector` |
| `selector` | sélecteur CSS | — | Capture uniquement le premier élément correspondant (300 caractères au plus) |
| `hide` | sélecteurs CSS séparés par des virgules | — | Éléments masqués avant la capture (bandeaux cookies, publicités) : 20 sélecteurs de 200 caractères au plus |
| `waitFor` | 0–10000 | `0` | Attente supplémentaire avant la capture, en millisecondes |
| `colorScheme` | `light` \| `dark` | — | Émule `prefers-color-scheme` |
| `format` | `png` \| `jpeg` | `png` | |
| `quality` | 1–100 | `80` | JPEG uniquement |

```bash
curl -o shot.png "http://localhost:3000/api/v1/screenshot?url=https://github.com&device=mobile"
```

```bash
curl -o hero.png "http://localhost:3000/api/v1/screenshot?url=https://github.com&width=1440&height=900&colorScheme=dark&selector=main&hide=.cookie-banner,%23ads"
```

- `width` / `height` ne remplacent que la taille : avec `device=mobile`, l'agent utilisateur, la densité de pixels et le tactile du profil sont conservés.
- `selector` : seul le CSS est accepté (`xpath=…` ou `text=…` → `400 EINVALIDPARAMS`). Si aucun élément **visible** ne correspond dans les 3 secondes → `404 ESELECTORNOTFOUND`.
- `hide` : les caractères `{ } ; @ <` et les commentaires CSS sont refusés (`400 EINVALIDPARAMS`). Un sélecteur que le navigateur ne comprend pas est ignoré.
- Tous ces paramètres font partie de la clé de cache.

### `GET /api/v1/pdf`

Renvoie la page imprimée en PDF (`application/pdf`), avec sa feuille de style d'impression.

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `format` | `A4` \| `Letter` | `A4` | Format du papier |
| `landscape` | boolean | `false` | Orientation paysage |
| `printBackground` | boolean | `true` | Imprime les couleurs et images de fond CSS |

```bash
curl -o page.pdf "http://localhost:3000/api/v1/pdf?url=https://example.com&format=Letter&landscape=true"
```

Le document est limité à 100 pages. Au-delà de `PDF_MAX_BYTES` (10 Mo par défaut, 4 Mo en serverless) la réponse est `422 ETOOLARGE`.

### `GET /api/v1/extract`

Extraction sur mesure : vous décrivez les champs, l'API les lit dans la page.

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `fields` | objet JSON encodé | — | Règles d'extraction (obligatoire, voir ci-dessous) |
| `render` | `auto` \| `never` \| `always` | `auto` | `auto` : HTTP brut, puis navigateur si la page exécute des scripts et qu'un champ est resté vide |

`fields` associe un nom de champ à une règle :

| Propriété | Type | Défaut | Description |
| --- | --- | --- | --- |
| `selector` | sélecteur CSS | — | Élément(s) à lire (obligatoire, 300 caractères au plus) |
| `attr` | `text` \| `html` \| nom d'attribut | `text` | Texte visible, HTML interne, ou valeur d'un attribut (`href`, `src`, `data-id`…) |
| `type` | `string` \| `number` \| `url` | `string` | `number` : lit un nombre dans un texte formaté (`$1,299.00`, `1 299,50 €`). `url` : URL absolue, `http(s)` uniquement |
| `all` | boolean | `false` | Renvoie toutes les correspondances (tableau) au lieu de la première |

```bash
curl -G "http://localhost:3000/api/v1/extract" \
  --data-urlencode "url=https://example.com/product" \
  --data-urlencode 'fields={"price":{"selector":".price","attr":"text","type":"number"},"links":{"selector":"a","attr":"href","type":"url","all":true}}'
```

```jsonc
{
  "status": "success",
  "data": {
    "url": "https://example.com/product",
    "fields": { "price": 1299.5, "links": ["https://example.com/a", "https://example.com/b"] }
  },
  "meta": { "cached": false, "source": "http", "durationMs": 87 }
}
```

- Un champ sans correspondance, ou dont la valeur n'est pas convertible, vaut `null` (`[]` avec `all`, où les valeurs inutilisables sont écartées).
- Limites : 20 champs, noms de champ `[A-Za-z0-9_.-]` (64 caractères au plus), 100 éléments par champ `all`, 10 000 caractères par valeur, 8 000 caractères pour `fields`.
- `fields` invalide (JSON, règle, sélecteur, limite) → `400 EINVALIDPARAMS`, avant toute requête sortante. Cible non HTML → `422 ENOTHTML`.

### `GET /api/v1/content`

Contenu lisible d'une page, pour les LLM et les agents : le texte principal sans navigation, barres latérales ni pied de page.

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `render` | `auto` \| `never` \| `always` | `auto` | `auto` : HTTP brut, puis navigateur si la page exécute des scripts et que le contenu statique est quasi vide |

```bash
curl "http://localhost:3000/api/v1/content?url=https://example.com/blog/post"
```

```jsonc
{
  "status": "success",
  "data": {
    "url": "https://…",           // URL finale après redirections
    "title": "…",
    "lang": "fr",
    "excerpt": "…",               // description déclarée, sinon début du texte
    "text": "…",                  // texte brut, un bloc par paragraphe
    "markdown": "# …",            // titres, listes, liens absolus, code, citations, tableaux
    "wordCount": 1240,
    "readingTimeMinutes": 7       // à 200 mots par minute, arrondi au supérieur
  },
  "meta": { "cached": false, "source": "http", "durationMs": 95 }
}
```

Le contenu principal est choisi parmi `<article>`, `<main>`, `[role="main"]` et `[itemprop="articleBody"]` ; à défaut, le bloc dont les paragraphes portent le plus de texte ; à défaut, tout le `<body>`. `text` et `markdown` sont plafonnés à 500 000 caractères chacun. Cible non HTML → `422 ENOTHTML`.

### `GET /api/v1/openapi.json`

Description OpenAPI 3.1 de toutes les routes (paramètres, réponses, format d'erreur). Les paramètres sont dérivés des schémas de validation des routes : le document ne peut pas diverger de l'implémentation.

```bash
curl "http://localhost:3000/api/v1/openapi.json"
```

### `GET /health`

État du service, backend de cache et statistiques du pool de navigateurs. Non soumis au rate limiting.

### Clés d'API et quotas

| Requête | Limite par fenêtre (`RATE_LIMIT_WINDOW_MS`) | Compteur |
| --- | --- | --- |
| Sans `x-api-key` | `RATE_LIMIT_MAX` (60 par défaut) | par adresse IP |
| `x-api-key` valide | `RATE_LIMIT_KEY_MAX` (600 par défaut) | par clé |
| `x-api-key` inconnue | `401 EUNAUTHORIZED` | décomptée de l'adresse IP |

```bash
curl -H "x-api-key: $LINKFORGE_KEY" "http://localhost:3000/api/v1/meta?url=https://github.com"
```

- Les clés acceptées sont listées dans `API_KEYS` (séparées par des virgules, 16 à 256 caractères chacune). Si `API_KEYS` est vide, la fonctionnalité est désactivée et l'en-tête est ignoré.
- La comparaison se fait en temps constant, et une clé erronée consomme le quota anonyme de l'appelant : on ne peut pas deviner une clé sans être limité.
- Les compteurs vivent en mémoire, par instance (y compris avec `REDIS_URL`, qui ne sert qu'au cache).
- Les réponses étant cachables (`s-maxage`), un CDN placé devant l'API peut servir une réponse déjà en cache sans passer par ce contrôle.

### Erreurs

Toutes les erreurs ont la forme `{ "status": "fail" | "error", "code": "…", "message": "…" }`.

| Code | HTTP | Signification |
| --- | --- | --- |
| `EINVALIDPARAMS` | 400 | Paramètres de requête invalides (y compris `fields`, `selector` ou `hide` mal formés) |
| `EINVALIDURL` | 400 | URL mal formée ou schéma non supporté |
| `EUNAUTHORIZED` | 401 | `x-api-key` inconnue |
| `EFORBIDDENURL` | 403 | Destination refusée par la politique anti-SSRF |
| `EEMBEDNOTFOUND` | 404 | `/meta` : le chemin `embed` est absent ou `null` pour cette URL |
| `ESELECTORNOTFOUND` | 404 | `/screenshot` : aucun élément visible ne correspond à `selector` |
| `ENOTHTML` | 422 | `/extract`, `/content` : la cible n'est pas un document HTML |
| `ETOOLARGE` | 422 | `/pdf` : le document généré dépasse la taille maximale |
| `ERATELIMIT` | 429 | Trop de requêtes |
| `EUNREACHABLE` | 502 | Site injoignable (DNS, connexion refusée, TLS…) |
| `ETARGETSTATUS` | 502 | Le site a répondu avec une erreur HTTP |
| `EBUSY` | 503 | Pool de rendu saturé, réessayer |
| `ETIMEOUT` | 504 | Le site n'a pas répondu à temps |
| `EBROWSER` / `EINTERNAL` | 500 | Erreur côté serveur |

## Architecture

```
linkforge/
├── apps/
│   ├── api/                       # Backend Fastify + TypeScript
│   │   ├── src/
│   │   │   ├── server.ts          # Point d'entrée, arrêt gracieux
│   │   │   ├── create-app.ts      # Fabrique Fastify, injection des services, erreurs
│   │   │   ├── config.ts          # Configuration typée (variables d'environnement)
│   │   │   ├── lib/errors.ts      # AppError + codes d'erreur stables
│   │   │   ├── security/
│   │   │   │   ├── ssrf.ts        # Validation d'URL, plages IP, lookup DNS épinglé
│   │   │   │   └── browser-guard.ts  # Interception des requêtes du navigateur
│   │   │   ├── services/
│   │   │   │   ├── fetcher.ts     # Fetch HTTP sûr (redirections revalidées, corps plafonné)
│   │   │   │   ├── meta-extractor.ts # HTML → métadonnées (pur, sans I/O)
│   │   │   │   ├── meta-service.ts   # Cache → HTTP → navigateur
│   │   │   │   ├── screenshot-service.ts
│   │   │   │   ├── renderer.ts    # Navigation Playwright + mapping des erreurs
│   │   │   │   ├── browser-pool.ts   # Pool Chromium (concurrence, file, recyclage)
│   │   │   │   └── cache/         # Interface Cache, LRU mémoire, Redis
│   │   │   └── routes/            # meta, screenshot, health
│   │   ├── test/                  # Vitest (unitaires + bout en bout)
│   │   ├── scripts/embed-playground.mjs  # Intègre le playground au bundle de l'API
│   │   └── vercel.json            # Installation et build sur Vercel
│   └── web/                       # Playground Vite + Tailwind CSS v4
├── ROADMAP.md                     # Feuille de route détaillée
└── PROMPT.md                      # Prompt maître pour faire évoluer le projet avec un agent IA
```

### Flux d'une requête `/meta`

1. Validation syntaxique de l'URL (schéma, identifiants, port, noms internes, IP littérales).
2. Lecture du cache (Redis si `REDIS_URL`, sinon LRU mémoire).
3. Fetch HTTP brut : DNS validé et épinglé à la connexion, chaque redirection revalidée, corps plafonné.
4. Extraction (cheerio). Si le résultat est pauvre ou si la page est une coquille SPA vide → rendu Chromium, puis fusion des deux passes.
5. Écriture en cache. Les requêtes identiques concurrentes sont dédupliquées (*single flight*).

### Sécurité anti-SSRF

- `http`/`https` uniquement, pas d'identifiants dans l'URL, ports en liste blanche (80, 443 par défaut).
- Refus de `localhost`, `*.local`, `*.internal`… et de toute adresse non routable publiquement (RFC 1918, loopback, link-local dont `169.254.169.254`, CGNAT, IPv6 ULA, NAT64, IPv4-mappées…). Les notations exotiques (`0x7f.1`, `2130706433`) sont normalisées avant contrôle.
- Un seul enregistrement DNS privé suffit à refuser l'hôte.
- Fetch brut : le `lookup` de la connexion est gardé, ce qui ferme la fenêtre de *DNS rebinding*.
- Navigateur : chaque requête (sous-ressources, redirections, iframes) est interceptée et validée ; WebSockets et service workers sont coupés.

**Limite connue** : dans le navigateur, Chromium refait sa propre résolution DNS après notre contrôle. Une attaque par *DNS rebinding* reste théoriquement possible sur ce chemin. La correction (proxy validant devant le navigateur) est planifiée — voir `ROADMAP.md`, phase 2.

## Déploiement sur Vercel

Démo en ligne : https://linkforge-skyymar69-9413s-projects.vercel.app

Le projet Vercel a pour dossier racine `apps/api` et le preset Fastify ; `apps/api/vercel.json` définit l'installation et le build.

- Une seule fonction sert tout : l'API Fastify (`apps/api/src/server.ts`) et le playground. Au build, `apps/web` est compilé puis intégré au bundle de l'API par `scripts/embed-playground.mjs`, et servi depuis la mémoire (`routes/playground.ts`).
- Le Chromium de Playwright ne tourne pas dans une fonction serverless. Sur Vercel (détecté par la variable `VERCEL`), le pool lance `@sparticuz/chromium`, un binaire prévu pour cet environnement. Ce binaire s'arrête quand sa dernière page se ferme : chaque rendu y reçoit donc son propre navigateur. Si le binaire n'a pas été embarqué dans la fonction, il est téléchargé au premier rendu (`BROWSER_SERVERLESS_PACK_URL`).
- Les réponses portent `s-maxage` : le CDN de Vercel les met en cache, ce qui évite de relancer une fonction pour une URL déjà demandée.

Limites propres au serverless :

- Sans `REDIS_URL`, le cache applicatif et le rate limiting vivent en mémoire, **par instance**. Pour un cache partagé, ajoutez la variable `REDIS_URL` (n'importe quel Redis accessible par URL) dans les réglages du projet.
- Le premier rendu d'une instance froide est plus lent (décompression de Chromium dans `/tmp`).
- Une fonction a une durée maximale (60 s ici) et une mémoire bornée : les pages très lourdes peuvent échouer.

## Scripts

| Commande | Effet |
| --- | --- |
| `npm run dev` | API en mode watch |
| `npm run dev:web` | Playground (proxy `/api` → `:3000`) |
| `npm run build` | Compile l'API et le playground |
| `npm run typecheck` | Vérification TypeScript stricte |
| `npm test` | Tests Vitest (lance un vrai Chromium) |

## Licence

MIT
