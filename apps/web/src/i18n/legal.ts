/**
 * Dictionary of the legal notice and privacy page, in both languages.
 *
 * Kept in its own module on purpose: the publisher's personal name must appear
 * on that page only, so this text must never be bundled with the other pages.
 * Import it from `src/legal.ts` (and the build) and nowhere else.
 */

export const fr = {
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
    'Vos préférences sont enregistrées dans le stockage local de votre navigateur, uniquement quand vous les modifiez. Elles ne sont jamais envoyées au serveur. Le site garde aussi, dans le cache du navigateur, une page affichée quand vous êtes hors ligne. Vous effacez le tout en supprimant les données du site dans votre navigateur.',
  'storage.th.key': 'Nom',
  'storage.th.purpose': 'Rôle',
  'storage.theme': 'Thème clair ou sombre choisi.',
  'storage.lang': 'Langue choisie, français ou anglais.',
  'storage.a11y': 'Options d’accessibilité : taille du texte, contraste, police, interlignage, liens soulignés, animations, raccourcis, noir pur.',
  'storage.banner': 'Bandeau supérieur refermé.',
  'storage.history': 'Historique du bac à sable : vos vingt dernières requêtes. Créé seulement si vous activez l’historique.',
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

export const en: Record<keyof typeof fr, string> = {
  'meta.title': 'Legal notice and privacy · Omnillink',
  'meta.description':
    'Publisher and host of the Omnillink site, and what the site stores: no cookies, no trackers, preferences kept in your browser.',
  'title': 'Legal notice and privacy',
  'updated': 'Last updated: 18 November 2026',
  'intro':
    'This site presents Omnillink, an open-source API, and offers a demonstration of it. This page identifies its publisher and its host, then explains what the site stores.',
  'publisher.title': 'Publisher of the site',
  'publisher.p': 'The site is published by Tarek BELHADJ, a sole trader operating under the trade name KAYZEN.',
  'publisher.form': 'Legal form: sole proprietorship under French law (entreprise individuelle, micro-entreprise)',
  'publisher.seat': 'Registered office: 6 rue Pierre Termier, 69009 Lyon, France',
  'publisher.office': 'Premises: 6 rue de Bourgogne, 69009 Lyon, France',
  'publisher.siret': 'SIRET: 493 857 262 00098',
  'publisher.siren': 'SIREN: 493 857 262',
  'publisher.ape': 'APE code: 62.01Z',
  'publisher.vat': 'VAT not applicable, article 293 B of the French General Tax Code',
  'publisher.phone': 'Telephone: [+33 4 87 77 68 61](tel:+33487776861)',
  'publisher.email': 'Email: [contact@kayzen-lyon.fr](mailto:contact@kayzen-lyon.fr)',
  'director.title': 'Publication director',
  'director.p': 'Tarek BELHADJ',
  'host.title': 'Host',
  'host.p': 'The site is hosted by Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, United States, [vercel.com](https://vercel.com).',
  'software.title': 'Software and licence',
  'software.p':
    'Omnillink is free software released under the MIT licence. Its source code is available on [GitHub](https://github.com/kayzen-lyon/linkforge).',
  'privacy.title': 'What the site stores',
  'privacy.none':
    'The site sets no cookies. It loads no analytics tool, no advertising and no third-party script. Fonts are served by the site itself.',
  'storage.title': 'Preferences kept in your browser',
  'storage.p':
    'Your preferences are saved in the local storage of your browser, only when you change them. They are never sent to the server. The site also keeps, in the browser cache, a page shown when you are offline. You erase all of it by deleting the site data in your browser.',
  'storage.th.key': 'Name',
  'storage.th.purpose': 'Purpose',
  'storage.theme': 'Light or dark theme chosen.',
  'storage.lang': 'Language chosen, French or English.',
  'storage.a11y': 'Accessibility options: text size, contrast, font, line spacing, underlined links, animations, shortcuts, pure black.',
  'storage.banner': 'Top banner closed.',
  'storage.history': 'Playground history: your last twenty requests. Created only if you turn the history on.',
  'demo.title': 'When you use the demo',
  'demo.1': 'The address you enter is sent to the API, which reads that page. The result is kept in a cache on the server, for one hour by default. Do not submit an address that contains a secret or a personal token.',
  'demo.2': 'The link preview shows the image and icon of the page straight from the site concerned: your browser therefore contacts that site, which sees your IP address. No referrer is sent to it.',
  'demo.3': 'To limit the request rate, the API counts requests per IP address, in memory, over a one-minute window.',
  'logs.title': 'Technical logs',
  'logs.p':
    'Like any online service, the application and its host produce technical logs: IP address, date and requested address. Their retention period has not been provided: **[period to be specified by the publisher]**.',
  'rights.title': 'Your rights',
  'rights.p':
    'For any question about your data, or to exercise your rights of access, rectification and erasure, write to [contact@kayzen-lyon.fr](mailto:contact@kayzen-lyon.fr). You can also lodge a complaint with the CNIL, the French data protection authority.',
  'disclaimer':
    'Page written with the help of an AI tool from the information supplied by the publisher. It is not legal advice.',
};
