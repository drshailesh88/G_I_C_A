import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) =>
    createElement('div', { 'data-testid': 'app-shell' }, children),
}));

vi.mock('@/components/tab-bar', () => ({
  TabBar: () => createElement('nav', { 'data-testid': 'tab-bar' }),
}));

import AppLayout from './layout';

function render(children?: ReactNode) {
  const content = children ?? createElement('div', { 'data-testid': 'content' }, 'Page Content');
  return renderToStaticMarkup(createElement(AppLayout, null, content));
}

describe('AppLayout', () => {
  it('wraps page content in AppShell', () => {
    const html = render();
    expect(html).toContain('data-testid="app-shell"');
    expect(html).toContain('Page Content');
  });

  it('keeps TabBar mounted at the layout level', () => {
    const html = render();
    expect(html).toContain('data-testid="tab-bar"');
  });

  it('renders children unchanged', () => {
    const html = render(createElement('h1', null, 'Test Content'));
    expect(html).toContain('Test Content');
  });
});
