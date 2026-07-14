-- Bucket de fotos de perfil. Guardamos cada foto como
-- avatars/{user_id}/avatar.jpg — a política usa a primeira pasta do caminho
-- pra garantir que cada usuário só mexe na própria foto. O bucket é público
-- pra leitura (senão a foto não carrega no <Image>), mas só o dono sobe/apaga.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Avatares são públicos para leitura" on storage.objects;
create policy "Avatares são públicos para leitura"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Usuário sobe seu próprio avatar" on storage.objects;
create policy "Usuário sobe seu próprio avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Usuário atualiza seu próprio avatar" on storage.objects;
create policy "Usuário atualiza seu próprio avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Usuário remove seu próprio avatar" on storage.objects;
create policy "Usuário remove seu próprio avatar"
  on storage.objects for delete
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
