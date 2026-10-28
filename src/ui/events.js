// Eventos delegados (clique/change) de todas as telas.
import { auditar } from '../core/auditoria.js';
import { all, del, get, put } from '../core/db/index.js';
import { $, abrirMarcador, app } from '../core/dom.js';
import { fotosSha } from '../core/fotos.js';
import { calcHash, proximoNumeroLaudo } from '../core/laudo.js';
import { excluirLixeira } from '../core/lixeira.js';
import { migrarLocal } from '../core/migracao.js';
import { refresh } from '../core/navigate.js';
import { F, USER, auth, curV, pad } from '../core/state.js';
import { brl, comprimir, labelReg, uid } from '../core/utils.js';
import { novaVistoriaDaAgenda } from '../views/agenda.js';
import { vistoria } from '../views/vistoria.js';

app.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.p !== undefined) {
    const [tipoId, tipoObra] = t.dataset.p.split('|');
    if (t.value === '') await del('precos', t.dataset.p);
    else {
      const valor = parseFloat(t.value);
      if (isNaN(valor) || valor < 0) { alert('Informe um valor válido.'); return; }
      await put('precos', { id: t.dataset.p, tipoId, tipoObra, valor });
    }
    return;
  }
  if (t.dataset.anomStatus) { const a = await get('anomalias', t.dataset.anomStatus); if (a) { await put('anomalias', { ...a, status: t.value }); await auditar('Alterou status de anomalia', 'anomalias', a.id, `${a.titulo} → ${t.value}`); refresh(); } return; }
  if (!curV) return;
  if (t.dataset.h) { curV[t.dataset.h] = t.value; await put('vistorias', curV); }
  else if (t.dataset.f) {
    const it = curV.itens[+t.dataset.i];
    if (t.dataset.f === 'legenda') it.fotos[+t.dataset.j].legenda = t.value; else it[t.dataset.f] = t.value;
    if (t.dataset.f === 'status') t.closest('.item')?.classList.toggle('reprovado', t.value === 'N');
    await put('vistorias', curV);
  } else if (t.dataset.photo !== undefined) {
    const it = curV.itens[+t.dataset.photo];
    for (const f of t.files) {
      const id = uid();
      await put('fotos', { id, vistoriaId: curV.id, src: await comprimir(f) });
      it.fotos.push({ id, legenda: '' });
    }
    await put('vistorias', curV);
    const y = scrollY; await vistoria(curV.id); scrollTo(0, y);
  }
});

document.addEventListener('click', async e => {
  const a = e.target.closest('a,button'); if (!a) return;
  const d = a.dataset;
  if (d.del) {
    e.preventDefault();
    const [s, id] = d.del.split(':');
    if (s === 'clientes' && (await all('obras')).some(o => o.clienteId === id)) return alert('Este cliente tem imóveis/obras vinculados.');
    if (s === 'obras' && (await all('vistorias')).some(v => v.obraId === id)) return alert('Este imóvel/obra tem vistorias vinculadas.');
    if (s === 'acessos' && id === (USER?.email || '').toLowerCase()) return alert('Você não pode remover o seu próprio acesso.');
    if (s === 'tipos') {
      const t = await get('tipos', id);
      if ((await all('vistorias')).some(v => v.tipo === t?.nome)) return alert('Este tipo de serviço já foi usado em vistorias.');
    }
    if (s === 'vistorias') {
      const v = await get('vistorias', id);
      if (v?.status === 'assinada') return alert('Laudos assinados não podem ser excluídos. Reabra o laudo antes de excluir.');
    }
    if (confirm('Mover para a lixeira? Você poderá restaurar depois.')) {
      const rec = await get(s, id);
      if (!rec) return;
      const extras = {};
      if (s === 'vistorias') extras.fotos = (rec.itens || []).flatMap(it => (it.fotos || []).filter(f => f.id).map(f => f.id));
      if (s === 'tipos') extras.precos = (await all('precos')).filter(p => p.tipoId === id).map(p => p.id);
      await put('lixeira', { id: uid(), store: s, refId: id, data: rec, extras, deletedAt: new Date().toISOString(), por: USER?.email || 'local' });
      await del(s, id);
      await auditar('Enviou para a lixeira', s, id, labelReg(rec));
      refresh();
    }
  } else if (d.rm) {
    e.preventDefault();
    const [i, j] = d.rm.split(':').map(Number);
    const f = curV.itens[i].fotos[j];
    if (f.id) await del('fotos', f.id);
    curV.itens[i].fotos.splice(j, 1); await put('vistorias', curV);
    const y = scrollY; await vistoria(curV.id); scrollTo(0, y);
  } else if (d.marcar) {
    e.preventDefault();
    const [i, j] = d.marcar.split(':').map(Number);
    const f = curV.itens[i]?.fotos[j];
    if (!f) return;
    const src = f.src || (f.id ? (await get('fotos', f.id))?.src : '');
    if (!src) return alert('Imagem não encontrada.');
    abrirMarcador(src, async dataUrl => {
      if (f.id) { const foto = await get('fotos', f.id); if (foto) await put('fotos', { ...foto, src: dataUrl }); }
      else { f.src = dataUrl; }
      await put('vistorias', curV);
      const y = scrollY; await vistoria(curV.id); scrollTo(0, y);
    });
  } else if (d.anomItem !== undefined) {
    e.preventDefault();
    const sel = document.querySelector('#anom-form [name=item]');
    if (!sel) return;
    sel.value = d.anomItem;
    document.querySelector('#anom-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.querySelector('#anom-form [name=titulo]')?.focus({ preventScroll: true });
  } else if (d.agendaIniciar) {
    e.preventDefault();
    const agendamento = await get('agendamentos', d.agendaIniciar);
    if (!agendamento) return alert('Agendamento não encontrado.');
    if (agendamento.vistoriaId) { location.hash = `#/vistoria/${agendamento.vistoriaId}`; return; }
    try {
      const v = await novaVistoriaDaAgenda(agendamento);
      location.hash = `#/vistoria/${v.id}`;
    } catch (err) { alert(err.message); }
  } else if (d.orcStatus) {
    e.preventDefault();
    const o = await get('orcamentos', d.orcStatusId);
    if (!o) return;
    await put('orcamentos', { ...o, status: d.orcStatus, atualizado: new Date().toISOString() });
    await auditar('Alterou status do orçamento', 'orcamentos', o.id, `${labelReg(o)} → ${d.orcStatus}`);
    refresh();
  } else if (d.receber) {
    e.preventDefault();
    const r = await get('recebimentos', d.receber);
    if (r) { await put('recebimentos', { ...r, status: 'Recebido', pagoEm: new Date().toISOString() }); await auditar('Marcou como recebido', 'recebimentos', r.id, `${labelReg(r)} — ${brl(r.valor)}`); refresh(); }
  } else if (d.reabrir) {
    e.preventDefault();
    const r = await get('recebimentos', d.reabrir);
    if (r) { await put('recebimentos', { ...r, status: 'Pendente', pagoEm: '' }); await auditar('Reabriu recebimento', 'recebimentos', r.id, labelReg(r)); refresh(); }
  } else if (d.restaurar) {
    e.preventDefault();
    const it = await get('lixeira', d.restaurar);
    if (it) { await put(it.store, it.data); await del('lixeira', it.id); await auditar('Restaurou', it.store, it.refId, labelReg(it.data)); refresh(); }
  } else if (d.lxDel) {
    e.preventDefault();
    if (!confirm('Excluir definitivamente? Não pode ser desfeito.')) return;
    await excluirLixeira(d.lxDel);
    refresh();
  } else if (d.download) {
    e.preventDefault();
    const arq = await get('documentos', d.download);
    if (!arq) return;
    const link = document.createElement('a'); link.href = arq.src; link.download = arq.nome || 'documento';
    document.body.appendChild(link); link.click(); link.remove();
  } else if (d.reopen) {
    e.preventDefault();
    const just = prompt('Justificativa para reabrir o laudo (mínimo 10 caracteres):');
    if (just === null) return;
    if (just.trim().length < 10) return alert('Justificativa muito curta (mín. 10 caracteres).');
    if (curV.assinatura) await put('versoes', { id: uid(), vistoriaId: curV.id, numeroLaudo: curV.numeroLaudo || '', versao: curV.versao || 1, assinatura: curV.assinatura, reabertoEm: new Date().toISOString(), justificativa: just.trim(), criado: new Date().toISOString() });
    delete curV.assinatura;
    curV.status = 'rascunho';
    curV.versao = (curV.versao || 1) + 1;
    await put('vistorias', curV);
    await auditar('Reabriu laudo', 'vistorias', curV.id, `v${curV.versao}: ${just.trim()}`);
    vistoria(curV.id);
  } else if (a.id === 'clr') { pad.clear(); }
  else if (a.id === 'sair') { e.preventDefault(); await F.signOut(auth); }
  else if (a.id === 'migrar') {
    if (!navigator.onLine) return alert('Conecte-se à internet para enviar os dados.');
    if (!confirm('Enviar os dados deste aparelho para a nuvem agora?')) return;
    a.disabled = true;
    try { const n = await migrarLocal(k => { a.textContent = `Enviando… ${k}`; }); alert(`${n} registro(s) enviados para a nuvem.`); }
    catch (err) { alert('Falha ao enviar: ' + err.message + '\nPode tentar de novo; nada foi apagado.'); }
    refresh();
  } else if (a.id === 'verif') {
    const v = await get('vistorias', d.id);
    if (!v.assinatura.fotosSha) return alert('Assinatura feita antes da v0.3.0: a verificação automática não está disponível para este laudo.');
    // O segundo cálculo é o formato antigo (incluía número/versão/ciência), para
    // que laudos assinados antes da correção continuem verificáveis.
    const sig = v.assinatura;
    const ok = (await calcHash(v, sig.ts)) === sig.hash
      || (await calcHash(v, sig.ts, { metadados: true })) === sig.hash;
    alert(ok ? 'ÍNTEGRO: o conteúdo (textos e fotos) é idêntico ao que foi assinado.' : 'ALTERADO: o conteúdo atual é diferente do que foi assinado.');
  } else if (a.id === 'sign') {
    const nome = $('#signNome').value.trim() || (curV.vistoriador || '').trim();
    if (!nome || pad.isEmpty()) return alert('Informe o nome e assine no quadro.');
    const pend = curV.itens.filter(i => !i.status).length;
    if (pend && !confirm(`${pend} item(ns) sem avaliação. Assinar assim mesmo?`)) return;
    if (!curV.artNumero && !confirm('Nº da ART não informado. Assinar assim mesmo?')) return;
    const ts = new Date().toISOString();
    const hash = await calcHash(curV, ts);
    curV.assinatura = { nome, img: $('#sig').toDataURL('image/png'), ts, hash, fotosSha: await fotosSha(curV) };
    if (!curV.numeroLaudo) curV.numeroLaudo = await proximoNumeroLaudo();
    curV.versao = curV.versao || 1;
    curV.status = 'assinada';
    await put('vistorias', curV);
    await auditar('Assinou laudo', 'vistorias', curV.id, curV.numeroLaudo || '');
    location.hash = `#/laudo/${curV.id}`;
  }
});
