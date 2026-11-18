// Entry of the "home" pages in English: ships this language only; the other one loads on demand.
import '../style.css';

import { common } from '../i18n/en/common';
import { home } from '../i18n/en/home';
import { consoleText } from '../i18n/en/console';
import { createI18n } from '../i18n/runtime';
import { startHome } from '../pages/home';

startHome(
  createI18n({
    dict: { ...common, ...home, ...consoleText },
    load: { fr: () => Promise.all([import('../i18n/fr/common'), import('../i18n/fr/home'), import('../i18n/fr/console')]).then(([m0, m1, m2]) => ({ ...m0.common, ...m1.home, ...m2.consoleText })) },
  }),
);
