// Lightweight i18n for the guest app. A flat key→string map per language, no
// runtime dependency. English is the source of truth; Hindi is provided for the
// high-traffic strings. Menu CONTENT (dish names/descriptions) is localized
// separately from the backend's `translations` field — this covers the app's
// own chrome. Missing keys fall back to English, so partial translation is safe.

export type Lang = "en" | "hi";

export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "hi", label: "हिं" },
];

type Dict = Record<string, string>;

const en: Dict = {
  "landing.poweredBy": "Powered by Cooklyt",
  "landing.blurb":
    "Tell us who's at the table and we'll put together dishes everyone will actually agree on — in under a minute.",
  "landing.reservation": "I have a reservation",
  "landing.reservationSub": "We'll pull up your table in seconds",
  "landing.walkin": "Just walked in",
  "landing.walkinSub": "Two quick details and you're seated",
  "landing.join": "Join a table",
  "landing.joinSub": "Got a code from your group? Jump into their cart",
  "landing.tagline": "Allergy-aware picks for the whole table",

  "menu.title": "The full menu",
  "menu.subtitle": "Everything the kitchen is serving tonight.",
  "menu.addToContinue": "Add dishes to continue",

  "detail.allergens": "Allergens",
  "detail.allergensNone": "None on file. Ask staff if unsure.",
  "detail.whatsIn": "What's in it",
  "detail.nutrition": "Nutrition",
  "detail.perServing": "· estimated per serving",
  "detail.veg": "Veg",

  "pay.title": "Pay at the table",
  "pay.blurb":
    "Choose how you're paying — you settle with the staff at your table. Nothing is charged here.",
  "pay.addTip": "Add a tip?",
  "pay.splitEvenly": "Split evenly",
  "pay.each": "each",
  "pay.settleLater": "I'll settle later",

  "common.back": "Back",
  "common.done": "Done",
  "common.cash": "Cash",
  "common.card": "Card",
  "common.upi": "UPI",
};

const hi: Dict = {
  "landing.poweredBy": "Cooklyt द्वारा संचालित",
  "landing.blurb":
    "हमें बताएं कि टेबल पर कौन है और हम एक मिनट में ऐसे व्यंजन चुन देंगे जिन पर सब सहमत होंगे।",
  "landing.reservation": "मेरी बुकिंग है",
  "landing.reservationSub": "हम कुछ ही पलों में आपकी टेबल ढूँढ़ेंगे",
  "landing.walkin": "अभी आए हैं",
  "landing.walkinSub": "दो जानकारियाँ दें और बैठ जाएँ",
  "landing.join": "टेबल से जुड़ें",
  "landing.joinSub": "अपने समूह से कोड मिला? उनकी कार्ट में शामिल हों",
  "landing.tagline": "पूरी टेबल के लिए एलर्जी-सजग सुझाव",

  "menu.title": "पूरा मेन्यू",
  "menu.subtitle": "आज रसोई जो कुछ बना रही है, सब कुछ।",
  "menu.addToContinue": "जारी रखने के लिए व्यंजन जोड़ें",

  "detail.allergens": "एलर्जन",
  "detail.allergensNone": "कोई दर्ज नहीं। संदेह हो तो स्टाफ़ से पूछें।",
  "detail.whatsIn": "इसमें क्या है",
  "detail.nutrition": "पोषण",
  "detail.perServing": "· प्रति सर्विंग अनुमानित",
  "detail.veg": "शाकाहारी",

  "pay.title": "टेबल पर भुगतान",
  "pay.blurb":
    "चुनें कि आप कैसे भुगतान कर रहे हैं — आप अपनी टेबल पर स्टाफ़ के साथ निपटान करें। यहाँ कुछ भी चार्ज नहीं होता।",
  "pay.addTip": "टिप जोड़ें?",
  "pay.splitEvenly": "बराबर बाँटें",
  "pay.each": "प्रत्येक",
  "pay.settleLater": "बाद में निपटाऊँगा",

  "common.back": "वापस",
  "common.done": "हो गया",
  "common.cash": "नक़द",
  "common.card": "कार्ड",
  "common.upi": "UPI",
};

const DICTS: Record<Lang, Dict> = { en, hi };

export function translate(lang: Lang, key: string): string {
  return DICTS[lang][key] ?? DICTS.en[key] ?? key;
}
