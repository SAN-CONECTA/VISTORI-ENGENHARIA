// Utilidades puras: datas, formatação, ids, hash e compressão de imagem.

export const lerArquivo = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
export const fmtBytes = n => !n ? '—' : n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
export const labelReg = d => (d && (d.nome || d.numero || d.numeroLaudo || d.titulo || d.descricao || d.razao || d.id)) || '—';
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const fmt = iso => iso ? new Date(iso).toLocaleString('pt-BR') : '';
export const brl = v => (v === '' || v == null || isNaN(v)) ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const sha = async s => {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
};
export const canon = o => Array.isArray(o) ? '[' + o.map(canon).join(',') + ']'
  : (o && typeof o === 'object') ? '{' + Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}'
    : JSON.stringify(o);
export const comprimir = f => new Promise(res => {
  const img = new Image();
  img.onload = () => {
    const s = Math.min(1, 1024 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * s);
    c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(img.src);
    res(c.toDataURL('image/jpeg', 0.65));
  };
  img.src = URL.createObjectURL(f);
});
export const dataBR = data => data ? new Date(data + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
