import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

describe('theme tokens in index.css', () => {
  it('restores the indigo accent tokens with high-contrast accent-ink in dark and light themes', () => {
    const darkBlock = indexCss.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    const lightBlock = indexCss.match(/:root\[data-theme="light"\]\s*\{([\s\S]*?)\}/)?.[1] ?? '';

    expect(darkBlock).toContain('--accent: #8b93ff;');
    expect(darkBlock).toContain('--accent-hover: #757ef5;');
    expect(darkBlock).toContain('--accent-ink: #0a0d14;');
    expect(darkBlock).toContain('--warn: #fbbf24;');

    expect(lightBlock).toContain('--accent: #5b63e6;');
    expect(lightBlock).toContain('--accent-hover: #4b53d1;');
    expect(lightBlock).toContain('--accent-ink: #ffffff;');
    expect(lightBlock).toContain('--warn: #d97706;');
  });
});
