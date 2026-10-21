-- Opcional, só no Supabase/Postgres completo: impede conflito de horário no próprio banco.
create extension if not exists btree_gist;
alter table agendamento add constraint agendamento_sem_conflito
  exclude using gist (profissional_id with =, tstzrange(inicio, fim) with &&)
  where (status in ('pendente_pagamento','confirmado','concluido'));
