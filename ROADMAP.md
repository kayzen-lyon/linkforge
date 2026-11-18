# Feuille de route Omnillink

Objectif : un service open-source et performant d'extraction de métadonnées, de captures d'écran et d'aperçus de liens, auto-hébergeable, avec une offre hébergée optionnelle.

Les durées sont des ordres de grandeur pour une à deux personnes à temps plein. Ce sont des estimations, pas des engagements.

## État actuel (v0.1 — ce dépôt)

| Brique | État |
| --- | --- |
| `GET /api/v1/meta` (titre, description, auteur, images OG, favicon, JSON-LD, fallback HTTP → navigateur) | Fait, testé |
| `GET /api/v1/screenshot` (desktop / mobile, PNG / JPEG, pleine page) | Fait, testé |
| Anti-SSRF (validation URL, plages IP, DNS épinglé, interception navigateur) | Fait, testé — limite connue sur le rebinding côté navigateur |
| Pool Chromium (concurrence bornée, file, délai dur, recyclage, reprise après crash) | Fait, testé en nominal — pas encore testé en charge |
| Cache mémoire LRU + Redis, déduplication des requêtes concurrentes | Fait, testé |
| Erreurs typées, rate limiting par IP, CORS, health check | Fait |
| Playground Vite + Tailwind | Fait |
| Déploiement Vercel (fonction unique servant l'API et le playground, Chromium serverless) | En ligne, vérifié (meta, capture, blocage SSRF) |

---

## Phase 0 — Cadrage et analyse concurrentielle (≈ 1 semaine)

But : savoir précisément quoi construire et pourquoi quelqu'un changerait de fournisseur.

- [ ] **Inventaire fonctionnel des services comparables** à partir de leur documentation publique : paramètres d'API, formats de réponse, limites des offres gratuites, tarifs. Consigner le résultat avec la date du relevé.
- [ ] **Étudier les briques open-source existantes** plutôt que de deviner : lire le code publié et vérifier la licence de chaque dépôt avant de s'en inspirer.
- [ ] **Autres concurrents à cartographier** : services d'API de screenshot, d'API d'aperçu de liens et d'oEmbed. Relever prix, limites et angles morts.
- [ ] **Positionnement** : choisir un ou deux angles différenciants. Pistes : auto-hébergement en une commande, transparence des coûts, sécurité documentée, réponses déterministes, contrat OpenAPI.
- [ ] **Cadre légal** : ne copier ni la marque, ni l'identité visuelle, ni les textes de documentation. Respecter les conditions d'utilisation lors des observations. Rédiger sa propre politique d'usage acceptable (le service va chercher des pages tierces au nom de ses utilisateurs).

Livrable : document d'analyse + liste priorisée des fonctionnalités.

## Phase 1 — MVP public auto-hébergeable (≈ 2 à 3 semaines)

But : qu'un inconnu puisse lancer le projet et s'en servir en cinq minutes.

- [ ] Brancher un Redis managé (`REDIS_URL`) pour partager cache et rate limiting entre instances Vercel.
- [ ] **Contrat OpenAPI** généré depuis les schémas TypeBox (`@fastify/swagger`) + interface de documentation.
- [ ] Schémas de **réponse** (pas seulement de requête) : sérialisation plus rapide et contrat vérifiable.
- [ ] CI : typecheck, tests, build, audit des dépendances, sur chaque pull request.
- [ ] Linter et formateur, hooks de pré-commit.
- [ ] Jeu de tests d'extraction sur un corpus de pages HTML réelles figées (presse, e-commerce, vidéo, documentation, SPA) avec résultats attendus.
- [ ] En-têtes HTTP : `ETag`, `Cache-Control` cohérent avec le TTL restant, `X-Request-Id`.
- [ ] Paramètre `ttl` par requête (borné par la configuration).
- [ ] Fichiers `CONTRIBUTING.md`, `SECURITY.md` (procédure de signalement), modèles d'issues.

Critère de sortie : installation documentée et reproductible, CI verte, contrat OpenAPI publié.

## Phase 2 — Durcissement sécurité et fiabilité (≈ 3 à 4 semaines)

But : pouvoir exposer le service sur Internet sans mauvaise surprise. À faire **avant** toute offre hébergée.

- [ ] **Fermer la limite de rebinding côté navigateur** : faire sortir Chromium par un proxy HTTP local (dans le même processus) qui applique la politique SSRF au moment de la connexion.
- [ ] **Isolation du rendu** : séparer la fonction de rendu (navigateur) de la fonction d'API légère, avec des limites de durée et de mémoire propres à chacune.
- [ ] Limites de ressources par page : taille totale téléchargée, nombre de requêtes, blocage des téléchargements de fichiers.
- [ ] Tests de charge et de **fuite mémoire** : rejouer quelques milliers de rendus, suivre la mémoire résidente, ajuster `BROWSER_MAX_USES` et la concurrence.
- [ ] Rate limiting distribué (magasin Redis) dès qu'il y a plus d'une instance.
- [ ] Disjoncteur par domaine cible : cesser d'insister sur un site qui échoue en boucle.
- [ ] Respect optionnel de `robots.txt`, user-agent identifiable, page d'explication pour les administrateurs de sites.
- [ ] **Observabilité** : métriques Prometheus (latence par étape, taux de fallback navigateur, taux de cache, saturation du pool), traces OpenTelemetry, journaux corrélés par identifiant de requête.
- [ ] Sondes de vivacité et de disponibilité distinctes.
- [ ] Revue de sécurité externe ou programme de signalement.

Critère de sortie : test de charge documenté, aucune croissance mémoire sur un essai long, politique réseau en place, tableau de bord opérationnel.

## Phase 3 — Parité fonctionnelle (≈ 6 à 8 semaines)

But : couvrir ce que les utilisateurs d'un service de ce type attendent. L'ordre est à ajuster selon la phase 0.

**Métadonnées**
- [ ] Champs supplémentaires : logo, vidéo, audio, durée, prix et disponibilité (schémas produit), temps de lecture, flux RSS détectés.
- [ ] oEmbed : découverte et normalisation des intégrations (lecteurs vidéo, publications sociales).
- [ ] Règles d'extraction personnalisées : sélecteurs CSS fournis par l'appelant, avec type et attribut.
- [ ] Extracteurs spécialisés par domaine (architecture de plugins, un module par site).
- [ ] Dimensions et poids réels des images (lecture de l'en-tête du fichier uniquement), couleur dominante et palette.

**Captures**
- [ ] Options : dimensions de viewport libres, sélecteur d'élément, délai ou attente d'un sélecteur, mode sombre, masquage d'éléments, CSS et en-têtes injectés.
- [ ] Blocage des publicités et des bandeaux de consentement.
- [ ] Formats WebP et AVIF, redimensionnement à la volée.
- [ ] Export PDF.
- [ ] Stockage objet des captures (compatible S3) + diffusion par CDN, au lieu de Redis pour le binaire.

**API**
- [ ] Mode `embed` : renvoyer directement un champ (par exemple l'image) pour un usage dans une balise HTML.
- [ ] Mode asynchrone avec webhook pour les rendus longs.
- [ ] Requêtes par lot.

Critère de sortie : tableau de parité à jour dans `docs/`, chaque fonctionnalité couverte par des tests.

## Phase 4 — Produit hébergé (≈ 6 à 8 semaines)

But : une offre exploitable par des tiers.

- [ ] Comptes, **clés d'API**, quotas par plan, compteur d'usage.
- [ ] Tableau de bord : consommation, journaux de requêtes, gestion des clés.
- [ ] Facturation à l'usage et plans.
- [ ] Site vitrine, documentation interactive, playground public (avec protection contre l'abus).
- [ ] SDK : client JavaScript/TypeScript, composant d'aperçu de lien (React, puis web component), exemples d'intégration.
- [ ] Page de statut, engagements de service, politique d'usage acceptable, traitement des demandes de retrait.
- [ ] Conformité : registre des traitements, durée de conservation des journaux, localisation des données.

Critère de sortie : un utilisateur peut s'inscrire, obtenir une clé, payer et suivre sa consommation sans intervention manuelle.

## Phase 5 — Passage à l'échelle et différenciation (continu)

- [ ] Si les limites serverless deviennent bloquantes (durée, mémoire, démarrage à froid) : déplacer le rendu vers des *workers* longue durée, l'API restant sur Vercel.
- [ ] Déploiement multi-région, cache en périphérie.
- [ ] Proxys de sortie configurables pour les sites qui bloquent les centres de données (avec cadre d'usage strict).
- [ ] Analyse de performance et détection de technologies d'une page.
- [ ] Génération d'images d'aperçu personnalisées à partir de modèles.
- [ ] Résumé et classification de contenu par modèle de langage (optionnel, opt-in).
- [ ] Serveur MCP exposant `meta` et `screenshot` aux agents IA.

---

## Indicateurs à suivre

| Indicateur | Pourquoi |
| --- | --- |
| Latence p50 / p95 par chemin (HTTP seul, navigateur, cache) | Promesse de performance |
| Taux de fallback navigateur | Premier facteur de coût |
| Taux de succès du cache | Second facteur de coût |
| Taux d'erreur par code | Qualité perçue |
| Mémoire par processus Chromium dans le temps | Détection des fuites |
| Coût d'infrastructure par millier de requêtes | Viabilité de la tarification |

Les valeurs cibles sont à fixer après les premiers tests de charge (phase 2) : aucune mesure de référence n'existe encore.

## Risques principaux

| Risque | Parade |
| --- | --- |
| Abus du service (SSRF, relais d'attaque, scraping massif) | Phase 2 complète avant ouverture publique, clés d'API, quotas |
| Coût du rendu navigateur | Fallback intelligent, cache agressif, *workers* dimensionnés à la demande |
| Blocage par les protections anti-robot | Transparence du user-agent, pas de promesse de contournement, proxys en option encadrée |
| Fragilité de l'extraction (le Web change) | Corpus de non-régression, extracteurs par domaine, signalement facile par les utilisateurs |
| Questions juridiques (contenus tiers, données personnelles) | Avis juridique avant la phase 4, politique d'usage, procédure de retrait |
