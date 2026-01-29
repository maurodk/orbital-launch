-- Criar bucket para armazenar imagens de implantações
insert into storage.buckets (id, name, public)
values ('implantacoes', 'implantacoes', true);

-- Política para permitir uploads autenticados
create policy "Usuários autenticados podem fazer upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'implantacoes');

-- Política para permitir leitura pública
create policy "Leitura pública de imagens"
on storage.objects for select
to public
using (bucket_id = 'implantacoes');

-- Política para permitir atualização de objetos
create policy "Usuários autenticados podem atualizar"
on storage.objects for update
to authenticated
using (bucket_id = 'implantacoes');

-- Política para permitir exclusão
create policy "Usuários autenticados podem deletar"
on storage.objects for delete
to authenticated
using (bucket_id = 'implantacoes');
