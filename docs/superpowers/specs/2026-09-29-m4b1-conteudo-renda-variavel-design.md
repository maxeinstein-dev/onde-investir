# M4b1: Conteúdo educativo de renda variável — Design

- **Data:** 2026-09-29
- **Status:** aprovado, pronto para o plano de implementação
- **Relação com a spec principal:** parte da seção 9.2 de
  `docs/superpowers/specs/2026-09-27-onde-investir-design.md` ("Renda variável — Educativo").
  A parte "Calculável" (histórico via brapi.dev, gráfico, comparação com CDI/IPCA) fica
  para o M4b2, que também traz a infraestrutura da Cloudflare (proxy, Turnstile, KV).

## 1. Objetivo

Enriquecer a lição 10 ("Renda variável"), hoje só conceitual, com os fatos tributários
específicos de FII e ações — cada um versionado no engine, com fonte, no mesmo padrão de
IR, IOF, FGC e das demais regras do app. Corrigir também uma lacuna do M4a: o design da
sugestão por objetivo previa uma nota para a lição de renda variável em objetivos de
longo prazo acima de 5 anos, que não chegou a ser implementada.

### Fora do escopo (M4b1)

- Qualquer cálculo com dados de mercado (fica para M4b2).
- Indicação de ativos específicos (a spec principal já proíbe isso, e este marco não
  muda essa regra).

## 2. Regras versionadas (`src/engine/regras/rendaVariavel.ts`)

Mesmo padrão de `resolverRegra`/`VersaoRegra` usado em `regras/ir.ts`, `regras/fgc.ts`
etc.

```ts
export interface RegraFII {
  /** Cotistas mínimos do fundo para a isenção dos rendimentos distribuídos (Lei 14.754/2023). */
  minimoCotistas: number;
  /** Participação máxima do cotista (fração) para manter a isenção. */
  participacaoMaximaFracao: number;
  /** Alíquota do ganho de capital na venda de cotas — sempre tributado, sem isenção por valor. */
  aliquotaVendaCotas: number;
}

export interface RegraVendaAcoes {
  /** Limite de vendas no mês, no mercado à vista, para a isenção do ganho (Lei 11.033/2004, art. 3º, I). */
  limiteMensalIsento: number;
}
```

Versões:
- `RegraFII`: vigência desde **2023-12-13** (Lei 14.754/2023, que elevou o piso de 50
  para 100 cotistas), `{ minimoCotistas: 100, participacaoMaximaFracao: 0.10,
  aliquotaVendaCotas: 0.20 }`. Fonte principal (confiança média-alta, sem acesso direto
  ao Planalto nesta pesquisa): resumo de escritório de advocacia (Mayer Brown) sobre a
  Lei 15.270/2025, que confirma a manutenção da regra em 2026. **Registrar no arquivo um
  comentário pedindo conferência do texto oficial da Lei 14.754/2023 quando o Planalto
  estiver acessível** — mesmo tratamento já dado à carência da LCI-IPCA no M1.
- `RegraVendaAcoes`: vigência desde **2004-12-21** (Lei 11.033/2004), `{
  limiteMensalIsento: 20_000 }`. Fonte: texto oficial via Câmara dos Deputados
  (legin.camara.leg.br), confiança alta.

## 3. Conteúdo da lição 10

Nova seção "Impostos na renda variável", com três afirmações, cada uma citando a regra
acima (nunca um número solto no texto):
1. Dividendos de FII são isentos de IR para pessoa física, com condições (100 cotistas,
   cotista com menos de 10% do fundo, cotas só em bolsa/balcão organizado).
2. Vender ações no mercado à vista até R$ 20 mil por mês é isento de IR sobre o ganho —
   só ações, não vale para FII, ETF nem day trade.
3. Vender cotas de FII é sempre tributado a 20%, sem nenhuma isenção por valor — ao
   contrário das ações.

Os textos são rascunho nesta fase; passam pela revisão editorial (/vozmax + aprovação)
antes do PR, no mesmo fluxo de todos os marcos anteriores.

## 4. Correção da lacuna do M4a

`src/conteudo/sugestao.ts` ganha:

```ts
/** Nota fixa para a lição de renda variável, sem cálculo, em objetivos de longo prazo (spec §9.1/§9.2). */
export function notaRendaVariavel(objetivo: Objetivo): string | null {
  const horizonte = objetivo.tipo === 'LONGO_PRAZO' || objetivo.tipo === 'SEM_OBJETIVO' ? objetivo.horizonteAnos : 0;
  return horizonte > 5
    ? 'Para prazos acima de 5 anos, carteiras costumam incluir renda variável.'
    : null;
}
```

`src/ui/objetivos/Sugestao.tsx` mostra essa nota uma vez, abaixo da lista de fatias,
junto com um `LinkLicao` para `'renda-variavel'` — não é uma fatia nem um `MotivoFatia`
novo (o design original já dizia "uma nota fixa", no singular, e não por fatia).

## 5. Testes

- **Engine:** as duas regras versionadas, com teste de fronteira de vigência (antes e
  depois de 2023-12-13 para a de FII, se uma versão anterior existir; senão, só a
  vigente).
- **Conteúdo:** a lição 10 continua passando no teste de integridade (fontes `https://`,
  termos existentes no glossário); os três fatos citam a regra certa, sem número
  hardcoded fora de `regras/rendaVariavel.ts`.
- **UI:** `notaRendaVariavel` aparece para LONGO_PRAZO com horizonte 6+ e para
  SEM_OBJETIVO com horizonte 6+; não aparece para RESERVA, COM_DATA, nem para horizonte
  ≤ 5.

## 6. Marco e fluxo

Branch `m4b1`, a partir da `main` atualizada (já com o M4a mergeado). TDD estrito,
revisão de código, revisão editorial dos textos, PR com auto-fix ligado — o mesmo fluxo
de todos os marcos anteriores.
