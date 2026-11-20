# Omnillink — diagnostic et aperçu immersif (étapes 0 à 2)

Branche `feat/site-immersif`, 20 novembre 2026. Rien n'est intégré aux vraies pages : tout ce
qui suit vit dans ce dossier, servi seulement en développement.

## Ouvrir l'aperçu

Depuis `apps/web` :

```bash
npx vite --config preview-immersif/vite.config.ts
```

Puis http://localhost:5197/ (français) ou http://localhost:5197/en/ (anglais). Le pied de page
modifié se voit sur toutes les pages, par exemple http://localhost:5197/docs.

L'aperçu réutilise la configuration du site (vrai menu, vraies pages, vrais textes) et retouche
le HTML produit. `src/` et `vite.config.ts` ne sont pas modifiés ; le build de production ne
connaît pas ce dossier.

## Où vit le site

`apps/web` : Vite + Tailwind v4, sans framework. Les pages sont des chaînes HTML assemblées au
build (`src/site/pages.ts`, `src/site/chrome.ts`), les textes viennent de `src/i18n/fr|en`. Le
site est ensuite embarqué dans l'API. Les composants React de kayzen-lyon.com ne sont donc pas
réutilisables tels quels : seuls la géométrie du mur et les principes ont été repris.

Il n'y a pas de page de tarifs (logiciel libre, gratuit). Les pages publiques sont l'accueil,
le bac à sable, la référence, onze guides, l'état du service et les pages légales.

## État avant tout changement

| Contrôle | Résultat |
|---|---|
| Dépôt | propre |
| Types du site (`apps/web`) | OK |
| Tests de l'API | 380 passés, 1 ignoré |
| Tests du SDK | 123 passés |
| Types et tests de `packages/cli`, `mcp`, `react` | échouent : ils attendent le SDK construit (`dist` absent après un clone neuf). Sans rapport avec le site. |
| Build du site sous Windows | échoue au contrôle du budget de poids : les chemins `en\docs.html` (barres obliques inversées) ne sont pas reconnus et reçoivent le budget par défaut. Antérieur à ce travail, à corriger à part. |
| Lint | aucun script de lint dans le dépôt |

## Faut-il toucher au site ?

Peu. Le site est soigné, rapide (Lighthouse 98 à 100, mesuré le 18 novembre 2026) et son premier
écran explique déjà le produit mieux qu'un décor : une URL entre, une carte, une capture et du
JSON sortent. Deux vrais défauts, en revanche :

- la section « Fonctionnalités » est très longue : 6 077 px sur ordinateur, 10 349 px sur
  mobile, 23 cartes de même poids ;
- les scores Lighthouse, la meilleure preuve du site, sont dans un tableau discret.

Le site en ligne contredit aussi la règle « aucun dégradé, halo ni effet verre » : halos et
quadrillage estompé derrière le premier écran, fondu entre les sections, séparateur en dégradé,
menu en verre dépoli (flou d'arrière-plan), ombre colorée sous le bouton principal, fondu au bas
des miniatures. L'aperçu les neutralise tous.

## Les cinq demandes, pour ce site

| Demande | Verdict | Ce que fait l'aperçu |
|---|---|---|
| 1. Mur en perspective | **Discutable.** Il n'existe aucune collection de captures : toutes les images du site montrent la même page de test. Seule matière honnête : les 23 miniatures de vraies réponses de l'API déjà présentes dans la page. | Mur fait de ces miniatures (copiées dans le navigateur après le premier affichage, aucune image ni requête de plus). La démonstration d'origine est conservée entière, juste dessous. Ordinateur seulement. |
| 2. Cartes avec preuves | **Oui**, mais pas de « réalisations » : les preuves sont les scores Lighthouse mesurés. | Trois cartes (accueil, bac à sable, référence) : capture 16/9 entière dans un cadre de navigateur, les huit scores en grand, date de mesure, lien vers la page. Mêmes chiffres et même note que le tableau remplacé. |
| 3. Scène fixe | **Oui, c'est le gain le plus net.** | Sur ordinateur, les 23 cartes deviennent une liste ; la réponse réelle de la carte en cours de lecture s'affiche en grand dans un cadre qui reste à l'écran. Tous les titres, textes et liens restent. La section passe de 6 077 à 5 599 px. |
| 4. Défilement de captures | **Non.** Pas de matière : deux rangées de la même page de test n'auraient aucun sens, et le mur utilise déjà les miniatures. | Rien. |
| 5. Pied de page | **En partie.** Le site n'a pas de « contact » à mettre en avant (l'adresse contact@kayzen-lyon.fr n'apparaît que dans les pages légales) ; son appel final est « Essayez Omnillink sur vos propres liens ». | Cet appel passe en très grand, d'un seul tenant avec le pied de page, qui se termine par « Omnillink » en filigrane. |

Mon avis sur le point 1 : le mur est joli mais dit moins de choses que la démonstration qu'il
repousse sous le premier écran. Si une seule demande doit être abandonnée, c'est celle-là.

## Ce que l'aperçu ne fait pas

- **Mobile** : pas de mur ni de scène fixe (la page mobile fait déjà 29 560 px ; les cartes de
  preuves l'allongent d'environ 1 000 px). Le mobile gagne les cartes de preuves, l'appel final
  et le filigrane.
- **Sans JavaScript** : les cartes de capacités restent telles qu'aujourd'hui.
- **Textes** : aucun texte nouveau. Tout vient des dictionnaires existants, en français et en
  anglais.

## Points d'attention pour l'intégration (étape 3)

- **Budget de poids** : l'accueil pèse 74,0 kB pour un budget de 75 (HTML + CSS + JS, Brotli).
  L'intégration devra tenir dans 1 kB ou le budget devra être relevé, décision à prendre.
- **Politique de sécurité du contenu** : le site interdit les styles en ligne. L'aperçu n'en
  utilise aucun (classes et attributs SVG seulement).
- **Captures des cartes** : prises sur le site en ligne par `capture.mjs`, en JPEG (64 à 90 Ko).
  À convertir en AVIF/WebP et à ranger dans `public/` au moment d'intégrer. Elles montrent le
  site actuel ; il faudra les refaire après la mise en ligne.
- **Titre** : les mots du titre restent séparés par de vraies espaces dans le HTML (vérifié).

## Vérifié

- Types du site et des fichiers de l'aperçu (mode strict) : OK.
- Le build de production ne référence pas ce dossier.
- Ordinateur 1440 × 900, thème clair : premier écran, démonstration, scène fixe (à deux
  endroits), cartes de preuves, appel final, pied de page.
- Ordinateur, thème sombre : premier écran, scène fixe, cartes de preuves, pied de page.
- 375 px, thème clair : aucun débordement horizontal ; mur et scène absents comme prévu ; appel
  final, pied de page, première carte de preuves.
- Console sans erreur propre à l'aperçu (une requête 404 : l'API n'est pas lancée en
  développement, la liste des capacités garde alors son état par défaut).
- Encodage UTF-8, accents corrects.
- La page anglaise et trois pages intérieures reçoivent bien les blocs attendus (contrôle du
  HTML, pas visuel).

## Pas vérifié

- 375 px en thème sombre.
- Le passage des anneaux de score en deux colonnes sous 480 px, ajouté après la dernière
  capture mobile (le libellé « Performance » se coupait).
- La page anglaise et les pages intérieures à l'œil.
- « Réduire les animations » (le mur est censé rester immobile), le contraste élevé, la
  navigation au clavier dans la scène fixe.
- Firefox et Safari (la mise à l'échelle des miniatures utilise `zoom`).
- Tablette (768 à 1023 px).
- Lighthouse sur l'aperçu : sans objet tant que rien n'est intégré.
- L'aperçu avec l'API lancée (masquage des cartes selon la spécification en direct).
