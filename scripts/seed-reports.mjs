import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fscmlqbjoweaqkzduqrj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  const { data: tenant } = await supabase.from('tenants').select('id').ilike('name', '%luxe%nail%').single();
  const T = tenant.id;
  const now = new Date().toISOString();

  // 1. Mark all past appointments as completed
  await supabase.from('appointments')
    .update({ status: 'completed', checked_out_at: now })
    .eq('tenant_id', T).eq('status', 'confirmed').lt('start_time', now);
  console.log('✅ Marked past appointments as completed');

  // 2. Get lookup data
  const { data: staff } = await supabase.from('staff').select('id, name').eq('tenant_id', T);
  const { data: clients } = await supabase.from('clients').select('id, first_name').eq('tenant_id', T).limit(20);
  const { data: services } = await supabase.from('services').select('id, name, price').eq('tenant_id', T);

  console.log(`Staff: ${staff.length}, Clients: ${clients.length}, Services: ${services.length}`);

  // 3. Generate historical appointments (Feb, Mar, Apr)
  const historicalApts = [];
  const months = [
    { year: 2026, month: 1, count: 55 },  // Feb
    { year: 2026, month: 2, count: 65 },  // Mar
    { year: 2026, month: 3, count: 75 },  // Apr
  ];

  for (const m of months) {
    const daysInMonth = new Date(m.year, m.month + 1, 0).getDate();
    for (let i = 0; i < m.count; i++) {
      const day = Math.floor(Math.random() * Math.min(daysInMonth, 28)) + 1;
      const hour = 9 + Math.floor(Math.random() * 9);
      const minute = [0, 15, 30, 45][Math.floor(Math.random() * 4)];
      const svc = services[Math.floor(Math.random() * services.length)];
      const stf = staff[Math.floor(Math.random() * staff.length)];
      const cli = clients[Math.floor(Math.random() * clients.length)];
      const startTime = new Date(m.year, m.month, day, hour, minute);
      const endTime = new Date(startTime.getTime() + 45 * 60000);
      const tipAmount = [0, 5, 8, 10, 12, 15, 20][Math.floor(Math.random() * 7)];

      historicalApts.push({
        tenant_id: T,
        client_id: cli.id,
        staff_id: stf.id,
        service_id: svc.id,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        status: 'completed',
        total_price: svc.price || 45,
        tip_amount: tipAmount,
        checked_out_at: endTime.toISOString(),
      });
    }
  }

  // 4. Also add more May appointments (completed ones from May 1-9)
  for (let i = 0; i < 30; i++) {
    const day = Math.floor(Math.random() * 8) + 1; // May 1-8
    const hour = 9 + Math.floor(Math.random() * 9);
    const minute = [0, 15, 30, 45][Math.floor(Math.random() * 4)];
    const svc = services[Math.floor(Math.random() * services.length)];
    const stf = staff[Math.floor(Math.random() * staff.length)];
    const cli = clients[Math.floor(Math.random() * clients.length)];
    const startTime = new Date(2026, 4, day, hour, minute); // month 4 = May
    const endTime = new Date(startTime.getTime() + 45 * 60000);
    const tipAmount = [5, 8, 10, 12, 15, 20][Math.floor(Math.random() * 6)];

    historicalApts.push({
      tenant_id: T,
      client_id: cli.id,
      staff_id: stf.id,
      service_id: svc.id,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      status: 'completed',
      total_price: svc.price || 45,
      tip_amount: tipAmount,
      checked_out_at: endTime.toISOString(),
    });
  }

  // 5. Insert in batches
  console.log(`\n📊 Inserting ${historicalApts.length} historical appointments...`);
  for (let i = 0; i < historicalApts.length; i += 50) {
    const batch = historicalApts.slice(i, i + 50);
    const { error } = await supabase.from('appointments').insert(batch);
    if (error) console.error(`  ❌ Batch ${i}: ${error.message}`);
    else console.log(`  ✅ Batch ${Math.floor(i/50)+1}: ${batch.length} records`);
  }

  // 6. Summary
  const { count: totalCompleted } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T).eq('status', 'completed');

  const { count: totalApts } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T);

  // Revenue sum
  const { data: revData } = await supabase
    .from('appointments')
    .select('total_price, tip_amount')
    .eq('tenant_id', T).eq('status', 'completed');

  const totalRev = revData?.reduce((s, a) => s + (a.total_price || 0), 0) || 0;
  const totalTips = revData?.reduce((s, a) => s + (a.tip_amount || 0), 0) || 0;

  console.log(`\n📈 Final totals:`);
  console.log(`  Total appointments: ${totalApts}`);
  console.log(`  Completed: ${totalCompleted}`);
  console.log(`  Total Revenue: $${totalRev.toLocaleString()}`);
  console.log(`  Total Tips: $${totalTips.toLocaleString()}`);
  console.log(`\n🎉 Reports are ready!`);
}

main().catch(e => { console.error('💥', e.message); process.exit(1); });
