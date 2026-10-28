// Tipos de serviço (semeia os padrões na primeira execução).
import { TIPOS_DEFAULT } from './config.js';
import { all, get, put } from './db/index.js';

export const getTipos = async () => {
  if (!(await get('config', 'seedTipos'))) {
    for (const n of TIPOS_DEFAULT) {
      const slug = n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
      await put('tipos', { id: 'tp-' + slug, nome: n, descricao: '', criado: new Date().toISOString() });
    }
    await put('config', { id: 'seedTipos', ok: true });
  }
  return (await all('tipos')).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
};
