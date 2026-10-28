// CPF/CNPJ: validação, formatação e checagem de duplicidade.

const dig = s => String(s || '').replace(/\D/g, '');
function cpfOk(c) {
  c = dig(c);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  let s = 0; for (let i = 0; i < 9; i++) s += c[i] * (10 - i);
  let d = (s * 10) % 11 % 10; if (d != c[9]) return false;
  s = 0; for (let i = 0; i < 10; i++) s += c[i] * (11 - i);
  d = (s * 10) % 11 % 10; return d == c[10];
}
function cnpjOk(c) {
  c = dig(c);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = n => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += c[i] * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return calc(12) == c[12] && calc(13) == c[13];
}
export const fmtDoc = raw => {
  raw = dig(raw);
  return raw.length === 11 ? raw.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    : raw.length === 14 ? raw.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : raw;
};
export function docMsg(d, items, cur) {
  const raw = dig(d.documento);
  if (!raw) return null;
  const tipo = d.pessoa || (raw.length === 11 ? 'PF' : 'PJ');
  if (tipo === 'PF' && !cpfOk(raw)) return 'CPF inválido.';
  if (tipo === 'PJ' && !cnpjOk(raw)) return 'CNPJ inválido.';
  if (items.some(i => i.id !== cur.id && dig(i.documento) === raw)) return 'Já existe um cadastro com este documento.';
  return null;
}
