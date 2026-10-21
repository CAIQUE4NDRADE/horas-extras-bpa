// ===================== ESTADO =====================
let eu = null;           // perfil do usuário logado (linha de colaboradores)
let editandoId = null;   // id do lançamento em edição
let cacheMinhas = [];
let fechados = new Set();  // chaves 'AAAA-MM' de períodos fechados
let feriados = {};         // { 'AAAA-MM-DD': 'descrição' }

const periodoFechado = iso => fechados.has(periodoDaData(iso));

async function carregarAuxiliares() {
  const [{ data: pf }, { data: fer }] = await Promise.all([
    sb.from('periodos_fechados').select('chave'),
    sb.from('feriados').select('data, descricao')
  ]);
  fechados = new Set((pf || []).map(p => p.chave));
  feriados = Object.fromEntries((fer || []).map(f => [f.data, f.descricao]));
}

function mostrar(view) { $$('.view').forEach(v => v.hidden = v.id !== view); }
function msg(form, texto, tipo = 'erro') {
  const el = form.querySelector('.msg');
  el.textContent = texto || '';
  el.className = 'msg ' + tipo;
  el.hidden = !texto;
}
function ocupado(form, sim) {
  form.querySelectorAll('button').forEach(b => {
    b.disabled = sim;
    if (b.type === 'submit' || !b.getAttribute('type')) {
      if (sim) { b.dataset.txt = b.textContent; b.textContent = 'Aguarde...'; }
      else if (b.dataset.txt) b.textContent = b.dataset.txt;
    }
  });
}
function carregandoBotao(btn, sim, texto = 'Aguarde...') {
  if (!btn) return;
  btn.disabled = sim;
  if (sim) { btn.dataset.txt = btn.textContent; btn.textContent = texto; }
  else if (btn.dataset.txt) btn.textContent = btn.dataset.txt;
}

// ===================== INÍCIO =====================
async function iniciar() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { $('#usuario').hidden = true; mostrar('v-login'); return; }

  const { data, error } = await sb.from('colaboradores').select('*').eq('id', session.user.id).maybeSingle();
  if (error) { alert('Erro ao carregar perfil: ' + error.message); return; }
  if (!data) { await prepararPerfil(session.user); return; }
  if (!data.ativo) {
    await sb.auth.signOut();
    mostrar('v-login');
    msg($('#f-login'), 'Seu cadastro está inativo. Fale com o administrador.');
    return;
  }
  eu = data;
  montarApp();
}

// ===================== LOGIN / CADASTRO =====================
$$('.aba-l').forEach(b => b.onclick = () => {
  $$('.aba-l').forEach(x => x.classList.toggle('ativa', x === b));
  $('#f-login').hidden = b.dataset.alvo !== 'f-login';
  $('#f-cadastro').hidden = b.dataset.alvo !== 'f-cadastro';
});

$('#f-login').onsubmit = async e => {
  e.preventDefault();
  const f = e.target; ocupado(f, true); msg(f, '');
  const { error } = await sb.auth.signInWithPassword({
    email: emailDoCS($('#l-cs').value), password: $('#l-senha').value
  });
  ocupado(f, false);
  if (error) return msg(f, erroAmigavel(error));
  iniciar();
};

$('#f-cadastro').onsubmit = async e => {
  e.preventDefault();
  const f = e.target; msg(f, '');
  const cs = normCS($('#c-cs').value);
  if (!/^[a-z0-9._-]{3,}$/.test(cs)) return msg(f, 'CS inválido.');
  if ($('#c-senha').value !== $('#c-senha2').value) return msg(f, 'As senhas não conferem.');
  ocupado(f, true);
  const { data, error } = await sb.auth.signUp({
    email: emailDoCS(cs), password: $('#c-senha').value, options: { data: { cs } }
  });
  ocupado(f, false);
  if (error) return msg(f, erroAmigavel(error));
  if (!data.session) return msg(f, 'Conta criada, mas o Supabase está pedindo confirmação de e-mail. ' +
    'O administrador precisa desativar "Confirm email" em Authentication > Providers > Email.');
  iniciar();
};

async function prepararPerfil(user) {
  const { data: sups } = await sb.from('colaboradores')
    .select('id, nome, papel').in('papel', ['supervisor', 'admin']).eq('ativo', true).order('nome');
  const sel = $('#p-supervisor');
  sel.innerHTML = (sups && sups.length)
    ? '<option value="">Selecione...</option>' + sups.map(s => `<option value="${s.id}">${esc(s.nome)}</option>`).join('')
    : '<option value="">(nenhum supervisor cadastrado ainda)</option>';
  sel.required = !!(sups && sups.length);
  $('#f-perfil').dataset.cs = user.user_metadata?.cs || user.email.split('@')[0];
  $('#usuario').hidden = false; $('#u-nome').textContent = $('#f-perfil').dataset.cs;
  mostrar('v-perfil');
}

$('#f-perfil').onsubmit = async e => {
  e.preventDefault();
  const f = e.target; ocupado(f, true); msg(f, '');
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from('colaboradores').insert({
    id: user.id,
    cs: f.dataset.cs,
    nome: $('#p-nome').value.trim(),
    cargo: $('#p-cargo').value.trim(),
    turno: $('#p-turno').value,
    supervisor_id: $('#p-supervisor').value || null
  });
  ocupado(f, false);
  if (error) return msg(f, erroAmigavel(error));
  iniciar();
};

$('#btn-sair').onclick = async () => {
  // scope 'local' encerra a sessão neste aparelho sem depender do servidor responder
  try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { console.warn(e); }
  // garantia: remove qualquer sessão guardada pelo Supabase no navegador
  try { Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k)); } catch (e) {}
  eu = null;
  location.reload();
};

// ===================== APP =====================
const ehSup = () => eu && (eu.papel === 'supervisor' || eu.papel === 'admin');
const ehAdmin = () => eu && eu.papel === 'admin';

function montarApp() {
  $('#usuario').hidden = false;
  $('#u-nome').textContent = `${eu.nome} · ${eu.cs.toUpperCase()}`;
  $$('.so-sup').forEach(el => el.hidden = !ehSup());
  $$('.so-admin').forEach(el => el.hidden = !ehAdmin());
  preencherPeriodos($('#m-periodo'));
  preencherPeriodos($('#r-periodo'));
  montarColunas();
  limparForm();
  carregarResumoMes();
  mostrar('v-app');
  abrirPainel('p-lancar');
  if (ehSup()) contarPendentes();
  carregarAuxiliares().then(conferir);
}

$$('.aba').forEach(b => b.onclick = () => abrirPainel(b.dataset.painel));
function abrirPainel(id) {
  $$('.aba').forEach(b => b.classList.toggle('ativa', b.dataset.painel === id));
  $$('.painel').forEach(p => p.hidden = p.id !== id);
  if (id === 'p-minhas') carregarMinhas();
  if (id === 'p-aprovar') carregarPendentes();
  if (id === 'p-resumo') carregarResumo();
  if (id === 'p-equipe') { carregarEquipe(); carregarFeriadosAdmin(); }
  if (id === 'p-senha') { $('#f-senha').reset(); msg($('#f-senha'), ''); }
}

// ===================== LANÇAR =====================
function montarColunas() {
  $('#h-colunas').innerHTML = COLUNAS.map(c => `
    <label>${c.rotulo}<input id="h-${c.campo}" class="col-pct" inputmode="numeric" placeholder="00:00" maxlength="6"></label>
  `).join('');
  $$('.col-pct').forEach(inp => {
    inp.addEventListener('input', () => { mascaraHora(inp); conferir(); });
  });
}
function mascaraHora(inp) {
  const d = inp.value.replace(/\D/g, '').slice(0, 4);
  inp.value = d.length > 2 ? d.slice(0, d.length - 2) + ':' + d.slice(-2) : d;
}

['#h-inicio', '#h-fim', '#h-data'].forEach(s => $(s).addEventListener('input', conferir));
$('#h-data').addEventListener('change', conferir);
$('#h-turno').addEventListener('change', mostrarPrevisto);

function mostrarPrevisto() {
  const t = TURNOS[$('#h-turno').value];
  $('#h-previsto').textContent = `Previsto: ${t.entrada} às ${t.saida}`;
}

function conferir() {
  const total = duracao($('#h-inicio').value, $('#h-fim').value);
  mostrarAvisos();
  const valores = COLUNAS.map(c => toMin($('#h-' + c.campo).value));
  const box = $('#h-conferencia');
  if (valores.some(isNaN)) { box.className = 'conferencia nao-bate'; box.textContent = 'Use o formato hh:mm nas colunas (ex.: 01:15).'; return; }
  const soma = valores.reduce((a, b) => a + b, 0);
  if (!total && !soma) { box.className = 'conferencia'; box.textContent = ''; return; }
  const bate = total === soma;
  box.className = 'conferencia ' + (bate ? 'bate' : 'nao-bate');
  box.textContent = `Pelo horário: ${fmtMin(total, true)}  ·  Soma das colunas: ${fmtMin(soma, true)}` +
    (bate ? '  ✓' : '  — não bate, confira antes de salvar');
}

// Avisos que ajudam o operador a escolher a coluna (não bloqueiam, exceto período fechado)
function mostrarAvisos() {
  const data = $('#h-data').value, ini = $('#h-inicio').value, fim = $('#h-fim').value;
  const total = duracao(ini, fim), av = [];
  if (data && periodoFechado(data)) {
    av.push(['erro', `🔒 O período ${rotuloPeriodo(periodoDaData(data))} está fechado. ${ehAdmin() ? 'Como admin, você ainda pode lançar.' : 'Não é possível lançar nesta data.'}`]);
  }
  if (data) {
    const dom = dataDe(data).getDay() === 0, fer = feriados[data];
    if (fer || dom) av.push(['info', `📅 ${fer ? 'Feriado: ' + esc(fer) : 'Domingo'}. Normalmente vai na coluna 100%${minutosNoturnos(ini, fim) ? ' (e a parte noturna em 100% noturna)' : ''}.`]);
  }
  const noct = minutosNoturnos(ini, fim);
  if (noct) av.push(['info', `🌙 Desse horário, <b>${fmtMin(noct, true)}</b> caiu entre 22h e 5h (período noturno).`]);
  if (total > 120) av.push(['alerta', `⚠ Acima de 2h de hora extra no dia (${fmtMin(total, true)}). O limite legal é 2h, salvo exceções. Explique bem na justificativa.`]);
  $('#h-avisos').innerHTML = av.map(([t, txt]) => `<div class="aviso-l ${t}">${txt}</div>`).join('');
}

function limparForm() {
  editandoId = null;
  $('#f-he').reset();
  $('#h-data').value = hojeISO();
  $('#h-turno').value = eu.turno;
  $('#h-jornada').open = false;
  $('#t-lancar').textContent = 'Lançar hora extra';
  $('#h-cancelar').hidden = true;
  mostrarPrevisto(); conferir(); msg($('#f-he'), '');
}
$('#h-cancelar').onclick = limparForm;

$('#f-he').onsubmit = async e => {
  e.preventDefault();
  const f = e.target; msg(f, '');
  const reg = {
    data: $('#h-data').value,
    turno: $('#h-turno').value,
    inicio: $('#h-inicio').value,
    fim: $('#h-fim').value,
    jornada_entrada: $('#h-jent').value || null,
    jornada_saida: $('#h-jsai').value || null,
    refeicao_inicio: $('#h-rini').value || null,
    refeicao_fim: $('#h-rfim').value || null,
    justificativa: $('#h-just').value.trim()
  };
  for (const c of COLUNAS) {
    const v = toMin($('#h-' + c.campo).value);
    if (isNaN(v)) return msg(f, `Valor inválido em ${c.rotulo}. Use hh:mm.`);
    reg[c.campo] = v;
  }
  if (!somaColunas(reg)) return msg(f, 'Preencha as horas em pelo menos uma coluna de percentual.');
  if (!reg.justificativa) return msg(f, 'A justificativa é obrigatória.');
  if (periodoFechado(reg.data) && !ehAdmin()) return msg(f, 'Esse período já está fechado. Fale com o administrador.');

  ocupado(f, true);
  const { error } = editandoId
    ? await sb.from('horas_extras').update(reg).eq('id', editandoId)
    : await sb.from('horas_extras').insert({ ...reg, colaborador_id: eu.id });
  ocupado(f, false);
  if (error) return msg(f, erroAmigavel(error));

  const eraEdicao = !!editandoId;
  limparForm();
  carregarResumoMes();
  msg(f, eraEdicao ? 'Lançamento atualizado e reenviado para aprovação.' : 'Lançamento salvo! Aguardando aprovação do supervisor.', 'ok');
};

// ===================== RESUMO DO MÊS (topo do Lançar) =====================
async function carregarResumoMes() {
  const chave = periodoDaData(hojeISO()), p = periodoDe(chave);
  const box = $('#l-resumo');
  const { data, error } = await sb.from('horas_extras')
    .select('status, min_35, min_80, min_80n, min_100, min_100n')
    .eq('colaborador_id', eu.id).gte('data', p.ini).lte('data', p.fim);
  if (error) { box.innerHTML = ''; return; }
  const soma = st => data.filter(r => r.status === st).reduce((a, r) => a + somaColunas(r), 0);
  const qtd = st => data.filter(r => r.status === st).length;
  box.innerHTML = `
    <div class="rm-titulo">Período ${rotuloPeriodo(chave)}</div>
    <div class="rm-cards">
      <div class="rm ok"><span>Aprovadas</span><b>${fmtMin(soma('aprovado'), true)}</b><small>${qtd('aprovado')} lançamento(s)</small></div>
      <div class="rm pend"><span>Pendentes</span><b>${fmtMin(soma('pendente'), true)}</b><small>${qtd('pendente')} lançamento(s)</small></div>
      <div class="rm rec"><span>Recusadas</span><b>${qtd('recusado')}</b><small>${qtd('recusado') ? 'corrija em Minhas HEs' : 'nenhuma'}</small></div>
    </div>`;
}

// ===================== HISTÓRICO =====================
const ROTULOS_CAMPO = {
  data: 'Data', turno: 'Turno', inicio: 'Início', fim: 'Fim', justificativa: 'Justificativa',
  jornada_entrada: 'Entrada', jornada_saida: 'Saída', refeicao_inicio: 'Refeição início', refeicao_fim: 'Refeição fim',
  min_35: '35%', min_80: '80%', min_80n: '80% noturna', min_100: '100%', min_100n: '100% noturna', motivo_recusa: 'Motivo recusa'
};
function valorCampo(campo, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (campo.startsWith('min_')) return fmtMin(v, true);
  if (campo === 'data') return br(v);
  if (/inicio|fim|entrada|saida/.test(campo)) return hhmm(v);
  return esc(v);
}

window.verHistorico = async (id, btn) => {
  const box = $('#hist-' + id);
  if (!box.hidden) { box.hidden = true; return; }
  carregandoBotao(btn, true, 'Carregando...');
  const { data, error } = await sb.from('he_historico').select('*').eq('he_id', id).order('alterado_em');
  carregandoBotao(btn, false);
  if (error) { box.innerHTML = `<p class="msg erro">${esc(error.message)}</p>`; box.hidden = false; return; }

  // nomes de quem alterou
  const ids = [...new Set(data.map(h => h.alterado_por).filter(Boolean))];
  let nomes = {};
  if (ids.length) {
    const { data: pes } = await sb.from('colaboradores').select('id, nome').in('id', ids);
    (pes || []).forEach(p => nomes[p.id] = p.nome);
  }

  box.innerHTML = data.length ? data.map(h => {
    let det = '';
    if (h.acao === 'editou' && h.antes && h.depois) {
      det = Object.keys(ROTULOS_CAMPO)
        .filter(c => JSON.stringify(h.antes[c]) !== JSON.stringify(h.depois[c]))
        .map(c => `${ROTULOS_CAMPO[c]}: ${valorCampo(c, h.antes[c])} → <b>${valorCampo(c, h.depois[c])}</b>`).join('<br>');
    }
    if (h.acao === 'recusou' && h.depois) det = 'Motivo: ' + esc(h.depois.motivo_recusa);
    const quem = nomes[h.alterado_por] || (h.alterado_por ? 'usuário' : 'sistema');
    return `<div class="hist-linha"><b>${h.acao}</b> · ${esc(quem)} · ${new Date(h.alterado_em).toLocaleString('pt-BR')}
      ${det ? `<div class="hist-det">${det}</div>` : ''}</div>`;
  }).join('') : '<p class="dica">Sem histórico registrado (lançamentos feitos antes do histórico ser ativado).</p>';
  box.hidden = false;
};

// ===================== MINHAS =====================
$('#m-periodo').onchange = carregarMinhas;
$('#m-imprimir').onclick = () => window.open(`folha.html?c=${eu.id}&p=${$('#m-periodo').value}`, '_blank');

async function carregarMinhas() {
  const p = periodoDe($('#m-periodo').value);
  $('#m-lista').innerHTML = '<p class="vazio">Carregando...</p>';
  const { data, error } = await sb.from('horas_extras')
    .select('*, aprovador:colaboradores!horas_extras_aprovado_por_fkey(nome)')
    .eq('colaborador_id', eu.id).gte('data', p.ini).lte('data', p.fim).order('data');
  if (error) { $('#m-lista').innerHTML = `<p class="msg erro">${esc(error.message)}</p>`; return; }
  cacheMinhas = data;

  const aprov = data.filter(r => r.status === 'aprovado');
  $('#m-totais').innerHTML = COLUNAS.map(c => {
    const s = aprov.reduce((a, r) => a + r[c.campo], 0);
    return `<div class="tot">${c.rotulo}<b>${fmtMin(s, true)}</b></div>`;
  }).join('') + `<div class="tot">Pendentes<b>${data.filter(r => r.status === 'pendente').length}</b></div>`;

  $('#m-lista').innerHTML = data.length ? data.map(r => itemHTML(r, true)).join('')
    : '<p class="vazio">Nenhum lançamento neste período.</p>';
}

function detalheColunas(r) {
  return COLUNAS.filter(c => r[c.campo]).map(c => `${c.rotulo}: <b>${fmtMin(r[c.campo])}</b>`).join(' · ');
}

function itemHTML(r, meu) {
  const total = duracao(r.inicio, r.fim), soma = somaColunas(r);
  const diverge = total !== soma, acima2h = Math.max(total, soma) > 120;
  const travado = periodoFechado(r.data) && !ehAdmin();
  const nome = meu ? '' : `<b>${esc(r.colaborador?.nome)}</b> (${esc((r.colaborador?.cs || '').toUpperCase())}) · `;
  const rotStatus = { pendente: 'Pendente', aprovado: 'Aprovado', recusado: 'Recusado' }[r.status];
  let extra = '';
  if (r.status === 'aprovado' && r.aprovador) extra = `<div class="det">Aprovado por ${esc(r.aprovador.nome)} em ${new Date(r.aprovado_em).toLocaleDateString('pt-BR')}</div>`;
  if (r.status === 'recusado') extra = `<div class="det" style="color:var(--erro)">Recusado: ${esc(r.motivo_recusa)}. Corrija e salve de novo.</div>`;

  const btnHist = `<button class="btn link peq" onclick="verHistorico(${r.id}, this)">Histórico</button>`;
  let botoes = `<div class="botoes">${btnHist}</div>`;
  if (meu && travado) botoes = `<div class="botoes"><span class="trava">🔒 Período fechado</span>${btnHist}</div>`;
  else if (meu && r.status !== 'aprovado') botoes = `<div class="botoes">
      <button class="btn sec peq" onclick="editar(${r.id})">Editar</button>
      <button class="btn perigo peq" onclick="excluir(${r.id}, this)">Excluir</button>${btnHist}</div>`;
  if (!meu) botoes = `<div class="botoes">
      <label class="sel-lote"><input type="checkbox" class="chk-lote" value="${r.id}" data-limpo="${diverge || acima2h ? 0 : 1}"> Selecionar</label>
      <button class="btn ok peq" onclick="decidir(${r.id}, true, this)">Aprovar</button>
      <button class="btn perigo peq" onclick="mostrarRecusa(${r.id})">Recusar</button>${btnHist}</div>
    <div class="recusa" id="rec-${r.id}" hidden>
      <input id="rec-txt-${r.id}" placeholder="Motivo da recusa">
      <button class="btn perigo peq" onclick="decidir(${r.id}, false, this)">Confirmar</button></div>`;
  botoes += `<div class="historico" id="hist-${r.id}" hidden></div>`;

  return `<div class="item">
    <div class="lin1">${nome}${br(r.data)} ${diaSemana(r.data)} · ${r.turno} · ${hhmm(r.inicio)} às ${hhmm(r.fim)}</div>
    <span class="st ${r.status}">${rotStatus}</span>
    <div class="det">${detalheColunas(r)}${diverge ? ` · <span class="alerta">⚠ horário dá ${fmtMin(total, true)}, colunas somam ${fmtMin(soma, true)}</span>` : ''}${acima2h ? ` · <span class="alerta">⚠ acima de 2h no dia</span>` : ''}${feriados[r.data] ? ` · <span class="info-t">📅 ${esc(feriados[r.data])}</span>` : ''}</div>
    <div class="det">${esc(r.justificativa)}</div>
    ${extra}${botoes}
  </div>`;
}

window.editar = id => {
  const r = cacheMinhas.find(x => x.id === id);
  if (!r) return;
  abrirPainel('p-lancar');
  editandoId = id;
  $('#t-lancar').textContent = `Editando ${br(r.data)}`;
  $('#h-cancelar').hidden = false;
  $('#h-data').value = r.data;
  $('#h-turno').value = r.turno;
  $('#h-inicio').value = hhmm(r.inicio);
  $('#h-fim').value = hhmm(r.fim);
  $('#h-jent').value = hhmm(r.jornada_entrada);
  $('#h-jsai').value = hhmm(r.jornada_saida);
  $('#h-rini').value = hhmm(r.refeicao_inicio);
  $('#h-rfim').value = hhmm(r.refeicao_fim);
  $('#h-jornada').open = !!(r.jornada_entrada || r.jornada_saida || r.refeicao_inicio);
  $('#h-just').value = r.justificativa;
  COLUNAS.forEach(c => $('#h-' + c.campo).value = fmtMin(r[c.campo]));
  mostrarPrevisto(); conferir(); msg($('#f-he'), '');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.excluir = async (id, btn) => {
  if (!confirm('Excluir este lançamento?')) return;
  carregandoBotao(btn, true, 'Excluindo...');
  const { error } = await sb.from('horas_extras').delete().eq('id', id);
  carregandoBotao(btn, false);
  if (error) return alert(erroAmigavel(error));
  carregarMinhas();
  carregarResumoMes();
};

// ===================== APROVAR =====================
$('#a-atualizar').onclick = carregarPendentes;

async function contarPendentes() {
  const { count } = await sb.from('horas_extras').select('id', { count: 'exact', head: true })
    .eq('status', 'pendente').neq('colaborador_id', eu.id);
  const b = $('#badge-pend');
  b.textContent = count || ''; b.hidden = !count;
}

async function carregarPendentes() {
  $('#a-lista').innerHTML = '<p class="vazio">Carregando...</p>';
  const { data, error } = await sb.from('horas_extras')
    .select('*, colaborador:colaboradores!horas_extras_colaborador_id_fkey(nome, cs)')
    .eq('status', 'pendente').neq('colaborador_id', eu.id).order('data');
  if (error) { $('#a-lista').innerHTML = `<p class="msg erro">${esc(error.message)}</p>`; return; }
  $('#a-lista').innerHTML = data.length ? data.map(r => itemHTML(r, false)).join('')
    : '<p class="vazio">Nada pendente. 👍</p>';
  $('#a-marcar').hidden = !data.length;
  atualizarLote();
  contarPendentes();
}

function atualizarLote() {
  const n = $$('.chk-lote:checked').length;
  $('#a-lote').disabled = !n;
  $('#a-lote').textContent = n ? `Aprovar selecionados (${n})` : 'Aprovar selecionados';
}
$('#a-lista').addEventListener('change', e => { if (e.target.classList.contains('chk-lote')) atualizarLote(); });
$('#a-marcar').onclick = () => {
  $$('.chk-lote').forEach(c => c.checked = c.dataset.limpo === '1');
  atualizarLote();
};
$('#a-lote').onclick = async () => {
  const ids = $$('.chk-lote:checked').map(c => +c.value);
  if (!ids.length || !confirm(`Aprovar ${ids.length} lançamento(s)?`)) return;
  const btn = $('#a-lote');
  let ok = 0; const falhas = [];
  for (const [i, id] of ids.entries()) {
    btn.textContent = `Aprovando ${i + 1}/${ids.length}...`; btn.disabled = true;
    const { error } = await sb.rpc('decidir_he', { p_id: id, p_aprovar: true, p_motivo: null });
    if (error) falhas.push(erroAmigavel(error)); else ok++;
  }
  alert(`${ok} aprovado(s).` + (falhas.length ? `\n${falhas.length} com erro:\n- ${[...new Set(falhas)].join('\n- ')}` : ''));
  carregarPendentes();
};

window.mostrarRecusa = id => { const el = $('#rec-' + id); el.hidden = !el.hidden; if (!el.hidden) $('#rec-txt-' + id).focus(); };

window.decidir = async (id, aprovar, btn) => {
  const motivo = aprovar ? null : $('#rec-txt-' + id).value.trim();
  if (!aprovar && !motivo) return alert('Informe o motivo da recusa.');
  carregandoBotao(btn, true, aprovar ? 'Aprovando...' : 'Recusando...');
  const { error } = await sb.rpc('decidir_he', { p_id: id, p_aprovar: aprovar, p_motivo: motivo });
  carregandoBotao(btn, false);
  if (error) return alert(erroAmigavel(error));
  carregarPendentes();
};

// ===================== RESUMO =====================
let cacheResumo = [];
$('#r-periodo').onchange = carregarResumo;

function mostrarStatusPeriodo(chave) {
  const fechado = fechados.has(chave);
  const st = $('#r-status');
  st.hidden = false;
  st.className = 'status-periodo ' + (fechado ? 'fechado' : 'aberto');
  st.textContent = fechado
    ? '🔒 Período fechado: ninguém consegue lançar, editar ou aprovar HE neste período (só o admin).'
    : '🔓 Período aberto para lançamentos e aprovações.';
  $('#r-fechar').textContent = fechado ? 'Reabrir período' : 'Fechar período';
  $('#r-fechar').className = 'btn so-admin ' + (fechado ? 'sec' : '');
  $('#r-fechar').hidden = !ehAdmin();
}

$('#r-todas').onclick = () => window.open(`folha.html?todos=1&p=${$('#r-periodo').value}`, '_blank');

$('#r-fechar').onclick = async () => {
  const chave = $('#r-periodo').value, fechado = fechados.has(chave);
  const pend = cacheResumo.reduce((a, l) => a + l.pendentes, 0);
  const aviso = fechado ? `Reabrir o período ${rotuloPeriodo(chave)}?`
    : `Fechar o período ${rotuloPeriodo(chave)}?` + (pend ? `\n\nAtenção: ainda há ${pend} lançamento(s) pendente(s) que ficarão travados.` : '');
  if (!confirm(aviso)) return;
  const btn = $('#r-fechar');
  carregandoBotao(btn, true);
  const { error } = fechado
    ? await sb.from('periodos_fechados').delete().eq('chave', chave)
    : await sb.from('periodos_fechados').insert({ chave, fechado_por: eu.id });
  carregandoBotao(btn, false);
  if (error) return alert(erroAmigavel(error));
  await carregarAuxiliares();
  mostrarStatusPeriodo(chave);
};

async function carregarResumo() {
  const p = periodoDe($('#r-periodo').value);
  $('#r-tabela').innerHTML = '<p class="vazio">Carregando...</p>';
  mostrarStatusPeriodo(p.chave);

  let q = sb.from('colaboradores').select('id, nome, cs, cargo').eq('ativo', true).order('nome');
  if (!ehAdmin()) q = q.eq('supervisor_id', eu.id);
  const [{ data: colabs, error: e1 }, { data: hes, error: e2 }] = await Promise.all([
    q,
    sb.from('horas_extras').select('colaborador_id, status, min_35, min_80, min_80n, min_100, min_100n')
      .gte('data', p.ini).lte('data', p.fim)
  ]);
  if (e1 || e2) { $('#r-tabela').innerHTML = `<p class="msg erro">${esc((e1 || e2).message)}</p>`; return; }

  cacheResumo = colabs.map(c => {
    const minhas = hes.filter(h => h.colaborador_id === c.id);
    const ap = minhas.filter(h => h.status === 'aprovado');
    const linha = { ...c, pendentes: minhas.filter(h => h.status === 'pendente').length };
    COLUNAS.forEach(col => linha[col.campo] = ap.reduce((a, h) => a + h[col.campo], 0));
    linha.total = somaColunas(linha);
    return linha;
  });

  if (!cacheResumo.length) { $('#r-tabela').innerHTML = '<p class="vazio">Nenhum colaborador vinculado a você.</p>'; return; }
  $('#r-tabela').innerHTML = `<table class="tab">
    <thead><tr><th>Colaborador</th><th>CS</th>${COLUNAS.map(c => `<th class="n">${c.rotulo}</th>`).join('')}
      <th class="n">Total</th><th class="n">Pend.</th><th></th></tr></thead>
    <tbody>${cacheResumo.map(l => `<tr>
      <td>${esc(l.nome)}</td><td>${esc(l.cs.toUpperCase())}</td>
      ${COLUNAS.map(c => `<td class="n">${fmtMin(l[c.campo])}</td>`).join('')}
      <td class="n"><b>${fmtMin(l.total)}</b></td>
      <td class="n">${l.pendentes ? `<span class="alerta">${l.pendentes}</span>` : ''}</td>
      <td><button class="btn sec peq" onclick="window.open('folha.html?c=${l.id}&p=${p.chave}','_blank')">Folha</button></td>
    </tr>`).join('')}</tbody></table>`;
}

$('#r-csv').onclick = () => {
  if (!cacheResumo.length) return;
  const cab = ['Nome', 'CS', 'Cargo', ...COLUNAS.map(c => c.rotulo), 'Total', 'Pendentes'];
  const linhas = cacheResumo.map(l => [l.nome, l.cs.toUpperCase(), l.cargo,
    ...COLUNAS.map(c => fmtMin(l[c.campo], true)), fmtMin(l.total, true), l.pendentes]);
  const csv = '﻿' + [cab, ...linhas].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `horas-extras_${$('#r-periodo').value}.csv`;
  a.click();
};

// ===================== EQUIPE (admin) =====================
async function carregarEquipe() {
  $('#e-lista').innerHTML = '<p class="vazio">Carregando...</p>';
  const { data, error } = await sb.from('colaboradores').select('*').order('nome');
  if (error) { $('#e-lista').innerHTML = `<p class="msg erro">${esc(error.message)}</p>`; return; }
  const sups = data.filter(c => c.papel !== 'colaborador');
  const optSup = sel => '<option value="">—</option>' + sups.map(s =>
    `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.nome)}</option>`).join('');
  const optPapel = sel => ['colaborador', 'supervisor', 'admin'].map(p =>
    `<option ${p === sel ? 'selected' : ''}>${p}</option>`).join('');

  $('#e-lista').innerHTML = `<table class="tab">
    <thead><tr><th>Nome</th><th>CS</th><th>Turno</th><th>Papel</th><th>Supervisor</th><th>Ativo</th><th></th></tr></thead>
    <tbody>${data.map(c => `<tr data-id="${c.id}">
      <td>${esc(c.nome)}<br><small style="color:var(--suave)">${esc(c.cargo)}</small></td>
      <td>${esc(c.cs.toUpperCase())}</td><td>${c.turno}</td>
      <td><select class="e-papel">${optPapel(c.papel)}</select></td>
      <td><select class="e-sup">${optSup(c.supervisor_id)}</select></td>
      <td><input type="checkbox" class="e-ativo" ${c.ativo ? 'checked' : ''} style="width:auto"></td>
      <td><button class="btn peq" onclick="salvarColab(this)">Salvar</button></td>
    </tr>`).join('')}</tbody></table>`;
}

window.salvarColab = async btn => {
  const tr = btn.closest('tr');
  carregandoBotao(btn, true, 'Salvando...');
  const { error } = await sb.from('colaboradores').update({
    papel: tr.querySelector('.e-papel').value,
    supervisor_id: tr.querySelector('.e-sup').value || null,
    ativo: tr.querySelector('.e-ativo').checked
  }).eq('id', tr.dataset.id);
  carregandoBotao(btn, false);
  if (error) return alert(erroAmigavel(error));
  btn.textContent = 'Salvo ✓';
  setTimeout(() => { btn.textContent = 'Salvar'; carregarEquipe(); }, 900);
};

// ===================== FERIADOS (admin) =====================
async function carregarFeriadosAdmin() {
  const box = $('#fer-lista');
  const { data, error } = await sb.from('feriados').select('*').gte('data', isoDe(new Date(new Date().getFullYear(), 0, 1))).order('data');
  if (error) { box.innerHTML = `<p class="msg erro">${esc(erroAmigavel(error))}</p>`; return; }
  box.innerHTML = data.length ? `<table class="tab"><thead><tr><th>Data</th><th>Dia</th><th>Descrição</th><th></th></tr></thead>
    <tbody>${data.map(f => `<tr><td>${br(f.data)}</td><td>${diaSemana(f.data)}</td><td>${esc(f.descricao)}</td>
      <td><button class="btn perigo peq" onclick="removerFeriado('${f.data}', this)">Remover</button></td></tr>`).join('')}</tbody></table>`
    : '<p class="vazio">Nenhum feriado cadastrado.</p>';
}

$('#f-feriado').onsubmit = async e => {
  e.preventDefault();
  const f = e.target; ocupado(f, true);
  const { error } = await sb.from('feriados').insert({ data: $('#fer-data').value, descricao: $('#fer-desc').value.trim() });
  ocupado(f, false);
  if (error) return alert(error.code === '23505' ? 'Já existe feriado nessa data.' : erroAmigavel(error));
  f.reset();
  await carregarAuxiliares();
  carregarFeriadosAdmin();
};

window.removerFeriado = async (data, btn) => {
  if (!confirm('Remover este feriado?')) return;
  carregandoBotao(btn, true, 'Removendo...');
  const { error } = await sb.from('feriados').delete().eq('data', data);
  carregandoBotao(btn, false);
  if (error) return alert(erroAmigavel(error));
  await carregarAuxiliares();
  carregarFeriadosAdmin();
};

// ===================== TROCAR SENHA =====================
$('#btn-senha').onclick = () => abrirPainel('p-senha');

$('#f-senha').onsubmit = async e => {
  e.preventDefault();
  const f = e.target; msg(f, '');
  if ($('#s-nova').value !== $('#s-nova2').value) return msg(f, 'As senhas não conferem.');
  ocupado(f, true);
  const { error } = await sb.auth.updateUser({ password: $('#s-nova').value });
  ocupado(f, false);
  if (error) return msg(f, /different from the old/i.test(error.message) ? 'A nova senha precisa ser diferente da atual.' : erroAmigavel(error));
  f.reset();
  msg(f, 'Senha alterada! Use a nova senha no próximo login.', 'ok');
};

// ===================== GO =====================
iniciar();
