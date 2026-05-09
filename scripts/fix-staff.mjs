/**
 * Fix: Remove duplicate staff, fix photo URLs
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fscmlqbjoweaqkzduqrj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_KEY env var'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  // Get tenant
  const { data: tenant } = await supabase.from('tenants').select('id').ilike('name', '%luxe%nail%').single();
  if (!tenant) { console.error('No tenant'); return; }
  const T = tenant.id;
  console.log('Tenant:', T);

  // 1. Find all staff
  const { data: allStaff } = await supabase.from('staff').select('id, name, role, user_id, photo_url').eq('tenant_id', T);
  console.log('\nAll staff:');
  allStaff.forEach(s => console.log(`  ${s.name} | ${s.role} | user_id: ${s.user_id || 'null'} | photo: ${s.photo_url ? 'YES' : 'NO'}`));

  // 2. Find the real owner (has user_id) and the duplicate (no user_id, same name)
  const realOwner = allStaff.find(s => s.user_id && s.role === 'owner');
  const dupeOwner = allStaff.find(s => !s.user_id && s.name === 'Lisa Nguyen');
  
  if (realOwner && dupeOwner) {
    console.log(`\n🔧 Found duplicate. Real owner: ${realOwner.id}, Dupe: ${dupeOwner.id}`);
    
    // Copy photo from dupe to real owner, and update real owner's details
    const { error: updateErr } = await supabase.from('staff').update({
      name: 'Lisa Nguyen',
      email: 'lisa@luxenails.com',
      phone: '(916) 555-0101',
      specialties: ['Gel Extensions', 'Nail Art', 'Spa Pedicure'],
      photo_url: dupeOwner.photo_url,
      schedule: {
        Monday: { start: '09:00', end: '19:00' },
        Tuesday: { start: '09:00', end: '19:00' },
        Wednesday: { start: '09:00', end: '19:00' },
        Thursday: { start: '09:00', end: '19:00' },
        Friday: { start: '09:00', end: '19:00' },
        Saturday: { start: '10:00', end: '18:00' },
        Sunday: { start: '10:00', end: '16:00' },
      },
    }).eq('id', realOwner.id);
    
    if (updateErr) console.error('  ❌ Update error:', updateErr.message);
    else console.log('  ✅ Updated real owner with demo details');

    // Reassign dupe's appointments to real owner
    const { error: reassignErr } = await supabase.from('appointments')
      .update({ staff_id: realOwner.id })
      .eq('staff_id', dupeOwner.id);
    if (!reassignErr) console.log('  ✅ Reassigned appointments');

    // Reassign service history
    await supabase.from('service_history').update({ staff_id: realOwner.id }).eq('staff_id', dupeOwner.id);

    // Delete the duplicate
    const { error: delErr } = await supabase.from('staff').delete().eq('id', dupeOwner.id);
    if (!delErr) console.log('  ✅ Deleted duplicate');
  } else {
    console.log('\nNo duplicate found (or no real owner with user_id)');
  }

  // 3. Check photo URLs
  console.log('\n📸 Checking photos...');
  const { data: staff } = await supabase.from('staff').select('id, name, photo_url').eq('tenant_id', T);
  for (const s of staff) {
    if (s.photo_url) {
      // Test if URL is accessible
      try {
        const resp = await fetch(s.photo_url, { method: 'HEAD' });
        console.log(`  ${s.name}: ${resp.status} ${resp.ok ? '✅' : '❌'} — ${s.photo_url.substring(0, 80)}...`);
      } catch (e) {
        console.log(`  ${s.name}: FETCH ERROR — ${s.photo_url.substring(0, 80)}...`);
      }
    } else {
      console.log(`  ${s.name}: no photo_url`);
    }
  }

  // 4. Check if bucket is public
  console.log('\n🪣 Checking bucket...');
  const { data: buckets } = await supabase.storage.listBuckets();
  const clientPhotoBucket = buckets?.find(b => b.id === 'client-photos');
  if (clientPhotoBucket) {
    console.log(`  client-photos bucket: public=${clientPhotoBucket.public}`);
    if (!clientPhotoBucket.public) {
      console.log('  ⚠ Bucket is private! Making it public...');
      const { error: bucketErr } = await supabase.storage.updateBucket('client-photos', { public: true });
      if (bucketErr) console.error('  ❌', bucketErr.message);
      else console.log('  ✅ Bucket now public');
    }
  }

  // Final state
  console.log('\n📋 Final staff:');
  const { data: finalStaff } = await supabase.from('staff').select('id, name, role, user_id, photo_url').eq('tenant_id', T);
  finalStaff.forEach(s => console.log(`  ${s.name} (${s.role}) | user: ${s.user_id ? '✅' : '—'} | photo: ${s.photo_url ? '✅' : '—'}`));
  console.log(`\n  Total: ${finalStaff.length} staff`);
}

main().catch(e => { console.error('💥', e.message); process.exit(1); });
