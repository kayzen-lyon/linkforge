/** French text: docs. Values accept `code`, **strong** and [label](href); placeholders look like {name}. */
export const docs = {
  'meta.title': 'Référence de l’API · Omnillink',
  'meta.description':
    'Référence complète de l’API Omnillink : points d’accès, paramètres, exemples de requêtes et de réponses, erreurs, authentification, limites de débit et cache.',

  'title': 'Référence de l’API',
  'lead':
    'Tous les points d’accès sont des requêtes `GET` sous `/api/v1`, sauf le lot de métadonnées et le point d’accès MCP, qui sont des `POST`. Les exemples utilisent l’adresse de cette instance.',
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
    'Les clés sont définies par l’exploitant de l’instance, avec la variable `API_KEYS`. Quand l’instance en déclare, une clé inconnue est refusée avec le code `EUNAUTHORIZED` (HTTP 401) : la requête n’est pas traitée comme anonyme. Quand elle n’en déclare aucune, l’en-tête est ignoré.',

  'limits.title': 'Limites de débit',
  'limits.p1':
    'Sans clé, les requêtes sont comptées par adresse IP : 60 par minute par défaut. Avec une clé valide, elles sont comptées par clé : 600 par minute par défaut. L’exploitant règle ces valeurs avec `RATE_LIMIT_MAX`, `RATE_LIMIT_KEY_MAX` et `RATE_LIMIT_WINDOW_MS`.',
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
  'p.force': 'Ignore la lecture du cache et traite de nouveau la page. Le nouveau résultat est tout de même enregistré.',
  'p.ttl':
    'Durée de conservation du résultat dans le cache, en secondes, de 60 à 86 400. Elle fixe aussi la durée annoncée dans `cache-control`. Sans ce paramètre, la durée par défaut du serveur s’applique. Voir [Cache](#caching).',

  'meta.h': 'Métadonnées',
  'meta.intro1':
    'Renvoie les métadonnées normalisées d’une page, fusionnées à partir d’Open Graph, des Twitter Cards, du JSON-LD, des balises HTML standard et des flux. Utile pour construire des aperçus de liens, enrichir des favoris ou indexer des pages.',
  'meta.intro2':
    'Un champ que la page ne fournit pas vaut `null`, ou un tableau vide pour les listes.',
  'meta.p.embed':
    'Chemin à points vers une URL de `data`, par exemple `image.url`, `logo.url`, `favicon` ou `images.0.url`. Au lieu du JSON, l’API répond par une redirection vers cette URL : la requête s’utilise alors directement dans un attribut `src`. Si le chemin est absent ou vaut `null`, l’API répond `EEMBEDNOTFOUND` (404).',
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
  'meta.f.logo': 'Meilleure icône de marque, sous la forme `url` : logo déclaré en JSON-LD, sinon la plus grande icône de la page.',
  'meta.f.video': 'Vidéo principale : `url`, `type`, `width`, `height`.',
  'meta.f.audio': 'Piste audio principale : `url`, `type`.',
  'meta.f.keywords': 'Mots-clés déclarés.',
  'meta.f.feeds': 'Flux RSS ou Atom annoncés par la page : `url`, `title`, `type`.',
  'meta.f.jsonLd': 'Blocs JSON-LD de la page, `@graph` aplati.',
  'meta.f.contentType': 'Type de contenu renvoyé par la cible.',

  'screenshot.h': 'Capture d’écran',
  'screenshot.intro1':
    'Rend la page dans un navigateur sans interface et renvoie l’image elle-même, pas du JSON. L’adresse de la requête s’utilise directement dans un attribut `src`.',
  'screenshot.note':
    'Les erreurs restent renvoyées en JSON, avec le statut HTTP correspondant. Vérifiez le statut, ou l’en-tête `content-type`, avant de traiter le corps comme une image.',
  'screenshot.p.device':
    '`desktop` utilise une fenêtre de 1280 × 800. `mobile` émule un téléphone (profil Pixel 7 : écran tactile, agent utilisateur mobile, haute densité de pixels).',
  'screenshot.p.width': 'Largeur de la fenêtre en pixels CSS, de 320 à 2560. Remplace celle du profil `device`.',
  'screenshot.p.height': 'Hauteur de la fenêtre en pixels CSS, de 240 à 2160. Remplace celle du profil `device`.',
  'screenshot.p.fullPage':
    'Capture toute la page défilable plutôt que la fenêtre, dans la limite de 12 000 px de haut. Ignoré avec `selector`.',
  'screenshot.p.selector':
    'Sélecteur CSS : seul le premier élément correspondant est capturé. S’il ne correspond à aucun élément visible, l’API répond `ESELECTORNOTFOUND` (404).',
  'screenshot.p.format': 'Format de l’image renvoyée.',
  'screenshot.p.quality': 'Qualité JPEG, de 1 à 100. Sans effet en PNG.',
  'screenshot.p.colorScheme': 'Valeur de `prefers-color-scheme` annoncée à la page. Sans ce paramètre, rien n’est imposé.',
  'screenshot.p.hide':
    'Sélecteurs CSS à masquer avant la capture, séparés par des virgules, 20 au plus. Pratique pour les bandeaux de cookies : `hide=.cookie-banner,#newsletter`.',
  'screenshot.p.waitFor':
    'Attente supplémentaire avant la capture, en millisecondes, de 0 à 10 000.',

  'pdf.h': 'PDF',
  'pdf.intro1': 'Rend la page dans un navigateur sans interface, avec sa feuille de style d’impression, et la renvoie sous forme de document PDF. Le document compte 100 pages au plus ; au-delà de la taille maximale, l’API répond `ETOOLARGE` (422).',
  'pdf.note': 'Comme pour les captures, les erreurs sont renvoyées en JSON avec le statut HTTP correspondant.',
  'pdf.p.format': 'Format du papier.',
  'pdf.p.landscape': 'Orientation paysage plutôt que portrait.',
  'pdf.p.printBackground': 'Inclut les couleurs et les images d’arrière-plan.',

  'extract.h': 'Extraction',
  'extract.intro1':
    'Extrait les champs que vous décrivez. `fields` est un objet JSON, encodé pour une URL, qui associe chaque nom de champ à une règle. La réponse reprend les mêmes noms avec les valeurs extraites.',
  'extract.p.fields': 'Objet JSON encodé pour une URL : une règle par champ de sortie, 20 champs au plus. Les propriétés d’une règle sont décrites ci-dessous.',
  'extract.rule.title': 'Propriétés d’une règle',
  'extract.r.selector': 'Sélecteur CSS de l’élément à lire, 300 caractères au plus.',
  'extract.r.attr':
    '`text` pour le texte de l’élément, `html` pour son contenu HTML, ou le nom d’un attribut comme `href`, `src` ou `content`.',
  'extract.r.type':
    'Conversion appliquée à la valeur brute : `string`, `number` (valeur numérique) ou `url` (adresse absolue, résolue à partir de celle de la page).',
  'extract.r.all': 'Renvoie un tableau de toutes les correspondances, 100 au plus, plutôt que la première seulement.',

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
  'content.f.readingTimeMinutes': 'Temps de lecture estimé, en minutes, à 200 mots par minute et arrondi au supérieur.',

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
    'Une API qui visite des adresses fournies par ses utilisateurs est une cible classique d’attaques SSRF. Omnillink valide chaque destination avant de s’y connecter.',
  'security.li1':
    'Seuls `http` et `https` sont acceptés, sans identifiants dans l’adresse, et sur une liste de ports autorisés (80 et 443 par défaut).',
  'security.li2':
    '`localhost`, les noms internes et toute adresse non routable publiquement sont refusés : plages privées, bouclage, lien local dont `169.254.169.254`, CGNAT, IPv6 ULA, adresses IPv4 mappées. Les notations inhabituelles comme `0x7f.1` sont normalisées avant le contrôle.',
  'security.li3': 'Un seul enregistrement DNS privé suffit à faire refuser un nom d’hôte.',
  'security.li4':
    'En HTTP, la résolution DNS validée est épinglée à la connexion, et chaque redirection est revalidée.',
  'security.li5':
    'Dans le navigateur, deux couches. Chaque requête émise par la page est interceptée et validée ; WebSockets et service workers sont coupés. Et Chromium n’a pour seule sortie réseau qu’un proxy interne à l’API : à chaque connexion, redirections comprises, ce proxy applique la politique, résout le nom lui-même et se connecte à l’adresse qu’il vient de valider.',
  'security.p2':
    'Ce qui n’est pas couvert : ce proxy vit dans le même processus que l’API. Il ne remplace pas un filtrage de sortie au niveau du réseau (pare-feu, VPC), qui reste recommandé en défense en profondeur. La protection porte sur les destinations que le navigateur peut joindre, pas sur ce que fait une page une fois chargée. Le [README du dépôt](https://github.com/kayzen-lyon/linkforge#readme) donne le détail.',
  'extract.note':
    'Un champ vaut `null` quand rien ne correspond ou que la valeur ne peut pas être convertie. Les chaînes sont coupées à 10 000 caractères.',
  'html.note':
    '`/meta`, `/extract` et `/content` ont besoin d’un document HTML : pour une image, un PDF ou tout autre type de fichier, l’API répond `ENOTHTML` (422).',
  'spec.note': 'Les sections qui suivent, et les tableaux « Autres paramètres », suivent la spécification OpenAPI de l’API : noms, types et valeurs par défaut en sont tirés tels quels.',
  'params.more': 'Autres paramètres',
};
