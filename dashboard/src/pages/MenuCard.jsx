import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { QrCode, Languages, ShieldAlert, Check, Info } from 'lucide-react';
import api from '../api/client';
import { queryClient } from '../lib/queryClient';

/**
 * Menu Card — what a guest sees when they scan the table QR, and the two things
 * the operator controls about it: dietary declarations and translations.
 *
 * The page is built around one uncomfortable number: how many dishes CookLyt
 * cannot answer a dietary question about. That is shown first and plainly,
 * because the alternative — a filter that silently omits half the menu — is how
 * a guest with an allergy ends up trusting something they should not.
 */

// Veg/non-veg colours follow the FSSAI green-dot convention rather than a
// generic good/bad scale.
const DIET_TONE = {
  vegan:          { background: 'var(--ok-soft)',  color: 'var(--ok)' },
  vegetarian:     { background: 'var(--ok-soft)',  color: 'var(--ok)' },
  non_vegetarian: { background: 'var(--bad-soft)', color: 'var(--bad)' },
  unknown:        { background: 'var(--hover)',    color: 'var(--mute)' },
};

// How many undeclared ingredients the banner names before it stops.
const UNDECLARED_PREVIEW = 6;

const TABS = [
  { key: 'dietary',      label: 'Allergens & diet' },
  { key: 'translations', label: 'Translations' },
  { key: 'preview',      label: 'Guest preview' },
];

const btn = (primary = false) => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '5px 10px', borderRadius: 7, cursor: 'pointer',
  fontSize: 12, fontWeight: 500,
  border: `1px solid ${primary ? 'var(--ink)' : 'var(--line-2)'}`,
  background: primary ? 'var(--ink)' : 'transparent',
  color: primary ? 'var(--paper)' : 'var(--ink)',
});

const input = {
  padding: '6px 9px', borderRadius: 7, border: '1px solid var(--line-2)',
  background: 'var(--paper)', color: 'var(--ink)', fontSize: 13,
};

const th = {
  padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600,
  color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.06em',
};
const td = { padding: '7px 10px', fontSize: 12.5 };

const useDeclarations = () => useQuery({
  queryKey: ['guestmenu', 'declarations'],
  queryFn: async () => (await api.get('/guestmenu/declarations')).data,
  enabled: !!localStorage.getItem('pos_user'),
});

const useTranslations = () => useQuery({
  queryKey: ['guestmenu', 'translations'],
  queryFn: async () => (await api.get('/guestmenu/translations')).data,
  enabled: !!localStorage.getItem('pos_user'),
});

function Notice({ children, tone = 'neutral' }) {
  const bg = tone === 'warn' ? 'var(--warn-soft)' : 'var(--hover)';
  const Icon = tone === 'warn' ? ShieldAlert : Info;
  const color = tone === 'warn' ? 'var(--warn)' : 'var(--mute)';
  return (
    <div style={{
      display: 'flex', gap: 8, padding: '11px 14px', borderRadius: 9,
      background: bg, marginBottom: 18,
    }}>
      <Icon size={15} strokeWidth={2} style={{ color, flexShrink: 0, marginTop: 1 }} />
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
        {children}
      </p>
    </div>
  );
}

function DeclarationRow({ ingredient, allergenOptions, dietOptions }) {
  const [allergens, setAllergens] = useState(ingredient.allergens || []);
  const [diet, setDiet] = useState(ingredient.diet || '');
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: async () => (await api.put(
      `/guestmenu/declarations/${ingredient.id}`, { allergens, diet },
    )).data,
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
      queryClient.invalidateQueries({ queryKey: ['guestmenu'] });
    },
  });

  const toggle = (a) =>
    setAllergens((c) => (c.includes(a) ? c.filter((x) => x !== a) : [...c, a]));

  return (
    <tr style={{ borderBottom: '1px solid var(--line)' }}>
      <td style={td}>
        {ingredient.name}
        {!ingredient.declared && (
          <span style={{
            marginLeft: 7, padding: '1px 7px', borderRadius: 999,
            background: 'var(--warn-soft)', color: 'var(--warn)',
            fontSize: 10, fontWeight: 600,
          }}>not declared</span>
        )}
      </td>
      <td style={td}>
        <select style={{ ...input, width: 150 }} value={diet} onChange={(e) => setDiet(e.target.value)}>
          <option value="">Choose…</option>
          {dietOptions.map((d) => (
            <option key={d} value={d}>{d.replace(/_/g, '-')}</option>
          ))}
        </select>
      </td>
      <td style={td}>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', minWidth: 300 }}>
          {allergenOptions.map((a) => (
            <button
              key={a}
              onClick={() => toggle(a)}
              style={{
                padding: '2px 8px', borderRadius: 999, cursor: 'pointer', fontSize: 11,
                border: '1px solid ' + (allergens.includes(a) ? 'var(--bad)' : 'var(--line-2)'),
                background: allergens.includes(a) ? 'var(--bad-soft)' : 'transparent',
                color: allergens.includes(a) ? 'var(--bad)' : 'var(--mute)',
                fontWeight: allergens.includes(a) ? 600 : 400,
              }}
            >{a}</button>
          ))}
        </div>
      </td>
      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
        <button
          style={btn(true)}
          disabled={!diet || save.isPending}
          onClick={() => save.mutate()}
          // Ticking nothing IS an answer here: "contains none of these".
          title="Saving with no allergens ticked declares this ingredient free of all of them"
        >
          {saved ? <Check size={12} strokeWidth={2.4} /> : null}
          {saved ? 'Saved' : 'Declare'}
        </button>
      </td>
    </tr>
  );
}

function DietaryTab() {
  const { data, isLoading } = useDeclarations();
  if (isLoading) return <p style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</p>;
  if (!data) return null;

  const { coverage } = data;

  return (
    <>
      {/* The uncomfortable number, first. */}
      {coverage.pct !== null && coverage.pct < 100 ? (
        <Notice tone="warn">
          CookLyt can answer a dietary question about <strong>{coverage.complete} of{' '}
          {coverage.total}</strong> dishes ({coverage.pct}%). The rest contain an ingredient
          nobody has classified, so they show as &ldquo;not yet declared&rdquo; on the guest
          card and are excluded from every filter — a dish we cannot vouch for must never
          appear under &ldquo;vegan&rdquo; or &ldquo;no nuts&rdquo;.
          {coverage.undeclaredIngredients.length > 0 && (
            <>
              {' '}Declaring these would fix it:{' '}
              {/* Capped. Naming all thirty-five turns the one actionable
                  sentence on the page into a wall nobody reads — and the full
                  list is the table directly below, sorted undeclared-first. */}
              <strong>
                {coverage.undeclaredIngredients.slice(0, UNDECLARED_PREVIEW).join(', ')}
              </strong>
              {coverage.undeclaredIngredients.length > UNDECLARED_PREVIEW && (
                <> and {coverage.undeclaredIngredients.length - UNDECLARED_PREVIEW} more,
                  listed first in the table below</>
              )}.
            </>
          )}
        </Notice>
      ) : (
        <Notice>
          Every dish on the menu has a complete dietary declaration. Declare each ingredient
          once and every dish built from it stays correct, including ones you add later.
        </Notice>
      )}

      <div style={{ overflowX: 'auto' }}>
        {/* Wide enough that the ten allergen chips are never clipped mid-word.
            The container scrolls horizontally rather than the chips being cut. */}
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--line-2)' }}>
            <th style={th}>Ingredient</th>
            <th style={th}>Diet</th>
            <th style={th}>Contains</th>
            <th style={th} />
          </tr></thead>
          <tbody>
            {data.ingredients.map((i) => (
              <DeclarationRow
                key={i.id}
                ingredient={i}
                allergenOptions={data.allergenOptions}
                dietOptions={data.dietOptions}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TranslationsTab() {
  const { data, isLoading } = useTranslations();
  const [note, setNote] = useState(null);

  const run = useMutation({
    // A local model writing a dozen dish names takes a while, and this is an
    // explicit button press — the shared 8s client timeout is far too short.
    mutationFn: async (code) => (await api.post(
      `/guestmenu/translations/${code}`, null, { timeout: 90_000 },
    )).data,
    onSuccess: (d) => {
      setNote(d.note || `Translated ${d.translated} dish${d.translated === 1 ? '' : 'es'}.`);
      queryClient.invalidateQueries({ queryKey: ['guestmenu'] });
    },
    onError: () => setNote('The translation run did not finish. Nothing was saved.'),
  });

  if (isLoading) return <p style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</p>;
  if (!data) return null;

  return (
    <>
      <Notice>
        Translations are generated once and cached, so the guest menu card costs nothing to
        render and never waits on a model. Dish names are transliterated rather than
        translated — a guest has to be able to say the name out loud to your staff. Anything
        untranslated simply serves English.
      </Notice>

      {note && (
        <p style={{ margin: '-8px 0 16px', fontSize: 12.5, color: 'var(--ink-2)' }}>{note}</p>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ borderBottom: '1px solid var(--line-2)' }}>
          <th style={th}>Language</th>
          <th style={th}>Translated</th>
          <th style={th} />
        </tr></thead>
        <tbody>
          {data.languages.map((l) => (
            <tr key={l.code} style={{ borderBottom: '1px solid var(--line)' }}>
              <td style={td}>
                {l.label} <span style={{ color: 'var(--mute)' }}>· {l.english}</span>
              </td>
              <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>
                {l.total === 0
                  ? <span style={{ color: 'var(--mute)' }}>no dishes on the menu</span>
                  : `${l.translated} of ${l.total}`}
              </td>
              <td style={{ ...td, textAlign: 'right' }}>
                <button
                  style={btn()}
                  disabled={run.isPending || l.total === 0 || l.translated === l.total}
                  onClick={() => { setNote(null); run.mutate(l.code); }}
                >
                  <Languages size={12} strokeWidth={2.2} />
                  {run.isPending ? 'Translating…'
                    : l.translated === l.total && l.total > 0 ? 'Done' : 'Translate'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function PreviewTab() {
  const [language, setLanguage] = useState('');
  const [diet, setDiet] = useState('');
  const [avoid, setAvoid] = useState([]);

  const { data, isLoading } = useQuery({
    queryKey: ['guestmenu', 'preview', language, diet, avoid.join(',')],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (language) params.set('language', language);
      if (diet) params.set('diet', diet);
      if (avoid.length) params.set('avoid', avoid.join(','));
      return (await api.get(`/guestmenu/preview?${params}`)).data;
    },
    enabled: !!localStorage.getItem('pos_user'),
  });

  const toggleAvoid = (a) =>
    setAvoid((c) => (c.includes(a) ? c.filter((x) => x !== a) : [...c, a]));

  return (
    <>
      <Notice>
        Exactly what a guest sees after scanning the table QR, with the same filters they
        have. Nothing here calls a model — a guest at a table never waits.
      </Notice>

      {data && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <select style={{ ...input, width: 140 }} value={language}
                  onChange={(e) => setLanguage(e.target.value)}>
            <option value="">English</option>
            {data.languages.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
          <select style={{ ...input, width: 160 }} value={diet}
                  onChange={(e) => setDiet(e.target.value)}>
            <option value="">Any diet</option>
            <option value="vegan">Vegan</option>
            <option value="vegetarian">Vegetarian</option>
          </select>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--mute)' }}>avoid:</span>
            {data.allergenOptions.map((a) => (
              <button key={a} onClick={() => toggleAvoid(a)} style={{
                padding: '2px 8px', borderRadius: 999, cursor: 'pointer', fontSize: 11,
                border: '1px solid ' + (avoid.includes(a) ? 'var(--bad)' : 'var(--line-2)'),
                background: avoid.includes(a) ? 'var(--bad-soft)' : 'transparent',
                color: avoid.includes(a) ? 'var(--bad)' : 'var(--mute)',
              }}>{a}</button>
            ))}
          </div>
        </div>
      )}

      {isLoading && <p style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</p>}

      {data && (
        <>
          <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.55 }}>
            Showing {data.shown} of {data.total} dishes.
            {data.undeclaredDishes > 0 && (
              <> {data.undeclaredDishes} {data.undeclaredDishes === 1 ? 'dish is' : 'dishes are'}{' '}
                not fully declared, so {data.undeclaredDishes === 1 ? 'it' : 'they'} cannot
                appear under any filter.
              </>
            )}
          </p>

          {data.dishes.map((d) => (
            <div key={d.id} style={{
              border: '1px solid var(--line)', borderRadius: 10,
              padding: '12px 15px', marginBottom: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 13.5 }}>{d.name}</strong>
                {/* The English name travels alongside a translation so the guest
                    can order out loud and be understood. */}
                {d.translated && d.originalName !== d.name && (
                  <span style={{ fontSize: 12, color: 'var(--mute)' }}>({d.originalName})</span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: 12.5 }}>₹{d.price}</span>
              </div>

              {d.description && (
                <p style={{ margin: '5px 0 0', fontSize: 12.5, color: 'var(--ink-2)' }}>
                  {d.description}
                </p>
              )}

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                {/* Colour follows the FSSAI convention every guest in India
                    already reads: green means vegetarian, brown/red means not.
                    Tying the colour to "is it declared" instead painted
                    "Non-vegetarian" green, which in this market reads as the
                    opposite of what it says. Unknown stays grey — it is neither
                    a promise nor a warning. */}
                <span style={{
                  padding: '1px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600,
                  ...DIET_TONE[d.diet],
                }}>{d.dietLabel}</span>

                {d.allergens.map((a) => (
                  <span key={a} style={{
                    padding: '1px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600,
                    background: 'var(--bad-soft)', color: 'var(--bad)',
                  }}>contains {a}</span>
                ))}
              </div>

              {/* Never rounded down to "safe". */}
              {!d.dietaryComplete && (
                <p style={{ margin: '7px 0 0', fontSize: 11.5, color: 'var(--mute)', lineHeight: 1.5 }}>
                  {d.dietaryReason === 'no_recipe'
                    ? 'This dish has no recipe on file, so we cannot say what is in it. Please ask the staff.'
                    : 'Some ingredients in this dish have not been classified yet. Please ask the staff before ordering if you have an allergy.'}
                </p>
              )}

              {d.ingredients.length > 0 && (
                <p style={{ margin: '7px 0 0', fontSize: 11.5, color: 'var(--mute)' }}>
                  Made with: {d.ingredients.join(', ')}
                </p>
              )}
            </div>
          ))}

          {data.dishes.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--mute)' }}>
              Nothing on the menu matches those filters that we can vouch for.
            </p>
          )}
        </>
      )}
    </>
  );
}

export default function MenuCard() {
  const [tab, setTab] = useState('dietary');

  return (
    <div style={{ padding: '24px 22px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <QrCode size={19} strokeWidth={2} />
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 600, color: 'var(--ink)' }}>Menu Card</h1>
      </div>

      <div style={{ display: 'flex', gap: 4, margin: '16px 0 14px', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5,
            border: '1px solid ' + (tab === t.key ? 'var(--ink)' : 'var(--line)'),
            background: tab === t.key ? 'var(--ink)' : 'transparent',
            color: tab === t.key ? 'var(--paper)' : 'var(--mute)',
            fontWeight: tab === t.key ? 600 : 500,
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'dietary' && <DietaryTab />}
      {tab === 'translations' && <TranslationsTab />}
      {tab === 'preview' && <PreviewTab />}
    </div>
  );
}
