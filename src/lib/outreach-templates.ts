// ─── GlowUp Outreach Email Templates ───
// 4 professionally crafted dark-mode HTML email templates

export type TemplateId = 'feature_showcase' | 'success_story' | 'limited_offer' | 'follow_up';

export const TEMPLATES: Record<TemplateId, {
  id: TemplateId;
  name: string;
  description: string;
  icon: string;
  subjectFn: (salonName: string) => string;
}> = {
  feature_showcase: {
    id: 'feature_showcase',
    name: 'Feature Showcase',
    description: 'Highlights GlowUp\'s top features with stats — best for first cold outreach',
    icon: '🚀',
    subjectFn: (name) => `✨ ${name} — free salon management that pays for itself`,
  },
  success_story: {
    id: 'success_story',
    name: 'Success Story',
    description: 'Social proof with salon success metrics — best for warm leads',
    icon: '⭐',
    subjectFn: (name) => `How salons like ${name} are growing 3.2× with GlowUp`,
  },
  limited_offer: {
    id: 'limited_offer',
    name: 'Limited-Time Offer',
    description: 'Urgency-driven with exclusive deal — best for conversion push',
    icon: '🔥',
    subjectFn: (name) => `🔥 ${name} — exclusive 60-day free trial (limited spots)`,
  },
  follow_up: {
    id: 'follow_up',
    name: 'Friendly Follow-Up',
    description: 'Gentle reminder for previously contacted salons — auto or manual',
    icon: '💬',
    subjectFn: (name) => `Quick follow-up for ${name} — still interested?`,
  },
};

const baseStyles = `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; background: #1a1a2e; color: #e0e0e0; border-radius: 16px;`;

// GlowUp SVG logo as inline data URI (works in all email clients)
const logoSvgDataUri = `data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 48 48' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3ClinearGradient id='fg' x1='0' y1='0' x2='48' y2='48' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0%25' stop-color='%23c9a0dc'/%3E%3Cstop offset='100%25' stop-color='%23f0a3b5'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M38 24c0 7.732-6.268 14-14 14s-14-6.268-14-14S16.268 10 24 10c3.5 0 6.7 1.28 9.16 3.4' stroke='url(%23fg)' stroke-width='4' stroke-linecap='round' fill='none'/%3E%3Cpath d='M38 24H26' stroke='url(%23fg)' stroke-width='4' stroke-linecap='round'/%3E%3Cpath d='M38 6l1.2 3.6L43 11l-3.8 1.4L38 16l-1.2-3.6L33 11l3.8-1.4z' fill='url(%23fg)'/%3E%3Ccircle cx='43' cy='6' r='1.5' fill='%23f0a3b5' opacity='0.6'/%3E%3C/svg%3E`;

const logoHtml = `<div style="display: flex; align-items: center; gap: 10px;">
  <img src="${logoSvgDataUri}" alt="GlowUp" width="40" height="40" style="display: block;" />
  <h1 style="font-size: 28px; margin: 0; background: linear-gradient(135deg, #c9a0dc, #f0a3b5); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">GlowUp</h1>
</div>`;
const ctaButton = (link: string, text: string) => `<a href="${link}" style="display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, #c37eda, #e8a87c); color: #fff; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 15px;">${text}</a>`;
const footer = (senderName: string | undefined, salonName: string) => `
  <div style="text-align: center; border-top: 1px solid #333; padding-top: 16px;">
    <img src="${logoSvgDataUri}" alt="GlowUp" width="24" height="24" style="display: inline-block; vertical-align: middle; margin-right: 6px;" />
    <p style="color: #666; font-size: 11px; margin: 0; display: inline;">
      ${senderName ? `— ${senderName}, GlowUp Team` : '— The GlowUp Team'}
    </p>
    <p style="color: #555; font-size: 10px; margin: 8px 0 0;">
      Reply to this email if you have any questions. We'd love to help ${salonName} grow!
    </p>
  </div>`;

export function renderTemplate(
  templateId: TemplateId,
  salonName: string,
  ownerName: string,
  signupLink: string,
  senderName?: string,
): string {
  const salon = salonName.trim();
  const owner = ownerName.trim();

  switch (templateId) {
    case 'feature_showcase':
      return `<div style="${baseStyles}">
  <div style="text-align: center; margin-bottom: 24px;">${logoHtml}</div>
  <div style="margin-bottom: 24px;">
    <p style="font-size: 16px; line-height: 1.6; color: #ffffff; margin: 0 0 16px;">Hi ${owner},</p>
    <p style="font-size: 14px; line-height: 1.7; color: #c0c0c0; margin: 0 0 16px;">
      I wanted to reach out because I think <strong style="color: #ffffff;">${salon}</strong> would be a great fit for GlowUp — the all-in-one platform that helps beauty businesses grow on autopilot.
    </p>
    <p style="font-size: 14px; line-height: 1.7; color: #c0c0c0; margin: 0 0 16px;">Salons using GlowUp see on average:</p>
  </div>
  <div style="display: flex; gap: 12px; margin-bottom: 24px;">
    <div style="flex: 1; background: #2a2a3e; border-radius: 12px; padding: 16px; text-align: center;">
      <div style="font-size: 24px; font-weight: 800; color: #e8a87c;">60%</div>
      <div style="font-size: 11px; color: #999; margin-top: 4px;">Less no-shows</div>
    </div>
    <div style="flex: 1; background: #2a2a3e; border-radius: 12px; padding: 16px; text-align: center;">
      <div style="font-size: 24px; font-weight: 800; color: #d4a0e8;">3.2×</div>
      <div style="font-size: 11px; color: #999; margin-top: 4px;">More repeat visits</div>
    </div>
    <div style="flex: 1; background: #2a2a3e; border-radius: 12px; padding: 16px; text-align: center;">
      <div style="font-size: 24px; font-weight: 800; color: #22c55e;">45%</div>
      <div style="font-size: 11px; color: #999; margin-top: 4px;">Revenue increase</div>
    </div>
  </div>
  <div style="background: #2a2a3e; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
    <p style="font-size: 13px; color: #b0b0b0; margin: 0 0 8px;"><strong style="color: #d4a0e8;">What you get:</strong></p>
    <ul style="font-size: 13px; color: #c0c0c0; line-height: 1.8; margin: 0; padding-left: 18px;">
      <li>Smart booking with photo-based CRM</li>
      <li>Automated reminders that cut no-shows</li>
      <li>"Fill My Openings" — blast last-minute availability</li>
      <li>Client loyalty & retention automation</li>
      <li>Staff performance reports</li>
    </ul>
  </div>
  <div style="text-align: center; margin-bottom: 24px;">
    ${ctaButton(signupLink, 'Start Your Free Trial →')}
    <p style="font-size: 12px; color: #888; margin: 12px 0 0;">No credit card required. Setup takes 2 minutes.</p>
  </div>
  ${footer(senderName, salon)}
</div>`;

    case 'success_story':
      return `<div style="${baseStyles}">
  <div style="text-align: center; margin-bottom: 24px;">${logoHtml}</div>
  <p style="font-size: 16px; line-height: 1.6; color: #ffffff; margin: 0 0 16px;">Hi ${owner},</p>
  <p style="font-size: 14px; line-height: 1.7; color: #c0c0c0; margin: 0 0 20px;">
    I wanted to share something exciting — beauty businesses just like <strong style="color: #ffffff;">${salon}</strong> are seeing incredible results with GlowUp.
  </p>
  <div style="background: #2a2a3e; border-radius: 12px; padding: 24px; margin-bottom: 24px; border-left: 4px solid #d4a0e8;">
    <p style="font-size: 15px; color: #ffffff; margin: 0 0 12px; font-weight: 600;">📈 Real Results From Real Salons</p>
    <div style="margin-bottom: 16px;">
      <p style="font-size: 13px; color: #e8a87c; font-weight: 700; margin: 0;">BK Lashes Salon — Houston, TX</p>
      <p style="font-size: 12px; color: #c0c0c0; margin: 4px 0 0; line-height: 1.6;">"Since switching to GlowUp, our no-shows dropped by 60% and we've grown our client base from 12 to 38 in just 2 weeks. The automated reminders and photo CRM are game-changers."</p>
    </div>
    <div style="display: flex; gap: 16px; margin-top: 16px;">
      <div style="text-align: center; flex: 1;">
        <div style="font-size: 20px; font-weight: 800; color: #22c55e;">38</div>
        <div style="font-size: 10px; color: #888;">Clients gained</div>
      </div>
      <div style="text-align: center; flex: 1;">
        <div style="font-size: 20px; font-weight: 800; color: #e8a87c;">60%</div>
        <div style="font-size: 10px; color: #888;">Less no-shows</div>
      </div>
      <div style="text-align: center; flex: 1;">
        <div style="font-size: 20px; font-weight: 800; color: #d4a0e8;">2 min</div>
        <div style="font-size: 10px; color: #888;">Setup time</div>
      </div>
    </div>
  </div>
  <p style="font-size: 14px; line-height: 1.7; color: #c0c0c0; margin: 0 0 20px;">
    I'd love to see <strong style="color: #ffffff;">${salon}</strong> achieve the same growth. Want to give it a try?
  </p>
  <div style="text-align: center; margin-bottom: 24px;">
    ${ctaButton(signupLink, 'See How It Works →')}
    <p style="font-size: 12px; color: #888; margin: 12px 0 0;">Free trial. No strings attached.</p>
  </div>
  ${footer(senderName, salon)}
</div>`;

    case 'limited_offer':
      return `<div style="${baseStyles}">
  <div style="text-align: center; margin-bottom: 24px;">${logoHtml}</div>
  <div style="background: linear-gradient(135deg, rgba(239,68,68,0.15), rgba(245,158,11,0.15)); border: 1px solid rgba(245,158,11,0.3); border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;">
    <p style="font-size: 12px; color: #f59e0b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 4px;">⏰ Limited-Time Offer</p>
    <p style="font-size: 20px; color: #ffffff; font-weight: 800; margin: 0;">60 Days Free — Only 50 Spots Left</p>
  </div>
  <p style="font-size: 16px; line-height: 1.6; color: #ffffff; margin: 0 0 16px;">Hi ${owner},</p>
  <p style="font-size: 14px; line-height: 1.7; color: #c0c0c0; margin: 0 0 16px;">
    We're running an exclusive promotion for select beauty businesses in your area, and <strong style="color: #ffffff;">${salon}</strong> made our list.
  </p>
  <p style="font-size: 14px; line-height: 1.7; color: #c0c0c0; margin: 0 0 20px;">
    For a limited time, you'll get <strong style="color: #f59e0b;">60 days of GlowUp completely free</strong> — full access to every feature, no credit card needed.
  </p>
  <div style="background: #2a2a3e; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
    <p style="font-size: 13px; color: #ffffff; font-weight: 600; margin: 0 0 12px;">What's included:</p>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
      <div style="font-size: 12px; color: #c0c0c0;">✅ Smart booking system</div>
      <div style="font-size: 12px; color: #c0c0c0;">✅ Auto reminders (SMS/Email)</div>
      <div style="font-size: 12px; color: #c0c0c0;">✅ Photo-based client CRM</div>
      <div style="font-size: 12px; color: #c0c0c0;">✅ Revenue reports</div>
      <div style="font-size: 12px; color: #c0c0c0;">✅ "Fill My Openings" campaigns</div>
      <div style="font-size: 12px; color: #c0c0c0;">✅ Loyalty & gift cards</div>
    </div>
  </div>
  <div style="text-align: center; margin-bottom: 24px;">
    ${ctaButton(signupLink, '🔥 Claim Your Free 60 Days →')}
    <p style="font-size: 12px; color: #ef4444; margin: 12px 0 0; font-weight: 600;">Spots are limited — claim yours before they're gone</p>
  </div>
  ${footer(senderName, salon)}
</div>`;

    case 'follow_up':
      return `<div style="${baseStyles}">
  <div style="text-align: center; margin-bottom: 24px;">${logoHtml}</div>
  <p style="font-size: 16px; line-height: 1.6; color: #ffffff; margin: 0 0 16px;">Hi ${owner},</p>
  <p style="font-size: 14px; line-height: 1.7; color: #c0c0c0; margin: 0 0 16px;">
    I reached out recently about GlowUp for <strong style="color: #ffffff;">${salon}</strong> — just wanted to follow up in case my email got buried.
  </p>
  <p style="font-size: 14px; line-height: 1.7; color: #c0c0c0; margin: 0 0 20px;">
    I know running a salon is incredibly busy, so I'll keep this short: GlowUp automates the things that eat up your time — booking, reminders, client follow-ups — so you can focus on what you love.
  </p>
  <div style="background: #2a2a3e; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
    <p style="font-size: 13px; color: #d4a0e8; font-weight: 600; margin: 0 0 8px;">💡 Quick wins you'll see in Week 1:</p>
    <ul style="font-size: 13px; color: #c0c0c0; line-height: 2; margin: 0; padding-left: 18px;">
      <li>No-shows cut by 60% with auto reminders</li>
      <li>Clients booking online 24/7 (even while you sleep)</li>
      <li>Every client's history at your fingertips</li>
    </ul>
  </div>
  <div style="text-align: center; margin-bottom: 24px;">
    ${ctaButton(signupLink, 'Try GlowUp Free →')}
    <p style="font-size: 12px; color: #888; margin: 12px 0 0;">Takes 2 minutes. No credit card. Cancel anytime.</p>
  </div>
  <div style="text-align: center; margin-bottom: 16px;">
    <p style="font-size: 13px; color: #999;">
      Not interested? No worries — just reply "pass" and I won't reach out again. 🙏
    </p>
  </div>
  ${footer(senderName, salon)}
</div>`;

    default:
      return renderTemplate('feature_showcase', salonName, ownerName, signupLink, senderName);
  }
}
