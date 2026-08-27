/**
 * Reply drafting (MERGE_PLAN.md Phase 6).
 *
 * The source drafted replies to post publicly under a Swiggy/Zomato review.
 * POS reviews are first-party and private: nobody else will ever read the
 * reply, and there is no public thread to post it in. The only route back to
 * this guest is the phone number they left, so what this drafts is a message
 * TO the guest — shorter, addressed to them, and pointless to write at all if
 * they left no number.
 *
 * That last point is enforced by the caller, not softened here: a draft for a
 * review with no contact details is a draft that can never be delivered.
 *
 * Pure. The model-written variant lives in the service; this is the fallback
 * that has to work when no model is running, and the prompt the model is given.
 */

const { THEME_LABELS } = require('./themes');

// What we apologise FOR, per theme. Deliberately specific: "sorry for the
// inconvenience" tells the guest we did not read what they wrote.
const APOLOGY = {
  hygiene:
    "I'm sorry — what you describe isn't acceptable and we've gone and checked the kitchen "
    + 'straight away.',
  food_quality:
    "I'm sorry the food wasn't right. I've passed the details to the kitchen and we're "
    + "checking the dishes you mentioned.",
  delivery_packaging:
    "I'm sorry your order didn't reach you in good condition. We're looking at how it's "
    + 'packed and how long it waits before it goes out.',
  service:
    "I'm sorry about how you were treated. I've spoken to the team about it.",
  value_for_money:
    "I'm sorry it didn't feel like it was worth it. We're checking our portions on those items.",
  other:
    "I'm sorry your visit fell short. I'd like to understand what happened so we can put it right.",
};

const firstName = (name) => {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
};

/**
 * Deterministic draft. Used when no model is reachable, and as the safety net
 * when one is — a template the operator can edit beats an empty box.
 */
function templateReply({ rating, theme, guestName, restaurantName }) {
  const who = firstName(guestName);
  const greeting = who ? `Hi ${who},` : 'Hello,';
  const venue = restaurantName || 'us';
  const n = Number(rating);

  if (n >= 4) {
    return `${greeting} thank you for taking the time to leave us feedback — it means a lot to `
      + `the team. We hope to see you at ${venue} again soon.`;
  }

  const apology = APOLOGY[theme] || APOLOGY.other;
  return `${greeting} thank you for the honest feedback, and ${apology} `
    + `I'd like the chance to get it right next time you're in. — ${venue}`;
}

/**
 * The instruction given to the model.
 *
 * The prohibitions are the point. A model left to its own devices offers a free
 * meal, invents a cause ("our new chef"), or promises a policy change nobody
 * agreed to — and the operator sends it under their own name to a real guest.
 */
function buildReplyPrompt({ restaurantName }) {
  const venue = restaurantName || 'the restaurant';
  return 'You draft a short private message that a restaurant owner sends directly to a guest '
    + 'who left feedback after their visit. Two or three sentences. Warm, specific to what the '
    + 'guest actually said, never defensive.\n'
    + 'Hard rules:\n'
    + '- Do NOT offer refunds, free meals, discounts, vouchers or any compensation.\n'
    + '- Do NOT invent a reason for what went wrong, or any fact about the restaurant, its '
    + 'staff, or its suppliers that is not in the feedback you were given.\n'
    + '- Do NOT promise a change that has not already happened.\n'
    + '- Do not ask them to post a review or change their rating.\n'
    + `- Sign off as ${venue}.\n`
    + 'Reply with only the message text.';
}

/** The review, rendered as the facts the model is allowed to use. */
function buildReplyContext({ rating, foodRating, serviceRating, theme, comment, guestName }) {
  const lines = [
    `Rating: ${rating}/5`,
    foodRating != null    ? `Food: ${foodRating}/5` : null,
    serviceRating != null ? `Service: ${serviceRating}/5` : null,
    `Topic: ${THEME_LABELS[theme] || 'general feedback'}`,
    `Guest: ${firstName(guestName) || 'not given'}`,
    `What they wrote: ${comment && String(comment).trim() ? comment : '(they left a rating only, no comment)'}`,
  ].filter(Boolean);
  return lines.join('\n');
}

module.exports = { templateReply, buildReplyPrompt, buildReplyContext, firstName, APOLOGY };
