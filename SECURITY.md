# Politique de sécurité

Omnillink va chercher des URL arbitraires pour le compte de ses utilisateurs. Les failles de type SSRF, contournement de la validation d'URL, évasion du navigateur ou déni de service sont donc traitées en priorité.

## Signaler une vulnérabilité

Ne créez pas d'issue publique. Utilisez le signalement privé de GitHub : onglet **Security** du dépôt, puis **Report a vulnerability**.

Indiquez si possible :

- l'endpoint et les paramètres concernés ;
- une requête ou un scénario de reproduction ;
- l'impact que vous avez constaté.

## Périmètre

- Dans le périmètre : le code de ce dépôt (`apps/api`, `apps/web`, `packages/*`).
- Hors périmètre : les sites tiers dont Omnillink lit le contenu, et les attaques qui supposent un accès préalable à l'infrastructure d'hébergement.

## Limite connue

Sur le chemin de rendu par navigateur, Chromium effectue sa propre résolution DNS après la validation de l'URL. Une attaque par *DNS rebinding* reste théoriquement possible sur ce chemin. La correction est planifiée (voir `ROADMAP.md`, phase 2). Les signalements qui précisent ou aggravent ce point sont bienvenus.
