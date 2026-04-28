/* ─── Service Catalog: Pre-built templates by Beauty Professional Type ─── */

export interface ServiceTemplate {
  name: string;
  category: string;
  duration_minutes: number;
  price: number;
  description: string;
}

export interface ServiceCategory {
  id: string;
  label: string;
  icon: string;
  color: string;
  description: string;
  templates: ServiceTemplate[];
}

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  {
    id: "hair",
    label: "Hair Styling",
    icon: "✂️",
    color: "#C37EDA",
    description: "Cutting, styling, coloring & chemical services",
    templates: [
      { name: "Women's Haircut & Style", category: "Hair Styling", duration_minutes: 60, price: 65, description: "Precision cut with shampoo, conditioning, and blowout styling." },
      { name: "Men's Haircut", category: "Hair Styling", duration_minutes: 30, price: 35, description: "Classic or modern cut tailored to your style." },
      { name: "Children's Haircut", category: "Hair Styling", duration_minutes: 30, price: 25, description: "Gentle haircut for kids under 12." },
      { name: "Blowout & Style", category: "Hair Styling", duration_minutes: 45, price: 45, description: "Shampoo and professional blowout styling." },
      { name: "Full Color", category: "Hair Styling", duration_minutes: 120, price: 150, description: "All-over single-process color application." },
      { name: "Highlights — Partial", category: "Hair Styling", duration_minutes: 90, price: 120, description: "Face-framing foil highlights for natural dimension." },
      { name: "Highlights — Full", category: "Hair Styling", duration_minutes: 150, price: 200, description: "Full head foil highlights with toner." },
      { name: "Balayage / Ombré", category: "Hair Styling", duration_minutes: 180, price: 250, description: "Hand-painted highlights for a natural, sun-kissed look." },
      { name: "Color Correction", category: "Hair Styling", duration_minutes: 240, price: 350, description: "Multi-step process to fix unwanted color results." },
      { name: "Keratin Treatment", category: "Hair Styling", duration_minutes: 150, price: 300, description: "Smoothing treatment to reduce frizz and add shine for up to 3 months." },
      { name: "Deep Conditioning Treatment", category: "Hair Styling", duration_minutes: 30, price: 35, description: "Intensive moisture treatment for damaged or dry hair." },
      { name: "Updo / Special Occasion", category: "Hair Styling", duration_minutes: 60, price: 85, description: "Elegant updo for weddings, proms, and special events." },
      { name: "Brazilian Blowout", category: "Hair Styling", duration_minutes: 120, price: 280, description: "Professional smoothing treatment for frizz-free, shiny hair." },
      { name: "Hair Extensions — Install", category: "Hair Styling", duration_minutes: 180, price: 400, description: "Professional installation of tape-in or clip-in extensions." },
      { name: "Gloss / Toner", category: "Hair Styling", duration_minutes: 30, price: 45, description: "Semi-permanent gloss to refresh color and add shine." },
    ],
  },
  {
    id: "skin",
    label: "Skincare & Facials",
    icon: "🧖",
    color: "#E8A0BF",
    description: "Facials, peels, microdermabrasion & skin therapy",
    templates: [
      { name: "Classic Facial", category: "Skincare & Facials", duration_minutes: 60, price: 85, description: "Deep cleansing facial with extraction, mask, and moisturizer." },
      { name: "Hydrating Facial", category: "Skincare & Facials", duration_minutes: 60, price: 95, description: "Intense hydration treatment for dry or dehydrated skin." },
      { name: "Anti-Aging Facial", category: "Skincare & Facials", duration_minutes: 75, price: 120, description: "Targeted treatment with peptides and retinol to reduce fine lines." },
      { name: "Acne Treatment Facial", category: "Skincare & Facials", duration_minutes: 60, price: 95, description: "Deep pore cleansing with salicylic acid and LED therapy." },
      { name: "Chemical Peel — Light", category: "Skincare & Facials", duration_minutes: 30, price: 100, description: "Glycolic or lactic acid peel for brightening and texture improvement." },
      { name: "Chemical Peel — Medium", category: "Skincare & Facials", duration_minutes: 45, price: 175, description: "TCA peel targeting sun damage, hyperpigmentation, and fine lines." },
      { name: "Microdermabrasion", category: "Skincare & Facials", duration_minutes: 45, price: 130, description: "Crystal or diamond-tip exfoliation for smoother, brighter skin." },
      { name: "Dermaplaning", category: "Skincare & Facials", duration_minutes: 30, price: 75, description: "Gentle exfoliation removing dead skin and peach fuzz for a flawless canvas." },
      { name: "LED Light Therapy", category: "Skincare & Facials", duration_minutes: 20, price: 50, description: "Red and blue LED treatment to stimulate collagen and reduce bacteria." },
      { name: "Oxygen Facial", category: "Skincare & Facials", duration_minutes: 60, price: 150, description: "Pressurized oxygen infusion with hyaluronic acid for instant glow." },
      { name: "Microneedling", category: "Skincare & Facials", duration_minutes: 60, price: 250, description: "Collagen-induction therapy to improve texture, scars, and wrinkles." },
      { name: "Back Facial", category: "Skincare & Facials", duration_minutes: 45, price: 80, description: "Deep cleansing and exfoliation treatment for the back area." },
    ],
  },
  {
    id: "nails",
    label: "Nails",
    icon: "💅",
    color: "#F2A7C3",
    description: "Manicures, pedicures, gel, acrylics & nail art",
    templates: [
      { name: "Classic Manicure", category: "Nails", duration_minutes: 30, price: 25, description: "Nail shaping, cuticle care, hand massage, and polish application." },
      { name: "Gel Manicure", category: "Nails", duration_minutes: 45, price: 40, description: "Long-lasting gel polish manicure with UV cure." },
      { name: "Dip Powder Manicure", category: "Nails", duration_minutes: 45, price: 45, description: "Durable dip powder application for chip-free nails up to 4 weeks." },
      { name: "Full Set — Acrylic", category: "Nails", duration_minutes: 75, price: 55, description: "Full set of sculpted acrylic nail extensions." },
      { name: "Full Set — Gel Extensions", category: "Nails", duration_minutes: 90, price: 75, description: "Lightweight gel extensions for a natural look and feel." },
      { name: "Acrylic Fill", category: "Nails", duration_minutes: 45, price: 35, description: "Maintenance fill for existing acrylic nails." },
      { name: "Nail Art — Simple", category: "Nails", duration_minutes: 15, price: 10, description: "Per nail: accent designs, glitter, foils, or simple patterns." },
      { name: "Nail Art — Complex", category: "Nails", duration_minutes: 30, price: 25, description: "Per nail: hand-painted designs, 3D art, or intricate patterns." },
      { name: "Classic Pedicure", category: "Nails", duration_minutes: 45, price: 35, description: "Foot soak, callus removal, nail shaping, massage, and polish." },
      { name: "Gel Pedicure", category: "Nails", duration_minutes: 60, price: 55, description: "Luxurious pedicure with long-lasting gel polish finish." },
      { name: "Spa Pedicure", category: "Nails", duration_minutes: 75, price: 65, description: "Deluxe pedicure with paraffin wax, sugar scrub, and extended massage." },
      { name: "Gel Removal", category: "Nails", duration_minutes: 20, price: 15, description: "Safe removal of gel or dip powder with cuticle oil treatment." },
      { name: "Acrylic Removal", category: "Nails", duration_minutes: 30, price: 20, description: "Full soak-off removal of acrylic nails with nail conditioning." },
      { name: "Nail Repair", category: "Nails", duration_minutes: 15, price: 10, description: "Single nail fix — crack repair, silk wrap, or re-tip." },
    ],
  },
  {
    id: "lashes",
    label: "Lashes & Brows",
    icon: "👁️",
    color: "#B8A9D4",
    description: "Extensions, lifts, tinting, microblading & lamination",
    templates: [
      { name: "Classic Lash Extensions — Full Set", category: "Lashes & Brows", duration_minutes: 120, price: 180, description: "One extension per natural lash for a subtle, elegant look." },
      { name: "Volume Lash Extensions — Full Set", category: "Lashes & Brows", duration_minutes: 150, price: 250, description: "Handmade fans of 2–6 lashes for dramatic, full volume." },
      { name: "Hybrid Lash Extensions — Full Set", category: "Lashes & Brows", duration_minutes: 135, price: 220, description: "Mix of classic and volume for textured, dimensional lashes." },
      { name: "Lash Fill — 2 Week", category: "Lashes & Brows", duration_minutes: 60, price: 75, description: "Maintenance fill to replace grown-out or shed lash extensions." },
      { name: "Lash Fill — 3 Week", category: "Lashes & Brows", duration_minutes: 75, price: 95, description: "Extended fill for lashes with more gaps to address." },
      { name: "Lash Lift & Tint", category: "Lashes & Brows", duration_minutes: 60, price: 85, description: "Semi-permanent curl and color for natural lashes — lasts 6–8 weeks." },
      { name: "Lash Tint", category: "Lashes & Brows", duration_minutes: 20, price: 25, description: "Semi-permanent dye for darker, more defined natural lashes." },
      { name: "Lash Extension Removal", category: "Lashes & Brows", duration_minutes: 30, price: 35, description: "Safe, gentle removal of all lash extensions." },
      { name: "Brow Shaping — Wax", category: "Lashes & Brows", duration_minutes: 15, price: 20, description: "Precision wax shaping tailored to your face structure." },
      { name: "Brow Shaping — Thread", category: "Lashes & Brows", duration_minutes: 20, price: 25, description: "Detailed threading for clean, defined brow lines." },
      { name: "Brow Tint", category: "Lashes & Brows", duration_minutes: 15, price: 20, description: "Semi-permanent vegetable dye to enhance brow color and fullness." },
      { name: "Brow Lamination", category: "Lashes & Brows", duration_minutes: 45, price: 65, description: "Restructuring treatment for fluffy, brushed-up brows — lasts 6 weeks." },
      { name: "Brow Lamination + Tint", category: "Lashes & Brows", duration_minutes: 60, price: 80, description: "Full brow transformation with lamination and custom tint." },
      { name: "Microblading", category: "Lashes & Brows", duration_minutes: 120, price: 400, description: "Semi-permanent tattoo technique for natural-looking, hair-stroke brows." },
      { name: "Microblading Touch-Up", category: "Lashes & Brows", duration_minutes: 60, price: 150, description: "4–8 week follow-up to perfect shape and color retention." },
    ],
  },
  {
    id: "barbering",
    label: "Barbering",
    icon: "💈",
    color: "#7EB8DA",
    description: "Cuts, fades, shaves, beard grooming & grooming packages",
    templates: [
      { name: "Men's Haircut & Style", category: "Barbering", duration_minutes: 30, price: 30, description: "Classic or modern cut with styling." },
      { name: "Skin Fade", category: "Barbering", duration_minutes: 40, price: 35, description: "Precision skin fade with blending and lineup." },
      { name: "Buzz Cut", category: "Barbering", duration_minutes: 20, price: 20, description: "All-over clipper cut at your chosen guard length." },
      { name: "Straight Razor Shave", category: "Barbering", duration_minutes: 30, price: 35, description: "Traditional hot towel straight razor shave with aftershave." },
      { name: "Beard Trim & Shape", category: "Barbering", duration_minutes: 20, price: 20, description: "Beard grooming with precise line-up and neck cleanup." },
      { name: "Beard Design / Sculpting", category: "Barbering", duration_minutes: 30, price: 30, description: "Custom beard shaping and detailing with razor lines." },
      { name: "Haircut + Beard Combo", category: "Barbering", duration_minutes: 45, price: 50, description: "Full haircut with beard trim, line-up, and hot towel." },
      { name: "Kid's Cut (Under 12)", category: "Barbering", duration_minutes: 20, price: 20, description: "Fun, patient haircut for children." },
      { name: "Line-Up / Edge-Up", category: "Barbering", duration_minutes: 15, price: 15, description: "Razor-sharp hairline and temple cleanup." },
      { name: "Hot Towel Facial", category: "Barbering", duration_minutes: 20, price: 25, description: "Relaxing hot towel treatment with facial massage." },
      { name: "Scalp Treatment", category: "Barbering", duration_minutes: 30, price: 35, description: "Exfoliating scalp treatment with massage and conditioning." },
      { name: "Gray Blending / Camo Color", category: "Barbering", duration_minutes: 30, price: 40, description: "Subtle color blending to reduce gray by 50–70%." },
    ],
  },
  {
    id: "makeup",
    label: "Makeup",
    icon: "💄",
    color: "#E07B7B",
    description: "Application, bridal, editorial & special event makeup",
    templates: [
      { name: "Full Glam Makeup", category: "Makeup", duration_minutes: 60, price: 85, description: "Full-face makeup application with false lashes for any occasion." },
      { name: "Natural / Everyday Makeup", category: "Makeup", duration_minutes: 45, price: 65, description: "Soft, natural look enhancing your features with a polished finish." },
      { name: "Bridal Makeup", category: "Makeup", duration_minutes: 90, price: 200, description: "Long-wear bridal makeup with airbrush option — includes touch-up kit." },
      { name: "Bridal Trial", category: "Makeup", duration_minutes: 90, price: 120, description: "Pre-wedding trial to finalize your bridal look." },
      { name: "Bridesmaid Makeup", category: "Makeup", duration_minutes: 45, price: 75, description: "Coordinated makeup for bridal party members." },
      { name: "Prom / Homecoming Makeup", category: "Makeup", duration_minutes: 45, price: 60, description: "Age-appropriate glam for school events." },
      { name: "Editorial / Fashion Makeup", category: "Makeup", duration_minutes: 90, price: 150, description: "Creative, high-fashion makeup for photoshoots and editorials." },
      { name: "Makeup Lesson", category: "Makeup", duration_minutes: 60, price: 100, description: "One-on-one tutorial teaching techniques for your face shape and skin type." },
      { name: "Lash Application (Strip)", category: "Makeup", duration_minutes: 10, price: 15, description: "Professional application of strip false lashes." },
      { name: "Airbrush Makeup", category: "Makeup", duration_minutes: 60, price: 120, description: "Flawless, long-lasting airbrush foundation application." },
    ],
  },
  {
    id: "waxing",
    label: "Waxing & Hair Removal",
    icon: "🪒",
    color: "#D4A76A",
    description: "Full body waxing, sugaring, laser & electrolysis",
    templates: [
      { name: "Eyebrow Wax", category: "Waxing & Hair Removal", duration_minutes: 15, price: 15, description: "Quick and precise brow shaping with hard or soft wax." },
      { name: "Lip Wax", category: "Waxing & Hair Removal", duration_minutes: 10, price: 10, description: "Gentle upper lip hair removal." },
      { name: "Chin Wax", category: "Waxing & Hair Removal", duration_minutes: 10, price: 12, description: "Quick chin area hair removal." },
      { name: "Full Face Wax", category: "Waxing & Hair Removal", duration_minutes: 30, price: 45, description: "Complete facial waxing — brows, lip, chin, cheeks, and jawline." },
      { name: "Underarm Wax", category: "Waxing & Hair Removal", duration_minutes: 15, price: 20, description: "Smooth underarm waxing with soothing post-wax care." },
      { name: "Half Arm Wax", category: "Waxing & Hair Removal", duration_minutes: 20, price: 30, description: "Forearm waxing from wrist to elbow." },
      { name: "Full Arm Wax", category: "Waxing & Hair Removal", duration_minutes: 30, price: 45, description: "Complete arm waxing from wrist to shoulder." },
      { name: "Half Leg Wax", category: "Waxing & Hair Removal", duration_minutes: 30, price: 40, description: "Lower leg waxing from ankle to knee." },
      { name: "Full Leg Wax", category: "Waxing & Hair Removal", duration_minutes: 45, price: 70, description: "Complete leg waxing from ankle to upper thigh." },
      { name: "Bikini Wax", category: "Waxing & Hair Removal", duration_minutes: 20, price: 35, description: "Bikini line cleanup for a clean, comfortable finish." },
      { name: "Brazilian Wax", category: "Waxing & Hair Removal", duration_minutes: 30, price: 60, description: "Full Brazilian with hard wax for minimal irritation." },
      { name: "Back Wax", category: "Waxing & Hair Removal", duration_minutes: 30, price: 50, description: "Full back waxing from shoulders to waistline." },
      { name: "Chest Wax", category: "Waxing & Hair Removal", duration_minutes: 30, price: 50, description: "Full chest hair removal with soothing aftercare." },
      { name: "Full Body Sugaring", category: "Waxing & Hair Removal", duration_minutes: 120, price: 200, description: "Natural sugar paste hair removal — gentler on sensitive skin." },
    ],
  },
  {
    id: "massage",
    label: "Massage & Body",
    icon: "💆",
    color: "#8BC5A3",
    description: "Body treatments, massage therapy & relaxation services",
    templates: [
      { name: "Swedish Massage — 60 min", category: "Massage & Body", duration_minutes: 60, price: 90, description: "Relaxing full-body massage with long, flowing strokes." },
      { name: "Swedish Massage — 90 min", category: "Massage & Body", duration_minutes: 90, price: 130, description: "Extended relaxation massage for deeper stress relief." },
      { name: "Deep Tissue Massage — 60 min", category: "Massage & Body", duration_minutes: 60, price: 110, description: "Firm pressure targeting deep muscle tension and knots." },
      { name: "Hot Stone Massage", category: "Massage & Body", duration_minutes: 75, price: 120, description: "Heated basalt stones combined with massage for deep relaxation." },
      { name: "Prenatal Massage", category: "Massage & Body", duration_minutes: 60, price: 95, description: "Gentle, safe massage designed for expectant mothers." },
      { name: "Aromatherapy Massage", category: "Massage & Body", duration_minutes: 60, price: 100, description: "Custom essential oil blend massage for mind-body balance." },
      { name: "Body Scrub & Wrap", category: "Massage & Body", duration_minutes: 60, price: 95, description: "Full-body exfoliation followed by a hydrating body wrap." },
      { name: "Paraffin Hand Treatment", category: "Massage & Body", duration_minutes: 20, price: 25, description: "Warm paraffin wax treatment to soften and moisturize hands." },
    ],
  },
];

/* Flat list of all category IDs for the dropdown */
export const ALL_CATEGORY_IDS = SERVICE_CATEGORIES.map((c) => c.id);
export const ALL_CATEGORY_LABELS = SERVICE_CATEGORIES.map((c) => c.label);

/* Lookup helpers */
export function getCategoryByLabel(label: string): ServiceCategory | undefined {
  return SERVICE_CATEGORIES.find((c) => c.label === label);
}

export function getCategoryById(id: string): ServiceCategory | undefined {
  return SERVICE_CATEGORIES.find((c) => c.id === id);
}
