require('dotenv').config();
const { Client } = require('pg');
const bcrypt = require('bcrypt');
const { utcFromLocal, localDate, shiftDate } = require('./src/shared/timezone');

// The restaurant this seed describes trades in one timezone, and every hour in
// ORDER_SCHEDULE is a wall-clock hour in it. Written to settings below too, so
// there is one value rather than two that can drift apart.
const TIMEZONE = 'Asia/Kolkata';

const DB_URL =
  process.env.DATABASE_URL ||
  'postgres://pos_user:pos_password@localhost:5434/pos_dev';

// Fixed but UNGUESSABLE ids. They stay constant so re-seeding is idempotent
// (cleanup deletes this restaurant's rows by RESTAURANT_ID and reclaims any seed
// emails still held by a stale earlier-seed restaurant — see main()), but they're
// random UUIDs rather than 0001/0002/… — seeded ids must never be guessable
// (the restaurant id is reachable through the public menu endpoint, and a
// sequential-id habit is exactly what caused the table-enumeration bug).
const RESTAURANT_ID = 'cd7aad32-2c22-46ef-aa5b-94aba18d70b7';
const ADMIN_ID      = '4e90d8ed-f1e4-47ca-a9f1-eaee9a3083f9';
const STAFF_ID      = '4fbd866f-8d29-4b20-95bd-d263e3989cbb'; // Arjun
const PRIYA_ID      = '77ae3c1e-ee71-4f9b-ac71-a79a7fcff07c';
const RAVI_ID       = 'f3a60966-e9cd-46a6-a7fb-74b34614f5e8';
const KITCHEN_ID    = '2d11e679-164c-4953-8005-cf437d4e65f5';
const CASHIER_ID    = 'a9fbcab7-9fa0-43c7-ab00-134a272833ff';
const STAFF_IDS     = [STAFF_ID, PRIYA_ID, RAVI_ID];
function pickStaff() { return STAFF_IDS[Math.floor(Math.random() * STAFF_IDS.length)]; }

const SEED_USERS = [
  { id: ADMIN_ID,   email: 'admin@demo.com',   password: 'admin123', role: 'admin',   name: 'Admin',   pin: null   },
  { id: STAFF_ID,   email: 'arjun@demo.com',   password: 'staff123', role: 'staff',   name: 'Arjun',   pin: '1234' },
  { id: PRIYA_ID,   email: 'priya@demo.com',   password: 'staff123', role: 'staff',   name: 'Priya',   pin: '2345' },
  { id: RAVI_ID,    email: 'ravi@demo.com',    password: 'staff123', role: 'staff',   name: 'Ravi',    pin: '3456' },
  { id: KITCHEN_ID, email: 'kitchen@demo.com', password: 'staff123', role: 'kitchen', name: 'Kitchen', pin: '4567' },
  { id: CASHIER_ID, email: 'cashier@demo.com', password: 'staff123', role: 'cashier', name: 'Cashier', pin: '5678' },
];

// Full menu across categories (prices in INR)
const MENU = [
  // Starters
  { name: 'Veg Spring Rolls',       price:  280, category: 'Starters', description: 'Crispy rolls filled with seasoned mixed vegetables, served with sweet chili dipping sauce.' },
  { name: 'Chicken Wings',          price:  450, category: 'Starters', description: 'Tender chicken wings tossed in our signature BBQ glaze, garnished with spring onions.' },
  { name: 'Garlic Bread',           price:  180, category: 'Starters', description: 'Toasted sourdough slices with herb butter and roasted garlic, served warm.' },
  { name: 'Onion Rings',            price:  220, category: 'Starters', description: 'Golden-fried onion rings with a light, crispy batter. Served with ranch dip.' },
  { name: 'Paneer Tikka',           price:  380, category: 'Starters', description: 'Marinated cottage cheese cubes char-grilled in a tandoor with peppers and onions.' },
  { name: 'Crispy Calamari',        price:  480, category: 'Starters', description: 'Lightly breaded squid rings fried until golden, served with lemon aioli.' },
  { name: 'Bruschetta',             price:  250, category: 'Starters', description: 'Toasted bread rubbed with garlic, topped with diced tomatoes, basil, and olive oil.' },
  { name: 'Soup of the Day',        price:  180, category: 'Starters', description: "Chef's freshly prepared soup — ask your server for today's selection." },

  // Mains
  { name: 'Butter Chicken',         price:  380, category: 'Mains', description: 'Tender chicken in a rich, creamy tomato-based curry. Best paired with naan or rice.' },
  { name: 'Dal Makhani',            price:  280, category: 'Mains', description: 'Slow-cooked black lentils simmered overnight in butter and cream. A classic North Indian staple.' },
  { name: 'Veg Fried Rice',         price:  220, category: 'Mains', description: 'Wok-tossed basmati rice with seasonal vegetables, garlic, and soy seasoning.' },
  { name: 'Chicken Biryani',        price:  420, category: 'Mains', description: 'Fragrant long-grain rice layered with spiced chicken, slow-cooked and finished with saffron.' },
  { name: 'Grilled Chicken Steak',  price:  599, category: 'Mains', description: 'Juicy marinated chicken breast grilled to perfection, served with herb butter and seasonal sides.' },
  { name: 'Fish & Chips',           price:  480, category: 'Mains', description: 'Beer-battered fish fillet with golden crispy chips and housemade tartar sauce.' },
  { name: 'Veg Burger',             price:  280, category: 'Mains', description: 'Spiced potato-veggie patty with lettuce, tomato, and chipotle mayo in a toasted bun.' },
  { name: 'Chicken Burger',         price:  320, category: 'Mains', description: 'Grilled chicken thigh with coleslaw, pickles, and our house sauce in a brioche bun.' },
  { name: 'Margherita Pizza',       price:  380, category: 'Mains', description: 'Wood-fired dough topped with San Marzano tomato sauce, fresh mozzarella, and basil.' },
  { name: 'BBQ Chicken Pizza',      price:  450, category: 'Mains', description: 'Smoky BBQ sauce base with shredded chicken, mozzarella, and caramelised onions.' },
  { name: 'Pasta Arrabbiata',       price:  320, category: 'Mains', description: 'Al dente pasta tossed in a fiery tomato and garlic sauce, finished with fresh parsley.' },
  { name: 'Paneer Butter Masala',   price:  340, category: 'Mains', description: 'Soft paneer cubes in a velvety tomato-cashew gravy — mild, rich, and aromatic.' },

  // Desserts
  { name: 'Chocolate Lava Cake',    price:  280, category: 'Desserts', description: 'Warm dark chocolate cake with a molten center, served with a scoop of vanilla ice cream.' },
  { name: 'Gulab Jamun (2 pcs)',    price:  120, category: 'Desserts', description: 'Soft milk-solid dumplings soaked in rose-cardamom sugar syrup.' },
  { name: 'Vanilla Ice Cream',      price:  140, category: 'Desserts', description: 'Classic French vanilla ice cream made with fresh cream and real vanilla bean.' },
  { name: 'Mango Sorbet',           price:  160, category: 'Desserts', description: 'Refreshing sorbet made with Alphonso mango pulp and a hint of lime.' },
  { name: 'Cheesecake',             price:  220, category: 'Desserts', description: 'Creamy New York-style baked cheesecake on a buttery biscuit crust.' },
  { name: 'Tiramisu',               price:  260, category: 'Desserts', description: 'Layers of espresso-soaked ladyfingers with mascarpone cream, dusted with cocoa.' },

  // Drinks
  { name: 'Mango Lassi',            price:  120, category: 'Drinks', description: 'Chilled yogurt drink blended with sweet Alphonso mango pulp and a pinch of cardamom.' },
  { name: 'Fresh Lime Soda',        price:   80, category: 'Drinks', description: 'Freshly squeezed lime with sparkling water — choose sweet, salted, or mixed.' },
  { name: 'Masala Chai',            price:   60, category: 'Drinks', description: 'Spiced Indian tea brewed with ginger, cardamom, and cinnamon, served with milk.' },
  { name: 'Cold Coffee',            price:  140, category: 'Drinks', description: 'Chilled filter coffee blended with milk and sugar — strong and refreshing.' },
  { name: 'Fresh Orange Juice',     price:  140, category: 'Drinks', description: 'Freshly squeezed juice from hand-picked oranges — served chilled.' },
  { name: 'Mineral Water',          price:   40, category: 'Drinks', description: 'Still mineral water, 500 ml.' },
  { name: 'Soft Drink (Can)',       price:   60, category: 'Drinks', description: 'Your choice of chilled Coca-Cola, Sprite, or Limca.' },
  { name: 'Sparkling Water',        price:   80, category: 'Drinks',   description: 'Chilled sparkling mineral water, 330 ml.' },

  // Additional Mains
  { name: 'Hakka Noodles',          price:  260, category: 'Mains',    description: 'Stir-fried noodles tossed with vegetables and soy seasoning in a hot wok.' },
  { name: 'Pav Bhaji',              price:  220, category: 'Mains',    description: 'Spiced mashed vegetable curry served with butter-toasted pav rolls.' },

  // Additional Desserts
  { name: 'Ras Malai',              price:  160, category: 'Desserts', description: 'Soft cottage cheese dumplings soaked in sweetened, cardamom-scented milk.' },
  { name: 'Brownie with Ice Cream', price:  240, category: 'Desserts', description: 'Warm fudge brownie paired with a scoop of vanilla ice cream.' },

  // Additional Drinks
  { name: 'Iced Tea',               price:   80, category: 'Drinks',   description: 'Chilled brewed tea with lemon and a hint of sweetness — light and refreshing.' },
  { name: 'Strawberry Milkshake',   price:  160, category: 'Drinks',   description: 'Thick and creamy milkshake blended with fresh strawberry puree and chilled milk.' },
];

// Orders spread across 7 days — [daysAgo, hour, minute, tableIndex, [[itemName, qty], ...], paymentMethod?, channel?]
// daysAgo=0 → today, daysAgo=6 → six days ago. paymentMethod defaults to 'cash'. channel defaults to 'dining'.
// For takeaway/delivery tableIndex is ignored (null table_id is used).
const ORDER_SCHEDULE = [
  // ── Day 0 (today) — Dining ────────────────────────────────────────────────
  [ 0,  8, 15, 0, [['Veg Spring Rolls', 2], ['Masala Chai', 2], ['Garlic Bread', 1]],                                                         'cash'   ],
  [ 0,  9, 30, 1, [['Chicken Wings', 2], ['Butter Chicken', 2], ['Mango Lassi', 2], ['Garlic Bread', 1]],                                      'card'   ],
  [ 0, 10, 45, 2, [['Bruschetta', 1], ['Pasta Arrabbiata', 2], ['Fresh Lime Soda', 2]],                                                        'cash'   ],
  [ 0, 11, 20, 3, [['Paneer Tikka', 2], ['Dal Makhani', 2], ['Veg Fried Rice', 1], ['Masala Chai', 3]],                                        'cash'   ],
  [ 0, 12,  5, 0, [['Soup of the Day', 2], ['Grilled Chicken Steak', 2], ['Cheesecake', 2], ['Cold Coffee', 2]],                               'card'   ],
  [ 0, 12, 40, 4, [['Onion Rings', 1], ['Chicken Biryani', 3], ['Gulab Jamun (2 pcs)', 3], ['Fresh Lime Soda', 3]],                            'mobile' ],
  [ 0, 13, 10, 1, [['Crispy Calamari', 1], ['Fish & Chips', 2], ['Tiramisu', 2], ['Sparkling Water', 2]],                                      'cash'   ],
  [ 0, 13, 50, 5, [['Garlic Bread', 2], ['Margherita Pizza', 2], ['Vanilla Ice Cream', 2], ['Soft Drink (Can)', 4]],                           'card'   ],
  [ 0, 14, 30, 2, [['BBQ Chicken Pizza', 2], ['Chicken Wings', 2], ['Mango Sorbet', 2], ['Cold Coffee', 2]],                                   'cash'   ],
  [ 0, 15, 45, 3, [['Veg Burger', 2], ['Chicken Burger', 2], ['Chocolate Lava Cake', 2], ['Soft Drink (Can)', 4]],                             'mobile' ],
  [ 0, 16, 20, 0, [['Paneer Tikka', 1], ['Paneer Butter Masala', 2], ['Dal Makhani', 1], ['Mango Lassi', 2], ['Mineral Water', 2]],            'cash'   ],
  [ 0, 17, 10, 4, [['Soup of the Day', 4], ['Grilled Chicken Steak', 4], ['Tiramisu', 2], ['Fresh Orange Juice', 4]],                          'card'   ],
  [ 0, 18,  0, 1, [['Bruschetta', 2], ['BBQ Chicken Pizza', 1], ['Pasta Arrabbiata', 2], ['Cheesecake', 2], ['Sparkling Water', 2]],           'cash'   ],
  [ 0, 18, 50, 5, [['Chicken Wings', 2], ['Butter Chicken', 3], ['Chicken Biryani', 2], ['Gulab Jamun (2 pcs)', 3], ['Masala Chai', 3]],       'mobile' ],
  [ 0, 19, 30, 2, [['Crispy Calamari', 2], ['Fish & Chips', 2], ['Mango Sorbet', 2], ['Mineral Water', 4]],                                    'card'   ],
  [ 0, 20, 15, 3, [['Veg Spring Rolls', 2], ['Margherita Pizza', 2], ['Veg Burger', 2], ['Chocolate Lava Cake', 4], ['Cold Coffee', 2]],       'cash'   ],
  [ 0, 21,  0, 0, [['Onion Rings', 2], ['Paneer Butter Masala', 2], ['Dal Makhani', 2], ['Gulab Jamun (2 pcs)', 2], ['Masala Chai', 2]],       'cash'   ],
  [ 0, 21, 45, 4, [['Chicken Burger', 3], ['BBQ Chicken Pizza', 1], ['Tiramisu', 3], ['Soft Drink (Can)', 3]],                                 'card'   ],
  // Day 0 — Takeaway
  [ 0, 10, 30, null, [['Veg Burger', 1], ['Cold Coffee', 1]],                                                                                  'card',   'takeaway'],
  [ 0, 11, 45, null, [['Chicken Biryani', 2], ['Mango Lassi', 2]],                                                                             'mobile', 'takeaway'],
  [ 0, 12, 20, null, [['Butter Chicken', 1], ['Veg Fried Rice', 1], ['Mineral Water', 2]],                                                     'card',   'takeaway'],
  [ 0, 13,  5, null, [['Margherita Pizza', 1], ['Garlic Bread', 1], ['Soft Drink (Can)', 2]],                                                  'cash',   'takeaway'],
  [ 0, 13, 50, null, [['Chicken Burger', 2], ['Fresh Lime Soda', 2]],                                                                          'mobile', 'takeaway'],
  [ 0, 16, 30, null, [['Paneer Tikka', 1], ['Dal Makhani', 1], ['Masala Chai', 2]],                                                            'cash',   'takeaway'],
  [ 0, 18, 45, null, [['BBQ Chicken Pizza', 1], ['Chicken Wings', 1], ['Cold Coffee', 2]],                                                     'card',   'takeaway'],
  [ 0, 20, 15, null, [['Chicken Biryani', 3], ['Gulab Jamun (2 pcs)', 2], ['Mineral Water', 3]],                                               'mobile', 'takeaway'],
  // Day 0 — Delivery
  [ 0, 11,  0, null, [['Butter Chicken', 2], ['Dal Makhani', 1], ['Veg Fried Rice', 1], ['Mango Lassi', 2]],                                   'mobile', 'delivery'],
  [ 0, 12, 30, null, [['Chicken Biryani', 2], ['Paneer Tikka', 1], ['Fresh Lime Soda', 2]],                                                    'mobile', 'delivery'],
  [ 0, 13, 15, null, [['BBQ Chicken Pizza', 2], ['Garlic Bread', 2], ['Soft Drink (Can)', 4]],                                                 'card',   'delivery'],
  [ 0, 15,  0, null, [['Margherita Pizza', 2], ['Onion Rings', 1], ['Cold Coffee', 2]],                                                        'mobile', 'delivery'],
  [ 0, 19, 30, null, [['Chicken Biryani', 4], ['Veg Spring Rolls', 2], ['Mango Lassi', 4]],                                                    'mobile', 'delivery'],
  [ 0, 20, 45, null, [['Butter Chicken', 3], ['Veg Fried Rice', 2], ['Paneer Butter Masala', 2], ['Mineral Water', 4]],                        'card',   'delivery'],

  // ── Day 1 (yesterday) — Dining ────────────────────────────────────────────
  [ 1,  8, 30, 2, [['Garlic Bread', 2], ['Masala Chai', 3]],                                                                                   'cash'   ],
  [ 1,  9, 45, 0, [['Bruschetta', 2], ['Paneer Tikka', 1], ['Cold Coffee', 2]],                                                                'mobile' ],
  [ 1, 11,  0, 3, [['Paneer Tikka', 2], ['Dal Makhani', 2], ['Masala Chai', 2]],                                                               'cash'   ],
  [ 1, 12, 15, 1, [['Butter Chicken', 2], ['Veg Fried Rice', 1], ['Mango Lassi', 2]],                                                          'card'   ],
  [ 1, 12, 50, 4, [['Chicken Biryani', 3], ['Onion Rings', 1], ['Fresh Lime Soda', 3]],                                                        'cash'   ],
  [ 1, 13, 20, 5, [['Fish & Chips', 2], ['Crispy Calamari', 1], ['Sparkling Water', 2]],                                                       'card'   ],
  [ 1, 14,  0, 2, [['Margherita Pizza', 2], ['Garlic Bread', 1], ['Soft Drink (Can)', 2]],                                                     'cash'   ],
  [ 1, 15, 30, 0, [['BBQ Chicken Pizza', 1], ['Chicken Wings', 2], ['Cold Coffee', 2]],                                                        'mobile' ],
  [ 1, 16, 10, 3, [['Veg Burger', 2], ['Chicken Burger', 1], ['Fresh Lime Soda', 3]],                                                          'cash'   ],
  [ 1, 17, 30, 1, [['Soup of the Day', 2], ['Grilled Chicken Steak', 2], ['Fresh Orange Juice', 2]],                                           'card'   ],
  [ 1, 18, 20, 4, [['Paneer Tikka', 1], ['Paneer Butter Masala', 2], ['Masala Chai', 2]],                                                      'cash'   ],
  [ 1, 19,  0, 5, [['Chicken Wings', 2], ['Butter Chicken', 2], ['Mango Lassi', 3]],                                                           'mobile' ],
  [ 1, 19, 45, 2, [['Chicken Biryani', 2], ['Gulab Jamun (2 pcs)', 2], ['Masala Chai', 2]],                                                    'card'   ],
  [ 1, 20, 30, 0, [['Margherita Pizza', 2], ['Veg Spring Rolls', 2], ['Chocolate Lava Cake', 2], ['Soft Drink (Can)', 4]],                     'cash'   ],
  [ 1, 21, 15, 3, [['Pasta Arrabbiata', 2], ['Tiramisu', 2], ['Cold Coffee', 2]],                                                              'card'   ],
  [ 1, 22,  0, 1, [['BBQ Chicken Pizza', 2], ['Chicken Burger', 2], ['Mineral Water', 4]],                                                     'cash'   ],
  // Day 1 — Takeaway
  [ 1,  9, 45, null, [['Garlic Bread', 2], ['Masala Chai', 2]],                                                                                'cash',   'takeaway'],
  [ 1, 12,  0, null, [['Chicken Biryani', 2], ['Fresh Lime Soda', 2]],                                                                         'card',   'takeaway'],
  [ 1, 12, 40, null, [['Veg Burger', 2], ['Soft Drink (Can)', 2]],                                                                             'mobile', 'takeaway'],
  [ 1, 14, 15, null, [['Butter Chicken', 1], ['Dal Makhani', 1], ['Masala Chai', 2]],                                                          'cash',   'takeaway'],
  [ 1, 17, 30, null, [['BBQ Chicken Pizza', 1], ['Chicken Wings', 1], ['Cold Coffee', 2]],                                                     'card',   'takeaway'],
  [ 1, 19,  0, null, [['Paneer Tikka', 2], ['Paneer Butter Masala', 1], ['Mineral Water', 2]],                                                 'mobile', 'takeaway'],
  [ 1, 20, 30, null, [['Chicken Burger', 2], ['Margherita Pizza', 1], ['Fresh Lime Soda', 2]],                                                 'card',   'takeaway'],
  // Day 1 — Delivery
  [ 1, 11, 30, null, [['Butter Chicken', 2], ['Veg Fried Rice', 1], ['Mango Lassi', 2]],                                                       'mobile', 'delivery'],
  [ 1, 13,  0, null, [['Chicken Biryani', 3], ['Veg Spring Rolls', 1], ['Soft Drink (Can)', 3]],                                               'card',   'delivery'],
  [ 1, 15, 45, null, [['BBQ Chicken Pizza', 2], ['Garlic Bread', 1], ['Cold Coffee', 2]],                                                      'mobile', 'delivery'],
  [ 1, 19, 15, null, [['Paneer Butter Masala', 2], ['Dal Makhani', 1], ['Mineral Water', 4]],                                                  'mobile', 'delivery'],
  [ 1, 21,  0, null, [['Butter Chicken', 2], ['Chicken Biryani', 2], ['Masala Chai', 2]],                                                      'card',   'delivery'],

  // ── Day 2 — Dining ────────────────────────────────────────────────────────
  [ 2,  9,  0, 1, [['Veg Spring Rolls', 2], ['Masala Chai', 2]],                                                                               'cash'   ],
  [ 2, 10, 30, 5, [['Garlic Bread', 1], ['Paneer Tikka', 2], ['Fresh Lime Soda', 2]],                                                          'mobile' ],
  [ 2, 12,  0, 0, [['Butter Chicken', 2], ['Dal Makhani', 1], ['Mango Lassi', 2]],                                                             'card'   ],
  [ 2, 12, 45, 2, [['Chicken Biryani', 2], ['Veg Fried Rice', 1], ['Fresh Lime Soda', 2]],                                                     'cash'   ],
  [ 2, 13, 30, 4, [['Fish & Chips', 2], ['Onion Rings', 1], ['Cold Coffee', 2]],                                                               'cash'   ],
  [ 2, 14, 15, 1, [['Margherita Pizza', 2], ['Chicken Wings', 2], ['Soft Drink (Can)', 4]],                                                    'card'   ],
  [ 2, 15, 45, 3, [['BBQ Chicken Pizza', 2], ['Pasta Arrabbiata', 2], ['Sparkling Water', 2]],                                                 'mobile' ],
  [ 2, 17,  0, 5, [['Grilled Chicken Steak', 2], ['Soup of the Day', 2], ['Fresh Orange Juice', 2]],                                           'cash'   ],
  [ 2, 18, 15, 0, [['Paneer Butter Masala', 2], ['Dal Makhani', 1], ['Masala Chai', 3]],                                                       'card'   ],
  [ 2, 19, 30, 2, [['Chicken Biryani', 3], ['Gulab Jamun (2 pcs)', 3], ['Mango Lassi', 3]],                                                    'cash'   ],
  [ 2, 20, 45, 4, [['BBQ Chicken Pizza', 2], ['Chicken Burger', 2], ['Tiramisu', 2], ['Cold Coffee', 2]],                                      'mobile' ],
  [ 2, 21, 30, 1, [['Veg Burger', 2], ['Chocolate Lava Cake', 2], ['Masala Chai', 2]],                                                         'cash'   ],
  // Day 2 — Takeaway
  [ 2, 10,  0, null, [['Veg Spring Rolls', 1], ['Cold Coffee', 1]],                                                                            'cash',   'takeaway'],
  [ 2, 12, 15, null, [['Chicken Biryani', 2], ['Mango Lassi', 2]],                                                                             'mobile', 'takeaway'],
  [ 2, 13, 30, null, [['Margherita Pizza', 1], ['Garlic Bread', 1], ['Soft Drink (Can)', 2]],                                                  'card',   'takeaway'],
  [ 2, 14, 45, null, [['Fish & Chips', 1], ['Fresh Lime Soda', 1]],                                                                            'cash',   'takeaway'],
  [ 2, 17,  0, null, [['Butter Chicken', 2], ['Dal Makhani', 1], ['Masala Chai', 2]],                                                          'card',   'takeaway'],
  [ 2, 19, 30, null, [['BBQ Chicken Pizza', 2], ['Chicken Wings', 1], ['Cold Coffee', 2]],                                                     'mobile', 'takeaway'],
  [ 2, 21,  0, null, [['Chicken Burger', 2], ['Chocolate Lava Cake', 1], ['Soft Drink (Can)', 2]],                                             'card',   'takeaway'],
  // Day 2 — Delivery
  [ 2, 11, 45, null, [['Butter Chicken', 2], ['Veg Fried Rice', 2], ['Mango Lassi', 2]],                                                       'mobile', 'delivery'],
  [ 2, 13,  0, null, [['Chicken Biryani', 2], ['Paneer Tikka', 2], ['Fresh Lime Soda', 2]],                                                    'card',   'delivery'],
  [ 2, 16,  0, null, [['Margherita Pizza', 2], ['Veg Burger', 1], ['Cold Coffee', 2]],                                                         'mobile', 'delivery'],
  [ 2, 19,  0, null, [['Paneer Butter Masala', 2], ['Dal Makhani', 2], ['Gulab Jamun (2 pcs)', 2], ['Mineral Water', 4]],                      'mobile', 'delivery'],
  [ 2, 20, 30, null, [['BBQ Chicken Pizza', 2], ['Chicken Wings', 2], ['Soft Drink (Can)', 4]],                                                'card',   'delivery'],

  // ── Day 3 — Dining ────────────────────────────────────────────────────────
  [ 3,  8, 45, 3, [['Garlic Bread', 2], ['Masala Chai', 2], ['Bruschetta', 1]],                                                                'cash'   ],
  [ 3, 10,  0, 0, [['Chicken Wings', 2], ['Mango Lassi', 2], ['Veg Spring Rolls', 1]],                                                         'card'   ],
  [ 3, 11, 15, 4, [['Paneer Tikka', 2], ['Dal Makhani', 2], ['Masala Chai', 2]],                                                               'cash'   ],
  [ 3, 12, 20, 2, [['Butter Chicken', 3], ['Chicken Biryani', 2], ['Fresh Lime Soda', 3]],                                                     'mobile' ],
  [ 3, 12, 55, 5, [['Grilled Chicken Steak', 2], ['Soup of the Day', 2], ['Cold Coffee', 2]],                                                  'card'   ],
  [ 3, 13, 40, 1, [['Fish & Chips', 2], ['Crispy Calamari', 2], ['Sparkling Water', 2]],                                                       'cash'   ],
  [ 3, 14, 30, 3, [['Margherita Pizza', 2], ['Garlic Bread', 2], ['Soft Drink (Can)', 4]],                                                     'card'   ],
  [ 3, 15, 20, 0, [['Pasta Arrabbiata', 2], ['Paneer Butter Masala', 2], ['Fresh Orange Juice', 2]],                                           'cash'   ],
  [ 3, 16, 45, 4, [['Veg Burger', 2], ['Chicken Burger', 2], ['Cold Coffee', 2]],                                                              'mobile' ],
  [ 3, 18,  0, 2, [['Chicken Wings', 2], ['Butter Chicken', 3], ['Gulab Jamun (2 pcs)', 3], ['Masala Chai', 3]],                               'cash'   ],
  [ 3, 19, 15, 5, [['BBQ Chicken Pizza', 2], ['Chicken Biryani', 2], ['Mango Sorbet', 2], ['Mango Lassi', 2]],                                 'card'   ],
  [ 3, 20,  0, 1, [['Veg Spring Rolls', 2], ['Paneer Tikka', 2], ['Paneer Butter Masala', 2], ['Mineral Water', 4]],                           'cash'   ],
  [ 3, 21,  0, 3, [['Margherita Pizza', 2], ['Chocolate Lava Cake', 2], ['Tiramisu', 2], ['Soft Drink (Can)', 4]],                             'mobile' ],
  [ 3, 21, 50, 0, [['Chicken Burger', 2], ['BBQ Chicken Pizza', 1], ['Cold Coffee', 2]],                                                       'cash'   ],
  // Day 3 — Takeaway
  [ 3, 11,  0, null, [['Veg Burger', 2], ['Masala Chai', 2]],                                                                                  'cash',   'takeaway'],
  [ 3, 12, 30, null, [['Chicken Biryani', 2], ['Fresh Lime Soda', 2]],                                                                         'mobile', 'takeaway'],
  [ 3, 14,  0, null, [['Margherita Pizza', 1], ['Garlic Bread', 1], ['Cold Coffee', 1]],                                                       'card',   'takeaway'],
  [ 3, 17, 30, null, [['Butter Chicken', 1], ['Dal Makhani', 1], ['Mineral Water', 2]],                                                        'cash',   'takeaway'],
  [ 3, 19, 15, null, [['BBQ Chicken Pizza', 1], ['Paneer Tikka', 1], ['Mango Lassi', 2]],                                                      'mobile', 'takeaway'],
  [ 3, 21,  0, null, [['Chicken Burger', 2], ['Veg Spring Rolls', 1], ['Soft Drink (Can)', 2]],                                                'card',   'takeaway'],
  // Day 3 — Delivery
  [ 3, 12,  0, null, [['Butter Chicken', 2], ['Veg Fried Rice', 1], ['Mango Lassi', 2]],                                                       'mobile', 'delivery'],
  [ 3, 13, 30, null, [['Chicken Biryani', 3], ['Veg Spring Rolls', 2], ['Cold Coffee', 2]],                                                    'card',   'delivery'],
  [ 3, 16, 15, null, [['Margherita Pizza', 2], ['Chicken Wings', 1], ['Fresh Lime Soda', 4]],                                                  'mobile', 'delivery'],
  [ 3, 19, 45, null, [['Paneer Butter Masala', 2], ['Dal Makhani', 1], ['Gulab Jamun (2 pcs)', 2], ['Mineral Water', 2]],                      'mobile', 'delivery'],
  [ 3, 21, 30, null, [['Butter Chicken', 3], ['Chicken Biryani', 2], ['Masala Chai', 3]],                                                      'card',   'delivery'],

  // ── Day 4 — Dining ────────────────────────────────────────────────────────
  [ 4,  9, 15, 5, [['Veg Spring Rolls', 1], ['Masala Chai', 2]],                                                                               'cash'   ],
  [ 4, 10, 45, 1, [['Bruschetta', 2], ['Fresh Lime Soda', 2], ['Garlic Bread', 1]],                                                            'card'   ],
  [ 4, 12,  0, 4, [['Dal Makhani', 2], ['Veg Fried Rice', 2], ['Mango Lassi', 2]],                                                             'cash'   ],
  [ 4, 12, 40, 2, [['Chicken Biryani', 2], ['Butter Chicken', 2], ['Fresh Lime Soda', 2]],                                                     'mobile' ],
  [ 4, 13, 25, 0, [['Margherita Pizza', 2], ['Chicken Wings', 2], ['Soft Drink (Can)', 4]],                                                    'cash'   ],
  [ 4, 14, 10, 3, [['Fish & Chips', 2], ['Onion Rings', 1], ['Sparkling Water', 2]],                                                           'card'   ],
  [ 4, 15, 50, 5, [['Pasta Arrabbiata', 2], ['Cheesecake', 2], ['Cold Coffee', 2]],                                                            'cash'   ],
  [ 4, 17, 20, 1, [['Grilled Chicken Steak', 2], ['Soup of the Day', 2], ['Fresh Orange Juice', 2]],                                           'card'   ],
  [ 4, 18, 30, 4, [['Paneer Tikka', 2], ['Paneer Butter Masala', 2], ['Masala Chai', 3]],                                                      'cash'   ],
  [ 4, 19, 45, 0, [['BBQ Chicken Pizza', 2], ['Chicken Burger', 2], ['Mango Lassi', 2]],                                                       'mobile' ],
  [ 4, 20, 30, 2, [['Chicken Wings', 2], ['Chicken Biryani', 2], ['Gulab Jamun (2 pcs)', 2], ['Masala Chai', 2]],                              'cash'   ],
  [ 4, 21, 15, 3, [['Veg Burger', 2], ['Margherita Pizza', 1], ['Chocolate Lava Cake', 2], ['Soft Drink (Can)', 2]],                           'card'   ],
  // Day 4 — Takeaway
  [ 4, 10, 15, null, [['Garlic Bread', 1], ['Cold Coffee', 1]],                                                                                'cash',   'takeaway'],
  [ 4, 12,  0, null, [['Chicken Biryani', 2], ['Mango Lassi', 2]],                                                                             'card',   'takeaway'],
  [ 4, 13, 30, null, [['Veg Burger', 1], ['Chicken Burger', 1], ['Soft Drink (Can)', 2]],                                                      'mobile', 'takeaway'],
  [ 4, 16, 45, null, [['Paneer Tikka', 1], ['Dal Makhani', 1], ['Masala Chai', 2]],                                                            'cash',   'takeaway'],
  [ 4, 19,  0, null, [['BBQ Chicken Pizza', 1], ['Garlic Bread', 1], ['Cold Coffee', 2]],                                                      'mobile', 'takeaway'],
  [ 4, 20, 30, null, [['Butter Chicken', 2], ['Veg Fried Rice', 1], ['Mineral Water', 2]],                                                     'card',   'takeaway'],
  // Day 4 — Delivery
  [ 4, 11, 30, null, [['Butter Chicken', 2], ['Dal Makhani', 1], ['Mango Lassi', 2]],                                                          'mobile', 'delivery'],
  [ 4, 13,  0, null, [['Chicken Biryani', 2], ['Paneer Tikka', 1], ['Fresh Lime Soda', 2]],                                                    'card',   'delivery'],
  [ 4, 15, 30, null, [['Margherita Pizza', 2], ['Veg Spring Rolls', 1], ['Soft Drink (Can)', 4]],                                              'mobile', 'delivery'],
  [ 4, 19, 30, null, [['Paneer Butter Masala', 2], ['Veg Fried Rice', 2], ['Mineral Water', 4]],                                               'mobile', 'delivery'],
  [ 4, 21,  0, null, [['BBQ Chicken Pizza', 2], ['Chicken Wings', 2], ['Cold Coffee', 2]],                                                     'card',   'delivery'],

  // ── Day 5 — Dining ────────────────────────────────────────────────────────
  [ 5,  8,  0, 2, [['Masala Chai', 2], ['Garlic Bread', 1]],                                                                                   'cash'   ],
  [ 5,  9, 30, 4, [['Veg Spring Rolls', 1], ['Paneer Tikka', 1], ['Cold Coffee', 2]],                                                          'card'   ],
  [ 5, 11, 45, 0, [['Paneer Tikka', 2], ['Dal Makhani', 2], ['Masala Chai', 2]],                                                               'cash'   ],
  [ 5, 12, 30, 5, [['Butter Chicken', 2], ['Chicken Biryani', 2], ['Mango Lassi', 2]],                                                         'mobile' ],
  [ 5, 13, 15, 1, [['Fish & Chips', 2], ['Crispy Calamari', 1], ['Sparkling Water', 2]],                                                       'cash'   ],
  [ 5, 14, 45, 3, [['Margherita Pizza', 2], ['Veg Burger', 2], ['Fresh Lime Soda', 2]],                                                        'card'   ],
  [ 5, 16, 30, 2, [['BBQ Chicken Pizza', 2], ['Pasta Arrabbiata', 1], ['Cold Coffee', 2]],                                                     'cash'   ],
  [ 5, 18, 15, 0, [['Grilled Chicken Steak', 2], ['Soup of the Day', 2], ['Fresh Orange Juice', 2]],                                           'card'   ],
  [ 5, 19,  0, 4, [['Chicken Wings', 2], ['Butter Chicken', 2], ['Gulab Jamun (2 pcs)', 2], ['Masala Chai', 2]],                               'cash'   ],
  [ 5, 20, 15, 5, [['Chicken Biryani', 2], ['Paneer Butter Masala', 2], ['Mango Lassi', 2]],                                                   'mobile' ],
  [ 5, 21,  0, 1, [['BBQ Chicken Pizza', 1], ['Chicken Burger', 2], ['Tiramisu', 2], ['Soft Drink (Can)', 2]],                                 'cash'   ],
  // Day 5 — Takeaway
  [ 5, 10, 30, null, [['Veg Spring Rolls', 1], ['Masala Chai', 2]],                                                                            'cash',   'takeaway'],
  [ 5, 12, 15, null, [['Chicken Biryani', 2], ['Fresh Lime Soda', 2]],                                                                         'mobile', 'takeaway'],
  [ 5, 13, 45, null, [['Margherita Pizza', 1], ['Garlic Bread', 1], ['Cold Coffee', 1]],                                                       'card',   'takeaway'],
  [ 5, 17,  0, null, [['Butter Chicken', 1], ['Dal Makhani', 1], ['Mineral Water', 2]],                                                        'cash',   'takeaway'],
  [ 5, 19, 30, null, [['BBQ Chicken Pizza', 1], ['Paneer Tikka', 1], ['Mango Lassi', 2]],                                                      'mobile', 'takeaway'],
  [ 5, 21,  0, null, [['Chicken Burger', 2], ['Soft Drink (Can)', 2]],                                                                         'card',   'takeaway'],
  // Day 5 — Delivery
  [ 5, 12,  0, null, [['Butter Chicken', 2], ['Veg Fried Rice', 1], ['Mango Lassi', 2]],                                                       'mobile', 'delivery'],
  [ 5, 13, 30, null, [['Chicken Biryani', 3], ['Veg Spring Rolls', 1], ['Cold Coffee', 2]],                                                    'card',   'delivery'],
  [ 5, 19,  0, null, [['Paneer Butter Masala', 2], ['Dal Makhani', 1], ['Gulab Jamun (2 pcs)', 2], ['Mineral Water', 2]],                      'mobile', 'delivery'],
  [ 5, 20, 30, null, [['BBQ Chicken Pizza', 2], ['Chicken Wings', 1], ['Soft Drink (Can)', 4]],                                                'card',   'delivery'],

  // ── Day 6 — Dining ────────────────────────────────────────────────────────
  [ 6,  9, 30, 3, [['Garlic Bread', 2], ['Masala Chai', 2], ['Bruschetta', 1]],                                                                'cash'   ],
  [ 6, 11,  0, 1, [['Veg Spring Rolls', 2], ['Paneer Tikka', 2], ['Fresh Lime Soda', 2]],                                                      'card'   ],
  [ 6, 12, 15, 5, [['Butter Chicken', 2], ['Dal Makhani', 2], ['Mango Lassi', 2]],                                                             'cash'   ],
  [ 6, 12, 50, 0, [['Chicken Biryani', 3], ['Onion Rings', 1], ['Fresh Lime Soda', 3]],                                                        'mobile' ],
  [ 6, 13, 35, 2, [['Crispy Calamari', 1], ['Fish & Chips', 2], ['Sparkling Water', 2]],                                                       'cash'   ],
  [ 6, 14, 20, 4, [['Margherita Pizza', 2], ['Chicken Wings', 2], ['Soft Drink (Can)', 4]],                                                    'card'   ],
  [ 6, 15, 30, 3, [['Grilled Chicken Steak', 2], ['Pasta Arrabbiata', 2], ['Cold Coffee', 2]],                                                 'cash'   ],
  [ 6, 17, 15, 1, [['Soup of the Day', 2], ['Dal Makhani', 2], ['Masala Chai', 3]],                                                            'cash'   ],
  [ 6, 18, 30, 5, [['Paneer Tikka', 2], ['Paneer Butter Masala', 2], ['Fresh Orange Juice', 2]],                                               'card'   ],
  [ 6, 19, 45, 0, [['Chicken Wings', 2], ['Butter Chicken', 3], ['Chicken Biryani', 2], ['Gulab Jamun (2 pcs)', 3]],                           'mobile' ],
  [ 6, 20, 30, 2, [['BBQ Chicken Pizza', 2], ['Veg Burger', 2], ['Chocolate Lava Cake', 2], ['Cold Coffee', 2]],                               'cash'   ],
  [ 6, 21, 15, 4, [['Margherita Pizza', 2], ['Chicken Burger', 2], ['Tiramisu', 2], ['Soft Drink (Can)', 3]],                                  'card'   ],
  // Day 6 — Takeaway
  [ 6, 11,  0, null, [['Veg Burger', 1], ['Masala Chai', 2]],                                                                                  'cash',   'takeaway'],
  [ 6, 12, 30, null, [['Chicken Biryani', 2], ['Fresh Lime Soda', 2]],                                                                         'mobile', 'takeaway'],
  [ 6, 14,  0, null, [['Margherita Pizza', 1], ['Garlic Bread', 1], ['Cold Coffee', 1]],                                                       'card',   'takeaway'],
  [ 6, 18, 30, null, [['Butter Chicken', 2], ['Dal Makhani', 1], ['Mineral Water', 2]],                                                        'cash',   'takeaway'],
  [ 6, 20,  0, null, [['BBQ Chicken Pizza', 1], ['Chicken Wings', 1], ['Mango Lassi', 2]],                                                     'mobile', 'takeaway'],
  // Day 6 — Delivery
  [ 6, 12,  0, null, [['Butter Chicken', 2], ['Veg Fried Rice', 2], ['Mango Lassi', 2]],                                                       'mobile', 'delivery'],
  [ 6, 14, 30, null, [['Chicken Biryani', 2], ['Paneer Tikka', 1], ['Cold Coffee', 2]],                                                        'card',   'delivery'],
  [ 6, 19,  0, null, [['Margherita Pizza', 2], ['Veg Spring Rolls', 1], ['Fresh Lime Soda', 4]],                                               'mobile', 'delivery'],
  [ 6, 21,  0, null, [['Paneer Butter Masala', 2], ['Gulab Jamun (2 pcs)', 2], ['Soft Drink (Can)', 2]],                                       'card',   'delivery'],

  // ── Day 7 — Dining ────────────────────────────────────────────────────────
  [ 7,  9,  0, 0, [['Garlic Bread', 2], ['Masala Chai', 2]],                                                                                     'cash'   ],
  [ 7, 10, 30, 3, [['Veg Spring Rolls', 2], ['Paneer Tikka', 1], ['Fresh Lime Soda', 2]],                                                        'card'   ],
  [ 7, 12,  0, 1, [['Butter Chicken', 2], ['Dal Makhani', 1], ['Mango Lassi', 2]],                                                               'cash'   ],
  [ 7, 12, 40, 5, [['Chicken Biryani', 2], ['Veg Fried Rice', 1], ['Soft Drink (Can)', 2]],                                                      'mobile' ],
  [ 7, 13, 20, 2, [['Margherita Pizza', 2], ['Garlic Bread', 1], ['Cold Coffee', 2]],                                                            'cash'   ],
  [ 7, 14, 30, 4, [['Fish & Chips', 2], ['Onion Rings', 1], ['Sparkling Water', 2]],                                                             'card'   ],
  [ 7, 16,  0, 0, [['Pav Bhaji', 2], ['Masala Chai', 2]],                                                                                        'cash'   ],
  [ 7, 18, 15, 3, [['Chicken Wings', 2], ['Butter Chicken', 2], ['Gulab Jamun (2 pcs)', 2], ['Masala Chai', 2]],                                 'mobile' ],
  [ 7, 19, 30, 1, [['BBQ Chicken Pizza', 2], ['Pasta Arrabbiata', 1], ['Iced Tea', 2]],                                                          'card'   ],
  [ 7, 20, 45, 5, [['Grilled Chicken Steak', 2], ['Hakka Noodles', 1], ['Brownie with Ice Cream', 2], ['Cold Coffee', 2]],                       'cash'   ],
  [ 7, 21, 30, 2, [['Paneer Butter Masala', 2], ['Dal Makhani', 1], ['Ras Malai', 2], ['Fresh Lime Soda', 2]],                                   'mobile' ],
  // Day 7 — Takeaway
  [ 7, 11,  0, null, [['Chicken Biryani', 2], ['Mango Lassi', 2]],                                                                               'mobile', 'takeaway'],
  [ 7, 13, 15, null, [['Veg Burger', 1], ['Soft Drink (Can)', 1]],                                                                               'card',   'takeaway'],
  [ 7, 17,  0, null, [['Butter Chicken', 1], ['Dal Makhani', 1], ['Masala Chai', 2]],                                                            'cash',   'takeaway'],
  [ 7, 19, 30, null, [['BBQ Chicken Pizza', 1], ['Chicken Wings', 1], ['Cold Coffee', 2]],                                                       'mobile', 'takeaway'],
  [ 7, 21,  0, null, [['Hakka Noodles', 2], ['Iced Tea', 2]],                                                                                    'card',   'takeaway'],
  // Day 7 — Delivery
  [ 7, 12,  0, null, [['Butter Chicken', 2], ['Veg Fried Rice', 1], ['Mango Lassi', 2]],                                                         'mobile', 'delivery'],
  [ 7, 15, 30, null, [['Chicken Biryani', 2], ['Paneer Tikka', 1], ['Fresh Lime Soda', 2]],                                                      'card',   'delivery'],
  [ 7, 19,  0, null, [['Margherita Pizza', 2], ['Garlic Bread', 1], ['Soft Drink (Can)', 4]],                                                    'mobile', 'delivery'],
  [ 7, 21, 30, null, [['Pav Bhaji', 2], ['Strawberry Milkshake', 2]],                                                                            'card',   'delivery'],

  // ── Day 8 — Dining ────────────────────────────────────────────────────────
  [ 8,  8, 45, 2, [['Masala Chai', 2], ['Garlic Bread', 1]],                                                                                     'cash'   ],
  [ 8, 10, 30, 4, [['Veg Spring Rolls', 2], ['Cold Coffee', 2]],                                                                                 'card'   ],
  [ 8, 12,  0, 0, [['Paneer Tikka', 2], ['Paneer Butter Masala', 2], ['Masala Chai', 2]],                                                        'cash'   ],
  [ 8, 12, 50, 3, [['Chicken Biryani', 3], ['Onion Rings', 1], ['Mango Lassi', 3]],                                                              'mobile' ],
  [ 8, 14,  0, 1, [['Fish & Chips', 2], ['Crispy Calamari', 1], ['Iced Tea', 2]],                                                                'card'   ],
  [ 8, 16, 30, 5, [['Hakka Noodles', 2], ['Pav Bhaji', 1], ['Fresh Lime Soda', 3]],                                                              'cash'   ],
  [ 8, 18, 15, 2, [['Butter Chicken', 2], ['Dal Makhani', 2], ['Gulab Jamun (2 pcs)', 2], ['Masala Chai', 2]],                                   'card'   ],
  [ 8, 19, 45, 4, [['BBQ Chicken Pizza', 2], ['Chicken Wings', 1], ['Brownie with Ice Cream', 2], ['Cold Coffee', 2]],                           'mobile' ],
  [ 8, 21,  0, 0, [['Margherita Pizza', 2], ['Veg Burger', 2], ['Strawberry Milkshake', 2]],                                                     'cash'   ],
  // Day 8 — Takeaway
  [ 8, 11, 30, null, [['Pav Bhaji', 1], ['Masala Chai', 2]],                                                                                     'cash',   'takeaway'],
  [ 8, 13,  0, null, [['Chicken Biryani', 2], ['Fresh Lime Soda', 2]],                                                                           'card',   'takeaway'],
  [ 8, 18, 30, null, [['Butter Chicken', 1], ['Veg Fried Rice', 1], ['Mineral Water', 2]],                                                       'mobile', 'takeaway'],
  [ 8, 20,  0, null, [['Hakka Noodles', 1], ['Iced Tea', 1]],                                                                                    'card',   'takeaway'],
  // Day 8 — Delivery
  [ 8, 12, 30, null, [['Chicken Biryani', 2], ['Paneer Tikka', 1], ['Mango Lassi', 2]],                                                          'mobile', 'delivery'],
  [ 8, 16,  0, null, [['Butter Chicken', 2], ['Dal Makhani', 1], ['Soft Drink (Can)', 4]],                                                       'card',   'delivery'],
  [ 8, 20, 30, null, [['BBQ Chicken Pizza', 2], ['Garlic Bread', 1], ['Cold Coffee', 2]],                                                        'mobile', 'delivery'],

  // ── Day 9 — Dining ────────────────────────────────────────────────────────
  [ 9,  9, 30, 3, [['Veg Spring Rolls', 1], ['Masala Chai', 2]],                                                                                 'cash'   ],
  [ 9, 11,  0, 1, [['Paneer Tikka', 2], ['Dal Makhani', 1], ['Fresh Lime Soda', 2]],                                                             'card'   ],
  [ 9, 12, 30, 5, [['Butter Chicken', 2], ['Chicken Biryani', 2], ['Mango Lassi', 2]],                                                           'cash'   ],
  [ 9, 13, 15, 0, [['Margherita Pizza', 2], ['Garlic Bread', 1], ['Soft Drink (Can)', 2]],                                                       'mobile' ],
  [ 9, 15,  0, 4, [['Grilled Chicken Steak', 2], ['Soup of the Day', 2], ['Iced Tea', 2]],                                                       'card'   ],
  [ 9, 17, 30, 2, [['Pav Bhaji', 2], ['Hakka Noodles', 1], ['Masala Chai', 3]],                                                                  'cash'   ],
  [ 9, 19,  0, 3, [['Chicken Wings', 2], ['BBQ Chicken Pizza', 2], ['Ras Malai', 2], ['Cold Coffee', 2]],                                        'mobile' ],
  [ 9, 20, 30, 1, [['Paneer Butter Masala', 2], ['Veg Fried Rice', 1], ['Brownie with Ice Cream', 2], ['Fresh Lime Soda', 2]],                   'cash'   ],
  // Day 9 — Takeaway
  [ 9, 10, 45, null, [['Garlic Bread', 1], ['Masala Chai', 2]],                                                                                  'cash',   'takeaway'],
  [ 9, 13,  0, null, [['Chicken Biryani', 2], ['Mango Lassi', 2]],                                                                               'mobile', 'takeaway'],
  [ 9, 17, 30, null, [['Pav Bhaji', 1], ['Hakka Noodles', 1], ['Iced Tea', 2]],                                                                  'card',   'takeaway'],
  [ 9, 20,  0, null, [['Butter Chicken', 1], ['Dal Makhani', 1], ['Mineral Water', 2]],                                                          'cash',   'takeaway'],
  // Day 9 — Delivery
  [ 9, 12,  0, null, [['Butter Chicken', 2], ['Veg Fried Rice', 1], ['Mango Lassi', 2]],                                                         'mobile', 'delivery'],
  [ 9, 15, 30, null, [['Chicken Biryani', 2], ['Paneer Tikka', 1], ['Soft Drink (Can)', 2]],                                                     'card',   'delivery'],
  [ 9, 20, 30, null, [['BBQ Chicken Pizza', 2], ['Chicken Wings', 1], ['Strawberry Milkshake', 2]],                                              'mobile', 'delivery'],

  // ── Day 10 — Dining ───────────────────────────────────────────────────────
  [10,  9,  0, 2, [['Garlic Bread', 2], ['Masala Chai', 3]],                                                                                     'cash'   ],
  [10, 11, 30, 4, [['Paneer Tikka', 2], ['Dal Makhani', 2], ['Fresh Lime Soda', 2]],                                                             'card'   ],
  [10, 12, 30, 0, [['Butter Chicken', 2], ['Chicken Biryani', 2], ['Mango Lassi', 2]],                                                           'mobile' ],
  [10, 14,  0, 3, [['Margherita Pizza', 2], ['Onion Rings', 1], ['Cold Coffee', 2]],                                                             'cash'   ],
  [10, 16, 45, 5, [['Hakka Noodles', 2], ['Pav Bhaji', 2], ['Iced Tea', 2]],                                                                     'card'   ],
  [10, 18, 30, 1, [['Chicken Wings', 2], ['BBQ Chicken Pizza', 1], ['Ras Malai', 2], ['Masala Chai', 2]],                                        'cash'   ],
  [10, 20,  0, 2, [['Grilled Chicken Steak', 2], ['Pasta Arrabbiata', 1], ['Brownie with Ice Cream', 2], ['Soft Drink (Can)', 2]],               'mobile' ],
  [10, 21, 15, 4, [['Paneer Butter Masala', 2], ['Veg Burger', 1], ['Chocolate Lava Cake', 2], ['Fresh Lime Soda', 2]],                          'card'   ],
  // Day 10 — Takeaway
  [10, 11, 15, null, [['Pav Bhaji', 1], ['Masala Chai', 2]],                                                                                     'cash',   'takeaway'],
  [10, 13, 45, null, [['Chicken Biryani', 2], ['Mango Lassi', 2]],                                                                               'mobile', 'takeaway'],
  [10, 18,  0, null, [['Hakka Noodles', 1], ['Iced Tea', 1]],                                                                                    'card',   'takeaway'],
  [10, 20, 30, null, [['Butter Chicken', 1], ['Veg Fried Rice', 1], ['Mineral Water', 2]],                                                       'cash',   'takeaway'],
  // Day 10 — Delivery
  [10, 12, 30, null, [['Butter Chicken', 2], ['Dal Makhani', 1], ['Mango Lassi', 2]],                                                            'mobile', 'delivery'],
  [10, 16,  0, null, [['Chicken Biryani', 2], ['Paneer Tikka', 1], ['Soft Drink (Can)', 2]],                                                     'card',   'delivery'],
  [10, 20,  0, null, [['BBQ Chicken Pizza', 2], ['Garlic Bread', 1], ['Cold Coffee', 2]],                                                        'mobile', 'delivery'],

  // ── Day 11 — Dining ───────────────────────────────────────────────────────
  [11,  9, 30, 1, [['Garlic Bread', 1], ['Masala Chai', 2]],                                                                                     'cash'   ],
  [11, 11,  0, 0, [['Veg Spring Rolls', 2], ['Cold Coffee', 2]],                                                                                 'card'   ],
  [11, 12, 30, 3, [['Butter Chicken', 2], ['Dal Makhani', 2], ['Fresh Lime Soda', 2]],                                                           'cash'   ],
  [11, 14,  0, 5, [['Chicken Biryani', 2], ['Onion Rings', 1], ['Mango Lassi', 2]],                                                              'mobile' ],
  [11, 17, 30, 2, [['Margherita Pizza', 2], ['Pasta Arrabbiata', 1], ['Iced Tea', 2]],                                                           'card'   ],
  [11, 19, 15, 4, [['Paneer Butter Masala', 2], ['Hakka Noodles', 1], ['Ras Malai', 2], ['Masala Chai', 2]],                                     'cash'   ],
  [11, 21,  0, 1, [['BBQ Chicken Pizza', 2], ['Chicken Burger', 2], ['Strawberry Milkshake', 2]],                                                'mobile' ],
  // Day 11 — Takeaway
  [11, 12,  0, null, [['Chicken Biryani', 2], ['Mango Lassi', 2]],                                                                               'mobile', 'takeaway'],
  [11, 15,  0, null, [['Pav Bhaji', 1], ['Masala Chai', 2]],                                                                                     'cash',   'takeaway'],
  [11, 19,  0, null, [['Butter Chicken', 1], ['Dal Makhani', 1], ['Mineral Water', 2]],                                                          'card',   'takeaway'],
  [11, 21, 30, null, [['Hakka Noodles', 1], ['Iced Tea', 1]],                                                                                    'cash',   'takeaway'],
  // Day 11 — Delivery
  [11, 12, 30, null, [['Butter Chicken', 2], ['Veg Fried Rice', 1], ['Mango Lassi', 2]],                                                         'mobile', 'delivery'],
  [11, 16, 30, null, [['Chicken Biryani', 2], ['Paneer Tikka', 1], ['Fresh Lime Soda', 2]],                                                      'card',   'delivery'],
  [11, 20,  0, null, [['BBQ Chicken Pizza', 2], ['Garlic Bread', 1], ['Cold Coffee', 2]],                                                        'mobile', 'delivery'],

  // ── Day 12 — Dining ───────────────────────────────────────────────────────
  [12,  9,  0, 3, [['Masala Chai', 2], ['Veg Spring Rolls', 1]],                                                                                 'cash'   ],
  [12, 11, 30, 0, [['Paneer Tikka', 2], ['Dal Makhani', 1], ['Fresh Lime Soda', 2]],                                                             'card'   ],
  [12, 13,  0, 2, [['Chicken Biryani', 2], ['Butter Chicken', 1], ['Mango Lassi', 2]],                                                           'cash'   ],
  [12, 15, 30, 5, [['Grilled Chicken Steak', 2], ['Soup of the Day', 2], ['Cold Coffee', 2]],                                                    'mobile' ],
  [12, 18,  0, 4, [['Margherita Pizza', 2], ['Pav Bhaji', 1], ['Iced Tea', 2]],                                                                  'card'   ],
  [12, 20, 30, 1, [['Chicken Wings', 2], ['BBQ Chicken Pizza', 1], ['Brownie with Ice Cream', 2], ['Masala Chai', 2]],                           'cash'   ],
  // Day 12 — Takeaway
  [12, 12,  0, null, [['Pav Bhaji', 2], ['Masala Chai', 2]],                                                                                     'cash',   'takeaway'],
  [12, 15, 30, null, [['Chicken Biryani', 2], ['Fresh Lime Soda', 2]],                                                                           'mobile', 'takeaway'],
  [12, 20,  0, null, [['Hakka Noodles', 1], ['Iced Tea', 1]],                                                                                    'card',   'takeaway'],
  // Day 12 — Delivery
  [12, 12, 30, null, [['Butter Chicken', 2], ['Veg Fried Rice', 1], ['Mango Lassi', 2]],                                                         'mobile', 'delivery'],
  [12, 17,  0, null, [['Chicken Biryani', 2], ['Paneer Tikka', 1], ['Soft Drink (Can)', 2]],                                                     'card',   'delivery'],
  [12, 20, 30, null, [['BBQ Chicken Pizza', 2], ['Chicken Wings', 1], ['Cold Coffee', 2]],                                                       'mobile', 'delivery'],

  // ── Day 13 — Dining ───────────────────────────────────────────────────────
  [13,  9, 30, 4, [['Garlic Bread', 2], ['Masala Chai', 2]],                                                                                     'cash'   ],
  [13, 12,  0, 2, [['Butter Chicken', 2], ['Dal Makhani', 1], ['Mango Lassi', 2]],                                                               'card'   ],
  [13, 13, 30, 0, [['Chicken Biryani', 2], ['Onion Rings', 1], ['Soft Drink (Can)', 2]],                                                         'mobile' ],
  [13, 17,  0, 5, [['Margherita Pizza', 2], ['Pasta Arrabbiata', 1], ['Cold Coffee', 2]],                                                        'cash'   ],
  [13, 19, 30, 3, [['Paneer Butter Masala', 2], ['Hakka Noodles', 1], ['Ras Malai', 2], ['Masala Chai', 2]],                                     'card'   ],
  [13, 21,  0, 1, [['BBQ Chicken Pizza', 2], ['Chicken Wings', 2], ['Strawberry Milkshake', 2]],                                                 'mobile' ],
  // Day 13 — Takeaway
  [13, 11, 30, null, [['Pav Bhaji', 1], ['Masala Chai', 2]],                                                                                     'cash',   'takeaway'],
  [13, 14,  0, null, [['Chicken Biryani', 2], ['Mango Lassi', 2]],                                                                               'mobile', 'takeaway'],
  [13, 20,  0, null, [['Butter Chicken', 1], ['Dal Makhani', 1], ['Mineral Water', 2]],                                                          'card',   'takeaway'],
  // Day 13 — Delivery
  [13, 12,  0, null, [['Butter Chicken', 2], ['Veg Fried Rice', 1], ['Mango Lassi', 2]],                                                         'mobile', 'delivery'],
  [13, 17, 30, null, [['Chicken Biryani', 2], ['Paneer Tikka', 1], ['Fresh Lime Soda', 2]],                                                      'card',   'delivery'],
];

// ── Ingredients catalogue (costs in INR per unit) ─────────────────────────
// [name, unit, opening_stock, reorder_level, reorder_qty, latest_unit_cost, perishable]
// opening_stock is the amount received as initial stock (used for PURCHASE txn).
// stock_on_hand in the DB is set to 0 on insert and reconciled at the end.
const INGREDIENTS = [
  // ── Perishable (daily check) ───────────────────────────────────────────
  ['Chicken',              'kg',  10.000,  2.0,  5.0, 280.0000, true ],
  ['Chicken Breast',       'kg',   8.000,  2.0,  5.0, 380.0000, true ],
  ['Fish Fillet',          'kg',   5.000,  1.0,  3.0, 550.0000, true ],
  ['Calamari',             'kg',   3.000,  0.8,  2.0, 650.0000, true ],
  ['Paneer',               'kg',   4.000,  0.8,  2.0, 340.0000, true ],
  ['Mozzarella Cheese',    'kg',   3.000,  0.5,  2.0, 480.0000, true ],
  ['Milk',                 'L',   10.000,  2.0,  5.0,  60.0000, true ],
  ['Butter',               'kg',   5.000,  1.0,  3.0, 450.0000, true ],
  ['Cooking Cream',        'L',    4.000,  1.0,  3.0, 280.0000, true ],
  ['Heavy Cream',          'L',    2.000,  0.5,  1.5, 180.0000, true ],
  ['Yogurt',               'L',    5.000,  1.0,  3.0,  80.0000, true ],
  ['Eggs',                 'pcs', 30.000,  8.0, 20.0,  12.0000, true ],
  ['Tomatoes',             'kg',   8.000,  2.0,  5.0,  60.0000, true ],
  ['Mango Pulp',           'L',    5.000,  1.0,  3.0, 200.0000, true ],
  ['Oranges',              'kg',   6.000,  1.5,  4.0, 100.0000, true ],
  ['Vegetable Mix',        'kg',   5.000,  1.5,  3.0,  80.0000, true ],
  ['Pizza Dough',          'pcs', 20.000,  5.0, 10.0,  45.0000, true ],
  ['Burger Bun',           'pcs', 50.000, 10.0, 20.0,  20.0000, true ],
  ['Bread Loaf',           'pcs', 30.000,  8.0, 20.0,  30.0000, true ],

  // ── Dry goods (long-lasting) ───────────────────────────────────────────
  ['Basmati Rice',         'kg',  15.000,  3.0, 10.0, 100.0000, false],
  ['Black Lentils',        'kg',   5.000,  1.0,  3.0, 120.0000, false],
  ['Pasta',                'kg',   5.000,  1.0,  3.0,  80.0000, false],
  ['All-Purpose Flour',    'kg',  10.000,  2.0,  5.0,  45.0000, false],
  ['Sugar',                'kg',   5.000,  1.0,  3.0,  45.0000, false],
  ['Dark Chocolate',       'kg',   2.000,  0.3,  1.0, 600.0000, false],
  ['Tea Leaves',           'kg',   2.000,  0.3,  1.0, 600.0000, false],
  ['Coffee',               'kg',   2.000,  0.3,  1.0, 900.0000, false],
  ['Spice Blend',          'kg',   2.000,  0.3,  1.0, 350.0000, false],
  ['Onions',               'kg',  10.000,  2.0,  5.0,  40.0000, false],
  ['Garlic',               'kg',   3.000,  0.5,  2.0, 200.0000, false],
  ['Potatoes',             'kg',  10.000,  2.0,  5.0,  30.0000, false],
  ['Spring Roll Wrappers', 'pcs', 30.000,  8.0, 20.0,   8.0000, false],
  ['BBQ Sauce',            'L',    2.000,  0.5,  1.5, 250.0000, false],

  // ── Additional ingredients ────────────────────────────────────────────────
  ['Noodles',              'kg',   5.000,  1.0,  3.0,  70.0000, false],
  ['Condensed Milk',       'L',    3.000,  0.5,  2.0, 120.0000, true ],
  ['Strawberry Puree',     'L',    2.000,  0.5,  1.5, 180.0000, true ],
];

// ── Recipes & ingredients ──────────────────────────────────────────────────
// Each recipe: [recipeName, yieldQty, yieldUnit, prepTimeSec, menuItemName,
//               [[ingredientName, qty, unit], ...]]
// 30 recipes covering all menu items except packaged goods
// (Mineral Water, Sparkling Water, Soft Drink Can, Fresh Lime Soda).
const RECIPES = [
  // ── Starters ──────────────────────────────────────────────────────────────
  ['Veg Spring Rolls', 1, 'portion', 600, 'Veg Spring Rolls', [
    ['Spring Roll Wrappers', 2.0000, 'pcs'],
    ['Vegetable Mix',        0.1000, 'kg' ],
    ['All-Purpose Flour',    0.0200, 'kg' ],
  ]],
  ['Chicken Wings', 1, 'portion', 720, 'Chicken Wings', [
    ['Chicken',     0.3000, 'kg'],
    ['Spice Blend', 0.0200, 'kg'],
    ['Garlic',      0.0150, 'kg'],
    ['BBQ Sauce',   0.0300, 'L' ],
  ]],
  ['Garlic Bread', 1, 'portion', 300, 'Garlic Bread', [
    ['Bread Loaf', 2.0000, 'pcs'],
    ['Butter',     0.0300, 'kg' ],
    ['Garlic',     0.0100, 'kg' ],
  ]],
  ['Onion Rings', 1, 'portion', 480, 'Onion Rings', [
    ['Onions',           0.1500, 'kg'],
    ['All-Purpose Flour',0.0500, 'kg'],
    ['Milk',             0.0500, 'L' ],
  ]],
  ['Paneer Tikka', 1, 'portion', 600, 'Paneer Tikka', [
    ['Paneer',      0.1500, 'kg'],
    ['Onions',      0.0500, 'kg'],
    ['Spice Blend', 0.0200, 'kg'],
    ['Yogurt',      0.0500, 'L' ],
  ]],
  ['Crispy Calamari', 1, 'portion', 600, 'Crispy Calamari', [
    ['Calamari',         0.2000, 'kg' ],
    ['All-Purpose Flour',0.0500, 'kg' ],
    ['Spice Blend',      0.0100, 'kg' ],
    ['Eggs',             1.0000, 'pcs'],
  ]],
  ['Bruschetta', 1, 'portion', 300, 'Bruschetta', [
    ['Bread Loaf', 2.0000, 'pcs'],
    ['Tomatoes',   0.1000, 'kg' ],
    ['Garlic',     0.0100, 'kg' ],
  ]],
  ['Soup of the Day', 1, 'bowl', 600, 'Soup of the Day', [
    ['Vegetable Mix', 0.1500, 'kg'],
    ['Onions',        0.0500, 'kg'],
    ['Cooking Cream', 0.0500, 'L' ],
    ['Spice Blend',   0.0100, 'kg'],
  ]],
  // ── Mains ─────────────────────────────────────────────────────────────────
  ['Butter Chicken', 1, 'portion', 900, 'Butter Chicken', [
    ['Chicken',       0.2500, 'kg'],
    ['Butter',        0.0500, 'kg'],
    ['Tomatoes',      0.1500, 'kg'],
    ['Cooking Cream', 0.0500, 'L' ],
    ['Onions',        0.1000, 'kg'],
    ['Garlic',        0.0200, 'kg'],
    ['Spice Blend',   0.0200, 'kg'],
  ]],
  ['Dal Makhani', 1, 'portion', 1800, 'Dal Makhani', [
    ['Black Lentils', 0.1500, 'kg'],
    ['Butter',        0.0400, 'kg'],
    ['Tomatoes',      0.1000, 'kg'],
    ['Cooking Cream', 0.0500, 'L' ],
    ['Onions',        0.0800, 'kg'],
    ['Spice Blend',   0.0200, 'kg'],
  ]],
  ['Veg Fried Rice', 1, 'portion', 720, 'Veg Fried Rice', [
    ['Basmati Rice',  0.2000, 'kg'],
    ['Vegetable Mix', 0.1500, 'kg'],
    ['Onions',        0.0800, 'kg'],
    ['Garlic',        0.0150, 'kg'],
  ]],
  ['Chicken Biryani', 1, 'portion', 1200, 'Chicken Biryani', [
    ['Chicken',      0.3000, 'kg'],
    ['Basmati Rice', 0.2000, 'kg'],
    ['Onions',       0.1500, 'kg'],
    ['Garlic',       0.0200, 'kg'],
    ['Spice Blend',  0.0300, 'kg'],
  ]],
  ['Grilled Chicken Steak', 1, 'portion', 900, 'Grilled Chicken Steak', [
    ['Chicken Breast', 0.2800, 'kg'],
    ['Spice Blend',    0.0200, 'kg'],
    ['Butter',         0.0300, 'kg'],
  ]],
  ['Fish & Chips', 1, 'portion', 900, 'Fish & Chips', [
    ['Fish Fillet',      0.2000, 'kg'],
    ['Potatoes',         0.2000, 'kg'],
    ['All-Purpose Flour',0.0500, 'kg'],
    ['Spice Blend',      0.0100, 'kg'],
  ]],
  ['Veg Burger', 1, 'portion', 600, 'Veg Burger', [
    ['Burger Bun',       1.0000, 'pcs'],
    ['Potatoes',         0.1500, 'kg' ],
    ['Vegetable Mix',    0.1000, 'kg' ],
    ['Onions',           0.0500, 'kg' ],
    ['All-Purpose Flour',0.0300, 'kg' ],
  ]],
  ['Chicken Burger', 1, 'portion', 600, 'Chicken Burger', [
    ['Burger Bun',     1.0000, 'pcs'],
    ['Chicken Breast', 0.1500, 'kg' ],
    ['Onions',         0.0300, 'kg' ],
    ['Spice Blend',    0.0150, 'kg' ],
  ]],
  ['Margherita Pizza', 1, 'pizza', 900, 'Margherita Pizza', [
    ['Pizza Dough',      1.0000, 'pcs'],
    ['Mozzarella Cheese',0.1200, 'kg' ],
    ['Tomatoes',         0.1500, 'kg' ],
  ]],
  ['BBQ Chicken Pizza', 1, 'pizza', 900, 'BBQ Chicken Pizza', [
    ['Pizza Dough',      1.0000, 'pcs'],
    ['Mozzarella Cheese',0.1200, 'kg' ],
    ['Chicken',          0.1500, 'kg' ],
    ['BBQ Sauce',        0.0600, 'L'  ],
  ]],
  ['Pasta Arrabbiata', 1, 'portion', 720, 'Pasta Arrabbiata', [
    ['Pasta',       0.1500, 'kg'],
    ['Tomatoes',    0.2000, 'kg'],
    ['Garlic',      0.0200, 'kg'],
    ['Spice Blend', 0.0200, 'kg'],
  ]],
  ['Paneer Butter Masala', 1, 'portion', 720, 'Paneer Butter Masala', [
    ['Paneer',        0.2000, 'kg'],
    ['Butter',        0.0400, 'kg'],
    ['Tomatoes',      0.1200, 'kg'],
    ['Cooking Cream', 0.0500, 'L' ],
    ['Onions',        0.0800, 'kg'],
    ['Spice Blend',   0.0200, 'kg'],
  ]],
  // ── Desserts ──────────────────────────────────────────────────────────────
  ['Chocolate Lava Cake', 1, 'serving', 600, 'Chocolate Lava Cake', [
    ['Dark Chocolate',   0.0800, 'kg' ],
    ['Butter',           0.0400, 'kg' ],
    ['Sugar',            0.0400, 'kg' ],
    ['All-Purpose Flour',0.0300, 'kg' ],
    ['Eggs',             2.0000, 'pcs'],
  ]],
  ['Gulab Jamun', 2, 'pcs', 480, 'Gulab Jamun (2 pcs)', [
    ['All-Purpose Flour',0.0600, 'kg'],
    ['Milk',             0.0400, 'L' ],
    ['Sugar',            0.0600, 'kg'],
    ['Cooking Cream',    0.0200, 'L' ],
  ]],
  ['Vanilla Ice Cream', 1, 'serving', 60, 'Vanilla Ice Cream', [
    ['Milk',        0.1000, 'L' ],
    ['Sugar',       0.0300, 'kg'],
    ['Heavy Cream', 0.0800, 'L' ],
  ]],
  ['Mango Sorbet', 1, 'serving', 60, 'Mango Sorbet', [
    ['Mango Pulp', 0.1200, 'L' ],
    ['Sugar',      0.0300, 'kg'],
  ]],
  ['Cheesecake', 1, 'slice', 120, 'Cheesecake', [
    ['All-Purpose Flour',0.0600, 'kg'],
    ['Butter',           0.0400, 'kg'],
    ['Sugar',            0.0500, 'kg'],
    ['Cooking Cream',    0.1000, 'L' ],
  ]],
  ['Tiramisu', 1, 'serving', 120, 'Tiramisu', [
    ['Coffee',        0.0200, 'kg'],
    ['Sugar',         0.0400, 'kg'],
    ['Cooking Cream', 0.1000, 'L' ],
    ['Milk',          0.0500, 'L' ],
  ]],
  // ── Drinks ────────────────────────────────────────────────────────────────
  ['Masala Chai', 1, 'cup', 300, 'Masala Chai', [
    ['Tea Leaves',  0.0050, 'kg'],
    ['Milk',        0.1500, 'L' ],
    ['Sugar',       0.0200, 'kg'],
    ['Spice Blend', 0.0030, 'kg'],
  ]],
  ['Cold Coffee', 1, 'glass', 180, 'Cold Coffee', [
    ['Coffee', 0.0150, 'kg'],
    ['Milk',   0.2000, 'L' ],
    ['Sugar',  0.0300, 'kg'],
  ]],
  ['Mango Lassi', 1, 'glass', 120, 'Mango Lassi', [
    ['Mango Pulp', 0.1000, 'L' ],
    ['Yogurt',     0.1500, 'L' ],
    ['Sugar',      0.0200, 'kg'],
  ]],
  ['Fresh Orange Juice', 1, 'glass', 120, 'Fresh Orange Juice', [
    ['Oranges', 0.3000, 'kg'],
  ]],
  // ── Additional recipes ────────────────────────────────────────────────────
  ['Hakka Noodles', 1, 'portion', 600, 'Hakka Noodles', [
    ['Noodles',       0.1500, 'kg'],
    ['Vegetable Mix', 0.1000, 'kg'],
    ['Garlic',        0.0150, 'kg'],
    ['Spice Blend',   0.0100, 'kg'],
  ]],
  ['Pav Bhaji', 1, 'portion', 720, 'Pav Bhaji', [
    ['Potatoes',      0.2000, 'kg' ],
    ['Vegetable Mix', 0.1000, 'kg' ],
    ['Onions',        0.0800, 'kg' ],
    ['Butter',        0.0400, 'kg' ],
    ['Spice Blend',   0.0200, 'kg' ],
    ['Burger Bun',    2.0000, 'pcs'],
  ]],
  ['Ras Malai', 1, 'serving', 300, 'Ras Malai', [
    ['Milk',           0.2000, 'L'  ],
    ['Sugar',          0.0500, 'kg' ],
    ['Condensed Milk', 0.0500, 'L'  ],
  ]],
  ['Brownie with Ice Cream', 1, 'serving', 600, 'Brownie with Ice Cream', [
    ['Dark Chocolate',    0.0600, 'kg' ],
    ['Butter',            0.0350, 'kg' ],
    ['Sugar',             0.0400, 'kg' ],
    ['All-Purpose Flour', 0.0400, 'kg' ],
    ['Eggs',              1.0000, 'pcs'],
    ['Milk',              0.0500, 'L'  ],
  ]],
  ['Iced Tea', 1, 'glass', 120, 'Iced Tea', [
    ['Tea Leaves', 0.0040, 'kg'],
    ['Sugar',      0.0200, 'kg'],
  ]],
  ['Strawberry Milkshake', 1, 'glass', 120, 'Strawberry Milkshake', [
    ['Strawberry Puree', 0.0800, 'L' ],
    ['Milk',             0.1500, 'L' ],
    ['Sugar',            0.0200, 'kg'],
  ]],
];

// ── Combo meals (prices in INR) ────────────────────────────────────────────
// [name, sku, price, [[menuItemName, qty, sort_order], ...]]
const COMBOS = [
  ['Veg Lunch Special', 'COMBO-VEG-01', 649, [
    ['Paneer Tikka', 1, 0],
    ['Dal Makhani',  1, 1],
    ['Masala Chai',  1, 2],
  ]],
  ["Chef's Non-Veg Combo", 'COMBO-NV-01', 899, [
    ['Chicken Wings',  1, 0],
    ['Butter Chicken', 1, 1],
    ['Cold Coffee',    1, 2],
  ]],
  ['Weekend Brunch Combo', 'COMBO-BRUNCH-01', 549, [
    ['Veg Spring Rolls', 1, 0],
    ['Veg Fried Rice',   1, 1],
    ['Mango Lassi',      1, 2],
  ]],
  ['Desi Thali', 'COMBO-THALI-01', 799, [
    ['Butter Chicken', 1, 0],
    ['Dal Makhani',    1, 1],
    ['Veg Fried Rice', 1, 2],
    ['Masala Chai',    1, 3],
  ]],
  ['Pizza Night Combo', 'COMBO-PIZZA-01', 749, [
    ['Margherita Pizza', 1, 0],
    ['Garlic Bread',     1, 1],
    ['Soft Drink (Can)', 2, 2],
  ]],
];

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  // ── 1. Clear existing seed data scoped to this restaurant ──────────────────
  console.log('Clearing existing data…');

  // Reclaim demo emails held by a stale earlier seed. users.email is globally
  // unique, so a pre-fixed-id seed (sequential ids under a different restaurant id)
  // would collide with the user insert below. Every restaurant_id FK cascades, so
  // dropping the stale restaurant clears its users + orders — but recipe_ingredients
  // and combo_items are join tables with no restaurant_id, and their NO ACTION FK to
  // ingredients/menu_items can fire mid-cascade, so delete those two explicitly first.
  const SEED_EMAILS = SEED_USERS.map((u) => u.email);
  const { rows: staleRestaurants } = await client.query(
    `SELECT DISTINCT restaurant_id AS id FROM users
     WHERE restaurant_id IS NOT NULL AND restaurant_id <> $1 AND email = ANY($2)`,
    [RESTAURANT_ID, SEED_EMAILS],
  );
  for (const { id: staleId } of staleRestaurants) {
    await client.query(
      'DELETE FROM stock_count_lines WHERE stock_count_id IN (SELECT id FROM stock_counts WHERE restaurant_id = $1)',
      [staleId],
    );
    await client.query(
      'DELETE FROM recipe_ingredients WHERE recipe_id IN (SELECT id FROM recipes WHERE restaurant_id = $1)',
      [staleId],
    );
    await client.query(
      'DELETE FROM combo_items WHERE combo_id IN (SELECT id FROM combo_meals WHERE restaurant_id = $1)',
      [staleId],
    );
    await client.query('DELETE FROM restaurants WHERE id = $1', [staleId]);
    console.log(`  reclaimed stale demo restaurant ${staleId}`);
  }

  // Recipe / inventory tables first (FK order)
  await client.query('DELETE FROM cost_snapshots       WHERE restaurant_id = $1', [RESTAURANT_ID]);
  await client.query('DELETE FROM inventory_transactions WHERE restaurant_id = $1', [RESTAURANT_ID]);
  await client.query('DELETE FROM waste_insights        WHERE restaurant_id = $1', [RESTAURANT_ID]);
  await client.query('DELETE FROM waste_logs           WHERE restaurant_id = $1', [RESTAURANT_ID]);
  await client.query(`
    DELETE FROM recipe_ingredients
    WHERE recipe_id IN (SELECT id FROM recipes WHERE restaurant_id = $1)
  `, [RESTAURANT_ID]);
  await client.query(`
    DELETE FROM combo_items
    WHERE combo_id IN (SELECT id FROM combo_meals WHERE restaurant_id = $1)
  `, [RESTAURANT_ID]);
  await client.query('DELETE FROM combo_meals          WHERE restaurant_id = $1', [RESTAURANT_ID]);
  await client.query('DELETE FROM recipes              WHERE restaurant_id = $1', [RESTAURANT_ID]);
  await client.query('DELETE FROM stock_count_lines WHERE stock_count_id IN (SELECT id FROM stock_counts WHERE restaurant_id = $1)', [RESTAURANT_ID]);
  await client.query('DELETE FROM stock_counts         WHERE restaurant_id = $1', [RESTAURANT_ID]);
  await client.query('DELETE FROM ingredients          WHERE restaurant_id = $1', [RESTAURANT_ID]);
  // Reservations
  await client.query('DELETE FROM reservations WHERE restaurant_id = $1', [RESTAURANT_ID]);
  // Core tables
  await client.query(`
    DELETE FROM payments
    WHERE order_id IN (SELECT id FROM orders WHERE restaurant_id = $1)
  `, [RESTAURANT_ID]);
  await client.query(`
    DELETE FROM order_items
    WHERE order_id IN (SELECT id FROM orders WHERE restaurant_id = $1)
  `, [RESTAURANT_ID]);
  await client.query('DELETE FROM order_counters      WHERE restaurant_id = $1', [RESTAURANT_ID]);
  await client.query('DELETE FROM orders              WHERE restaurant_id = $1', [RESTAURANT_ID]);
  await client.query('DELETE FROM menu_items          WHERE restaurant_id = $1', [RESTAURANT_ID]);
  await client.query('DELETE FROM tables              WHERE restaurant_id = $1', [RESTAURANT_ID]);
  await client.query('DELETE FROM shift_counts        WHERE restaurant_id = $1', [RESTAURANT_ID]);
  await client.query('DELETE FROM staff_notifications WHERE restaurant_id = $1', [RESTAURANT_ID]);
  await client.query('DELETE FROM users               WHERE restaurant_id = $1', [RESTAURANT_ID]);
  await client.query('DELETE FROM settings   WHERE restaurant_id = $1', [RESTAURANT_ID]);
  await client.query('DELETE FROM loyalty_transactions WHERE restaurant_id = $1', [RESTAURANT_ID]);
  await client.query('DELETE FROM loyalty_customers   WHERE restaurant_id = $1', [RESTAURANT_ID]);
  await client.query('DELETE FROM loyalty_tiers       WHERE restaurant_id = $1', [RESTAURANT_ID]);
  await client.query('DELETE FROM loyalty_rewards     WHERE restaurant_id = $1', [RESTAURANT_ID]);
  await client.query('DELETE FROM coupons             WHERE restaurant_id = $1', [RESTAURANT_ID]);

  // ── 2. Restaurant ──────────────────────────────────────────────────────────
  console.log('Ensuring restaurant…');
  await client.query(`
    INSERT INTO restaurants (id, name)
    VALUES ($1, 'Demo Restaurant')
    ON CONFLICT (id) DO UPDATE SET name = 'Demo Restaurant'
  `, [RESTAURANT_ID]);

  // ── 3. Settings ────────────────────────────────────────────────────────────
  console.log('Seeding settings…');
  await client.query(`
    INSERT INTO settings (restaurant_id, key, value) VALUES
      ($1, 'timezone',                 $2),
      ($1, 'currency',                 'INR'),
      ($1, 'tax_rate',                 '5'),
      ($1, 'service_charge',           '0'),
      ($1, 'staff_assignment_enabled',  'true'),
      ($1, 'reservations_enabled',      'true'),
      ($1, 'loyalty_points_per_unit',   '10'),
      ($1, 'loyalty_points_value',      '0.1')
  `, [RESTAURANT_ID, TIMEZONE]);

  // ── 3.5. Loyalty tiers & rewards ──────────────────────────────────────────
  console.log('Seeding loyalty tiers and rewards…');
  const DEFAULT_TIERS = [
    { name: 'Bronze',   min_points: 0,     color: '#a06b2a', sort_order: 0 },
    { name: 'Silver',   min_points: 1000,  color: '#5a6068', sort_order: 1 },
    { name: 'Gold',     min_points: 5000,  color: '#8a6a14', sort_order: 2 },
    { name: 'Platinum', min_points: 10000, color: '#3a3a47', sort_order: 3 },
  ];
  const DEFAULT_REWARDS = [
    { name: 'Free Filter Coffee',    description: 'House blend · any size',  icon: '☕', points_cost: 500,  sort_order: 0 },
    { name: '15% off next bill',     description: 'Max ₹500 · dine-in only', icon: '%',  points_cost: 1500, sort_order: 1 },
    { name: 'Complimentary Dessert', description: 'Choice of three',         icon: '🍰', points_cost: 2000, sort_order: 2 },
  ];
  for (const t of DEFAULT_TIERS) {
    await client.query(
      `INSERT INTO loyalty_tiers (restaurant_id, name, min_points, color, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [RESTAURANT_ID, t.name, t.min_points, t.color, t.sort_order],
    );
  }
  for (const r of DEFAULT_REWARDS) {
    await client.query(
      `INSERT INTO loyalty_rewards (restaurant_id, name, description, icon, points_cost, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [RESTAURANT_ID, r.name, r.description, r.icon, r.points_cost, r.sort_order],
    );
  }
  console.log(`  ${DEFAULT_TIERS.length} tiers, ${DEFAULT_REWARDS.length} rewards inserted`);

  // ── 4. Users ───────────────────────────────────────────────────────────────
  console.log('Seeding users…');
  const uniquePasswords = [...new Set(SEED_USERS.map((u) => u.password))];
  const hashes = await Promise.all(uniquePasswords.map((p) => bcrypt.hash(p, 10)));
  const hashByPassword = Object.fromEntries(uniquePasswords.map((p, i) => [p, hashes[i]]));

  for (const u of SEED_USERS) {
    await client.query(`
      INSERT INTO users (id, email, password, role, name, staff_pin, restaurant_id, email_verified)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true)
    `, [u.id, u.email, hashByPassword[u.password], u.role, u.name, u.pin, RESTAURANT_ID]);
  }

  // ── 4.5. Coupons ───────────────────────────────────────────────────────────
  console.log('Seeding coupons…');
  const SEED_COUPONS = [
    { code: 'WELCOME10', description: '10% off for new customers',        discount_type: 'percent', discount_value: 10,  min_order_amount: 0,   max_uses: null, expires_at: null },
    { code: 'FLAT50',    description: '₹50 flat discount on orders ₹300+', discount_type: 'flat',    discount_value: 50,  min_order_amount: 300, max_uses: null, expires_at: null },
    { code: 'SAVE20',    description: '20% off weekday orders',            discount_type: 'percent', discount_value: 20,  min_order_amount: 200, max_uses: 100,  expires_at: null },
    { code: 'PARTY15',    description: '15% off for groups (orders ₹500+)',     discount_type: 'percent', discount_value: 15, min_order_amount: 500, max_uses: 50,   expires_at: null },
    { code: 'LUNCH15',    description: '15% off on weekday lunch orders',        discount_type: 'percent', discount_value: 15, min_order_amount: 300, max_uses: 200,  expires_at: null },
    { code: 'DELIVERY10', description: '₹10 flat off on delivery orders',       discount_type: 'flat',    discount_value: 10, min_order_amount: 150, max_uses: null, expires_at: null },
    { code: 'LOYALTY50',  description: '₹50 off for loyalty programme members', discount_type: 'flat',    discount_value: 50, min_order_amount: 400, max_uses: null, expires_at: null },
  ];
  for (const c of SEED_COUPONS) {
    await client.query(`
      INSERT INTO coupons (restaurant_id, code, description, discount_type, discount_value, min_order_amount, max_uses, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [RESTAURANT_ID, c.code, c.description, c.discount_type, c.discount_value, c.min_order_amount, c.max_uses, c.expires_at]);
  }

  // ── 5. Tables ──────────────────────────────────────────────────────────────
  console.log('Seeding tables…');
  // Let the DB assign random UUIDs (gen_random_uuid), exactly like tables
  // created through the app. The table id is the public QR identifier
  // (/order/<id>), so it MUST be unguessable — never seed sequential ids, or
  // anyone can enumerate every table by editing the URL.
  const TABLE_SEATS = [2, 2, 4, 4, 6, 8];
  const tableIds = [];
  for (let i = 0; i < TABLE_SEATS.length; i++) {
    const seats = TABLE_SEATS[i];
    const { rows } = await client.query(`
      INSERT INTO tables (number, status, seats, restaurant_id)
      VALUES ($1, 'available', $2, $3)
      RETURNING id
    `, [i + 1, seats, RESTAURANT_ID]);
    tableIds.push(rows[0].id);
    console.log(`  Table ${i + 1} — ${seats} seats`);
  }

  // ── 6. Menu items ──────────────────────────────────────────────────────────
  console.log('Seeding menu items…');
  const menuIdByName = {};
  const menuPriceByName = {};
  for (const item of MENU) {
    const { rows: [m] } = await client.query(`
      INSERT INTO menu_items (name, price, category, available, restaurant_id, description)
      VALUES ($1, $2, $3, true, $4, $5) RETURNING id
    `, [item.name, item.price, item.category, RESTAURANT_ID, item.description || null]);
    menuIdByName[item.name] = m.id;
    menuPriceByName[item.name] = item.price;
  }

  // ── 7. Orders, items, payments ────────────────────────────────────────────
  console.log('Seeding orders and payments…');
  const ordersCreated = []; // saved for SALE transaction generation in step 11.5
  const nowMs = Date.now();

  // In-process counter mirrors order_counters so we don't hit the DB on every insert.
  const monthCounters = {}; // `${yearMonth}` → seq
  function nextOrderRef(ts) {
    // Derive YYMM from the order timestamp (UTC), matching the live generation logic.
    const d = new Date(ts);
    const yy = String(d.getUTCFullYear()).slice(2);
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const key = `${yy}${mm}`;
    const seq = (monthCounters[key] = (monthCounters[key] ?? 0) + 1);
    const letter = String.fromCharCode(65 + Math.floor(seq / 1000));
    const digits  = String(seq % 1000).padStart(3, '0');
    return { yearMonth: key, seq, orderRef: `${key}${letter}${digits}` };
  }

  let skippedFuture = 0;

  for (const [daysAgo, hour, minute, tableIdx, lines, payMethod = 'cash', channel = 'dining'] of ORDER_SCHEDULE) {
    // The hours in ORDER_SCHEDULE are the restaurant's own wall clock, and the
    // day is its own local day. Both used to be read as UTC: `dateStr` came
    // from `toISOString()` and the timestamp was built with a trailing `Z`, so
    // in IST an 8 p.m. dinner order landed at 1:30 a.m. the following morning
    // and single trading days were split across two dates. Peak-hour analysis
    // read the shifted hours; the daily snapshot read the shifted dates.
    const localDay = shiftDate(localDate(new Date(nowMs), TIMEZONE), -daysAgo);
    const [y, m, d] = localDay.split('-').map(Number);
    const scheduledMs = utcFromLocal(y, m, d, hour, minute, TIMEZONE).getTime();

    // An order the restaurant has not reached yet has not happened. This used
    // to be capped to "two minutes ago" instead, which collapsed every
    // remaining Day-0 order onto the instant the seed ran — twenty-six orders
    // on one minute, that day's takings doubled against its neighbours, and the
    // hour the seed happened to run reported as the busiest of the week.
    if (scheduledMs > nowMs - 2 * 60 * 1000) { skippedFuture += 1; continue; }
    const ts = new Date(scheduledMs).toISOString();

    const { yearMonth, seq, orderRef } = nextOrderRef(ts);

    const tableId  = channel === 'dining' ? tableIds[tableIdx] : null;
    const staffId  = pickStaff();
    const { rows: [order] } = await client.query(
      channel === 'dining'
        ? `INSERT INTO orders (table_id, restaurant_id, created_by, assigned_staff_id, status, created_at, channel, table_session_id, order_ref)
           VALUES ($1, $2, $3, $3, 'paid', $4, $5, gen_random_uuid(), $6) RETURNING id`
        : `INSERT INTO orders (table_id, restaurant_id, created_by, assigned_staff_id, status, created_at, channel, order_ref)
           VALUES ($1, $2, $3, $3, 'paid', $4, $5, $6) RETURNING id`,
      [tableId, RESTAURANT_ID, staffId, ts, channel, orderRef],
    );

    let subtotal = 0;
    for (const [name, qty] of lines) {
      await client.query(`
        INSERT INTO order_items (order_id, menu_item_id, quantity)
        VALUES ($1, $2, $3)
      `, [order.id, menuIdByName[name], qty]);
      subtotal += menuPriceByName[name] * qty;
    }

    await client.query(`
      INSERT INTO payments (order_id, amount, method, status, subtotal, total_charged)
      VALUES ($1, $2, $3, 'completed', $2, $2)
    `, [order.id, subtotal.toFixed(2), payMethod]);

    ordersCreated.push({ orderId: order.id, ts, lines, staffId });
  }

  console.log(`  ${ordersCreated.length} orders seeded (${TIMEZONE} local hours)`);
  if (skippedFuture > 0) {
    console.log(
      `  ${skippedFuture} of today's scheduled orders are still in the future — not written. ` +
      'Re-seed later in the day and they will appear.',
    );
  }

  // Persist the final counter values so live orders continue from where the seed left off.
  for (const [yearMonth, seq] of Object.entries(monthCounters)) {
    await client.query(
      `INSERT INTO order_counters (restaurant_id, year_month, seq)
       VALUES ($1, $2, $3)
       ON CONFLICT (restaurant_id, year_month) DO UPDATE SET seq = $3`,
      [RESTAURANT_ID, yearMonth, seq],
    );
  }

  // Stocktake window for the food-cost variance demo: the opening physical count
  // sits a day before the earliest order; the opening-stock purchase sits before
  // that so it isn't double-counted as an in-period purchase; the closing count
  // is "now" so every seeded order falls inside (opening, closing].
  const minOrderMs = ordersCreated.length
    ? Math.min(...ordersCreated.map((o) => new Date(o.ts).getTime()))
    : nowMs - 14 * 86400_000;
  const OPENING_STOCK_TS = new Date(minOrderMs - 2 * 86400_000).toISOString();
  const OPENING_COUNT_TS = new Date(minOrderMs - 1 * 86400_000).toISOString();
  const CLOSING_COUNT_TS = new Date(nowMs).toISOString();

  // ── 8. Ingredients ─────────────────────────────────────────────────────────
  console.log('Seeding ingredients…');
  const ingredientIdByName = {};
  const ingredientCostByName = {};
  const ingredientUnitByName = {};
  for (const [name, unit, , reorder_level, reorder_qty, cost, perishable] of INGREDIENTS) {
    const { rows: [ing] } = await client.query(`
      INSERT INTO ingredients
        (restaurant_id, name, unit, stock_on_hand, reorder_level, reorder_qty, latest_unit_cost, is_active, perishable)
      VALUES ($1, $2, $3, 0, $4, $5, $6, true, $7) RETURNING id
    `, [RESTAURANT_ID, name, unit, reorder_level, reorder_qty, cost, perishable ?? false]);
    ingredientIdByName[name]   = ing.id;
    ingredientCostByName[name] = cost;
    ingredientUnitByName[name] = unit;
  }
  console.log(`  ${INGREDIENTS.length} ingredients inserted`);

  // ── 9. Initial inventory transactions (opening stock) ─────────────────────
  console.log('Seeding opening stock transactions…');
  for (const [name, , stock, , , cost] of INGREDIENTS) {
    await client.query(`
      INSERT INTO inventory_transactions
        (restaurant_id, ingredient_id, txn_type, quantity_delta, unit_cost, ref_id, performed_by, created_at)
      VALUES ($1, $2, 'PURCHASE', $3, $4, 'SEED-OPENING-STOCK', $5, $6)
    `, [RESTAURANT_ID, ingredientIdByName[name], stock, cost, ADMIN_ID, OPENING_STOCK_TS]);
  }

  // ── 10. Recipes ────────────────────────────────────────────────────────────
  console.log('Seeding recipes…');
  const recipeIdByName = {};
  for (const [recipeName, yieldQty, yieldUnit, prepTime, , lines] of RECIPES) {
    const { rows: [rec] } = await client.query(`
      INSERT INTO recipes (restaurant_id, name, yield_quantity, yield_unit, prep_time_sec)
      VALUES ($1, $2, $3, $4, $5) RETURNING id
    `, [RESTAURANT_ID, recipeName, yieldQty, yieldUnit, prepTime]);
    recipeIdByName[recipeName] = rec.id;

    for (const [ingName, qty, unit] of lines) {
      const costPerUnit = ingredientCostByName[ingName] ?? 0;
      await client.query(`
        INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, cost_per_unit)
        VALUES ($1, $2, $3, $4, $5)
      `, [rec.id, ingredientIdByName[ingName], qty, unit, costPerUnit]);
    }
  }
  console.log(`  ${RECIPES.length} recipes inserted`);

  // ── 11. Link recipes → menu items ──────────────────────────────────────────
  console.log('Linking recipes to menu items…');
  let linkedCount = 0;
  for (const [recipeName, , , , menuItemName] of RECIPES) {
    if (!menuItemName || !menuIdByName[menuItemName]) continue;
    await client.query(`
      UPDATE menu_items SET recipe_id = $1 WHERE id = $2
    `, [recipeIdByName[recipeName], menuIdByName[menuItemName]]);
    linkedCount++;
  }
  console.log(`  ${linkedCount} menu items linked to recipes`);

  // ── 11.5. SALE transactions — one per ingredient per order line ───────────
  console.log('Seeding SALE inventory transactions…');

  // Build menuItemName → [{ingredientId, qtyPerServing, unitCost}]
  const recipeIngsByMenuItem = {};
  for (const [, , , , menuItemName, lines] of RECIPES) {
    if (!menuItemName) continue;
    recipeIngsByMenuItem[menuItemName] = lines.map(([ingName, qty]) => ({
      ingredientId: ingredientIdByName[ingName],
      qtyPerServing: qty,
      unitCost: ingredientCostByName[ingName],
    }));
  }

  let saleTxnCount = 0;
  for (const { orderId, ts, lines, staffId } of ordersCreated) {
    for (const [itemName, qty] of lines) {
      const recipe = recipeIngsByMenuItem[itemName];
      if (!recipe) continue;
      for (const { ingredientId, qtyPerServing, unitCost } of recipe) {
        const delta = -(qtyPerServing * qty);
        await client.query(`
          INSERT INTO inventory_transactions
            (restaurant_id, ingredient_id, txn_type, quantity_delta, unit_cost, ref_id, performed_by, created_at)
          VALUES ($1, $2, 'SALE', $3, $4, $5, $6, $7)
        `, [RESTAURANT_ID, ingredientId, delta, unitCost, orderId, staffId, ts]);
        saleTxnCount++;
      }
    }
  }
  console.log(`  ${saleTxnCount} SALE transactions inserted`);

  // ── 12. Combos ─────────────────────────────────────────────────────────────
  console.log('Seeding combos…');
  for (const [name, sku, price, items] of COMBOS) {
    const { rows: [combo] } = await client.query(`
      INSERT INTO combo_meals (restaurant_id, name, sku, price, is_active)
      VALUES ($1, $2, $3, $4, true) RETURNING id
    `, [RESTAURANT_ID, name, sku, price]);

    for (const [menuItemName, qty, sortOrder] of items) {
      const menuItemId = menuIdByName[menuItemName];
      if (!menuItemId) continue;
      await client.query(`
        INSERT INTO combo_items (combo_id, menu_item_id, quantity, sort_order)
        VALUES ($1, $2, $3, $4)
      `, [combo.id, menuItemId, qty, sortOrder]);
    }
  }
  console.log(`  ${COMBOS.length} combos inserted`);

  // ── 13. Waste logs ─────────────────────────────────────────────────────────
  console.log('Seeding waste logs…');
  const WASTE_ENTRIES = [
    // [ingredientName, qty, reason, notes, hoursAgo]
    ['Chicken',        0.300, 'SPOILAGE', 'End-of-day stock — exceeded shelf life',        2  ],
    ['Milk',           0.500, 'SPOILAGE', 'Opened carton not used in time',                4  ],
    ['Paneer',         0.100, 'DAMAGED',  'Dropped during prep',                           6  ],
    ['Tomatoes',       0.250, 'OVERPREP', 'Excess chopped for morning prep',               1  ],
    ['Fish Fillet',    0.200, 'SPOILAGE', 'Not used before expiry date',                  26  ],
    ['Eggs',          12.000, 'DAMAGED',  'Tray dropped in cold storage',                 30  ],
    ['Burger Bun',    10.000, 'SPOILAGE', 'Buns dried out overnight',                     50  ],
    ['Cooking Cream',  0.300, 'SPOILAGE', 'Open carton expired',                          52  ],
    ['Mango Pulp',     0.400, 'SPOILAGE', 'Opened pack not used within shelf life',       74  ],
    ['Calamari',       0.150, 'DAMAGED',  'Freezer burn — texture unacceptable',          78  ],
    ['Yogurt',         0.300, 'SPOILAGE', 'Past best-before date',                       100  ],
    ['Bread Loaf',     5.000, 'OVERPREP', 'Excess pre-sliced for service',               102  ],
    ['Chicken Breast', 0.250, 'OVERPREP', 'Over-portioned during morning meal prep',     124  ],
    ['Butter',         0.100, 'OVERPREP', 'Excess melted but not used during service',   128  ],
    ['Pizza Dough',    3.000, 'SPOILAGE', 'Batch over-proofed and discarded',            150  ],
    ['Vegetable Mix',  0.500, 'SPOILAGE', 'Left over from previous day — not usable',   176  ],
    ['Heavy Cream',    0.200, 'SPOILAGE', 'Opened container past use date',              200  ],
  ];
  for (const [ingName, qty, reason, notes, hoursAgo] of WASTE_ENTRIES) {
    const ingId   = ingredientIdByName[ingName];
    const costNow = ingredientCostByName[ingName];
    const total   = (qty * costNow).toFixed(4);
    const loggedAt = new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();

    await client.query(`
      INSERT INTO waste_logs
        (restaurant_id, ingredient_id, quantity, unit, reason, cost_at_time, total_cost, logged_by, logged_at, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [RESTAURANT_ID, ingId, qty, ingredientUnitByName[ingName],
        reason, costNow, total, ADMIN_ID, loggedAt, notes]);

    await client.query(`
      INSERT INTO inventory_transactions
        (restaurant_id, ingredient_id, txn_type, quantity_delta, unit_cost, ref_id, performed_by, created_at)
      VALUES ($1, $2, 'WASTE', $3, $4, $5, $6, $7)
    `, [RESTAURANT_ID, ingId, -qty, costNow, `WASTE-SEED`, ADMIN_ID, loggedAt]);
  }
  console.log(`  ${WASTE_ENTRIES.length} waste entries inserted`);

  // ── 13.6. Mid-period restocks at a higher price ───────────────────────────
  // Bought during the count window above the current standard cost, so the
  // variance report shows a price-variance component (not just usage).
  console.log('Seeding mid-period restocks…');
  const RESTOCKS = [
    // [ingredientName, qty, unitCost, daysAgo]
    ['Chicken',           6.0, 320.0, 5],
    ['Fish Fillet',       3.0, 600.0, 6],
    ['Mozzarella Cheese', 2.0, 520.0, 4],
  ];
  for (const [ingName, qty, cost, daysAgo] of RESTOCKS) {
    const ingId = ingredientIdByName[ingName];
    if (!ingId) continue;
    await client.query(`
      INSERT INTO inventory_transactions
        (restaurant_id, ingredient_id, txn_type, quantity_delta, unit_cost, ref_id, performed_by, created_at)
      VALUES ($1, $2, 'PURCHASE', $3, $4, 'SEED-RESTOCK', $5, $6)
    `, [RESTAURANT_ID, ingId, qty, cost, ADMIN_ID, new Date(nowMs - daysAgo * 86400_000).toISOString()]);
  }

  // ── 13.5. Reconcile stock_on_hand from transaction ledger ─────────────────
  console.log('Reconciling stock_on_hand…');
  await client.query(`
    UPDATE ingredients i
    SET stock_on_hand = COALESCE((
      SELECT SUM(it.quantity_delta)
      FROM inventory_transactions it
      WHERE it.ingredient_id = i.id
        AND it.restaurant_id = i.restaurant_id
    ), 0)
    WHERE i.restaurant_id = $1
  `, [RESTAURANT_ID]);

  // ── 13.7. Stocktakes (opening + closing) for the variance report ──────────
  // Opening count = the physical stock at the start (= seeded opening stock).
  // Closing count = current system stock, minus a deliberate discrepancy on a
  // few items: positive = simulated over-portioning/loss (usage variance);
  // negative = simulated unlogged delivery / miscount (a data-integrity flag).
  console.log('Seeding stock counts…');
  // Counted lower than the system predicts = simulated over-portioning/loss
  // (positive usage variance); negative = simulated unlogged delivery/miscount
  // (a data-integrity flag).
  const COUNT_DISCREPANCY = {
    'Chicken':           1.2,
    'Mozzarella Cheese': 0.5,
    'Paneer':            0.4,
    'Basmati Rice':      0.8,
    'Onions':           -1.5,
  };

  // Derive counts from the ledger so the books balance: opening stock covers the
  // period's theoretical usage + waste + a small leftover, minus mid-period
  // restocks. Then actual usage (opening + purchases − closing) lands at
  // theoretical + waste + discrepancy, i.e. variance = waste + simulated loss,
  // plus a price variance from the higher-priced restocks.
  const { rows: led } = await client.query(`
    SELECT i.id, i.name, i.unit, i.reorder_qty,
      COALESCE(-SUM(it.quantity_delta) FILTER (WHERE it.txn_type = 'SALE'),  0) AS theo,
      COALESCE(-SUM(it.quantity_delta) FILTER (WHERE it.txn_type = 'WASTE'), 0) AS waste,
      COALESCE( SUM(it.quantity_delta) FILTER (WHERE it.txn_type = 'PURCHASE' AND it.ref_id = 'SEED-RESTOCK'), 0) AS purch
    FROM ingredients i
    LEFT JOIN inventory_transactions it ON it.ingredient_id = i.id
    WHERE i.restaurant_id = $1 AND i.is_active = true
    GROUP BY i.id, i.name, i.unit, i.reorder_qty
  `, [RESTAURANT_ID]);

  const countRows = led.map((r) => {
    const theo  = Number(r.theo), waste = Number(r.waste), purch = Number(r.purch);
    const disc  = COUNT_DISCREPANCY[r.name] ?? 0;
    const closing = Number(r.reorder_qty) || 1;              // plausible leftover on the shelf
    const opening = Math.max(0, theo + waste + disc + closing - purch);
    return { id: r.id, unit: r.unit, opening, closing, systemClosing: closing + disc };
  });

  async function seedCount(label, countedAt, pick) {
    const { rows: [count] } = await client.query(
      `INSERT INTO stock_counts (restaurant_id, label, status, counted_at, created_by)
       VALUES ($1, $2, 'finalized', $3, $4) RETURNING id`,
      [RESTAURANT_ID, label, countedAt, ADMIN_ID],
    );
    for (const r of countRows) {
      const { counted, system } = pick(r);
      await client.query(
        `INSERT INTO stock_count_lines (stock_count_id, ingredient_id, counted_qty, system_qty, unit)
         VALUES ($1, $2, $3, $4, $5)`,
        [count.id, r.id, counted.toFixed(3), system.toFixed(3), r.unit],
      );
    }
  }

  await seedCount('Opening count', OPENING_COUNT_TS, (r) => ({ counted: r.opening, system: r.opening }));
  await seedCount('Weekly close', CLOSING_COUNT_TS, (r) => ({ counted: r.closing, system: r.systemClosing }));
  console.log('  2 stock counts inserted (opening + close)');

  // ── 14. Cost snapshots ─────────────────────────────────────────────────────
  console.log('Seeding cost snapshots…');
  let snapshotCount = 0;
  for (const [recipeName, , , , menuItemName, lines] of RECIPES) {
    const currentCost = lines.reduce(
      (sum, [ingName, qty]) => sum + qty * (ingredientCostByName[ingName] ?? 0), 0,
    );
    const sellingPrice = menuPriceByName[menuItemName] ?? null;
    if (!sellingPrice) continue;
    const grossMargin = sellingPrice - currentCost;
    const marginPct   = (grossMargin / sellingPrice) * 100;

    await client.query(`
      INSERT INTO cost_snapshots
        (recipe_id, restaurant_id, total_cost, selling_price, gross_margin, margin_pct, triggered_by)
      VALUES ($1, $2, $3, $4, $5, $6, 'SEED')
    `, [recipeIdByName[recipeName], RESTAURANT_ID,
        currentCost.toFixed(4), sellingPrice,
        grossMargin.toFixed(4), marginPct.toFixed(2)]);
    snapshotCount++;
  }
  console.log(`  ${snapshotCount} cost snapshots inserted`);

  // ── 15. Reservations ───────────────────────────────────────────────────────
  console.log('Seeding reservations…');
  // Two past (seated), two upcoming dinner slots
  const RESERVATIONS = [
    { guestName: 'Rahul Sharma',     guestPhone: '9876543210', partySize: 2, tableIdx: 0, hoursOffset:  -4, status: 'seated',   notes: 'Window seat preferred' },
    { guestName: 'Priya Nair',       guestPhone: '9812345678', partySize: 4, tableIdx: 2, hoursOffset:  -2, status: 'seated',   notes: null },
    { guestName: 'Vikram Mehta',     guestPhone: '9700011223', partySize: 3, tableIdx: 1, hoursOffset:   2, status: 'upcoming', notes: 'Anniversary dinner — surprise cake' },
    { guestName: 'Sunita Kapoor',    guestPhone: '9988776655', partySize: 6, tableIdx: 4, hoursOffset:   4, status: 'upcoming', notes: 'Birthday party, need high chair' },
    { guestName: 'Arjun Reddy',      guestPhone: '9811223344', partySize: 2, tableIdx: 0, hoursOffset: -28, status: 'seated',   notes: null },
    { guestName: 'Meera Nambiar',    guestPhone: '9922334455', partySize: 5, tableIdx: 3, hoursOffset: -26, status: 'seated',   notes: 'Vegetarian only — confirmed' },
    { guestName: 'Dev Anand',        guestPhone: '9633221100', partySize: 8, tableIdx: 5, hoursOffset: -50, status: 'seated',   notes: 'Corporate lunch, separate bills' },
    { guestName: 'Kavya Pillai',     guestPhone: '9745612398', partySize: 2, tableIdx: 1, hoursOffset: -48, status: 'seated',   notes: null },
    { guestName: 'Rohit Shetty',     guestPhone: '9123409876', partySize: 4, tableIdx: 2, hoursOffset:   6, status: 'upcoming', notes: 'Allergy: nuts, please inform kitchen' },
    { guestName: 'Ishaan Chaudhary', guestPhone: '9867452301', partySize: 3, tableIdx: 3, hoursOffset:   8, status: 'upcoming', notes: 'Jain food only' },
    { guestName: 'Aditya Kumar',     guestPhone: '9087654321', partySize: 6, tableIdx: 4, hoursOffset:  24, status: 'upcoming', notes: 'Team dinner, keep a table near the window' },
    { guestName: 'Nisha Verma',      guestPhone: '9345678012', partySize: 2, tableIdx: 0, hoursOffset:  48, status: 'upcoming', notes: null },
  ];
  let resCount = 0;
  for (const r of RESERVATIONS) {
    const reservedAt = new Date(Date.now() + r.hoursOffset * 3600 * 1000).toISOString();
    const notifiedAt = r.status === 'seated' ? new Date(Date.now() + (r.hoursOffset + 0.25) * 3600 * 1000).toISOString() : null;
    await client.query(`
      INSERT INTO reservations
        (restaurant_id, table_id, guest_name, guest_phone, party_size, reserved_at, status, notes, notified_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [RESTAURANT_ID, tableIds[r.tableIdx], r.guestName, r.guestPhone, r.partySize, reservedAt, r.status, r.notes, notifiedAt]);
    resCount++;
  }
  console.log(`  ${resCount} reservations inserted`);

  // ── 16. Loyalty customers & transactions ───────────────────────────────────
  console.log('Seeding loyalty customers and transactions…');

  // daysAgo helper
  const dAgo = (d) => new Date(Date.now() - d * 86400_000).toISOString();

  // [phone, name, balance, transactions: [type, points, description, daysAgo]]
  const LOYALTY_CUSTOMERS = [
    ['9876543210', 'Priya Sharma',    6200, [
      ['earn',   1500, 'Earned from order',          92],
      ['earn',   2200, 'Earned from order',          61],
      ['redeem', -500, 'Redeemed on order',          46],
      ['earn',   1800, 'Earned from order',          21],
      ['earn',   1200, 'Earned from order',           7],
    ]],
    ['9845678901', 'Rahul Mehta',     2800, [
      ['earn',   1000, 'Earned from order',          58],
      ['earn',    800, 'Earned from order',          30],
      ['earn',   1000, 'Earned from order',          14],
    ]],
    ['9812345670', 'Ananya Krishnan', 12500, [
      ['earn',   3000, 'Earned from order',         180],
      ['earn',   2500, 'Earned from order',         120],
      ['redeem',-1500, 'Redeemed on order',          90],
      ['earn',   2000, 'Earned from order',          60],
      ['earn',   3000, 'Earned from order',          30],
      ['earn',   3500, 'Earned from order',          14],
    ]],
    ['9700011220', 'Vikram Nair',      450, [
      ['earn',    450, 'Earned from order',          14],
    ]],
    ['9988776650', 'Sunita Patel',    1750, [
      ['earn',    900, 'Earned from order',          42],
      ['earn',    850, 'Earned from order',          21],
    ]],
    ['9123456789', 'Amit Joshi',      7800, [
      ['earn',   2000, 'Earned from order',          90],
      ['earn',   1500, 'Earned from order',          60],
      ['redeem', -500, 'Redeemed on order',          45],
      ['earn',   2800, 'Earned from order',          30],
      ['earn',   2000, 'Earned from order',          14],
    ]],
    ['9876501234', 'Deepa Iyer',       200, [
      ['earn',    200, 'Earned from order',           5],
    ]],
    ['9654321098', 'Karan Malhotra',  3400, [
      ['earn',   1200, 'Earned from order',          56],
      ['earn',    700, 'Earned from order',          35],
      ['adjust',  500, 'Welcome bonus',              21],
      ['earn',   1000, 'Earned from order',           7],
    ]],
    ['9543210987', 'Neha Gupta',     15200, [
      ['earn',   4000, 'Earned from order',         180],
      ['earn',   3500, 'Earned from order',         120],
      ['redeem',-2000, 'Redeemed on order',          90],
      ['earn',   3000, 'Earned from order',          60],
      ['earn',   4200, 'Earned from order',          30],
      ['earn',   2500, 'Earned from order',          14],
    ]],
    ['9432109876', 'Rohan Bose',       800, [
      ['earn',    800, 'Earned from order',          21],
    ]],
    ['9111222333', 'Farhan Sheikh',   4500, [
      ['earn',   2000, 'Earned from order',          75],
      ['earn',   1500, 'Earned from order',          40],
      ['earn',   1000, 'Earned from order',          10],
    ]],
    ['9222333444', 'Rekha Pillai',     850, [
      ['earn',    500, 'Earned from order',          30],
      ['earn',    350, 'Earned from order',          12],
    ]],
    ['9333444555', 'Siddharth Rao',  9200, [
      ['earn',   3000, 'Earned from order',         160],
      ['earn',   2500, 'Earned from order',         110],
      ['redeem',-1000, 'Redeemed on order',          85],
      ['earn',   2000, 'Earned from order',          55],
      ['earn',   2700, 'Earned from order',          20],
    ]],
    ['9444555666', 'Pooja Desai',    1200, [
      ['earn',    700, 'Earned from order',          45],
      ['earn',    500, 'Earned from order',          18],
    ]],
    ['9555666777', 'Nitin Sawant',   3800, [
      ['earn',   1000, 'Earned from order',          80],
      ['earn',   1200, 'Earned from order',          55],
      ['adjust',  500, 'Welcome bonus',              45],
      ['earn',   1100, 'Earned from order',          20],
    ]],
    ['9666777888', 'Geeta Nair',      600, [
      ['earn',    600, 'Earned from order',           8],
    ]],
    ['9777888999', 'Aryan Kapoor',  11500, [
      ['earn',   4500, 'Earned from order',         200],
      ['redeem',-2000, 'Redeemed on order',         150],
      ['earn',   3500, 'Earned from order',         100],
      ['redeem',-1500, 'Redeemed on order',          60],
      ['earn',   7000, 'Earned from order',          25],
    ]],
    ['9888999000', 'Smita Kulkarni', 2100, [
      ['earn',    900, 'Earned from order',          65],
      ['earn',    700, 'Earned from order',          40],
      ['earn',    500, 'Earned from order',          15],
    ]],
    ['9012345678', 'Manish Tiwari',   350, [
      ['earn',    350, 'Earned from order',           3],
    ]],
    ['9198765432', 'Kavita Sharma',  6500, [
      ['earn',   2200, 'Earned from order',         130],
      ['earn',   1800, 'Earned from order',          90],
      ['redeem', -500, 'Redeemed on order',          75],
      ['earn',   3000, 'Earned from order',          30],
    ]],
  ];

  let loyaltyCustomerCount = 0;
  let loyaltyTxnCount = 0;
  for (const [phone, name, balance, txns] of LOYALTY_CUSTOMERS) {
    const { rows: [cust] } = await client.query(
      `INSERT INTO loyalty_customers (restaurant_id, phone, name, points_balance)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [RESTAURANT_ID, phone, name, balance],
    );
    loyaltyCustomerCount++;
    for (const [type, points, description, daysAgo] of txns) {
      await client.query(
        `INSERT INTO loyalty_transactions (restaurant_id, customer_id, type, points, description, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [RESTAURANT_ID, cust.id, type, points, description, dAgo(daysAgo)],
      );
      loyaltyTxnCount++;
    }
  }
  console.log(`  ${loyaltyCustomerCount} customers, ${loyaltyTxnCount} transactions inserted`);

  // ── 17. Reviews ────────────────────────────────────────────────────────────
  console.log('Seeding reviews…');
  // [tableIdx, overall, food, service, comment, daysAgo, hoursAgo, customerPhone?]
  // Phones matching loyalty customers: Priya 9876543210, Rahul 9845678901, Ananya 9812345670,
  // Amit 9123456789, Neha 9543210987, Karan 9654321098, Deepa 9876501234
  const SEED_REVIEWS = [
    [0, 5, 5, 5, 'Amazing food and excellent service! The butter chicken was outstanding.',          0, 2,  '9876543210'],
    [1, 4, 4, 5, 'Great atmosphere and friendly staff. Will definitely come back.',                  0, 4,  '9845678901'],
    [2, 5, 5, 4, 'The Margherita pizza was perfect. Crispy crust and fresh ingredients.',           0, 6,  null],
    [3, 3, 4, 3, 'Food was decent but the wait was a bit long.',                                    1, 1,  null],
    [4, 5, 5, 5, 'Best biryani in town! Absolutely delicious. Highly recommended.',                 1, 3,  '9812345670'],
    [0, 4, 5, 4, null,                                                                              1, 7,  '9999000001'],
    [5, 2, 2, 3, 'The chicken was undercooked and we had to send it back. Very disappointed.',      2, 2,  null],
    [1, 5, 4, 5, 'Wonderful dining experience. The paneer tikka was divine!',                       2, 4,  '9123456789'],
    [2, 4, 4, 4, 'Good food, reasonable prices. The cold coffee was excellent.',                    2, 7,  null],
    [3, 5, 5, 5, 'Perfect evening. Every dish was flavorful and the staff was attentive.',          3, 1,  '9543210987'],
    [4, 3, 3, 4, 'Average experience. The pizza was a bit too oily for my taste.',                  3, 3,  null],
    [0, 5, 5, 5, 'The chocolate lava cake is a must-try! Absolutely incredible.',                   3, 5,  '9654321098'],
    [1, 4, 5, 3, 'Food was fantastic but service was a little slow during peak hours.',             4, 2,  null],
    [5, 5, 5, 5, null,                                                                              4, 4,  '9876501234'],
    [2, 4, 4, 5, 'Very clean, attentive staff. The dal makhani was rich and creamy.',               4, 6,  null],
    [3, 1, 2, 1, 'Terrible experience. Wrong order served twice and staff was rude.',               5, 1,  '9999000002'],
    [4, 5, 4, 5, 'Loved the ambience. The grilled chicken steak was perfectly cooked.',             5, 3,  '9845678901'],
    [0, 4, 4, 4, 'Solid restaurant with consistent quality. Good value for money.',                 5, 6,  null],
    [1, 5, 5, 5, 'Outstanding! Every dish we ordered was exceptional. Will be back soon.',          6, 2,  '9876543210'],
    [2, 3, 3, 4, 'Decent food but nothing extraordinary. Portions were a bit small.',               6, 4,  null],
    [5, 5, 5, 4, 'The fish and chips were crispy and fresh. Great service as well!',                6, 6,  '9812345670'],
    [3, 4, 5, 4, 'Beautiful presentation and delicious flavors. Loved the tiramisu.',               6,  8, null],
    // Days 7–9
    [0, 4, 4, 5, 'Great food and quick service. The mango lassi is absolutely divine!',             7,  2, '9111222333'],
    [3, 5, 5, 5, 'Celebrated my birthday here. The staff went above and beyond!',                   7,  4, '9812345670'],
    [2, 3, 3, 4, 'Reasonable food but the wait was long during lunch peak.',                         7,  7, null],
    [1, 5, 5, 5, 'Consistently excellent. Our go-to restaurant for special occasions.',              8,  1, '9876543210'],
    [4, 4, 4, 3, 'Food quality was great but service felt rushed during the busy lunch hour.',       8,  3, null],
    [5, 2, 3, 2, 'Received wrong order, replacement took 25 minutes. Not impressed.',               8,  5, '9333444555'],
    [0, 5, 5, 4, 'The chicken biryani is phenomenal — perfectly spiced and aromatic.',              9,  2, null],
    [2, 4, 4, 5, 'Very friendly and attentive staff. Food was fresh and well-prepared.',             9,  4, '9777888999'],
    [3, 5, 5, 5, 'Absolutely loved the paneer butter masala. Perfectly balanced flavors.',          9,  6, null],
    // Days 10–13
    [1, 4, 5, 4, 'The fresh orange juice was so refreshing. Food was excellent overall.',          10,  1, null],
    [5, 3, 3, 4, 'Decent food but nothing special. An average experience overall.',                10,  3, null],
    [4, 5, 4, 5, 'Wonderful experience! The tiramisu was the highlight of the evening.',           10,  5, '9198765432'],
    [0, 4, 4, 4, 'Clean restaurant, good portions and fair prices. Will definitely return.',       11,  2, null],
    [2, 5, 5, 5, 'The chocolate lava cake is extraordinary. A must-order every single time!',     11,  4, '9543210987'],
    [3, 2, 2, 3, 'Very slow kitchen. Food arrived cold. Expected better for the price.',           11,  6, null],
    [1, 5, 5, 4, 'Great variety on the menu. Dal makhani tasted just like home cooking.',         12,  2, '9123456789'],
    [5, 4, 4, 4, 'Good value for money. The BBQ chicken pizza is always a solid choice.',         12,  5, null],
    [0, 5, 5, 5, 'Impeccable quality and service. One of the best restaurants in the city.',      13,  1, '9876543210'],
    [4, 4, 4, 4, 'Tasty food and cozy atmosphere. Perfect for a relaxed weeknight dinner.',       13,  3, '9777888999'],
    [2, 3, 4, 2, 'Food was good but the place was understaffed and service really suffered.',      13,  5, null],
  ];
  let reviewCount = 0;
  for (const [tableIdx, overall, food, service, comment, daysAgo, hoursAgo, phone] of SEED_REVIEWS) {
    const createdAt = new Date(Date.now() - daysAgo * 86400_000 - hoursAgo * 3600_000).toISOString();
    // Match phone to loyalty customer if one exists
    let loyaltyCustomerId = null;
    if (phone) {
      const { rows: lc } = await client.query(
        'SELECT id FROM loyalty_customers WHERE restaurant_id = $1 AND phone = $2',
        [RESTAURANT_ID, phone],
      );
      loyaltyCustomerId = lc[0]?.id ?? null;
    }
    await client.query(
      `INSERT INTO reviews
         (restaurant_id, table_id, overall_rating, food_rating, service_rating, comment, created_at, customer_phone, loyalty_customer_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [RESTAURANT_ID, tableIds[tableIdx], overall, food, service, comment, createdAt, phone, loyaltyCustomerId],
    );
    reviewCount++;
  }
  console.log(`  ${reviewCount} reviews inserted`);

  await client.end();

  console.log('\nSeed complete!');
  console.log(`  Restaurant : Demo Restaurant (${RESTAURANT_ID})`);
  for (const u of SEED_USERS) {
    console.log(`  ${u.role.padEnd(8)}: ${u.email} / ${u.password}${u.pin ? ` (PIN: ${u.pin})` : ''}`);
  }
  console.log(`  Tables     : ${tableIds.length}`);
  console.log(`  Menu items : ${MENU.length}`);
  const diningCount   = ORDER_SCHEDULE.filter(([,,,,,, ch = 'dining']) => ch === 'dining').length;
  const takeawayCount = ORDER_SCHEDULE.filter(([,,,,,, ch]) => ch === 'takeaway').length;
  const deliveryCount = ORDER_SCHEDULE.filter(([,,,,,, ch]) => ch === 'delivery').length;
  console.log(`  Orders     : ${ORDER_SCHEDULE.length} paid orders (${diningCount} dining, ${takeawayCount} takeaway, ${deliveryCount} delivery) across 14 days`);
  console.log(`  Ingredients: ${INGREDIENTS.length} (stock reconciled from ledger)`);
  console.log(`  Recipes    : ${RECIPES.length} (${linkedCount} linked to menu items)`);
  console.log(`  Combos     : ${COMBOS.length}`);
  console.log(`  Inv. txns  : ${INGREDIENTS.length} PURCHASE + ${saleTxnCount} SALE + ${WASTE_ENTRIES.length} WASTE`);
  console.log(`  Waste logs : ${WASTE_ENTRIES.length}`);
  console.log(`  Snapshots  : ${snapshotCount}`);
  console.log(`  Reservations: ${resCount} seeded`);
  console.log(`  Coupons    : ${SEED_COUPONS.length}`);
  console.log(`  Loyalty tiers  : ${DEFAULT_TIERS.length}`);
  console.log(`  Loyalty rewards: ${DEFAULT_REWARDS.length}`);
  console.log(`  Loyalty members: ${loyaltyCustomerCount}`);
  console.log(`  Loyalty txns   : ${loyaltyTxnCount}`);
  console.log(`  Reviews        : ${reviewCount} across 7 days`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
