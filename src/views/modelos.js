// Administração dos modelos de checklist (listar, criar, editar, duplicar,
// ativar/desativar, restaurar o padrão e excluir quando não houver vínculo).
import { auditar } from '../core/auditoria.js';
import { MODELO_RECEBIMENTO_ID, getModelo, getModelos, parseModeloTexto, podeAdministrarModelos, restaurarModeloPadrao, toTextModelo } from '../core/checklist.js';
import { all, del, put } from '../core/db/index.js';
import { $, app, esc, fieldHtml } from '../core/dom.js';
import { refresh } from '../core/navigate.js';
import { fmt, uid } from '../core/utils.js';

const contar = m => Array.isArray(m.itens) ? m.itens.length : (m.categorias || []).reduce((n, c) => n + (c.itens || []).length, 0);

export async function modelos(q) {
  const [lista, vs, ags, admin] = await Promise.all([getModelos(), all('vistorias'), all('agendamentos'), podeAdministrarModelos()]);
  const qp = new URLSearchParams(q || '');
  const emEdicao = lista.find(m => m.id === qp.get('e'));
  const novo = qp.has('novo');
  const visiveis = admin ? lista : lista.filter(m => m.ativo);
  const temPadrao = lista.some(m => m.id === MODELO_RECEBIMENTO_ID);
  const emUso = id => vs.filter(v => v.checklistModeloId === id).length;
  const emAgenda = id => ags.filter(a => a.modeloId === id).length;
  const acoesAdmin = admin
    ? `<a class="btn" href="#/modelos?novo=1">+ Novo modelo</a><button type="button" class="btn ghost" id="modelo-restaurar">${temPadrao ? 'Restaurar modelo padrão' : 'Criar modelo padrão'}</button>`
    : '';
  const acoesModelo = m => admin
    ? `<a href="#/modelos?e=${encodeURIComponent(m.id)}">Editar</a><a href="#" data-modelo-dup="${esc(m.id)}">Duplicar</a><a href="#" data-modelo-toggle="${esc(m.id)}">${m.ativo ? 'Desativar' : 'Ativar'}</a>${m.padrao ? `<a href="#" data-modelo-restaurar="${esc(m.id)}">Restaurar</a>` : ''}<a href="#" data-modelo-del="${esc(m.id)}">Excluir</a>`
    : '<span class="status-badge draft">Somente leitura</span>';

  app.innerHTML = `<section class="section-heading client-head"><div><h2>Modelos de checklist</h2><p>Modelos reutilizáveis por tipo de vistoria. O modelo escolhido é copiado para a vistoria: editar o modelo depois não altera laudos já criados.${admin ? '' : ' Somente administradores podem alterar modelos.'}</p></div>
    <div class="dashboard-actions">${acoesAdmin}<a class="btn ghost" href="#/checklist">Checklist genérico</a></div></section>
  ${admin ? '' : '<div class="warn"><b>Modo leitura:</b> somente administradores podem criar, editar, duplicar, ativar/desativar, restaurar ou excluir modelos.</div>'}
  ${admin && (novo || emEdicao) ? `<form id="modelo-form" class="card grid">
    <h3 style="grid-column:1/-1">${emEdicao ? 'Editar modelo' : 'Novo modelo'}</h3>
    ${fieldHtml({ k: 'nome', l: 'Nome do modelo', req: 1 }, emEdicao?.nome || '')}
    ${fieldHtml({ k: 'descricao', l: 'Descrição', type: 'textarea' }, emEdicao?.descricao || '')}
    <div><label>Disponibilidade</label><label class="check-label"><input type="checkbox" name="ativo" ${!emEdicao || emEdicao.ativo ? 'checked' : ''}> Ativo para novas vistorias</label></div>
    <div style="grid-column:1/-1"><label>Categorias e itens</label>
      <textarea id="modelo-categorias" name="categorias" style="min-height:420px" placeholder="## Categoria&#10;:: Descrição opcional da categoria&#10;Item a verificar&#10;Outro item">${esc(emEdicao ? toTextModelo(emEdicao) : '')}</textarea>
      <small>Use <code>## Categoria</code> para abrir uma categoria, <code>:: texto</code> para a descrição (opcional) e um item por linha. Categorias sem itens são descartadas.</small>
    </div>
    <div class="row" style="grid-column:1/-1"><button class="btn">${emEdicao ? 'Salvar alterações' : 'Criar modelo'}</button><a class="btn ghost" href="#/modelos">Cancelar</a></div>
  </form>` : ''}
  <div class="card" id="modelos-lista">
    <table><thead><tr><th>Modelo</th><th>Categorias / itens</th><th>Vistorias</th><th>Status</th><th></th></tr></thead><tbody>
    ${visiveis.length ? visiveis.map(m => `<tr>
      <td><b>${esc(m.nome)}</b>${m.padrao ? ' <span class="status-badge signed">Padrão</span>' : ''}<br><small>${esc(m.descricao || '')}</small>${m.atualizado ? `<br><small>Atualizado em ${fmt(m.atualizado)}</small>` : ''}</td>
      <td>${(m.categorias || []).length} categoria(s)<br><small>${contar(m)} item(ns)</small></td>
      <td>${emUso(m.id)}${emAgenda(m.id) ? `<br><small>${emAgenda(m.id)} na agenda</small>` : ''}</td>
      <td><span class="status-badge ${m.ativo ? 'signed' : 'draft'}">${m.ativo ? 'Ativo' : 'Inativo'}</span></td>
      <td class="act">${acoesModelo(m)}</td></tr>`).join('') : `<tr><td colspan="5">${admin ? 'Nenhum modelo cadastrado. Use “Criar modelo padrão” ou “+ Novo modelo”.' : 'Nenhum modelo ativo disponível.'}</td></tr>`}
    </tbody></table>
  </div>`;

  const form = $('#modelo-form');
  if (form && admin) form.onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    const nome = String(d.nome || '').trim();
    if (!nome) return alert('Informe o nome do modelo.');
    const cats = parseModeloTexto(d.categorias);
    if (!cats.length) return alert('Informe ao menos uma categoria com um item.');
    if (lista.some(m => m.id !== emEdicao?.id && String(m.nome).toLowerCase() === nome.toLowerCase())) return alert('Já existe um modelo com este nome.');
    const agora = new Date().toISOString();
    const modelo = {
      id: emEdicao?.id || uid(), nome, descricao: String(d.descricao || '').trim(),
      categorias: cats.map(({ nome: cn, descricao }) => ({ nome: cn, descricao })),
      itens: cats.flatMap(c => c.itens.map(desc => ({ cat: c.nome, desc }))),
      ativo: !!d.ativo, padrao: !!emEdicao?.padrao,
      criado: emEdicao?.criado || agora, atualizado: agora
    };
    await put('checklistModelos', modelo);
    await auditar(emEdicao ? 'Alterou modelo de checklist' : 'Criou modelo de checklist', 'checklistModelos', modelo.id, modelo.nome);
    location.hash = '#/modelos'; refresh();
  };

  if (admin) {
    const restaurar = async () => {
      const criar = !temPadrao;
      const msg = criar
        ? 'Criar o modelo padrão “Recebimento de imóvel — casa nova”? Vistorias já criadas não são alteradas.'
        : 'Restaurar o conteúdo original do modelo “Recebimento de imóvel — casa nova”? As edições feitas nele serão substituídas; vistorias já criadas não são alteradas.';
      if (!confirm(msg)) return;
      const m = await restaurarModeloPadrao();
      await auditar(criar ? 'Criou modelo padrão' : 'Restaurou modelo padrão', 'checklistModelos', m.id, m.nome);
      refresh();
    };
    const btnRestaurar = $('#modelo-restaurar');
    if (btnRestaurar) btnRestaurar.onclick = restaurar;

    const listaEl = $('#modelos-lista');
    if (listaEl) listaEl.addEventListener('click', async e => {
      const a = e.target.closest('[data-modelo-dup],[data-modelo-toggle],[data-modelo-restaurar],[data-modelo-del]');
      if (!a) return;
      e.preventDefault();
      const d = a.dataset;
      if (d.modeloDup) {
        const m = await getModelo(d.modeloDup);
        if (!m) return;
        const agora = new Date().toISOString();
        let nome = `${m.nome} (cópia)`, n = 2;
        while (lista.some(x => String(x.nome).toLowerCase() === nome.toLowerCase())) nome = `${m.nome} (cópia ${n++})`;
        const copia = { ...JSON.parse(JSON.stringify(m)), id: uid(), nome, padrao: false, ativo: false, criado: agora, atualizado: agora };
        await put('checklistModelos', copia);
        await auditar('Duplicou modelo de checklist', 'checklistModelos', copia.id, copia.nome);
        refresh();
      } else if (d.modeloToggle) {
        const m = await getModelo(d.modeloToggle);
        if (!m) return;
        await put('checklistModelos', { ...m, ativo: !m.ativo, atualizado: new Date().toISOString() });
        await auditar(m.ativo ? 'Desativou modelo de checklist' : 'Ativou modelo de checklist', 'checklistModelos', m.id, m.nome);
        refresh();
      } else if (d.modeloRestaurar) {
        await restaurar();
      } else if (d.modeloDel) {
        const m = await getModelo(d.modeloDel);
        if (!m) return;
        const usos = emUso(m.id);
        const naAgenda = emAgenda(m.id);
        if (usos || naAgenda) return alert(`Este modelo está vinculado a ${usos} vistoria(s)${naAgenda ? ` e ${naAgenda} agendamento(s)` : ''} e não pode ser excluído. Desative-o para impedir novas vistorias.`);
        if (!confirm(`Excluir o modelo “${m.nome}”?`)) return;
        await del('checklistModelos', m.id);
        await auditar('Excluiu modelo de checklist', 'checklistModelos', m.id, m.nome);
        refresh();
      }
    });
  }
}
