// Entry of the "home" pages in French: ships this language only; the other one loads on demand.
import '../style.css';

import { common } from '../i18n/fr/common';
import { home } from '../i18n/fr/home';
import { consoleText } from '../i18n/fr/console';
import { createI18n } from '../i18n/runtime';
import { startHome } from '../pages/home';

startHome(
  createI18n({
    dict: { ...common, ...home, ...consoleText },
    load: { en: () => Promise.all([import('../i18n/en/common'), import('../i18n/en/home'), import('../i18n/en/console')]).then(([m0, m1, m2]) => ({ ...m0.common, ...m1.home, ...m2.consoleText })) },
  }),
);
