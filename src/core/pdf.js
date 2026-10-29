// Geração do PDF técnico do laudo usando jsPDF vendorizado.
// Recebe os mesmos dados já calculados pela tela do laudo; não altera a vistoria
// nem a assinatura. O PDF gerado é um artefato pós-assinatura.
import { categoriasDaVistoria, rotulosChecklist } from './checklist.js';
import { fotosMap } from './fotos.js';
import { brl, dataBR, fmt } from './utils.js';

const M = 15;
const PAGE_W = 210;
const W = PAGE_W - M * 2;
const BOTTOM = 282;
const COR = { dark: [28, 85, 88], text: [30, 40, 41], muted: [105, 115, 115], line: [205, 215, 215], bad: [180, 35, 24], ok: [45, 122, 75], light: [235, 242, 242] };

const limparNome = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 70);

/** Nome de arquivo seguro: Vistoria_<numeroLaudo>_<cliente>.pdf */
export function nomeArquivoLaudo(v, cliente) {
  const numero = limparNome(v?.numeroLaudo || 'sem-numero') || 'sem-numero';
  const nome = limparNome(cliente?.nome || 'cliente') || 'cliente';
  return `Vistoria_${numero}_${nome}.pdf`;
}

const blobDataUrl = blob => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});

async function carregarImagem(src, max = 800, formato = 'image/jpeg') {
  if (!src) return null;
  try {
    let dados = String(src);
    if (!dados.startsWith('data:')) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      try {
        const r = await fetch(dados, { mode: 'cors', signal: ctrl.signal });
        if (!r.ok) return null;
        dados = await blobDataUrl(await r.blob());
      } finally {
        clearTimeout(timer);
      }
    }
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dados;
    });
    const largura = img.naturalWidth || img.width;
    const altura = img.naturalHeight || img.height;
    if (!largura || !altura) return null;
    const escala = Math.min(1, max / Math.max(largura, altura));
    const w = Math.max(1, Math.round(largura * escala));
    const h = Math.max(1, Math.round(altura * escala));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d');
    if (formato === 'image/jpeg') { cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); }
    cx.drawImage(img, 0, 0, w, h);
    return { src: cv.toDataURL(formato, formato === 'image/jpeg' ? 0.68 : undefined), w, h, tipo: formato === 'image/png' ? 'PNG' : 'JPEG' };
  } catch (e) {
    return null;
  }
}

export async function gerarPdfLaudo(ctx) {
  const { v, obra, cliente, empresa = {}, anomalias = [], documentos = [], qrUrl = '' } = ctx || {};
  if (!v) throw new Error('Vistoria não informada para o PDF.');
  const JsPDF = globalThis.jspdf?.jsPDF;
  if (!JsPDF) throw new Error('Biblioteca de PDF não carregada. Verifique a conexão e recarregue o app.');
  const doc = new JsPDF({ unit: 'mm', format: 'a4', compress: true });
  const nome = nomeArquivoLaudo(v, cliente);
  doc.setProperties({ title: nome.replace(/\.pdf$/i, ''), subject: 'Laudo técnico de vistoria', author: empresa.razao || 'VISTORI ENGENHARIA', creator: 'VISTORI-ENGENHARIA' });
  let y = M;

  const novaPagina = () => { doc.addPage(); y = M; };
  const quebra = h => { if (y + h > BOTTOM) novaPagina(); };
  const texto = (t, opts = {}) => {
    const { size = 9.5, style = 'normal', font = 'helvetica', color = COR.text, gap = 1.4, x = M, width = W, align = 'left' } = opts;
    if (t === undefined || t === null || t === '') return;
    doc.setFont(font, style); doc.setFontSize(size); doc.setTextColor(...color);
    const linhas = doc.splitTextToSize(String(t), width);
    const lh = size * 0.43;
    const tx = align === 'center' ? x + width / 2 : x;
    for (const linha of linhas) {
      if (y + lh > BOTTOM) novaPagina();
      doc.text(linha, tx, y, { align });
      y += lh;
    }
    y += gap;
  };
  const titulo = t => {
    if (y + 10 > BOTTOM) novaPagina();
    y += 1;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...COR.dark);
    doc.text(t, M, y); y += 4;
    doc.setDrawColor(...COR.line); doc.line(M, y, PAGE_W - M, y); y += 4;
  };
  const subtitulo = t => {
    if (y + 8 > BOTTOM) novaPagina();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...COR.dark);
    doc.text(String(t), M, y); y += 4.2;
  };
  const tabela = (headers, rows, widths, opts = {}) => {
    const fs = opts.size || 7.6;
    const lh = fs * 0.43;
    const pad = 1.2;
    const cabecalho = () => {
      doc.setFillColor(...COR.light); doc.rect(M, y, W, lh + pad * 2, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(fs); doc.setTextColor(...COR.dark);
      let x = M;
      headers.forEach((h, i) => { doc.text(String(h || ''), x + pad, y + lh + pad * 0.2, { maxWidth: widths[i] - pad * 2 }); x += widths[i]; });
      y += lh + pad * 2;
    };
    if (y + lh + pad * 2 > BOTTOM) novaPagina();
    cabecalho();
    for (const row of rows) {
      const celulas = row.map((c, i) => doc.splitTextToSize(String(c ?? ''), widths[i] - pad * 2));
      const altura = Math.max(...celulas.map(c => c.length), 1) * lh + pad * 2;
      if (y + altura > BOTTOM) { novaPagina(); cabecalho(); }
      doc.setDrawColor(...COR.line); doc.line(M, y, PAGE_W - M, y);
      let x = M;
      celulas.forEach((linhas, i) => {
        doc.setFont('helvetica', i === 0 ? 'bold' : 'normal'); doc.setFontSize(fs); doc.setTextColor(...COR.text);
        linhas.forEach((linha, k) => doc.text(linha, x + pad, y + lh + k * lh));
        x += widths[i];
      });
      y += altura;
    }
  };
  const desenharImagem = async (img, maxW = 70, legenda = '') => {
    if (!img) return;
    let w = Math.min(maxW, W);
    let h = w * img.h / img.w;
    if (h > 95) { h = 95; w = h * img.w / img.h; }
    quebra(h + (legenda ? 7 : 3));
    doc.addImage(img.src, img.tipo, M + (W - w) / 2, y, w, h);
    y += h + 2;
    if (legenda) texto(legenda, { size: 7.5, color: COR.muted, gap: 2, align: 'center' });
  };

  const itens = v.itens || [];
  const categorias = ctx.categorias || categoriasDaVistoria(v);
  const rot = ctx.rotulos || rotulosChecklist(v);
  const seq = {};
  const numeros = ctx.numeroItem || itens.map(it => { seq[it.cat] = (seq[it.cat] || 0) + 1; return seq[it.cat]; });
  const catStats = ctx.catStats || categorias.map(c => {
    const arr = itens.filter(i => i.cat === c.nome);
    return { cat: c.nome, c: arr.filter(i => i.status === 'C').length, n: arr.filter(i => i.status === 'N').length, na: arr.filter(i => i.status === 'NA').length, ne: arr.filter(i => !i.status).length };
  });
  const totais = ctx.totais || { c: itens.filter(i => i.status === 'C').length, n: itens.filter(i => i.status === 'N').length, na: itens.filter(i => i.status === 'NA').length, ne: itens.filter(i => !i.status).length };
  const dados = ctx.dadosImovel || [];
  const fotos = ctx.fotos || await fotosMap(v);
  const minhasAnomalias = [...anomalias].filter(a => a.vistoriaId === v.id).sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
  const meusDocumentos = [...documentos].filter(d => d.vistoriaId === v.id && d.pdfAssinatura !== true).sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
  const objetivo = ctx.objetivo || v.laudoObjetivo || 'Avaliar as condições do imóvel e registrar as não conformidades identificadas.';
  const metodologia = ctx.metodologia || v.laudoMetodologia || 'Inspeção visual dos sistemas acessíveis, com checklist, registro fotográfico e classificação das anomalias.';
  const recomendacoes = ctx.recomendacoes || v.laudoRecomendacoes || (totais.n ? 'Corrigir as não conformidades apontadas e reavaliar após os reparos.' : 'Manter a manutenção preventiva do imóvel.');
  const conclusao = ctx.conclusao || v.laudoConclusao || (totais.n ? `Foram identificadas ${totais.n} não conformidade(s) entre ${itens.length} item(ns) avaliados.` : `Foram avaliados ${itens.length} item(ns) sem não conformidades.`);
  const resumo = ctx.resumo || `Foram avaliados ${itens.length} item(ns) em ${categorias.length} categoria(s): ${totais.c} ${rot.C}, ${totais.n} ${rot.N}, ${totais.na} N/A e ${totais.ne} não avaliado(s).`;
  const [logo, assinatura, qr] = await Promise.all([
    carregarImagem(empresa.logo || 'logo.png', 400, 'image/png'),
    carregarImagem(v.assinatura?.img || '', 800, 'image/png'),
    carregarImagem(qrUrl, 300, 'image/png')
  ]);

  // Cabeçalho.
  if (logo) {
    const lw = Math.min(24, 18 * logo.w / logo.h);
    const lh = lw * logo.h / logo.w;
    doc.addImage(logo.src, logo.tipo, M, y, lw, lh);
    y += Math.max(lh, 16) + 3;
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...COR.dark);
  doc.text(String(empresa.razao || 'VISTORI ENGENHARIA'), M, y); y += 5;
  const endEmpresa = [empresa.cnpj ? `CNPJ ${empresa.cnpj}` : '', [empresa.endereco, empresa.cidade, empresa.uf].filter(Boolean).join(' — '), [empresa.telefone, empresa.email, empresa.site].filter(Boolean).join(' · ')].filter(Boolean).join(' · ');
  if (endEmpresa) texto(endEmpresa, { size: 7.8, color: COR.muted, gap: 2 });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...COR.dark);
  doc.text('LAUDO TÉCNICO', PAGE_W / 2, y + 4, { align: 'center' }); y += 10;
  texto(`Nº ${v.numeroLaudo || 'não atribuído'} · Versão ${v.versao || 1} · ${v.status === 'assinada' ? 'Assinado' : 'Rascunho'}`, { size: 9.5, style: 'bold', align: 'center', color: COR.dark, gap: 2 });
  texto(`Cliente: ${cliente?.nome || '—'}${cliente?.documento ? ' · ' + cliente.documento : ''}`, { size: 8.8 });
  texto(`Imóvel/Obra: ${obra?.nome || '—'}${obra?.endereco ? ' — ' + obra.endereco : ''}${obra?.cidade ? ' — ' + obra.cidade : ''}${obra?.uf ? '/' + obra.uf : ''}`, { size: 8.8 });
  texto(`Data da vistoria: ${dataBR(v.data)}${v.hora ? ' às ' + v.hora : ''} · Valor: ${brl(v.valor)}`, { size: 8.5 });
  texto(`Responsável técnico: ${v.vistoriador || '—'} · CREA: ${v.crea || '—'} · ART: ${v.artNumero || 'não informada'}`, { size: 8.5 });
  texto(`Modelo de checklist: ${v.checklistModeloNome || 'Checklist genérico'}`, { size: 8.5, gap: 2.5 });

  if (dados.length) {
    titulo('Dados do imóvel e da vistoria');
    tabela(['Campo', 'Informação'], dados, [55, W - 55]);
    y += 2;
  }
  if (v.observacoesGerais) {
    titulo('Observações gerais');
    texto(v.observacoesGerais);
  }
  titulo('Objetivo');
  texto(objetivo);
  titulo('Metodologia');
  texto(metodologia);
  titulo('Resumo executivo');
  texto(resumo);

  titulo('Resumo por categoria');
  tabela(['Categoria', rot.C, rot.N, 'N/A', 'Não avaliado'], catStats.map(c => [c.cat, String(c.c), String(c.n), String(c.na), String(c.ne)]), [72, 24, 24, 20, 40]);
  y += 2;
  texto(`Totais: ${totais.c} ${rot.C} · ${totais.n} ${rot.N} · ${totais.na} N/A · ${totais.ne} não avaliado(s) em ${itens.length} item(ns).`, { size: 8.5, style: 'bold', gap: 2 });

  const naoConformes = itens.map((it, i) => ({ it, i })).filter(x => x.it.status === 'N');
  const fotosJaIncluidas = new Set();
  titulo('Não conformidades');
  if (!naoConformes.length) texto('Nenhuma não conformidade registrada.');
  for (const { it, i } of naoConformes) {
    subtitulo(`${numeros[i] || i + 1}. ${it.desc || 'Item'}`);
    texto(`Categoria: ${it.cat || '—'}${it.obs ? ' · ' + it.obs : ''}`, { size: 8.2, color: COR.muted });
    for (const f of (it.fotos || [])) {
      const img = await carregarImagem(f.src || fotos[f.id], 700, 'image/jpeg');
      if (!img) continue;
      await desenharImagem(img, 72, it.desc || 'Registro fotográfico');
      fotosJaIncluidas.add(f.id || f.src || '');
    }
  }

  titulo('Anomalias');
  if (!minhasAnomalias.length) texto('Nenhuma anomalia registrada.');
  for (const a of minhasAnomalias) {
    subtitulo(a.titulo || 'Anomalia');
    texto(`Gravidade: ${a.gravidade || '—'} · Status: ${a.status || '—'}${a.prioridade ? ' · Prioridade: ' + a.prioridade : ''}`, { size: 8.2 });
    if (a.itemDesc) texto(`Item: ${a.itemDesc}${a.itemCat ? ' (' + a.itemCat + ')' : ''}`, { size: 8.2 });
    if (a.ambiente) texto(`Local: ${a.ambiente}`, { size: 8.2 });
    if (a.prazo) texto(`Prazo: ${a.prazo}`, { size: 8.2 });
    if (a.responsavel) texto(`Responsável: ${a.responsavel}`, { size: 8.2 });
    if (a.descricao) texto(a.descricao, { size: 8.5 });
    if (a.foto) {
      const img = await carregarImagem(a.foto, 700, 'image/jpeg');
      await desenharImagem(img, 72, a.titulo || 'Registro da anomalia');
    }
  }

  titulo('Registro fotográfico');
  let fotosQtd = 0;
  for (let i = 0; i < itens.length; i++) {
    const it = itens[i];
    for (const f of (it.fotos || [])) {
      if (fotosJaIncluidas.has(f.id || f.src || '')) continue;
      const img = await carregarImagem(f.src || fotos[f.id], 700, 'image/jpeg');
      if (!img) continue;
      fotosQtd++;
      await desenharImagem(img, 72, `${numeros[i] || i + 1}. ${it.desc || 'Item'}${f.legenda ? ' — ' + f.legenda : ''}`);
    }
  }
  if (!fotosQtd) texto(fotosJaIncluidas.size ? 'As fotos das não conformidades estão no bloco anterior.' : 'Nenhuma foto registrada.');

  titulo('Documentos anexados');
  if (!meusDocumentos.length) texto('Nenhum documento anexado.');
  else tabela(['Tipo', 'Nome', 'Data'], meusDocumentos.map(d => [d.tipo || '—', d.nome || '—', d.criado ? dataBR(String(d.criado).slice(0, 10)) : '—']), [35, 115, 30]);

  titulo('Recomendações');
  texto(recomendacoes);
  titulo('Conclusão');
  texto(conclusao);

  if (v.cienciaCliente) {
    titulo('Ciência do cliente');
    texto(`${v.cienciaCliente.nome || cliente?.nome || 'Cliente'} declarou ciência do laudo${v.cienciaCliente.em ? ' em ' + dataBR(String(v.cienciaCliente.em).slice(0, 10)) : ''}.`, { size: 9 });
    if (v.cienciaCliente.obs) texto(v.cienciaCliente.obs);
  }

  titulo('Assinatura e integridade');
  if (assinatura) await desenharImagem(assinatura, 70, '');
  texto(`Responsável técnico: ${v.assinatura?.nome || v.vistoriador || '—'}${v.assinatura?.crea ? ' · CREA ' + v.assinatura.crea : ''}`, { size: 8.8, gap: 1 });
  if (v.assinatura?.em || v.assinatura?.ts) texto(`Assinado em: ${fmt(v.assinatura.em || v.assinatura.ts)}`, { size: 8.2, color: COR.muted, gap: 2 });
  texto(`Formato do hash: v${v.assinatura?.hashVersao || 1} · Algoritmo: SHA-256`, { size: 8, style: 'bold', gap: 1 });
  texto(v.assinatura?.hash || 'Hash não disponível', { size: 7, font: 'courier', gap: 2 });
  texto(v.assinatura?.hashVersao === 2
    ? 'O hash cobre a vistoria, o imóvel, as observações, o modelo, os itens, as fotos, as anomalias e os documentos vinculados. O PDF gerado e anexado após a assinatura é um artefato do laudo e não altera o conteúdo assinado.'
    : 'O hash legado cobre o conteúdo do laudo conforme a versão 1. O PDF gerado após a assinatura não altera o conteúdo assinado.', { size: 7.4, color: COR.muted, gap: 2 });
  if (qr) {
    quebra(30);
    doc.addImage(qr.src, qr.tipo, M, y, 27, 27);
    texto('QR Code para conferência', { size: 7.5, color: COR.muted, x: M + 30, width: 50, gap: 0 });
    y += 29;
  }

  const totalPaginas = doc.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...COR.muted);
    doc.text(`VISTORI ENGENHARIA · Laudo ${v.numeroLaudo || 'sem número'} · v${v.versao || 1} · Página ${p}/${totalPaginas}`, M, 291);
  }

  return { blob: doc.output('blob'), nome, paginas: totalPaginas };
}

