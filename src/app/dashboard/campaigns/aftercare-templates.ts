/* ═══ Aftercare Templates ═══
 * Category-specific post-service care tips sent to clients.
 * Each template is an SMS-ready message with professional aftercare guidance. */

export interface AftercareTemplate {
  category: string;
  emoji: string;
  subject: string;
  message: string;
  tips: string[];
}

export const AFTERCARE_TEMPLATES: AftercareTemplate[] = [
  {
    category: "Hair - Color",
    emoji: "🎨",
    subject: "Your Color Aftercare Guide",
    message: "Hi {client_name}! Thank you for visiting {business_name} today! Here are some tips to keep your new color looking gorgeous:",
    tips: [
      "Wait 48-72 hours before washing your hair to let the color set",
      "Use sulfate-free shampoo & conditioner (we recommend Olaplex or Pureology)",
      "Wash with lukewarm or cool water — hot water opens the cuticle and fades color faster",
      "Avoid chlorinated pools and direct sun exposure for the first week",
      "Use a color-protecting UV spray when spending time outdoors",
      "Schedule your next color refresh in 6-8 weeks to maintain vibrancy",
    ],
  },
  {
    category: "Hair - Cut & Style",
    emoji: "✂️",
    subject: "Your Haircut Aftercare",
    message: "Hi {client_name}! Love your new look! Here's how to keep it fresh at home:",
    tips: [
      "Use the products your stylist recommended — they were chosen specifically for your hair type",
      "Brush/comb gently from ends to roots to avoid breakage",
      "Sleep on a silk or satin pillowcase to reduce frizz and maintain shape",
      "Trim every 6-8 weeks to maintain the shape and prevent split ends",
      "Avoid excessive heat styling — always use a heat protectant when you do",
    ],
  },
  {
    category: "Skin - Facial",
    emoji: "✨",
    subject: "Your Facial Aftercare Guide",
    message: "Hi {client_name}! Your skin is going to love you for today's treatment! A few things to keep in mind:",
    tips: [
      "Apply SPF 30+ daily for the next 7 days — your skin is extra sensitive post-facial",
      "Avoid active ingredients (retinol, AHAs, BHAs) for 24-48 hours",
      "Don't touch your face or pick at any extractions — let them heal naturally",
      "Skip heavy makeup for 24 hours to let your pores breathe",
      "Drink plenty of water to support detoxification and hydration from within",
      "Avoid saunas, steam rooms, and intense workouts for 24 hours",
    ],
  },
  {
    category: "Skin - Chemical Peel",
    emoji: "🧪",
    subject: "Chemical Peel Aftercare — Important!",
    message: "Hi {client_name}! Here's your post-peel care guide. Following these steps is essential for the best results:",
    tips: [
      "DO NOT pick or peel flaking skin — let it shed naturally",
      "Apply a gentle, fragrance-free moisturizer 2-3 times daily",
      "SPF 50+ is mandatory for the next 2 weeks — reapply every 2 hours if outdoors",
      "Avoid sweating, saunas, and hot showers for 48 hours",
      "No retinol, glycolic acid, or exfoliants for 7-14 days",
      "Contact us immediately if you experience unusual redness, blistering, or pain",
    ],
  },
  {
    category: "Nails",
    emoji: "💅",
    subject: "Your Nail Care Tips",
    message: "Hi {client_name}! Enjoy your beautiful nails! Here's how to make them last:",
    tips: [
      "Avoid submerging hands in hot water for 2 hours after your appointment",
      "Wear gloves when cleaning, washing dishes, or gardening",
      "Apply cuticle oil daily to keep nails hydrated and flexible",
      "Avoid using your nails as tools (opening cans, peeling stickers, etc.)",
      "If a nail chips or lifts, call us for a free repair within the first week",
      "Schedule your next fill-in/refresh in 2-3 weeks",
    ],
  },
  {
    category: "Lashes",
    emoji: "👁️",
    subject: "Lash Extension Aftercare",
    message: "Hi {client_name}! Your new lashes look amazing! Follow these tips to make them last 3-4 weeks:",
    tips: [
      "Avoid getting lashes wet for 24-48 hours after application",
      "Do NOT use oil-based products near your eyes (cleansers, makeup removers)",
      "Avoid rubbing, pulling, or sleeping face-down on your lashes",
      "Use a clean spoolie brush daily to keep them fluffy and separated",
      "Skip waterproof mascara — it requires oil-based remover to take off",
      "Schedule your fill appointment every 2-3 weeks",
      "Contact us if you experience any irritation or allergic reaction",
    ],
  },
  {
    category: "Brows",
    emoji: "🪮",
    subject: "Brow Aftercare Guide",
    message: "Hi {client_name}! Your brows are on point! Here's how to keep them perfect:",
    tips: [
      "Avoid touching the brow area for 24 hours to prevent irritation",
      "Apply the soothing serum/aloe we provided if there's any redness",
      "No makeup on the brow area for 24 hours",
      "Avoid direct sun exposure and tanning beds for 48 hours",
      "Use SPF on your brow area when outdoors",
      "Schedule your next shaping in 3-4 weeks to maintain the shape",
    ],
  },
  {
    category: "Waxing",
    emoji: "🌸",
    subject: "Waxing Aftercare Tips",
    message: "Hi {client_name}! Here's how to keep your skin smooth and happy after today's wax:",
    tips: [
      "Avoid hot baths, saunas, and intense exercise for 24 hours",
      "No tight clothing over waxed areas for the rest of the day",
      "Apply aloe vera or a gentle fragrance-free lotion if there's irritation",
      "Start gentle exfoliation after 48 hours (2-3 times per week) to prevent ingrowns",
      "Avoid direct sun exposure and tanning on waxed areas for 48 hours",
      "Don't shave between waxing appointments — let hair grow to ¼ inch for best results",
      "Schedule your next wax in 4-6 weeks for optimal timing",
    ],
  },
  {
    category: "Makeup",
    emoji: "💄",
    subject: "Your Makeup Touch-Up Tips",
    message: "Hi {client_name}! You look stunning! Here are some tips for the rest of your event:",
    tips: [
      "Blot (don't rub) any oil/shine with blotting papers",
      "Reapply lip color as needed — we used a long-wear formula that layers beautifully",
      "Avoid touching your face to keep the look fresh longer",
      "Use the setting spray we applied for a quick refresh if needed",
      "Remove makeup thoroughly tonight with a gentle cleanser (double-cleanse recommended)",
      "Apply a hydrating overnight mask to recover and nourish your skin",
    ],
  },
];

/** Get the aftercare template closest to a given service category */
export function getAftercareTemplate(category: string): AftercareTemplate {
  const lower = category.toLowerCase();
  const match = AFTERCARE_TEMPLATES.find(t => t.category.toLowerCase().includes(lower));
  return match || AFTERCARE_TEMPLATES[0]; // fallback to Hair Color
}

/** Format aftercare message with client/business name substitution */
export function formatAftercareMessage(template: AftercareTemplate, clientName: string, businessName: string): string {
  let msg = template.message
    .replace('{client_name}', clientName)
    .replace('{business_name}', businessName);
  msg += '\n\n';
  msg += template.tips.map((tip, i) => `${i + 1}. ${tip}`).join('\n');
  msg += '\n\n— The ' + businessName + ' Team 💕';
  return msg;
}
