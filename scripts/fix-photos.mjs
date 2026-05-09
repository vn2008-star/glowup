import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://fscmlqbjoweaqkzduqrj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const PHOTO_DIR = 'C:\\Users\\meeeeee\\.gemini\\antigravity\\brain\\639a47f5-fdd4-4e50-b0fc-026fa25b9000';

async function main() {
  const { data: tenant } = await supabase.from('tenants').select('id').ilike('name', '%luxe%nail%').single();
  const T = tenant.id;

  const updates = [
    { name: 'Jenny Kim', prefix: 'staff_jenny_kim_v2' },
    { name: 'Mai Pham', prefix: 'staff_mai_pham_v2' },
  ];

  for (const u of updates) {
    const files = fs.readdirSync(PHOTO_DIR).filter(f => f.startsWith(u.prefix) && f.endsWith('.png'));
    const localPath = path.join(PHOTO_DIR, files[files.length - 1]);
    const storagePath = `${T}/staff/${u.name.replace(/\s/g, '_').toLowerCase()}.png`;

    const file = fs.readFileSync(localPath);
    await supabase.storage.from('client-photos').upload(storagePath, file, { contentType: 'image/png', upsert: true });
    const { data } = supabase.storage.from('client-photos').getPublicUrl(storagePath);

    await supabase.from('staff').update({ photo_url: data.publicUrl }).eq('tenant_id', T).eq('name', u.name);
    console.log(`✅ ${u.name} photo updated`);
  }
}

main().catch(e => { console.error('💥', e.message); process.exit(1); });
