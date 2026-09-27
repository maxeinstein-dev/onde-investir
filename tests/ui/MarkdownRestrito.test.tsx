// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { MarkdownRestrito } from '../../src/ui/MarkdownRestrito';

afterEach(cleanup);

describe('MarkdownRestrito', () => {
  it('negrito, itálico e lista', () => {
    const { container } = render(<MarkdownRestrito texto={'**forte** e *leve*\n\n- um\n- dois'} />);
    expect(container.querySelector('strong')?.textContent).toBe('forte');
    expect(container.querySelector('em')?.textContent).toBe('leve');
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });
  it('link https com rel seguro', () => {
    const { container } = render(<MarkdownRestrito texto="[BCB](https://www.bcb.gov.br)" />);
    const a = container.querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://www.bcb.gov.br');
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a?.getAttribute('target')).toBe('_blank');
  });
  it('HTML vira texto e links não-https viram texto', () => {
    const { container } = render(<MarkdownRestrito texto={'<script>alert(1)</script> [x](javascript:alert(1)) <img src=x onerror=alert(1)>'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('<script>');
  });
});
