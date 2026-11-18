// Entry of the "plain" pages in English: ships this language only; the other one loads on demand.
import '../style.css';

import { common } from '../i18n/en/common';
import { createI18n } from '../i18n/runtime';
import { startDocs } from '../pages/docs';

// Static prose: the language selector navigates to the other URL, so no other dictionary is loaded.
startDocs(
  createI18n({
    dict: { ...common },
  }),
);
