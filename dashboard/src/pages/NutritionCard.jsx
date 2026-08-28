import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Flame, Info, ArrowRight, AlertTriangle } from 'lucide-react';
import api from '../api/client';

/**
 * Nutrition & Calories — per-serving macros derived from recipes, never guessed.
 *
 * This is the feature a language model makes tempting to fake: hand it a dish
 * name and it returns a confident "540 kcal" that a guest counting macros would
 * act on. So the screen does the opposite — it explodes each dish's recipe
 * through the per-ingredient nutrition the operator declared, exactly as the prep
 * sheet explodes cost, and a dish with even one undeclared ingredient reports
 * NOTHING rather than a number that is nearly right but silently short a
 * component. The coverage figure up top is the honest score, and the undeclared
 * list is the short to-do that raises it.
 */

const CARD = {
  border: '1px solid var(--line)', borderRadius: 12,
  background: 'var(--paper)', padding: '18px 20px', minWidth: 0,
};
const LABEL = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '.12em', color: 'var(--label)',
};
const th = {
  padding: '8px 11px', textAlign: 'left', fontSize: 10, fontWeight: 600,
  color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.06em',
  whiteSpace: 'nowrap', borderBottom: '1px solid var(--line)',
};
const td = { padding: '9px 11px', fontSize: 12.5, color: 'var(--ink)' };
const tdNum = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

const REASON_LABEL = {
  no_recipe: 'No recipe',
  empty_recipe: 'Empty recipe',
  undeclared_ingredients: 'Undeclared ingredient',
};

function Note({ children, icon: Icon = Info }) {
  return (
    <p style={{ display: 'flex', gap: 7, alignItems: 'flex-start', margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--mute)' }}>
      <Icon size={13} strokeWidth={2} style={{ flexShrink: 0, marginTop: 3 }} />
      <span>{children}</span>
    </p>
  );
}

export default function NutritionCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['guestmenu', 'nutrition'],
    queryFn: async () => (await api.get('/guestmenu/nutrition')).data,
    enabled: !!localStorage.getItem('pos_user'),
    staleTime: 5 * 60_000,
  });

  if (isLoading || !data) {
    return <div style={{ padding: 32, color: 'var(--mute)' }}>Loading…</div>;
  }

  const { dishes, coverage } = data;
  const complete = dishes.filter((d) => d.complete);
  const incomplete = dishes.filter((d) => !d.complete);

  // The ingredients standing between the menu and 100% — named once, deduped,
  // so the operator sees the short list to declare rather than the long list of
  // dishes it blocks.
  const undeclaredIngredients = [...new Set(
    dishes.flatMap((d) => d.missing || []),
  )].sort();

  return (
    <div style={{ padding: '26px 24px 48px', maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 18 }}>

      <div>
        <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 10 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px',
            borderRadius: 999, background: 'var(--paper-3)', color: 'var(--mute)',
            fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em',
          }}>
            <Flame size={12} strokeWidth={2.2} /> Derived from recipes
          </span>
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-.01em' }}>
          Nutrition &amp; Calories
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--ink-2)' }}>
          Per-serving macros exploded from each dish's recipe and its ingredients' declared nutrition
        </p>
      </div>

      {/* ── The one thing this page must say ────────────────────────────── */}
      <div style={{ padding: '14px 18px', borderLeft: '2px solid var(--info)', background: 'var(--paper-2)', borderRadius: '0 8px 8px 0' }}>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--mute)' }}>
          <strong style={{ color: 'var(--ink-2)', fontWeight: 600 }}>
            Nothing here is guessed.
          </strong>{' '}
          A dish shows a figure only when it has a recipe and every ingredient in it
          has declared nutrition. A dish missing even one reports nothing rather than a
          number that is nearly right — the same rule the allergen card follows.
        </p>
      </div>

      {/* ── Headline ────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        {[
          ['Coverage', coverage.pct === null ? '—' : `${coverage.pct}%`, 'of costed dishes have full nutrition'],
          ['Showing', coverage.complete, 'dishes with a per-serving figure'],
          ['Undeclared', coverage.withRecipe - coverage.complete, 'costed dishes missing an ingredient value'],
          ['No recipe', coverage.noRecipe, 'dishes with nothing to explode yet'],
        ].map(([label, value, sub]) => (
          <div key={label} style={CARD}>
            <div style={LABEL}>{label}</div>
            <div className="mono num" style={{ marginTop: 8, fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{value}</div>
            <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--mute)', lineHeight: 1.5 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── The short to-do that raises coverage ────────────────────────── */}
      {undeclaredIngredients.length > 0 && (
        <div style={{ ...CARD, background: 'var(--warn-soft, var(--paper-2))', border: '1px solid var(--line)' }}>
          <div style={{ ...LABEL, marginBottom: 6 }}>Declare these to fill the gaps</div>
          <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.6, maxWidth: 800 }}>
            {undeclaredIngredients.length} ingredient{undeclaredIngredients.length === 1 ? '' : 's'} used
            in the menu {undeclaredIngredients.length === 1 ? 'has' : 'have'} no nutrition entered.
            Setting {undeclaredIngredients.length === 1 ? 'it' : 'them'} lights up every dish that uses{' '}
            {undeclaredIngredients.length === 1 ? 'it' : 'them'}.
          </p>
          <div className="flex flex-wrap" style={{ gap: 7 }}>
            {undeclaredIngredients.map((name) => (
              <span key={name} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                borderRadius: 999, background: 'var(--paper-3)', color: 'var(--ink-2)',
                fontSize: 12, fontWeight: 500,
              }}>
                <AlertTriangle size={11} strokeWidth={2} style={{ color: 'var(--warn)' }} />
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Dishes with a figure ────────────────────────────────────────── */}
      {complete.length > 0 && (
        <div style={CARD}>
          <div style={{ ...LABEL, marginBottom: 4 }}>Per serving</div>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.6, maxWidth: 800 }}>
            Each figure is the recipe exploded to one serving, then summed across its
            ingredients. These are the dishes the guest menu card can show macros for.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
              <thead>
                <tr>
                  <th style={th}>Dish</th>
                  <th style={{ ...th, textAlign: 'right' }}>Calories</th>
                  <th style={{ ...th, textAlign: 'right' }}>Protein</th>
                  <th style={{ ...th, textAlign: 'right' }}>Carbs</th>
                  <th style={{ ...th, textAlign: 'right' }}>Fat</th>
                  <th style={{ ...th, textAlign: 'right' }}>From</th>
                </tr>
              </thead>
              <tbody>
                {complete.map((d) => (
                  <tr key={d.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ ...td, fontWeight: 500 }}>{d.name}</td>
                    <td style={{ ...tdNum, fontWeight: 600 }} className="mono num">{d.perServing.kcal} <span style={{ color: 'var(--mute)', fontWeight: 400 }}>kcal</span></td>
                    <td style={tdNum} className="mono num">{d.perServing.protein}<span style={{ color: 'var(--mute)' }}>g</span></td>
                    <td style={tdNum} className="mono num">{d.perServing.carbs}<span style={{ color: 'var(--mute)' }}>g</span></td>
                    <td style={tdNum} className="mono num">{d.perServing.fat}<span style={{ color: 'var(--mute)' }}>g</span></td>
                    <td style={{ ...tdNum, color: 'var(--mute)', fontSize: 11 }} className="mono num">{d.ingredientCount} ing.</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Dishes without one, and why ─────────────────────────────────── */}
      {incomplete.length > 0 && (
        <div style={CARD}>
          <div style={{ ...LABEL, marginBottom: 4 }}>Not yet shown ({incomplete.length})</div>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.6, maxWidth: 800 }}>
            Each reports nothing rather than a partial figure. The reason is named so the
            gap is a task, not a mystery.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr>
                  <th style={th}>Dish</th>
                  <th style={th}>Reason</th>
                  <th style={th}>Missing</th>
                </tr>
              </thead>
              <tbody>
                {incomplete.map((d) => (
                  <tr key={d.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ ...td, fontWeight: 500 }}>{d.name}</td>
                    <td style={{ ...td, color: 'var(--mute)' }}>{REASON_LABEL[d.reason] || d.reason}</td>
                    <td style={{ ...td, color: 'var(--mute)', fontSize: 11.5 }}>
                      {(d.missing && d.missing.length)
                        ? d.missing.join(', ')
                        : (d.reason === 'no_recipe' ? 'add a recipe' : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Note>
        Nutrition values are per the ingredient's unit and are as accurate as the numbers you
        enter on each ingredient. They are reference figures for guidance, not a lab analysis.
      </Note>

      <div className="flex items-center gap-5 flex-wrap">
        <Link to="/menu-card" className="flex items-center gap-2"
          style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', textDecoration: 'none', borderBottom: '1px solid var(--line-2)', paddingBottom: 3 }}>
          Allergens &amp; diet on the menu card <ArrowRight size={14} strokeWidth={2} />
        </Link>
        <Link to="/inventory" className="flex items-center gap-2"
          style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--mute)', textDecoration: 'none', borderBottom: '1px solid var(--line-2)', paddingBottom: 3 }}>
          Ingredients &amp; recipes <ArrowRight size={14} strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}
