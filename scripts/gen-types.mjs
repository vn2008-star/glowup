// Generate src/lib/database.types.ts from the LIVE Supabase schema.
//
// Usage:  npm run gen:types
//
// Reads the PostgREST OpenAPI spec at {SUPABASE_URL}/rest/v1/ using the service
// role key from .env.local — no `supabase login` needed (the CLI's interactive
// auth does not work in CI/headless). Emits Row/Insert/Update for every table.
//
// This exists because the schema was historically hand-typed in src/lib/types.ts
// and drifted silently: the deployed code expected clients.sms_opt_out for
// months while the type never mentioned it. Regenerate after every migration.
import { readFileSync, writeFileSync } from 'fs';

readFileSync('.env.local', 'utf8').split(/\r?\n/).forEach(l => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
});

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const res = await fetch(URL + '/rest/v1/', { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } });
const spec = await res.json();
const defs = spec.definitions || {};

// PostgREST OpenAPI: property.format carries the Postgres type; def.required[]
// lists the NOT NULL columns.
function tsType(prop) {
  const f = (prop.format || prop.type || '').toLowerCase();
  if (prop.type === 'array' || /\[\]$/.test(f)) {
    const base = f.replace(/\[\]$/, '');
    if (/^(int|bigint|numeric|double|real|smallint)/.test(base)) return 'number[]';
    if (/^bool/.test(base)) return 'boolean[]';
    if (/json/.test(base)) return 'Json[]';
    return 'string[]';
  }
  if (/^(int|bigint|smallint|numeric|double|real|decimal|money)/.test(f)) return 'number';
  if (/^bool/.test(f)) return 'boolean';
  if (/json/.test(f)) return 'Json';
  if (/(timestamp|date|time|text|char|uuid|citext|inet|bytea|name)/.test(f)) return 'string';
  return 'string';
}

const tables = Object.entries(defs)
  .filter(([, d]) => d.properties)
  .sort(([a], [b]) => a.localeCompare(b));

let body = '';
for (const [table, def] of tables) {
  const required = new Set(def.required || []);
  const cols = Object.entries(def.properties);

  const row = cols.map(([c, p]) => `          ${c}: ${tsType(p)}${required.has(c) ? '' : ' | null'}`);
  const ins = cols.map(([c, p]) => {
    const optional = (!required.has(c) || p.default !== undefined) ? '?' : '';
    return `          ${c}${optional}: ${tsType(p)}${required.has(c) ? '' : ' | null'}`;
  });
  const upd = cols.map(([c, p]) => `          ${c}?: ${tsType(p)}${required.has(c) ? '' : ' | null'}`);

  body += `      ${table}: {\n`;
  body += `        Row: {\n${row.join('\n')}\n        }\n`;
  body += `        Insert: {\n${ins.join('\n')}\n        }\n`;
  body += `        Update: {\n${upd.join('\n')}\n        }\n`;
  body += `      }\n`;
}

const header = `// ─────────────────────────────────────────────────────────────────────────────
// GENERATED FROM THE LIVE SUPABASE SCHEMA — DO NOT EDIT BY HAND.
//
// Regenerate after any schema change:  npm run gen:types
// (scripts/gen-types.mjs). Source of truth for table shapes; keep the
// convenience types in ./types.ts in sync with it. Generated ${tables.length} tables.
// ─────────────────────────────────────────────────────────────────────────────

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
${body}    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
  }
}

// Convenience helpers:  type Client = Tables<'clients'>
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type InsertDto<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type UpdateDto<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
`;

writeFileSync('src/lib/database.types.ts', header);
console.log('wrote src/lib/database.types.ts — ' + tables.length + ' tables');
