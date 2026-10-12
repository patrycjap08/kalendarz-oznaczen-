// One pinned Unicode source generates both browser and PostgreSQL allowlists.
import { writeFileSync, mkdirSync } from 'node:fs';
import data from '@unicode/unicode-17.0.0/Sequence_Property/RGI_Emoji/index.mjs';
const emoji = [...new Set(data)].sort();
mkdirSync('src/domain', { recursive: true });
writeFileSync('src/domain/emoji.json', JSON.stringify(emoji));
writeFileSync('supabase/migrations/202610120002_emoji.sql', `-- Generated from @unicode/unicode-17.0.0 2.0.7. Do not edit manually.\nINSERT INTO private.supported_emoji (emoji) VALUES\n${emoji.map(e => `('${e.replaceAll("'", "''")}')`).join(',\n')}\nON CONFLICT DO NOTHING;\n`);
console.log(`Generated ${emoji.length} Unicode 17 emoji sequences.`);
