# ⏱️ Sistema de Horas Extras

Sistema web para **lançar, aprovar e fechar horas extras** em um terminal de combustíveis com operação em 3 turnos (24h). Ele substitui a folha em papel "Espelho de Ponto por Exceção" e o controle por planilha. O colaborador lança, o supervisor aprova pelo celular e a folha sai pronta para imprimir no fim do período.

![JavaScript](https://img.shields.io/badge/JavaScript-vanilla-F7DF1E?logo=javascript&logoColor=black)
![Supabase](https://img.shields.io/badge/Supabase-Auth%20%2B%20Postgres-3ECF8E?logo=supabase&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-instalável-5A0FC8)
![GitHub Pages](https://img.shields.io/badge/deploy-GitHub%20Pages-222?logo=github)

---

## 🎯 O problema

Antes do sistema, a hora extra era anotada em papel e conferida à mão no fim do mês. Esse processo tinha quatro problemas:

- **Erros de conta:** viradas de meia-noite, parte noturna (22h–5h) e percentuais diferentes (35%, 80%, 100%) eram calculados de cabeça.
- **Aprovação lenta:** a assinatura do gestor dependia de encontrar o supervisor no turno certo.
- **Sem rastreabilidade:** não dava para saber quem alterou o quê nem quando.
- **Retrabalho:** os totais eram digitados de novo no sistema oficial de ponto.

## ✅ A solução

| Perfil | O que faz |
|---|---|
| **Colaborador** | Lança data, turno, início e fim da HE. O sistema distribui as horas entre as colunas (35%, 80%, 80% noturna, 100% e 100% noturna) e avisa quando algo não bate. |
| **Supervisor** | Aprova ou recusa a HE da própria equipe, uma de cada vez ou em lote. A recusa exige motivo. |
| **Admin** | Gerencia a equipe, os feriados, o fechamento de períodos, a auditoria e o painel de indicadores. |

### Funcionalidades
- **Cálculo automático de horas:** virada de meia-noite, separação da parte noturna (22h–5h), adicional noturno fora da HE, intervalo de refeição, domingos e feriados.
- **Validações e alertas:** colunas que não fecham com o horário, HE acima de 2h no dia e HE lançada dentro do próprio turno.
- **Fluxo de aprovação:** pendente → aprovado/recusado. Se o colaborador editar uma HE recusada, ela volta para pendente.
- **Folha para impressão (A4 paisagem):** segue o layout da folha oficial, com o nome de quem aprovou e a data no campo *Ass. Gestor*.
- **Períodos de apuração** do dia 11 ao dia 10 do mês seguinte. Um período fechado não aceita alterações.
- **Painel de indicadores:** HE por dia, por turno, por cargo e por percentual, top 5 colaboradores e pendências mais antigas.
- **Auditoria completa:** toda criação, edição, aprovação, recusa e exclusão fica registrada com o antes e o depois.
- **Exportação CSV** dos totais por colaborador, para lançar no sistema oficial.
- **PWA** instalável no celular, com preferências de acessibilidade.

## 🔐 Segurança

As regras ficam **no banco**, e não só no navegador. Mesmo quem mexer no JavaScript não consegue burlar o sistema.

- **Row Level Security (RLS)** em todas as tabelas. Cada pessoa vê só as próprias HEs, o supervisor vê só a equipe dele e o admin vê tudo.
- **Aprovação via função `decidir_he` (`security definer`).** Ela confere se quem aprova é o supervisor direto e impede aprovar a própria HE.
- **Triggers de proteção.** O colaborador não consegue alterar o próprio papel, o supervisor, o CS nem o status de uma HE já aprovada.
- **Histórico gravado só por trigger.** Ninguém escreve direto na tabela de auditoria.
- **Login com Supabase Auth.** As senhas ficam com hash bcrypt e nunca em texto puro.

## 🛠️ Stack

- **Frontend:** HTML, CSS e JavaScript puro, sem framework e sem build.
- **Backend:** Supabase (PostgreSQL, Auth, RLS, funções PL/pgSQL e triggers).
- **Deploy:** GitHub Pages.
- **Testes:** suíte de casos para as funções de cálculo de horas (`testes.html`).

## 📁 Estrutura

```
index.html / app.js    → login, lançamento, aprovação, resumo, painel, equipe e auditoria
folha.html / folha.js  → folha de ponto para impressão
comum.js               → regras compartilhadas (turnos, cálculo de horas, períodos)
schema.sql             → tabelas, funções, triggers e políticas RLS
historico.sql          → auditoria automática das alterações
testes.html / testes.js→ testes automáticos dos cálculos
config.js              → URL e chave pública (anon) do Supabase
```

## 🚀 Como rodar

1. Crie um projeto no [Supabase](https://supabase.com) e rode `schema.sql` e depois `historico.sql` no SQL Editor.
2. Em **Authentication → Providers → Email**, desligue o *Confirm email*. O login é feito pelo CS, com um e-mail técnico por baixo.
3. Preencha o `config.js` com a *Project URL* e a chave **anon public**. Nunca use a `service_role` no front.
4. Publique os arquivos no GitHub Pages ou em qualquer hospedagem estática.

O passo a passo completo de implantação, incluindo a criação do primeiro admin e a recuperação de senha, está no [LEIAME.md](LEIAME.md).

---

Desenvolvido por **[Caique Andrade](https://www.linkedin.com/in/caique-andrade-588971115/)**. Projeto criado para resolver um problema real da operação, do levantamento das regras de jornada até o sistema em produção.
