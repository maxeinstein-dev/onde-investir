// RASCUNHO: revisado na Tarefa 25 (/vozmax + usuário). Cada URL deve ser aberta e conferida.
export type IdTermo =
  | 'cdi' | 'selic' | 'ipca' | 'tr' | 'cdb' | 'lci-lca' | 'fgc' | 'tesouro' | 'ir-regressivo' | 'iof'
  | 'prazo-minimo' | 'dias-uteis' | 'liquidez' | 'custodia' | 'poupanca' | 'prefixado' | 'pos-fixado'
  | 'ipca-mais' | 'equivalencia' | 'valor-liquido' | 'marcacao-mercado';

export interface Termo { termo: string; curto: string; fonte: string }

export const GLOSSARIO: Record<IdTermo, Termo> = {
  cdi: { termo: 'CDI', curto: 'Taxa dos empréstimos de um dia entre bancos. Anda colada na Selic e é a referência dos pós-fixados: "103% do CDI" quer dizer render 103% dessa taxa.', fonte: 'https://www.b3.com.br/pt_br/market-data-e-indices/indices/indices-de-segmentos-e-setoriais/di/metodologia-de-apuracao-da-taxa/' },
  selic: { termo: 'Selic', curto: 'Taxa básica de juros da economia, definida nas reuniões do Copom. Quando ela sobe, os pós-fixados passam a render mais.', fonte: 'https://www.bcb.gov.br/controleinflacao/taxaselic' },
  ipca: { termo: 'IPCA', curto: 'Índice oficial de inflação do Brasil, medido pelo IBGE. Mostra quanto o custo de vida subiu.', fonte: 'https://www.ibge.gov.br/explica/inflacao.php' },
  tr: { termo: 'TR', curto: 'Taxa Referencial, calculada pelo Banco Central. Entra no rendimento da poupança, além da parcela fixa.', fonte: 'https://www.bcb.gov.br/pec/poupanca/poupanca.asp?frame=1' },
  cdb: { termo: 'CDB', curto: 'Certificado de Depósito Bancário: você empresta dinheiro ao banco e recebe juros. Paga **IR** e tem garantia do **FGC**.', fonte: 'https://fgc.org.br/documents/d/asset-library-52554/regulamento-fgc' },
  'lci-lca': { termo: 'LCI e LCA', curto: 'Letras de Crédito Imobiliário e do Agronegócio. São **isentas de IR** para pessoa física e têm garantia do FGC, mas têm prazo mínimo antes do resgate.', fonte: 'https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/titulos-bancarios/letra-de-credito-imobiliario-lci-e-letra-de-credito-do-agronegocio-lca' },
  fgc: { termo: 'FGC', curto: 'Fundo Garantidor de Créditos. Se o banco quebrar, devolve até R$ 250 mil por CPF por instituição, somando principal e rendimentos, com teto de R$ 1 milhão a cada 4 anos.', fonte: 'https://fgc.org.br/documents/d/asset-library-52554/regulamento-fgc' },
  tesouro: { termo: 'Tesouro Direto', curto: 'Títulos públicos federais comprados direto do governo. A garantia é do Tesouro Nacional, considerada o menor risco de crédito do país.', fonte: 'https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/titulos-publicos' },
  'ir-regressivo': { termo: 'IR regressivo', curto: 'O imposto sobre o rendimento cai com o tempo: 22,5% até 180 dias, 20% até 360, 17,5% até 720 e 15% acima disso.', fonte: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11033.htm' },
  iof: { termo: 'IOF', curto: 'Imposto que só aparece se você resgatar em menos de 30 dias. Começa em 96% do rendimento no 1º dia e zera no 30º.', fonte: 'https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2007/decreto/d6306.htm' },
  'prazo-minimo': { termo: 'Prazo mínimo', curto: 'Tempo mínimo definido pelo Conselho Monetário Nacional antes de poder resgatar uma LCI ou LCA: 6 meses nas pós e prefixadas; LCI atualizada mensalmente pela inflação, 36 meses.', fonte: 'https://normativos.bcb.gov.br/Lists/Normativos/Attachments/48547/Res_4410_v6_P.pdf' },
  'dias-uteis': { termo: 'Dias úteis', curto: 'O CDI e a Selic só rendem em dias úteis, contados em base 252 por ano. Fim de semana e feriado não rendem.', fonte: 'https://www.b3.com.br/pt_br/market-data-e-indices/indices/indices-de-segmentos-e-setoriais/di/metodologia-de-calculo-do-indice-di/' },
  liquidez: { termo: 'Liquidez', curto: 'Facilidade de transformar o investimento em dinheiro. Liquidez diária: resgata quando quiser. No vencimento: só na data combinada.', fonte: 'https://www.gov.br/investidor/pt-br/investir/antes-de-investir/entenda-as-caracteristicas-dos-investimentos/liquidez' },
  custodia: { termo: 'Taxa de custódia', curto: 'A B3 cobra 0,20% ao ano pela guarda dos títulos do Tesouro, descontados quando há resgate, vencimento ou pagamento de juros. No Tesouro Selic, os primeiros R$ 10 mil são isentos.', fonte: 'https://www.b3.com.br/pt_br/produtos-e-servicos/tarifas/tarifas-de-tesouro-direto/' },
  poupanca: { termo: 'Poupança', curto: 'Isenta de IR e com garantia do FGC, mas só rende na data de aniversário mensal: sacar um dia antes perde o mês.', fonte: 'https://www.bcb.gov.br/pec/poupanca/poupanca.asp?frame=1' },
  prefixado: { termo: 'Prefixado', curto: 'A taxa é combinada na aplicação e não muda. Você sabe hoje quanto vai receber no vencimento.', fonte: 'https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/titulos-publicos' },
  'pos-fixado': { termo: 'Pós-fixado', curto: 'O rendimento acompanha um indicador, como o CDI ou a Selic. Se os juros sobem, rende mais; se caem, rende menos.', fonte: 'https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/titulos-publicos' },
  'ipca-mais': { termo: 'IPCA+', curto: 'Paga a inflação do período mais uma taxa fixa de juro real. Protege o poder de compra.', fonte: 'https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/titulos-publicos' },
  equivalencia: { termo: 'Taxa equivalente', curto: 'A taxa que outro investimento precisaria ter para terminar com o mesmo valor líquido. Serve para comparar produtos com impostos diferentes.', fonte: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11033.htm' },
  'marcacao-mercado': { termo: 'Marcação a mercado', curto: 'Atualização diária do preço de um título pelas taxas do mercado. Quem vende antes do vencimento recebe esse preço, que pode ser maior ou menor que o previsto; quem leva até o vencimento recebe a taxa combinada.', fonte: 'https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/titulos-publicos' },
  'valor-liquido': { termo: 'Valor líquido', curto: 'O que sobra depois de IOF, IR e taxas. É o número que importa para comparar.', fonte: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11033.htm' },
};
