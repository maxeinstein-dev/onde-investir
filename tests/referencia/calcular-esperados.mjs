// Gera os valores esperados dos testes do engine por um caminho independente (itera dia a dia com Date,
// Páscoa por Gauss, bisseção própria). Rodar: node tests/referencia/calcular-esperados.mjs
// Cenário: CDI 13,65% a.a., Selic meta 13,75%, IPCA 4,22% a.a., TR 0,1646% a.m. (SGS, 24/09/2026).
// Referência independente: itera dia a dia com Date UTC (implementação diferente da do plano).
const D = (s) => new Date(s + 'T00:00:00Z');
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

// Páscoa — algoritmo de Gauss (diferente do Meeus usado no plano)
function pascoaGauss(Y) {
  const a = Y % 19, b = Y % 4, c = Y % 7, k = Math.floor(Y / 100);
  const p = Math.floor((13 + 8 * k) / 25), q = Math.floor(k / 4);
  const M = (15 - p + k - q) % 30, N = (4 + k - q) % 7;
  const d = (19 * a + M) % 30, e = (2 * b + 4 * c + 6 * d + N) % 7;
  let dia = 22 + d + e, mes = 3;
  if (dia > 31) { dia = d + e - 9; mes = 4; }
  if (d === 29 && e === 6) { dia = 19; mes = 4; }
  if (d === 28 && e === 6 && (11 * M + 11) % 30 < 19) { dia = 18; mes = 4; }
  return `${Y}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}
const feriados = new Set();
for (let y = 2020; y <= 2080; y++) {
  ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'].forEach((md) => feriados.add(`${y}-${md}`));
  if (y >= 2024) feriados.add(`${y}-11-20`);
  const p = D(pascoaGauss(y));
  [-48, -47, -2, 60].forEach((o) => feriados.add(iso(addDays(p, o))));
}
const util = (d) => { const w = d.getUTCDay(); return w !== 0 && w !== 6 && !feriados.has(iso(d)); };
const du = (a, b) => { let n = 0; for (let d = D(a); d < D(b); d = addDays(d, 1)) if (util(d)) n++; return n; };
const dc = (a, b) => Math.round((D(b) - D(a)) / 86400000);
const ir = (dias) => (dias <= 180 ? 0.225 : dias <= 360 ? 0.2 : dias <= 720 ? 0.175 : 0.15);

console.log('Pascoa', [2024,2025,2026,2027,2028,2029,2030,2031,2032,2033,2034,2035].map(pascoaGauss).join(' '));
console.log('DU ano 2025', du('2025-01-01', '2026-01-01'), 'DU ano 2026', du('2026-01-01', '2027-01-01'), 'DU ano 2027', du('2027-01-01', '2028-01-01'));
console.log('DU 2026-09-28 -> 2026-10-28', du('2026-09-28', '2026-10-28'));
console.log('DU carnaval semana 2026-02-13 -> 2026-02-20', du('2026-02-13', '2026-02-20'));

// IPCA por segmento de mês civil: mês inteiro × (1 + i)^(1/12); mês parcial × (1 + i)^((DU_decorridos/DU_mês)/12).
// Caminho diferente do engine (que multiplica dia útil a dia útil por (1 + i)^(1/(12 × DU_mês))).
function ipcaMensal(a, b, i = 0.0422) {
  let f = 1;
  let [y, m] = a.split('-').map(Number);
  for (;;) {
    const iniMes = `${y}-${String(m).padStart(2, '0')}-01`;
    const [y2, m2] = m === 12 ? [y + 1, 1] : [y, m + 1];
    const fimMes = `${y2}-${String(m2).padStart(2, '0')}-01`;
    if (iniMes >= b) break;
    const segIni = a > iniMes ? a : iniMes;
    const segFim = b < fimMes ? b : fimMes;
    if (segIni === iniMes && segFim === fimMes) f *= Math.pow(1 + i, 1 / 12);
    else f *= Math.pow(1 + i, du(segIni, segFim) / du(iniMes, fimMes) / 12);
    [y, m] = [y2, m2];
  }
  return f;
}
console.log('IPCA ano 2026', ipcaMensal('2026-01-01', '2027-01-01'), 'IPCA out/2026', ipcaMensal('2026-10-01', '2026-11-01'), 'IPCA dez/2026', ipcaMensal('2026-12-01', '2027-01-01'), '(1,0422)^(1/12)', Math.pow(1.0422, 1 / 12), 'DU out/2026', du('2026-10-01', '2026-11-01'), 'DU dez/2026', du('2026-12-01', '2027-01-01'));

const CDI = 0.1365;
function pos(pct, ini, fim, isento, V = 10000) {
  const n = du(ini, fim); let f = 1;
  const d = Math.pow(1 + CDI, 1 / 252) - 1;
  for (let i = 0; i < n; i++) f *= 1 + d * pct;
  const rend = V * (f - 1); const dias = dc(ini, fim);
  const irv = isento ? 0 : rend * ir(dias);
  return { du: n, dias, bruto: +(V * f).toFixed(6), ir: +irv.toFixed(6), liquido: +(V * f - irv).toFixed(6) };
}
const ini = '2026-09-28';
for (const fim of ['2027-03-29', '2027-09-28', '2028-09-28', '2029-09-28']) {
  console.log('CDB103', fim, JSON.stringify(pos(1.03, ini, fim, false)));
  console.log('LCI80 ', fim, JSON.stringify(pos(0.80, ini, fim, true)));
}
// Prefixado 13% a.a. 2 anos
{ const n = du(ini, '2028-09-28'); const f = Math.pow(1.13, n / 252); const r = 10000 * (f - 1); console.log('PRE13 2a', n, (10000 * f).toFixed(6), 'liq', (10000 * f - r * 0.15).toFixed(6)); }
// IPCA+ 7% com IPCA 4.22% 3 anos
{ const n = du(ini, '2029-09-28'); const f = ipcaMensal(ini, '2029-09-28') * Math.pow(1.07, n / 252); const r = 10000 * (f - 1); console.log('IPCA+7 3a', n, (10000 * f).toFixed(6), 'liq', (10000 * f - r * 0.15).toFixed(6)); }
// IOF: resgate em 15 dias corridos de CDB 100% CDI
{ const fim = iso(addDays(D(ini), 15)); const n = du(ini, fim); const f = Math.pow(Math.pow(1 + CDI, 1 / 252), n); const r = 10000 * (f - 1); const iof = r * 0.5; const irv = (r - iof) * 0.225; console.log('IOF15', fim, n, 'rend', r.toFixed(6), 'iof', iof.toFixed(6), 'ir', irv.toFixed(6), 'liq', (10000 + r - iof - irv).toFixed(6)); }
// Tesouro Selic: selic over = 13.65 (=CDI no cenário), 1 ano, V=10100 e 50000, custódia 0.2% a.a. sobre (média - isenção) * dias/365
function selic(V, fim, isencao = 10000) { const n = du(ini, fim); const f = Math.pow(1 + CDI, n / 252); const bruto = V * f; const dias = dc(ini, fim); const media = (V + bruto) / 2; const cust = 0.002 * dias / 365 * Math.max(0, media - isencao); const r = bruto - V; const irv = (r - cust) * ir(dias); return { n, dias, bruto: bruto.toFixed(6), cust: cust.toFixed(6), ir: irv.toFixed(6), liq: (bruto - cust - irv).toFixed(6) }; }
for (const V of [8000, 10100, 50000]) console.log('SELIC', V, JSON.stringify(selic(V, '2027-09-28')));
// Poupança: Selic 13.75 > 8.5 -> 0.5% + TR 0.1646% a.m.; aplicação 2026-09-28, resgate 2027-03-27 (antes do 6º aniversário) e 2027-03-28
function poup(ini2, fim, V = 10000, tr = 0.001646) {
  const [y, m, d] = ini2.split('-').map(Number);
  let aniv = d >= 29 ? 1 : d; let yy = y, mm = m + (d >= 29 ? 1 : 0);
  let meses = 0;
  for (let k = 1; k < 200; k++) {
    let M = mm + k; let Y = yy + Math.floor((M - 1) / 12); M = ((M - 1) % 12) + 1;
    const dt = `${Y}-${String(M).padStart(2, '0')}-${String(aniv).padStart(2, '0')}`;
    if (dt <= fim) meses = k; else break;
  }
  const taxa = (1.005) * (1 + tr) - 1; return { meses, valor: (V * Math.pow(1 + taxa, meses)).toFixed(6) };
}
console.log('POUP', JSON.stringify(poup('2026-09-28', '2027-03-27')), JSON.stringify(poup('2026-09-28', '2027-03-28')));
console.log('POUP31', JSON.stringify(poup('2026-10-31', '2026-11-30')), JSON.stringify(poup('2026-10-31', '2026-12-01')));
// Poupança regra 70%: Selic 8% a.a. -> mensal (1+0.7*0.08)^(1/12)-1 , TR 0
{ const t = Math.pow(1 + 0.7 * 0.08, 1 / 12) - 1; console.log('POUP70 3m', (10000 * Math.pow(1 + t, 3)).toFixed(6)); }
// Equivalências exatas por bisseção
function bis(f, alvo, lo, hi) { for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (f(m) < alvo) lo = m; else hi = m; } return (lo + hi) / 2; }
for (const fim of ['2027-09-28', '2028-09-28']) {
  const alvo = pos(0.80, ini, fim, true).liquido; const dias = dc(ini, fim); const n = du(ini, fim); const a = ir(dias);
  const pct = bis((p) => pos(p, ini, fim, false).liquido, alvo, 0, 10);
  const pre = bis((t) => { const f = Math.pow(1 + t, n / 252); return 10000 * f - 10000 * (f - 1) * a; }, alvo, 0, 2);
  const fIpca = ipcaMensal(ini, fim);
  const real = bis((t) => { const f = fIpca * Math.pow(1 + t, n / 252); return 10000 * f - 10000 * (f - 1) * a; }, alvo, -0.5, 2);
  console.log('EQ LCI80', fim, 'alvo', alvo, 'fIpca', fIpca.toFixed(10), 'cdbPct', (pct * 100).toFixed(4), 'bolso', (80 / (1 - a)).toFixed(4), 'pre', (pre * 100).toFixed(4), 'ipca+', (real * 100).toFixed(6));
}
// Equivalência inversa: CDB 103% 2 anos -> LCI isenta % CDI
{ const fim = '2028-09-28'; const alvo = pos(1.03, ini, fim, false).liquido; const pct = bis((p) => pos(p, ini, fim, true).liquido, alvo, 0, 10); console.log('EQ CDB103 2a -> isento', (pct * 100).toFixed(4), 'bolso', (103 * 0.85).toFixed(4)); }
