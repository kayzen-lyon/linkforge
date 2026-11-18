// Entry of the "status" pages in French: ships this language only; the other one loads on demand.
import '../style.css';

import { common } from '../i18n/fr/common';
import { status } from '../i18n/fr/status';
import { createI18n } from '../i18n/runtime';
import { startStatus } from '../pages/status';

startStatus(
  createI18n({
    dict: { ...common, ...status },
    load: { en: () => Promise.all([import('../i18n/en/common'), import('../i18n/en/status')]).then(([m0, m1]) => ({ ...m0.common, ...m1.status })) },
  }),
);
