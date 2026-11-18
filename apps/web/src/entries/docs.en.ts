// Entry of the "docs" pages in English: ships this language only; the other one loads on demand.
import '../style.css';

import { common } from '../i18n/en/common';
import { docs } from '../i18n/en/docs';
import { createI18n } from '../i18n/runtime';
import { startDocs } from '../pages/docs';

startDocs(
  createI18n({
    dict: { ...common, ...docs },
    load: { fr: () => Promise.all([import('../i18n/fr/common'), import('../i18n/fr/docs')]).then(([m0, m1]) => ({ ...m0.common, ...m1.docs })) },
  }),
);
