import { useEffect, useRef, useState } from 'preact/hooks';
import { armazenamentoLocal } from '../armazenamento/navegador';
import { carregarHistorico, type HistoricoCarregado } from '../dados/historico';
import type { DataISO } from '../engine/datas';

export type EstadoHistorico =
  | { fase: 'inativo' }
  | { fase: 'carregando' }
  | { fase: 'pronto'; carregado: HistoricoCarregado };

export type CarregarHistorico = (desde: DataISO) => Promise<HistoricoCarregado>;

const carregarDoNavegador: CarregarHistorico = (desde) => carregarHistorico({
  // Busca `fetch` na hora da chamada: os testes trocam por um falso com vi.stubGlobal.
  buscar: (url, init) => fetch(url, init),
  armazenamento: armazenamentoLocal(),
  agoraMs: Date.now(),
  desde,
});

/** `carregarHistorico` nunca lança; se lançar mesmo assim, a carga conta como falha total. */
const falhou = (desde: DataISO): HistoricoCarregado => ({
  series: null, status: 'FALHOU', faltando: [], limitado: false, inicio: `${desde.slice(0, 4)}-01-01`,
});

/**
 * O histórico do Banco Central desde `desde` (a aplicação mais antiga), carregado uma vez quando há posições
 * (`desde` deixa de ser null). O histórico vem por ano civil: só carrega de novo se `desde` passar para um ano
 * anterior ao já pedido (uma posição mais antiga), e o cache por série e ano evita repetir o que já veio.
 */
export function useHistorico(desde: DataISO | null, carregar: CarregarHistorico = carregarDoNavegador): EstadoHistorico {
  const [estado, setEstado] = useState<EstadoHistorico>({ fase: 'inativo' });
  /** O ano do último pedido: o histórico carregado cobre desse ano até hoje. */
  const anoPedido = useRef<number | null>(null);
  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; }, []);

  useEffect(() => {
    if (desde === null) return;
    const ano = Number(desde.slice(0, 4));
    if (!Number.isFinite(ano) || (anoPedido.current !== null && ano >= anoPedido.current)) return;
    anoPedido.current = ano;
    setEstado({ fase: 'carregando' });
    carregar(desde)
      .catch(() => falhou(desde))
      .then((carregado) => {
        // Um pedido mais antigo que chegou depois substitui este: só vale a resposta do último pedido.
        if (montado.current && anoPedido.current === ano) setEstado({ fase: 'pronto', carregado });
      });
  }, [desde]);

  return estado;
}
