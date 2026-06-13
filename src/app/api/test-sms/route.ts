import { NextResponse } from 'next/server'

export async function GET() {
  const sid = process.env.TWILIO_ACCOUNT_SID!
  const token = process.env.TWILIO_AUTH_TOKEN!
  const auth = btoa(`${sid}:${token}`)

  // Check the last 5 messages sent
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json?PageSize=5`
  const res = await fetch(url, {
    headers: { 'Authorization': `Basic ${auth}` },
  })
  const data = await res.json()

  const messages = data.messages?.map((m: Record<string, string>) => ({
    sid: m.sid,
    to: m.to,
    from: m.from,
    status: m.status,
    error_code: m.error_code,
    error_message: m.error_message,
    date_sent: m.date_sent,
    date_created: m.date_created,
    direction: m.direction,
    body: m.body?.substring(0, 50),
  })) || []

  return NextResponse.json({ messages })
}
