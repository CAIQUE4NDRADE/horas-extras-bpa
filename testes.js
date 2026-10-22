// Testes automáticos dos cálculos (usados por testes.html)
// Cada caso: [descrição, valor calculado, valor esperado]
function casosDeTeste() {
  const p10 = periodoDe('2026-10'), p12 = periodoDe('2026-12');
  return [
    ['Exemplos da folha Raízen', null, null],
    ['T1: HE 15:45 às 17:00 = 01:15', fmtMin(duracao('15:45', '17:00')), '01:15'],
    ['T3: HE 07:38 às 09:50 = 02:12', fmtMin(duracao('07:38', '09:50')), '02:12'],
    ['T3: jornada 23:50 às 07:38 = 07:48 (adicional noturno)', fmtMin(duracao('23:50', '07:38')), '07:48'],
    ['T2: 14:30 às 01:30 = 11:00', fmtMin(duracao('14:30', '01:30')), '11:00'],

    ['Virada de meia-noite', null, null],
    ['23:00 às 01:00 = 02:00', fmtMin(duracao('23:00', '01:00')), '02:00'],
    ['00:00 às 01:30 = 01:30', fmtMin(duracao('00:00', '01:30')), '01:30'],
    ['Início igual ao fim = 0', duracao('08:00', '08:00'), 0],
    ['Horário vazio = 0', duracao('', '17:00'), 0],

    ['Parte noturna (22h às 5h)', null, null],
    ['21:00 às 23:30 → 01:30 noturna', fmtMin(minutosNoturnos('21:00', '23:30')), '01:30'],
    ['14:30 às 01:30 → 03:30 noturna', fmtMin(minutosNoturnos('14:30', '01:30')), '03:30'],
    ['23:50 às 07:38 → 05:10 noturna', fmtMin(minutosNoturnos('23:50', '07:38')), '05:10'],
    ['07:38 às 09:50 → nada noturno', minutosNoturnos('07:38', '09:50'), 0],
    ['04:00 às 06:00 → 01:00 noturna', fmtMin(minutosNoturnos('04:00', '06:00')), '01:00'],

    ['HE dentro do turno', null, null],
    ['T1, 10:00 às 12:00 → 02:00 dentro do turno', fmtMin(minutosDentroDoTurno('10:00', '12:00', 'T1')), '02:00'],
    ['T1, 15:45 às 17:00 → fora do turno', minutosDentroDoTurno('15:45', '17:00', 'T1'), 0],
    ['T1, almoço 11:30 às 12:30 → 01:00 dentro', fmtMin(minutosDentroDoTurno('11:30', '12:30', 'T1')), '01:00'],
    ['T3, 07:38 às 09:50 → fora do turno', minutosDentroDoTurno('07:38', '09:50', 'T3'), 0],
    ['T4, 20:00 às 21:00 → fora do turno', minutosDentroDoTurno('20:00', '21:00', 'T4'), 0],
    ['T2, 23:00 às 00:30 → 01:00 dentro (turno vai até 00:00)', fmtMin(minutosDentroDoTurno('23:00', '00:30', 'T2')), '01:00'],

    ['Período de fechamento (dia 11 ao dia 10)', null, null],
    ['Período 2026-10 começa 11/10/2026', br(p10.ini), '11/10/2026'],
    ['Período 2026-10 termina 10/11/2026', br(p10.fim), '10/11/2026'],
    ['Período 2026-12 termina 10/01/2027 (virada de ano)', br(p12.fim), '10/01/2027'],
    ['10/11/2026 pertence ao período 2026-10', periodoDaData('2026-11-10'), '2026-10'],
    ['11/11/2026 pertence ao período 2026-11', periodoDaData('2026-11-11'), '2026-11'],
    ['05/01/2027 pertence ao período 2026-12', periodoDaData('2027-01-05'), '2026-12'],

    ['Totais: adicional noturno separado da HE', null, null],
    ['80% noturna 02:12 + adicional 07:48 → HE = 02:12', fmtMin(somaColunas({ min_35: 468, min_80n: 132 })), '02:12'],
    ['Adicional noturno = 07:48', fmtMin(adicionalNoturno({ min_35: 468, min_80n: 132 })), '07:48'],
    ['80% 01:00 + 80% noturna 01:30 = 02:30 de HE', fmtMin(somaColunas({ min_80: 60, min_80n: 90 })), '02:30'],

    ['Adicional noturno pela jornada', null, null],
    ['T2 (15:30 às 00:00) → 02:00 (22h às 00h)', fmtMin(adicionalDaJornada('T2')), '02:00'],
    ['T3 (23:50 às 07:38) → 07:48 (jornada inteira)', fmtMin(adicionalDaJornada('T3')), '07:48'],
    ['T1 (07:15 às 15:45) → sem adicional', adicionalDaJornada('T1'), 0],
    ['Exceção 20:00 às 02:00 → 04:00 (22h às 02h)', fmtMin(adicionalDaJornada('EX', '20:00', '02:00')), '04:00'],
    ['Exceção sem horário → 0', adicionalDaJornada('EX'), 0],
    ['HE 06:00 às 08:00 em exceção 22:00–06:00 → fora da jornada', minutosDentroDoTurno('06:00', '08:00', 'EX', '22:00', '06:00'), 0],

    ['Horário de refeição descontado', null, null],
    ['HE 08:00 às 20:00 com refeição 12:00 às 13:00 → 11:00', fmtMin(totalHE('08:00', '20:00', '12:00', '13:00')), '11:00'],
    ['HE 16:00 às 18:00 com refeição 12:00 às 13:00 (fora da HE) → 02:00', fmtMin(totalHE('16:00', '18:00', '12:00', '13:00')), '02:00'],
    ['HE sem refeição informada → não desconta', fmtMin(totalHE('08:00', '10:00')), '02:00'],
    ['HE 20:00 às 04:00 com refeição 00:00 às 01:00 → noturna 05:00', fmtMin(noturnoHE('20:00', '04:00', '00:00', '01:00')), '05:00'],
    ['T3 com refeição 03:00 às 04:00 → adicional 06:48', fmtMin(adicionalDaJornada('T3', '', '', '03:00', '04:00')), '06:48'],
    ['T2 com refeição 23:00 às 23:30 → adicional 01:30', fmtMin(adicionalDaJornada('T2', '', '', '23:00', '23:30')), '01:30'],
    ['T2 com refeição 19:00 às 20:00 (antes das 22h) → adicional 02:00', fmtMin(adicionalDaJornada('T2', '', '', '19:00', '20:00')), '02:00'],

    ['Conversões e cadastro', null, null],
    ['"01:15" = 75 minutos', toMin('01:15'), 75],
    ['"1:5" é inválido', isNaN(toMin('1:5')), true],
    ['75 minutos = "01:15"', fmtMin(75), '01:15'],
    ['CS "338104" vira "cs338104"', normCS('338104'), 'cs338104'],
    ['CS "CS-458172" vira "cs458172"', normCS('CS-458172'), 'cs458172'],
    ['CS "cs12" é inválido', CS_VALIDO.test(normCS('cs12')), false],
    ['CS "teste" é inválido', CS_VALIDO.test(normCS('teste')), false],
    ['OPERADOR 2 entra no grupo OPERADOR', grupoCargo('OPERADOR 2'), 'OPERADOR'],
    ['Cargo antigo vai para OUTROS', grupoCargo('teste'), 'OUTROS'],
    ['18/10/2026 é domingo', diaSemana('2026-10-18'), 'Dom']
  ];
}

function rodarTestes() {
  let ok = 0, falhas = 0;
  const linhas = casosDeTeste().map(([desc, calc, esp]) => {
    if (calc === null && esp === null) return { titulo: desc };
    const passou = JSON.stringify(calc) === JSON.stringify(esp);
    passou ? ok++ : falhas++;
    return { desc, calc, esp, passou };
  });
  return { ok, falhas, linhas };
}
if (typeof module !== 'undefined') module.exports = { rodarTestes };
