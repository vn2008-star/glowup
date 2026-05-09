/**
 * GlowUp Full Demo Seeder — seeds ALL app features for Luxe Nails & Spa
 * Usage: node scripts/seed-demo.mjs
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import {
  PHOTO_DIR, STAFF, SERVICES, CLIENT_NAMES, CLIENT_PHOTO_MAP,
  CAMPAIGNS, PACKAGES, GIFT_CARDS, FEEDBACK, SOCIAL_POSTS,
  CONVERSATIONS_TEMPLATE, TENANT_SETTINGS
} from './seed-data.mjs';

const SUPABASE_URL = 'https://fscmlqbjoweaqkzduqrj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_KEY env var'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function findPhoto(prefix) {
  try {
    const files = fs.readdirSync(PHOTO_DIR).filter(f => f.startsWith(prefix) && f.endsWith('.png'));
    return files.length > 0 ? path.join(PHOTO_DIR, files[files.length - 1]) : null;
  } catch { return null; }
}

async function uploadPhoto(tenantId, name, localPath) {
  if (!localPath || !fs.existsSync(localPath)) return null;
  const storagePath = `${tenantId}/staff/${name}.png`;
  const file = fs.readFileSync(localPath);
  const { error } = await supabase.storage.from('client-photos').upload(storagePath, file, { contentType: 'image/png', upsert: true });
  if (error) { console.warn(`  ⚠ Upload failed ${name}:`, error.message); return null; }
  return supabase.storage.from('client-photos').getPublicUrl(storagePath).data?.publicUrl || null;
}

function randomPhone() {
  const a = ['916','530','209','415','408'][Math.floor(Math.random()*5)];
  return `(${a}) ${Math.floor(Math.random()*900+100)}-${Math.floor(Math.random()*9000+1000)}`;
}
function randomDate(sy, ey) {
  const y = sy+Math.floor(Math.random()*(ey-sy+1));
  const m = Math.floor(Math.random()*12)+1;
  const d = Math.floor(Math.random()*28)+1;
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

async function main() {
  console.log('🌟 GlowUp Full Demo Seeder\n');

  // 1. Find tenant
  let { data: tenant } = await supabase.from('tenants').select('id,name').ilike('name','%luxe%nail%').single();
  if (!tenant) {
    const { data: all } = await supabase.from('tenants').select('id,name').order('created_at').limit(1);
    tenant = all?.[0];
  }
  if (!tenant) { console.error('No tenant found'); return; }
  console.log(`✅ Tenant: ${tenant.name} (${tenant.id})\n`);
  const T = tenant.id;

  // 2. Clean
  console.log('🧹 Cleaning...');
  const tables = ['appointment_charges','service_history','appointments','messages','conversations',
    'social_posts','campaigns','packages','gift_cards','feedback','waitlist','clients','services'];
  for (const tbl of tables) {
    try { await supabase.from(tbl).delete().eq('tenant_id', T); } catch {}
  }
  await supabase.from('staff').delete().eq('tenant_id', T).is('user_id', null);
  console.log('  ✓ Done\n');

  // 3. Staff
  console.log('👥 Staff...');
  const staffIds = [];
  const staffSchedule = {
    Monday: {start:'09:00',end:'19:00'}, Tuesday: {start:'09:00',end:'19:00'},
    Wednesday: {start:'09:00',end:'19:00'}, Thursday: {start:'09:00',end:'19:00'},
    Friday: {start:'09:00',end:'19:00'}, Saturday: {start:'10:00',end:'18:00'},
    Sunday: null,
  };
  for (const s of STAFF) {
    const photoPath = findPhoto(s.photoPrefix);
    const photoUrl = await uploadPhoto(T, s.name.replace(/\s/g,'_').toLowerCase(), photoPath);
    const sched = s.role === 'owner' ? {...staffSchedule, Sunday: {start:'10:00',end:'16:00'}} : staffSchedule;
    const { data, error } = await supabase.from('staff').insert({
      tenant_id: T, name: s.name, role: s.role, email: s.email, phone: s.phone,
      specialties: s.specialties, commission_rate: s.commission_rate,
      is_active: true, photo_url: photoUrl, schedule: sched,
    }).select('id').single();
    if (error) { console.error(`  ❌ ${s.name}:`, error.message); continue; }
    staffIds.push(data.id);
    console.log(`  ✅ ${s.role}: ${s.name} ${photoUrl ? '📸' : ''}`);
  }

  // 4. Services
  console.log('\n💅 Services...');
  const { data: svcData, error: svcErr } = await supabase.from('services')
    .insert(SERVICES.map(s => ({ ...s, tenant_id: T }))).select('id,name,duration_minutes,price');
  if (svcErr) { console.error('  ❌', svcErr.message); return; }
  console.log(`  ✅ ${svcData.length} services`);

  // 5. Clients
  console.log('\n👤 Clients...');
  const clientInserts = CLIENT_NAMES.map(([first, last]) => {
    const visits = Math.floor(Math.random()*30)+1;
    const avg = 40+Math.floor(Math.random()*50);
    const tags = [];
    if (visits >= 15) tags.push('VIP');
    if (visits >= 10) tags.push('Regular');
    if (Math.random() > 0.7) tags.push('Gel Lover');
    if (Math.random() > 0.8) tags.push('Pedicure Fan');
    const fullName = `${first} ${last}`;
    const photoPrefix = CLIENT_PHOTO_MAP[fullName];
    return {
      tenant_id: T, first_name: first, last_name: last, phone: randomPhone(),
      email: `${first.toLowerCase()}.${last.toLowerCase()}@email.com`,
      birthday: randomDate(1975,2002), visit_count: visits, lifetime_spend: visits*avg,
      last_visit: randomDate(2026,2026), loyalty_points: visits*10, status: 'active', tags,
      notes: visits >= 15 ? 'VIP — prefers gel extensions, always tips well' : visits >= 8 ? 'Regular — friendly' : null,
      _photoPrefix: photoPrefix || null,
    };
  });
  // Remove _photoPrefix before insert
  const cleanInserts = clientInserts.map(({ _photoPrefix, ...rest }) => rest);
  const { data: clientsData, error: cErr } = await supabase.from('clients').insert(cleanInserts).select('id,first_name,last_name');
  if (cErr) { console.error('  ❌', cErr.message); return; }
  console.log(`  ✅ ${clientsData.length} clients`);

  // Upload client photos
  console.log('\n📸 Client photos...');
  for (let i = 0; i < clientInserts.length; i++) {
    const prefix = clientInserts[i]._photoPrefix;
    if (!prefix) continue;
    const photoPath = findPhoto(prefix);
    const url = await uploadPhoto(T, `client_${clientsData[i].id}`, photoPath);
    if (url) {
      await supabase.from('clients').update({ photo_url: url }).eq('id', clientsData[i].id);
      console.log(`  📸 ${clientsData[i].first_name} ${clientsData[i].last_name}`);
    }
  }

  // 6. Appointments — spread across this week
  console.log('\n📅 Appointments...');
  const now = new Date();
  const monday = new Date(now); monday.setDate(now.getDate() - now.getDay() + 1);
  const allApts = [];
  for (let dayOff = 0; dayOff < 6; dayOff++) { // Mon-Sat
    const d = new Date(monday); d.setDate(monday.getDate() + dayOff);
    const dateStr = d.toISOString().slice(0,10);
    let ci = dayOff * 8; // spread clients
    for (const staffId of staffIds) {
      let hour = 9 + Math.floor(Math.random()*2);
      const numApts = 3 + Math.floor(Math.random()*2);
      for (let a = 0; a < numApts && ci < clientsData.length; a++) {
        const svc = svcData[Math.floor(Math.random()*svcData.length)];
        const st = new Date(`${dateStr}T${String(hour).padStart(2,'0')}:${Math.random()>0.5?'00':'30'}:00`);
        const et = new Date(st.getTime() + svc.duration_minutes*60000);
        const isPast = st < now;
        allApts.push({
          tenant_id: T, client_id: clientsData[ci].id, staff_id: staffId,
          service_id: svc.id, start_time: st.toISOString(), end_time: et.toISOString(),
          status: isPast ? 'confirmed' : (Math.random()>0.3 ? 'confirmed' : 'pending'),
          total_price: svc.price,
          payment_method: isPast ? ['card','cash','card','card'][Math.floor(Math.random()*4)] : null,
          tip_amount: isPast ? Math.floor(Math.random()*15)+5 : 0,
          checked_out_at: isPast ? st.toISOString() : null,
        });
        hour = et.getHours() + (et.getMinutes() > 30 ? 1 : 0);
        ci++;
      }
    }
  }
  const { data: aptData, error: aptErr } = await supabase.from('appointments').insert(allApts).select('id');
  if (aptErr) console.error('  ❌', aptErr.message);
  else console.log(`  ✅ ${aptData.length} appointments`);

  // 7. Service History
  console.log('\n📋 Service history...');
  const historyEntries = [];
  for (let i = 0; i < Math.min(30, allApts.length); i++) {
    const a = allApts[i];
    if (!a.checked_out_at) continue;
    historyEntries.push({
      tenant_id: T, client_id: a.client_id, staff_id: a.staff_id,
      service_id: a.service_id, appointment_id: aptData?.[i]?.id,
      date: a.start_time.slice(0,10), total_paid: a.total_price + a.tip_amount,
      notes: ['Client loved the result','Requested same color next time','First time client - very happy','Added nail art upgrade','Regular maintenance visit'][Math.floor(Math.random()*5)],
    });
  }
  if (historyEntries.length > 0) {
    const { error: hErr } = await supabase.from('service_history').insert(historyEntries);
    if (hErr) console.error('  ❌', hErr.message);
    else console.log(`  ✅ ${historyEntries.length} records`);
  }

  // 8. Campaigns
  console.log('\n📣 Campaigns...');
  const campInserts = CAMPAIGNS.map(c => ({
    tenant_id: T, name: c.name, type: c.type, status: c.status,
    template: c.template, audience: c.audience, metrics: c.metrics,
    last_sent: c.status === 'sent' ? new Date(Date.now()-86400000*Math.floor(Math.random()*14)).toISOString() : null,
  }));
  const { error: campErr } = await supabase.from('campaigns').insert(campInserts);
  if (campErr) console.error('  ❌', campErr.message);
  else console.log(`  ✅ ${campInserts.length} campaigns`);

  // 9. Conversations & Messages
  console.log('\n💬 Conversations...');
  let msgCount = 0;
  for (let i = 0; i < CONVERSATIONS_TEMPLATE.length && i < clientsData.length; i++) {
    const tpl = CONVERSATIONS_TEMPLATE[i];
    const client = clientsData[i];
    const lastMsg = tpl.messages[tpl.messages.length-1];
    const { data: conv, error: convErr } = await supabase.from('conversations').insert({
      tenant_id: T, client_id: client.id, channel: tpl.channel, status: tpl.status,
      last_message: lastMsg.content, last_message_at: new Date(Date.now()-3600000*i).toISOString(),
      unread_count: tpl.status === 'open' ? 1 : 0,
    }).select('id').single();
    if (convErr) { console.error('  ❌ conv:', convErr.message); continue; }

    const msgs = tpl.messages.map((m, mi) => ({
      conversation_id: conv.id, tenant_id: T, sender_type: m.sender_type,
      sender_name: m.sender_name || `${client.first_name} ${client.last_name}`,
      content: m.content, created_at: new Date(Date.now()-3600000*i - (tpl.messages.length-mi)*60000).toISOString(),
    }));
    const { error: msgErr } = await supabase.from('messages').insert(msgs);
    if (msgErr) console.error('  ❌ msgs:', msgErr.message);
    else msgCount += msgs.length;
  }
  console.log(`  ✅ ${CONVERSATIONS_TEMPLATE.length} conversations, ${msgCount} messages`);

  // 10. Social Posts
  console.log('\n📱 Social posts...');
  const postInserts = SOCIAL_POSTS.map((p, i) => ({
    tenant_id: T, content: p.content, platforms: p.platforms, status: p.status,
    template_type: p.template_type, metrics: p.metrics,
    published_at: p.status === 'published' ? new Date(Date.now()-86400000*(i+1)).toISOString() : null,
    scheduled_at: p.status === 'scheduled' ? new Date(Date.now()+86400000*(i+1)).toISOString() : null,
  }));
  const { error: postErr } = await supabase.from('social_posts').insert(postInserts);
  if (postErr) console.error('  ❌', postErr.message);
  else console.log(`  ✅ ${postInserts.length} posts`);

  // 11. Packages
  console.log('\n📦 Packages...');
  const pkgInserts = PACKAGES.map(p => ({
    tenant_id: T, ...p,
    services: svcData.slice(0,3).map(s => ({ id: s.id, name: s.name })),
  }));
  const { error: pkgErr } = await supabase.from('packages').insert(pkgInserts);
  if (pkgErr) console.error('  ❌', pkgErr.message);
  else console.log(`  ✅ ${pkgInserts.length} packages`);

  // 12. Gift Cards
  console.log('\n🎁 Gift cards...');
  const gcInserts = GIFT_CARDS.map(g => ({ tenant_id: T, ...g }));
  const { error: gcErr } = await supabase.from('gift_cards').insert(gcInserts);
  if (gcErr) console.error('  ❌', gcErr.message);
  else console.log(`  ✅ ${gcInserts.length} gift cards`);

  // 13. Feedback
  console.log('\n📝 Feedback...');
  const fbInserts = FEEDBACK.map((f, i) => ({
    tenant_id: T, staff_id: staffIds[i % staffIds.length], ...f,
  }));
  const { error: fbErr } = await supabase.from('feedback').insert(fbInserts);
  if (fbErr) console.error('  ❌', fbErr.message);
  else console.log(`  ✅ ${fbInserts.length} feedback entries`);

  // 14. Tenant Settings
  console.log('\n⚙️ Settings...');
  const { error: setErr } = await supabase.from('tenants').update({
    name: 'Luxe Nails & Spa', business_type: 'nail_salon', settings: TENANT_SETTINGS,
  }).eq('id', T);
  if (setErr) console.error('  ❌', setErr.message);
  else console.log('  ✅ Updated');

  // Summary
  console.log('\n═══════════════════════════════════');
  console.log('🎉 FULL DEMO SEEDED!');
  console.log('═══════════════════════════════════');
  console.log(`  🏪 Luxe Nails & Spa`);
  console.log(`  👥 ${staffIds.length} staff with photos`);
  console.log(`  💅 ${svcData.length} services`);
  console.log(`  👤 ${clientsData.length} clients (10 with photos)`);
  console.log(`  📅 ${aptData?.length || 0} appointments`);
  console.log(`  📣 ${CAMPAIGNS.length} campaigns`);
  console.log(`  💬 ${CONVERSATIONS_TEMPLATE.length} conversations`);
  console.log(`  📱 ${SOCIAL_POSTS.length} social posts`);
  console.log(`  📦 ${PACKAGES.length} packages`);
  console.log(`  🎁 ${GIFT_CARDS.length} gift cards`);
  console.log(`  📝 ${FEEDBACK.length} feedback`);
  console.log(`  ⚙️ Settings configured`);
  console.log('\n  → Open the app to see! 🚀');
}

main().catch(e => { console.error('💥', e.message); process.exit(1); });
