/**
 * French dictionary (default language).
 *
 * Its shape is the source of truth: `en.ts` is typed against it, so a key
 * missing in English is a compile error. Values accept a tiny inline syntax:
 * `code`, **strong** and [label](href). Placeholders look like {name}.
 */

/** Strings used on every page: header, footer, shared controls, API errors. */
export const common = {
  'skip': 'Aller au contenu',
  'brand.home': 'Accueil LinkForge',
  'nav.label': 'Navigation principale',
  'nav.demo': 'Démo',
  'nav.features': 'Fonctionnalités',
  'nav.examples': 'Exemples',
  'nav.selfHost': 'Auto-hébergement',
  'nav.docs': 'Référence API',
  'nav.menu': 'Menu',
  'lang.label': 'Langue',
  'lang.fr': 'Français',
  'lang.en': 'Anglais',
  'theme.toLight': 'Passer au thème clair',
  'theme.toDark': 'Passer au thème sombre',
  'copy': 'Copier',
  'copied': 'Copié',
  'copyFailed': 'Copie impossible',
  'footer.tagline':
    'Une API open source qui transforme une URL en métadonnées, captures d’écran, PDF, champs sur mesure et contenu lisible. Publiée sous licence MIT.',
  'footer.label': 'Pied de page',
  'footer.product': 'Produit',
  'footer.developers': 'Développeurs',
  'footer.demo': 'Démo en direct',
  'footer.features': 'Fonctionnalités',
  'footer.examples': 'Exemples de code',
  'footer.selfHost': 'Auto-hébergement',
  'footer.docs': 'Référence de l’API',
  'footer.openapi': 'Document OpenAPI',
  'footer.health': 'État du service',
  'footer.source': 'Code source sur GitHub',

  'err.EINVALIDPARAMS':
    'Un paramètre est manquant, inconnu ou invalide. Ce code accompagne aussi le statut 404 d’une route inexistante.',
  'err.EINVALIDURL': 'L’`url` est mal formée ou n’utilise ni `http` ni `https`.',
  'err.EUNAUTHORIZED': 'La clé envoyée dans `x-api-key` est inconnue.',
  'err.EFORBIDDENURL':
    'La destination est refusée par la politique anti-SSRF : adresse privée, de bouclage ou de métadonnées, nom d’hôte interne, ou port non autorisé.',
  'err.EEMBEDNOTFOUND': 'Le chemin demandé avec `embed` est absent de la réponse `/meta`, ou vaut `null`.',
  'err.ESELECTORNOTFOUND': 'Le `selector` passé à `/screenshot` ne correspond à aucun élément visible.',
  'err.ENOTHTML': 'La cible n’est pas un document HTML, alors que ce point d’accès en a besoin.',
  'err.ETOOLARGE': 'Le résultat généré dépasse la taille maximale autorisée.',
  'err.ERATELIMIT':
    'Trop de requêtes. Attendez le délai indiqué dans le message et dans l’en-tête `retry-after`.',
  'err.EUNREACHABLE': 'La cible est injoignable : échec DNS, connexion refusée, erreur TLS.',
  'err.ETARGETSTATUS': 'La cible a répondu avec un statut HTTP d’erreur.',
  'err.EBUSY': 'La file de rendu est pleine. Réessayez dans un instant.',
  'err.ETIMEOUT': 'La cible n’a pas répondu à temps.',
  'err.EBROWSER': 'Le navigateur sans interface a planté ou n’a pas pu démarrer.',
  'err.EINTERNAL': 'Erreur inattendue du serveur. Aucun détail interne n’est divulgué.',
};

/** Landing page. */
export const home = {
  'meta.title': 'LinkForge · API open source d’intelligence de liens',
  'meta.description':
    'LinkForge est une API open source qui transforme une URL en métadonnées, captures d’écran, PDF, champs extraits et contenu lisible. Essayez-la en direct.',

  'hero.eyebrow': 'API open source · licence MIT',
  'hero.title': 'Une URL en entrée. Métadonnées, capture, PDF et contenu en sortie.',
  'hero.lead':
    'LinkForge est une API REST qui lit une page web à votre place : métadonnées normalisées, captures d’écran, export PDF, extraction sur mesure et texte lisible pour vos agents IA. Le code est ouvert, hébergez-la où vous voulez.',
  'hero.cta.demo': 'Essayer la démo',
  'hero.cta.docs': 'Lire la référence de l’API',
  'manifest.title': 'Cinq points d’accès, un seul paramètre obligatoire',
  'manifest.meta': 'Titre, description, image, auteur, date, JSON-LD, flux',
  'manifest.screenshot': 'PNG ou JPEG, bureau ou mobile, page entière ou élément précis',
  'manifest.pdf': 'Document A4 ou Letter, portrait ou paysage',
  'manifest.extract': 'Vos propres champs, décrits par des sélecteurs CSS',
  'manifest.content': 'Texte lisible et Markdown, sans navigation ni publicité',

  'demo.title': 'Essayez sur une vraie page',
  'demo.lead': 'Saisissez une URL publique. Chaque onglet appelle le point d’accès correspondant de cette instance.',
  'demo.url.label': 'URL à analyser',
  'demo.run': 'Lancer',
  'demo.tabs.label': 'Point d’accès',
  'demo.tab.meta': 'Métadonnées',
  'demo.tab.screenshot': 'Capture',
  'demo.tab.pdf': 'PDF',
  'demo.tab.extract': 'Extraction',
  'demo.tab.content': 'Contenu',
  'demo.request.label': 'Requête',
  'demo.idle': 'Lancez la requête pour voir la réponse.',
  'demo.loading.meta': 'Lecture de la page…',
  'demo.loading.screenshot': 'Rendu de la page dans le navigateur…',
  'demo.loading.extract': 'Extraction des champs…',
  'demo.loading.content': 'Extraction du contenu lisible…',
  'demo.error.title': 'La requête a échoué',
  'demo.error.network': 'Impossible de joindre l’API. Vérifiez qu’elle est démarrée, puis réessayez.',
  'demo.error.unexpected': 'L’API a renvoyé une réponse inattendue (HTTP {status}).',
  'demo.error.invalidUrl': 'Saisissez une URL complète, qui commence par http:// ou https://.',
  'demo.error.apiMessage': 'Message de l’API :',
  'demo.badge.http': 'requête HTTP',
  'demo.badge.browser': 'rendu navigateur',
  'demo.badge.cached': 'depuis le cache',
  'demo.badge.duration': '{ms} ms',

  'demo.meta.preview': 'Aperçu du lien',
  'demo.meta.json': 'Réponse JSON',
  'demo.meta.untitled': 'Sans titre',
  'demo.meta.author': 'Auteur',
  'demo.meta.publisher': 'Éditeur',
  'demo.meta.date': 'Date',
  'demo.meta.lang': 'Langue',

  'demo.shot.device': 'Appareil',
  'demo.shot.desktop': 'Bureau',
  'demo.shot.mobile': 'Mobile',
  'demo.shot.fullPage': 'Page entière',
  'demo.shot.dark': 'Thème sombre',
  'demo.shot.alt': 'Capture d’écran de {host}',
  'demo.shot.open': 'Ouvrir l’image',

  'demo.pdf.format': 'Format',
  'demo.pdf.landscape': 'Paysage',
  'demo.pdf.background': 'Arrière-plans',
  'demo.pdf.open': 'Ouvrir le PDF',
  'demo.pdf.download': 'Télécharger',
  'demo.pdf.note': 'Le PDF est généré à la demande, au moment où vous ouvrez le lien.',

  'demo.extract.rules': 'Règles d’extraction (JSON)',
  'demo.extract.hint': 'Une clé par champ. Chaque règle accepte `selector`, `attr`, `type` et `all`.',
  'demo.extract.invalid': 'Les règles doivent être un objet JSON valide. {detail}',
  'demo.extract.result': 'Champs extraits',

  'demo.content.view': 'Affichage',
  'demo.content.rendered': 'Rendu',
  'demo.content.markdown': 'Markdown',
  'demo.content.text': 'Texte',
  'demo.content.stats': '{words} mots · {minutes} min de lecture',
  'demo.content.empty': 'Aucun contenu lisible n’a été trouvé sur cette page.',

  'features.title': 'Ce que l’API prend en charge',
  'features.lead': 'Lire une page inconnue demande plus qu’une requête. Voici ce que LinkForge fait à chaque appel.',
  'features.pipeline.title': 'HTTP d’abord, navigateur seulement si nécessaire',
  'features.pipeline.body':
    'La page est d’abord lue par une simple requête HTTP. Chromium n’est lancé que si le résultat est pauvre ou si la page est une coquille d’application vide. Le champ `meta.source` vous dit quel chemin a été suivi.',
  'features.pipeline.step1': 'Lecture du cache',
  'features.pipeline.step2': 'Requête HTTP',
  'features.pipeline.step3': 'Extraction',
  'features.pipeline.step4': 'Rendu Chromium, si besoin',
  'features.pipeline.step5': 'Écriture en cache',
  'features.ssrf.title': 'Protection SSRF stricte',
  'features.ssrf.body':
    'Les adresses privées, de bouclage et de métadonnées cloud sont refusées. La résolution DNS est épinglée à la connexion, et chaque redirection comme chaque sous-requête du navigateur est revalidée.',
  'features.cache.title': 'Cache et déduplication',
  'features.cache.body':
    'Les résultats sont mis en cache, en mémoire ou dans Redis. Des requêtes identiques reçues en même temps ne déclenchent qu’un seul traitement.',
  'features.embed.title': 'Un champ, directement dans une balise',
  'features.embed.body':
    'Avec `embed=image.url`, l’API redirige vers l’image de la page : la requête sert telle quelle de source à une balise `img`.',
  'features.extract.title': 'Extraction sur mesure',
  'features.extract.body':
    'Décrivez vos champs avec un sélecteur CSS, un attribut et un type. L’API renvoie un JSON à la forme que vous avez choisie.',
  'features.content.title': 'Contenu prêt pour les agents IA',
  'features.content.body':
    'Le texte principal de la page, en Markdown et en texte brut, avec le nombre de mots et le temps de lecture.',
  'features.openapi.title': 'Contrat OpenAPI 3.1',
  'features.openapi.body':
    'Le document `/api/v1/openapi.json` décrit chaque point d’accès. Générez un client ou importez-le dans vos outils.',
  'features.errors.title': 'Erreurs stables',
  'features.errors.body':
    'Chaque échec porte un code stable, de `EINVALIDURL` à `ETIMEOUT`, et le statut HTTP qui lui correspond.',

  'examples.title': 'Une requête suffit pour l’intégrer',
  'examples.lead': 'Les exemples reprennent l’URL et l’onglet choisis dans la démo.',
  'examples.endpoint': 'Point d’accès',
  'examples.language': 'Langage',
  'examples.more': 'Tous les paramètres sont décrits dans la [référence de l’API](/docs).',

  'selfHost.title': 'Hébergez-la vous-même',
  'selfHost.lead':
    'LinkForge est distribué sous licence MIT. Il vous faut Node.js 22 ou plus récent ; Redis est facultatif.',
  'selfHost.step1': 'Récupérez le code',
  'selfHost.step2': 'Installez les dépendances et Chromium',
  'selfHost.step3': 'Créez votre configuration',
  'selfHost.step4': 'Démarrez l’API',
  'selfHost.listening': 'L’API écoute alors sur `http://localhost:3000`.',
  'selfHost.fact1.title': 'Une seule fonction suffit',
  'selfHost.fact1.body':
    'Une fonction serverless peut servir à la fois l’API et ce site. La configuration pour Vercel est fournie dans le dépôt.',
  'selfHost.fact2.title': 'Redis quand vous en avez besoin',
  'selfHost.fact2.body':
    'Sans Redis, le cache vit en mémoire, instance par instance. Ajoutez `REDIS_URL` pour le partager.',
  'selfHost.fact3.title': 'Tout se règle par l’environnement',
  'selfHost.fact3.body':
    'Durées de cache, délais, concurrence du navigateur, limite de débit, ports autorisés : chaque réglage est une variable d’environnement.',
  'selfHost.cta': 'Voir le dépôt sur GitHub',
};

/** API reference page. */
export const docs = {
  'meta.title': 'Référence de l’API · LinkForge',
  'meta.description':
    'Référence complète de l’API LinkForge : points d’accès, paramètres, exemples de requêtes et de réponses, erreurs, authentification, limites de débit et cache.',

  'title': 'Référence de l’API',
  'lead':
    'Tous les points d’accès sont des requêtes `GET` sous `/api/v1`. Les exemples utilisent l’adresse de cette instance.',
  'toc.label': 'Sur cette page',
  'toc.basics': 'Principes',
  'toc.endpoints': 'Points d’accès',
  'toc.reference': 'Référence',

  'th.param': 'Paramètre',
  'th.property': 'Propriété',
  'th.field': 'Champ',
  'th.header': 'En-tête',
  'th.type': 'Type',
  'th.default': 'Défaut',
  'th.description': 'Description',
  'th.code': 'Code',
  'th.http': 'HTTP',
  'th.meaning': 'Signification',
  'required': 'obligatoire',
  'returns': 'Renvoie',
  'params': 'Paramètres de requête',
  'sample.request': 'Requête',
  'sample.response': 'Réponse',
  'sample.rules': 'Règles',
  'sample.image': 'Dans une balise image',
  'sample.embed': 'Un champ utilisé comme image',

  'quickstart.title': 'Démarrage rapide',
  'quickstart.p1':
    'Passez l’adresse de la page dans le paramètre `url`, encodée pour une URL. Aucune clé n’est nécessaire pour commencer.',
  'quickstart.p2':
    'Les réponses JSON partagent la même enveloppe. `/screenshot` et `/pdf` renvoient directement le fichier.',

  'auth.title': 'Authentification',
  'auth.p1':
    'L’API s’utilise sans authentification. L’en-tête facultatif `x-api-key` identifie votre application et relève sa limite de débit.',
  'auth.p2':
    'Les clés sont définies par l’exploitant de l’instance. Une clé inconnue est refusée avec le code `EUNAUTHORIZED` (HTTP 401) : la requête n’est pas traitée comme une requête anonyme.',

  'limits.title': 'Limites de débit',
  'limits.p1':
    'Sans clé, les requêtes sont comptées par adresse IP. Par défaut, une instance accepte 60 requêtes par minute ; l’exploitant peut changer cette valeur. Avec une clé valide, la limite est plus élevée et se compte par clé.',
  'limits.p2':
    'Au-delà de la limite, l’API répond avec le statut 429 et le code `ERATELIMIT`. Les en-têtes suivants vous permettent de l’anticiper :',
  'limits.h.limit': 'Nombre de requêtes autorisées dans la fenêtre.',
  'limits.h.remaining': 'Nombre de requêtes restantes dans la fenêtre en cours.',
  'limits.h.reset': 'Secondes avant la remise à zéro de la fenêtre.',
  'limits.h.retry': 'Présent sur une réponse 429 : secondes à attendre avant de réessayer.',
  'limits.p3': '`/health` n’est pas soumis à la limite de débit.',

  'format.title': 'Format des réponses',
  'format.p1':
    'Une réussite renvoie `status: "success"`, le résultat dans `data` et des informations sur le traitement dans `meta`.',
  'format.cached': '`true` si la réponse vient du cache.',
  'format.source':
    '`http` si une simple requête HTTP a suffi, `browser` si la page a été rendue dans Chromium.',
  'format.duration': 'Durée du traitement côté serveur, en millisecondes.',
  'format.p2':
    'Un échec renvoie `status: "fail"` quand la requête est en cause (statuts 4xx) ou `"error"` quand le serveur ou la cible est en cause (statuts 5xx), avec un `code` stable et un `message` lisible. La liste complète figure dans [Erreurs](#errors).',

  'cache.title': 'Cache',
  'cache.p1':
    'Chaque résultat est mis en cache côté serveur, sous une clé qui dépend de l’URL et des paramètres. Par défaut il y reste une heure ; l’exploitant peut changer cette durée, et le paramètre `ttl` la règle pour une requête donnée.',
  'cache.p2':
    '`force=true` ignore la lecture du cache et traite de nouveau la page. Le nouveau résultat remplace l’ancien.',
  'cache.p3':
    'L’en-tête `x-cache` vaut `HIT` ou `MISS`, et `meta.cached` reprend l’information dans les réponses JSON. Les réponses portent aussi un en-tête `cache-control` avec `max-age` et `s-maxage`, pour qu’un navigateur ou un CDN puisse les réutiliser.',
  'cache.p4':
    'Des requêtes identiques reçues en même temps sont regroupées : la page n’est traitée qu’une seule fois.',

  'render.title': 'Rendu',
  'render.p1':
    '`/meta`, `/extract` et `/content` lisent d’abord la page par une simple requête HTTP, rapide et peu coûteuse. Avec `render=auto`, un navigateur sans interface n’est lancé que si ce premier passage donne un résultat pauvre, ou si la page est une coquille d’application monopage vide.',
  'render.p2':
    '`render=never` garantit une réponse rapide. `render=always` convient aux pages entièrement construites en JavaScript. `/screenshot` et `/pdf` passent toujours par le navigateur.',
  'render.p3':
    'Limites par défaut : 10 s pour la requête HTTP, 20 s pour la navigation dans le navigateur, 5 redirections et 5 Mo de corps de réponse. L’exploitant peut les modifier.',

  'p.url':
    'Adresse absolue de la page, en `http` ou `https`, encodée pour une URL. 2 048 caractères au plus, sans identifiants.',
  'p.render':
    '`auto` lit la page en HTTP et n’ouvre un navigateur que si le résultat est pauvre. `never` reste en HTTP. `always` rend toujours la page dans le navigateur. Voir [Rendu](#rendering).',
  'p.force': 'Ignore la lecture du cache et traite de nouveau la page.',
  'p.ttl':
    'Durée de conservation du résultat dans le cache. Sans ce paramètre, la durée par défaut du serveur s’applique. Voir [Cache](#caching).',

  'meta.h': 'Métadonnées',
  'meta.intro1':
    'Renvoie les métadonnées normalisées d’une page, fusionnées à partir d’Open Graph, des Twitter Cards, du JSON-LD, des balises HTML standard et des flux. Utile pour construire des aperçus de liens, enrichir des favoris ou indexer des pages.',
  'meta.intro2':
    'Un champ que la page ne fournit pas vaut `null`, ou un tableau vide pour les listes.',
  'meta.p.embed':
    'Chemin à points vers une URL de `data`, par exemple `image.url`, `logo.url` ou `favicon`. Au lieu du JSON, l’API répond par une redirection vers cette URL : la requête s’utilise alors directement dans un attribut `src`. Si le chemin est absent ou vaut `null`, l’API répond `EEMBEDNOTFOUND` (404).',
  'meta.fields.title': 'Champs de `data`',
  'meta.f.url': 'Adresse finale, après redirections.',
  'meta.f.canonicalUrl': 'Adresse canonique déclarée par la page.',
  'meta.f.title': 'Titre de la page.',
  'meta.f.description': 'Description ou résumé.',
  'meta.f.author': 'Auteur.',
  'meta.f.publisher': 'Nom du site ou de l’éditeur.',
  'meta.f.lang': 'Langue déclarée, par exemple `fr`.',
  'meta.f.date': 'Date de publication, au format ISO 8601.',
  'meta.f.image': 'Image principale : `url`, `width`, `height`, `type`, `alt`.',
  'meta.f.images': 'Toutes les images trouvées, au même format que `image`.',
  'meta.f.favicon': 'Adresse de l’icône du site.',
  'meta.f.logo': 'Logo de l’éditeur : `url`.',
  'meta.f.video': 'Vidéo principale : `url`, `type`, `width`, `height`.',
  'meta.f.audio': 'Piste audio principale : `url`, `type`.',
  'meta.f.keywords': 'Mots-clés déclarés.',
  'meta.f.feeds': 'Flux RSS ou Atom annoncés par la page.',
  'meta.f.jsonLd': 'Blocs JSON-LD de la page, `@graph` aplati.',
  'meta.f.contentType': 'Type de contenu renvoyé par la cible.',

  'screenshot.h': 'Capture d’écran',
  'screenshot.intro1':
    'Rend la page dans un navigateur sans interface et renvoie l’image elle-même, pas du JSON. L’adresse de la requête s’utilise directement dans un attribut `src`.',
  'screenshot.note':
    'Les erreurs restent renvoyées en JSON, avec le statut HTTP correspondant. Vérifiez le statut, ou l’en-tête `content-type`, avant de traiter le corps comme une image.',
  'screenshot.p.device':
    '`desktop` utilise une fenêtre de 1280 × 800. `mobile` émule un téléphone (profil Pixel 7 : écran tactile, agent utilisateur mobile, haute densité de pixels).',
  'screenshot.p.width': 'Largeur de la fenêtre en pixels. Remplace celle du profil `device`.',
  'screenshot.p.height': 'Hauteur de la fenêtre en pixels. Remplace celle du profil `device`.',
  'screenshot.p.fullPage':
    'Capture toute la page défilable plutôt que la fenêtre. Les pages très hautes sont limitées à 12 000 px.',
  'screenshot.p.selector':
    'Sélecteur CSS d’un élément à capturer à la place de la page. S’il ne correspond à aucun élément visible, l’API répond `ESELECTORNOTFOUND` (404).',
  'screenshot.p.format': 'Format de l’image renvoyée.',
  'screenshot.p.quality': 'Qualité JPEG, de 1 à 100. Sans effet en PNG.',
  'screenshot.p.colorScheme': 'Valeur de `prefers-color-scheme` annoncée à la page.',
  'screenshot.p.hide':
    'Sélecteurs CSS à masquer avant la capture, séparés par des virgules. Pratique pour les bandeaux de cookies : `hide=.cookie-banner,#newsletter`.',
  'screenshot.p.waitFor':
    'Attente supplémentaire après le chargement, en millisecondes, pour les animations ou le contenu tardif.',

  'pdf.h': 'PDF',
  'pdf.intro1': 'Rend la page dans un navigateur sans interface et la renvoie sous forme de document PDF.',
  'pdf.note': 'Comme pour les captures, les erreurs sont renvoyées en JSON avec le statut HTTP correspondant.',
  'pdf.p.format': 'Format du papier.',
  'pdf.p.landscape': 'Orientation paysage plutôt que portrait.',
  'pdf.p.printBackground': 'Inclut les couleurs et les images d’arrière-plan.',

  'extract.h': 'Extraction',
  'extract.intro1':
    'Extrait les champs que vous décrivez. `fields` est un objet JSON, encodé pour une URL, qui associe chaque nom de champ à une règle. La réponse reprend les mêmes noms avec les valeurs extraites.',
  'extract.p.fields': 'Règles d’extraction, une par champ de sortie. Les propriétés d’une règle sont décrites ci-dessous.',
  'extract.rule.title': 'Propriétés d’une règle',
  'extract.r.selector': 'Sélecteur CSS de l’élément à lire.',
  'extract.r.attr':
    '`text` pour le texte de l’élément, ou le nom d’un attribut comme `href`, `src` ou `content`.',
  'extract.r.type':
    'Conversion appliquée à la valeur brute. `number` en extrait une valeur numérique ; `url` la résout en adresse absolue à partir de celle de la page.',
  'extract.r.all': 'Renvoie un tableau de toutes les correspondances plutôt que la première seulement.',

  'content.h': 'Contenu',
  'content.intro1':
    'Renvoie la partie lisible d’une page, sans navigation, publicité ni habillage, en texte brut et en Markdown. Pensé pour les agents IA, le résumé automatique et l’indexation.',
  'content.fields.title': 'Champs de `data`',
  'content.f.url': 'Adresse finale, après redirections.',
  'content.f.title': 'Titre du contenu.',
  'content.f.lang': 'Langue déclarée par la page.',
  'content.f.excerpt': 'Court extrait ou description.',
  'content.f.text': 'Contenu en texte brut.',
  'content.f.markdown': 'Le même contenu en Markdown : titres, listes, liens, code.',
  'content.f.wordCount': 'Nombre de mots du contenu.',
  'content.f.readingTimeMinutes': 'Temps de lecture estimé, en minutes.',

  'openapi.h': 'OpenAPI',
  'openapi.p1':
    'Renvoie la description OpenAPI 3.1 de l’API, au format JSON. Servez-vous-en pour générer un client typé ou pour l’importer dans votre outil de test d’API.',

  'health.h': 'État du service',
  'health.p1':
    'Renvoie l’état de l’instance : durée de fonctionnement, type de cache utilisé (`memory` ou `redis`) et statistiques du pool de navigateurs. Ce point d’accès n’est pas soumis à la limite de débit.',

  'errors.title': 'Erreurs',
  'errors.p1':
    'Toute erreur a la même forme, quel que soit le point d’accès, y compris ceux qui renvoient une image ou un PDF. Appuyez-vous sur `code`, qui est stable ; `message` est destiné aux humains et peut évoluer.',

  'security.title': 'Modèle de sécurité',
  'security.p1':
    'Une API qui visite des adresses fournies par ses utilisateurs est une cible classique d’attaques SSRF. LinkForge valide chaque destination avant de s’y connecter.',
  'security.li1':
    'Seuls `http` et `https` sont acceptés, sans identifiants dans l’adresse, et sur une liste de ports autorisés (80 et 443 par défaut).',
  'security.li2':
    '`localhost`, les noms internes et toute adresse non routable publiquement sont refusés : plages privées, bouclage, lien local dont `169.254.169.254`, CGNAT, IPv6 ULA, adresses IPv4 mappées. Les notations inhabituelles comme `0x7f.1` sont normalisées avant le contrôle.',
  'security.li3': 'Un seul enregistrement DNS privé suffit à faire refuser un nom d’hôte.',
  'security.li4':
    'En HTTP, la résolution DNS validée est épinglée à la connexion, et chaque redirection est revalidée.',
  'security.li5':
    'Dans le navigateur, chaque requête est interceptée et validée, sous-ressources, redirections et iframes comprises. WebSockets et service workers sont coupés.',
  'security.p2':
    'Limite connue : dans le navigateur, Chromium refait sa propre résolution DNS après ce contrôle. Le [README du dépôt](https://github.com/kayzen-lyon/linkforge#readme) décrit l’état de ce point.',
};
