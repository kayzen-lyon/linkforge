// Entry of the "playground" pages in French: ships this language only; the other one loads on demand.
import '../style.css';

import { common } from '../i18n/fr/common';
import { playground } from '../i18n/fr/playground';
import { consoleText } from '../i18n/fr/console';
import { createI18n } from '../i18n/runtime';
import { startPlayground } from '../pages/playground';

startPlayground(
  createI18n({
    dict: { ...common, ...playground, ...consoleText },
    load: { en: () => Promise.all([import('../i18n/en/common'), import('../i18n/en/playground'), import('../i18n/en/console')]).then(([m0, m1, m2]) => ({ ...m0.common, ...m1.playground, ...m2.consoleText })) },
  }),
);
