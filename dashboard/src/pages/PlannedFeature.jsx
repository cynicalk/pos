import { Navigate } from 'react-router-dom';
import Unavailable from '../components/Unavailable';
import FeatureShell from '../components/FeatureShell';
import { findPlannedFeature } from '../lib/plannedFeatures';
import { findFeatureLayout } from '../lib/featureLayouts';

/**
 * Route element for all 19 Tier-3 features. One component, driven by two
 * registries, so the shells cannot drift apart from each other in tone or in
 * what they are allowed to render.
 *
 * `plannedFeatures.js` says why the screen cannot answer yet.
 * `featureLayouts.js` says what the screen is — and every feature has one, so
 * an operator opening any of these sees the real page with nothing in it rather
 * than a paragraph about an absence. <Unavailable> remains the fallback for a
 * feature registered without a layout; `npm run check:planned` fails in that
 * case, so the fallback should never be reached in practice.
 *
 * When a feature becomes buildable, its entry leaves both registries and its
 * <Route> element is swapped for the real page — the path stays exactly where
 * it is, which is the point of giving these their final URLs now.
 */
export default function PlannedFeature({ slug }) {
  const feature = findPlannedFeature(slug);
  if (!feature) return <Navigate to="/overview" replace />;

  const layout = findFeatureLayout(slug);
  const Screen = layout ? FeatureShell : Unavailable;

  return (
    <Screen
      title={feature.title}
      summary={feature.summary}
      reason={feature.reason}
      blocker={feature.blocker}
      alternative={feature.alternative}
      layout={layout}
    />
  );
}
