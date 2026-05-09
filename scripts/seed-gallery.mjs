import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://fscmlqbjoweaqkzduqrj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const DIR = 'C:\\Users\\meeeeee\\.gemini\\antigravity\\brain\\639a47f5-fdd4-4e50-b0fc-026fa25b9000';

function findPhoto(prefix) {
  const files = fs.readdirSync(DIR).filter(f => f.startsWith(prefix) && f.endsWith('.png'));
  return files.length > 0 ? path.join(DIR, files[files.length - 1]) : null;
}

async function upload(tenantId, name) {
  const localPath = findPhoto(name);
  if (!localPath) return null;
  const storagePath = `${tenantId}/gallery/${name}.png`;
  await supabase.storage.from('client-photos').upload(storagePath, fs.readFileSync(localPath), { contentType: 'image/png', upsert: true });
  return supabase.storage.from('client-photos').getPublicUrl(storagePath).data?.publicUrl;
}

const GALLERY = [
  { beforePrefix: 'nails_before_1', afterPrefix: 'nails_after_1', serviceMatch: 'Gel Manicure', notes: 'Pink ombré with glitter — client absolutely loved it!', formula: 'OPI GelColor: Bubble Bath + Princesses Rule, Fairy Dust glitter top', satisfaction: 5, daysAgo: 3 },
  { beforePrefix: 'nails_before_2', afterPrefix: 'nails_after_2', serviceMatch: 'Nail Art', notes: 'Cherry blossom nail art for spring — hand-painted florals', formula: 'Acrylic paint florals on nude gel base (Gelish Bare & Polished)', satisfaction: 5, daysAgo: 7 },
  { beforePrefix: 'nails_before_3', afterPrefix: 'nails_after_3', serviceMatch: 'Spa Pedicure', notes: 'Full spa pedicure with hot stone massage. Coral red for summer!', formula: 'Essie: Geranium + Seche Vite top coat', satisfaction: 4, daysAgo: 5 },
  { beforePrefix: 'nails_before_4', afterPrefix: 'nails_after_4', serviceMatch: 'Chrome', notes: 'Holographic chrome transformation — mirror finish stiletto nails', formula: 'Chrome powder over black gel base, sealed with no-wipe top coat', satisfaction: 5, daysAgo: 2 },
];

async function main() {
  const { data: tenant } = await supabase.from('tenants').select('id').ilike('name', '%luxe%nail%').single();
  const T = tenant.id;

  const { data: staff } = await supabase.from('staff').select('id, name').eq('tenant_id', T);
  const { data: clients } = await supabase.from('clients').select('id, first_name').eq('tenant_id', T).limit(10);
  const { data: services } = await supabase.from('services').select('id, name').eq('tenant_id', T);

  console.log('📸 Uploading gallery photos & seeding...\n');

  for (let i = 0; i < GALLERY.length; i++) {
    const g = GALLERY[i];
    const beforeUrl = await upload(T, g.beforePrefix);
    const afterUrl = await upload(T, g.afterPrefix);
    console.log(`  📷 Pair ${i + 1}: before=${beforeUrl ? '✅' : '❌'} after=${afterUrl ? '✅' : '❌'}`);

    const svc = services.find(s => s.name.includes(g.serviceMatch)) || services[0];
    const staffMember = staff[i % staff.length];
    const client = clients[i % clients.length];
    const date = new Date(Date.now() - g.daysAgo * 86400000).toISOString().slice(0, 10);

    const { error } = await supabase.from('service_history').insert({
      tenant_id: T,
      client_id: client.id,
      staff_id: staffMember.id,
      service_id: svc.id,
      date,
      notes: g.notes,
      formula: g.formula,
      satisfaction: g.satisfaction,
      before_photo_urls: beforeUrl ? [beforeUrl] : [],
      after_photo_urls: afterUrl ? [afterUrl] : [],
      total_paid: 0,
    });

    if (error) console.error(`  ❌ Insert error:`, error.message);
    else console.log(`  ✅ ${svc.name} by ${staffMember.name} for ${client.first_name}`);
  }

  console.log('\n🎉 Gallery seeded with 4 before/after transformations!');
}

main().catch(e => { console.error('💥', e.message); process.exit(1); });
