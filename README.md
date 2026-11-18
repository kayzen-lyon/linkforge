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

### `GET /api/v1/meta`

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `url` | string | — | URL absolue `http(s)` (obligatoire) |
| `render` | `auto` \| `never` \| `always` | `auto` | `auto` : HTTP brut, puis navigateur seulement si le résultat est pauvre |
| `force` | boolean | `false` | Ignore le cache en lecture |

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
    "jsonLd": [ /* blocs JSON-LD, @graph aplati */ ],
    "contentType": "text/html"
  },
  "meta": { "cached": false, "source": "http", "durationMs": 132 }
}
```

### `GET /api/v1/screenshot`

Renvoie directement l'image (utilisable dans un `<img src>`).

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `url` | string | — | URL absolue `http(s)` (obligatoire) |
| `device` | `desktop` \| `mobile` | `desktop` | 1280×800, ou profil Pixel 7 |
| `fullPage` | boolean | `false` | Page entière (plafonnée à 12 000 px de haut) |
| `format` | `png` \| `jpeg` | `png` | |
| `quality` | 1–100 | `80` | JPEG uniquement |
| `force` | boolean | `false` | Ignore le cache en lecture |

```bash
curl -o shot.png "http://localhost:3000/api/v1/screenshot?url=https://github.com&device=mobile"
```

### `GET /health`

État du service, backend de cache et statistiques du pool de navigateurs.

### Erreurs

Toutes les erreurs ont la forme `{ "status": "fail" | "error", "code": "…", "message": "…" }`.

| Code | HTTP | Signification |
| --- | --- | --- |
| `EINVALIDPARAMS` | 400 | Paramètres de requête invalides |
| `EINVALIDURL` | 400 | URL mal formée ou schéma non supporté |
| `EFORBIDDENURL` | 403 | Destination refusée par la politique anti-SSRF |
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
│   └── web/                       # Playground Vite + Tailwind CSS v4
├── vercel.json                    # Deux services Vercel (api, web) + réécritures
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

Le dépôt se déploie tel quel : importez-le dans Vercel, sans réglage à modifier (`vercel.json` fait foi).

- Le playground (`apps/web`) est servi en statique par le CDN.
- Le projet est déclaré en deux « services » Vercel : `web` (Vite) et `api` (Fastify, point d'entrée `apps/api/src/server.ts`). `/api/*` et `/health` sont réécrits vers `api`, tout le reste vers `web`.
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
