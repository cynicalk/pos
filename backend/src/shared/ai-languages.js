// The languages the AI narrations can speak. One list, used by the settings
// validation and by the narration layer, so a code that validates is always a
// code the narrator knows. Pure data — no dependencies.
//
// English is the default and needs no directive. For the others, the narrator is
// told to write its prose in that language while leaving every number, the ₹ sign,
// percentages, coupon codes and proper names exactly as given — a localised brief
// that still quotes the same figures the deterministic layer computed.

const AI_LANGUAGES = {
  en: { name: 'English',   native: 'English' },
  hi: { name: 'Hindi',     native: 'हिन्दी' },
  ta: { name: 'Tamil',     native: 'தமிழ்' },
  te: { name: 'Telugu',    native: 'తెలుగు' },
  bn: { name: 'Bengali',   native: 'বাংলা' },
  mr: { name: 'Marathi',   native: 'मराठी' },
  kn: { name: 'Kannada',   native: 'ಕನ್ನಡ' },
  gu: { name: 'Gujarati',  native: 'ગુજરાતી' },
  ml: { name: 'Malayalam', native: 'മലയാളം' },
  pa: { name: 'Punjabi',   native: 'ਪੰਜਾਬੀ' },
};

const isValidLanguage = (code) => Object.prototype.hasOwnProperty.call(AI_LANGUAGES, code);

/**
 * The instruction appended to a narration's system prompt, or null for English
 * (and any unknown code — English is the safe default). Numbers, currency, codes
 * and names are pinned so localisation never rewrites a figure.
 */
function languageDirective(code) {
  if (!code || code === 'en' || !isValidLanguage(code)) return null;
  const { name } = AI_LANGUAGES[code];
  return (
    `Write your entire response in ${name}. Keep every number, the ₹ sign, all ` +
    `percentages, coupon codes and proper names (dish names, server names, coupon ` +
    `codes) exactly as given in the data — translate only the words around them.`
  );
}

module.exports = { AI_LANGUAGES, isValidLanguage, languageDirective };
