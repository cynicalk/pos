// Singleton navigate ref so non-component modules (e.g. the API client) can
// trigger React Router navigations without a hard page reload.
let _navigate = null;

export const setNavigate = (fn) => { _navigate = fn; };

// Returns false when the router isn't mounted yet so callers can fall back
// to a hard redirect.
export const navigate = (...args) => {
  if (!_navigate) return false;
  _navigate(...args);
  return true;
};
