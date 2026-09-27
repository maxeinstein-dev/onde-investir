// Arredondamento só na exibição: o engine trabalha com precisão total.
import { dataBR, type DataISO } from './engine/datas';

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const PERCENTUAL = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const formatarMoeda = (valor: number): string => MOEDA.format(valor);
export const formatarPercentual = (fracao: number): string => PERCENTUAL.format(fracao);

export const formatarData = (data: DataISO): string => dataBR(data);
