# Politique de sécurité

LinkForge va chercher des URL arbitraires pour le compte de ses utilisateurs. Les failles de type SSRF, contournement de la validation d'URL, évasion du navigateur ou déni de service sont donc traitées en priorité.

## Signaler une vulnérabilité

Ne créez pas d'issue publique. Utilisez le signalement privé de GitHub : onglet **Security** du dépôt, puis **Report a vulnerability**.

Indiquez si possible :

- l'endpoint et les paramètres concernés ;
- une requête ou un scénario de reproduction ;
- l'impact que vous avez constaté.

## Périmètre

- Dans le périmètre : le code de ce dépôt (`apps/api`, `apps/web`, `packages/*`).
- Hors périmètre : les sites tiers dont LinkForge lit le contenu, et les attaques qui supposent un accès préalable à l'infrastructure d'hébergement.

## Modèle de protection du navigateur

Chromium n'a qu'une sortie réseau : un proxy validant interne au processus (`apps/api/src/security/egress-proxy.ts`), lié à `127.0.0.1` sur un port éphémère et protégé par un identifiant aléatoire. À chaque connexion (saut de redirection, sous-ressource, iframe, tunnel `https`), il applique la politique anti-SSRF, résout le nom lui-même et se connecte à l'adresse qu'il vient de valider. Les redirections vers une adresse interne et le *DNS rebinding*, qui échappaient à l'interception des requêtes seule, sont fermés sur ce chemin.

## Limites connues

- Le proxy vit dans le même processus que l'API. Il ne remplace pas un filtrage de sortie au niveau réseau (pare-feu, VPC), recommandé en production, en particulier contre une compromission de Chromium lui-même.
- La protection contre le *rebinding* suppose que la résolution DNS du système n'est pas elle-même compromise.
- Le JavaScript des pages rendues s'exécute dans Chromium, bac à sable et isolation de sites conservés.

Les signalements qui précisent ou contournent ces points sont bienvenus.
