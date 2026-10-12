BEGIN;
INSERT INTO auth.users(id,raw_user_meta_data,email) VALUES
 ('00000000-0000-4000-8000-000000000001','{"username":"kontoA"}','a@example.com'),
 ('00000000-0000-4000-8000-000000000002','{"username":"kontoB"}','b@example.com');
DO $$ BEGIN
  BEGIN INSERT INTO auth.users(id,raw_user_meta_data,email) VALUES('00000000-0000-4000-8000-000000000003','{"username":"KONTOA"}','c@example.com'); RAISE EXCEPTION 'Duplicate username was accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
  IF EXISTS(SELECT 1 FROM auth.users WHERE id='00000000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'Atomic signup rollback failed'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
SELECT public.apply_calendar_operation('10000000-0000-4000-8000-000000000001',0,'create_label','{"label_id":"20000000-0000-4000-8000-000000000001","name":"Trening","emoji":"🌿","color":"#8AAE92"}');
-- Same ID and payload returns success even with a stale expected revision.
SELECT public.apply_calendar_operation('10000000-0000-4000-8000-000000000001',0,'create_label','{"label_id":"20000000-0000-4000-8000-000000000001","name":"Trening","emoji":"🌿","color":"#8AAE92"}');
DO $$ DECLARE s jsonb; BEGIN
  s := public.get_calendar_snapshot();
  IF s->>'revision' <> '1' OR jsonb_array_length(s->'labels') <> 1 THEN RAISE EXCEPTION 'Idempotency failed'; END IF;
  BEGIN PERFORM public.apply_calendar_operation('10000000-0000-4000-8000-000000000001',1,'create_label','{"label_id":"20000000-0000-4000-8000-000000000001","name":"Other","emoji":"🌿","color":"#8AAE92"}'); RAISE EXCEPTION 'ID payload change accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'VALIDATION_ERROR' THEN RAISE; END IF; END;
  BEGIN PERFORM public.apply_calendar_operation('10000000-0000-4000-8000-000000000099',0,'update_label','{"label_id":"20000000-0000-4000-8000-000000000001","name":"Other","emoji":"🌿","color":"#8AAE92"}'); RAISE EXCEPTION 'Revision conflict accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'REVISION_CONFLICT' THEN RAISE; END IF; END;
  BEGIN INSERT INTO public.labels(id,user_id,kind,status,name,emoji,color_hex) VALUES(gen_random_uuid(),'00000000-0000-4000-8000-000000000001','reusable','active','Bypass','🌿','#000000'); RAISE EXCEPTION 'Direct write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT public.apply_calendar_operation('10000000-0000-4000-8000-000000000002',1,'assign_label','{"label_id":"20000000-0000-4000-8000-000000000001","day_label_id":"30000000-0000-4000-8000-000000000001","day":"2026-10-12"}');
SELECT public.apply_calendar_operation('10000000-0000-4000-8000-000000000003',2,'assign_label','{"label_id":"20000000-0000-4000-8000-000000000001","day_label_id":"30000000-0000-4000-8000-000000000002","day":"2026-10-12"}');
DO $$ BEGIN IF (SELECT count(*) FROM public.day_labels) <> 1 THEN RAISE EXCEPTION 'Duplicate assignment accepted'; END IF; END $$;
SELECT public.apply_calendar_operation('10000000-0000-4000-8000-000000000004',3,'set_label_status','{"label_id":"20000000-0000-4000-8000-000000000001","status":"archived"}');
DO $$ BEGIN
  BEGIN PERFORM public.apply_calendar_operation('10000000-0000-4000-8000-000000000005',4,'assign_label','{"label_id":"20000000-0000-4000-8000-000000000001","day_label_id":"30000000-0000-4000-8000-000000000003","day":"2026-10-13"}'); RAISE EXCEPTION 'Archived assignment accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'LABEL_ARCHIVED' THEN RAISE; END IF; END;
  BEGIN PERFORM public.apply_calendar_operation('10000000-0000-4000-8000-000000000006',4,'create_and_assign','{"label_id":"20000000-0000-4000-8000-000000000002","day_label_id":"30000000-0000-4000-8000-000000000004","name":"Broken","emoji":"🌿","color":"#8AAE92","kind":"one_off","day":"2101-01-01"}'); RAISE EXCEPTION 'Invalid date accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'VALIDATION_ERROR' THEN RAISE; END IF; END;
  IF EXISTS(SELECT 1 FROM public.labels WHERE name='Broken') THEN RAISE EXCEPTION 'Orphaned definition after rollback'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.labels) <> 0 THEN RAISE EXCEPTION 'RLS leaked labels'; END IF;
  IF (SELECT count(*) FROM public.profiles) <> 1 THEN RAISE EXCEPTION 'RLS leaked username index'; END IF;
  BEGIN PERFORM public.apply_calendar_operation(gen_random_uuid(),0,'delete_label','{"label_id":"20000000-0000-4000-8000-000000000001"}'); RAISE EXCEPTION 'Cross-account delete accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'LABEL_NOT_FOUND' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
SELECT public.apply_calendar_operation('10000000-0000-4000-8000-000000000007',4,'delete_label','{"label_id":"20000000-0000-4000-8000-000000000001"}');
DO $$ BEGIN IF (SELECT count(*) FROM public.labels) <> 0 OR (SELECT count(*) FROM public.day_labels) <> 0 THEN RAISE EXCEPTION 'Global delete did not cascade'; END IF; END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM * FROM public.labels; RAISE EXCEPTION 'Anonymous read accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.get_calendar_snapshot(); RAISE EXCEPTION 'Anonymous RPC accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DELETE FROM auth.users WHERE id='00000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
DO $$ BEGIN
  BEGIN PERFORM public.get_calendar_snapshot(); RAISE EXCEPTION 'Deleted user token accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'AUTH_REQUIRED' THEN RAISE; END IF; END;
END $$;
ROLLBACK;
