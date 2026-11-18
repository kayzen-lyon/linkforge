# Omnillink — 150 améliorations

Liste de travail. Chaque ligne porte un statut tenu à jour à l'intégration : `[ ]` à faire, `[x]` livré et vérifié, `[~]` partiel (la note dit ce qui manque), `[-]` écarté (la note dit pourquoi).

Règle commune à toutes les lignes : rien d'inventé. Pas de témoignages, de logos clients, de chiffres d'usage, de notes ni de prix que nous n'avons pas.

## A. Identité visuelle et finition (site)

1. [ ] Sélecteur de langue identique à celui de Kayzen : drapeau seul en déclencheur, panneau au clic, endonymes, coche sur la langue active.
2. [ ] Drapeaux SVG hébergés sur le site (repris du dépôt Kayzen, avec leur licence).
3. [ ] Hero retravaillé : fond en dégradés radiaux doux de la charte, grille discrète, profondeur.
4. [ ] Démonstration animée dans le hero : une URL se « transforme » en carte d'aperçu, capture et JSON.
5. [ ] Variante du logo pour le thème sombre (la moitié marine est trop peu visible).
6. [ ] Micro-interactions sur tous les boutons : pression, survol avec ombre de la charte.
7. [ ] Cartes de fonctionnalités avec illustration propre à chaque point d'accès.
8. [ ] Icônes en un seul jeu cohérent, tracées au même poids.
9. [ ] Révélation des sections au défilement, sobre, désactivée si « moins d'animations ».
10. [ ] Barre de progression de lecture en haut de page, comme sur Kayzen.
11. [ ] Bouton de retour en haut avec anneau de progression.
12. [ ] En-tête qui se compacte au défilement, avec fond translucide.
13. [ ] Bandeau supérieur refermable, choix mémorisé.
14. [ ] Blocs de code avec coloration syntaxique maison, numéros de ligne optionnels.
15. [ ] Bouton « copier » sur chaque bloc de code, avec confirmation visuelle et vocale.
16. [ ] Onglets à indicateur glissant.
17. [ ] États de chargement en squelettes à la forme du contenu attendu.
18. [ ] États vides et états d'erreur illustrés, avec action de reprise.
19. [ ] Notifications discrètes (copie, erreur réseau, quota atteint).
20. [ ] Tableaux de la documentation lisibles sur mobile (colonnes empilées).
21. [ ] Séparateurs de section en dégradé, rythme vertical régulier.
22. [ ] Page 404 soignée, bilingue, avec recherche et liens utiles.
23. [ ] Feuille de style d'impression pour la documentation et les mentions légales.
24. [ ] Curseur et sélection de texte aux couleurs de la charte, barres de défilement fines.
25. [ ] Section « Conçu par KAYZEN » dans le pied de page, identique au site Kayzen.

## B. Navigation, langue et accessibilité (site)

26. [ ] Palette de commandes (Ctrl/Cmd + K) : pages, points d'accès, actions.
27. [ ] Recherche plein texte dans la documentation, sans service externe.
28. [ ] Fil d'Ariane sur les pages intérieures.
29. [ ] Sommaire latéral de la documentation qui suit la lecture.
30. [ ] Ancres copiables sur chaque titre.
31. [ ] Menu mobile en panneau, avec piège à focus et fermeture au geste.
32. [ ] Panneau d'accessibilité complet : taille du texte, interlignage, police lisible, contrastes renforcés, liens soulignés, animations réduites.
33. [ ] Mémorisation de toutes les préférences, sans cookie.
34. [ ] Raccourcis clavier documentés dans une fenêtre d'aide (touche « ? »).
35. [ ] Lien d'évitement, repères ARIA, un seul titre de niveau 1 par page.
36. [ ] Annonces vocales des résultats de la démo (zone live).
37. [ ] Cibles tactiles d'au moins 44 px partout.
38. [ ] Focus visible homogène, jamais masqué par l'en-tête collant.
39. [ ] Respect de `prefers-reduced-motion`, `prefers-contrast` et `forced-colors`.
40. [ ] Attribut `lang` sur chaque passage dans l'autre langue.
41. [ ] Chaque langue à sa propre adresse, HTML déjà traduit côté serveur.
42. [ ] Bascule de langue sans perdre l'état de la démo.
43. [ ] Bascule de thème à trois états : clair, sombre, système.
44. [ ] Transition de thème sans flash au chargement.
45. [ ] Déclaration d'accessibilité à jour avec la liste de ce qui a été contrôlé.

## C. Démo et bac à sable (site)

46. [ ] Bac à sable complet sur une page dédiée (`/playground`).
47. [ ] Formulaire de paramètres généré depuis la spécification OpenAPI.
48. [ ] Adresse de la requête mise à jour en direct, copiable.
49. [ ] Partage d'une démo par lien (l'état est dans l'adresse).
50. [ ] Historique local des dernières requêtes, effaçable.
51. [ ] Exemples prêts à cliquer (article, boutique, vidéo, documentation, application).
52. [ ] Aperçu de carte en plusieurs formats : compact, large, style messagerie.
53. [ ] Capture affichée dans un cadre d'appareil (ordinateur, mobile).
54. [ ] Comparateur avant/après : clair et sombre, ordinateur et mobile.
55. [ ] Téléchargement du résultat : image, PDF, JSON, Markdown.
56. [ ] Visionneuse JSON repliable avec recherche et copie d'un chemin.
57. [ ] Rendu Markdown et vue source côte à côte pour le contenu.
58. [ ] Éditeur de règles d'extraction avec validation en direct et modèles.
59. [ ] Affichage du temps de réponse, de la source (HTTP ou navigateur) et de l'état du cache.
60. [ ] Affichage du quota restant lu dans les en-têtes de réponse.
61. [ ] Champ de clé d'API facultatif, gardé en mémoire de session uniquement.
62. [ ] Générateur de code en huit langages : curl, JavaScript, TypeScript (SDK), Python, PHP, Go, Ruby, Rust.
63. [ ] Générateur de balise `<img>` et de carte `<link-preview>` prête à coller.
64. [ ] Démonstration en direct du composant `<link-preview>`.
65. [ ] Traitement par lot : coller plusieurs adresses, tableau de résultats, export CSV.
66. [ ] Messages d'erreur expliqués, avec la cause probable et la correction.
67. [ ] Annulation d'une requête en cours.
68. [ ] Collage direct d'une adresse depuis le presse-papiers et glisser-déposer d'un lien.
69. [ ] Aucune requête vers un site tiers tant que le visiteur n'a pas lancé la démo.
70. [ ] Mode plein écran pour les résultats.

## D. Documentation et expérience développeur (site)

71. [ ] Guide de démarrage en cinq minutes.
72. [ ] Page par point d'accès, avec paramètres, exemples et erreurs.
73. [ ] Explorateur interactif branché sur la spécification OpenAPI (« essayer »).
74. [ ] Téléchargement de la spécification OpenAPI et d'une collection Postman/Bruno.
75. [ ] Guide d'auto-hébergement : Vercel, Node, variables d'environnement.
76. [ ] Guide du SDK et du composant `<link-preview>`.
77. [ ] Guide pour agents IA : contenu lisible, serveur MCP, `llms.txt`.
78. [ ] Recettes : aperçus de liens dans un blog, images de partage, veille de prix, archivage en PDF.
79. [ ] Référence des codes d'erreur avec causes et remèdes.
80. [ ] Page sécurité : modèle de menace, protection SSRF, ce qui est couvert ou non.
81. [ ] Page limites et quotas : débits, tailles, durées.
82. [ ] Journal des modifications alimenté par le dépôt.
83. [ ] Feuille de route publique.
84. [ ] Page d'état branchée sur `/health` (disponibilité mesurée en direct, sans historique inventé).
85. [ ] FAQ authentique, balisée en données structurées.
86. [ ] Glossaire (Open Graph, JSON-LD, oEmbed, SSRF…).
87. [ ] Bouton « modifier cette page sur GitHub ».
88. [ ] Version de l'API et date de mise à jour affichées.
89. [ ] `llms.txt` et `llms-full.txt` servis par le site.
90. [ ] Fichier `security.txt` et `humans.txt`.

## E. SXO et performance (site)

91. [ ] Titre et description uniques par page et par langue.
92. [ ] Balises `hreflang` et canoniques cohérentes sur toutes les pages.
93. [ ] Image de partage par langue, générée au build.
94. [ ] Données structurées : application, organisation, fil d'Ariane, FAQ, documentation technique.
95. [ ] Plan du site avec alternatives de langue et dates de modification.
96. [ ] Préchargement des polices critiques, sous-ensembles latins.
97. [ ] Aucun décalage de mise en page (dimensions réservées, polices de repli ajustées).
98. [ ] JavaScript découpé par page, rien d'inutile au premier affichage.
99. [ ] Images en AVIF/WebP avec dimensions et chargement différé.
100. [ ] Mise en cache longue des fichiers empreintés, revalidation du HTML.
101. [ ] Compression Brotli vérifiée sur chaque type de fichier.
102. [ ] En-têtes de sécurité : CSP stricte, HSTS, Referrer-Policy, Permissions-Policy, X-Content-Type-Options.
103. [ ] Application installable (manifeste, icônes, page hors ligne).
104. [ ] Budget de performance contrôlé au build (poids par page).
105. [ ] Audit Lighthouse automatisé sur les pages clés, scores publiés tels que mesurés.

## F. Fonctionnalités de l'API

106. [ ] `/content` : liens, images, citations, sortie Markdown directe, indicateur de troncature.
107. [ ] `/meta` : date de modification, type, couleur de thème, robots, oEmbed, alternatives de langue, cartes Twitter, paywall, domaine.
108. [ ] Métadonnées par lot (`POST /meta/batch`, 10 adresses).
109. [ ] Palette de couleurs dominantes de l'image principale.
110. [ ] Dimensions et poids réels des images (lecture de l'en-tête seulement).
111. [ ] Résolution oEmbed : lecteur intégré normalisé.
112. [ ] Détection des technologies d'une page (CMS, framework, analytique).
113. [ ] `/links` : liens d'une page, internes et externes, avec texte et attributs `rel`.
114. [ ] `/sitemap` : lecture d'un plan de site et de `robots.txt`, bornée.
115. [ ] `/favicon` : meilleure icône d'un site, redimensionnée.
116. [ ] `/health/url` : état d'un lien (statut, redirections, durée, certificat).
117. [ ] `/og` : génération d'image de partage à partir d'un titre et d'un modèle.
118. [ ] `/qr` : code QR d'une adresse.
119. [ ] Capture : attente d'un sélecteur, défilement pour le contenu différé, masquage des bandeaux cookies.
120. [ ] Capture : clic et défilement vers un élément avant la prise.
121. [ ] Capture : cadre d'appareil et arrondis optionnels.
122. [ ] PDF : marges, échelle, en-tête et pied de page, plage de pages.
123. [ ] Extraction : modèles prêts à l'emploi (article, produit, recette, événement).
124. [ ] Extraction : sortie de tableaux HTML en JSON et CSV.
125. [ ] Sorties `format=json|markdown|text|html` cohérentes sur les points d'accès de contenu.
126. [ ] `ETag` et réponses 304, en-tête de source de rendu.
127. [ ] Blocage optionnel des publicités et traceurs pendant le rendu.
128. [ ] Détection des pages de blocage anti-robot, jamais mises en cache.
129. [ ] Spécification OpenAPI complète, avec exemples par point d'accès.
130. [ ] Point d'accès MCP : les fonctions de l'API exposées comme outils pour agents.

## G. Sécurité et fiabilité de l'API

131. [ ] Proxy de validation interne : chaque connexion du navigateur est contrôlée, redirections comprises.
132. [ ] Tests d'attaque : redirection vers une adresse interne, sous-ressource piégée, rebinding DNS.
133. [ ] Délai global par requête, dérivé de la limite de la plateforme.
134. [ ] Rendu qui se dégrade au lieu d'échouer quand une page ne finit pas de charger.
135. [ ] Identité de navigateur cohérente.
136. [ ] Limites strictes : taille des réponses, nombre de requêtes par page, téléchargements bloqués.
137. [ ] Débit partagé entre instances quand Redis est configuré.
138. [ ] Disjoncteur par domaine cible.
139. [ ] Journal structuré avec identifiant de requête, sans donnée personnelle.
140. [ ] Métriques au format Prometheus (latences, taux de cache, recours au navigateur).
141. [ ] Corrections des défauts relevés par l'étude comparative (dates, langues CJK, JSON-LD, Markdown).
142. [ ] Corpus de non-régression de pages réelles figées.

## H. Outils pour développeurs

143. [ ] SDK TypeScript publié dans le dépôt, typé de bout en bout.
144. [ ] Composant `<link-preview>` thémable.
145. [ ] Enveloppe React du composant d'aperçu.
146. [ ] Outil en ligne de commande (`omnillink meta|shot|pdf|extract|content`).
147. [ ] Serveur MCP autonome (paquet) branché sur n'importe quelle instance.
148. [ ] Action GitHub : aperçu ou capture d'une adresse dans une pull request.
149. [ ] Exemples d'intégration : Next.js, Astro, simple page HTML.
150. [ ] Intégration continue : types, tests, build, audit de dépendances, taille des paquets.
