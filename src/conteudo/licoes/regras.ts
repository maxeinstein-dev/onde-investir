// src/conteudo/licoes/regras.ts
// Os valores das regras que os textos da trilha citam, lidos das regras versionadas do engine (a versão vigente).
// Nada de número digitado no texto: se a regra mudar, a lição muda junto.
import { VERSOES_CUSTODIA } from '../../engine/regras/custodia';
import { VERSOES_FGC } from '../../engine/regras/fgc';
import { VERSOES_IOF } from '../../engine/regras/iof';
import { VERSOES_IR } from '../../engine/regras/ir';
import { VERSOES_POUPANCA } from '../../engine/regras/poupanca';
import { VERSOES_PRAZO_MINIMO } from '../../engine/regras/prazoMinimo';
import { VERSOES_FII, VERSOES_VENDA_ACOES } from '../../engine/regras/rendaVariavel';
import type { VersaoRegra } from '../../engine/regras/tipos';
import { formatarData, formatarPercentual } from '../../formato';
import { reaisRedondos } from '../alertas';

/** A versão ainda vigente (sem fim de vigência). */
function vigente<T>(nome: string, versoes: readonly VersaoRegra<T>[]): VersaoRegra<T> {
  const v = versoes.find((x) => x.vigenciaFim === undefined);
  if (!v) throw new Error(`Sem versão vigente da regra ${nome}`);
  return v;
}

const ir = vigente('IR', VERSOES_IR);
const iof = vigente('IOF', VERSOES_IOF);
const custodia = vigente('custódia', VERSOES_CUSTODIA);
const fgc = vigente('FGC', VERSOES_FGC);
const poupanca = vigente('poupança', VERSOES_POUPANCA);
/** A versão da poupança imediatamente anterior à vigente: vale para sempre nos depósitos feitos antes dela. */
const poupancaAnterior = VERSOES_POUPANCA.find((v) => v.vigenciaFim === poupanca.vigenciaInicio);
if (!poupancaAnterior) throw new Error('Sem a versão anterior da regra poupança');
const prazo = vigente('prazo mínimo', VERSOES_PRAZO_MINIMO);
const fii = vigente('FII', VERSOES_FII);
const vendaAcoes = vigente('venda de ações', VERSOES_VENDA_ACOES);

const faixas = ir.valor;
const pct = formatarPercentual;

/** "22,5% até 180 dias, 20% de 181 a 360 dias, 17,5% de 361 a 720 dias e 15% acima de 720 dias". */
function faixasIR(): string {
  const partes = faixas.map((f, i) => {
    const anterior = faixas[i - 1];
    if (!Number.isFinite(f.ateDias)) return `${pct(f.aliquota)} acima de ${anterior?.ateDias ?? 0} dias`;
    return anterior ? `${pct(f.aliquota)} de ${anterior.ateDias + 1} a ${f.ateDias} dias` : `${pct(f.aliquota)} até ${f.ateDias} dias`;
  });
  return `${partes.slice(0, -1).join(', ')} e ${partes.at(-1) ?? ''}`;
}

const limiar = poupanca.valor.limiarSelicAA ?? 0;
const fracao = poupanca.valor.fracaoSelic ?? 0;

export const REGRAS = {
  ir: {
    fonte: ir.fonte,
    faixas: faixasIR(),
    /** As alíquotas, da maior para a menor, formatadas ("22,5%", ...). */
    aliquotas: faixas.map((f) => pct(f.aliquota)),
    /** O último dia de cada faixa, menos a última (180, 360, 720). */
    limites: faixas.flatMap((f) => (Number.isFinite(f.ateDias) ? [f.ateDias] : [])),
    maior: pct(faixas[0]?.aliquota ?? 0),
    menor: pct(faixas.at(-1)?.aliquota ?? 0),
    /** Os dias a partir dos quais vale a menor alíquota (o fim da penúltima faixa + 1). */
    diasDaMenor: (faixas.at(-2)?.ateDias ?? 0) + 1,
  },
  iof: {
    fonte: iof.fonte,
    primeiroDia: pct((iof.valor[0] ?? 0) / 100),
    /** O dia em que o IOF zera (a tabela vai do 1º ao 29º dia). */
    diaQueZera: iof.valor.length + 1,
  },
  custodia: {
    fonte: custodia.fonte,
    taxa: pct(custodia.valor.taxaAA),
    isencaoSelic: reaisRedondos(custodia.valor.isencaoSelic),
  },
  fgc: {
    fonte: fgc.fonte,
    porConglomerado: reaisRedondos(fgc.valor.porConglomerado),
    tetoGlobal: reaisRedondos(fgc.valor.tetoGlobal),
    janelaAnos: fgc.valor.janelaAnos,
  },
  poupanca: {
    fonte: poupanca.fonte,
    taxaFixa: pct(poupanca.valor.taxaFixaAM),
    limiarSelic: pct(limiar),
    fracaoSelic: pct(fracao),
    /** A data de início da regra vigente (dd/mm/aaaa): ela vale para os depósitos feitos desde então. */
    desde: formatarData(poupanca.vigenciaInicio),
    /** A regra dos depósitos anteriores. */
    fonteAnterior: poupancaAnterior.fonte,
    taxaFixaAnterior: pct(poupancaAnterior.valor.taxaFixaAM),
  },
  prazoMinimo: {
    fonte: prazo.fonte,
    demais: prazo.valor.LCI.demais,
    lciComIPCA: prazo.valor.LCI.comIPCA,
  },
  rendaVariavel: {
    fonteFII: fii.fonte,
    minimoCotistasFII: fii.valor.minimoCotistas,
    participacaoMaximaFII: pct(fii.valor.participacaoMaximaFracao),
    aliquotaVendaFII: pct(fii.valor.aliquotaVendaCotas),
    fonteVendaAcoes: vendaAcoes.fonte,
    limiteVendaAcoes: reaisRedondos(vendaAcoes.valor.limiteMensalIsento),
  },
} as const;
