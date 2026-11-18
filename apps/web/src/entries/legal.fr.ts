// Entry of the legal page in French. The only scripts that load the legal dictionary.
import '../style.css';

import { common } from '../i18n/fr/common';
import { fr as legal } from '../i18n/legal';
import { createI18n } from '../i18n/runtime';
import { startDocs } from '../pages/docs';

startDocs(
  createI18n({
    dict: { ...common, ...legal },
    load: { en: () => Promise.all([import('../i18n/en/common'), import('../i18n/legal')]).then(([a, b]) => ({ ...a.common, ...b.en })) },
  }),
);
