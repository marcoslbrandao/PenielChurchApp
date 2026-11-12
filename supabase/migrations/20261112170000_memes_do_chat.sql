-- ============================================================================
-- Memes / figurinhas salvos no chat (pedido do Marcos, 11/11/2026)
--
-- • Cada pessoa salva os seus (da galeria ou de uma foto do chat: segurar a
--   mensagem › "Salvar como meme"). Só ela vê os dela.
-- • O admin monta o pacote da igreja ("Da igreja"), que todo mundo vê.
-- • Enviar um meme = mandar a imagem no chat, como uma foto (o chat não
--   muda nada: moderação, denúncia e apagar continuam iguais).
-- • Bucket privado `memes`: pasta `<user_id>/...` (pessoal) e `igreja/...`.
--   Fica privado porque um meme pode vir de uma foto do chat.
--
-- Pode rodar de novo.
-- ============================================================================

create table if not exists public.memes (
  id          uuid primary key default gen_random_uuid(),
  dono        uuid references public.profiles(id) on delete cascade,  -- null = pacote da igreja
  path        text not null unique,
  largura     integer,
  altura      integer,
  created_at  timestamptz not null default now()
);
create index if not exists memes_dono_idx on public.memes (dono, created_at desc);
alter table public.memes enable row level security;

drop policy if exists "memes: vejo os meus e os da igreja" on public.memes;
create policy "memes: vejo os meus e os da igreja" on public.memes for select
  using (auth.uid() is not null and (dono = auth.uid() or dono is null));
drop policy if exists "memes: salvo os meus; admin salva os da igreja" on public.memes;
create policy "memes: salvo os meus; admin salva os da igreja" on public.memes for insert
  with check ((dono = auth.uid() and path like auth.uid()::text || '/%')
              or (dono is null and public.is_admin() and path like 'igreja/%'));
drop policy if exists "memes: apago os meus; admin apaga os da igreja" on public.memes;
create policy "memes: apago os meus; admin apaga os da igreja" on public.memes for delete
  using (dono = auth.uid() or (dono is null and public.is_admin()));
grant select, insert, delete on public.memes to authenticated;

-- Teto de 300 memes por pessoa (o pacote da igreja não tem teto).
create or replace function public.memes_limite()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.dono is not null and (select count(*) from public.memes where dono = new.dono) >= 300 then
    raise exception 'limite_memes';
  end if;
  return new;
end $$;
drop trigger if exists memes_limite on public.memes;
create trigger memes_limite before insert on public.memes for each row execute function public.memes_limite();

-- O arquivo é apagado pelo app (Storage API) antes do registro: o Supabase
-- não deixa apagar direto em storage.objects por SQL.
drop trigger if exists memes_apaga_arquivo on public.memes;
drop function if exists public.memes_apaga_arquivo();

-- ─── Storage ──────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('memes', 'memes', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists "memes: ler os meus e os da igreja" on storage.objects;
create policy "memes: ler os meus e os da igreja" on storage.objects for select to authenticated
  using (bucket_id = 'memes' and ((storage.foldername(name))[1] = auth.uid()::text or (storage.foldername(name))[1] = 'igreja'));
drop policy if exists "memes: enviar os meus; admin os da igreja" on storage.objects;
create policy "memes: enviar os meus; admin os da igreja" on storage.objects for insert to authenticated
  with check (bucket_id = 'memes' and ((storage.foldername(name))[1] = auth.uid()::text
              or ((storage.foldername(name))[1] = 'igreja' and public.is_admin())));
drop policy if exists "memes: apagar os meus; admin os da igreja" on storage.objects;
create policy "memes: apagar os meus; admin os da igreja" on storage.objects for delete to authenticated
  using (bucket_id = 'memes' and ((storage.foldername(name))[1] = auth.uid()::text
         or ((storage.foldername(name))[1] = 'igreja' and public.is_admin())));
