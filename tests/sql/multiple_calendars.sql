BEGIN;
INSERT INTO auth.users(id,raw_user_meta_data) VALUES('a0000000-0000-4000-8000-000000000001','{"username":"multiA"}'),('b0000000-0000-4000-8000-000000000001','{"username":"multiB"}');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
SELECT public.apply_calendars_operation('c0000000-0000-4000-8000-000000000001',0,'create_calendar','{"calendar_id":"c0000000-0000-4000-8000-000000000010","name":"Praca"}');
SELECT public.apply_calendars_operation('c0000000-0000-4000-8000-000000000002',1,'create_and_assign','{"label_id":"d0000000-0000-4000-8000-000000000001","day_label_id":"e0000000-0000-4000-8000-000000000001","name":"Trening","emoji":"🌿","color":"#8AAE92","kind":"reusable","day":"2026-10-12"}');
SELECT public.apply_calendars_operation('c0000000-0000-4000-8000-000000000003',2,'create_and_assign','{"calendar_id":"c0000000-0000-4000-8000-000000000010","label_id":"d0000000-0000-4000-8000-000000000002","day_label_id":"e0000000-0000-4000-8000-000000000002","name":"Trening","emoji":"📚","color":"#FFFFFF","kind":"reusable","day":"2026-10-12"}');
DO $$ DECLARE s jsonb; BEGIN
  s:=public.get_calendars_snapshot(); IF jsonb_array_length(s->'calendars')<>2 OR jsonb_array_length(s->'labels')<>2 OR jsonb_array_length(s->'day_labels')<>2 THEN RAISE EXCEPTION 'Multiple calendars failed'; END IF;
  s:=public.get_calendar_snapshot(); IF s->>'schema_version'<>'1' OR jsonb_array_length(s->'labels')<>1 OR jsonb_array_length(s->'day_labels')<>1 THEN RAISE EXCEPTION 'Legacy client leaked other calendar'; END IF;
  BEGIN PERFORM public.apply_calendars_operation(gen_random_uuid(),3,'assign_label','{"calendar_id":"c0000000-0000-4000-8000-000000000010","label_id":"d0000000-0000-4000-8000-000000000001","day_label_id":"e0000000-0000-4000-8000-000000000003","day":"2026-10-13"}'); RAISE EXCEPTION 'Cross-calendar assignment accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'LABEL_NOT_FOUND' THEN RAISE; END IF; END;
  BEGIN PERFORM public.apply_calendars_operation(gen_random_uuid(),3,'create_calendar','{"calendar_id":"c0000000-0000-4000-8000-000000000011","name":" praca "}'); RAISE EXCEPTION 'Calendar name collision accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CALENDAR_NAME_CONFLICT' THEN RAISE; END IF; END;
  BEGIN PERFORM public.apply_calendar_operation(gen_random_uuid(),3,'delete_label','{"label_id":"d0000000-0000-4000-8000-000000000002"}'); RAISE EXCEPTION 'Legacy client changed other calendar'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'LABEL_NOT_FOUND' THEN RAISE; END IF; END;
END $$;
SELECT public.apply_calendars_operation('c0000000-0000-4000-8000-000000000004',3,'update_label','{"calendar_id":"c0000000-0000-4000-8000-000000000010","label_id":"d0000000-0000-4000-8000-000000000002","name":"Praca zespołowa","emoji":"📚","color":"#000000"}');
DO $$ BEGIN IF (SELECT name FROM public.labels WHERE id='d0000000-0000-4000-8000-000000000001')<>'Trening' THEN RAISE EXCEPTION 'Other calendar definition changed'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','b0000000-0000-4000-8000-000000000001',true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.calendars)<>1 OR (SELECT count(*) FROM public.labels)<>0 THEN RAISE EXCEPTION 'Calendar RLS leak'; END IF;
  BEGIN PERFORM public.apply_calendars_operation(gen_random_uuid(),0,'rename_calendar','{"calendar_id":"c0000000-0000-4000-8000-000000000010","name":"Stolen"}'); RAISE EXCEPTION 'Other account calendar changed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CALENDAR_NOT_FOUND' THEN RAISE; END IF; END;
  BEGIN DELETE FROM public.calendars; RAISE EXCEPTION 'Direct calendar delete allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
DO $$ DECLARE s jsonb; r jsonb; BEGIN
  s:=public.get_calendars_snapshot();
  r:=public.apply_calendars_operation('c0000000-0000-4000-8000-000000000005',4,'replace_from_backup',s);
  IF r->'requires_snapshot'<>'true'::jsonb THEN RAISE EXCEPTION 'Import did not request snapshot'; END IF;
  s:=public.get_calendars_snapshot();
  IF jsonb_array_length(s->'calendars')<>2 OR jsonb_array_length(s->'labels')<>2 OR jsonb_array_length(s->'day_labels')<>2 THEN RAISE EXCEPTION 'Import lost calendar relations'; END IF;
  IF EXISTS(SELECT 1 FROM public.calendars WHERE id='c0000000-0000-4000-8000-000000000010') THEN RAISE EXCEPTION 'Calendar UUID not remapped'; END IF;
  BEGIN PERFORM public.apply_calendars_operation(gen_random_uuid(),5,'replace_from_backup',jsonb_set(s,'{day_labels,0,calendar_id}','"c0000000-0000-4000-8000-000000000099"')); RAISE EXCEPTION 'Corrupt import accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'VALIDATION_ERROR' THEN RAISE; END IF; END;
  IF public.get_calendars_snapshot() IS DISTINCT FROM s THEN RAISE EXCEPTION 'Corrupt import partially changed data'; END IF;
  s:=public.get_calendar_snapshot();
  PERFORM public.apply_calendar_operation('c0000000-0000-4000-8000-000000000006',5,'replace_from_backup',s);
  IF (SELECT count(*) FROM public.calendars)<>2 OR (SELECT count(*) FROM public.labels)<>2 THEN RAISE EXCEPTION 'Legacy import erased additional calendar'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
