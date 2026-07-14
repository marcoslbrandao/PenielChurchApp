-- "Mensagens" (blog): resumo escrito da pregação de domingo, no estilo do
-- antigo blog do site (penielchurch.org.uk/blog). Aparece em destaque na
-- Home (post mais recente) e numa aba própria dentro de Mídia com todo o
-- histórico. Público lê; só admin/líder publica.
create table if not exists public.mensagens (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  resumo text not null,
  conteudo text not null,
  imagem_url text,
  autor text not null default 'Peniel Church',
  data date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.mensagens enable row level security;

drop policy if exists "Qualquer um vê as mensagens" on public.mensagens;
create policy "Qualquer um vê as mensagens"
  on public.mensagens for select
  using (true);

drop policy if exists "Admin/líder gerencia as mensagens" on public.mensagens;
create policy "Admin/líder gerencia as mensagens"
  on public.mensagens for all
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role in ('admin', 'lider')
  ))
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role in ('admin', 'lider')
  ));

-- Bucket para a imagem de capa de cada mensagem. Público pra leitura (senão
-- a imagem não carrega no app); só admin/líder sobe/apaga.
insert into storage.buckets (id, name, public)
values ('blog', 'blog', true)
on conflict (id) do nothing;

drop policy if exists "Imagens do blog são públicas para leitura" on storage.objects;
create policy "Imagens do blog são públicas para leitura"
  on storage.objects for select
  using (bucket_id = 'blog');

drop policy if exists "Admin/líder sobe imagem do blog" on storage.objects;
create policy "Admin/líder sobe imagem do blog"
  on storage.objects for insert
  with check (
    bucket_id = 'blog' and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role in ('admin', 'lider')
    )
  );

drop policy if exists "Admin/líder atualiza imagem do blog" on storage.objects;
create policy "Admin/líder atualiza imagem do blog"
  on storage.objects for update
  using (
    bucket_id = 'blog' and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role in ('admin', 'lider')
    )
  );

drop policy if exists "Admin/líder remove imagem do blog" on storage.objects;
create policy "Admin/líder remove imagem do blog"
  on storage.objects for delete
  using (
    bucket_id = 'blog' and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role in ('admin', 'lider')
    )
  );
