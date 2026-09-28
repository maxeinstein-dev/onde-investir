// Ponto único de import do zod no app. O zod 4 testa `new Function("")` ao criar esquemas de objeto (para o
// JIT); com a CSP sem 'unsafe-eval', o navegador registra a violação mesmo com o erro engolido. Com
// `jitless`, `util.allowsEval` devolve false sem o teste e os esquemas não compilam código.
// A config precisa valer antes de qualquer esquema ser criado: todo módulo importa `z` daqui.
import { z } from 'zod';

z.config({ jitless: true });

export { z };
