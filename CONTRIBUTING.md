# Contribuer à Omnillink

Merci de votre intérêt. Ce guide dit l'essentiel pour proposer un changement qui sera accepté.

## Mise en route

Prérequis : Node.js ≥ 22.

```bash
npm install
```

```bash
npx playwright-core install chromium
```

```bash
npm run dev
```

## Avant d'ouvrir une pull request

Ces trois commandes doivent passer :

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

## Règles du projet

- **Sécurité d'abord.** Toute requête sortante passe par `assertSafeUrl` et le fetcher sûr, ou par `Renderer.render` pour le navigateur. Un changement dans `apps/api/src/security` s'accompagne de tests qui montrent le contournement bloqué.
- **Un comportement, un test.** Pour un bug, écrivez d'abord le test qui échoue. Aucun test ne dépend d'un site externe : utilisez le serveur de fixtures de `apps/api/test`.
- **Pas de logique dans les routes.** Elles valident et formatent ; la logique vit dans `src/services`.
- **Configuration typée.** Aucun accès à `process.env` hors de `apps/api/src/config.ts` ; toute nouvelle variable est documentée dans `.env.example`.
- **Erreurs stables.** Un nouveau cas d'erreur reçoit un nouveau code dans `src/lib/errors.ts`, documenté dans le README.
- **Dépendances.** N'en ajoutez une que si elle remplace une quantité de code significative, et expliquez pourquoi dans la pull request.
- **Périmètre.** Un changement par pull request, sans refactorisation opportuniste.

## Style

TypeScript strict, sans `any` ni `@ts-ignore`. JSDoc en anglais sur ce qui est exporté ; les commentaires expliquent le pourquoi. La documentation utilisateur est en français.

## Signaler une faille

Voir `SECURITY.md` : pas d'issue publique.
