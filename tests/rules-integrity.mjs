// Teste das regras do Firestore para conteúdo assinado. Rode: node tests/rules-integrity.mjs
// Usa o emulador local (não publica nada). Requer firebase-tools/firebase emulador;
// instale fora do projeto ou tenha `firebase` no PATH.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, 'tests', '.tmp-rules');
const PORT = 8086;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const limpar = () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} };
limpar(); fs.mkdirSync(TMP, { recursive: true });
const logPath = path.join(TMP, 'emulator.log');
const log = fs.openSync(logPath, 'a');
const cmd = process.env.FIREBASE_BIN || 'firebase';
const emu = spawn(cmd, ['emulators:start', '--only', 'firestore', '--project', 'demo-vistori', '--config', path.join(ROOT, 'firebase.test.json')], {
  cwd: TMP, detached: true, env: { ...process.env, CI: '1', GCLOUD_PROJECT: 'demo-vistori' }, stdio: ['ignore', log, log]
});
let falhas = 0;
const resultados = [];
const check = (nome, ok, detalhe = '') => {
  resultados.push({ nome, ok, detalhe }); if (!ok) falhas++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${nome}${detalhe ? ' — ' + String(detalhe).slice(0, 220) : ''}`);
};
async function esperar(url, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch (e) {}
    await sleep(200);
  }
  throw new Error('emulador não subiu. Log:\n' + fs.readFileSync(logPath, 'utf8').slice(-2000));
}
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const agora = Math.floor(Date.now() / 1000);
const token = (email, uid) => `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
  iss: 'https://securetoken.google.com/demo-vistori', aud: 'demo-vistori', auth_time: agora,
  user_id: uid, sub: uid, iat: agora, exp: agora + 3600, email, email_verified: true,
  firebase: { identities: {}, sign_in_provider: 'password' }
})}.`;
const user = token('comum@test.com', 'uid-comum');
const URL = `http://127.0.0.1:${PORT}/v1/projects/demo-vistori/databases/(default)/documents`;
const owner = 'owner';
const val = v => {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } };
  return { stringValue: String(v) };
};
async function req(method, caminho, tok, body) {
  const r = await fetch(URL + caminho, {
    method,
    headers: { Authorization: `Bearer ${tok}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify({ fields: Object.fromEntries(Object.entries(body).map(([k, v]) => [k, val(v)])) }) : undefined
  });
  return { status: r.status, text: (await r.text()).slice(0, 220) };
}
const criar = (col, id, tok, body) => req('PATCH', `/${col}/${encodeURIComponent(id)}`, tok, body);
const patch = (col, id, tok, body, mask) => req('PATCH', `/${col}/${encodeURIComponent(id)}${mask}`, tok, body);
const ler = (col, id, tok = owner) => req('GET', `/${col}/${encodeURIComponent(id)}`, tok);
const apagar = (col, id, tok) => req('DELETE', `/${col}/${encodeURIComponent(id)}`, tok);
async function t(nome, esperado, fn) {
  try {
    const r = await fn();
    check(nome, r.status === esperado, `status ${r.status}, esperado ${esperado}${r.status === esperado ? '' : ' — ' + r.text}`);
  } catch (e) { check(nome, false, e.message); }
}

try {
  await esperar(`http://127.0.0.1:${PORT}/`);
  await t('setup acesso comum', 200, () => criar('acessos', 'comum@test.com', owner, { id: 'comum@test.com', nome: 'Comum', perfil: 'Vistoriador' }));
  await t('setup vistoria assinada', 200, () => criar('vistorias', 'vs', owner, { id: 'vs', status: 'assinada', versao: 1, obraId: 'o1', itens: [], assinatura: { nome: 'X', hash: 'h', ts: '2026-01-01T00:00:00.000Z' } }));
  await t('setup vistoria rascunho', 200, () => criar('vistorias', 'vd', owner, { id: 'vd', status: 'rascunho', versao: 1, obraId: 'o1', itens: [] }));
  await t('setup assinada para reabrir', 200, () => criar('vistorias', 'vs2', owner, { id: 'vs2', status: 'assinada', versao: 1, obraId: 'o1', itens: [], assinatura: { nome: 'X', hash: 'h', ts: '2026-01-01T00:00:00.000Z' } }));
  await t('setup anomalia assinada', 200, () => criar('anomalias', 'as', owner, { id: 'as', vistoriaId: 'vs', titulo: 'A' }));
  await t('setup anomalia rascunho', 200, () => criar('anomalias', 'ad', owner, { id: 'ad', vistoriaId: 'vd', titulo: 'A' }));
  await t('setup documento assinado', 200, () => criar('documentos', 'ds', owner, { id: 'ds', vistoriaId: 'vs', nome: 'D' }));
  await t('setup documento rascunho', 200, () => criar('documentos', 'dd', owner, { id: 'dd', vistoriaId: 'vd', nome: 'D' }));
  await t('setup foto assinada', 200, () => criar('fotos', 'fs', owner, { id: 'fs', vistoriaId: 'vs', src: 'x' }));
  await t('setup foto rascunho', 200, () => criar('fotos', 'fd', owner, { id: 'fd', vistoriaId: 'vd', src: 'x' }));

  await t('comum lê anomalia assinada', 200, () => ler('anomalias', 'as', user));
  await t('comum lê documento assinado', 200, () => ler('documentos', 'ds', user));
  await t('comum lê foto assinada', 200, () => ler('fotos', 'fs', user));
  await t('comum não cria anomalia em assinada', 403, () => criar('anomalias', 'as2', user, { id: 'as2', vistoriaId: 'vs', titulo: 'A' }));
  await t('comum não altera anomalia de assinada', 403, () => patch('anomalias', 'as', user, { status: 'Corrigida' }, '?updateMask.fieldPaths=status'));
  await t('comum não exclui anomalia de assinada', 403, () => apagar('anomalias', 'as', user));
  await t('comum não cria documento em assinada', 403, () => criar('documentos', 'ds2', user, { id: 'ds2', vistoriaId: 'vs', nome: 'D' }));
  await t('comum não exclui documento de assinada', 403, () => apagar('documentos', 'ds', user));
  // PDF gerado depois da assinatura: criação permitida somente com o selo e os
  // campos do artefato; depois de criado, é imutável enquanto a vistoria estiver assinada.
  await t('comum cria PDF do laudo em assinada', 200, () => criar('documentos', 'pdfs', user, {
    id: 'pdfs', vistoriaId: 'vs', nome: 'Vistoria_VST-1_Cliente.pdf', tipo: 'Laudo técnico',
    mime: 'application/pdf', src: 'data:application/pdf;base64,JVBERi0=', pdfAssinatura: true, hashLaudo: 'h'
  }));
  await t('comum não edita PDF do laudo em assinada', 403, () => patch('documentos', 'pdfs', user, { nome: 'outro.pdf' }, '?updateMask.fieldPaths=nome'));
  await t('comum não exclui PDF do laudo em assinada', 403, () => apagar('documentos', 'pdfs', user));
  await t('comum não cria PDF do laudo em rascunho', 403, () => criar('documentos', 'pdfd', user, {
    id: 'pdfd', vistoriaId: 'vd', nome: 'Vistoria_VST-2_Cliente.pdf', tipo: 'Laudo técnico',
    mime: 'application/pdf', src: 'data:application/pdf;base64,JVBERi0=', pdfAssinatura: true, hashLaudo: 'h'
  }));
  await t('comum não usa o selo de PDF em documento comum', 403, () => criar('documentos', 'fake-pdf', user, {
    id: 'fake-pdf', vistoriaId: 'vd', nome: 'D', pdfAssinatura: true
  }));
  await t('comum não cria foto em assinada', 403, () => criar('fotos', 'fs2', user, { id: 'fs2', vistoriaId: 'vs', src: 'x' }));
  await t('comum não altera foto de assinada', 403, () => patch('fotos', 'fs', user, { src: 'y' }, '?updateMask.fieldPaths=src'));
  await t('comum não exclui foto de assinada', 403, () => apagar('fotos', 'fs', user));

  await t('comum cria anomalia em rascunho', 200, () => criar('anomalias', 'ad2', user, { id: 'ad2', vistoriaId: 'vd', titulo: 'A' }));
  await t('comum altera anomalia em rascunho', 200, () => patch('anomalias', 'ad2', user, { status: 'Corrigida' }, '?updateMask.fieldPaths=status'));
  await t('comum exclui anomalia em rascunho', 200, () => apagar('anomalias', 'ad2', user));
  await t('comum cria documento em rascunho', 200, () => criar('documentos', 'dd2', user, { id: 'dd2', vistoriaId: 'vd', nome: 'D' }));
  await t('comum exclui documento em rascunho', 200, () => apagar('documentos', 'dd2', user));
  await t('comum cria foto em rascunho', 200, () => criar('fotos', 'fd2', user, { id: 'fd2', vistoriaId: 'vd', src: 'x' }));
  await t('comum altera foto em rascunho', 200, () => patch('fotos', 'fd2', user, { src: 'y' }, '?updateMask.fieldPaths=src'));
  await t('comum exclui foto em rascunho', 200, () => apagar('fotos', 'fd2', user));

  await t('comum altera vistoria em rascunho', 200, () => patch('vistorias', 'vd', user, { observacoesGerais: 'ok' }, '?updateMask.fieldPaths=observacoesGerais'));
  await t('comum não altera vistoria assinada', 403, () => patch('vistorias', 'vs', user, { laudoObjetivo: 'x' }, '?updateMask.fieldPaths=laudoObjetivo'));
  await t('comum não exclui vistoria assinada', 403, () => apagar('vistorias', 'vs', user));
  await t('comum não reabre sem nova versão', 403, () => patch('vistorias', 'vs', user, { status: 'rascunho', versao: 1 }, '?updateMask.fieldPaths=status&updateMask.fieldPaths=versao&updateMask.fieldPaths=assinatura'));
  await t('comum reabre com nova versão', 200, () => patch('vistorias', 'vs2', user, { status: 'rascunho', versao: 2 }, '?updateMask.fieldPaths=status&updateMask.fieldPaths=versao&updateMask.fieldPaths=assinatura'));
  await t('comum cria histórico de versão', 200, () => criar('versoes', 'ver', user, { id: 'ver', vistoriaId: 'vs2', versao: 1, assinatura: { hash: 'h' } }));
  await t('comum não edita versão', 403, () => patch('versoes', 'ver', user, { versao: 2 }, '?updateMask.fieldPaths=versao'));
  await t('comum não exclui versão', 403, () => apagar('versoes', 'ver', user));
} catch (e) {
  check('execução geral', false, e.message);
} finally {
  try { process.kill(-emu.pid, 'SIGTERM'); } catch (e) {}
  await sleep(1500);
  try { process.kill(-emu.pid, 'SIGKILL'); } catch (e) {}
  try { fs.closeSync(log); } catch (e) {}
  await sleep(500);
  limpar();
  console.log('\n===== RESUMO =====');
  const listaFalhas = resultados.filter(r => !r.ok);
  console.log(`${resultados.length - listaFalhas.length}/${resultados.length} verificações passaram`);
  if (listaFalhas.length) { console.log('\nFALHAS:'); listaFalhas.forEach(f => console.log(' ✗', f.nome, '—', f.detalhe)); }
  process.exit(listaFalhas.length ? 1 : 0);
}

