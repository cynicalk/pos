const { AI_LANGUAGES, isValidLanguage, languageDirective } = require('../src/shared/ai-languages');

/**
 * The language list is the contract between settings validation and the narrator:
 * a code that validates must be one the narrator can act on, English needs no
 * directive, and the directive must pin the figures so localisation never rewrites
 * a number, the ₹ sign, a percentage, or a proper name.
 */

describe('ai languages', () => {
  test('English and Indian languages are supported; junk is not', () => {
    expect(isValidLanguage('en')).toBe(true);
    expect(isValidLanguage('hi')).toBe(true);
    expect(isValidLanguage('ta')).toBe(true);
    expect(isValidLanguage('xx')).toBe(false);
    expect(isValidLanguage(undefined)).toBe(false);
  });

  test('English (and unknown/blank) gets no directive — it is the default', () => {
    expect(languageDirective('en')).toBeNull();
    expect(languageDirective('')).toBeNull();
    expect(languageDirective(undefined)).toBeNull();
    expect(languageDirective('xx')).toBeNull();
  });

  test('a non-English directive names the language and pins the figures', () => {
    const d = languageDirective('hi');
    expect(d).toContain('Hindi');
    expect(d).toMatch(/₹/);
    expect(d).toMatch(/number/i);
    expect(d).toMatch(/coupon codes|proper names/i);
  });

  test('every code carries a display name and a native name', () => {
    for (const [code, info] of Object.entries(AI_LANGUAGES)) {
      expect(typeof info.name).toBe('string');
      expect(info.name.length).toBeGreaterThan(0);
      expect(typeof info.native).toBe('string');
      expect(isValidLanguage(code)).toBe(true);
    }
  });
});
