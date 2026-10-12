import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
it('PostgreSQL: izolacja kont, transakcje, idempotencja, archiwizacja i usuwanie', async () => {
  const db = new PGlite();
  try {
    for (const path of ['tests/sql/bootstrap.sql', 'supabase/migrations/202610120001_schema.sql', 'supabase/migrations/202610120002_emoji.sql', 'tests/sql/acceptance.sql']) {
      const sql = await readFile(path, 'utf8'); await db.exec(sql);
    }
    expect((await db.query('SELECT count(*)::integer AS count FROM public.profiles')).rows).toEqual([{ count: 0 }]);
  } finally { await db.close(); }
});
