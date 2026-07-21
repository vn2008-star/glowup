// Server page: prefetches the default week view (staff + services +
// appointments + birthday markers) during the server render, mirroring the
// range math CalendarClient uses (Monday–Sunday around "today" in the salon's
// timezone). If the browser computes a different week (rare timezone edge),
// the client detects the range mismatch and refetches.

import { createClient as createServiceClient } from "@supabase/supabase-js";
import CalendarClient, { type InitialCalendarData } from "./CalendarClient";
import { resolveDashboardContext } from "@/lib/tenant-server";
import { getCalendarLoad } from "@/lib/dashboard-queries";
import { localToUTC, todayInTz, DEFAULT_TZ } from "@/lib/tz";

function dateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function CalendarPage() {
  let initialCalendar: InitialCalendarData | null = null;
  try {
    const ctx = await resolveDashboardContext();
    if (ctx.status === "ok") {
      const svc = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const salonTz = ctx.tenant.timezone || DEFAULT_TZ;
      // Monday–Sunday of the current week, anchored to today in the salon tz
      const [y, m, d] = todayInTz(salonTz).split("-").map(Number);
      const today = new Date(y, m - 1, d);
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const startISO = localToUTC(dateStr(weekStart), "00:00", salonTz).toISOString();
      const endISO = localToUTC(dateStr(weekEnd), "23:59", salonTz).toISOString();

      const [load, birthdaysRes] = await Promise.all([
        getCalendarLoad(svc, ctx.tenantId, { startDate: startISO, endDate: endISO }),
        svc
          .from("clients")
          .select("id, first_name, last_name, birthday")
          .eq("tenant_id", ctx.tenantId)
          .not("birthday", "is", null)
          .limit(1000),
      ]);

      initialCalendar = {
        startISO,
        endISO,
        staff: load.staff,
        services: load.services,
        appointments: load.appointments,
        birthdays: birthdaysRes.data || [],
      };
    }
  } catch {
    // Fall back to the client-side fetch on any server error.
  }

  return <CalendarClient initialCalendar={initialCalendar} />;
}
