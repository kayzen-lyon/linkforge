// Entry of the "status" pages in English: ships this language only; the other one loads on demand.
import '../style.css';

import { common } from '../i18n/en/common';
import { status } from '../i18n/en/status';
import { createI18n } from '../i18n/runtime';
import { startStatus } from '../pages/status';

startStatus(
  createI18n({
    dict: { ...common, ...status },
    load: { fr: () => Promise.all([import('../i18n/fr/common'), import('../i18n/fr/status')]).then(([m0, m1]) => ({ ...m0.common, ...m1.status })) },
  }),
);
