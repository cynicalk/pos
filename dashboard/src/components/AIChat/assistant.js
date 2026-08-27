// Single source of truth for the assistant's identity, greeting, and prompt
// deck — imported by ChatBubble, Conversation, and AIChat. Rename or re-theme
// the assistant in this one file.

export const ASSISTANT = { name: 'Yumzy', status: 'Reading live data' };

export function greeting(firstName = '') {
  const h = new Date().getHours();
  const part = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  return `Good ${part}, ${firstName || 'there'}.`;
}

// Per-card-kind chrome: where "Open in …" navigates and which follow-up
// prompts appear under the card. Follow-ups must map to real capabilities.
export const CARD_META = {
  waste:   { metric: 'Total cost',  link: { label: 'Open in Waste Log',   to: '/waste-log' },       follows: [{ short: 'Which reason costs most?', full: 'Which waste reason is costing us the most?' }, { short: 'Log waste', full: 'I want to log some waste' }] },
  stock:   { metric: 'Low on stock', link: { label: 'Open in Ingredients', to: '/ingredients' }, follows: [{ short: 'Update a reorder level', full: 'I want to update a reorder level' }] },
  sales:   { metric: 'Top sellers',  link: { label: 'Open in Reports',     to: '/reports' },     follows: [{ short: 'Best margins', full: 'Which menu items have the best margins?' }] },
  recipes: { metric: 'Food cost %',  link: { label: 'Open in Costing',     to: '/costing' },     follows: [{ short: 'Most wasted ingredients', full: 'Which ingredients are we wasting the most of?' }] },
};

export const PROMPT_GROUPS = [
  {
    label: 'Waste',
    prompts: [
      { short: "This week's waste & cost", full: 'What got wasted this week, and what did it cost?' },
      { short: 'Worst-wasted item',        full: 'Which single ingredient are we wasting the most of?' },
    ],
  },
  {
    label: 'Stock',
    prompts: [
      { short: 'What to reorder', full: 'Which ingredients need reordering?' },
      { short: 'Low on stock',    full: 'What am I running low on right now?' },
    ],
  },
  {
    label: 'Recipes',
    prompts: [
      { short: 'Worst food-cost %', full: 'Which recipes have the worst food-cost %?' },
      { short: 'Best margins',      full: 'Which menu items have the best margins?' },
    ],
  },
  {
    label: 'Sales',
    prompts: [
      { short: 'Top sellers, 7 days', full: 'What were the top sellers in the last 7 days?' },
      { short: 'Recent orders',       full: 'Show me the most recent orders.' },
    ],
  },
];
