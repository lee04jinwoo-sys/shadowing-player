import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

// 기준 변경됨 (2026-11-21): indigo 액센트(47396e9) → Daily English Essay 종이 팔레트(ink 액센트).
// feat-ui-overhaul-diary 브랜치의 토큰을 React 프런트로 포팅한 값이다.
describe('theme tokens in index.css', () => {
  const darkBlock = indexCss.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? '';
  const lightBlock = indexCss.match(/:root\[data-theme="light"\]\s*\{([\s\S]*?)\}/)?.[1] ?? '';

  it('uses the paper palette with an ink accent in the light theme', () => {
    expect(lightBlock).toContain('--canvas: #fcfbf9;');
    expect(lightBlock).toContain('--ink: #37352f;');
    expect(lightBlock).toContain('--accent: #37352f;');
    expect(lightBlock).toContain('--accent-ink: #ffffff;');
    expect(lightBlock).toContain('--good: #2f8f5b;');
    expect(lightBlock).toContain('--warn: #b9770e;');
    expect(lightBlock).toContain('--danger: #d44c47;');
  });

  it('uses the charcoal palette with an ink accent in the dark theme', () => {
    expect(darkBlock).toContain('--canvas: #191919;');
    expect(darkBlock).toContain('--ink: #e6e6e6;');
    expect(darkBlock).toContain('--accent: #e6e6e6;');
    expect(darkBlock).toContain('--accent-ink: #191919;');
    expect(darkBlock).toContain('--warn: #fbbf24;');
  });

  it('exposes a serif font token for the brand wordmark', () => {
    expect(indexCss).toMatch(/--font-serif:\s*"Lora"/);
    expect(indexHtml).toContain('family=Lora');
  });
});
