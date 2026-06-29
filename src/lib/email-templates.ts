// ─── Shared HTML Email Templates ───
// Table-based layout + inline styles for maximum email client compatibility.

/** Base wrapper: dark gradient background, centered card */
function emailShell(businessName: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${businessName}</title>
</head>
<body style="margin:0;padding:0;background-color:#1a1a2e;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1a1a2e;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#242444;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
          <!-- Header bar -->
          <tr>
            <td style="background:linear-gradient(135deg,#6c5ce7,#a855f7);padding:24px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">${businessName}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 24px;text-align:center;border-top:1px solid #3a3a5c;">
              <p style="margin:0;color:#6b6b8d;font-size:12px;">Powered by <a href="https://joinglowup.org" style="color:#a855f7;text-decoration:none;">GlowUp</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/** A styled CTA button (table-based for email clients) */
function emailButton(text: string, href: string, color: string = '#6c5ce7'): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
  <tr>
    <td align="center" style="border-radius:8px;background-color:${color};">
      <a href="${href}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;background-color:${color};">${text}</a>
    </td>
  </tr>
</table>`
}

/** Detail row for appointment info */
function detailRow(emoji: string, label: string, value: string): string {
  return `<tr>
  <td style="padding:8px 0;color:#a0a0c0;font-size:14px;width:40px;vertical-align:top;">${emoji}</td>
  <td style="padding:8px 0;color:#a0a0c0;font-size:14px;width:80px;vertical-align:top;">${label}</td>
  <td style="padding:8px 0;color:#e8e8f0;font-size:14px;font-weight:500;vertical-align:top;">${value}</td>
</tr>`
}

// ─── Booking Confirmation Email ───
export function bookingConfirmationHtml(opts: {
  greeting: string
  serviceName: string
  dateStr: string
  timeStr: string
  staffName: string
  businessName: string
  businessAddress: string
  businessPhone: string
  manageLink: string
}): string {
  const { greeting, serviceName, dateStr, timeStr, staffName, businessName, businessAddress, businessPhone, manageLink } = opts

  const detailRows = [
    detailRow('📋', 'Service', serviceName),
    detailRow('📅', 'Date', dateStr),
    detailRow('🕐', 'Time', timeStr),
    staffName ? detailRow('💇', 'With', staffName) : '',
    detailRow('📍', 'Location', businessAddress ? `${businessName}, ${businessAddress}` : businessName),
    businessPhone ? detailRow('📞', 'Phone', `<a href="tel:${businessPhone}" style="color:#a855f7;text-decoration:none;">${businessPhone}</a>`) : '',
  ].filter(Boolean).join('\n')

  const manageSection = manageLink
    ? `<p style="margin:24px 0 16px;color:#a0a0c0;font-size:14px;text-align:center;">Need to reschedule or cancel?</p>
       ${emailButton('Manage Appointment', manageLink)}`
    : `<p style="margin:24px 0 8px;color:#a0a0c0;font-size:14px;text-align:center;">Need to reschedule or cancel? Contact us at ${businessPhone || 'the salon'}.</p>`

  const contactLine = businessPhone
    ? `<p style="margin:16px 0 0;color:#6b6b8d;font-size:13px;text-align:center;">Or call/text us at <a href="tel:${businessPhone}" style="color:#a855f7;text-decoration:none;">${businessPhone}</a></p>`
    : ''

  const body = `
    <p style="margin:0 0 4px;color:#e8e8f0;font-size:16px;">Dear ${greeting},</p>
    <p style="margin:0 0 24px;color:#a0a0c0;font-size:14px;">Your appointment has been confirmed! ✨</p>

    <!-- Appointment card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1e1e3a;border-radius:12px;padding:0;margin-bottom:8px;">
      <tr><td style="padding:20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${detailRows}
        </table>
      </td></tr>
    </table>

    ${manageSection}
    ${contactLine}

    <p style="margin:24px 0 0;color:#a0a0c0;font-size:14px;">See you soon! 💜</p>
    <p style="margin:4px 0 0;color:#a0a0c0;font-size:14px;">— ${businessName}</p>
  `

  return emailShell(businessName, body)
}

// ─── Appointment Reminder Email ───
export function appointmentReminderHtml(opts: {
  greeting: string
  serviceName: string
  dateStr: string
  timeStr: string
  staffName: string
  businessName: string
  businessAddress: string
  manageLink: string
}): string {
  const { greeting, serviceName, dateStr, timeStr, staffName, businessName, businessAddress, manageLink } = opts

  const detailRows = [
    detailRow('📋', 'Service', serviceName),
    detailRow('📅', 'Date', dateStr),
    detailRow('🕐', 'Time', timeStr),
    staffName ? detailRow('💇', 'With', staffName) : '',
    detailRow('📍', 'At', `${businessName}${businessAddress ? `, ${businessAddress}` : ''}`),
  ].filter(Boolean).join('\n')

  const manageSection = manageLink
    ? `<p style="margin:24px 0 16px;color:#a0a0c0;font-size:14px;text-align:center;">Need to reschedule or cancel?</p>
       ${emailButton('Manage Appointment', manageLink)}`
    : `<p style="margin:24px 0 8px;color:#a0a0c0;font-size:14px;text-align:center;">To confirm, modify, or cancel, please reply to this email.</p>`

  const body = `
    <p style="margin:0 0 4px;color:#e8e8f0;font-size:16px;">Dear ${greeting},</p>
    <p style="margin:0 0 24px;color:#a0a0c0;font-size:14px;">This is a friendly reminder about your upcoming appointment 🔔</p>

    <!-- Appointment card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1e1e3a;border-radius:12px;padding:0;margin-bottom:8px;">
      <tr><td style="padding:20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${detailRows}
        </table>
      </td></tr>
    </table>

    ${manageSection}

    <p style="margin:24px 0 0;color:#a0a0c0;font-size:14px;">See you soon! 💜</p>
    <p style="margin:4px 0 0;color:#a0a0c0;font-size:14px;">— ${businessName}</p>
  `

  return emailShell(businessName, body)
}

// ─── Reschedule Confirmation Email ───
export function rescheduleConfirmationHtml(opts: {
  greeting: string
  serviceName: string
  dateStr: string
  timeStr: string
  staffName: string
  businessName: string
  businessPhone: string
  manageLink: string
}): string {
  const { greeting, serviceName, dateStr, timeStr, staffName, businessName, businessPhone, manageLink } = opts

  const detailRows = [
    detailRow('📋', 'Service', serviceName),
    detailRow('📅', 'New Date', dateStr),
    detailRow('🕐', 'New Time', timeStr),
    staffName ? detailRow('💇', 'With', staffName) : '',
  ].filter(Boolean).join('\n')

  const manageSection = manageLink
    ? `<p style="margin:24px 0 16px;color:#a0a0c0;font-size:14px;text-align:center;">Need to reschedule again or cancel?</p>
       ${emailButton('Manage Appointment', manageLink)}`
    : ''

  const contactLine = businessPhone
    ? `<p style="margin:16px 0 0;color:#6b6b8d;font-size:13px;text-align:center;">Or contact us at <a href="tel:${businessPhone}" style="color:#a855f7;text-decoration:none;">${businessPhone}</a></p>`
    : ''

  const body = `
    <p style="margin:0 0 4px;color:#e8e8f0;font-size:16px;">Dear ${greeting},</p>
    <p style="margin:0 0 24px;color:#a0a0c0;font-size:14px;">Your appointment has been rescheduled! 🔄</p>

    <!-- Updated appointment card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1e1e3a;border-radius:12px;padding:0;margin-bottom:8px;">
      <tr><td style="padding:20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${detailRows}
        </table>
      </td></tr>
    </table>

    ${manageSection}
    ${contactLine}

    <p style="margin:24px 0 0;color:#a0a0c0;font-size:14px;">See you soon! 💜</p>
    <p style="margin:4px 0 0;color:#a0a0c0;font-size:14px;">— ${businessName}</p>
  `

  return emailShell(businessName, body)
}

// ─── Cancellation Confirmation Email (to Client) ───
export function cancellationConfirmationHtml(opts: {
  greeting: string
  serviceName: string
  dateStr: string
  timeStr: string
  staffName: string
  businessName: string
  businessPhone: string
  bookingLink: string
}): string {
  const { greeting, serviceName, dateStr, timeStr, staffName, businessName, businessPhone, bookingLink } = opts

  const detailRows = [
    detailRow('📋', 'Service', serviceName),
    detailRow('📅', 'Date', `<s>${dateStr}</s>`),
    detailRow('🕐', 'Time', `<s>${timeStr}</s>`),
    staffName ? detailRow('💇', 'With', staffName) : '',
  ].filter(Boolean).join('\n')

  const rebookSection = bookingLink
    ? `<p style="margin:24px 0 16px;color:#a0a0c0;font-size:14px;text-align:center;">Want to book a new appointment?</p>
       ${emailButton('Book Again', bookingLink, '#6c5ce7')}`
    : ''

  const contactLine = businessPhone
    ? `<p style="margin:16px 0 0;color:#6b6b8d;font-size:13px;text-align:center;">Questions? Contact us at <a href="tel:${businessPhone}" style="color:#a855f7;text-decoration:none;">${businessPhone}</a></p>`
    : ''

  const body = `
    <p style="margin:0 0 4px;color:#e8e8f0;font-size:16px;">Dear ${greeting},</p>
    <p style="margin:0 0 24px;color:#a0a0c0;font-size:14px;">Your appointment has been cancelled. ❌</p>

    <!-- Cancelled appointment card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1e1e3a;border-radius:12px;padding:0;margin-bottom:8px;">
      <tr><td style="padding:20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${detailRows}
        </table>
      </td></tr>
    </table>

    ${rebookSection}
    ${contactLine}

    <p style="margin:24px 0 0;color:#a0a0c0;font-size:14px;">We hope to see you again soon! 💜</p>
    <p style="margin:4px 0 0;color:#a0a0c0;font-size:14px;">— ${businessName}</p>
  `

  return emailShell(businessName, body)
}

// ─── Staff Cancellation Notification Email ───
export function staffCancellationNotificationHtml(opts: {
  staffName: string
  clientName: string
  serviceName: string
  dateStr: string
  timeStr: string
  businessName: string
}): string {
  const { staffName, clientName, serviceName, dateStr, timeStr, businessName } = opts

  const detailRows = [
    detailRow('👤', 'Client', clientName),
    detailRow('📋', 'Service', serviceName),
    detailRow('📅', 'Date', `<s>${dateStr}</s>`),
    detailRow('🕐', 'Time', `<s>${timeStr}</s>`),
  ].join('\n')

  const body = `
    <p style="margin:0 0 4px;color:#e8e8f0;font-size:16px;">Hi ${staffName},</p>
    <p style="margin:0 0 24px;color:#a0a0c0;font-size:14px;">The following appointment has been cancelled by the client. ❌</p>

    <!-- Cancelled appointment card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1e1e3a;border-radius:12px;padding:0;margin-bottom:8px;">
      <tr><td style="padding:20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${detailRows}
        </table>
      </td></tr>
    </table>

    <p style="margin:24px 0 0;color:#a0a0c0;font-size:14px;">This time slot is now open for other bookings.</p>
    <p style="margin:4px 0 0;color:#a0a0c0;font-size:14px;">— ${businessName}</p>
  `

  return emailShell(businessName, body)
}

// ─── Staff Reschedule Notification Email ───
export function staffRescheduleNotificationHtml(opts: {
  staffName: string
  clientName: string
  serviceName: string
  oldDateStr: string
  oldTimeStr: string
  newDateStr: string
  newTimeStr: string
  businessName: string
}): string {
  const { staffName, clientName, serviceName, oldDateStr, oldTimeStr, newDateStr, newTimeStr, businessName } = opts

  const detailRows = [
    detailRow('👤', 'Client', clientName),
    detailRow('📋', 'Service', serviceName),
    detailRow('📅', 'Was', `<s>${oldDateStr} at ${oldTimeStr}</s>`),
    detailRow('📅', 'New', `<strong>${newDateStr} at ${newTimeStr}</strong>`),
  ].join('\n')

  const body = `
    <p style="margin:0 0 4px;color:#e8e8f0;font-size:16px;">Hi ${staffName},</p>
    <p style="margin:0 0 24px;color:#a0a0c0;font-size:14px;">A client has rescheduled their appointment. 🔄</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1e1e3a;border-radius:12px;padding:0;margin-bottom:8px;">
      <tr><td style="padding:20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${detailRows}
        </table>
      </td></tr>
    </table>

    <p style="margin:24px 0 0;color:#a0a0c0;font-size:14px;">Your schedule has been updated automatically.</p>
    <p style="margin:4px 0 0;color:#a0a0c0;font-size:14px;">— ${businessName}</p>
  `

  return emailShell(businessName, body)
}

// ─── Owner Notification Email (Cancel or Reschedule) ───
export function ownerNotificationHtml(opts: {
  type: 'cancel' | 'reschedule'
  clientName: string
  serviceName: string
  staffName: string
  dateStr: string
  timeStr: string
  oldDateStr?: string
  oldTimeStr?: string
  businessName: string
}): string {
  const { type, clientName, serviceName, staffName, dateStr, timeStr, oldDateStr, oldTimeStr, businessName } = opts

  const isCancel = type === 'cancel'
  const emoji = isCancel ? '❌' : '🔄'
  const action = isCancel ? 'cancelled' : 'rescheduled'

  const detailRows = [
    detailRow('👤', 'Client', clientName),
    detailRow('📋', 'Service', serviceName),
    staffName ? detailRow('💇', 'Staff', staffName) : '',
    ...(isCancel
      ? [
          detailRow('📅', 'Date', `<s>${dateStr}</s>`),
          detailRow('🕐', 'Time', `<s>${timeStr}</s>`),
        ]
      : [
          detailRow('📅', 'Was', `<s>${oldDateStr || dateStr} at ${oldTimeStr || timeStr}</s>`),
          detailRow('📅', 'New', `<strong>${dateStr} at ${timeStr}</strong>`),
        ]),
  ].filter(Boolean).join('\n')

  const body = `
    <p style="margin:0 0 4px;color:#e8e8f0;font-size:16px;">${emoji} Appointment ${action}</p>
    <p style="margin:0 0 24px;color:#a0a0c0;font-size:14px;">A client has ${action} their appointment.</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1e1e3a;border-radius:12px;padding:0;margin-bottom:8px;">
      <tr><td style="padding:20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${detailRows}
        </table>
      </td></tr>
    </table>

    <p style="margin:24px 0 0;color:#a0a0c0;font-size:14px;">— ${businessName}</p>
  `

  return emailShell(businessName, body)
}
