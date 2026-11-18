# Prompt maître — construire et améliorer Omnillink

À coller au début d'une session avec un agent de code (Claude Code ou équivalent), à la racine du dépôt. Remplacez le bloc `<tache>` à chaque session ; le reste ne change pas.

---

```text
Tu travailles sur Omnillink, un service open-source d'extraction de métadonnées, de captures
d'écran et d'aperçus de liens, exposé par une API REST. Le projet vise les usages couverts par
des services hébergés existants, avec une identité, un code et une documentation qui lui sont propres.

<contexte>
Monorepo npm workspaces, Node.js >= 22, ESM, TypeScript strict.
- apps/api : Fastify 5, schémas TypeBox, Playwright (Chromium), cheerio, undici, ioredis, Vitest.
- apps/web : playground Vite + Tailwind CSS v4, sans framework.
- Déploiement : Vercel, dossier racine apps/api, preset Fastify (apps/api/vercel.json). Une seule
  fonction sert l'API et le playground, intégré au bundle au build (scripts/embed-playground.mjs).
  Pas de Docker. En serverless le navigateur est @sparticuz/chromium et rien ne persiste entre
  instances : pas d'état en mémoire dont dépend la justesse d'une réponse.
Avant d'écrire du code, lis README.md (architecture, contrat d'API, codes d'erreur) et ROADMAP.md
(phases, état actuel, limites connues). Ces deux fichiers font foi ; s'ils contredisent le code,
signale-le au lieu de choisir en silence.
</contexte>

<tache>
[Décris ici UNE tâche précise, idéalement un item de ROADMAP.md.
 Exemple : « Phase 1 — générer le contrat OpenAPI depuis les schémas TypeBox avec @fastify/swagger
 et l'exposer sur /docs. »]
</tache>

<principes_d_architecture>
Ces règles existent pour des raisons précises ; respecte-les ou explique pourquoi tu t'en écartes.

- Les routes ne contiennent pas de logique métier : elles valident, appellent un service et
  formatent la réponse. La logique vit dans src/services, ce qui la rend testable sans HTTP.
- Les services reçoivent leurs dépendances par constructeur (config, cache, fetcher, renderer).
  Aucun accès à process.env en dehors de src/config.ts : toute nouvelle option y est déclarée,
  typée, validée, puis documentée dans .env.example.
- L'extraction HTML reste une fonction pure (meta-extractor.ts), sans I/O, pour pouvoir la tester
  sur des fixtures.
- Le rendu navigateur coûte beaucoup plus cher qu'un fetch HTTP. Tout nouveau besoin
  doit d'abord chercher une solution sans navigateur ; le navigateur est le dernier recours.
- Toute page ouverte passe par BrowserPool.withPage / Renderer.render : c'est ce qui garantit la
  fermeture du contexte et le respect des limites de concurrence. N'appelle jamais
  chromium.launch() ni browser.newContext() ailleurs. Importe depuis playwright-core, jamais
  depuis playwright.
- Les erreurs prévues sont des AppError avec un code stable (src/lib/errors.ts). Un nouveau cas
  d'erreur = un nouveau code, documenté dans le tableau du README. Ne laisse jamais fuiter une
  trace ou un message interne vers le client.
- Le cache est une optimisation : une panne de Redis doit ralentir le service, pas le casser.
</principes_d_architecture>

<securite>
Ce service va chercher des URL arbitraires fournies par des inconnus : la SSRF est le risque
numéro un, et une régression ici est plus grave que n'importe quel bug fonctionnel.

- Toute requête sortante — fetch initial, chaque redirection, chaque sous-requête du navigateur,
  toute nouvelle fonctionnalité qui télécharge quelque chose (image, favicon, oEmbed, robots.txt) —
  passe par assertSafeUrl et par le fetcher sûr ou le browser-guard. Aucun appel direct à fetch,
  http.request ou page.goto en dehors de ces chemins.
- Tout changement dans src/security s'accompagne de tests qui montrent le contournement bloqué.
- Borne tout ce qui vient de l'extérieur : taille des corps, nombre de redirections, durée,
  dimensions des captures, longueur des paramètres.
- Si tu repères une faiblesse hors du périmètre de ta tâche, ne la corrige pas en douce :
  décris-la dans ton compte rendu.
</securite>

<qualite>
- TypeScript strict, sans any ni @ts-ignore ; si un cast est inévitable, un commentaire dit pourquoi.
- JSDoc en anglais sur ce qui est exporté : ce que fait la fonction, ses paramètres non évidents,
  les erreurs qu'elle lève. Les commentaires expliquent le pourquoi, pas le quoi.
- Chaque comportement ajouté ou corrigé a un test. Pour un bug : écris d'abord le test qui échoue.
- Les tests de bout en bout utilisent le serveur de fixtures local (test/api.test.ts) ; aucun test
  ne dépend d'un site externe.
- N'ajoute une dépendance que si elle remplace une quantité de code significative ; justifie-la.
- Garde les changements limités à la tâche : pas de refactorisation opportuniste.
</qualite>

<methode>
1. Lis le code concerné avant de proposer quoi que ce soit.
2. Si la tâche est ambiguë sur un point qui change la conception (contrat d'API, format de
   réponse, compatibilité), pose la question. Sinon, choisis l'option la plus simple et note-la.
3. Implémente par petits pas vérifiables.
4. Avant de conclure, exécute : npm run typecheck, npm test, npm run build.
   Colle le résultat réel. Si une vérification échoue ou n'a pas pu tourner, dis-le tel quel.
5. Mets à jour README.md (contrat, codes d'erreur, variables) et coche l'item dans ROADMAP.md.
</methode>

<compte_rendu>
Termine par un résumé court :
- ce qui a changé, fichier par fichier ;
- ce qui a été vérifié, avec les sorties de commandes ;
- ce qui n'a PAS été vérifié ou reste incertain ;
- les décisions prises par défaut et les questions ouvertes ;
- la prochaine étape logique dans la roadmap.
</compte_rendu>
```

---

## Variantes de `<tache>` prêtes à l'emploi

**Analyse concurrentielle (phase 0)**

```text
Rédige docs/competitive-analysis.md. Sources autorisées : la documentation publique des services
concurrents et les observations que je te fournis (captures REA, réponses d'API que j'ai collectées).
Pour chaque fonctionnalité : ce qu'elle fait, ses paramètres, si Omnillink l'a déjà, l'effort estimé.
Distingue ce que tu as lu dans une source de ce que tu supposes, et cite la source de chaque constat.
Ne reprends aucun texte, nom de marque ou élément visuel des concurrents.
```

**Durcissement SSRF côté navigateur (phase 2)**

```text
Ferme la limite documentée dans src/security/browser-guard.ts : Chromium résout le DNS lui-même
après notre contrôle. Fais sortir le navigateur par un proxy HTTP local qui applique la politique
SSRF à la connexion (CONNECT inclus). Ajoute un test qui simule un rebinding : un nom qui résout
d'abord vers une adresse publique, puis vers 127.0.0.1.
```

**Test de fuite mémoire (phase 2)**

```text
Écris scripts/soak.ts : N rendus (meta en mode always + screenshot) contre le serveur de fixtures,
avec relevé de la mémoire résidente du processus Node et des processus Chromium toutes les 100
itérations. Produis un tableau. Conclus uniquement à partir des chiffres mesurés.
```

**Nouvelle fonctionnalité d'extraction (phase 3)**

```text
Ajoute le champ `video` à la réponse de /api/v1/meta (og:video, twitter:player, JSON-LD
VideoObject). Commence par les fixtures et les tests dans test/meta-extractor.test.ts.
Le champ est null quand rien n'est trouvé ; n'en invente jamais la valeur.
```
