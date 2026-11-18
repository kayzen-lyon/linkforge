/**
 * Tiny dependency-free tokenizer for the code samples shown on the site.
 *
 * It is pure (no DOM), so the same code runs at build time (API reference,
 * rendered to escaped HTML) and in the browser (demo output, rendered to DOM
 * nodes). It aims at readable colouring, not at being a real lexer.
 */

export type TokenType = 'plain' | 'str' | 'num' | 'kw' | 'com' | 'key' | 'punct';

export interface Token {
  readonly type: TokenType;
  readonly text: string;
}

export type Lang = 'json' | 'bash' | 'js' | 'python' | 'html' | 'text';

const KEYWORDS: Readonly<Record<Lang, ReadonlySet<string>>> = {
  json: new Set(['true', 'false', 'null']),
  bash: new Set(['curl', 'npm', 'npx', 'git', 'cp', 'cd', 'node']),
  js: new Set([
    'const', 'let', 'await', 'async', 'new', 'if', 'throw', 'import', 'from', 'return',
    'function', 'true', 'false', 'null',
  ]),
  python: new Set([
    'import', 'from', 'with', 'as', 'if', 'raise', 'def', 'return', 'for', 'in', 'not',
    'True', 'False', 'None',
  ]),
  html: new Set(),
  text: new Set(),
};

const STRING = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/y;
const NUMBER = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const WORD = /[A-Za-z_$][\w$]*/y;
const PUNCT = /[{}[\](),:;=]/y;
const JSON_KEY_LOOKAHEAD = /\s*:/y;

function matchAt(pattern: RegExp, code: string, index: number): string | null {
  pattern.lastIndex = index;
  const match = pattern.exec(code);
  return match === null ? null : match[0];
}

/** Splits `code` into coloured tokens. Concatenating the tokens yields `code`. */
export function tokenize(code: string, lang: Lang): Token[] {
  if (lang === 'text') return [{ type: 'plain', text: code }];

  const keywords = KEYWORDS[lang];
  const hashComments = lang === 'bash' || lang === 'python';
  const tokens: Token[] = [];
  let plain = '';
  let index = 0;

  const push = (type: TokenType, text: string): void => {
    if (plain !== '') {
      tokens.push({ type: 'plain', text: plain });
      plain = '';
    }
    tokens.push({ type, text });
    index += text.length;
  };

  while (index < code.length) {
    const char = code.charAt(index);
    const previous = index === 0 ? '\n' : code.charAt(index - 1);

    const startsComment =
      (hashComments && char === '#' && /\s/.test(previous)) ||
      (lang === 'js' && char === '/' && code.charAt(index + 1) === '/' && /\s/.test(previous));
    if (startsComment) {
      const end = code.indexOf('\n', index);
      push('com', code.slice(index, end === -1 ? code.length : end));
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      const text = matchAt(STRING, code, index);
      if (text !== null) {
        const isKey = lang === 'json' && matchAt(JSON_KEY_LOOKAHEAD, code, index + text.length) !== null;
        push(isKey ? 'key' : 'str', text);
        continue;
      }
    }

    if (lang !== 'html' && /[\d-]/.test(char) && !/[\w$.]/.test(previous)) {
      const text = matchAt(NUMBER, code, index);
      if (text !== null && text !== '-') {
        push('num', text);
        continue;
      }
    }

    if (/[A-Za-z_$]/.test(char) && !/[\w$-]/.test(previous)) {
      const text = matchAt(WORD, code, index);
      if (text !== null) {
        if (keywords.has(text)) {
          push('kw', text);
        } else {
          plain += text;
          index += text.length;
        }
        continue;
      }
    }

    if (lang !== 'bash' && lang !== 'html' && matchAt(PUNCT, code, index) !== null) {
      push('punct', char);
      continue;
    }

    plain += char;
    index += 1;
  }

  if (plain !== '') tokens.push({ type: 'plain', text: plain });
  return tokens;
}
