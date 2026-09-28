// Primeiro: liga o jitless do zod antes de qualquer módulo criar esquemas (CSP sem 'unsafe-eval').
import './zod';
import { render } from 'preact';
import { App } from './ui/App';
import './ui/estilos.css';

const raiz = document.getElementById('app');
if (!raiz) throw new Error('Elemento #app não encontrado no index.html');
render(<App />, raiz);
