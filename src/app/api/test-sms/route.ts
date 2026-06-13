import { NextResponse } from 'next/server'

export async function GET() {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_PHONE_NUMBER

  if (!sid || !token || !from) {
    return NextResponse.json({
      error: 'Missing Twilio env vars',
      hasSid: !!sid,
      hasToken: !!token,
      hasFrom: !!from,
    }, { status: 500 })
  }

  // Send a test SMS to a known number
  const to = '+15308481587' // test number
  const body = '🧪 GlowUp test SMS — if you see this, Twilio is working!'

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`
    const auth = btoa(`${sid}:${token}`)

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    })

    const result = await res.json()

    return NextResponse.json({
      status: res.status,
      ok: res.ok,
      twilioResponse: result,
      envCheck: {
        sidPrefix: sid.substring(0, 4),
        fromNumber: from,
      }
    })
  } catch (err: unknown) {
    const e = err as Error
    return NextResponse.json({
      error: e.message,
      stack: e.stack,
    }, { status: 500 })
  }
}
