// Allow audit_logs.actor_id to be NULL so security-relevant events with no known
// actor — chiefly failed login attempts (wrong email / wrong password / brute
// force) — can actually be recorded. Previously the NOT NULL constraint caused
// the audit writer to silently drop every actor-less entry, so failed logins
// never reached the audit trail despite the routers logging them.

exports.up = (pgm) => {
  pgm.alterColumn('audit_logs', 'actor_id', { notNull: false });
};

exports.down = (pgm) => {
  // Actor-less rows must go before the NOT NULL constraint can be restored.
  pgm.sql('DELETE FROM audit_logs WHERE actor_id IS NULL');
  pgm.alterColumn('audit_logs', 'actor_id', { notNull: true });
};
