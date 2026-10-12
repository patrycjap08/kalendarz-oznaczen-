#!/usr/bin/env bash
set -euo pipefail
# Only an isolated database initialized by tests/sql/bootstrap.sql.
psql -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO auth.users(id,raw_user_meta_data) VALUES('f0000000-0000-4000-8000-000000000001','{"username":"concurrency"}');
INSERT INTO public.labels(id,user_id,calendar_id,kind,status,name,emoji,color_hex) VALUES('f0000000-0000-4000-8000-000000000002','f0000000-0000-4000-8000-000000000001',(SELECT id FROM public.calendars WHERE user_id='f0000000-0000-4000-8000-000000000001' AND is_default),'one_off','active','Race','🌿','#FFFFFF');
SQL
psql -v ON_ERROR_STOP=1 <<'SQL' &
BEGIN;
DO $$ BEGIN
  BEGIN INSERT INTO public.day_labels(id,user_id,calendar_id,day,label_id) VALUES('f0000000-0000-4000-8000-000000000003','f0000000-0000-4000-8000-000000000001',(SELECT id FROM public.calendars WHERE user_id='f0000000-0000-4000-8000-000000000001' AND is_default),'2026-10-12','f0000000-0000-4000-8000-000000000002');
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'VALIDATION_ERROR' THEN RAISE; END IF; END;
END $$;
SELECT pg_sleep(1);
COMMIT;
SQL
task_first_pid=$!
psql -v ON_ERROR_STOP=1 <<'SQL' &
DO $$ BEGIN
  BEGIN INSERT INTO public.day_labels(id,user_id,calendar_id,day,label_id) VALUES('f0000000-0000-4000-8000-000000000004','f0000000-0000-4000-8000-000000000001',(SELECT id FROM public.calendars WHERE user_id='f0000000-0000-4000-8000-000000000001' AND is_default),'2026-10-13','f0000000-0000-4000-8000-000000000002');
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'VALIDATION_ERROR' THEN RAISE; END IF; END;
END $$;
SQL
task_second_pid=$!
# Either transaction may win; the losing insert must be rejected by the trigger.
wait "$task_first_pid"
wait "$task_second_pid"
psql -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN IF (SELECT count(*) FROM public.day_labels WHERE label_id='f0000000-0000-4000-8000-000000000002') <> 1 THEN RAISE EXCEPTION 'one_off concurrency failed'; END IF; END $$;
DELETE FROM auth.users WHERE id='f0000000-0000-4000-8000-000000000001';
SQL
