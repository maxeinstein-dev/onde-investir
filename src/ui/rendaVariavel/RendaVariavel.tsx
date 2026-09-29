// Aba "Renda variável" (M4b2c): ticker → rentabilidade, volatilidade e drawdown do histórico, ao lado de
// CDI e IPCA no mesmo período. O Turnstile só dispara quando a aba fica ativa (todas as abas ficam montadas).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  AVISO_TURNSTILE, CONSULTANDO, ERRO_TICKER, HISTORICO_CURTO, INTRO_RENDA_VARIAVEL, NAO_INDICA, PREGOES_MINIMOS_HISTORICO,
  SEM_DADOS, SEM_HISTORICO_CDI_IPCA, TITULO_RENDA_VARIAVEL, VERIFICANDO_ACESSO, textoErroMercado, textoErroSessao,
} from '../../conteudo/rendaVariavel';
import { AVISO_EDUCATIVO } from '../../conteudo/sugestao';
import { buscarHistorico, validarTickerCliente } from '../../dados/mercado';
import { obterSessao } from '../../dados/turnstile';
import type { DataISO } from '../../engine/datas';
import type { Cenario } from '../../engine/indexadores';
import { type CandleFechamento, analisarRendaVariavel } from '../../engine/rendaVariavel';
import { formatarData, formatarPercentual } from '../../formato';
import { LinkLicao } from '../aprender/LinkLicao';

export interface PropsRendaVariavel {
  ativa: boolean;
  /** O cenário HISTÓRICO (o mesmo da aba Carteira): o período comparado é passado. */
  cenario: Cenario;
  /** false enquanto o histórico de CDI e IPCA não chegou (ou é inválido): `cenario` seria o projetado. */
  cenarioRealizado: boolean;
  /** Início do período consultado: o App carrega o histórico de CDI e IPCA desde esse ano. */
  onPeriodo: (inicio: DataISO) => void;
}

export function RendaVariavel({ ativa, cenario, cenarioRealizado, onPeriodo }: PropsRendaVariavel) {
  const [ticker, setTicker] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [consultando, setConsultando] = useState(false);
  const [falhouSessao, setFalhouSessao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [candles, setCandles] = useState<CandleFechamento[] | null>(null);
  // Derivada (não guardada): se o histórico chegar depois da consulta, CDI e IPCA se corrigem sozinhos.
  const analise = useMemo(() => (candles === null ? null : analisarRendaVariavel(candles, cenario)), [candles, cenario]);
  const container = useRef<HTMLDivElement>(null);
  const jaDisparou = useRef(false);

  async function garantirSessao(): Promise<boolean> {
    if (!container.current) return false;
    setVerificando(true);
    setErro(null);
    setFalhouSessao(false);
    const r = await obterSessao(container.current);
    setVerificando(false);
    if (!r.ok) {
      setErro(textoErroSessao(r.erro));
      setFalhouSessao(true);
      return false;
    }
    return true;
  }

  useEffect(() => {
    if (!ativa || jaDisparou.current) return;
    jaDisparou.current = true;
    void garantirSessao();
  }, [ativa]);

  async function consultar(e: Event) {
    e.preventDefault();
    if (!validarTickerCliente(ticker)) {
      setErro(ERRO_TICKER);
      setCandles(null);
      return;
    }
    setErro(null);
    setCandles(null);
    setConsultando(true);
    let r = await buscarHistorico(ticker);
    if (!r.ok && r.erro === 'SEM_SESSAO') {
      // O cookie venceu: renova UMA vez e repete a consulta.
      if (await garantirSessao()) r = await buscarHistorico(ticker);
      else { setConsultando(false); return; }
    }
    setConsultando(false);
    if (!r.ok) {
      setErro(textoErroMercado(r.erro));
      return;
    }
    const a = analisarRendaVariavel(r.candles, cenario);
    if (a === null) { setErro(SEM_DADOS); return; }
    onPeriodo(a.inicio);
    setCandles(r.candles);
  }

  return (
    <section aria-labelledby="rv-titulo">
      <h2 id="rv-titulo">{TITULO_RENDA_VARIAVEL}</h2>
      <p>{INTRO_RENDA_VARIAVEL}</p>
      <div ref={container} />
      {verificando && <p role="status">{VERIFICANDO_ACESSO}</p>}
      {falhouSessao && !verificando && (
        <button type="button" onClick={() => void garantirSessao()}>Tentar de novo</button>
      )}
      <form onSubmit={(e) => void consultar(e)}>
        <label for="rv-ticker">Ticker</label>
        <input id="rv-ticker" type="text" maxLength={6} autoCapitalize="characters" value={ticker}
          onInput={(e) => setTicker((e.currentTarget as HTMLInputElement).value.toUpperCase())} />
        <button type="submit" disabled={verificando || consultando}>Consultar</button>
      </form>
      {consultando && <p role="status">{CONSULTANDO}</p>}
      {erro !== null && <p role="alert" class="erro">{erro}</p>}
      {analise && (
        <div class="cartao">
          <p>De {formatarData(analise.inicio)} a {formatarData(analise.fim)} ({analise.pontos} pregões)</p>
          <dl>
            <dt>Rentabilidade no período</dt><dd>{formatarPercentual(analise.rentabilidade)}</dd>
            <dt>Volatilidade anualizada</dt>
            <dd>{analise.volatilidadeAnualizada === null ? 'sem dados suficientes' : formatarPercentual(analise.volatilidadeAnualizada)}</dd>
            <dt>Queda máxima (drawdown)</dt><dd>{formatarPercentual(analise.drawdownMaximo)}</dd>
            {cenarioRealizado && (
              <>
                <dt>CDI no mesmo período</dt><dd>{formatarPercentual(analise.cdi)}</dd>
                <dt>IPCA no mesmo período</dt><dd>{formatarPercentual(analise.ipca)}</dd>
              </>
            )}
          </dl>
          {!cenarioRealizado && <p role="status">{SEM_HISTORICO_CDI_IPCA}</p>}
          {analise.pontos < PREGOES_MINIMOS_HISTORICO && <p class="aviso">{HISTORICO_CURTO}</p>}
        </div>
      )}
      <p class="aviso">{AVISO_TURNSTILE}</p>
      <p class="aviso">{AVISO_EDUCATIVO}</p>
      <p class="aviso">{NAO_INDICA} <LinkLicao licao="renda-variavel" /></p>
    </section>
  );
}
