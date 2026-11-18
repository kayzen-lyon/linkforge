import { createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';

function Reactions() {
  const [count, setCount] = useState(0);
  return createElement('button', { type: 'button', onClick: () => setCount(count + 1) }, `Useful (${count})`);
}

export function render(mount) {
  createRoot(mount).render(createElement(Reactions));
}
