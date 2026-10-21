// folha.html?c=<id do colaborador>&p=AAAA-MM   (ou ?demo=1 para ver um exemplo sem banco)
const params = new URLSearchParams(location.search);
let colab = null, registros = [];

async function carregar() {
  const chave = params.get('p') || periodoDaData(hojeISO());
  const per = periodoDe(chave);

  if (params.get('demo')) {
    colab = { nome: 'Fulano de Tal', cs: 'cs000000', cargo: 'Operador de Terminal', supervisor: { nome: 'Supervisor Exemplo' } };
    registros = demo(per);
  } else {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { $('#status-carga').textContent = 'Faça login no site primeiro.'; return; }
    const id = params.get('c') || session.user.id;
    const [{ data: c, error: e1 }, { data: hes, error: e2 }] = await Promise.all([
      sb.from('colaboradores').select('nome, cs, cargo, supervisor:colaboradores!colaboradores_supervisor_id_fkey(nome)').eq('id', id).maybeSingle(),
      sb.from('horas_extras')
        .select('*, aprovador:colaboradores!horas_extras_aprovado_por_fkey(nome)')
        .eq('colaborador_id', id).gte('data', per.ini).lte('data', per.fim).neq('status', 'recusado')
    ]);
    if (e1 || e2 || !c) { $('#status-carga').textContent = 'Sem acesso a este colaborador.'; return; }
    colab = c; registros = hes;
  }

  $('#f-nome').textContent = colab.nome;
  $('#f-cs').textContent = colab.cs.toUpperCase();
  $('#f-cargo').textContent = colab.cargo;
  $('#a-func').textContent = colab.nome;
  $('#a-gestor').textContent = colab.supervisor?.nome || '';
  $('#f-periodo').textContent = 'Período: ' + rotuloPeriodo(chave);
  document.title = `HE ${colab.nome} ${rotuloPeriodo(chave)}`;
  $('#status-carga').textContent = rotuloPeriodo(chave);
  $('#gerado').textContent = 'Gerado pelo sistema de Horas Extras em ' + new Date().toLocaleString('pt-BR');
  desenhar(per);
}

function desenhar(per) {
  const incluirPend = $('#incluir-pend').checked;
  const usados = registros.filter(r => r.status === 'aprovado' || (incluirPend && r.status === 'pendente'));
  const porData = Object.fromEntries(usados.map(r => [r.data, r]));
  const pend = registros.filter(r => r.status === 'pendente').length;

  $('#aviso').hidden = !pend;
  $('#aviso').textContent = pend
    ? `Atenção: ${pend} lançamento(s) ainda pendente(s) de aprovação ${incluirPend ? '(aparecem marcados como PENDENTE)' : '(não aparecem na folha)'}.`
    : '';

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
      <td class="esq" title="${r ? esc(r.justificativa) : ''}">${r ? esc(r.justificativa) : ''}</td>
      <td class="ass">${ass}</td>
    </tr>`;
  }
  html += `<tr class="tot">
    <td colspan="7" style="text-align:right">Total:</td>
    ${COLUNAS.map(c => `<td>${fmtMin(tot[c.campo], true)}</td>`).join('')}
    <td colspan="2"></td>
  </tr>`;
  $('#linhas').innerHTML = html;
}

function primeiroUltimo(nome) {
  const p = nome.trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1]}` : p[0];
}

function demo(per) {
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

$('#incluir-pend').onchange = () => desenhar(periodoDe(params.get('p') || periodoDaData(hojeISO())));
carregar();
