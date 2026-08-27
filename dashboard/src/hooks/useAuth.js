// Single source of truth for the current user's identity, role, and restaurant.
export function useAuth() {
  const user       = JSON.parse(localStorage.getItem('pos_user')       || '{}');
  const restaurant = JSON.parse(localStorage.getItem('pos_restaurant') || '{}');
  const isAdmin    = user?.role === 'admin';
  const isCashier  = user?.role === 'cashier';
  return { user, restaurant, isAdmin, isCashier };
}
