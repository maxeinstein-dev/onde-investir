import { describe, expect, it } from 'vitest';
import { validadeDiaria, validadeFocus, validadeHoras } from '../../src/dados/validade';

const t = (s: string) => Date.parse(s);

describe('validade até o próximo evento (BRT)', () => {
  it('diária: próximo dia útil às 10h; se hoje é útil e ainda não deu 10h, hoje às 10h', () => {
    expect(validadeDiaria(t('2026-09-28T08:00:00-03:00'))).toBe(t('2026-09-28T10:00:00-03:00')); // segunda cedo
    expect(validadeDiaria(t('2026-09-28T15:00:00-03:00'))).toBe(t('2026-09-29T10:00:00-03:00'));
    expect(validadeDiaria(t('2026-09-25T18:00:00-03:00'))).toBe(t('2026-09-28T10:00:00-03:00')); // sexta → segunda
    expect(validadeDiaria(t('2026-11-19T18:00:00-03:00'))).toBe(t('2026-11-23T10:00:00-03:00')); // 20/11 feriado
  });
  it('Focus: próxima segunda às 10h', () => {
    expect(validadeFocus(t('2026-09-27T12:00:00-03:00'))).toBe(t('2026-09-28T10:00:00-03:00')); // domingo
    expect(validadeFocus(t('2026-09-28T09:00:00-03:00'))).toBe(t('2026-09-28T10:00:00-03:00'));
    expect(validadeFocus(t('2026-09-28T11:00:00-03:00'))).toBe(t('2026-10-05T10:00:00-03:00'));
  });
  it('horas', () => {
    expect(validadeHoras(1000, 24)).toBe(1000 + 86_400_000);
  });
});
