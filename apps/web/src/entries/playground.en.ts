// Entry of the "playground" pages in English: ships this language only; the other one loads on demand.
import '../style.css';

import { common } from '../i18n/en/common';
import { playground } from '../i18n/en/playground';
import { consoleText } from '../i18n/en/console';
import { createI18n } from '../i18n/runtime';
import { startPlayground } from '../pages/playground';

startPlayground(
  createI18n({
    dict: { ...common, ...playground, ...consoleText },
    load: { fr: () => Promise.all([import('../i18n/fr/common'), import('../i18n/fr/playground'), import('../i18n/fr/console')]).then(([m0, m1, m2]) => ({ ...m0.common, ...m1.playground, ...m2.consoleText })) },
  }),
);
