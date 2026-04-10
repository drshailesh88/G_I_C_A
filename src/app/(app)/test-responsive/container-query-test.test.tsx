import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ContainerQueryTest } from './container-query-test';

describe('ContainerQueryTest', () => {
  it('renders @container class on the outer wrapper', () => {
    const html = renderToStaticMarkup(createElement(ContainerQueryTest));
    expect(html).toContain('@container');
  });

  it('renders container-responsive breakpoint classes (@md:, @lg:)', () => {
    const html = renderToStaticMarkup(createElement(ContainerQueryTest));
    expect(html).toContain('@md:flex-row');
    expect(html).toContain('@lg:grid');
    expect(html).toContain('@lg:grid-cols-3');
  });

  it('renders named container syntax (@container/card)', () => {
    const html = renderToStaticMarkup(createElement(ContainerQueryTest));
    expect(html).toContain('@container/card');
  });

  it('renders all container breakpoint variants (@sm, @md, @lg, @xl)', () => {
    const html = renderToStaticMarkup(createElement(ContainerQueryTest));
    expect(html).toContain('@sm:');
    expect(html).toContain('@md:');
    expect(html).toContain('@lg:');
    expect(html).toContain('@xl:');
  });

  it('renders three card children', () => {
    const html = renderToStaticMarkup(createElement(ContainerQueryTest));
    const cardMatches = html.match(/Card \d/g);
    expect(cardMatches).toHaveLength(3);
  });
});
