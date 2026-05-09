/**
 * Run missing migrations and re-seed conversations + social posts
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { SOCIAL_POSTS, CONVERSATIONS_TEMPLATE } from './seed-data.mjs';

const SUPABASE_URL = 'https://fscmlqbjoweaqkzduqrj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_KEY env var'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  console.log('🔧 Running missing migrations...\n');

  // Read and execute migration SQL
  const migrationSQL = fs.readFileSync('supabase/migrations/003_social_inbox.sql', 'utf8');
  
  // Execute via Supabase RPC (raw SQL)
  const { error: sqlErr } = await supabase.rpc('exec_sql', { sql: migrationSQL });
  
  if (sqlErr) {
    console.log('  ⚠ RPC not available, trying direct REST approach...');
    // Use the Supabase Management API or just try inserting - tables may already exist
    // Let's try a fetch to the SQL endpoint
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql: migrationSQL }),
    });
    if (!resp.ok) {
      console.log('  ⚠ Direct SQL execution not available via REST.');
      console.log('  📋 Please run this SQL in your Supabase SQL Editor:');
      console.log('  → https://supabase.com/dashboard/project/fscmlqbjoweaqkzduqrj/sql');
      console.log('\n  File: supabase/migrations/003_social_inbox.sql');
      console.log('\n  Then re-run this script.\n');
      
      // Try to insert anyway in case tables exist but aren't in schema cache
      console.log('  Trying to seed anyway...\n');
    }
  } else {
    console.log('  ✅ Migration executed\n');
  }

  // Get tenant
  const { data: tenant } = await supabase.from('tenants').select('id').ilike('name', '%luxe%nail%').single();
  if (!tenant) { console.error('No tenant found'); return; }
  const T = tenant.id;

  // Get clients and staff for linking
  const { data: clients } = await supabase.from('clients').select('id,first_name,last_name').eq('tenant_id', T).limit(10);
  const { data: staff } = await supabase.from('staff').select('id,name').eq('tenant_id', T);

  if (!clients?.length || !staff?.length) { console.error('No clients/staff found'); return; }

  // Seed Conversations
  console.log('💬 Seeding conversations...');
  let msgCount = 0;
  for (let i = 0; i < CONVERSATIONS_TEMPLATE.length && i < clients.length; i++) {
    const tpl = CONVERSATIONS_TEMPLATE[i];
    const client = clients[i];
    const lastMsg = tpl.messages[tpl.messages.length - 1];

    const { data: conv, error: convErr } = await supabase.from('conversations').insert({
      tenant_id: T, client_id: client.id, channel: tpl.channel, status: tpl.status,
      last_message: lastMsg.content,
      last_message_at: new Date(Date.now() - 3600000 * i).toISOString(),
      unread_count: tpl.status === 'open' ? 1 : 0,
    }).select('id').single();

    if (convErr) {
      console.error(`  ❌ Conversation ${i}:`, convErr.message);
      if (convErr.message.includes('schema cache') || convErr.message.includes('not found')) {
        console.log('\n  ⛔ Table does not exist. Please run the migration SQL first.');
        console.log('  → Open: https://supabase.com/dashboard/project/fscmlqbjoweaqkzduqrj/sql');
        console.log('  → Paste contents of: supabase/migrations/003_social_inbox.sql');
        console.log('  → Click "Run"\n');
        return;
      }
      continue;
    }

    const msgs = tpl.messages.map((m, mi) => ({
      conversation_id: conv.id, tenant_id: T, sender_type: m.sender_type,
      sender_name: m.sender_name || `${client.first_name} ${client.last_name}`,
      content: m.content,
      created_at: new Date(Date.now() - 3600000 * i - (tpl.messages.length - mi) * 60000).toISOString(),
    }));
    const { error: msgErr } = await supabase.from('messages').insert(msgs);
    if (!msgErr) msgCount += msgs.length;
  }
  console.log(`  ✅ ${CONVERSATIONS_TEMPLATE.length} conversations, ${msgCount} messages\n`);

  // Seed Social Posts
  console.log('📱 Seeding social posts...');
  const postInserts = SOCIAL_POSTS.map((p, i) => ({
    tenant_id: T, content: p.content, platforms: p.platforms, status: p.status,
    template_type: p.template_type, metrics: p.metrics,
    published_at: p.status === 'published' ? new Date(Date.now() - 86400000 * (i + 1)).toISOString() : null,
    scheduled_at: p.status === 'scheduled' ? new Date(Date.now() + 86400000 * (i + 1)).toISOString() : null,
  }));
  const { error: postErr } = await supabase.from('social_posts').insert(postInserts);
  if (postErr) {
    console.error('  ❌', postErr.message);
    if (postErr.message.includes('schema cache')) {
      console.log('  ⛔ Table does not exist. Run the migration first.');
    }
  } else {
    console.log(`  ✅ ${postInserts.length} social posts\n`);
  }

  console.log('🎉 Done! Inbox & Social seeded.');
}

main().catch(e => { console.error('💥', e.message); process.exit(1); });
