/* ═══ Smart Upsell Rules ═══
 * Maps service categories to recommended add-on services.
 * Used at checkout to suggest complementary services. */

export interface UpsellRule {
  category: string;
  suggestions: { name: string; description: string; priceRange: string }[];
}

export const UPSELL_RULES: UpsellRule[] = [
  {
    category: "Hair",
    suggestions: [
      { name: "Deep Conditioning Treatment", description: "Restore moisture and shine after chemical processing", priceRange: "$15–$35" },
      { name: "Scalp Treatment", description: "Exfoliate & nourish for healthier growth", priceRange: "$20–$40" },
      { name: "Blowout / Style", description: "Professional styling to complete the look", priceRange: "$25–$45" },
      { name: "Olaplex Add-On", description: "Bond repair for color-treated hair", priceRange: "$25–$50" },
      { name: "Gloss / Toner Refresh", description: "Boost color vibrancy between appointments", priceRange: "$15–$30" },
    ],
  },
  {
    category: "Skin",
    suggestions: [
      { name: "LED Light Therapy", description: "Red or blue light to reduce inflammation", priceRange: "$20–$40" },
      { name: "Chemical Peel Add-On", description: "Deeper exfoliation for smoother texture", priceRange: "$30–$60" },
      { name: "Eye Treatment", description: "Target fine lines, puffiness, and dark circles", priceRange: "$15–$25" },
      { name: "Hydrating Mask Upgrade", description: "Premium mask for intense moisture boost", priceRange: "$10–$20" },
      { name: "Lip Treatment", description: "Exfoliate and hydrate for plumper lips", priceRange: "$10–$15" },
    ],
  },
  {
    category: "Nails",
    suggestions: [
      { name: "Gel Upgrade", description: "Switch from regular to gel for 2+ weeks wear", priceRange: "$10–$20" },
      { name: "Nail Art (per nail)", description: "Custom designs, foils, or chrome finish", priceRange: "$5–$15" },
      { name: "Paraffin Hand Treatment", description: "Deep moisture therapy for hands", priceRange: "$10–$20" },
      { name: "Extended Length / Tips", description: "Add length with tips or sculpted extensions", priceRange: "$15–$30" },
      { name: "Cuticle Care & Hand Massage", description: "Spa-level pampering add-on", priceRange: "$10–$15" },
    ],
  },
  {
    category: "Lashes",
    suggestions: [
      { name: "Lash Tint", description: "Darken natural lashes for a fuller look", priceRange: "$15–$25" },
      { name: "Brow Shaping", description: "Complete the eye frame with sculpted brows", priceRange: "$15–$25" },
      { name: "Under-Eye Collagen Pads", description: "De-puff and brighten during application", priceRange: "$5–$10" },
      { name: "Volume Upgrade", description: "Move from classic to hybrid or volume fans", priceRange: "$20–$40" },
    ],
  },
  {
    category: "Brows",
    suggestions: [
      { name: "Brow Tint", description: "Color enhancement for fuller-looking brows", priceRange: "$10–$20" },
      { name: "Brow Lamination", description: "Feathered, brushed-up look lasting 6-8 weeks", priceRange: "$40–$65" },
      { name: "Lash Lift", description: "Pair with brows for a complete eye refresh", priceRange: "$50–$75" },
      { name: "Soothing Serum Application", description: "Calm skin post-shaping", priceRange: "$5–$10" },
    ],
  },
  {
    category: "Makeup",
    suggestions: [
      { name: "False Lash Application", description: "Strip or individual lashes for extra drama", priceRange: "$10–$20" },
      { name: "Setting Spray (long-wear)", description: "Lock in the look for 12+ hours", priceRange: "$5–$10" },
      { name: "Lip Touch-Up Kit", description: "Take-home lip color for event reapplication", priceRange: "$10–$15" },
      { name: "Airbrush Foundation Upgrade", description: "Flawless, camera-ready finish", priceRange: "$15–$30" },
    ],
  },
  {
    category: "Waxing",
    suggestions: [
      { name: "Post-Wax Soothing Serum", description: "Aloe & chamomile to calm redness", priceRange: "$5–$10" },
      { name: "Ingrown Prevention Treatment", description: "Exfoliating serum for smooth regrowth", priceRange: "$10–$15" },
      { name: "Add Another Area", description: "Discount when bundling 2+ wax zones", priceRange: "$10–$25" },
      { name: "Brow Shape & Tint Combo", description: "Full brow refresh add-on", priceRange: "$20–$35" },
    ],
  },
];

/** Find upsell suggestions for a given service category */
export function getUpsellSuggestions(category: string) {
  const rule = UPSELL_RULES.find(r => r.category.toLowerCase() === category.toLowerCase());
  return rule?.suggestions || UPSELL_RULES[0].suggestions; // fallback to Hair
}
