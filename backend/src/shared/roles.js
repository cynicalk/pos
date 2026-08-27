// Restaurant-tenant user roles — the single source of truth shared by auth.service
// (self/registration + role change) and admin.service (operator-created users) so the
// two role lists can't drift (previously admin omitted 'cashier' — UR1).
const RESTAURANT_ROLES = ['admin', 'staff', 'cashier', 'kitchen'];

module.exports = { RESTAURANT_ROLES };
