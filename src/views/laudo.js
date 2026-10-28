// Laudo técnico imprimível.
import { categoriasDaVistoria, rotulosChecklist } from '../core/checklist.js';
import { all, get, put } from '../core/db/index.js';
import { $, app, esc } from '../core/dom.js';
import { fotosMap } from '../core/fotos.js';
import { fmt } from '../core/utils.js';

export async function laudo(id) {
  const v = await get('vistorias', id);
  if (!v) { app.innerHTML = '<div class="warn">Laudo não encontrado.</div>'; return; }
  const [obra, fm] = await Promise.all([get('obras', v.obraId), fotosMap(v)]);
  const cli = obra ? await get('clientes', obra.clienteId) : null;
  const emp = (await get('config', 'empresa')) || {};
  const itens = v.itens || [];
  const versoes = (await all('versoes')).filter(x => x.vistoriaId === v.id).sort((a, b) => (a.reabertoEm || '').localeCompare(b.reabertoEm || ''));
  const nc = itens.filter(i => i.status === 'N');
  const anomalias = (await all('anomalias')).filter(a => a.vistoriaId === v.id);
  const docs = (await all('documentos')).filter(d => d.vistoriaId === v.id);
  const rot = rotulosChecklist(v);
  const cats = categoriasDaVistoria(v);
  const seqNum = {};
  const numeroItem = itens.map(it => { seqNum[it.cat] = (seqNum[it.cat] || 0) + 1; return seqNum[it.cat]; });
  const catStats = cats.map(c => { const arr = itens.filter(i => i.cat === c.nome); return { cat: c.nome, descricao: c.descricao || '', c: arr.filter(i => i.status === 'C').length, n: arr.filter(i => i.status === 'N').length, na: arr.filter(i => i.status === 'NA').length, ne: arr.filter(i => !i.status).length }; });
  const totais = { c: itens.filter(i => i.status === 'C').length, n: itens.filter(i => i.status === 'N').length, na: itens.filter(i => i.status === 'NA').length, ne: itens.filter(i => !i.status).length };
  const nomeC = rot.C === 'Aprovado' ? 'aprovado(s)' : 'conforme(s)';
  const nomeN = rot.N === 'Reprovado' ? 'reprovado(s)' : 'não conforme(s)';
  const dadosImovel = [
    ['Contratante / representante', v.contratante],
    ['Proprietário', v.proprietario],
    ['Empreendimento', v.empreendimento],
    ['Procuradora', v.procuradora],
    ['Unidade', v.unidade],
    ['Matrícula', v.matricula],
    ['Área do lote (m²)', v.areaLote],
    ['Área construída (m²)', v.areaConstruida],
    ['Incorporadora / construtora', v.incorporadora],
    ['Responsável da construtora presente', v.responsavelConstrutora],
    ['Tipo de imóvel', v.tipoImovel]
  ].filter(([, val]) => val !== undefined && val !== null && String(val).trim() !== '');
  const objetivo = v.laudoObjetivo || 'Avaliar as condições de uso, manutenção e desempenho dos sistemas construtivos do imóvel, identificar anomalias e falhas e indicar as ações corretivas, com base nas diretrizes da ABNT NBR 16747 (Inspeção predial).';
  const metodologia = v.laudoMetodologia || 'Inspeção visual dos sistemas acessíveis, com aplicação de checklist padronizado por sistema e ambiente, registro fotográfico e classificação das anomalias. Não foram realizados ensaios destrutivos.';
  const recomendacoes = v.laudoRecomendacoes || (nc.length ? 'Corrigir as não conformidades apontadas, observando os prazos indicados e as recomendações técnicas de cada item.' : 'Manter o plano de manutenção preventiva e reavaliar os sistemas periodicamente.');
  const conclusao = v.laudoConclusao || (nc.length ? `Foram identificadas ${nc.length} não conformidade(s) entre os ${itens.length} itens avaliados. Recomenda-se a execução das correções indicadas e nova inspeção após os reparos.` : `Foram avaliados ${itens.length} itens e não foram identificadas não conformidades.`);
  const resumo = `Foram avaliados ${itens.length} item(ns) em ${cats.length} categoria(s): ${totais.c} ${nomeC}, ${totais.n} ${nomeN}, ${totais.na} N/A e ${totais.ne} não avaliado(s). ${nc.length ? `Foram identificadas ${nc.length} não conformidade(s), que requerem correção.` : 'Não foram identificadas não conformidades.'}${anomalias.length ? ` Foram registradas ${anomalias.length} anomalia(s) estruturada(s).` : ''}`;
  const fotoItens = itens.filter(i => (i.fotos || []).length);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(`Laudo ${v.numeroLaudo || v.id} | ${emp.razao || 'VISTORI ENGENHARIA'} | ${v.assinatura ? v.assinatura.hash : 'sem assinatura'}`)}`;
  app.innerHTML = `<div class="noprint row"><button class="btn" onclick="print()">Imprimir / Salvar PDF</button><a class="btn ghost" href="#/vistoria/${v.id}">Voltar à vistoria</a>${v.assinatura ? `<button class="btn ghost" id="verif" data-id="${v.id}">Verificar integridade</button>` : ''}</div>
  ${!v.cienciaCliente ? `<div class="card noprint"><h3>Ciência do cliente</h3><p>Registre a ciência do cliente sobre este laudo.</p><div class="row"><input id="ciencia-nome" placeholder="Nome de quem tomou ciência"><button type="button" class="btn" id="ciencia-btn">Registrar ciência</button></div></div>` : ''}
  <div class="card laudo">
    <img class="laudo-logo" src="${emp.logo || 'logo.png'}" alt="${esc(emp.razao || 'VISTORI ENGENHARIA')}">
    <p class="doc-empresa">${esc(emp.razao || 'VISTORI ENGENHARIA')}${emp.cnpj ? ' · CNPJ ' + esc(emp.cnpj) : ''}${emp.cidade ? ' · ' + esc(emp.cidade) : ''}${emp.uf ? '/' + esc(emp.uf) : ''}</p>
    <h1>Laudo Técnico — ${esc(v.tipo)}</h1>
    <p class="laudo-num">${v.numeroLaudo ? 'Nº ' + esc(v.numeroLaudo) : 'Nº ainda não atribuído'}${v.versao ? ' · Versão ' + esc(v.versao) : ''}</p>
    ${v.status !== 'assinada' ? '<div class="warn">RASCUNHO — não assinado.</div>' : ''}
    <p><b>Cliente:</b> ${esc(cli?.nome)} ${esc(cli?.documento)}<br><b>Imóvel/Obra:</b> ${esc(obra?.nome)} — ${esc(obra?.endereco)} ${esc(obra?.cidade)}${obra?.uf ? '/' + esc(obra.uf) : ''}<br><b>Modelo de checklist:</b> ${esc(v.checklistModeloNome || 'Checklist genérico')}<br>
    <b>Data da vistoria:</b> ${esc(v.data)}${v.hora ? ' às ' + esc(v.hora) : ''}<br><b>Responsável técnico:</b> ${esc(v.vistoriador)} — CREA ${esc(v.crea)}<br><b>ART nº:</b> ${esc(v.artNumero) || 'não informada'}</p>
    ${v.checklistModeloId && dadosImovel.length ? `<h3>Dados do imóvel</h3><table class="laudo-dados">${dadosImovel.map(([l, val]) => `<tr><th>${esc(l)}</th><td>${esc(val)}</td></tr>`).join('')}</table>` : ''}
    ${v.observacoesGerais ? `<p><b>Observações gerais:</b> ${esc(v.observacoesGerais)}</p>` : ''}
    <h2>1. Objetivo</h2><p>${esc(objetivo)}</p>
    <h2>2. Metodologia</h2><p>${esc(metodologia)}</p>
    <h2>3. Resumo executivo</h2><p>${esc(resumo)}</p>
    ${v.orientacoes ? `<p><b>Orientações / observações:</b> ${esc(v.orientacoes)}</p>` : ''}
    <h2>4. Itens avaliados</h2>
    <p class="laudo-resumo"><b>${totais.c}</b> ${nomeC} · <b>${totais.n}</b> ${nomeN} · <b>${totais.na}</b> N/A · <b>${totais.ne}</b> não avaliado(s) — total de ${itens.length} item(ns).</p>
    <table><thead><tr><th>Categoria</th><th>${esc(rot.C)}</th><th>${esc(rot.N)}</th><th>${esc(rot.NA)}</th><th>Não avaliado</th></tr></thead><tbody>
    ${catStats.map(x => `<tr><td>${esc(x.cat)}${x.descricao ? `<br><small>${esc(x.descricao)}</small>` : ''}</td><td>${x.c}</td><td>${x.n}</td><td>${x.na}</td><td>${x.ne}</td></tr>`).join('')}
    <tr><td><b>Total</b></td><td><b>${totais.c}</b></td><td><b>${totais.n}</b></td><td><b>${totais.na}</b></td><td><b>${totais.ne}</b></td></tr>
    </tbody></table>
    <h2>5. Não conformidades</h2>
    ${(nc.length || anomalias.length) ? `${nc.map(it => { const idx = itens.indexOf(it); return `<div class="item reprovado"><h4><span class="item-num">${numeroItem[idx]}.</span> ${esc(it.desc)} <small>(${esc(it.cat)})</small></h4>${it.obs ? `<p>${esc(it.obs)}</p>` : ''}<div class="fotos">${(it.fotos || []).map(f => `<div class="foto"><img src="${f.src || fm[f.id] || ''}" alt=""><small>${esc(f.legenda)}</small></div>`).join('')}</div></div>`; }).join('')}${anomalias.map(a => `<div class="item"><h4>${esc(a.titulo)} <span class="grav grav-${esc((a.gravidade || '').toLowerCase())}">${esc(a.gravidade)}</span></h4>${a.itemDesc ? `<p><b>Item:</b> ${esc(a.itemDesc)} <small>(${esc(a.itemCat || '')})</small></p>` : ''}${a.descricao ? `<p>${esc(a.descricao)}</p>` : ''}<p><b>Local:</b> ${esc(a.ambiente || '—')} · <b>Prazo:</b> ${esc(a.prazo || '—')} · <b>Responsável:</b> ${esc(a.responsavel || '—')}</p>${a.foto ? `<div class="fotos"><div class="foto"><img src="${a.foto}" alt=""><small>${esc(a.titulo)}</small></div></div>` : ''}</div>`).join('')}` : '<p>Nenhuma não conformidade registrada.</p>'}
    <h2>6. Registro fotográfico</h2>
    ${fotoItens.length ? fotoItens.map(it => `<h4>${esc(it.desc)}</h4><div class="fotos">${(it.fotos || []).map(f => `<div class="foto"><img src="${f.src || fm[f.id] || ''}" alt=""><small>${esc(f.legenda)}</small></div>`).join('')}</div>`).join('') : '<p>Sem registro fotográfico.</p>'}
    <h2>7. Recomendações</h2><p>${esc(recomendacoes)}</p>
    <h2>8. Conclusão</h2><p>${esc(conclusao)}</p>
    ${v.cienciaCliente ? `<h3>Ciência do cliente</h3><p>${esc(v.cienciaCliente.nome)} — ${fmt(v.cienciaCliente.em)}</p>` : ''}
    ${v.assinatura ? `<h3>Responsável técnico</h3><img src="${v.assinatura.img}" alt="assinatura" style="max-width:300px;border-bottom:1px solid #000"><br>${esc(v.assinatura.nome)} — ${fmt(v.assinatura.ts)}<br><small>Integridade (SHA-256):</small><div class="hash">${v.assinatura.hash}</div>` : ''}
    ${docs.length ? `<h3>Documentos anexados</h3><ul class="docs">${docs.map(d => `<li><b>${esc(d.tipo)}</b> · ${esc(d.nome)}</li>`).join('')}</ul>` : ''}
    <div class="laudo-qr"><img src="${qrUrl}" alt="QR code de verificação"><small>Verificação: ${esc((v.assinatura?.hash || 'sem assinatura').slice(0, 24))}</small></div>
    ${versoes.length ? `<h3>Histórico de versões</h3><ul class="versoes">${versoes.map(x => `<li>Versão ${x.versao} — reaberta em ${fmt(x.reabertoEm)} — ${esc(x.justificativa)}</li>`).join('')}</ul>` : ''}
  </div>`;
  const cb = $('#ciencia-btn');
  if (cb) cb.onclick = async () => {
    const nome = $('#ciencia-nome').value.trim();
    if (!nome) return alert('Informe o nome de quem tomou ciência.');
    await put('vistorias', { ...v, cienciaCliente: { nome, em: new Date().toISOString() } });
    laudo(v.id);
  };
}
