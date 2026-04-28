/* ─── Staff Professional Types & Specialties ─── */

export interface ProfessionalType {
  id: string;
  title: string;
  icon: string;
  color: string;
  aliases: string[];
  specialties: string[];
}

export const PROFESSIONAL_TYPES: ProfessionalType[] = [
  {
    id: "hairstylist",
    title: "Hairstylist / Hairdresser",
    icon: "✂️",
    color: "#C37EDA",
    aliases: ["Stylist", "Colorist", "Hair Designer"],
    specialties: [
      "Women's Cuts", "Men's Cuts", "Children's Cuts",
      "Blowouts & Styling", "Updos & Special Occasion",
      "Single Process Color", "Highlights & Lowlights",
      "Balayage & Ombré", "Color Correction",
      "Keratin Treatments", "Brazilian Blowout",
      "Hair Extensions", "Deep Conditioning",
      "Perms & Relaxers", "Textured Hair",
      "Curly Hair Specialist", "Bridal Hair",
    ],
  },
  {
    id: "esthetician",
    title: "Esthetician / Skincare Specialist",
    icon: "🧖",
    color: "#E8A0BF",
    aliases: ["Skin Therapist", "Facialist", "Medical Esthetician"],
    specialties: [
      "Classic Facials", "Hydrating Treatments",
      "Anti-Aging & Rejuvenation", "Acne Treatment",
      "Chemical Peels", "Microdermabrasion",
      "Dermaplaning", "Microneedling",
      "LED Light Therapy", "Oxygen Facials",
      "Extractions", "Back Facials",
      "Sensitive Skin", "Hyperpigmentation",
      "Post-Procedure Care", "Holistic Skincare",
    ],
  },
  {
    id: "nail_tech",
    title: "Nail Technician / Manicurist",
    icon: "💅",
    color: "#F2A7C3",
    aliases: ["Nail Artist", "Pedicurist", "Nail Designer"],
    specialties: [
      "Classic Manicure", "Gel Manicure",
      "Dip Powder", "Acrylic Full Sets",
      "Gel Extensions", "Acrylic Fills",
      "Nail Art — Simple", "Nail Art — Complex",
      "3D Nail Art", "Hand-Painted Designs",
      "Classic Pedicure", "Spa Pedicure",
      "Gel Pedicure", "Nail Repair",
      "Polygel", "Chrome & Mirror Nails",
      "Encapsulated Designs", "Press-On Nails",
    ],
  },
  {
    id: "lash_brow",
    title: "Lash & Brow Specialist",
    icon: "👁️",
    color: "#B8A9D4",
    aliases: ["Lash Technician", "Brow Artist", "Lash Artist"],
    specialties: [
      "Classic Lash Extensions", "Volume Lashes",
      "Hybrid Lashes", "Mega Volume",
      "Lash Lifts", "Lash Tinting",
      "Lash Removal", "Bottom Lash Extensions",
      "Brow Waxing", "Brow Threading",
      "Brow Tinting", "Brow Lamination",
      "Microblading", "Microshading",
      "Powder Brows", "Ombré Brows",
      "Combo Brows", "Brow Mapping",
    ],
  },
  {
    id: "barber",
    title: "Barber",
    icon: "💈",
    color: "#7EB8DA",
    aliases: ["Barber Stylist", "Master Barber", "Groomer"],
    specialties: [
      "Classic Cuts", "Skin Fades",
      "Taper Fades", "Buzz Cuts",
      "Straight Razor Shave", "Beard Trimming",
      "Beard Design & Sculpting", "Line-Ups & Edge-Ups",
      "Kids' Cuts", "Hot Towel Facial",
      "Scalp Treatments", "Gray Blending",
      "Hair Designs / Patterns", "Afro & Textured Hair",
      "Pompadour & Classic Styles",
    ],
  },
  {
    id: "makeup_artist",
    title: "Makeup Artist",
    icon: "💄",
    color: "#E07B7B",
    aliases: ["MUA", "Cosmetic Artist", "Beauty Artist"],
    specialties: [
      "Full Glam", "Natural & Everyday",
      "Bridal Makeup", "Bridesmaid & Wedding Party",
      "Prom & Homecoming", "Editorial & Fashion",
      "Airbrush Makeup", "SFX Makeup",
      "Film & TV Makeup", "Photoshoot Makeup",
      "Makeup Lessons", "Lash Application",
      "Contouring & Sculpting", "Color Theory",
      "Mature Skin", "Sensitive Skin",
    ],
  },
  {
    id: "waxing_specialist",
    title: "Waxing & Hair Removal Specialist",
    icon: "🪒",
    color: "#D4A76A",
    aliases: ["Electrologist", "Waxing Specialist", "Hair Removal Tech"],
    specialties: [
      "Facial Waxing", "Eyebrow Waxing",
      "Full Face Waxing", "Body Waxing",
      "Brazilian Waxing", "Bikini Waxing",
      "Full Leg Waxing", "Full Arm Waxing",
      "Back & Chest Waxing", "Hard Wax Specialist",
      "Sugaring", "Threading",
      "Laser Hair Removal", "Electrolysis",
      "Sensitive Skin Specialist",
    ],
  },
  {
    id: "massage_therapist",
    title: "Massage Therapist / Body Worker",
    icon: "💆",
    color: "#8BC5A3",
    aliases: ["LMT", "Bodywork Specialist", "Spa Therapist"],
    specialties: [
      "Swedish Massage", "Deep Tissue",
      "Hot Stone Massage", "Prenatal Massage",
      "Aromatherapy", "Sports Massage",
      "Trigger Point Therapy", "Lymphatic Drainage",
      "Body Scrubs & Wraps", "Paraffin Treatments",
      "Reflexology", "Cupping",
      "Myofascial Release", "Craniosacral Therapy",
    ],
  },
  {
    id: "salon_manager",
    title: "Salon Manager",
    icon: "📋",
    color: "#9BAEC8",
    aliases: ["Front Desk Manager", "Operations Manager", "Spa Director"],
    specialties: [
      "Staff Scheduling", "Inventory Management",
      "Client Relations", "Sales & Upselling",
      "Marketing & Promotions", "Financial Reporting",
      "Training & Development", "Vendor Relations",
      "Compliance & Licensing", "Social Media Management",
    ],
  },
];

/* Flat list of all professional titles */
export const ALL_PROFESSIONAL_TITLES = PROFESSIONAL_TYPES.map((p) => p.title);

/* Lookup helper */
export function getProfessionalType(title: string): ProfessionalType | undefined {
  return PROFESSIONAL_TYPES.find((p) => p.title === title);
}

export function getProfessionalTypeById(id: string): ProfessionalType | undefined {
  return PROFESSIONAL_TYPES.find((p) => p.id === id);
}
