// Primeiro: liga o jitless do zod antes de qualquer módulo criar esquemas (CSP sem 'unsafe-eval').
import './zod';
import { render } from 'preact';
// Os estilos globais vêm ANTES do App: o CSS de cada tela (importado pelos componentes) fica depois no bundle e vence,
// em mesma especificidade, as regras antigas de estilos.css.
import './ui/estilos.css';
import './ui/base/base.css';
import './ui/moldura.css';
import { App } from './ui/App';

const raiz = document.getElementById('app');
if (!raiz) throw new Error('Elemento #app não encontrado no index.html');
render(<App />, raiz);
