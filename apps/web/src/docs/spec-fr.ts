/**
 * French text of everything the reference page takes from the OpenAPI
 * snapshot: one summary and description per operation, one description per
 * parameter. Parameter names, types, defaults and enum values are never
 * translated.
 *
 * Keys are `<operation>.<parameter>`; `*.<parameter>` covers a parameter whose
 * meaning is the same on every operation. `render.ts` throws when the
 * snapshot holds a described parameter or an operation that has no entry
 * here, so a new endpoint cannot ship in English on the French pages.
 */

export const OPERATIONS_FR: Readonly<Record<string, { readonly summary: string; readonly description: string }>> = {
  'meta-batch': {
    summary: 'Métadonnées de plusieurs adresses',
    description:
      'Les métadonnées de 10 adresses au plus en un seul appel, en HTTP brut uniquement (l’équivalent de `render=never` : pas de navigateur). Les résultats reviennent dans l’ordre des adresses ; une adresse en échec donne un élément d’erreur et ne fait jamais échouer le lot. Chaque adresse passe par la même validation et les mêmes contrôles anti-SSRF que `GET /api/v1/meta`. La réponse n’est pas mise en cache par un CDN, mais chaque élément lit et alimente le cache du serveur.',
  },
  animation: {
    summary: 'Capture animée par défilement (APNG)',
    description:
      'Un court défilement de la page sous forme de PNG animé (`image/apng`), que tous les navigateurs actuels lisent dans une balise `<img>` et qui se réduit ailleurs à sa première image. Les images sont des captures de la fenêtre assemblées sans réencodage : ni vidéo, ni GIF. Bornes : 10 images, 1280 × 800 px, et un budget d’octets (`ANIMATION_MAX_BYTES`) au-delà duquel plus aucune image n’est ajoutée.',
  },
  tables: {
    summary: 'Tableaux HTML en JSON ou en CSV',
    description:
      'Les tableaux de données d’une page, en lignes de texte : en-têtes détectés, `colspan` et `rowspan` développés, tableaux de mise en page ignorés. `format=csv` exporte un tableau en CSV (RFC 4180) ; les cellules qu’un tableur exécuterait comme une formule (`=`, `+`, `-`, `@`) sont précédées d’une apostrophe. Avec `render=auto`, le navigateur sert quand le balisage statique ne contient aucun tableau.',
  },
  links: {
    summary: 'Liens d’une page',
    description:
      'Chaque `<a href>` d’une page : adresse absolue, sans doublon, dans l’ordre du document, avec son texte, ses valeurs `rel` et l’indication qu’il reste ou non sur le site. Avec `render=auto`, le navigateur sert quand la page exécute des scripts et que son balisage statique est presque vide ou sans lien.',
  },
  html: {
    summary: 'HTML rendu d’une page',
    description:
      'Le document HTML d’une page une fois rendu par un navigateur, sous forme de texte. La réponse est du balisage tiers : elle est servie en `text/plain` avec `nosniff`, de sorte qu’un navigateur ne l’interprète jamais sur cette origine. Traitez-la comme une entrée non fiable. Elle est plafonnée à la limite de corps du serveur (5 Mo par défaut).',
  },
  tech: {
    summary: 'Technologies d’une page',
    description:
      'CMS, framework, bibliothèques, kit d’interface, outil de build, mesure d’audience, CDN, hébergement, plateforme de commerce : reconnus à partir des en-têtes de réponse, de la balise `generator`, des adresses de ressources, des noms de cookies, de marqueurs dans le balisage et dans les bundles du site et, quand la page est rendue, d’une sonde fixe intégrée à l’API. Chaque détection est accompagnée de son indice et d’un niveau de confiance.',
  },
  insights: {
    summary: 'Poids, chronologie et indicateurs web d’une page (laboratoire)',
    description:
      'Charge la page une fois dans un navigateur sans interface et rapporte ce que ce chargement a coûté : poids total transféré, requêtes et octets par type de ressource, hôtes tiers, TTFB, DOMContentLoaded, load, FCP, LCP et CLS, ainsi que les technologies vues. Chaque nombre est une mesure de laboratoire tirée d’un seul chargement dans un navigateur de centre de données, sans bridage et à cache froid : ce n’est ni une mesure de terrain, ni un audit Lighthouse.',
  },
  favicon: {
    summary: 'Meilleure icône d’un site',
    description:
      'Rassemble les icônes qu’une page déclare (`<link rel="icon">`, `apple-touch-icon`, manifeste d’application web) ainsi que `/favicon.ico`, en mesure jusqu’à 8 à partir de leurs 128 premiers Ko (sans jamais décoder les pixels) et renvoie la plus grande icône matricielle réelle, ou une icône vectorielle à défaut. Les tailles déclarées ne sont pas crues : les dimensions sont lues dans les fichiers. Les icônes sont renvoyées telles quelles, sans redimensionnement.',
  },
  oembed: {
    summary: 'Résolution oEmbed',
    description:
      'Suit le lien de découverte oEmbed qu’une page annonce (`<link type="application/json+oembed">`, XML accepté) et renvoie un document normalisé : type, titre, auteur, fournisseur, vignette, dimensions, `html`. Le point d’entrée est choisi par la page : il passe donc par les mêmes contrôles anti-SSRF que n’importe quelle cible. `html` est du balisage tiers non fiable, renvoyé comme une chaîne.',
  },
  palette: {
    summary: 'Palette de couleurs d’une image',
    description:
      'Les couleurs dominantes d’une image, ou de l’image d’aperçu principale d’une page. Un PNG 8 bits est décodé dans le processus (`meta.source: http`) ; tout autre format est décodé par le navigateur sans interface (`meta.source: browser`), ce qui coûte un rendu. Le calcul découpe récursivement l’espace des couleurs sur un échantillon de 20 000 pixels au plus.',
  },
  qr: {
    summary: 'Code QR d’une adresse',
    description:
      'Le code QR d’une adresse en SVG (par défaut) ou en PNG, utilisable directement dans un attribut `src`. Il est calculé localement : l’adresse n’est jamais demandée. Le plus petit symbole qui convient est choisi ; une adresse trop longue pour le niveau de correction demandé répond `400`.',
  },
  og: {
    summary: 'Image de partage à partir de texte',
    description:
      'Une carte de partage de 1200 × 630 (`og:image`) construite à partir de paramètres textuels et d’un modèle intégré, utilisable directement dans `<meta property="og:image">`. Elle est rendue par le navigateur sans interface à partir d’un document généré par l’API : aucune ressource distante n’est chargée, les scripts sont désactivés, chaque texte est échappé et borné en longueur. Ce point d’accès ne demande aucune adresse.',
  },
  image: {
    summary: 'Dimensions et poids réels d’une image',
    description:
      'Format, dimensions en pixels et poids d’une image, lus dans les 128 premiers Ko du fichier seulement (requête partielle) : l’image n’est jamais téléchargée en entier ni décodée. Avec l’adresse d’une page, c’est son image d’aperçu principale (`og:image`…) qui est mesurée.',
  },
  sitemap: {
    summary: 'robots.txt et plans de site',
    description:
      'Lit `/robots.txt`, puis les plans de site qu’il déclare (`/sitemap.xml` s’il n’en déclare aucun). Les fichiers d’index sont suivis sur un niveau. Bornes : 10 fichiers, la limite de corps du serveur par fichier (gzip accepté, 10 Mo une fois décompressé), `limit` adresses. Un fichier illisible est signalé dans `sitemaps[].error` et ne fait pas échouer la requête.',
  },
  check: {
    summary: 'Vérification d’un lien',
    description:
      'L’état d’un lien à l’instant : statut final, chaîne de redirections avec le statut et la durée de chaque saut, certificat TLS quand le dernier saut est en https, type et longueur déclarés. HTTP brut uniquement, les corps ne sont jamais téléchargés, chaque saut passe par les contrôles anti-SSRF. Une erreur HTTP de la cible est un résultat (`ok: false`), pas une erreur de l’API. La réponse n’est jamais mise en cache.',
  },
  mcp: {
    summary: 'Point d’accès Model Context Protocol',
    description:
      'Serveur MCP en HTTP sans état : un message JSON-RPC 2.0 par `POST`, réponse en `application/json` (pas de session, pas de flux SSE ; `GET` répond 405). Méthodes : `initialize`, `ping`, `tools/list`, `tools/call`. Outils : `meta`, `content`, `extract`, `links`, `tech`, `check`, `sitemap`, `screenshot`. Un appel d’outil en échec est un résultat normal marqué `isError: true`.',
  },
};

export const PARAMS_FR: Readonly<Record<string, string>> = {
  '*.url': 'Adresse absolue, en http ou https, de la page cible.',
  '*.render': 'Stratégie de rendu. `auto` : HTTP brut, puis navigateur sans interface seulement si nécessaire. `never` : HTTP brut uniquement. `always` : toujours rendre.',
  '*.acceptLanguage': 'En-tête `Accept-Language` envoyé à la cible, par exemple `fr-FR,fr;q=0.9`. Appliqué en HTTP brut comme dans le navigateur ; fait partie de la clé de cache.',
  '*.userAgent': 'En-tête `User-Agent` envoyé à la cible (ASCII imprimable). Fait partie de la clé de cache. Les cookies et `Authorization` ne peuvent pas être fixés : les réponses sont mises en cache par adresse et partagées entre appelants.',
  '*.referer': 'En-tête `Referer` envoyé avec la requête du document : une adresse absolue en http ou https. Fait partie de la clé de cache.',
  '*.force': 'Ignore la lecture du cache (le résultat est tout de même enregistré).',
  '*.ttl': 'Durée de vie en cache de cette réponse, en secondes. S’applique à l’entrée du cache serveur et à `Cache-Control`. Par défaut : la configuration du serveur.',
  '*.waitForSelector': 'Sélecteur CSS qui doit être présent dans le DOM avant que la page soit lue ou capturée (10 s au plus, dans la limite du délai de la requête). CSS uniquement. Introuvable à temps : `404 ESELECTORNOTFOUND`.',
  '*.blockAds': 'Abandonne les requêtes vers une liste intégrée d’hôtes publicitaires et de suivi bien connus (captures plus rapides et plus propres). Ce n’est pas un bloqueur de publicité complet.',
  '*.hideBanners': 'Masque les bandeaux de cookies et de consentement courants, avec une feuille de style intégrée (rien n’est cliqué, aucun consentement n’est donné).',
  'meta.embed': 'Chemin à points dans `data` (`image.url`, `logo.url`, `favicon`, `title`, `images.0.url`). La réponse est alors cette seule valeur à la place de l’enveloppe JSON : une redirection 302 pour une adresse http(s) (utilisable dans un attribut `src`), du `text/plain` pour une chaîne, un nombre ou un booléen, du JSON brut pour un objet ou un tableau, 404 si la valeur est absente ou nulle.',
  'meta-batch.urls': 'Adresses absolues en http ou https, 10 au plus. Les doublons ne sont lus qu’une fois.',
  'screenshot.device': '`desktop` : 1280 × 800. `mobile` : profil Pixel 7 (agent utilisateur, densité, tactile).',
  'screenshot.width': 'Largeur de la fenêtre en pixels CSS ; remplace celle du profil d’appareil.',
  'screenshot.height': 'Hauteur de la fenêtre en pixels CSS ; remplace celle du profil d’appareil.',
  'screenshot.fullPage': 'Capture la page entière (12 000 px de haut au plus), après un défilement qui laisse le contenu différé se charger. Ignoré avec `selector`.',
  'screenshot.selector': 'Sélecteur CSS : seul le premier élément correspondant est capturé.',
  'screenshot.hide': 'Sélecteurs CSS, séparés par des virgules, des éléments à masquer avant la capture (bandeaux de cookies, publicités). 20 sélecteurs de 200 caractères au plus.',
  'screenshot.click': 'Sélecteur CSS d’un élément à cliquer avant la capture (ouvrir un onglet, déplier une section). Un vrai clic sur le premier élément visible ; introuvable en 3 s : `404 ESELECTORNOTFOUND`. CSS uniquement, pas de script.',
  'screenshot.scrollTo': 'Sélecteur CSS d’un élément à amener dans la fenêtre avant la capture. Introuvable en 3 s : `404 ESELECTORNOTFOUND`.',
  'screenshot.waitFor': 'Attente supplémentaire avant la capture, en millisecondes.',
  'screenshot.colorScheme': 'Valeur émulée de `prefers-color-scheme`.',
  'screenshot.frame': 'Cadre d’appareil dessiné autour de la capture : une fenêtre de navigateur ou un téléphone. Composé hors ligne à partir de la capture terminée. Indisponible avec `fullPage`.',
  'screenshot.radius': 'Rayon des coins de la capture, en pixels.',
  'screenshot.padding': 'Espace autour de la capture, en pixels, rempli avec `background`.',
  'screenshot.background': 'Couleur derrière la capture quand `frame`, `radius` ou `padding` est utilisé : hexadécimal `RGB`, `RRGGBB` ou `RRGGBBAA`, avec ou sans `#`. `00000000` est transparent (PNG).',
  'screenshot.quality': 'JPEG uniquement.',
  'pdf.format': 'Format du papier.',
  'pdf.printBackground': 'Imprime les couleurs et les images d’arrière-plan CSS.',
  'pdf.hideBanners': 'Masque les bandeaux de cookies et de consentement courants avant l’impression (rien n’est cliqué).',
  'pdf.margin': 'Marge sur chaque côté, en millimètres. Par défaut : les marges `@page` de la page elle-même.',
  'pdf.scale': 'Échelle du rendu.',
  'pdf.pageRanges': 'Pages à conserver, par exemple `1-3,5` (pages 1 à 100, 10 plages au plus). Par défaut : toutes.',
  'pdf.headerText': 'Texte brut imprimé en haut de chaque page. Il est échappé (pas de HTML) ; les jetons `{page}`, `{pages}`, `{title}`, `{url}` et `{date}` sont remplacés. Impose une marge haute d’au moins 12 mm.',
  'pdf.footerText': 'Texte brut imprimé en bas de chaque page ; mêmes règles que `headerText`. Exemple : `Page {page} / {pages}`.',
  'animation.width': 'Largeur de la fenêtre en pixels CSS.',
  'animation.height': 'Hauteur de la fenêtre en pixels CSS.',
  'animation.frames': 'Nombre d’images voulu, réparties régulièrement du haut au bas de la page (12 000 px au plus).',
  'animation.delay': 'Durée d’affichage de chaque image, en millisecondes.',
  'animation.hideBanners': 'Masque les bandeaux de cookies et de consentement courants (rien n’est cliqué).',
  'animation.blockAds': 'Abandonne les requêtes vers des hôtes publicitaires et de suivi bien connus.',
  'extract.fields': 'Obligatoire sauf si `preset` est donné. Objet encodé en JSON qui associe un nom de champ à une règle `{ "selector": string, "attr"?: "text" | "html" | <attribut>, "type"?: "string" | "number" | "url", "all"?: boolean }`. 20 champs au plus ; sélecteurs de 300 caractères au plus.',
  'extract.preset': 'Champs typés prêts à l’emploi, à la place de `fields`, lus dans le JSON-LD schema.org, puis les microdonnées, Open Graph, les balises `<meta>` et quelques sélecteurs CSS de repli. `sources` indique d’où vient chaque valeur. Quatre modèles : `article`, `product`, `recipe` et `event` ; la liste de leurs champs figure dans la spécification OpenAPI.',
  'content.format': '`json` : l’enveloppe. `markdown` / `text` : le corps seul, en `text/markdown` ou `text/plain`, prêt à être inséré dans un prompt.',
  'content.mainContent': 'Ne garde que le contenu principal. `false` garde tout le `<body>` (scripts et styles exceptés).',
  'content.include': 'Sélecteurs CSS séparés par des virgules : seuls les éléments correspondants sont gardés (dans l’ordre du document). Remplace la détection du contenu principal. 20 sélecteurs de 200 caractères au plus.',
  'content.exclude': 'Sélecteurs CSS, séparés par des virgules, des éléments à retirer avant l’extraction. 20 sélecteurs de 200 caractères au plus.',
  'content.citations': 'Liens en style référence dans `markdown` : `[libellé][1]` dans le texte, les adresses numérotées à la fin.',
  'tables.selector': 'Sélecteur CSS qui restreint les éléments `<table>` lus (par exemple `#prices`, `table.specs`).',
  'tables.format': '`json` : tous les tableaux dans l’enveloppe. `csv` : un seul tableau (voir `table`) en `text/csv`.',
  'tables.table': 'Avec `format=csv` : index du tableau à exporter, tel que numéroté dans la réponse JSON.',
  'links.scope': 'Garde tous les liens, ou seulement ceux qui restent sur l’hôte de la page, ou ceux qui en sortent.',
  'links.limit': 'Nombre maximal de liens renvoyés. `truncated` signale qu’il y en avait davantage.',
  'html.render': '`always` (par défaut) : le DOM sérialisé après exécution des scripts. `never` : le balisage tel qu’il est servi. `auto` : le balisage servi, sauf s’il s’agit d’une coquille vide.',
  'tech.render': '`never` : en-têtes de réponse, balisage et bundles du site uniquement. `always` : en plus, le DOM rendu et une sonde fixe, intégrée à l’API, de variables globales et de marqueurs d’exécution bien connus (jamais de code fourni par l’appelant). `auto` : le navigateur seulement quand le balisage statique est une coquille vide où rien n’a été reconnu.',
  'insights.device': '`desktop` : 1280 × 800. `mobile` : profil Pixel 7 (agent utilisateur, densité, tactile). Aucun bridage du réseau ni du processeur n’est appliqué, dans un cas comme dans l’autre.',
  'favicon.redirect': '`true` : répond par une redirection 302 vers la meilleure icône au lieu du JSON, pour que l’adresse fonctionne dans un attribut `src`.',
  'oembed.maxWidth': 'Transmis au fournisseur sous le nom `maxwidth`.',
  'oembed.maxHeight': 'Transmis au fournisseur sous le nom `maxheight`.',
  'palette.url': 'Adresse d’une image, ou d’une page : c’est alors la palette de son image d’aperçu principale (`og:image`…) qui est renvoyée.',
  'palette.count': 'Nombre de couleurs voulu (une image unie en donne moins).',
  'qr.url': 'Adresse absolue en http ou https à encoder. Elle est seulement encodée, jamais demandée.',
  'qr.size': 'Largeur et hauteur de l’image, en pixels.',
  'qr.margin': 'Zone de silence autour du code, en modules (la norme en demande 4).',
  'qr.ecc': 'Niveau de correction d’erreur : `L` environ 7 %, `M` environ 15 %, `Q` environ 25 %, `H` environ 30 % du code peut être endommagé.',
  'qr.color': 'Couleur des modules : hexadécimal `RGB`, `RRGGBB` ou `RRGGBBAA`, avec ou sans `#`.',
  'qr.background': 'Couleur de fond, même syntaxe ; `00000000` pour un fond transparent. Gardez un fort contraste avec `color`, sinon les lecteurs échoueront.',
  'og.title': 'Titre de la carte. Texte brut : le balisage est affiché comme du texte, jamais interprété.',
  'og.description': 'Ligne d’appui sous le titre (deux lignes au plus sont affichées).',
  'og.site': 'Nom du site ou de la marque, en bas à gauche.',
  'og.author': 'Auteur ou date, en bas à droite.',
  'og.label': 'Petite pastille au-dessus du titre (`Guide`, `New`).',
  'og.template': '`classic` : carte sobre avec un filet d’accent. `gradient` : fond en dégradé d’accent. `split` : bande d’accent à gauche.',
  'og.accent': 'Couleur d’accent : hexadécimal `RGB` ou `RRGGBB`, avec ou sans `#`.',
  'image.url': 'Adresse d’une image, ou d’une page : c’est alors son image d’aperçu principale qui est mesurée.',
  'sitemap.url': 'N’importe quelle adresse du site (son robots.txt et ses plans de site sont découverts), ou l’adresse d’un fichier de plan de site à lire directement.',
  'sitemap.limit': 'Nombre maximal d’adresses renvoyées dans `urls`. `urlCount` les compte toutes.',
  'mcp.id': 'À omettre pour une notification (réponse 202, sans corps).',
  'mcp.params': 'Pour `tools/call` : `{ "name": "<outil>", "arguments": { … } }`.',
};

/**
 * Short French names of the operations whose reference section is written by
 * hand (their full text lives in the docs dictionary). The playground uses
 * them in its endpoint list.
 */
export const SUMMARIES_FR: Readonly<Record<string, string>> = {
  meta: 'Métadonnées d’aperçu de lien',
  screenshot: 'Capture d’une page ou d’un élément',
  pdf: 'Page en PDF',
  extract: 'Règles d’extraction sur mesure',
  content: 'Contenu lisible pour l’IA et les agents',
  health: 'État du service',
  ...Object.fromEntries(Object.entries(OPERATIONS_FR).map(([id, value]) => [id, value.summary])),
};
