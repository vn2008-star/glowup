/* ═══ Digital Intake Form Templates ═══
 * Category-specific new-client questionnaires.
 * Responses are stored in the client's `preferences` JSONB field. */

export interface IntakeField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'multi-select' | 'boolean';
  options?: string[];
  required?: boolean;
  placeholder?: string;
}

export interface IntakeTemplate {
  category: string;
  emoji: string;
  title: string;
  description: string;
  fields: IntakeField[];
}

const COMMON_FIELDS: IntakeField[] = [
  { key: 'allergies', label: 'Known Allergies or Sensitivities', type: 'textarea', placeholder: 'e.g., latex, certain fragrances, adhesives...', required: true },
  { key: 'medications', label: 'Current Medications or Treatments', type: 'textarea', placeholder: 'List any medications, topical treatments, or supplements' },
  { key: 'health_conditions', label: 'Relevant Health Conditions', type: 'textarea', placeholder: 'e.g., pregnancy, diabetes, autoimmune conditions...' },
  { key: 'referral_source', label: 'How did you hear about us?', type: 'select', options: ['Instagram', 'Google', 'Friend/Family', 'Walk-in', 'Yelp', 'Other'] },
];

export const INTAKE_TEMPLATES: IntakeTemplate[] = [
  {
    category: "Hair",
    emoji: "💇",
    title: "Hair Service Intake Form",
    description: "Help us understand your hair history and goals for the best results.",
    fields: [
      { key: 'hair_type', label: 'Hair Type', type: 'select', options: ['Straight (1)', 'Wavy (2A-2C)', 'Curly (3A-3C)', 'Coily (4A-4C)'], required: true },
      { key: 'hair_texture', label: 'Hair Texture', type: 'select', options: ['Fine', 'Medium', 'Coarse'] },
      { key: 'hair_density', label: 'Hair Density', type: 'select', options: ['Thin', 'Medium', 'Thick'] },
      { key: 'current_color', label: 'Current Hair Color', type: 'text', placeholder: 'Natural and/or current color' },
      { key: 'color_history', label: 'Color/Chemical History (past 12 months)', type: 'textarea', placeholder: 'e.g., highlights 3 months ago, keratin treatment 6 months ago...' },
      { key: 'scalp_concerns', label: 'Scalp Concerns', type: 'multi-select', options: ['None', 'Dryness/Flaking', 'Oiliness', 'Sensitivity', 'Thinning/Hair Loss', 'Psoriasis/Eczema'] },
      { key: 'hair_goals', label: 'Hair Goals', type: 'textarea', placeholder: 'What are you looking to achieve today?' },
      { key: 'heat_tools', label: 'Heat Tools Used Regularly', type: 'multi-select', options: ['None', 'Blow Dryer', 'Flat Iron', 'Curling Iron/Wand', 'Hot Rollers'] },
      ...COMMON_FIELDS,
    ],
  },
  {
    category: "Skin",
    emoji: "🧴",
    title: "Skin Care Intake Form",
    description: "Understanding your skin is essential for a safe and effective treatment.",
    fields: [
      { key: 'skin_type', label: 'Skin Type', type: 'select', options: ['Normal', 'Dry', 'Oily', 'Combination', 'Sensitive'], required: true },
      { key: 'skin_concerns', label: 'Primary Skin Concerns', type: 'multi-select', options: ['Acne/Breakouts', 'Aging/Fine Lines', 'Dark Spots/Hyperpigmentation', 'Redness/Rosacea', 'Dryness/Dehydration', 'Large Pores', 'Uneven Texture', 'Sun Damage'] },
      { key: 'current_routine', label: 'Current Skincare Routine', type: 'textarea', placeholder: 'List your daily products (cleanser, serum, moisturizer, SPF...)' },
      { key: 'retinoid_use', label: 'Do you use retinol/retinoids?', type: 'boolean' },
      { key: 'recent_procedures', label: 'Recent Facial Procedures (past 6 months)', type: 'textarea', placeholder: 'e.g., Botox, fillers, laser treatments, peels...' },
      { key: 'sun_exposure', label: 'Sun Exposure Level', type: 'select', options: ['Minimal (mostly indoors)', 'Moderate (some outdoor time)', 'High (frequent outdoor activity)'] },
      { key: 'skin_goals', label: 'Skin Goals', type: 'textarea', placeholder: 'What results are you hoping for?' },
      ...COMMON_FIELDS,
    ],
  },
  {
    category: "Nails",
    emoji: "💅",
    title: "Nail Service Intake Form",
    description: "Help us give you the perfect manicure/pedicure experience.",
    fields: [
      { key: 'nail_concerns', label: 'Nail Concerns', type: 'multi-select', options: ['None', 'Brittle/Breaking', 'Peeling', 'Discoloration', 'Fungal Issues', 'Ingrown Nails', 'Sensitivity to Products'] },
      { key: 'preferred_shape', label: 'Preferred Nail Shape', type: 'select', options: ['Round', 'Square', 'Squoval', 'Oval', 'Almond', 'Stiletto', 'Coffin/Ballerina', 'No Preference'] },
      { key: 'preferred_length', label: 'Preferred Length', type: 'select', options: ['Short', 'Medium', 'Long', 'Extra Long'] },
      { key: 'gel_acrylic_history', label: 'Gel/Acrylic History', type: 'textarea', placeholder: 'Have you had gel or acrylic before? Any reactions?' },
      { key: 'nail_goals', label: 'What are you looking for today?', type: 'textarea', placeholder: 'e.g., natural look, bold colors, nail art...' },
      ...COMMON_FIELDS,
    ],
  },
  {
    category: "Lashes",
    emoji: "👁️",
    title: "Lash Extension Intake Form",
    description: "Safety first! Help us customize the perfect lash look for you.",
    fields: [
      { key: 'lash_experience', label: 'Lash Extension Experience', type: 'select', options: ['First time', 'Had them before', 'Regular client elsewhere'], required: true },
      { key: 'lash_style', label: 'Desired Style', type: 'select', options: ['Natural', 'Classic', 'Hybrid', 'Volume', 'Mega Volume', 'Cat Eye', 'Doll Eye', 'Not Sure'] },
      { key: 'eye_sensitivity', label: 'Eye Sensitivity', type: 'boolean' },
      { key: 'contact_lenses', label: 'Do you wear contact lenses?', type: 'boolean' },
      { key: 'previous_reactions', label: 'Previous Reactions to Lash Adhesive', type: 'textarea', placeholder: 'Any itching, redness, or swelling from past applications?' },
      { key: 'lash_goals', label: 'What look are you going for?', type: 'textarea', placeholder: 'Describe your ideal lash look' },
      ...COMMON_FIELDS,
    ],
  },
  {
    category: "Waxing",
    emoji: "🌸",
    title: "Waxing Intake Form",
    description: "Important safety information for your waxing service.",
    fields: [
      { key: 'wax_experience', label: 'Waxing Experience', type: 'select', options: ['First time', 'Occasional', 'Regular'], required: true },
      { key: 'skin_sensitivity', label: 'Skin Sensitivity Level', type: 'select', options: ['Normal', 'Somewhat Sensitive', 'Very Sensitive'] },
      { key: 'retinoid_use', label: 'Are you using retinol, Accutane, or AHAs?', type: 'boolean' },
      { key: 'recent_sunburn', label: 'Any recent sunburn in the area?', type: 'boolean' },
      { key: 'pregnancy', label: 'Are you currently pregnant?', type: 'boolean' },
      { key: 'wax_areas', label: 'Areas to be waxed', type: 'multi-select', options: ['Eyebrows', 'Upper Lip', 'Chin', 'Full Face', 'Underarms', 'Arms', 'Legs', 'Bikini', 'Brazilian', 'Back', 'Chest'] },
      ...COMMON_FIELDS,
    ],
  },
];

/** Get intake template for a given service category */
export function getIntakeTemplate(category: string): IntakeTemplate {
  const lower = category.toLowerCase();
  const match = INTAKE_TEMPLATES.find(t => t.category.toLowerCase() === lower);
  return match || INTAKE_TEMPLATES[0]; // fallback to Hair
}
