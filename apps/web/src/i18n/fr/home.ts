/** French text: home. Values accept `code`, **strong** and [label](href); placeholders look like {name}. */
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
  'how.step.1': 'Étape 1',
  'how.step.2': 'Étape 2',
  'how.step.3': 'Étape 3',
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
