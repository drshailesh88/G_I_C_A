import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from './app-shell';

function render(children: React.ReactNode = 'Test Content') {
  return renderToStaticMarkup(createElement(AppShell, null, children));
}

describe('AppShell', () => {
  it('renders children', () => {
    const html = render('Hello World');
    expect(html).toContain('Hello World');
  });

  it('does not use max-w-lg (old layout removed)', () => {
    const html = render();
    expect(html).not.toContain('max-w-lg');
  });

  it('uses responsive container classes', () => {
    const html = render();
    // Main content area should have responsive max-width
    expect(html).toContain('max-w-6xl');
  });

  it('renders a main element for content', () => {
    const html = render();
    expect(html).toContain('<main');
  });

  it('has min-h-screen on outer wrapper', () => {
    const html = render();
    expect(html).toContain('min-h-screen');
  });

  it('renders a stable content area wrapper', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      new URL('./app-shell.tsx', import.meta.url).pathname,
      'utf-8',
    );
    expect(source).toContain('data-testid="content-area"');
  });
});
