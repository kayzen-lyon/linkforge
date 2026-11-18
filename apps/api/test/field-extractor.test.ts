import { describe, expect, it } from 'vitest';

import { AppError } from '../src/lib/errors.js';
import {
  extractFields,
  hasEmptyField,
  parseFieldRules,
  parseNumber,
} from '../src/services/field-extractor.js';

const PAGE = `<html><head><base href="https://cdn.example.com/shop/"></head><body>
  <h1 class="name">  Blue   widget </h1>
  <span class="price">$1,299.50</span>
  <div class="desc"><b>Bold</b> text</div>
  <a href="/a">A</a> <a href="b?x=1">B</a> <a href="javascript:void(0)">JS</a> <a>No href</a>
  <img class="hero" src="img/hero.png" data-id="42">
  <ul><li>3 in stock</li><li>none</li><li>12,5 kg</li></ul>
</body></html>`;

const run = (fields: object) =>
  extractFields(PAGE, 'https://example.com/product', parseFieldRules(JSON.stringify(fields)));

describe('parseFieldRules', () => {
  const codeOf = (raw: string) => {
    try {
      parseFieldRules(raw);
      return null;
    } catch (error) {
      return error instanceof AppError ? `${error.statusCode}:${error.code}` : 'other';
    }
  };

  it('applies defaults', () => {
    expect(parseFieldRules('{"title":{"selector":"h1"}}')).toEqual([
      ['title', { selector: 'h1', attr: 'text', type: 'string', all: false }],
    ]);
  });

  it.each([
    ['not json', 'not json'],
    ['an array', '[]'],
    ['a scalar', '"h1"'],
    ['an empty object', '{}'],
    ['a rule that is not an object', '{"a":"h1"}'],
    ['a missing selector', '{"a":{"attr":"text"}}'],
    ['an empty selector', '{"a":{"selector":"  "}}'],
    ['a selector that does not parse', '{"a":{"selector":"div["}}'],
    ['an oversized selector', JSON.stringify({ a: { selector: 'a'.repeat(301) } })],
    ['an unknown type', '{"a":{"selector":"h1","type":"date"}}'],
    ['an invalid attribute name', '{"a":{"selector":"h1","attr":"on click"}}'],
    ['a non-boolean all', '{"a":{"selector":"h1","all":"yes"}}'],
    ['an unknown rule property', '{"a":{"selector":"h1","eval":"x"}}'],
    ['an invalid field name', '{"a b":{"selector":"h1"}}'],
    ['a __proto__ field', '{"__proto__":{"selector":"h1"}}'],
    [
      'more than 20 fields',
      JSON.stringify(Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`f${i}`, { selector: 'p' }]))),
    ],
  ])('rejects %s with EINVALIDPARAMS', (_, raw) => {
    expect(codeOf(raw)).toBe('400:EINVALIDPARAMS');
  });
});

describe('extractFields', () => {
  it('reads text, html and attributes', () => {
    expect(
      run({
        name: { selector: '.name' },
        desc: { selector: '.desc', attr: 'html' },
        id: { selector: '.hero', attr: 'data-id', type: 'number' },
      }),
    ).toEqual({ name: 'Blue widget', desc: '<b>Bold</b> text', id: 42 });
  });

  it('converts numbers and resolves URLs against <base>', () => {
    expect(
      run({
        price: { selector: '.price', type: 'number' },
        hero: { selector: '.hero', attr: 'src', type: 'url' },
      }),
    ).toEqual({ price: 1299.5, hero: 'https://cdn.example.com/shop/img/hero.png' });
  });

  it('returns every match with `all`, dropping unusable values', () => {
    expect(
      run({
        links: { selector: 'a', attr: 'href', type: 'url', all: true },
        stock: { selector: 'li', type: 'number', all: true },
      }),
    ).toEqual({
      links: ['https://cdn.example.com/a', 'https://cdn.example.com/shop/b?x=1'],
      stock: [3, 12.5],
    });
  });

  it('reports missing elements as null or an empty array', () => {
    const fields = run({ none: { selector: '.nope' }, list: { selector: '.nope', all: true } });
    expect(fields).toEqual({ none: null, list: [] });
    expect(hasEmptyField(fields)).toBe(true);
    expect(hasEmptyField(run({ name: { selector: '.name' } }))).toBe(false);
  });

  it('bounds the number of items and the size of each value', () => {
    const html = `<p class="big">${'x'.repeat(20_000)}</p>${'<i>n</i>'.repeat(500)}`;
    const fields = extractFields(
      html,
      'https://example.com/',
      parseFieldRules('{"big":{"selector":".big"},"many":{"selector":"i","all":true}}'),
    );
    expect((fields['big'] as string).length).toBe(10_000);
    expect(fields['many']).toHaveLength(100);
  });
});

describe('parseNumber', () => {
  it.each([
    ['42', 42],
    ['$1,299.00', 1299],
    ['1 299,50 €', 1299.5],
    ['1.299,50', 1299.5],
    ['1,299', 1299],
    ['1.299.000', 1299000],
    ['3.5%', 3.5],
    ['-7 °C', -7],
    ['12,5 kg', 12.5],
    ['Price: 10.', 10],
  ])('parses %s', (text, expected) => {
    expect(parseNumber(text)).toBe(expected);
  });

  it('returns null when there is no number', () => {
    expect(parseNumber('out of stock')).toBeNull();
  });
});
