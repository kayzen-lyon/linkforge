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
  'brand.home': 'Accueil Omnillink',
  'nav.label': 'Navigation principale',
  'nav.demo': 'Démo',
  'nav.features': 'Fonctionnalités',
  'nav.examples': 'Exemples',
  'nav.selfHost': 'Auto-hébergement',
  'nav.docs': 'Référence API',
  'nav.menu': 'Menu de navigation',
  'lang.label': 'Langue',
  'copy': 'Copier',
  'copied': 'Copié',
  'copyFailed': 'Copie impossible',
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
  'banner.label': 'Projet open source',
  'banner.text': 'Open source, sous licence MIT. Hébergez votre propre instance.',
  'banner.short': 'Open source, licence MIT',
  'banner.link': 'Voir sur GitHub',
  'nav.cta': 'Essayer la démo',
  'menu.label': 'Menu mobile',
  'menu.eyebrow': 'Navigation',
  'theme.dark': 'Thème sombre',
  'newTab': '(nouvel onglet)',
  'top': 'Revenir en haut de la page',
  'crumb.label': 'Fil d’Ariane',
  'crumb.home': 'Accueil',
  'a11y.toggle': 'Options d’accessibilité',
  'a11y.title': 'Accessibilité',
  'a11y.size': 'Taille du texte',
  'a11y.size.down': 'Réduire la taille du texte',
  'a11y.size.up': 'Augmenter la taille du texte',
  'a11y.size.0': 'Normale',
  'a11y.size.1': 'Grande',
  'a11y.size.2': 'Très grande',
  'a11y.contrast': 'Contraste renforcé',
  'a11y.font': 'Police lisible',
  'a11y.oled': 'Noir pur (OLED)',
  'a11y.oled.hint': 'Disponible en thème sombre',
  'a11y.reset': 'Réinitialiser les options',
  'footer.tagline':
    'Une API open source qui transforme une URL en métadonnées, captures d’écran, PDF, champs sur mesure et contenu lisible.',
  'footer.chip': 'Logiciel libre, licence MIT',
  'footer.info': 'Informations',
  'footer.faq': 'Questions fréquentes',
  'footer.accessibility': 'Accessibilité',
  'footer.legal': 'Mentions légales et confidentialité',
  'footer.notrack': 'Ce site ne dépose aucun cookie et n’utilise aucun traceur.',
  'footer.license': 'Omnillink est un logiciel libre publié sous licence MIT.',
  'footer.credit': 'Site réalisé par [KAYZEN](https://www.kayzen-lyon.com)',
  'og.alt': 'Omnillink : une URL en entrée, des métadonnées, une capture, un PDF et du contenu en sortie.',
};

/** Landing page. */
export const home = {
  'meta.title': 'Omnillink · API pour la transformation web universelle',
  'meta.description':
    'Omnillink est une API open source qui transforme une URL en métadonnées, captures d’écran, PDF, champs extraits et contenu lisible. Essayez-la en direct.',

  'hero.eyebrow': 'API pour la transformation web universelle',
  'hero.lead':
    'Omnillink est une API REST qui lit une page web à votre place : métadonnées normalisées, captures d’écran, export PDF, extraction sur mesure et texte lisible pour vos agents IA. Le code est ouvert, hébergez-la où vous voulez.',
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
  'features.lead': 'Lire une page inconnue demande plus qu’une requête. Voici ce que Omnillink fait à chaque appel.',
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
    'Omnillink est distribué sous licence MIT. Il vous faut Node.js 22 ou plus récent ; Redis est facultatif.',
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
  'hero.title.a': 'Une URL en entrée.',
  'hero.title.b': 'Métadonnées, capture, PDF et contenu en sortie.',
  'hero.chip.mit': 'Licence MIT',
  'hero.chip.selfHost': 'Auto-hébergeable',
  'hero.chip.ssrf': 'Protection SSRF',
  'hero.chip.openapi': 'OpenAPI 3.1',
  'hero.cta.github': 'Voir le code sur GitHub',
  'demo.eyebrow': 'Démo en direct',
  'usecases.eyebrow': 'Cas d’usage',
  'usecases.title': 'Pour qui, pour quoi faire',
  'usecases.lead':
    'Omnillink s’adresse aux équipes qui manipulent des liens : produits grand public, outils internes, agents IA.',
  'usecases.1.title': 'Aperçus de liens',
  'usecases.1.body':
    'Messagerie, CMS, gestionnaire de favoris : affichez le titre, l’image et la description dès qu’un lien est collé.',
  'usecases.2.title': 'Agents IA et RAG',
  'usecases.2.body':
    'Donnez à un modèle le texte d’une page en Markdown, sans menus ni publicités, plutôt que du HTML brut.',
  'usecases.3.title': 'Captures et archivage',
  'usecases.3.body':
    'Générez des vignettes, des images de partage ou une copie PDF d’une page telle qu’elle s’affiche aujourd’hui.',
  'usecases.4.title': 'Veille et collecte',
  'usecases.4.body':
    'Suivez un prix, un stock ou une liste de liens avec quelques sélecteurs CSS, sans écrire ni maintenir de scraper.',
  'how.eyebrow': 'Fonctionnement',
  'how.title': 'Comment ça marche',
  'how.lead': 'Trois étapes, une seule requête de votre côté.',
  'how.step': 'Étape {n}',
  'how.1.title': 'Vous envoyez une URL',
  'how.1.body': 'Une requête `GET` avec l’adresse de la page et, si besoin, quelques options. Aucune clé n’est requise pour commencer.',
  'how.2.title': 'Omnillink lit la page en sécurité',
  'how.2.body':
    'L’adresse est validée contre les attaques SSRF, puis la page est lue en HTTP. Chromium ne prend le relais que si elle l’exige.',
  'how.3.title': 'Vous recevez un résultat prêt à l’emploi',
  'how.3.body': 'Du JSON normalisé, une image ou un PDF. Le résultat est mis en cache pour les appels suivants.',
  'features.eyebrow': 'Fonctionnalités',
  'examples.eyebrow': 'Intégration',
  'selfHost.eyebrow': 'Open source',
  'faq.eyebrow': 'FAQ',
  'faq.title': 'Questions fréquentes',
  'faq.1.q': 'Omnillink est-il gratuit ?',
  'faq.1.a':
    'Le logiciel est libre, publié sous licence MIT : vous pouvez l’utiliser, le modifier et l’héberger vous-même. L’instance qui sert ce site est une démonstration, avec une limite de débit.',
  'faq.2.q': 'Faut-il une clé d’API ?',
  'faq.2.a':
    'Non. L’API répond sans authentification. L’en-tête facultatif `x-api-key` relève la limite de débit ; les clés sont définies par l’exploitant de chaque instance.',
  'faq.3.q': 'Quelles pages Omnillink peut-il lire ?',
  'faq.3.a':
    'Les pages publiques en `http` ou `https`. Les adresses privées, locales ou internes sont refusées par la protection SSRF. Les pages construites en JavaScript sont rendues dans Chromium quand c’est nécessaire.',
  'faq.4.q': 'Les résultats sont-ils à jour ?',
  'faq.4.a':
    'Chaque résultat est mis en cache, une heure par défaut. Le paramètre `ttl` change cette durée pour une requête, et `force=true` relit la page immédiatement.',
  'faq.5.q': 'Puis-je utiliser une capture directement dans une balise image ?',
  'faq.5.a':
    'Oui. `/screenshot` renvoie l’image elle-même, donc son adresse fonctionne dans un attribut `src`. Avec `embed`, `/meta` redirige de la même façon vers l’image ou l’icône d’une page.',
  'faq.6.q': 'Que faut-il pour l’héberger ?',
  'faq.6.a':
    'Node.js 22 ou plus récent, et Chromium, installé par Playwright. Redis est facultatif. La configuration pour un déploiement en fonction serverless sur Vercel est incluse dans le dépôt.',
  'faq.7.q': 'Ce site me suit-il ?',
  'faq.7.a':
    'Non. Il ne dépose aucun cookie et ne charge aucun outil de mesure d’audience. Vos préférences de thème, de langue et d’accessibilité restent dans votre navigateur. Le détail figure dans les [mentions légales](/legal).',
  'cta.title': 'Essayez Omnillink sur vos propres liens',
  'cta.lead': 'La démo tourne sur cette instance. Le code est sur GitHub si vous préférez l’héberger vous-même.',
};

/** API reference page. */
export const docs = {
  'meta.title': 'Référence de l’API · Omnillink',
  'meta.description':
    'Référence complète de l’API Omnillink : points d’accès, paramètres, exemples de requêtes et de réponses, erreurs, authentification, limites de débit et cache.',

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
    'Dans le navigateur, chaque requête est interceptée et validée, sous-ressources, redirections et iframes comprises. WebSockets et service workers sont coupés.',
  'security.p2':
    'Limite connue : dans le navigateur, Chromium refait sa propre résolution DNS après ce contrôle. Le [README du dépôt](https://github.com/kayzen-lyon/linkforge#readme) décrit l’état de ce point.',
  'extract.note':
    'Un champ vaut `null` quand rien ne correspond ou que la valeur ne peut pas être convertie. Les chaînes sont coupées à 10 000 caractères.',
  'html.note':
    '`/meta`, `/extract` et `/content` ont besoin d’un document HTML : pour une image, un PDF ou tout autre type de fichier, l’API répond `ENOTHTML` (422).',
};

/** Accessibility page. */
export const a11y = {
  'meta.title': 'Accessibilité · Omnillink',
  'meta.description':
    'Ce qui a été construit, vérifié et non vérifié en matière d’accessibilité sur le site Omnillink, ses limites connues et comment signaler un problème.',
  'title': 'Accessibilité',
  'updated': 'Dernière mise à jour : 18 novembre 2026',
  'intro':
    'KAYZEN veut qu’Omnillink soit utilisable par tout le monde, quels que soient le matériel, le logiciel ou la situation de handicap. Le site est construit en visant les critères WCAG 2.2 de niveau AA.',
  'notice':
    'Cette page n’est pas une déclaration de conformité. Aucun audit mené par une personne n’a encore été réalisé : elle dit ce qui a été vérifié, ce qui ne l’a pas été, et ce qui reste imparfait.',
  'built.title': 'Ce qui a été construit',
  'built.1': 'Un lien d’évitement, des régions de page identifiées, un seul titre principal par page et des titres dans l’ordre.',
  'built.2': 'Tous les contrôles sont utilisables au clavier : onglets de la démo aux flèches, menu mobile et panneau d’accessibilité refermables avec Échap, focus toujours visible.',
  'built.3': 'Les couleurs du texte, des contrôles et de l’anneau de focus sont choisies à partir de rapports de contraste calculés, en thème clair comme en thème sombre.',
  'built.4': 'Un panneau d’options, en bas à gauche de chaque page : taille du texte, contraste renforcé, police lisible Atkinson Hyperlegible, noir pur en thème sombre.',
  'built.5': 'Les animations sont courtes et désactivées lorsque votre système demande de réduire les mouvements.',
  'built.6': 'La langue de chaque page est déclarée, ainsi que celle des passages dans une autre langue.',
  'built.7': 'Les états de chargement, les résultats et les erreurs de la démo sont annoncés par du texte, jamais par la seule couleur.',
  'built.8': 'Les boutons et les liens de navigation offrent une zone d’au moins 44 pixels de côté.',
  'checked.title': 'Ce qui a été vérifié',
  'checked.intro': 'Vérifications menées le 18 novembre 2026, avec des outils automatiques et une relecture des pages rendues :',
  'checked.1': 'le rapport de contraste de chaque couple texte et fond réellement utilisé, calculé par un script pour les deux thèmes ;',
  'checked.2': 'le parcours au clavier des onglets, du menu mobile, du sélecteur de langue et du panneau d’accessibilité, dans un navigateur piloté ;',
  'checked.3': 'l’absence de défilement horizontal à 375 pixels de large et l’absence d’erreur dans la console ;',
  'checked.4': 'le rendu de chaque page en français et en anglais, en thème clair et en thème sombre, sur écran large et sur téléphone.',
  'unchecked.title': 'Ce qui n’a pas été vérifié',
  'unchecked.1': 'La restitution par les lecteurs d’écran (NVDA, JAWS, VoiceOver, TalkBack).',
  'unchecked.2': 'Un audit critère par critère, WCAG ou RGAA, par une personne formée.',
  'unchecked.3': 'La commande vocale, les contacteurs et les autres aides techniques.',
  'unchecked.4': 'Le zoom à 400 % et le mode de contraste forcé du système.',
  'unchecked.5': 'Les documents PDF produits par l’API à partir de pages tierces.',
  'limits.title': 'Limites connues',
  'limits.1': 'La démo affiche du contenu venu d’autres sites. Une capture d’écran est une image sans description détaillée : l’onglet Contenu en donne le texte.',
  'limits.2': 'La structure du contenu extrait dépend de la page d’origine ; elle peut être incomplète.',
  'limits.3': 'Les messages d’erreur renvoyés par l’API sont en anglais. Le site les accompagne d’une explication dans la langue de la page.',
  'limits.4': 'Les exemples de code longs défilent horizontalement à l’intérieur de leur bloc.',
  'settings.title': 'Adapter l’affichage',
  'settings.p':
    'Le bouton rond en bas à gauche ouvre les options d’accessibilité. Vos choix sont enregistrés dans votre navigateur et s’appliquent à toutes les pages. Le bouton en forme de lune, dans l’en-tête, bascule entre thème clair et thème sombre.',
  'contact.title': 'Signaler un problème',
  'contact.p': 'Si un contenu ou une fonction vous est inaccessible, dites-le-nous : nous chercherons une solution avec vous.',
  'contact.email': 'Par courriel : [contact@kayzen-lyon.fr](mailto:contact@kayzen-lyon.fr)',
  'contact.phone': 'Par téléphone : [+33 4 87 77 68 61](tel:+33487776861)',
  'contact.issues': 'Sur GitHub : [ouvrir un ticket](https://github.com/kayzen-lyon/linkforge/issues)',
  'disclaimer': 'Page rédigée avec l’aide d’un outil d’IA. Elle ne remplace ni un audit d’accessibilité ni un conseil juridique.',
};

/** Legal notice and privacy page. The publisher's personal name appears on this page only. */
export const legal = {
  'meta.title': 'Mentions légales et confidentialité · Omnillink',
  'meta.description':
    'Éditeur et hébergeur du site Omnillink, et ce que le site enregistre : aucun cookie, aucun traceur, des préférences conservées dans votre navigateur.',
  'title': 'Mentions légales et confidentialité',
  'updated': 'Dernière mise à jour : 18 novembre 2026',
  'intro':
    'Ce site présente Omnillink, une API open source, et en propose une démonstration. Cette page identifie son éditeur et son hébergeur, puis explique ce que le site enregistre.',
  'publisher.title': 'Éditeur du site',
  'publisher.p': 'Le site est édité par Tarek BELHADJ, entrepreneur individuel exerçant sous le nom commercial KAYZEN.',
  'publisher.form': 'Forme juridique : entreprise individuelle (micro-entreprise)',
  'publisher.seat': 'Siège social : 6 rue Pierre Termier, 69009 Lyon, France',
  'publisher.office': 'Locaux : 6 rue de Bourgogne, 69009 Lyon, France',
  'publisher.siret': 'SIRET : 493 857 262 00098',
  'publisher.siren': 'SIREN : 493 857 262',
  'publisher.ape': 'Code APE : 62.01Z',
  'publisher.vat': 'TVA non applicable, art. 293 B du CGI (franchise en base)',
  'publisher.phone': 'Téléphone : [+33 4 87 77 68 61](tel:+33487776861)',
  'publisher.email': 'Adresse électronique : [contact@kayzen-lyon.fr](mailto:contact@kayzen-lyon.fr)',
  'director.title': 'Directeur de la publication',
  'director.p': 'Tarek BELHADJ',
  'host.title': 'Hébergeur',
  'host.p': 'Le site est hébergé par Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis, [vercel.com](https://vercel.com).',
  'software.title': 'Logiciel et licence',
  'software.p':
    'Omnillink est un logiciel libre publié sous licence MIT. Son code source est disponible sur [GitHub](https://github.com/kayzen-lyon/linkforge).',
  'privacy.title': 'Ce que le site enregistre',
  'privacy.none':
    'Le site ne dépose aucun cookie. Il ne charge aucun outil de mesure d’audience, aucune publicité et aucun script tiers. Les polices sont servies par le site lui-même.',
  'storage.title': 'Préférences conservées dans votre navigateur',
  'storage.p':
    'Trois préférences sont enregistrées dans le stockage local de votre navigateur, uniquement quand vous les modifiez. Elles ne sont jamais envoyées au serveur. Vous les effacez en supprimant les données du site dans votre navigateur.',
  'storage.th.key': 'Nom',
  'storage.th.purpose': 'Rôle',
  'storage.theme': 'Thème clair ou sombre choisi.',
  'storage.lang': 'Langue choisie, français ou anglais.',
  'storage.a11y': 'Options d’accessibilité : taille du texte, contraste, police, noir pur.',
  'demo.title': 'Quand vous utilisez la démo',
  'demo.1': 'L’adresse que vous saisissez est envoyée à l’API, qui va lire cette page. Le résultat est conservé en cache sur le serveur, une heure par défaut. N’y soumettez pas d’adresse contenant un secret ou un jeton personnel.',
  'demo.2': 'L’aperçu de lien affiche l’image et l’icône de la page directement depuis le site concerné : votre navigateur contacte donc ce site, qui voit votre adresse IP. Aucune adresse de provenance ne lui est transmise.',
  'demo.3': 'Pour limiter le débit, l’API compte les requêtes par adresse IP, en mémoire, sur une fenêtre d’une minute.',
  'logs.title': 'Journaux techniques',
  'logs.p':
    'Comme tout service en ligne, l’application et son hébergeur produisent des journaux techniques : adresse IP, date et adresse demandée. Leur durée de conservation n’a pas été communiquée : **[durée à préciser par l’éditeur]**.',
  'rights.title': 'Vos droits',
  'rights.p':
    'Pour toute question sur vos données, ou pour exercer vos droits d’accès, de rectification et d’effacement, écrivez à [contact@kayzen-lyon.fr](mailto:contact@kayzen-lyon.fr). Vous pouvez aussi adresser une réclamation à la CNIL.',
  'disclaimer':
    'Page rédigée avec l’aide d’un outil d’IA à partir des informations fournies par l’éditeur. Elle ne constitue pas un conseil juridique.',
};
