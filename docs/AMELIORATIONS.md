# Omnillink — 150 améliorations

Liste de travail. État au dernier pointage : 105 livrés, 24 partiels, 21 à faire.

Chaque ligne porte un statut tenu à jour à l'intégration : `[ ]` à faire, `[x]` livré et vérifié, `[~]` partiel (la note dit ce qui manque), `[-]` écarté (la note dit pourquoi).

Règle commune à toutes les lignes : rien d'inventé. Pas de témoignages, de logos clients, de chiffres d'usage, de notes ni de prix que nous n'avons pas.

## A. Identité visuelle et finition (site)

1. [x] Sélecteur de langue identique à celui de Kayzen : drapeau seul en déclencheur, panneau au clic, endonymes, coche sur la langue active.
2. [x] Drapeaux SVG hébergés sur le site (repris du dépôt Kayzen, avec leur licence).
3. [x] Hero retravaillé : fond en dégradés radiaux doux de la charte, grille discrète, profondeur.
4. [x] Démonstration animée dans le hero : une URL se « transforme » en carte d'aperçu, capture et JSON.
5. [x] Variante du logo pour le thème sombre (la moitié marine est trop peu visible).
6. [x] Micro-interactions sur tous les boutons : pression, survol avec ombre de la charte.
7. [~] Cartes de fonctionnalités avec illustration propre à chaque point d'accès. — miniatures réelles pour six points d'accès ; carte générique pour les autres.
8. [x] Icônes en un seul jeu cohérent, tracées au même poids.
9. [x] Révélation des sections au défilement, sobre, désactivée si « moins d'animations ».
10. [x] Barre de progression de lecture en haut de page, comme sur Kayzen.
11. [x] Bouton de retour en haut avec anneau de progression.
12. [x] En-tête qui se compacte au défilement, avec fond translucide.
13. [x] Bandeau supérieur refermable, choix mémorisé.
14. [x] Blocs de code avec coloration syntaxique maison, numéros de ligne optionnels.
15. [x] Bouton « copier » sur chaque bloc de code, avec confirmation visuelle et vocale.
16. [x] Onglets à indicateur glissant.
17. [x] États de chargement en squelettes à la forme du contenu attendu.
18. [x] États vides et états d'erreur illustrés, avec action de reprise.
19. [x] Notifications discrètes (copie, erreur réseau, quota atteint).
20. [x] Tableaux de la documentation lisibles sur mobile (colonnes empilées).
21. [~] Séparateurs de section en dégradé, rythme vertical régulier. — un seul séparateur en dégradé.
22. [x] Page 404 soignée, bilingue, avec recherche et liens utiles.
23. [~] Feuille de style d'impression pour la documentation et les mentions légales. — écrite, non testée à l'impression.
24. [~] Curseur et sélection de texte aux couleurs de la charte, barres de défilement fines. — sélection et barres de défilement ; pas de curseur.
25. [x] Section « Conçu par KAYZEN » dans le pied de page, identique au site Kayzen.

## B. Navigation, langue et accessibilité (site)

26. [x] Palette de commandes (Ctrl/Cmd + K) : pages, points d'accès, actions.
27. [x] Recherche plein texte dans la documentation, sans service externe.
28. [x] Fil d'Ariane sur les pages intérieures.
29. [x] Sommaire latéral de la documentation qui suit la lecture.
30. [x] Ancres copiables sur chaque titre.
31. [~] Menu mobile en panneau, avec piège à focus et fermeture au geste. — panneau et piège à focus faits ; geste de fermeture non testé.
32. [x] Panneau d'accessibilité complet : taille du texte, interlignage, police lisible, contrastes renforcés, liens soulignés, animations réduites.
33. [x] Mémorisation de toutes les préférences, sans cookie.
34. [x] Raccourcis clavier documentés dans une fenêtre d'aide (touche « ? »).
35. [x] Lien d'évitement, repères ARIA, un seul titre de niveau 1 par page.
36. [x] Annonces vocales des résultats de la démo (zone live).
37. [~] Cibles tactiles d'au moins 44 px partout. — 44 px sur les contrôles principaux et au tactile ; petits boutons de copie à 28–32 px à la souris.
38. [x] Focus visible homogène, jamais masqué par l'en-tête collant.
39. [~] Respect de `prefers-reduced-motion`, `prefers-contrast` et `forced-colors`. — animations réduites vérifiées ; contrastes forcés non testés.
40. [x] Attribut `lang` sur chaque passage dans l'autre langue.
41. [x] Chaque langue à sa propre adresse, HTML déjà traduit côté serveur.
42. [x] Bascule de langue sans perdre l'état de la démo.
43. [x] Bascule de thème à trois états : clair, sombre, système.
44. [x] Transition de thème sans flash au chargement.
45. [x] Déclaration d'accessibilité à jour avec la liste de ce qui a été contrôlé.

## C. Démo et bac à sable (site)

46. [x] Bac à sable complet sur une page dédiée (`/playground`).
47. [x] Formulaire de paramètres généré depuis la spécification OpenAPI.
48. [x] Adresse de la requête mise à jour en direct, copiable.
49. [x] Partage d'une démo par lien (l'état est dans l'adresse).
50. [x] Historique local des dernières requêtes, effaçable.
51. [x] Exemples prêts à cliquer (article, boutique, vidéo, documentation, application).
52. [x] Aperçu de carte en plusieurs formats : compact, large, style messagerie.
53. [x] Capture affichée dans un cadre d'appareil (ordinateur, mobile).
54. [~] Comparateur avant/après : clair et sombre, ordinateur et mobile. — deux captures côte à côte, sans curseur de comparaison.
55. [x] Téléchargement du résultat : image, PDF, JSON, Markdown.
56. [x] Visionneuse JSON repliable avec recherche et copie d'un chemin.
57. [x] Rendu Markdown et vue source côte à côte pour le contenu.
58. [x] Éditeur de règles d'extraction avec validation en direct et modèles.
59. [x] Affichage du temps de réponse, de la source (HTTP ou navigateur) et de l'état du cache.
60. [x] Affichage du quota restant lu dans les en-têtes de réponse.
61. [x] Champ de clé d'API facultatif, gardé en mémoire de session uniquement.
62. [x] Générateur de code en huit langages : curl, JavaScript, TypeScript (SDK), Python, PHP, Go, Ruby, Rust.
63. [x] Générateur de balise `<img>` et de carte `<link-preview>` prête à coller.
64. [ ] Démonstration en direct du composant `<link-preview>`. — le composant du SDK n'est pas encore branché dans le site.
65. [x] Traitement par lot : coller plusieurs adresses, tableau de résultats, export CSV.
66. [x] Messages d'erreur expliqués, avec la cause probable et la correction.
67. [x] Annulation d'une requête en cours.
68. [~] Collage direct d'une adresse depuis le presse-papiers et glisser-déposer d'un lien. — collage écrit, glisser-déposer non testé.
69. [x] Aucune requête vers un site tiers tant que le visiteur n'a pas lancé la démo.
70. [~] Mode plein écran pour les résultats. — écrit, non testé.

## D. Documentation et expérience développeur (site)

71. [x] Guide de démarrage en cinq minutes.
72. [~] Page par point d'accès, avec paramètres, exemples et erreurs. — une section par point d'accès principal, pas une page chacun.
73. [x] Explorateur interactif branché sur la spécification OpenAPI (« essayer »).
74. [~] Téléchargement de la spécification OpenAPI et d'une collection Postman/Bruno. — OpenAPI et collection Postman ; pas de fichier Bruno.
75. [x] Guide d'auto-hébergement : Vercel, Node, variables d'environnement.
76. [x] Guide du SDK et du composant `<link-preview>`.
77. [~] Guide pour agents IA : contenu lisible, serveur MCP, `llms.txt`. — guide et llms.txt faits ; MCP pas encore décrit sur le site.
78. [x] Recettes : aperçus de liens dans un blog, images de partage, veille de prix, archivage en PDF.
79. [x] Référence des codes d'erreur avec causes et remèdes.
80. [x] Page sécurité : modèle de menace, protection SSRF, ce qui est couvert ou non.
81. [x] Page limites et quotas : débits, tailles, durées.
82. [ ] Journal des modifications alimenté par le dépôt. — pas de journal des modifications à publier pour l'instant.
83. [ ] Feuille de route publique. — feuille de route à réécrire pour une publication.
84. [x] Page d'état branchée sur `/health` (disponibilité mesurée en direct, sans historique inventé).
85. [x] FAQ authentique, balisée en données structurées.
86. [x] Glossaire (Open Graph, JSON-LD, oEmbed, SSRF…).
87. [x] Bouton « modifier cette page sur GitHub ».
88. [x] Version de l'API et date de mise à jour affichées.
89. [x] `llms.txt` et `llms-full.txt` servis par le site.
90. [x] Fichier `security.txt` et `humans.txt`.

## E. SXO et performance (site)

91. [x] Titre et description uniques par page et par langue.
92. [x] Balises `hreflang` et canoniques cohérentes sur toutes les pages.
93. [~] Image de partage par langue, générée au build. — image anglaise produite par un script ponctuel, pas au build.
94. [x] Données structurées : application, organisation, fil d'Ariane, FAQ, documentation technique.
95. [x] Plan du site avec alternatives de langue et dates de modification.
96. [x] Préchargement des polices critiques, sous-ensembles latins.
97. [~] Aucun décalage de mise en page (dimensions réservées, polices de repli ajustées). — dimensions réservées ; décalage non mesuré.
98. [x] JavaScript découpé par page, rien d'inutile au premier affichage.
99. [~] Images en AVIF/WebP avec dimensions et chargement différé. — WebP avec dimensions ; pas d'AVIF.
100. [x] Mise en cache longue des fichiers empreintés, revalidation du HTML.
101. [~] Compression Brotli vérifiée sur chaque type de fichier. — tailles Brotli calculées au build ; compression servie par la plateforme, non contrôlée.
102. [x] En-têtes de sécurité : CSP stricte, HSTS, Referrer-Policy, Permissions-Policy, X-Content-Type-Options.
103. [~] Application installable (manifeste, icônes, page hors ligne). — manifeste, icônes, page hors ligne et service worker ; hors-ligne non testé de bout en bout.
104. [x] Budget de performance contrôlé au build (poids par page).
105. [ ] Audit Lighthouse automatisé sur les pages clés, scores publiés tels que mesurés. — Lighthouse non installé.

## F. Fonctionnalités de l'API

106. [x] `/content` : liens, images, citations, sortie Markdown directe, indicateur de troncature.
107. [x] `/meta` : date de modification, type, couleur de thème, robots, oEmbed, alternatives de langue, cartes Twitter, paywall, domaine.
108. [x] Métadonnées par lot (`POST /meta/batch`, 10 adresses).
109. [ ] Palette de couleurs dominantes de l'image principale. — en cours (suite de l'API).
110. [x] Dimensions et poids réels des images (lecture de l'en-tête seulement).
111. [ ] Résolution oEmbed : lecteur intégré normalisé. — en cours (suite de l'API).
112. [~] Détection des technologies d'une page (CMS, framework, analytique). — point d'accès /tech en ligne, mais détection encore pauvre sur les sites modernes (renforcement en cours).
113. [x] `/links` : liens d'une page, internes et externes, avec texte et attributs `rel`.
114. [x] `/sitemap` : lecture d'un plan de site et de `robots.txt`, bornée.
115. [ ] `/favicon` : meilleure icône d'un site, redimensionnée. — en cours (suite de l'API).
116. [x] `/health/url` : état d'un lien (statut, redirections, durée, certificat).
117. [ ] `/og` : génération d'image de partage à partir d'un titre et d'un modèle. — en cours (suite de l'API).
118. [ ] `/qr` : code QR d'une adresse. — en cours (suite de l'API).
119. [~] Capture : attente d'un sélecteur, défilement pour le contenu différé, masquage des bandeaux cookies. — attente d'un sélecteur, défilement et masquage des bandeaux faits.
120. [ ] Capture : clic et défilement vers un élément avant la prise. — en cours (suite de l'API).
121. [ ] Capture : cadre d'appareil et arrondis optionnels. — en cours (suite de l'API).
122. [ ] PDF : marges, échelle, en-tête et pied de page, plage de pages. — en cours (suite de l'API).
123. [ ] Extraction : modèles prêts à l'emploi (article, produit, recette, événement). — en cours (suite de l'API).
124. [ ] Extraction : sortie de tableaux HTML en JSON et CSV. — en cours (suite de l'API).
125. [~] Sorties `format=json|markdown|text|html` cohérentes sur les points d'accès de contenu. — json, markdown, texte sur /content et HTML rendu via /html.
126. [x] `ETag` et réponses 304, en-tête de source de rendu.
127. [~] Blocage optionnel des publicités et traceurs pendant le rendu. — liste intégrée courte, désactivée par défaut.
128. [x] Détection des pages de blocage anti-robot, jamais mises en cache.
129. [~] Spécification OpenAPI complète, avec exemples par point d'accès. — exemples sur les nouveaux points d'accès seulement.
130. [ ] Point d'accès MCP : les fonctions de l'API exposées comme outils pour agents. — en cours (suite de l'API).

## G. Sécurité et fiabilité de l'API

131. [x] Proxy de validation interne : chaque connexion du navigateur est contrôlée, redirections comprises.
132. [x] Tests d'attaque : redirection vers une adresse interne, sous-ressource piégée, rebinding DNS.
133. [x] Délai global par requête, dérivé de la limite de la plateforme.
134. [x] Rendu qui se dégrade au lieu d'échouer quand une page ne finit pas de charger.
135. [x] Identité de navigateur cohérente.
136. [ ] Limites strictes : taille des réponses, nombre de requêtes par page, téléchargements bloqués. — en cours (suite de l'API).
137. [ ] Débit partagé entre instances quand Redis est configuré. — en cours (suite de l'API).
138. [ ] Disjoncteur par domaine cible. — en cours (suite de l'API).
139. [ ] Journal structuré avec identifiant de requête, sans donnée personnelle. — en cours (suite de l'API).
140. [ ] Métriques au format Prometheus (latences, taux de cache, recours au navigateur). — en cours (suite de l'API).
141. [x] Corrections des défauts relevés par l'étude comparative (dates, langues CJK, JSON-LD, Markdown).
142. [ ] Corpus de non-régression de pages réelles figées. — en cours (suite de l'API).

## H. Outils pour développeurs

143. [x] SDK TypeScript publié dans le dépôt, typé de bout en bout.
144. [x] Composant `<link-preview>` thémable.
145. [x] Enveloppe React du composant d'aperçu.
146. [x] Outil en ligne de commande (`omnillink meta|shot|pdf|extract|content`).
147. [x] Serveur MCP autonome (paquet) branché sur n'importe quelle instance.
148. [x] Action GitHub : aperçu ou capture d'une adresse dans une pull request.
149. [~] Exemples d'intégration : Next.js, Astro, simple page HTML. — exemple HTML vérifié dans un navigateur ; Next.js seulement typé ; Astro non exécuté.
150. [x] Intégration continue : types, tests, build, audit de dépendances, taille des paquets.
