// Seed data for Luxe Nails & Spa demo
export const PHOTO_DIR = 'C:\\Users\\meeeeee\\.gemini\\antigravity\\brain\\639a47f5-fdd4-4e50-b0fc-026fa25b9000';

export const STAFF = [
  { name: 'Lisa Nguyen', role: 'owner', email: 'lisa@luxenails.com', phone: '(916) 555-0101', specialties: ['Gel Extensions', 'Nail Art', 'Spa Pedicure'], commission_rate: 0, photoPrefix: 'staff_lisa_nguyen' },
  { name: 'Amy Tran', role: 'manager', email: 'amy@luxenails.com', phone: '(916) 555-0102', specialties: ['Acrylic Nails', 'Dip Powder', 'Manicure'], commission_rate: 55, photoPrefix: 'staff_amy_tran' },
  { name: 'Mai Pham', role: 'technician', email: 'mai@luxenails.com', phone: '(916) 555-0103', specialties: ['Gel Polish', 'Pedicure', 'Nail Art'], commission_rate: 50, photoPrefix: 'staff_mai_pham' },
  { name: 'Jenny Kim', role: 'technician', email: 'jenny@luxenails.com', phone: '(916) 555-0104', specialties: ['Acrylic Full Set', 'Chrome Nails', 'French Tips'], commission_rate: 50, photoPrefix: 'staff_jenny_kim' },
];

export const SERVICES = [
  { name: 'Classic Manicure', category: 'Manicure', duration_minutes: 30, price: 25, sort_order: 1, commission_rate: 40 },
  { name: 'Gel Manicure', category: 'Manicure', duration_minutes: 45, price: 40, sort_order: 2, commission_rate: 45 },
  { name: 'Dip Powder Manicure', category: 'Manicure', duration_minutes: 50, price: 50, sort_order: 3, commission_rate: 45 },
  { name: 'Acrylic Full Set', category: 'Acrylic', duration_minutes: 75, price: 65, sort_order: 4, commission_rate: 50 },
  { name: 'Acrylic Fill', category: 'Acrylic', duration_minutes: 45, price: 40, sort_order: 5, commission_rate: 45 },
  { name: 'Gel Extensions', category: 'Gel', duration_minutes: 90, price: 85, sort_order: 6, commission_rate: 50 },
  { name: 'Classic Pedicure', category: 'Pedicure', duration_minutes: 45, price: 35, sort_order: 7, commission_rate: 40 },
  { name: 'Spa Pedicure', category: 'Pedicure', duration_minutes: 60, price: 55, sort_order: 8, commission_rate: 45 },
  { name: 'Deluxe Pedicure', category: 'Pedicure', duration_minutes: 75, price: 70, sort_order: 9, commission_rate: 50 },
  { name: 'Nail Art (per nail)', category: 'Add-On', duration_minutes: 15, price: 10, sort_order: 10, commission_rate: 50 },
  { name: 'Chrome/Ombré Nails', category: 'Add-On', duration_minutes: 20, price: 15, sort_order: 11, commission_rate: 50 },
  { name: 'Mani-Pedi Combo', category: 'Combo', duration_minutes: 75, price: 60, sort_order: 12, commission_rate: 45 },
];

export const CLIENT_NAMES = [
  ['Sarah','Chen'],['Emily','Rodriguez'],['Jessica','Thompson'],['Ashley','Martinez'],
  ['Olivia','Johnson'],['Sophia','Williams'],['Mia','Brown'],['Isabella','Garcia'],
  ['Ava','Lee'],['Emma','Davis'],['Chloe','Wilson'],['Madison','Taylor'],
  ['Abigail','Anderson'],['Harper','Thomas'],['Ella','Jackson'],['Grace','White'],
  ['Victoria','Harris'],['Lily','Clark'],['Natalie','Lewis'],['Hannah','Walker'],
  ['Samantha','Hall'],['Zoe','Allen'],['Leah','Young'],['Aubrey','King'],
  ['Addison','Wright'],['Layla','Hill'],['Brooklyn','Scott'],['Savannah','Green'],
  ['Penelope','Adams'],['Riley','Nelson'],['Nora','Baker'],['Stella','Gonzalez'],
  ['Hazel','Rivera'],['Ellie','Campbell'],['Paisley','Mitchell'],['Aria','Roberts'],
  ['Scarlett','Carter'],['Violet','Phillips'],['Luna','Evans'],['Willow','Turner'],
  ['Camila','Torres'],['Gianna','Parker'],['Aurora','Collins'],['Naomi','Edwards'],
  ['Elena','Stewart'],['Maya','Flores'],['Kinsley','Morris'],['Mackenzie','Murphy'],
  ['Claire','Cook'],['Bella','Rogers'],
];

// Top 10 clients get photos
export const CLIENT_PHOTO_MAP = {
  'Sarah Chen': 'client_sarah_chen',
  'Emily Rodriguez': 'client_emily_rodriguez',
  'Jessica Thompson': 'client_jessica_thompson',
  'Ashley Martinez': 'client_ashley_martinez',
  'Olivia Johnson': 'client_olivia_johnson',
  'Sophia Williams': 'client_sophia_williams',
  'Mia Brown': 'client_mia_brown',
  'Isabella Garcia': 'client_isabella_garcia',
  'Ava Lee': 'client_ava_lee',
  'Emma Davis': 'client_emma_davis',
};

export const CAMPAIGNS = [
  { name: 'Summer Gel Special 💅', type: 'promo', status: 'sent', template: { subject: 'Summer Gel Special - 20% Off!', body: 'Hi {name}! Get 20% off any gel service this month. Book now!', discount: '20%' }, audience: { tags: ['Gel Lover'], count: 18 }, metrics: { sent: 18, opened: 14, booked: 6, revenue: 340 } },
  { name: 'We Miss You! 💜', type: 'reengagement', status: 'sent', template: { subject: 'We miss you at Luxe Nails!', body: 'Hi {name}, it\'s been a while! Come back and enjoy $10 off your next visit.', discount: '$10' }, audience: { tags: ['Inactive'], count: 12 }, metrics: { sent: 12, opened: 8, booked: 3, revenue: 165 } },
  { name: 'Mother\'s Day Gift Cards 🌸', type: 'seasonal', status: 'draft', template: { subject: 'The Perfect Mother\'s Day Gift', body: 'Give the gift of self-care! Luxe Nails gift cards now available.', discount: null }, audience: { tags: ['All'], count: 50 }, metrics: { sent: 0, opened: 0, booked: 0, revenue: 0 } },
];

export const PACKAGES = [
  { name: 'Bridal Bliss Package', description: 'Complete bridal nail package: trial + wedding day service for bride + 4 bridesmaids', type: 'bundle', price: 350, original_price: 450, validity_days: 180, max_redemptions: 1, times_sold: 3, revenue_generated: 1050, is_active: true },
  { name: 'Monthly Mani Membership', description: 'One gel manicure per month + 10% off add-ons', type: 'membership', price: 35, original_price: 40, validity_days: 30, max_redemptions: 1, times_sold: 12, revenue_generated: 420, is_active: true },
  { name: 'VIP Luxe Package', description: '5 Spa Pedicures + 5 Gel Manicures at 25% off', type: 'bundle', price: 425, original_price: 575, validity_days: 365, max_redemptions: 10, times_sold: 7, revenue_generated: 2975, is_active: true },
];

export const GIFT_CARDS = [
  { code: 'LUXE-MOM-2026', initial_amount: 100, balance: 100, purchaser_name: 'Sarah Chen', recipient_name: 'Linda Chen', recipient_email: 'linda.chen@email.com', message: 'Happy Mother\'s Day, Mom! 💐', status: 'active', expires_at: '2027-05-09' },
  { code: 'LUXE-BDAY-JT', initial_amount: 75, balance: 35, purchaser_name: 'Emily Rodriguez', recipient_name: 'Jessica Thompson', message: 'Happy Birthday girl! Treat yourself 💅', status: 'active', expires_at: '2027-01-15' },
  { code: 'LUXE-GIFT-VIP1', initial_amount: 150, balance: 150, purchaser_name: 'Olivia Johnson', recipient_name: 'Naomi Edwards', message: 'Thank you for everything!', status: 'active', expires_at: '2027-03-01' },
  { code: 'LUXE-XMAS-2025', initial_amount: 50, balance: 0, purchaser_name: 'Ava Lee', recipient_name: 'Grace White', message: 'Merry Christmas! 🎄', status: 'redeemed', expires_at: '2026-12-25' },
  { code: 'LUXE-FALL-OLD', initial_amount: 60, balance: 60, purchaser_name: 'Madison Taylor', recipient_name: 'Chloe Wilson', message: 'Enjoy!', status: 'expired', expires_at: '2025-11-01' },
];

export const FEEDBACK = [
  { page: 'calendar', type: 'feature', message: 'Would love to see drag-and-drop rescheduling on the calendar view!', rating: 4, status: 'planned' },
  { page: 'checkout', type: 'enhancement', message: 'Can we add Apple Pay and Google Pay as payment methods?', rating: 5, status: 'reviewed' },
  { page: 'clients', type: 'bug', message: 'Client birthday notification didn\'t trigger yesterday for Sarah Chen', rating: 3, status: 'new' },
  { page: 'campaigns', type: 'feature', message: 'Instagram DM integration for campaign delivery would be amazing', rating: 5, status: 'new' },
  { page: 'booking', type: 'feedback', message: 'The online booking flow is so smooth! Clients love it.', rating: 5, status: 'reviewed' },
];

export const SOCIAL_POSTS = [
  { content: '✨ Spring nails are in full bloom at Luxe Nails! 🌸 Book your cherry blossom nail art today. #NailArt #SpringNails #LuxeNails', platforms: ['instagram','facebook'], status: 'published', template_type: 'promotion', metrics: { likes: 247, comments: 34, shares: 12, reach: 1850 } },
  { content: 'Before ➡️ After: Gorgeous gel extension transformation by Jenny! 💅 #GelNails #NailTransformation', platforms: ['instagram'], status: 'published', template_type: 'before_after', metrics: { likes: 189, comments: 28, shares: 8, reach: 1420 } },
  { content: '🎉 Mother\'s Day Special: Buy a $100 gift card, get $20 bonus! Perfect for the mom who deserves a pamper day. Link in bio!', platforms: ['instagram','facebook'], status: 'scheduled', template_type: 'promotion', metrics: { likes: 0, comments: 0, shares: 0, reach: 0 } },
  { content: '💜 5-star review from @sarah_chen: "Best nail salon in Sacramento! Lisa and her team are absolute artists." Thank you Sarah! 🙏', platforms: ['instagram'], status: 'scheduled', template_type: 'review', metrics: { likes: 0, comments: 0, shares: 0, reach: 0 } },
  { content: 'Summer collection preview coming soon... 🌊☀️ Stay tuned for ocean-inspired designs! #ComingSoon #SummerNails', platforms: ['instagram','facebook','tiktok'], status: 'draft', template_type: 'custom', metrics: { likes: 0, comments: 0, shares: 0, reach: 0 } },
];

export const CONVERSATIONS_TEMPLATE = [
  { channel: 'sms', status: 'open', messages: [
    { sender_type: 'client', content: 'Hi! Can I book a gel manicure for this Saturday around 2pm?' },
    { sender_type: 'staff', sender_name: 'Amy Tran', content: 'Hi! Yes we have openings at 2pm and 2:30pm on Saturday. Which works better?' },
    { sender_type: 'client', content: '2pm is perfect! Can I get Mai as my tech?' },
    { sender_type: 'staff', sender_name: 'Amy Tran', content: 'Done! You\'re booked with Mai at 2pm Saturday for a Gel Manicure. See you then! 💅' },
  ]},
  { channel: 'instagram', status: 'open', messages: [
    { sender_type: 'client', content: 'OMG I love the cherry blossom nails in your latest post! How much for something like that?' },
    { sender_type: 'staff', sender_name: 'Jenny Kim', content: 'Thank you! 🌸 That design is our Gel Extensions + Nail Art combo, starts at $95. Want to book?' },
    { sender_type: 'client', content: 'Yes please! Do you have anything next week?' },
  ]},
  { channel: 'sms', status: 'open', messages: [
    { sender_type: 'client', content: 'Hi, I need to cancel my appointment tomorrow. Something came up at work 😞' },
    { sender_type: 'staff', sender_name: 'Lisa Nguyen', content: 'No worries! I\'ve cancelled your appointment. Would you like to reschedule for later this week?' },
    { sender_type: 'client', content: 'Yes! Friday afternoon if possible?' },
    { sender_type: 'staff', sender_name: 'Lisa Nguyen', content: 'Friday at 3pm with Jenny works! I\'ll book that for you. Have a good day! ☀️' },
    { sender_type: 'client', content: 'You\'re the best, thank you Lisa!' },
  ]},
  { channel: 'sms', status: 'closed', messages: [
    { sender_type: 'client', content: 'Just wanted to say thank you for the amazing pedicure yesterday! My feet feel brand new 😍' },
    { sender_type: 'staff', sender_name: 'Mai Pham', content: 'Aww thank you so much! So glad you loved it! See you next month? 💜' },
    { sender_type: 'client', content: 'Absolutely! Already looking forward to it!' },
  ]},
  { channel: 'instagram', status: 'open', messages: [
    { sender_type: 'client', content: 'Do you guys do bridal packages? I\'m getting married in October!' },
    { sender_type: 'staff', sender_name: 'Lisa Nguyen', content: 'Congratulations! 🎉 Yes! Our Bridal Bliss Package includes a trial + wedding day service for you and up to 4 bridesmaids. $350 (normally $450). Want to schedule a consultation?' },
  ]},
  { channel: 'sms', status: 'closed', messages: [
    { sender_type: 'staff', sender_name: 'Amy Tran', content: 'Hi! Just a reminder you have a Spa Pedicure tomorrow at 11am with Mai. See you then! 🌟' },
    { sender_type: 'client', content: 'Thank you for the reminder! I\'ll be there ☺️' },
  ]},
  { channel: 'facebook', status: 'open', messages: [
    { sender_type: 'client', content: 'What are your hours on Saturdays?' },
    { sender_type: 'staff', sender_name: 'Amy Tran', content: 'We\'re open 10am - 6pm on Saturdays! Would you like to book an appointment?' },
    { sender_type: 'client', content: 'Yes, do you have openings this Saturday afternoon?' },
  ]},
  { channel: 'sms', status: 'open', messages: [
    { sender_type: 'client', content: 'Hi! I purchased a gift card (LUXE-MOM-2026) for my mom. Can she use it for any service?' },
    { sender_type: 'staff', sender_name: 'Amy Tran', content: 'Yes! Gift cards can be used for any service or product. Your mom can just mention the code when she checks out. 😊' },
    { sender_type: 'client', content: 'Perfect, thanks!' },
  ]},
];

export const TENANT_SETTINGS = {
  business_hours: {
    Monday: { open: '09:00', close: '19:00' },
    Tuesday: { open: '09:00', close: '19:00' },
    Wednesday: { open: '09:00', close: '19:00' },
    Thursday: { open: '09:00', close: '19:00' },
    Friday: { open: '09:00', close: '19:00' },
    Saturday: { open: '10:00', close: '18:00' },
    Sunday: { open: '10:00', close: '16:00' },
  },
  booking: { advanceBookingDays: 14, cancellationPolicy: '24h', depositRequired: false, bufferMinutes: 15 },
  reminders: { enabled: true, r24h_sms: true, r24h_email: true, r2h_sms: true, r2h_email: false, r1h_sms: false, r1h_email: false, sms_template: 'Hi {name}! Reminder: you have a {service} appointment tomorrow at {time} with {staff}. Reply C to cancel.', email_template: 'Hi {name},\n\nThis is a friendly reminder about your upcoming appointment:\n\n📅 {date} at {time}\n💅 {service}\n👩 {staff}\n\nSee you soon!\n— Luxe Nails & Spa' },
  staff_reminders: { enabled: true, r24h_sms: false, r24h_email: true, r2h_sms: true, r2h_email: false, r1h_sms: false, r1h_email: false },
  client_protection: true,
  automations: { auto_review_request: true, auto_rebooking: true, auto_noshow_followup: true },
  bot_config: { enabled: true, channels: { sms: true, instagram: true, facebook: true } },
  loyalty: { enabled: true, points_per_dollar: 1, redemption_rate: 100, welcome_bonus: 50 },
};
