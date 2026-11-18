// The test page is a real Vite build with a small React widget, so that
// /tech and /insights have genuine build artefacts to read.
import { render } from './widget.js';

const mount = document.getElementById('reactions');
if (mount) render(mount);
