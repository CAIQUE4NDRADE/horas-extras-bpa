# Horas Extras · J036 Base de Paulínia

Site para lançar hora extra, ter a aprovação do supervisor direto e imprimir a folha
"Espelho de Ponto por Exceção" no fim do período (dia 11 até o dia 10 do mês seguinte).

## Arquivos (todos soltos na raiz do repositório)
| Arquivo | O que é |
|---|---|
| `index.html` / `app.js` | Login, lançamento, minhas HEs, aprovação, resumo e equipe |
| `folha.html` / `folha.js` | Folha para imprimir (A4 paisagem), no layout da folha atual |
| `comum.js` | Funções compartilhadas (turnos, cálculo de horas, períodos) |
| `style.css` | Visual do site |
| `config.js` | URL e chave anon do Supabase (você preenche) |
| `schema.sql` | Banco de dados e regras de segurança (rodar uma vez no Supabase) |

## Como colocar no ar
1. **Supabase**: crie um projeto novo (ex.: "HORAS EXTRAS BPA").
2. **SQL Editor > New query**: cole todo o `schema.sql` e clique em **Run**.
3. **Authentication > Providers > Email**: desligue **Confirm email**.
   O login é pelo CS e, por baixo, usa um e-mail fictício (`cs338104@horasextras-bpa.com.br`)
   que não recebe confirmação.
4. **Project Settings > API**: copie a *Project URL* e a chave **anon public** para o `config.js`.
   Nunca coloque a chave `service_role` no site.
5. **GitHub**: crie um repositório, suba os arquivos na raiz e ative
   **Settings > Pages > Deploy from branch (main / root)**.
6. Entre no site, use **Primeiro acesso** para criar a sua conta e complete o cadastro.
7. Volte ao SQL Editor e transforme sua conta em admin:
   ```sql
   update public.colaboradores set papel = 'admin' where cs = 'cs338104';
   ```
8. Peça para os supervisores criarem conta. Na aba **Equipe**, mude o papel deles para `supervisor`.
   Depois, os operadores criam conta e escolhem o supervisor direto (o admin pode corrigir na aba Equipe).

Para ver a folha de exemplo sem banco, abra `folha.html?demo=1`.

## Como funciona
- O **colaborador** lança a data, o turno, o início e o fim da HE, as horas em cada coluna
  (35%, 80%, 80% noturna, 100%, 100% noturna) e a justificativa.
  O site mostra se a soma das colunas bate com o horário de início e fim.
- O **supervisor direto** vê os pendentes na aba **Aprovar** e aprova ou recusa (com motivo).
  Lançamentos em que a soma não bate aparecem com ⚠.
  Se a HE recusada for editada, ela volta para pendente.
- Na **folha**, entram as HEs aprovadas. No campo *Ass. Gestor* aparecem o nome de quem aprovou e a data.
  A opção "Incluir pendentes" mostra também as que ainda não foram aprovadas, marcadas como PENDENTE.
- O **Resumo** mostra os totais por colaborador no período e permite baixar um CSV,
  para facilitar o lançamento no sistema oficial.

## Segurança
- Cada pessoa só vê as próprias HEs. O supervisor vê só as da equipe dele, e o admin vê tudo (RLS do Supabase).
- Ninguém aprova a própria HE. A aprovação passa pela função `decidir_he`, que confere se quem aprova é o supervisor direto.
- O colaborador não consegue mudar o próprio papel nem o supervisor.
- HE aprovada não pode ser editada nem excluída pelo colaborador.

## Esqueceu a senha?
Como o e-mail é fictício, a recuperação automática não funciona. O admin redefine a senha
no SQL Editor (troque o CS e a senha temporária):
```sql
update auth.users
   set encrypted_password = extensions.crypt('Temp1234', extensions.gen_salt('bf'))
 where email = 'cs111111@horasextras-bpa.com.br';
```
