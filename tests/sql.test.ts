import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
it('PostgreSQL: izolacja kont, transakcje, idempotencja, archiwizacja i usuwanie', async () => {
  const db = new PGlite();
  try {
    for (const path of ['tests/sql/bootstrap.sql', 'supabase/migrations/202610120001_schema.sql', 'supabase/migrations/202610120002_emoji.sql', 'supabase/migrations/202610120003_multiple_calendars.sql', 'tests/sql/acceptance.sql', 'tests/sql/multiple_calendars.sql']) {
      const sql = await readFile(path, 'utf8'); await db.exec(sql);
    }
    expect((await db.query('SELECT count(*)::integer AS count FROM public.profiles')).rows).toEqual([{ count: 0 }]);
  } finally { await db.close(); }
});
it('migracja zachowuje istniejące dane i idempotencję starego klienta', async () => {
  const db = new PGlite();
  try {
    for (const path of ['tests/sql/bootstrap.sql', 'supabase/migrations/202610120001_schema.sql', 'supabase/migrations/202610120002_emoji.sql']) await db.exec(await readFile(path, 'utf8'));
    await db.exec(`INSERT INTO auth.users(id,raw_user_meta_data) VALUES('a0000000-0000-4000-8000-000000000001','{"username":"beforeMigration"}'); SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',false); SELECT public.apply_calendar_operation('c0000000-0000-4000-8000-000000000001',0,'create_label','{"label_id":"d0000000-0000-4000-8000-000000000001","name":"Historia","emoji":"🌿","color":"#8AAE92"}'); RESET ROLE;`);
    await db.exec(await readFile('supabase/migrations/202610120003_multiple_calendars.sql', 'utf8'));
    await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',false);`);
    const snapshot = (await db.query<{ s: { labels: { id: string; calendar_id: string }[]; calendars: { id: string }[]; revision: string } }>('SELECT public.get_calendars_snapshot() AS s')).rows[0].s;
    expect(snapshot.labels[0].id).toBe('d0000000-0000-4000-8000-000000000001'); expect(snapshot.labels[0].calendar_id).toBe(snapshot.calendars[0].id); expect(snapshot.revision).toBe('1');
    const response = (await db.query<{ r: { schema_version: number; requires_snapshot: boolean } }>(`SELECT public.apply_calendars_operation('c0000000-0000-4000-8000-000000000001',0,'create_label','{"label_id":"d0000000-0000-4000-8000-000000000001","name":"Historia","emoji":"🌿","color":"#8AAE92"}') AS r`)).rows[0].r;
    expect(response.schema_version).toBe(2); expect(response.requires_snapshot).toBe(true);
    expect((await db.query<{ count: number }>('SELECT count(*)::integer AS count FROM public.labels')).rows[0].count).toBe(1);
  } finally { await db.close(); }
});
