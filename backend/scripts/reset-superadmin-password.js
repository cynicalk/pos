#!/usr/bin/env node
//
// Reset (or create) a super-admin password WITHOUT exposing any secret.
//
// The password is read from a hidden interactive prompt — it never appears in
// argv (so it can't leak via `ps`), in shell history, or on disk. The DB
// connection is taken from DATABASE_URL in backend/.env, so the DB password is
// never typed on a command line either. This file itself contains no secrets
// and is safe to commit.
//
//   cd backend && node scripts/reset-superadmin-password.js
//
// If the email already exists its password is updated; otherwise a new,
// email-verified super admin is created.

require('dotenv').config();
const bcrypt   = require('bcrypt');
const readline = require('readline');
const { Pool } = require('pg');

const SALT_ROUNDS = 12; // must match auth.service.js / admin.service.js

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Run this from the backend/ dir so .env loads.');
  process.exit(1);
}

// One shared readline interface with a line queue, so input that arrives before
// we ask for it (e.g. piped stdin read ahead to EOF) isn't lost. A per-prompt
// readline would drop buffered lines; this is robust for TTYs and pipes alike.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
let muted = false;
rl._writeToOutput = (s) => { if (!muted) rl.output.write(s); }; // suppress keystroke echo when muted (TTY)

const lineQueue = [];
let waiter = null;
let closed = false;
rl.on('line', (line) => { if (waiter) { const w = waiter; waiter = null; w(line); } else lineQueue.push(line); });
rl.on('close', () => { closed = true; if (waiter) { const w = waiter; waiter = null; w(null); } });

function readLine() {
  if (lineQueue.length) return Promise.resolve(lineQueue.shift());
  if (closed) return Promise.resolve(null);
  return new Promise((resolve) => { waiter = resolve; });
}

// Print the prompt, then read one line. When `hidden`, mute the terminal echo so
// the password never renders (no effect on piped input, which has no echo).
async function prompt(question, { hidden = false } = {}) {
  process.stdout.write(question);
  muted = hidden;
  const answer = await readLine();
  if (hidden) { muted = false; process.stdout.write('\n'); }
  if (answer === null) throw new Error('Input closed before a value was provided');
  return answer;
}

function assertStrongPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 10) throw new Error('Password must be at least 10 characters');
  if (!/[A-Z]/.test(pw)) throw new Error('Password must contain at least one uppercase letter');
  if (!/[0-9]/.test(pw)) throw new Error('Password must contain at least one number');
}

async function main() {
  const email = (await prompt('Super-admin email: ')).trim().toLowerCase();
  if (!email) throw new Error('Email is required');

  const pw1 = await prompt('New password (hidden): ', { hidden: true });
  const pw2 = await prompt('Confirm password (hidden): ', { hidden: true });
  if (pw1 !== pw2) throw new Error('Passwords do not match');
  assertStrongPassword(pw1);

  const hash = await bcrypt.hash(pw1, SALT_ROUNDS);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Upsert: update the password if the operator exists, otherwise create a
    // verified one. force_password_change=FALSE so the new password works as-is.
    const { rows } = await pool.query(
      `INSERT INTO super_admins (email, password, email_verified, force_password_change)
       VALUES ($1, $2, TRUE, FALSE)
       ON CONFLICT (email) DO UPDATE
         SET password = EXCLUDED.password,
             force_password_change = FALSE
       RETURNING id, email, (xmax = 0) AS created`,
      [email, hash],
    );
    const r = rows[0];
    console.log(`${r.created ? 'Created' : 'Updated'} super admin: ${r.email}`);
  } finally {
    rl.close();
    await pool.end();
  }
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
