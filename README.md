# Omnillink

API open-source d'intelligence de liens : métadonnées, contenu lisible, extraction typée, captures, PDF, mesures de page, détection de technologies et petits générateurs (QR code, image de partage), via une API REST simple et un point d'entrée MCP pour les agents.


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

Toutes les routes REST sont en `GET` sous `/api/v1`, sauf le lot de métadonnées (`POST /api/v1/meta/batch`). Les agents disposent en plus de `POST /mcp` (Model Context Protocol). Les réponses JSON ont l'enveloppe `{ "status": "success", "data": …, "meta": { "cached", "source", "durationMs" } }` ; `/screenshot`, `/pdf`, `/animation`, `/og` et `/qr` renvoient directement le fichier.

En-têtes communs :

| En-tête | Sens | Description |
| --- | --- | --- |
| `x-api-key` | requête | Clé d'API, facultative (voir [Clés d'API et quotas](#clés-dapi-et-quotas)) |
| `x-request-id` | requête / réponse | Identifiant de la requête, présent sur **toutes** les réponses. Celui du client est repris s'il est bien formé (`[A-Za-z0-9_.:-]`, 128 caractères au plus), sinon un UUID est généré |
| `x-cache` | réponse | `HIT` si la réponse vient du cache serveur, `MISS` sinon |
| `x-render-source` | réponse | `http` ou `browser` : la chaîne qui a produit la réponse (toujours `browser` pour `/screenshot` et `/pdf`) |
| `etag` / `if-none-match` | réponse / requête | Sur les réponses JSON (`/meta`, `/extract`, `/content`, y compris `format=markdown\|text`) : renvoyez l'`ETag` reçu dans `If-None-Match` pour obtenir `304 Not Modified` sans corps. L'`ETag` est calculé sur `data`, pas sur `meta` |
| `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`, `retry-after` | réponse | Quota de la fenêtre courante. Ces en-têtes, comme `x-request-id`, `x-cache`, `x-render-source` et `etag`, sont exposés au code navigateur (CORS `Access-Control-Expose-Headers`) |
| `cache-control` | réponse | `public, max-age=<ttl>, s-maxage=<ttl>` sur les réponses cachables |

Paramètres communs aux routes cachables (`/meta`, `/screenshot`, `/pdf`, `/animation`, `/extract`, `/content`, `/tables`, `/links`, `/html`, `/tech`, `/insights`, `/image`, `/palette`, `/favicon`, `/oembed`, `/sitemap`, `/og`) :

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `url` | string | — | URL absolue `http(s)` (obligatoire) |
| `force` | boolean | `false` | Ignore le cache en lecture (le résultat frais est tout de même mis en cache) |
| `ttl` | 60–86400 | config serveur | Durée de vie en secondes de cette réponse : entrée du cache serveur et `Cache-Control` |

Un paramètre inconnu est ignoré : une URL publique ramasse couramment des paramètres de suivi (`utm_source`, `fbclid`). Un paramètre connu mais invalide reste refusé (`400 EINVALIDPARAMS`).

En-têtes envoyés à la cible — trois seulement, sur `/meta`, `/content`, `/extract`, `/tables`, `/links`, `/html`, `/tech`, `/insights`, `/oembed`, `/favicon`, `/screenshot`, `/pdf` et `/animation` :

| Paramètre | Type | Description |
| --- | --- | --- |
| `acceptLanguage` | string, 200 caractères au plus | `Accept-Language` (`fr-FR,fr;q=0.9`) : dix plages de langue au plus |
| `userAgent` | string, 300 caractères au plus | `User-Agent`, ASCII imprimable uniquement |
| `referer` | URL `http(s)` absolue | `Referer` de la requête du document (le fragment est retiré) |

- Appliqués sur les deux chemins : HTTP brut et navigateur. Ils font partie de la clé de cache.
- **Ni `Cookie` ni `Authorization`**, par conception : les réponses sont mises en cache par URL, côté serveur et par tout CDN placé devant (`s-maxage`). Une page obtenue avec la session d'un appelant serait servie au suivant. Les trois en-têtes acceptés changent ce que le site répond sans identifier personne.
- Toute valeur contenant un retour à la ligne ou un caractère de contrôle est refusée (`400 EINVALIDPARAMS`) : un paramètre ne peut pas ajouter un second en-tête.

Chaque requête dispose d'un budget de temps unique (`REQUEST_DEADLINE_MS`, 55 s par défaut) dont sont dérivés l'attente d'un navigateur, son lancement, la navigation, la stabilisation et la capture. Passé ce budget, l'API répond elle-même `504 ETIMEOUT` en JSON. Une page dont l'événement `load` n'arrive jamais n'est pas un échec : au bout de `BROWSER_NAVIGATION_TIMEOUT_MS`, le chargement est arrêté et la réponse est produite avec ce qui est rendu.

Pages de blocage : si le site répond par un interstitiel anti-robot (« Just a moment… », CAPTCHA, « Access denied »), même en `200`, `/meta`, `/extract` et `/content` réessaient dans le navigateur, puis répondent `502 EBLOCKED` si le blocage persiste. Rien n'est alors mis en cache. `/screenshot` et `/pdf` ne font pas cette détection : ils rendent ce que le site affiche.

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
    "dateModified": "2025-03-05T10:30:00.000Z",
    "type": "article",                // og:type, sinon le @type JSON-LD principal
    "themeColor": "#0d1117",
    "robots": "index, follow",        // <meta name="robots">, tel que déclaré
    "oembed": "https://…/oembed?format=json&url=…",
    "alternates": [ { "lang": "fr-FR", "url": "https://…/fr" } ],   // hreflang
    "twitter": { "card": "summary_large_image", "site": "@github" },
    "paywalled": false,               // true / false / null (JSON-LD isAccessibleForFree)
    "domain": "github.com",           // hôte de `url`, sans « www. »
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

- `lang` est normalisé en BCP 47 (`en_US` → `en-US`). `date` et `dateModified` n'acceptent qu'une date portant une année explicite ou un *epoch* (secondes ou millisecondes) : `"12"` ou `"May 5"` donnent `null`.
- `twitter` est toujours un objet ; `card` et `site` valent `null` s'ils ne sont pas déclarés. `alternates` : 50 entrées au plus.
- Quand plusieurs blocs JSON-LD sont présents, les champs (`title`, `description`, `author`, dates…) sont lus dans le nœud qui décrit la page (`Article`, `Product`…) avant ceux du site (`Organization`, `WebSite`).
- Si l'URL pointe directement sur une image, `image.url` vaut cette URL (et `image.type` son type MIME) : `embed=image.url` fonctionne donc aussi.
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

### `POST /api/v1/meta/batch`

Métadonnées de plusieurs URL en un appel, en HTTP brut uniquement (l'équivalent de `render=never` : jamais de navigateur).

Corps JSON :

| Propriété | Type | Défaut | Description |
| --- | --- | --- | --- |
| `urls` | string[] | — | 1 à 10 URL absolues `http(s)` (obligatoire) |
| `force` | boolean | `false` | Ignore le cache en lecture |
| `ttl` | 60–86400 | config serveur | Durée de vie des entrées de cache écrites |

```bash
curl -X POST "http://localhost:3000/api/v1/meta/batch" \
  -H "content-type: application/json" \
  -d '{"urls":["https://github.com","https://example.com/404"]}'
```

```jsonc
{
  "status": "success",
  "data": [
    { "url": "https://github.com", "status": "success", "data": { /* comme /meta */ }, "cached": false },
    { "url": "https://example.com/404", "status": "error", "code": "ETARGETSTATUS", "message": "…" }
  ],
  "meta": { "succeeded": 1, "failed": 1, "durationMs": 412 }
}
```

- Un élément par URL, dans l'ordre d'entrée ; `url` est l'URL telle qu'elle a été soumise. Une URL en échec donne un élément d'erreur (`status` `fail` ou `error`, `code`, `message`, mêmes codes que `/meta`) et ne fait jamais échouer le lot : la réponse est `200` dès que le corps est valide.
- Chaque URL passe par la même validation et les mêmes contrôles anti-SSRF que `GET /meta`, et lit/alimente le même cache serveur.
- La réponse porte `Cache-Control: no-store`. Quota : un dixième de la limite normale de l'appelant, compté à part (6 lots par minute sans clé, 60 avec, par défaut).

### `GET /api/v1/screenshot`

Renvoie directement l'image (utilisable dans un `<img src>`).

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `device` | `desktop` \| `mobile` | `desktop` | 1280×800, ou profil Pixel 7 |
| `width` | 320–2560 | celui du `device` | Largeur du viewport en pixels CSS |
| `height` | 240–2160 | celui du `device` | Hauteur du viewport en pixels CSS |
| `fullPage` | boolean | `false` | Page entière (plafonnée à 12 000 px de haut), après un défilement complet qui déclenche le chargement paresseux. Ignoré avec `selector` |
| `selector` | sélecteur CSS | — | Capture uniquement le premier élément correspondant (300 caractères au plus) |
| `hide` | sélecteurs CSS séparés par des virgules | — | Éléments masqués avant la capture (bandeaux cookies, publicités) : 20 sélecteurs de 200 caractères au plus |
| `hideBanners` | boolean | `true` | Masque les bandeaux cookies / consentement courants avec une feuille de style intégrée. Rien n'est cliqué, aucun consentement n'est donné |
| `blockAds` | boolean | `false` | Abandonne les requêtes vers une courte liste intégrée d'hôtes publicitaires et de suivi. Ce n'est pas un bloqueur de publicité complet |
| `waitForSelector` | sélecteur CSS | — | Attend que cet élément soit présent dans le DOM avant la capture (10 s au plus, 300 caractères au plus) |
| `click` | sélecteur CSS | — | Clique un élément avant la capture (ouvrir un onglet, déplier une section). Un vrai clic sur le premier élément visible |
| `scrollTo` | sélecteur CSS | — | Fait défiler jusqu'à cet élément avant la capture |
| `waitFor` | 0–10000 | `0` | Attente supplémentaire avant la capture, en millisecondes |
| `colorScheme` | `light` \| `dark` | — | Émule `prefers-color-scheme` |
| `frame` | `none` \| `browser` \| `phone` | `none` | Cadre dessiné autour de la capture : fenêtre de navigateur ou téléphone |
| `radius` | 0–64 | `0` | Rayon des coins de la capture, en pixels |
| `padding` | 0–200 | `0` | Marge autour de la capture, en pixels, remplie par `background` |
| `background` | couleur hexadécimale | `ffffff` | Couleur derrière la capture (`RGB`, `RRGGBB`, `RRGGBBAA`, avec ou sans `#`) ; `00000000` = transparent (PNG) |
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
- `waitForSelector` (aussi sur `/pdf`, `/extract`, `/content`) : CSS uniquement, mêmes refus que `selector`. Élément absent à l'échéance → `404 ESELECTORNOTFOUND`.
- Avant la capture, l'API attend les polices et le décodage des images visibles (2,5 s au plus).
- `hide` : les caractères `{ } ; @ <` et les commentaires CSS sont refusés (`400 EINVALIDPARAMS`). Un sélecteur que le navigateur ne comprend pas est ignoré.
- `click`, `scrollTo` : CSS uniquement, mêmes refus que `selector`. Élément absent, masqué ou non cliquable dans les 3 secondes → `404 ESELECTORNOTFOUND`. Ordre des étapes : masquage (`hideBanners`, `hide`), `click`, `scrollTo`, `waitFor`, capture. `hideBanners` ne clique jamais rien ; `click` est une action explicite de l'appelant, sur un seul élément.
- `frame`, `radius`, `padding` : la capture terminée est recomposée dans un document généré par l'API, rendu hors ligne (aucune requête réseau, scripts désactivés). Indisponibles avec `fullPage` (`400`). Avec `frame`, une marge d'au moins 24 px est ajoutée pour l'ombre.
- Une URL qui déclenche un téléchargement de fichier → `422 ENOTHTML` : rien n'est écrit sur le disque.
- Tous ces paramètres font partie de la clé de cache.

### `GET /api/v1/pdf`

Renvoie la page imprimée en PDF (`application/pdf`), avec sa feuille de style d'impression.

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `format` | `A4` \| `Letter` | `A4` | Format du papier |
| `landscape` | boolean | `false` | Orientation paysage |
| `printBackground` | boolean | `true` | Imprime les couleurs et images de fond CSS |
| `hideBanners` | boolean | `false` | Masque les bandeaux cookies / consentement courants avant l'impression |
| `blockAds` | boolean | `false` | Abandonne les requêtes vers les hôtes publicitaires et de suivi connus |
| `waitForSelector` | sélecteur CSS | — | Attend cet élément avant l'impression (voir `/screenshot`) |
| `margin` | 0–50 | marges `@page` de la page | Marge de chaque côté, en millimètres |
| `scale` | 0.1–2 | `1` | Échelle du rendu |
| `pageRanges` | `1-3,5` | toutes | Pages à garder (pages 1 à 100, 10 plages au plus) |
| `headerText` | texte, 200 caractères au plus | — | Texte imprimé en haut de chaque page |
| `footerText` | texte, 200 caractères au plus | — | Texte imprimé en bas de chaque page, par exemple `Page {page} / {pages}` |

```bash
curl -o page.pdf "http://localhost:3000/api/v1/pdf?url=https://example.com&format=Letter&landscape=true"
```

La page est défilée une fois avant l'impression pour charger le contenu paresseux. Le document est limité à 100 pages. Au-delà de `PDF_MAX_BYTES` (10 Mo par défaut, 4 Mo en serverless) la réponse est `422 ETOOLARGE`.

- `headerText` / `footerText` sont du **texte** : ils sont échappés, aucun HTML n'est accepté. Cinq jetons sont remplacés : `{page}`, `{pages}`, `{title}`, `{url}`, `{date}`. Un en-tête ou un pied de page impose une marge haute ou basse d'au moins 12 mm.
- `pageRanges` invalide (ordre, page 0, au-delà de 100) → `400 EINVALIDPARAMS`.

### `GET /api/v1/extract`

Extraction sur mesure (`fields` : vous décrivez les champs) ou par modèle (`preset` : champs typés d'un article, d'un produit, d'une recette ou d'un événement). Exactement l'un des deux est requis.

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `fields` | objet JSON encodé | — | Règles d'extraction (voir ci-dessous) |
| `preset` | `article` \| `product` \| `recipe` \| `event` | — | Champs typés lus dans ce que la page déclare (voir [Modèles](#modèles-preset)) |
| `render` | `auto` \| `never` \| `always` | `auto` | `auto` : HTTP brut, puis navigateur si la page exécute des scripts et qu'un champ est resté vide |
| `waitForSelector` | sélecteur CSS | — | Attend cet élément avant de lire la page. Impose le navigateur : refusé avec `render=never` (`400`) |

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

#### Modèles (`preset`)

```bash
curl "http://localhost:3000/api/v1/extract?url=https://example.com/product&preset=product"
```

```jsonc
{
  "status": "success",
  "data": {
    "url": "https://example.com/product",
    "preset": "product",
    "schemaType": "Product",          // type schema.org trouvé, null si la page n'en déclare pas
    "fields": { "name": "…", "price": 64, "currency": "EUR", "availability": "InStock", "ratingValue": 4.7 /* … */ },
    "sources": { "name": "json-ld", "price": "json-ld", "currency": "json-ld" /* … */ }
  },
  "meta": { "cached": false, "source": "http", "durationMs": 87 }
}
```

| Modèle | Champs |
| --- | --- |
| `article` | `headline`, `description`, `author`, `authorUrl`, `publisher`, `datePublished`, `dateModified`, `image`, `section`, `keywords[]`, `language`, `wordCount`, `url` |
| `product` | `name`, `description`, `brand`, `sku`, `gtin`, `image`, `price` (nombre), `currency`, `availability`, `condition`, `ratingValue`, `reviewCount`, `seller`, `url` |
| `recipe` | `name`, `description`, `author`, `image`, `datePublished`, `prepMinutes`, `cookMinutes`, `totalMinutes`, `yield`, `category`, `cuisine`, `calories`, `ingredients[]`, `instructions[]`, `keywords[]`, `ratingValue`, `ratingCount` |
| `event` | `name`, `description`, `startDate`, `endDate`, `status`, `attendanceMode`, `locationName`, `address`, `image`, `organizer`, `performers[]`, `price`, `currency`, `availability`, `url` |

- Chaque champ est cherché dans l'ordre : schema.org en JSON-LD, schema.org en microdonnées, Open Graph, balises `<meta>`, puis quelques sélecteurs CSS de repli. `sources` dit d'où vient chaque valeur (`json-ld`, `microdata`, `opengraph`, `meta`, `css`) : un prix déclaré se distingue d'un prix lu dans un élément `.price`. Un champ introuvable vaut `null`, sa source aussi.
- Valeurs typées : dates en ISO 8601, prix et notes en nombres, durées de recette en minutes, énumérations schema.org sans leur préfixe (`InStock`, `EventScheduled`), URL absolues `http(s)` uniquement. Listes plafonnées à 100 éléments.
- Avec `render=auto`, le navigateur est utilisé si la page exécute des scripts et qu'un champ clé manque (titre et date d'un article, nom et prix d'un produit, nom et ingrédients d'une recette, nom et date d'un événement).

### `GET /api/v1/content`

Contenu lisible d'une page, pour les LLM et les agents : le texte principal sans navigation, barres latérales ni pied de page.

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `render` | `auto` \| `never` \| `always` | `auto` | `auto` : HTTP brut, puis navigateur si la page exécute des scripts et que le contenu statique est quasi vide |
| `format` | `json` \| `markdown` \| `text` | `json` | `markdown` / `text` : le corps seul, en `text/markdown` ou `text/plain`, sans enveloppe |
| `mainContent` | boolean | `true` | `false` : tout le `<body>` (hors scripts et styles) au lieu du contenu principal |
| `include` | sélecteurs CSS séparés par des virgules | — | Ne garde que ces éléments, dans l'ordre du document ; remplace la détection du contenu principal. 20 sélecteurs de 200 caractères au plus |
| `exclude` | sélecteurs CSS séparés par des virgules | — | Retire ces éléments avant l'extraction. Mêmes limites |
| `citations` | boolean | `false` | Liens en style référence dans `markdown` : `[texte][1]` dans le texte, les URL numérotées à la fin |
| `waitForSelector` | sélecteur CSS | — | Attend cet élément avant de lire la page. Impose le navigateur : refusé avec `render=never` (`400`) |

```bash
curl "http://localhost:3000/api/v1/content?url=https://example.com/blog/post"
```

```bash
curl "http://localhost:3000/api/v1/content?url=https://example.com/blog/post&format=markdown&citations=true"
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
    "readingTimeMinutes": 7,      // à 200 mots par minute, arrondi au supérieur
    "truncated": false,           // true si text ou markdown a été coupé au plafond
    "links": [ { "url": "https://…", "text": "…", "internal": true } ],
    "images": [ { "url": "https://…", "alt": "…" } ]
  },
  "meta": { "cached": false, "source": "http", "durationMs": 95 }
}
```

Le contenu principal est choisi parmi `<article>`, `<main>`, `[role="main"]` et `[itemprop="articleBody"]` ; à défaut, le bloc dont les paragraphes portent le plus de texte ; à défaut, tout le `<body>`. Sur une page faite de plusieurs `<article>` voisins (index de blog, fil), tous sont gardés. Le mobilier de page est retiré par balise, rôle et nom de classe ou d'identifiant (`sidebar`, `cookie`, `share`…), mais jamais un élément qui porte la majorité du texte de la page (un `<form>` ASP.NET qui enveloppe tout, par exemple) ; si le nettoyage ne laisse rien, tout le `<body>` est rendu.

- `links` : liens `http(s)` du contenu extrait, absolus, dédoublonnés (500 au plus) ; `internal` vaut `true` si l'hôte est celui de la page (`www.` ignoré). `images` : images du contenu, dédoublonnées (200 au plus), avec la plus grande variante déclarée (`srcset`, `data-src`, `<picture>`) ; les URI `data:` sont écartées.
- `wordCount` segmente le texte selon la langue (`Intl.Segmenter`) : il est juste aussi en chinois ou en japonais.
- Le Markdown n'échappe que ce que Markdown interpréterait : les URL nues et les identifiants (`snake_case`) sortent intacts.
- `text` et `markdown` sont plafonnés à 500 000 caractères chacun (`truncated` le signale). Cible non HTML → `422 ENOTHTML`.

### `GET /api/v1/tables`

Les tableaux de données d'une page, en JSON ou en CSV.

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `render` | `auto` \| `never` \| `always` | `auto` | `auto` : navigateur seulement si le balisage statique ne contient aucun tableau |
| `selector` | sélecteur CSS | — | Restreint les `<table>` lus (`#prices`, `table.specs`) |
| `format` | `json` \| `csv` | `json` | `csv` : un seul tableau, en `text/csv` |
| `table` | 0–19 | `0` | Avec `format=csv` : index du tableau à exporter |

```bash
curl "http://localhost:3000/api/v1/tables?url=https://example.com/pricing&format=csv" -o plans.csv
```

- `data` : `url`, `total`, `truncated` et `tables[]` : `{ index, caption, headers[], rows[][], rowCount, columnCount, truncated }`. Les en-têtes viennent de `<thead>` ou des premières lignes de `<th>` (plusieurs lignes d'en-tête sont jointes : `Price EU`). `colspan` et `rowspan` sont développés : chaque ligne a `columnCount` valeurs.
- Les tableaux de mise en page sont ignorés (`role="presentation"`, tableau contenant un tableau, cellule unique).
- Bornes : 20 tableaux, 1 000 lignes, 50 colonnes, 2 000 caractères par cellule ; `truncated` signale une coupe.
- CSV conforme à la RFC 4180. Les cellules viennent d'un site tiers et un CSV s'ouvre souvent dans un tableur : une cellule qui commencerait une formule (`=`, `+`, `@`, ou `-` hors nombre) est préfixée d'une apostrophe. Index `table` inexistant → `404 EEMBEDNOTFOUND`.

### `GET /api/v1/links`

Tous les liens `<a href>` d'une page : absolus, dédoublonnés (le fragment est ignoré), dans l'ordre du document.

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `render` | `auto` \| `never` \| `always` | `auto` | `auto` : HTTP brut, puis navigateur si la page exécute des scripts et que le balisage statique est quasi vide ou ne contient aucun lien |
| `scope` | `all` \| `internal` \| `external` | `all` | Filtre sur l'hôte de la page (`www.` ignoré) |
| `limit` | 1–2000 | `500` | Nombre maximal de liens renvoyés |

```bash
curl "http://localhost:3000/api/v1/links?url=https://example.com&scope=external"
```

`data` : `url`, `total`, `internal`, `external` (comptes avant `scope` et `limit`), `truncated`, et `links[]` : `{ url, text, rel[], internal, nofollow }`. `text` est le texte du lien, sinon son `title` ou l'`alt` de son image (200 caractères au plus) ; `nofollow` vaut `true` si `rel` contient `nofollow`, `sponsored` ou `ugc`.

### `GET /api/v1/html`

Le HTML d'une page une fois rendue par le navigateur, renvoyé comme texte.

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `render` | `auto` \| `never` \| `always` | `always` | `always` : DOM sérialisé après exécution des scripts. `never` : balisage tel que servi |
| `waitForSelector` | sélecteur CSS | — | Attend cet élément avant de sérialiser la page |

```bash
curl "http://localhost:3000/api/v1/html?url=https://example.com"
```

Le corps est du balisage tiers, **non fiable** : il est servi en `text/plain` avec `nosniff` (et une CSP `sandbox`), pour qu'un navigateur ne l'interprète jamais sur l'origine de l'API. L'en-tête `x-final-url` donne l'URL après redirections. Taille plafonnée à `HTTP_MAX_BODY_BYTES`.

### `GET /api/v1/tech`

Technologies reconnues sur une page : CMS, framework, bibliothèques, analytique, CDN, hébergement, e-commerce…

```bash
curl "http://localhost:3000/api/v1/tech?url=https://example.com"
```

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `render` | `auto` \| `never` \| `always` | `auto` | `never` : en-têtes, balisage et bundles. `always` : aussi le DOM rendu et la sonde intégrée. `auto` : navigateur seulement si le balisage statique est une coquille vide où aucun framework n'a été reconnu |

```jsonc
{
  "url": "https://example.com/",
  "technologies": [
    { "name": "React", "category": "library", "evidence": "bundle /assets/index-BqK3xT9a.js: version:\"19.1.0\",rendererPackageName:\"react-dom\"", "confidence": "high", "version": "19.1.0" },
    { "name": "Tailwind CSS", "category": "ui", "evidence": "bundle /assets/index-DiwrgTda.css: tailwindcss v4.1.4", "confidence": "high", "version": "4.1.4" },
    { "name": "Vite", "category": "build-tool", "evidence": "bundle /assets/index-BqK3xT9a.js: __vite__mapDeps", "confidence": "high", "version": null },
    { "name": "Vercel", "category": "hosting", "evidence": "header x-vercel-id: cdg1::iad1::…", "confidence": "high", "version": null }
  ],
  "inspected": { "bundles": 3, "rendered": false }
}
```

- `category` : `cms`, `ecommerce`, `framework`, `library`, `ui`, `build-tool`, `analytics`, `tag-manager`, `monitoring`, `advertising`, `cdn`, `server`, `hosting`, `language`, `site-builder`, `consent`, `payment`, `font`, `chat`, `security` ou `widget`.
- `evidence` cite ce qui a déclenché la détection : `header …`, `meta generator: …`, `asset: …`, `cookie: …`, `markup: …`, `bundle <chemin>: …`, `probe: <clé>` ou `implied by <nom>` (Next.js implique React).
- `confidence` : `high` (un trait que seul ce produit possède), `medium` (une habitude forte, par exemple Tailwind reconnu à la densité de ses classes utilitaires : variantes `md:` **et** couleurs de palette), `low` (un indice).
- `version` n'est renseignée que si la preuve retenue l'énonce (`nginx/1.24.0`, `tailwindcss v4.1.4`, `ng-version="18.2.4"`, `window.next.version`) ; sinon `null`.
- Sources lues sans navigateur : en-têtes de réponse, balise `generator`, URL des scripts, feuilles de style, images et iframes, noms de cookies, marqueurs du balisage, et jusqu'à 4 **bundles de premier niveau** (scripts et feuilles de style de la même origine, 1,5 Mo lus par fichier) où les frameworks laissent leurs marqueurs d'exécution. C'est ce qui identifie une application monopage (Vite + React + Tailwind) dont le HTML est vide.
- Avec le navigateur (`render=always`, ou `auto` sur une coquille non identifiée) : le DOM rendu, les cookies posés, et une **sonde intégrée, fixe** : une liste fermée de variables globales connues (`jQuery.fn.jquery`, `next.version`, `Shopify.shop`…) et de marqueurs que les frameworks posent sur le DOM (`__reactContainer$…`, `__vue_app__`, variables `--tw-*`). L'appelant ne fournit ni chemin ni script. Ce que la page renvoie est revalidé : seules des clés connues et des numéros de version bien formés sont gardés.
- La table de signatures (environ 230 produits) est écrite à la main dans `tech-detector.ts`. Le principe : mieux vaut manquer une technologie que l'affirmer à tort. `inspected` dit ce qui a été regardé ; l'absence d'une technologie dans la réponse ne prouve pas son absence sur le site.

### `GET /api/v1/insights`

Ce que coûte un chargement de la page : poids, requêtes, temps, *web vitals* observables et technologies vues.

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `device` | `desktop` \| `mobile` | `desktop` | 1280×800, ou profil Pixel 7. Aucune limitation de débit ni de processeur n'est simulée |

```bash
curl "http://localhost:3000/api/v1/insights?url=https://example.com"
```

```jsonc
{
  "url": "https://example.com/",
  "device": "desktop",
  "measurement": "lab",            // toujours « lab »
  "measuredAt": "2026-11-18T10:00:00.000Z",
  "status": 200,
  "loaded": true,                  // false si `load` n'est pas arrivé à temps : chiffres partiels
  "timings": { "ttfbMs": 84, "domContentLoadedMs": 412, "loadMs": 960 },
  "vitals": { "fcpMs": 380, "lcpMs": 720, "lcpElement": "img", "cls": 0.012 },
  "network": {
    "requests": 31,
    "transferBytes": 684120,       // octets reçus, compressés, en-têtes compris
    "byType": { "document": { "requests": 1, "transferBytes": 18200 }, "script": { /* … */ }, "stylesheet": {}, "image": {}, "font": {}, "media": {}, "xhr": {}, "other": {} },
    "thirdParty": { "hostCount": 2, "hosts": ["fonts.gstatic.com", "www.googletagmanager.com"], "requests": 5, "transferBytes": 132000 },
    "limitReached": null           // « requests » ou « bytes » si un plafond par page a arrêté le chargement
  },
  "dom": { "elements": 842 },
  "technologies": [ /* comme /tech, sur le DOM rendu */ ]
}
```

**Tous ces chiffres sont des mesures de laboratoire** : un seul chargement, cache froid, dans un navigateur sans interface hébergé en centre de données, sans limitation de débit. Ce ne sont ni des scores de terrain (CrUX), ni un audit Lighthouse, et ils varient d'un chargement à l'autre. Le schéma OpenAPI le répète sur chaque nombre.

- `cls` est mesuré pendant le chargement, sans interaction ; `lcpMs` est le dernier *Largest Contentful Paint* observé au moment de la mesure.
- « Tiers » : hôte dont le domaine enregistrable (deux derniers labels, trois pour `co.uk` et assimilés) diffère de celui de la page.
- La réponse est mise en cache comme les autres (`measuredAt` garde l'heure de la mesure) ; `force=true` pour mesurer à nouveau.

### `GET /api/v1/palette`

Couleurs dominantes d'une image, ou de l'image principale d'une page.

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `count` | 2–8 | `5` | Nombre de couleurs voulues (une image unie en donne moins) |

`data` : `{ url, pageUrl, format, dominant, colors[] }`, avec `colors[]` : `{ hex, rgb: [r, g, b], population }` (part des pixels, de 0 à 1), la plus fréquente en premier.

- Aucune bibliothèque d'image n'est embarquée. Un PNG 8 bits est décompressé avec `zlib` et lu dans le processus (`meta.source: http`). Tout autre format (JPEG, WebP, AVIF, GIF, PNG à palette) est décodé par Chromium, déjà présent : l'image est ouverte par le chemin navigateur protégé, affichée réduite dans une fenêtre de 160 px, capturée, puis lue de la même façon (`meta.source: browser`, le coût d'un rendu).
- Calcul par découpage récursif de l'espace des couleurs sur un échantillon de 20 000 pixels au plus ; les pixels transparents sont ignorés. Page sans image, ou cible qui n'est pas une image → `404 EEMBEDNOTFOUND`.

### `GET /api/v1/favicon`

La meilleure icône d'un site, avec ses dimensions réelles.

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `redirect` | boolean | `false` | `true` : répond par un `302` vers l'icône, pour un usage direct en `<img src>` |

- Candidats : `<link rel="icon">`, `apple-touch-icon`, icônes du manifeste web, puis `/favicon.ico`. Huit au plus sont mesurés, sur leurs 128 premiers Ko, sans décoder de pixels.
- `data` : `pageUrl`, `icon` (la retenue) et `icons[]` (toutes celles lisibles, la plus grande d'abord), chacune `{ url, rel, declaredSizes, format, contentType, width, height, bytes }`. `format` : `png`, `jpeg`, `gif`, `webp`, `ico` (la plus grande image du fichier) ou `svg` (`width`/`height` à `null`).
- Les tailles déclarées (`sizes`) ne sont pas crues : le classement se fait sur les dimensions lues dans les fichiers. La plus grande icône matricielle gagne ; à défaut, une icône vectorielle. Aucune icône lisible → `404 EEMBEDNOTFOUND`.
- Pas de redimensionnement : l'icône est renvoyée telle qu'elle existe (redimensionner demanderait un décodeur et un encodeur d'images).

### `GET /api/v1/oembed`

Résout le document oEmbed annoncé par une page.

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `maxWidth` | 1–4096 | — | Transmis au fournisseur (`maxwidth`) |
| `maxHeight` | 1–4096 | — | Transmis au fournisseur (`maxheight`) |

- Le lien de découverte (`<link type="application/json+oembed">`, XML accepté) est suivi par le chemin sûr : il est choisi par la page, donc validé comme n'importe quelle cible, redirections comprises.
- `data` : `{ url, endpoint, type, version, title, authorName, authorUrl, providerName, providerUrl, thumbnailUrl, thumbnailWidth, thumbnailHeight, width, height, photoUrl, html, cacheAge }`. `type` : `photo`, `video`, `link`, `rich` ou `null`.
- **`html` est du balisage tiers non fiable**, renvoyé tel que le fournisseur l'a envoyé (il peut contenir des scripts), comme une simple chaîne, coupée à 100 000 caractères. L'API ne l'interprète jamais. Ne l'injectez pas dans une page sans bac à sable (`<iframe sandbox>`) ou assainisseur.
- Page sans lien oEmbed, ou point d'entrée qui ne renvoie pas un document oEmbed → `404 EEMBEDNOTFOUND`. Il n'y a pas de liste intégrée de fournisseurs.

### `GET /api/v1/image`

Format, dimensions réelles et poids d'une image, lus dans les 128 premiers Ko du fichier (requête `Range`) : l'image n'est ni téléchargée en entier ni décodée.

```bash
curl "http://localhost:3000/api/v1/image?url=https://github.com"
```

- `url` peut être une image ou une page : dans ce cas c'est l'image principale de la page (`og:image`…) qui est mesurée, et `pageUrl` indique la page. Page sans image → `404 EEMBEDNOTFOUND`.
- `data` : `{ url, pageUrl, format, contentType, width, height, bytes }`. `format` vaut `png`, `jpeg`, `gif` ou `webp` ; pour un autre format (SVG, AVIF…), `format`, `width` et `height` valent `null`. `bytes` est la taille annoncée par le serveur, `null` s'il ne l'annonce pas.

### `GET /api/v1/sitemap`

Lit le `robots.txt` d'un site puis ses plans de site.

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `url` | string | — | N'importe quelle URL du site, ou l'URL d'un fichier sitemap à lire directement |
| `limit` | 1–5000 | `500` | Nombre maximal d'URL renvoyées dans `urls` |

```bash
curl "http://localhost:3000/api/v1/sitemap?url=https://example.com"
```

- `data` : `robotsUrl`, `robotsFound`, `sitemaps[]` (`{ url, kind: index | urlset | unknown, urlCount, error }`), `urlCount` (total compté dans les fichiers lus), `urls[]` (`{ url, lastmod }`) et `truncated`.
- Les sitemaps déclarés par `robots.txt` sont lus ; à défaut, `/sitemap.xml`. Les fichiers d'index sont suivis sur un niveau. Les fichiers `.gz` sont acceptés.
- Bornes : 10 fichiers par requête, `HTTP_MAX_BODY_BYTES` par fichier (10 Mo une fois décompressé), `limit` URL. `truncated` signale qu'une borne a coupé le résultat.
- Un fichier illisible n'échoue pas la requête : il apparaît dans `sitemaps[]` avec son `error` (`HTTP 404`, `EFORBIDDENURL`…). Chaque fichier passe par les contrôles anti-SSRF.

### `GET /api/v1/check`

État d'un lien à l'instant : statut final, chaîne de redirections, durées, certificat.

```bash
curl "http://localhost:3000/api/v1/check?url=http://github.com"
```

```jsonc
{
  "status": "success",
  "data": {
    "url": "http://github.com/",
    "finalUrl": "https://github.com/",
    "ok": true,                    // statut final < 400
    "status": 200,
    "redirects": [                 // chaque saut, le dernier compris
      { "url": "http://github.com/", "status": 301, "durationMs": 41, "location": "https://github.com/" },
      { "url": "https://github.com/", "status": 200, "durationMs": 118, "location": null }
    ],
    "contentType": "text/html",
    "contentLength": null,         // Content-Length annoncé, sinon null
    "tls": { "subject": "github.com", "issuer": "…", "validFrom": "…", "validTo": "…", "daysLeft": 80 },
    "durationMs": 161
  },
  "meta": { "durationMs": 163 }
}
```

- HTTP brut uniquement ; les corps ne sont jamais téléchargés ; chaque saut est validé par la politique anti-SSRF.
- Une erreur HTTP de la cible est un résultat (`ok: false`), pas une erreur de l'API. `tls` vaut `null` en `http`. Un certificat invalide ou expiré donne `502 EUNREACHABLE`.
- Jamais mis en cache (`Cache-Control: no-store`) ; pas de paramètres `force` ni `ttl`.

### `GET /api/v1/animation`

Un court défilement de la page, en PNG animé (`image/apng`).

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `width` | 320–1280 | `800` | Largeur du viewport |
| `height` | 240–800 | `500` | Hauteur du viewport |
| `frames` | 2–10 | `6` | Images voulues, réparties du haut au bas de la page (12 000 px au plus) |
| `delay` | 100–3000 | `800` | Durée d'affichage de chaque image, en millisecondes |
| `hideBanners` | boolean | `true` | Masque les bandeaux cookies courants (rien n'est cliqué) |
| `blockAds` | boolean | `false` | Abandonne les requêtes publicitaires et de suivi connues |

```html
<img src="http://localhost:3000/api/v1/animation?url=https://example.com&frames=6">
```

- Ni encodeur vidéo ni GIF : Chromium encode chaque image en PNG, et l'API les assemble en APNG en ré-emballant leurs données compressées, sans décoder un pixel. Les navigateurs actuels lisent l'APNG dans un `<img>` ; ailleurs, la première image s'affiche.
- Budget d'octets `ANIMATION_MAX_BYTES` (10 Mo, 4 Mo en serverless) : les images cessent d'être ajoutées quand il est atteint, et l'en-tête `x-animation-frames` dit combien sont dans le fichier. Si deux images n'y tiennent pas → `422 ETOOLARGE`. Une page qui ne défile pas donne une seule image.

### `GET /api/v1/qr`

Le QR code d'une URL, en SVG (défaut) ou PNG. L'URL est seulement encodée, jamais appelée.

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `url` | string | — | URL absolue `http(s)` à encoder (obligatoire) |
| `format` | `svg` \| `png` | `svg` | |
| `size` | 64–2048 | `512` | Côté de l'image, en pixels |
| `margin` | 0–16 | `4` | Zone de silence autour du code, en modules (la norme en demande 4) |
| `ecc` | `L` \| `M` \| `Q` \| `H` | `M` | Correction d'erreur : environ 7, 15, 25 ou 30 % du code peut être abîmé |
| `color` | couleur hexadécimale | `000000` | Couleur des modules (`RGB`, `RRGGBB`, `RRGGBBAA`, avec ou sans `#`) |
| `background` | couleur hexadécimale | `ffffff` | Couleur de fond ; `00000000` = transparent |

```html
<img src="http://localhost:3000/api/v1/qr?url=https://example.com&size=300">
```

- Encodeur écrit pour le projet (ISO/IEC 18004, mode octet, versions 1 à 40), sans dépendance. Le plus petit symbole suffisant est choisi ; l'en-tête `x-qr-version` l'indique. URL trop longue pour le niveau demandé, ou `size` inférieur à un pixel par module en PNG → `400 EINVALIDPARAMS`.
- Les couleurs n'acceptent que de l'hexadécimal : rien d'autre ne peut entrer dans le SVG. Gardez un fort contraste, sinon les lecteurs échouent.
- Réponse déterministe : `Cache-Control: public, max-age=86400, immutable` et `ETag`.

### `GET /api/v1/og`

Une image de partage 1200×630 (`og:image`) à partir de texte.

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `title` | texte, 160 caractères au plus | — | Titre (obligatoire) |
| `description` | texte, 300 caractères au plus | — | Ligne sous le titre |
| `site` | texte, 60 caractères au plus | — | Nom du site ou de la marque, en bas à gauche |
| `author` | texte, 60 caractères au plus | — | Auteur ou date, en bas à droite |
| `label` | texte, 30 caractères au plus | — | Pastille au-dessus du titre (`Guide`) |
| `template` | `classic` \| `gradient` \| `split` | `classic` | Modèle intégré |
| `theme` | `light` \| `dark` | `light` | |
| `accent` | couleur hexadécimale | `2563eb` | Couleur d'accent |
| `format` | `png` \| `jpeg` | `png` | |

```html
<meta property="og:image" content="https://api.example.com/api/v1/og?title=Mon%20article&site=Mon%20site&template=gradient">
```

- L'image est rendue par Chromium à partir d'un document HTML **construit par l'API** : polices système, CSS en ligne, aucune ressource distante. Le rendu se fait hors ligne (toute requête réseau est abandonnée) et scripts désactivés.
- Tout le texte est échappé et borné en longueur : du balisage passé en paramètre s'affiche comme du texte. Cette route n'appelle aucune URL.

### `POST /mcp`

Serveur [Model Context Protocol](https://modelcontextprotocol.io) pour les agents : les capacités en lecture de l'API, sous forme d'outils.

```bash
curl -X POST "http://localhost:3000/mcp" -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"content","arguments":{"url":"https://example.com","maxChars":4000}}}'
```

| Outil | Rôle | Arguments (en plus de `url`) |
| --- | --- | --- |
| `meta` | Métadonnées d'une page | `render`, `includeJsonLd` |
| `content` | Contenu principal en Markdown | `render`, `maxChars` (500–100 000, défaut 20 000), `offset`, `mainContent`, `citations` |
| `extract` | Champs par sélecteurs CSS | `fields` (objet), `render` |
| `links` | Liens d'une page | `scope`, `limit` (défaut 100, 500 au plus), `render` |
| `tech` | Technologies d'un site | `render` |
| `check` | État d'un lien | — |
| `sitemap` | URL déclarées par un site | `limit` (défaut 100, 1 000 au plus) |
| `screenshot` | Capture JPEG (bloc `image`) | `device`, `fullPage`, `selector`, `colorScheme` |

- Transport *Streamable HTTP* sans état : un message JSON-RPC 2.0 par `POST`, réponse en `application/json` ; pas de session, pas de flux SSE (`GET /mcp` → `405`). Méthodes : `initialize`, `ping`, `tools/list`, `tools/call` ; une notification reçoit `202` sans corps. Révisions du protocole : `2025-06-18`, `2025-03-26`, `2024-11-05`. Les lots (tableaux) sont refusés.
- **Données tierces** : tout résultat qui porte du contenu de page commence par un avertissement — ce contenu vient du web, c'est une information à évaluer, jamais une instruction à suivre. Les instructions du serveur le disent aussi à l'initialisation.
- **Résultats bornés** : `content` est coupé à `maxChars` et l'annonce (`[Truncated: characters 0–20000 of 61234. Call again with offset=20000 to continue.]`) ; un JSON de plus de 40 000 caractères est réduit (listes et chaînes raccourcies) avec une mention explicite ; une capture de plus de 1,5 Mo est refusée (`ETOOLARGE`).
- **Erreurs** : un appel d'outil en échec est un résultat normal avec `isError: true`, dont le texte commence par le code Omnillink (`EBLOCKED: …`) et dont `structuredContent.error` porte `{ code, message }`. Arguments hors schéma → `EINVALIDPARAMS`, sans requête sortante. Outil ou méthode inconnus → erreur JSON-RPC (`-32602`, `-32601`).
- Même contrôle d'accès que l'API : un appel = une requête du quota, `x-api-key` honorée. Un refus de la couche HTTP (`429`, `401`) est une erreur JSON-RPC `-32000` dont `data.code` vaut `ERATELIMIT` ou `EUNAUTHORIZED`. L'en-tête `Origin`, s'il est présent, doit figurer dans `CORS_ORIGIN`. `MCP_ENABLED=false` retire la route.
- Tous les outils sont en lecture seule et passent par les mêmes services, donc par les mêmes contrôles anti-SSRF, que les routes REST.

### `GET /api/v1/openapi.json`

Description OpenAPI 3.1 de toutes les routes (paramètres, réponses, format d'erreur). Les paramètres sont dérivés des schémas de validation des routes : le document ne peut pas diverger de l'implémentation.

```bash
curl "http://localhost:3000/api/v1/openapi.json"
```

### `GET /health`

État du service, backend de cache, emplacement des compteurs de quota (`rateLimit` : `memory` ou `redis`) et statistiques du pool de navigateurs. Non soumis au rate limiting.

### `GET /metrics`

Métriques au format texte Prometheus, derrière un jeton : `Authorization: Bearer $METRICS_TOKEN`. Sans `METRICS_TOKEN`, la route n'existe pas (`404`).

```bash
curl -H "authorization: Bearer $METRICS_TOKEN" "http://localhost:3000/metrics"
```

- `omnillink_http_requests_total{route,method,status}`, histogramme `omnillink_http_request_duration_seconds{route}`, `omnillink_cache_answers_total{result}`, et des jauges : `omnillink_browser_jobs_active`, `omnillink_browser_jobs_queued`, `omnillink_circuit_open_hosts`, `omnillink_circuit_opened_total`, `omnillink_process_resident_memory_bytes`, `omnillink_process_uptime_seconds`.
- Les étiquettes sont bornées : `route` est le motif de la route (`/api/v1/meta`), jamais l'URL reçue. Aucune URL cible, adresse IP ou clé n'apparaît. Les valeurs sont par instance.

### Journaux

Une ligne JSON par requête, avec `reqId` (l'`x-request-id`), le motif de la route, la méthode, le statut, la durée, le verdict de cache, la chaîne de rendu, l'hôte de la cible et `keyed` (une clé d'API valide était présente ou non). **Aucune donnée personnelle** : ni adresse IP du client, ni chaîne de requête, ni agent utilisateur, ni clé, ni cookie.

### Clés d'API et quotas

| Requête | Limite par fenêtre (`RATE_LIMIT_WINDOW_MS`) | Compteur |
| --- | --- | --- |
| Sans `x-api-key` | `RATE_LIMIT_MAX` (60 par défaut) | par adresse IP |
| `x-api-key` valide | `RATE_LIMIT_KEY_MAX` (600 par défaut) | par clé |
| `x-api-key` inconnue | `401 EUNAUTHORIZED` | décomptée de l'adresse IP |

```bash
curl -H "x-api-key: $OMNILLINK_KEY" "http://localhost:3000/api/v1/meta?url=https://github.com"
```

- Les clés acceptées sont listées dans `API_KEYS` (séparées par des virgules, 16 à 256 caractères chacune). Si `API_KEYS` est vide, la fonctionnalité est désactivée et l'en-tête est ignoré.
- La comparaison se fait en temps constant, et une clé erronée consomme le quota anonyme de l'appelant : on ne peut pas deviner une clé sans être limité.
- Avec `REDIS_URL`, les compteurs sont **partagés entre les instances** par Redis (une connexion dédiée) ; `/health` l'indique (`rateLimit: redis`). Si Redis devient injoignable, les requêtes passent : le limiteur est une protection, pas une dépendance. Sans `REDIS_URL`, les compteurs vivent en mémoire, par instance.
- `POST /mcp` est compté comme les autres routes : un appel d'outil, une requête.
- Les réponses étant cachables (`s-maxage`), un CDN placé devant l'API peut servir une réponse déjà en cache sans passer par ce contrôle.

### Erreurs

Toutes les erreurs ont la forme `{ "status": "fail" | "error", "code": "…", "message": "…" }`.

| Code | HTTP | Signification |
| --- | --- | --- |
| `EINVALIDPARAMS` | 400 | Paramètres de requête invalides (y compris `fields`, `selector` ou `hide` mal formés) |
| `EINVALIDURL` | 400 | URL mal formée ou schéma non supporté |
| `EUNAUTHORIZED` | 401 | `x-api-key` inconnue |
| `EFORBIDDENURL` | 403 | Destination refusée par la politique anti-SSRF |
| `EEMBEDNOTFOUND` | 404 | L'élément demandé n'existe pas pour cette URL : chemin `embed` (`/meta`), image principale (`/image`, `/palette`), lien oEmbed (`/oembed`), icône (`/favicon`), tableau (`/tables?format=csv`) |
| `ESELECTORNOTFOUND` | 404 | Aucun élément visible ne correspond à `selector`, `click` ou `scrollTo`, ou `waitForSelector` n'est pas apparu à temps |
| `ENOTHTML` | 422 | La cible n'est pas un document HTML (ou, pour une capture, déclenche un téléchargement de fichier) |
| `ETOOLARGE` | 422 | Le résultat généré dépasse la taille maximale (`/pdf`, `/animation`, capture MCP) |
| `ERATELIMIT` | 429 | Trop de requêtes |
| `EUNREACHABLE` | 502 | Site injoignable (DNS, connexion refusée, TLS…) |
| `ETARGETSTATUS` | 502 | Le site a répondu avec une erreur HTTP |
| `EBLOCKED` | 502 | Le site a servi une page de blocage (défi anti-robot, CAPTCHA, accès refusé) au lieu de son contenu. Rien n'est mis en cache |
| `EBUSY` | 503 | Pool de rendu saturé, réessayer |
| `ECIRCUITOPEN` | 503 | L'hôte cible a échoué plusieurs fois de suite (délais dépassés, connexions refusées) : il n'est plus contacté pendant un court moment (voir [Fiabilité](#fiabilité)) |
| `ETIMEOUT` | 504 | Le site n'a pas répondu à temps, ou le budget de la requête est épuisé |
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
│   │   │   ├── openapi.ts         # Document OpenAPI 3.1 + catalogue typé des erreurs
│   │   │   ├── mcp/
│   │   │   │   ├── server.ts      # JSON-RPC du Model Context Protocol (initialize, tools/list, tools/call)
│   │   │   │   └── tools.ts       # Outils MCP : schémas, bornes, avertissement « données tierces »
│   │   │   ├── lib/
│   │   │   │   ├── errors.ts      # AppError + codes d'erreur stables
│   │   │   │   ├── deadline.ts    # Budget de temps unique d'une requête
│   │   │   │   ├── block-page.ts  # Détection des pages de blocage anti-robot
│   │   │   │   ├── selectors.ts   # Durcissement des sélecteurs CSS reçus du client
│   │   │   │   ├── html-to-markdown.ts  # HTML → Markdown (liens, images, citations)
│   │   │   │   ├── dot-path.ts    # Chemins pointés de `embed`
│   │   │   │   ├── target-headers.ts  # Les trois en-têtes autorisés vers la cible
│   │   │   │   ├── circuit-breaker.ts # Disjoncteur par hôte cible
│   │   │   │   ├── metrics.ts     # Compteurs et histogramme au format Prometheus
│   │   │   │   ├── qr.ts          # Encodeur QR (ISO/IEC 18004), sans dépendance
│   │   │   │   ├── png.ts         # PNG : encodeur 1 bit, décodeur 8 bits, assemblage APNG
│   │   │   │   ├── palette.ts     # Palette par découpage de l'espace des couleurs
│   │   │   │   ├── colors.ts / html-escape.ts  # Couleurs hexadécimales, échappement HTML
│   │   │   │   └── image-header.ts    # Dimensions d'une image lues dans son en-tête
│   │   │   ├── security/
│   │   │   │   ├── ssrf.ts        # Validation d'URL, plages IP, résolution validée
│   │   │   │   ├── egress-proxy.ts   # Proxy validant : seule sortie réseau du navigateur
│   │   │   │   ├── browser-guard.ts  # Interception des requêtes du navigateur (1re couche)
│   │   │   │   ├── api-keys.ts    # Clés d'API (comparaison en temps constant)
│   │   │   │   └── request-identity.ts  # x-request-id, compteur de quota
│   │   │   ├── services/
│   │   │   │   ├── fetcher.ts     # Fetch HTTP sûr (redirections revalidées, corps plafonné)
│   │   │   │   ├── page-loader.ts # HTML d'une page : HTTP, puis navigateur si nécessaire
│   │   │   │   ├── meta-extractor.ts # HTML → métadonnées (pur, sans I/O)
│   │   │   │   ├── meta-service.ts   # Cache → HTTP → navigateur
│   │   │   │   ├── content-extractor.ts / content-service.ts  # Contenu lisible
│   │   │   │   ├── field-extractor.ts / extract-service.ts    # Extraction sur mesure
│   │   │   │   ├── screenshot-service.ts / pdf-service.ts
│   │   │   │   ├── site-tools-service.ts  # /links, /html, /image, /sitemap, /check
│   │   │   │   ├── tech-service.ts / tech-detector.ts  # /tech : signatures, bundles, sonde intégrée
│   │   │   │   ├── insights-service.ts / network-meter.ts  # /insights, compteur réseau et plafonds par page
│   │   │   │   ├── page-tools-service.ts  # /tables, /oembed, /favicon
│   │   │   │   ├── structured-extractor.ts / table-extractor.ts  # Modèles d'extraction, tableaux (purs)
│   │   │   │   ├── og-service.ts / palette-service.ts / animation-service.ts  # /og, /palette, /animation
│   │   │   │   ├── capture-frame.ts   # Cadre, coins arrondis et marge autour d'une capture
│   │   │   │   ├── link-extractor.ts / sitemap-parser.ts  # Purs, sans I/O
│   │   │   │   ├── page-prep.ts   # Avant capture : défilement, images, bandeaux
│   │   │   │   ├── renderer.ts    # Navigation Playwright + mapping des erreurs
│   │   │   │   ├── browser-pool.ts   # Pool Chromium (concurrence, file, recyclage)
│   │   │   │   └── cache/         # Interface Cache, LRU mémoire, Redis
│   │   │   └── routes/            # meta (+ batch), screenshot, pdf, extract, content, site-tools, insights,
│   │   │                          # page-tools, visual, mcp, metrics, openapi, health
│   │   ├── test/                  # Vitest (unitaires + bout en bout)
│   │   │   └── corpus/            # Corpus figé : pages réalistes et résultats attendus (non-régression)
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
4. Extraction (cheerio). Si le résultat est pauvre, si la page est une coquille SPA vide ou si c'est une page de blocage → rendu Chromium, puis fusion des deux passes. Si le navigateur n'obtient lui aussi qu'une page de blocage → `EBLOCKED`, sans écriture en cache.
5. Écriture en cache. Les requêtes identiques concurrentes sont dédupliquées (*single flight*).

### Sécurité anti-SSRF

- `http`/`https` uniquement, pas d'identifiants dans l'URL, ports en liste blanche (80, 443 par défaut).
- Refus de `localhost`, `*.local`, `*.internal`… et de toute adresse non routable publiquement (RFC 1918, loopback, link-local dont `169.254.169.254`, CGNAT, IPv6 ULA, NAT64, IPv4-mappées…). Les notations exotiques (`0x7f.1`, `2130706433`) sont normalisées avant contrôle.
- Un seul enregistrement DNS privé suffit à refuser l'hôte.
- Fetch brut : le `lookup` de la connexion est gardé, ce qui ferme la fenêtre de *DNS rebinding*.
- Navigateur, deux couches :
  1. **Interception** (`browser-guard.ts`) : chaque requête émise par la page (sous-ressources, iframes, XHR, navigations) est validée avant de partir ; les WebSockets et les service workers sont coupés. Cette couche ne voit que la première URL d'une requête : Chromium suit les redirections HTTP sans la rappeler.
  2. **Proxy validant** (`egress-proxy.ts`) : Chromium est lancé avec, pour seule sortie réseau, un proxy interne au processus, y compris pour les adresses de bouclage (`<-loopback>`). À **chaque connexion** — chaque saut de redirection, sous-ressource, iframe, tunnel `https` (`CONNECT`) — le proxy applique la politique (ports compris), résout le nom lui-même, refuse si une seule adresse n'est pas publique, puis se connecte à l'adresse qu'il vient de valider, sans seconde résolution. Chromium ne résout aucun nom (`--host-resolver-rules`). Le *DNS rebinding* et les redirections vers une adresse interne sont donc fermés sur ce chemin aussi.
- Le proxy n'écoute que sur `127.0.0.1`, sur un port éphémère, et exige un identifiant aléatoire propre à l'instance : il ne peut pas servir de relais ouvert. Le trafic `https` est tunnelé tel quel : TLS reste de bout en bout entre Chromium et le site, la vérification des certificats n'est pas touchée.
- WebRTC est limité au trafic passant par le proxy (`disable_non_proxied_udp`).
- `SSRF_BLOCKED_HOSTS` ajoute des destinations refusées (`hôte` ou `hôte:port`), comparées au nom demandé et à chaque adresse résolue. Cette liste ne peut que restreindre.

**Pas de code fourni par l'appelant** : l'API n'exécute aucun script, prédicat ou fonction envoyé par le client dans le navigateur. C'est un choix de conception, pas un manque : du code arbitraire dans le navigateur contredirait l'isolation et les garanties anti-SSRF décrites ici. Les seules entrées « programmables » sont des sélecteurs CSS, bornés et restreints au dialecte CSS (`selector`, `hide`, `click`, `scrollTo`, `waitForSelector`…). La sonde de `/tech` et les mesures de `/insights` sont des scripts fixes, écrits dans le code de l'API.

**Pas d'identifiants vers la cible** : seuls `Accept-Language`, `User-Agent` et `Referer` peuvent être fixés par l'appelant (voir [API](#api)). `Cookie` et `Authorization` sont exclus parce que les réponses sont mises en cache par URL et servies à tous.

**Contenu tiers** : ce qui vient d'une page reste une donnée. `/html` est servi en `text/plain`, le champ `html` de `/oembed` est une chaîne jamais interprétée, les CSV neutralisent les formules, et chaque résultat MCP qui porte du contenu de page l'annonce comme donnée tierce, pas comme instruction.

**Documents générés par l'API** (`/og`, cadres de capture, en-tête et pied de page PDF) : construits à partir de constantes, de nombres, de couleurs hexadécimales validées et de texte échappé ; rendus hors ligne, scripts désactivés. Les liens choisis par une page (point d'entrée oEmbed, icônes, manifeste, image principale, bundles lus par `/tech`) passent par la même validation que l'URL de départ, redirections comprises.

### Fiabilité

- **Plafonds par page rendue** : `BROWSER_PAGE_MAX_REQUESTS` requêtes (1 500) et `BROWSER_PAGE_MAX_BYTES` octets reçus (60 Mo, 30 Mo en serverless). Au-delà, les requêtes suivantes sont abandonnées et le chargement arrêté : la page est utilisée telle qu'elle est, ce n'est pas une erreur (`/insights` le signale dans `network.limitReached`). Les téléchargements de fichiers sont refusés (`ENOTHTML`).
- **Disjoncteur par hôte cible** : après `CIRCUIT_BREAKER_THRESHOLD` échecs réseau consécutifs (5 ; `ETIMEOUT` ou `EUNREACHABLE`, jamais une réponse HTTP du site), l'hôte n'est plus contacté pendant `CIRCUIT_BREAKER_COOLDOWN_MS` (30 s) et les requêtes répondent aussitôt `503 ECIRCUITOPEN`. Une requête d'essai est ensuite relâchée ; son issue referme ou rouvre le circuit. Le disjoncteur est commun au chemin HTTP et au navigateur, en mémoire et par instance. `0` le désactive.
- **Quota partagé** par Redis quand `REDIS_URL` est défini, **métriques** Prometheus (`/metrics`) et **journaux structurés** sans donnée personnelle : voir [API](#api).
- **Corpus de non-régression** (`apps/api/test/corpus/`) : des pages figées, modelées sur de vraies sorties (application Vite + React + Tailwind, application Next.js, page WordPress + WooCommerce, article, fiches produit JSON-LD et microdonnées, recette, événement), avec leurs résultats attendus.

**Ce qui n'est pas couvert** :

- Le proxy vit dans le même processus et sur la même machine que l'API : il ne remplace pas un filtrage de sortie au niveau réseau (pare-feu, VPC), qui reste recommandé en défense en profondeur, notamment contre une compromission de Chromium lui-même.
- Un rendu charge et exécute le JavaScript de la page dans Chromium (bac à sable et isolation de sites conservés). La protection porte sur *où* le navigateur peut se connecter, pas sur ce que la page fait une fois chargée.
- La protection contre le *rebinding* suppose que la résolution du système n'est pas elle-même compromise.
- Les compteurs de quota (en mémoire, ou partagés par Redis) ne sont pas une protection contre le déni de service distribué.
- Le disjoncteur et les métriques vivent en mémoire, par instance.

## Déploiement sur Vercel

Démo en ligne : https://linkforge-skyymar69-9413s-projects.vercel.app

Le projet Vercel a pour dossier racine `apps/api` et le preset Fastify ; `apps/api/vercel.json` définit l'installation et le build.

- Une seule fonction sert tout : l'API Fastify (`apps/api/src/server.ts`) et le playground. Au build, `apps/web` est compilé puis intégré au bundle de l'API par `scripts/embed-playground.mjs`, et servi depuis la mémoire (`routes/playground.ts`).
- Le Chromium de Playwright ne tourne pas dans une fonction serverless. Sur Vercel (détecté par la variable `VERCEL`), le pool lance `@sparticuz/chromium`, un binaire prévu pour cet environnement. Ce binaire s'arrête quand sa dernière page se ferme : chaque rendu y reçoit donc son propre navigateur. Si le binaire n'a pas été embarqué dans la fonction, il est téléchargé au premier rendu (`BROWSER_SERVERLESS_PACK_URL`).
- Les réponses portent `s-maxage` : le CDN de Vercel les met en cache, ce qui évite de relancer une fonction pour une URL déjà demandée.

Limites propres au serverless :

- Sans `REDIS_URL`, le cache applicatif et le rate limiting vivent en mémoire, **par instance**. Avec `REDIS_URL` (n'importe quel Redis accessible par URL, à ajouter dans les réglages du projet), le cache **et** les compteurs de quota sont partagés entre les instances.
- Le premier rendu d'une instance froide est plus lent (décompression de Chromium dans `/tmp`).
- Une fonction a une durée maximale (60 s ici) et une mémoire bornée : les pages très lourdes peuvent échouer. Le budget d'une requête (`REQUEST_DEADLINE_MS`, 55 s) est réglé juste en dessous, pour que l'API réponde `ETIMEOUT` elle-même plutôt que d'être tuée par la plateforme.
- Le proxy validant fonctionne aussi dans ce mode (Chromium mono-processus) : il démarre avec le premier rendu de l'instance.

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
