// Entry of the "a11y" pages in English: ships this language only; the other one loads on demand.
import '../style.css';

import { common } from '../i18n/en/common';
import { a11y } from '../i18n/en/a11y';
import { createI18n } from '../i18n/runtime';
import { startDocs } from '../pages/docs';

startDocs(
  createI18n({
    dict: { ...common, ...a11y },
    load: { fr: () => Promise.all([import('../i18n/fr/common'), import('../i18n/fr/a11y')]).then(([m0, m1]) => ({ ...m0.common, ...m1.a11y })) },
  }),
);
