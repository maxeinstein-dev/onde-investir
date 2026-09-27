// RASCUNHO: revisado na Tarefa 25 (/vozmax + usuário). Cada URL deve ser aberta e conferida.
export type IdTermo =
  | 'cdi' | 'selic' | 'ipca' | 'tr' | 'cdb' | 'lci-lca' | 'fgc' | 'tesouro' | 'ir-regressivo' | 'iof'
  | 'prazo-minimo' | 'dias-uteis' | 'liquidez' | 'custodia' | 'poupanca' | 'prefixado' | 'pos-fixado'
  | 'ipca-mais' | 'equivalencia' | 'valor-liquido';

export interface Termo { termo: string; curto: string; fonte: string }

export const GLOSSARIO: Record<IdTermo, Termo> = {
  cdi: { termo: 'CDI', curto: 'Taxa dos empréstimos de um dia entre bancos. Anda colada na Selic e é a referência dos pós-fixados: "103% do CDI" quer dizer render 103% dessa taxa.', fonte: 'https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/consultas/mercado-de-derivativos/indicadores/indicadores-financeiros/' },
  selic: { termo: 'Selic', curto: 'Taxa básica de juros da economia, definida pelo Copom a cada 45 dias. Quando ela sobe, os pós-fixados passam a render mais.', fonte: 'https://www.bcb.gov.br/controleinflacao/taxaselic' },
  ipca: { termo: 'IPCA', curto: 'Índice oficial de inflação do Brasil, medido pelo IBGE. Mostra quanto o custo de vida subiu.', fonte: 'https://www.ibge.gov.br/explica/inflacao.php' },
  tr: { termo: 'TR', curto: 'Taxa Referencial, calculada pelo Banco Central. Entra no rendimento da poupança, além da parcela fixa.', fonte: 'https://www.bcb.gov.br/pec/poupanca/poupanca.asp?frame=1' },
  cdb: { termo: 'CDB', curto: 'Certificado de Depósito Bancário: você empresta dinheiro ao banco e recebe juros. Paga **IR** e tem garantia do **FGC**.', fonte: 'https://www.fgc.org.br/en/sobre-garantia-fgc' },
  'lci-lca': { termo: 'LCI e LCA', curto: 'Letras de Crédito Imobiliário e do Agronegócio. São **isentas de IR** para pessoa física e têm garantia do FGC, mas têm prazo mínimo antes do resgate.', fonte: 'https://www.b3.com.br/data/files/63/43/8C/0B/43FF69106B8BCB69AC094EA8/CE%20016-2025-VPC%20PLATAFORMA%20NOME%20BALCAO%20B3_LCA_LCI.pdf' },
  fgc: { termo: 'FGC', curto: 'Fundo Garantidor de Créditos. Se o banco quebrar, devolve até R$ 250 mil por CPF por instituição, somando principal e rendimentos, com teto de R$ 1 milhão a cada 4 anos.', fonte: 'https://www.fgc.org.br/en/sobre-garantia-fgc' },
  tesouro: { termo: 'Tesouro Direto', curto: 'Títulos públicos federais comprados direto do governo. A garantia é do Tesouro Nacional, considerada o menor risco de crédito do país.', fonte: 'https://www.tesourodireto.com.br/' },
  'ir-regressivo': { termo: 'IR regressivo', curto: 'O imposto sobre o rendimento cai com o tempo: 22,5% até 180 dias, 20% até 360, 17,5% até 720 e 15% acima disso.', fonte: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11033.htm' },
  iof: { termo: 'IOF', curto: 'Imposto que só aparece se você resgatar em menos de 30 dias. Começa em 96% do rendimento no 1º dia e zera no 30º.', fonte: 'https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2007/decreto/d6306.htm' },
  'prazo-minimo': { termo: 'Prazo mínimo', curto: 'Tempo mínimo definido pelo Conselho Monetário Nacional antes de poder resgatar uma LCI ou LCA: 6 meses nas pós e prefixadas, mais nas atreladas ao IPCA.', fonte: 'https://www.b3.com.br/data/files/63/43/8C/0B/43FF69106B8BCB69AC094EA8/CE%20016-2025-VPC%20PLATAFORMA%20NOME%20BALCAO%20B3_LCA_LCI.pdf' },
  'dias-uteis': { termo: 'Dias úteis', curto: 'O CDI e a Selic só rendem em dias úteis, contados em base 252 por ano. Fim de semana e feriado não rendem.', fonte: 'https://www.anbima.com.br/feriados/feriados.asp' },
  liquidez: { termo: 'Liquidez', curto: 'Facilidade de transformar o investimento em dinheiro. Liquidez diária: resgata quando quiser. No vencimento: só na data combinada.', fonte: 'https://www.bcb.gov.br/cidadaniafinanceira' },
  custodia: { termo: 'Taxa de custódia', curto: 'A B3 cobra 0,20% ao ano pela guarda dos títulos do Tesouro, descontados no resgate. No Tesouro Selic, os primeiros R$ 10 mil são isentos.', fonte: 'https://www.b3.com.br/pt_br/produtos-e-servicos/tarifas/tarifas-de-tesouro-direto/' },
  poupanca: { termo: 'Poupança', curto: 'Isenta de IR e com garantia do FGC, mas só rende na data de aniversário mensal: sacar um dia antes perde o mês.', fonte: 'https://www.bcb.gov.br/pec/poupanca/poupanca.asp?frame=1' },
  prefixado: { termo: 'Prefixado', curto: 'A taxa é combinada na aplicação e não muda. Você sabe hoje quanto vai receber no vencimento.', fonte: 'https://www.tesourodireto.com.br/' },
  'pos-fixado': { termo: 'Pós-fixado', curto: 'O rendimento acompanha um indicador, como o CDI ou a Selic. Se os juros sobem, rende mais; se caem, rende menos.', fonte: 'https://www.tesourodireto.com.br/' },
  'ipca-mais': { termo: 'IPCA+', curto: 'Paga a inflação do período mais uma taxa fixa de juro real. Protege o poder de compra.', fonte: 'https://www.tesourodireto.com.br/' },
  equivalencia: { termo: 'Taxa equivalente', curto: 'A taxa que outro investimento precisaria ter para terminar com o mesmo valor líquido. Serve para comparar produtos com impostos diferentes.', fonte: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11033.htm' },
  'valor-liquido': { termo: 'Valor líquido', curto: 'O que sobra depois de IOF, IR e taxas. É o número que importa para comparar.', fonte: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11033.htm' },
};
