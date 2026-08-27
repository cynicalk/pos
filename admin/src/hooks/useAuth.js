export function useAuth() {
  const admin = JSON.parse(localStorage.getItem('admin_user') || '{}');
  return { admin };
}
