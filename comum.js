// Funções compartilhadas entre index.html e folha.html
const CFG = window.HE_CONFIG;
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

const TURNOS = {
  T1: { entrada: '07:15', saida: '15:45' },
  T2: { entrada: '15:30', saida: '00:00' },
  T3: { entrada: '23:50', saida: '07:38' },
  T4: { entrada: '11:30', saida: '20:00' }
};

const COLUNAS = [
  { campo: 'min_35',   rotulo: 'Adic. noturno 35%', adicional: true },
  { campo: 'min_80',   rotulo: '80%' },
  { campo: 'min_80n',  rotulo: '80% noturna' },
  { campo: 'min_100',  rotulo: '100%' },
  { campo: 'min_100n', rotulo: '100% noturna' }
];

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

// CS sempre no formato "cs" + números (ex.: cs338104). Se digitar só os números, completa o "cs".
function normCS(v) {
  let c = String(v || '').trim().toLowerCase().replace(/[\s.\-_]+/g, '');
  if (/^\d+$/.test(c)) c = 'cs' + c;
  return c;
}
const CS_VALIDO = /^cs\d{4,10}$/;
function emailDoCS(cs) { return `${normCS(cs)}@${CFG.DOMINIO_LOGIN}`; }

// "hh:mm" -> minutos (vazio = 0, inválido = NaN)
function toMin(v) {
  v = String(v ?? '').trim();
  if (!v) return 0;
  const m = /^(\d{1,3}):([0-5]\d)$/.exec(v);
  return m ? (+m[1]) * 60 + (+m[2]) : NaN;
}
// minutos -> "hh:mm" (0 = vazio, a menos que mostrarZero)
function fmtMin(min, mostrarZero = false) {
  if (!min && !mostrarZero) return '';
  const h = Math.floor(min / 60), m = min % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
function hhmm(t) { return t ? String(t).slice(0, 5) : ''; }   // "15:45:00" -> "15:45"
function duracao(ini, fim) {                                   // atravessa meia-noite
  const a = toMin(hhmm(ini)), b = toMin(hhmm(fim));
  if (isNaN(a) || isNaN(b) || !ini || !fim) return 0;
  return ((b - a) % 1440 + 1440) % 1440;
}
// Colunas de HORA EXTRA (o adicional noturno 35% fica separado e não conta como HE)
const COLUNAS_HE = COLUNAS.filter(c => !c.adicional);
function somaColunas(r) { return COLUNAS_HE.reduce((s, c) => s + (r[c.campo] || 0), 0); }
function adicionalNoturno(r) { return r.min_35 || 0; }

// Datas sem fuso: trabalha sempre com "AAAA-MM-DD"
function isoDe(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dataDe(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
function br(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
function diaSemana(iso) { return DIAS[dataDe(iso).getDay()]; }
function hojeISO() { return isoDe(new Date()); }

// Período de fechamento: dia 11 do mês até dia 10 do mês seguinte.
// Chave "AAAA-MM" = mês em que o período começa.
function periodoDe(chave) {
  const [y, m] = chave.split('-').map(Number);
  return { chave, ini: isoDe(new Date(y, m - 1, 11)), fim: isoDe(new Date(y, m, 10)) };
}
function periodoDaData(iso) {
  const d = dataDe(iso);
  if (d.getDate() < 11) d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function rotuloPeriodo(chave) { const p = periodoDe(chave); return `${br(p.ini)} a ${br(p.fim)}`; }
function listaPeriodos(qtd = 8) {
  const atual = periodoDaData(hojeISO());
  const [y, m] = atual.split('-').map(Number);
  const out = [];
  for (let i = -1; i < qtd - 1; i++) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out; // inclui o próximo período (para quem lança no dia 10/11)
}
function preencherPeriodos(sel, escolhido) {
  const atual = escolhido || periodoDaData(hojeISO());
  sel.innerHTML = listaPeriodos().map(c =>
    `<option value="${c}" ${c === atual ? 'selected' : ''}>${rotuloPeriodo(c)}</option>`).join('');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function erroAmigavel(error) {
  if (!error) return '';
  const t = error.message || String(error);
  if (error.code === '23505') return 'Já existe um lançamento nesse dia. Edite o existente em "Minhas HEs".';
  if (/Invalid login/i.test(t)) return 'CS ou senha incorretos.';
  if (/already registered/i.test(t)) return 'Esse CS já tem conta. Use a aba "Entrar".';
  if (/Password should be/i.test(t)) return 'A senha precisa ter pelo menos 6 caracteres.';
  return t;
}

// Minutos do intervalo início→fim que caem entre 22:00 e 05:00
function minutosNoturnos(ini, fim) {
  const total = duracao(ini, fim);
  if (!total) return 0;
  const a = toMin(hhmm(ini));
  let n = 0;
  for (let i = 0; i < total; i++) {
    const m = (a + i) % 1440;
    if (m >= 1320 || m < 300) n++;
  }
  return n;
}

// Minutos da HE que caem DENTRO do horário de trabalho (turno previsto ou jornada informada)
function minutosDentroDoTurno(ini, fim, turno, jEnt, jSai) {
  const t = TURNOS[turno];
  const ent = hhmm(jEnt) || t?.entrada, sai = hhmm(jSai) || t?.saida;
  if (!ent || !sai || !ini || !fim) return 0;
  const tIni = toMin(ent), tDur = duracao(ent, sai);
  const dentro = m => ((m - tIni) % 1440 + 1440) % 1440 < tDur;
  const a = toMin(hhmm(ini)), total = duracao(ini, fim);
  let n = 0;
  for (let i = 0; i < total; i++) if (dentro((a + i) % 1440)) n++;
  return n;
}
const TOLERANCIA_TURNO = 10; // minutos de sobreposição ignorados


// Cargos (lista fixa no cadastro) e o grupo usado nos indicadores
const CARGOS = {
  'Operador': ['OPERADOR 1', 'OPERADOR 2', 'OPERADOR 3'],
  'Administrativo': ['ADMINISTRATIVO 1', 'ADMINISTRATIVO 2'],
  'Supervisor': ['SUPERVISOR 1', 'SUPERVISOR 2', 'SUPERVISOR 3'],
  'Superintendente': ['SUPERINTENDENTE DO TERMINAL'],
  'Aprendiz': ['APRENDIZ']
};
const GRUPOS_CARGO = ['OPERADOR', 'ADMINISTRATIVO', 'SUPERVISOR', 'SUPERINTENDENTE', 'APRENDIZ'];
function grupoCargo(cargo) {
  const c = String(cargo || '').toUpperCase().trim();
  return GRUPOS_CARGO.find(g => c.startsWith(g)) || 'OUTROS';
}
function opcoesCargo(selecionado) {
  const todos = Object.values(CARGOS).flat();
  const extra = selecionado && !todos.includes(selecionado)
    ? `<option value="${esc(selecionado)}" selected>${esc(selecionado)} (antigo, trocar)</option>` : '';
  return extra + Object.entries(CARGOS).map(([g, lista]) => `<optgroup label="${g}">` +
    lista.map(c => `<option ${c === selecionado ? 'selected' : ''}>${c}</option>`).join('') + '</optgroup>').join('');
}

// Cargo no topo da hierarquia: aprova a própria HE (fica registrado na auditoria)
const CARGOS_AUTOAPROVA = ['SUPERVISOR 3'];

// Turno "EX" = horário exceção (avulso): entrada e saída digitadas na hora
function rotuloTurno(t) { return t === 'EX' ? 'Exceção' : t; }
// Jornada usada nos cálculos: a informada (exceção / jornada diferente) ou a do turno
function jornadaDe(turno, ent, sai) {
  if (ent && sai) return { ent: hhmm(ent), sai: hhmm(sai) };
  const t = TURNOS[turno];
  return t ? { ent: t.entrada, sai: t.saida } : null;
}
// Adicional noturno 35%: das 22:00 às 05:00. No T3, conta a jornada inteira (23:50 às 07:38).
// A refeição (se informada) é descontada.
function adicionalDaJornada(turno, ent, sai, rIni, rFim) {
  const j = jornadaDe(turno, ent, sai);
  if (!j) return 0;
  return turno === 'T3' ? totalHE(j.ent, j.sai, rIni, rFim) : noturnoHE(j.ent, j.sai, rIni, rFim);
}

// Horário de refeição: os minutos que caem dentro da refeição são descontados
function naFaixa(m, a, b) {
  const d = duracao(a, b);
  return d > 0 && ((m - toMin(hhmm(a))) % 1440 + 1440) % 1440 < d;
}
function contarMin(ini, fim, cond) {
  const total = duracao(ini, fim), a = toMin(hhmm(ini));
  let n = 0;
  for (let i = 0; i < total; i++) if (cond((a + i) % 1440)) n++;
  return n;
}
const ehNoturno = m => m >= 1320 || m < 300;
// Minutos de refeição que caem dentro do intervalo
function refeicaoDentro(ini, fim, rIni, rFim) { return contarMin(ini, fim, m => naFaixa(m, rIni, rFim)); }
// Total da HE já sem a refeição
function totalHE(ini, fim, rIni, rFim) { return duracao(ini, fim) - refeicaoDentro(ini, fim, rIni, rFim); }
// Parte noturna da HE já sem a refeição
function noturnoHE(ini, fim, rIni, rFim) { return contarMin(ini, fim, m => ehNoturno(m) && !naFaixa(m, rIni, rFim)); }
