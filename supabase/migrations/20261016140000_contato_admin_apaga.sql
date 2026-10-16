-- 16/10/2026 - Admin > Contato: a lixeira nao apagava.
-- A tabela contact_messages tinha policy de SELECT e UPDATE para o admin, mas
-- nenhuma de DELETE. Sem policy, a RLS recusa o delete EM SILENCIO (zero linhas
-- apagadas, sem erro), entao a mensagem simplesmente voltava na lista.
-- Pode rodar mais de uma vez.
drop policy if exists "Admin apaga mensagem de contato" on public.contact_messages;
create policy "Admin apaga mensagem de contato"
  on public.contact_messages for delete
  using (public.is_admin());
