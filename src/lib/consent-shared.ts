// ─── Consent forms: the parts safe to import from client components ───
// Types, defaults and the settings reader. Tokens, hashing and the status
// check need node:crypto and live in lib/consent.ts (server only).

export interface ConsentQuestion { id: string; label: string }

export interface ConsentFormConfig {
  enabled: boolean
  questions: ConsentQuestion[]
  terms: string
  photo_consent: boolean
  /** Ask the client to sign again after this many months (0 = never) */
  resign_months: number
}

export interface SignedConsent {
  signed_at: string
  name: string
  answers: Record<string, boolean>
  allergies: string
  photo_consent: boolean
  /** Hash of the terms + questions the client saw, so an edited form can be told apart */
  form_hash: string
  signature_path: string | null
  /** 'web' (client, from the booking/manage link) or 'kiosk' (Front Desk tablet) */
  via: 'web' | 'kiosk'
}

export type ConsentState =
  | { status: 'none' }
  | { status: 'valid'; signed_at: string; name: string }
  | { status: 'expired'; signed_at: string; name: string }
  | { status: 'outdated'; signed_at: string; name: string } // form changed since they signed

export const DEFAULT_CONSENT_QUESTIONS: ConsentQuestion[] = [
  { id: 'reaction', label: 'Have you ever had a reaction to lash adhesive, glue, hair dye or cosmetics?' },
  { id: 'eye', label: 'Do you currently have an eye infection, irritation, stye, or recent eye surgery?' },
  { id: 'skin', label: 'Do you have sensitive skin, eczema, psoriasis or open skin in the treatment area?' },
  { id: 'pregnant', label: 'Are you pregnant or breastfeeding?' },
  { id: 'contacts', label: 'Do you wear contact lenses?' },
  { id: 'medication', label: 'Are you taking medication that affects skin or healing (for example Accutane or blood thinners)?' },
  { id: 'chemo', label: 'Have you had chemotherapy or radiation in the past 12 months?' },
]

export const DEFAULT_CONSENT_TERMS = `I understand that beauty services such as lash extensions, lash lifts, brow lamination, tinting and waxing use adhesives and products that can cause irritation or an allergic reaction in some people, even if I have had the service before without a problem. I have answered the questions above honestly and will tell my technician about any change in my health, medication or skin before each visit.

I agree to follow the aftercare instructions I am given. I understand that results vary, that I can ask to stop at any time, and that the salon may decline a service if it believes it is not safe for me.`

export const DEFAULT_CONSENT_FORM: ConsentFormConfig = {
  enabled: false,
  questions: DEFAULT_CONSENT_QUESTIONS,
  terms: DEFAULT_CONSENT_TERMS,
  photo_consent: true,
  resign_months: 12,
}

/** The salon's form, with defaults filled in for anything unset. */
export function resolveConsentForm(settings: Record<string, unknown> | null | undefined): ConsentFormConfig {
  const raw = ((settings || {}) as Record<string, unknown>).consent_form as Partial<ConsentFormConfig> | undefined
  if (!raw || typeof raw !== 'object') return DEFAULT_CONSENT_FORM
  const questions = Array.isArray(raw.questions)
    ? raw.questions.filter((q): q is ConsentQuestion => !!q && typeof q.id === 'string' && typeof q.label === 'string' && q.label.trim().length > 0).slice(0, 30)
    : DEFAULT_CONSENT_QUESTIONS
  return {
    enabled: raw.enabled === true,
    questions,
    terms: typeof raw.terms === 'string' && raw.terms.trim() ? raw.terms.slice(0, 5000) : DEFAULT_CONSENT_TERMS,
    photo_consent: raw.photo_consent !== false,
    resign_months: Number.isFinite(Number(raw.resign_months)) ? Math.max(0, Math.min(60, Math.round(Number(raw.resign_months)))) : 12,
  }
}

/**
 * The consent link to put next to a manage link in confirmations: same
 * token, different page. Empty when the salon hasn't turned the form on.
 */
export function consentLinkFromManage(manageLink: string, settings: Record<string, unknown> | null | undefined): string {
  if (!manageLink || !resolveConsentForm(settings).enabled) return ''
  return manageLink.replace('/manage/', '/consent/')
}

export function readSignedConsent(preferences: unknown): SignedConsent | null {
  const c = (preferences && typeof preferences === 'object' ? (preferences as Record<string, unknown>).consent : null) as SignedConsent | null | undefined
  return c && typeof c === 'object' && typeof c.signed_at === 'string' ? c : null
}
