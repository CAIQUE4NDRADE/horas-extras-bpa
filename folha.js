// folha.html?c=<id do colaborador>&p=AAAA-MM     → folha de uma pessoa
// folha.html?todos=1&p=AAAA-MM                   → uma folha por pessoa da equipe (supervisor) ou de todos (admin)
// folha.html?demo=1                              → exemplo sem banco
const params = new URLSearchParams(location.search);
const chave = params.get('p') || periodoDaData(hojeISO());
const per = periodoDe(chave);

const modelo = document.querySelector('.folha');
const molde = modelo.outerHTML;
const container = document.createElement('div');
modelo.replaceWith(container);

let folhas = [];   // [{ colab, registros }]

const status = t => $('#status-carga').textContent = t;

async function carregar() {
  if (params.get('demo')) {
    folhas = [{ colab: { nome: 'Fulano de Tal', cs: 'cs000000', cargo: 'Operador de Terminal', supervisor: { nome: 'Supervisor Exemplo' } }, registros: demo() }];
    if (params.get('todos')) folhas.push({ colab: { nome: 'Beltrano Souza', cs: 'cs000001', cargo: 'Operador', supervisor: { nome: 'Supervisor Exemplo' } }, registros: demo().slice(1, 3) });
    return desenhar();
  }

  const { data: { session } } = await sb.auth.getSession();
  if (!session) return status('Faça login no site primeiro.');

  // 1) quem entra na impressão
  let colabs;
  if (params.get('todos')) {
    const { data: eu } = await sb.from('colaboradores').select('id, papel').eq('id', session.user.id).maybeSingle();
    let q = sb.from('colaboradores').select('id, nome, cs, cargo, supervisor_id').eq('ativo', true).order('nome');
    if (eu?.papel !== 'admin') q = q.eq('supervisor_id', session.user.id);
    const { data, error } = await q;
    if (error) return status('Erro: ' + error.message);
    colabs = data;
  } else {
    const id = params.get('c') || session.user.id;
    const { data, error } = await sb.from('colaboradores').select('id, nome, cs, cargo, supervisor_id').eq('id', id).maybeSingle();
    if (error) return status('Erro: ' + error.message);
    if (!data) return status('Sem acesso a este colaborador.');
    colabs = [data];
  }
  if (!colabs.length) return status('Nenhum colaborador vinculado a você.');

  // 2) horas extras do período
  const { data: hes, error: e2 } = await sb.from('horas_extras')
    .select('*, aprovador:colaboradores!horas_extras_aprovado_por_fkey(nome)')
    .in('colaborador_id', colabs.map(c => c.id))
    .gte('data', per.ini).lte('data', per.fim).neq('status', 'recusado');
  if (e2) return status('Erro: ' + e2.message);

  // 3) nomes dos gestores (consulta separada)
  const supIds = [...new Set(colabs.map(c => c.supervisor_id).filter(Boolean))];
  const nomesSup = {};
  if (supIds.length) {
    const { data: sups } = await sb.from('colaboradores').select('id, nome').in('id', supIds);
    (sups || []).forEach(s => nomesSup[s.id] = s.nome);
  }

  folhas = colabs.map(c => ({
    colab: { ...c, supervisor: { nome: nomesSup[c.supervisor_id] || '' } },
    registros: hes.filter(h => h.colaborador_id === c.id)
  }));
  // na impressão da equipe, só sai folha de quem tem HE no período
  if (params.get('todos')) folhas = folhas.filter(f => f.registros.length);
  desenhar();
}

function desenhar() {
  const incluirPend = $('#incluir-pend').checked;
  const totalPend = folhas.reduce((a, f) => a + f.registros.filter(r => r.status === 'pendente').length, 0);

  $('#aviso').hidden = !totalPend;
  $('#aviso').textContent = totalPend
    ? `Atenção: ${totalPend} lançamento(s) ainda pendente(s) de aprovação ${incluirPend ? '(aparecem marcados como PENDENTE)' : '(não aparecem na folha)'}.`
    : '';

  if (!folhas.length) {
    container.innerHTML = '<div class="vazio-folhas">Nenhuma hora extra lançada neste período.</div>';
    return status(rotuloPeriodo(chave));
  }

  container.innerHTML = folhas.map(() => molde).join('');
  const els = container.querySelectorAll('.folha');
  folhas.forEach((f, i) => preencher(els[i], f, incluirPend));

  status(folhas.length > 1 ? `${rotuloPeriodo(chave)} · ${folhas.length} folhas` : rotuloPeriodo(chave));
  document.title = folhas.length > 1 ? `HE equipe ${rotuloPeriodo(chave)}` : `HE ${folhas[0].colab.nome} ${rotuloPeriodo(chave)}`;
}

function preencher(el, { colab, registros }, incluirPend) {
  const campo = n => el.querySelector(`[data-f="${n}"]`);
  campo('nome').textContent = colab.nome;
  campo('cs').textContent = colab.cs.toUpperCase();
  campo('cargo').textContent = colab.cargo;
  campo('func').textContent = colab.nome;
  campo('gestor').textContent = colab.supervisor?.nome || '';
  campo('periodo').textContent = 'Período: ' + rotuloPeriodo(chave);
  campo('gerado').textContent = 'Gerado pelo sistema de Horas Extras em ' + new Date().toLocaleString('pt-BR');

  const usados = registros.filter(r => r.status === 'aprovado' || (incluirPend && r.status === 'pendente'));
  const porData = Object.fromEntries(usados.map(r => [r.data, r]));
  const tot = Object.fromEntries(COLUNAS.map(c => [c.campo, 0]));
  let html = '';
  for (let d = dataDe(per.ini); isoDe(d) <= per.fim; d.setDate(d.getDate() + 1)) {
    const iso = isoDe(d), r = porData[iso];
    const fds = d.getDay() === 0 || d.getDay() === 6;
    if (r) COLUNAS.forEach(c => tot[c.campo] += r[c.campo]);

    const jornada = r && (r.jornada_entrada || r.jornada_saida) ? `${hhmm(r.jornada_entrada)} às ${hhmm(r.jornada_saida)}` : ':&nbsp;&nbsp; às &nbsp;&nbsp;:';
    const refeicao = r && (r.refeicao_inicio || r.refeicao_fim) ? `${hhmm(r.refeicao_inicio)} às ${hhmm(r.refeicao_fim)}` : ':&nbsp;&nbsp; às &nbsp;&nbsp;:';
    let ass = '';
    if (r && r.status === 'aprovado') {
      const quando = new Date(r.aprovado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      ass = `${esc(primeiroUltimo(r.aprovador?.nome || ''))} ${quando}`;
    } else if (r) ass = '<span class="pend">PENDENTE</span>';

    html += `<tr class="${fds ? 'fds' : ''}">
      <td>${br(iso)}</td><td>${DIAS[d.getDay()]}</td>
      <td>${r ? r.turno : ''}</td>
      <td>${jornada}</td><td>${refeicao}</td>
      <td>${r ? hhmm(r.inicio) : ':'}</td><td>${r ? hhmm(r.fim) : ':'}</td>
      ${COLUNAS.map(c => `<td>${r ? fmtMin(r[c.campo]) : ''}</td>`).join('')}
      <td class="esq" title="${r ? esc(textoJust(r)) : ''}">${r ? esc(textoJust(r)) : ''}</td>
      <td class="ass">${ass}</td>
    </tr>`;
  }
  html += `<tr class="tot">
    <td colspan="7" style="text-align:right">Total:</td>
    ${COLUNAS.map(c => `<td>${fmtMin(tot[c.campo], true)}</td>`).join('')}
    <td colspan="2"></td>
  </tr>`;
  campo('linhas').innerHTML = html;
}

function textoJust(r) { return (r.almoco_corrido ? 'Almoço corrido – ' : '') + (r.justificativa || ''); }

function primeiroUltimo(nome) {
  const p = nome.trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1]}` : p[0];
}

function demo() {
  const base = { status: 'aprovado', aprovado_em: new Date().toISOString(), aprovador: { nome: 'Supervisor Exemplo' },
    min_35: 0, min_80: 0, min_80n: 0, min_100: 0, min_100n: 0 };
  const dia = n => { const d = dataDe(per.ini); d.setDate(d.getDate() + n); return isoDe(d); };
  return [
    { ...base, data: dia(2), turno: 'T1', inicio: '15:45', fim: '17:00', min_80: 75, justificativa: 'Descarga de vagões' },
    { ...base, data: dia(9), turno: 'T2', inicio: '14:30', fim: '01:30', jornada_entrada: '14:30', jornada_saida: '01:30', min_80: 60, min_35: 120, min_80n: 90, justificativa: 'Cobertura de falta' },
    { ...base, data: dia(17), turno: 'T3', inicio: '07:38', fim: '09:50', min_80n: 132, justificativa: 'Fechamento' },
    { ...base, data: dia(22), turno: 'T1', inicio: '15:45', fim: '18:00', min_80: 135, justificativa: 'Atendimento de fila', status: 'pendente', aprovador: null }
  ];
}

$('#incluir-pend').onchange = desenhar;
carregar();
