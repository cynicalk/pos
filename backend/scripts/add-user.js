#!/usr/bin/env node
//
// Add a restaurant user (dashboard account) directly, WITHOUT exposing any
// secret and WITHOUT the email-verification round-trip.
//
// The Operator Panel's "Add user" leaves the account email_verified=FALSE with
// no verification email sent, so the person can't log in until they complete an
// email-based activation flow. This script instead creates the user
// email_verified=TRUE and force_password_change=FALSE, so the email + password
// you set work on first login at the dashboard (port 5173).
//
// The password is read from a hidden prompt — never in argv, shell history, or
// on disk. The DB connection comes from DATABASE_URL in backend/.env, so the DB
// password is never typed either. This file contains no secrets.
//
//   cd backend && node scripts/add-user.js

require('dotenv').config();
const bcrypt   = require('bcrypt');
const readline = require('readline');
const { Pool } = require('pg');

const SALT_ROUNDS = 12;                                  // matches auth.service.js
const VALID_ROLES = ['admin', 'staff', 'kitchen'];       // matches admin.service.js VALID_ROLES

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Run this from the backend/ dir so .env loads.');
  process.exit(1);
}

// One shared readline interface, with a line queue so input that arrives before
// we ask for it (e.g. piped stdin read ahead to EOF) isn't lost. A per-prompt
// readline would drop buffered lines; reading via the queue is robust for both
// interactive TTYs and piped input.
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
// a typed password is never displayed (no effect on piped input, which has no echo).
async function prompt(question, { hidden = false } = {}) {
  process.stdout.write(question);
  muted = hidden;
  const answer = await readLine();
  if (hidden) { muted = false; process.stdout.write('\n'); }
  if (answer === null) throw new Error('Input closed before a value was provided');
  return answer;
}

// Same policy the dashboard enforces on self-set passwords (auth.service.js).
function assertStrongPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 10) throw new Error('Password must be at least 10 characters');
  if (!/[A-Z]/.test(pw)) throw new Error('Password must contain at least one uppercase letter');
  if (!/[0-9]/.test(pw)) throw new Error('Password must contain at least one number');
}

async function pickFromList(label, items, render) {
  if (items.length === 0) throw new Error(`No ${label}s found`);
  items.forEach((it, i) => console.log(`  ${i + 1}) ${render(it)}`));
  const raw = (await prompt(`Choose ${label} (1-${items.length}): `)).trim();
  const idx = Number(raw) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) throw new Error('Invalid selection');
  return items[idx];
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows: restaurants } = await pool.query(
      'SELECT id, name FROM restaurants ORDER BY name',
    );
    const restaurant = await pickFromList('restaurant', restaurants, (r) => `${r.name}  (${r.id})`);

    const role = await pickFromList('role', VALID_ROLES, (r) => r);

    const email = (await prompt('Email: ')).trim().toLowerCase();
    if (!email) throw new Error('Email is required');

    const pw1 = await prompt('Password (hidden): ', { hidden: true });
    const pw2 = await prompt('Confirm password (hidden): ', { hidden: true });
    if (pw1 !== pw2) throw new Error('Passwords do not match');
    assertStrongPassword(pw1);

    const hash = await bcrypt.hash(pw1, SALT_ROUNDS);

    // Pre-verified so the credentials work immediately; force_password_change=FALSE
    // so the user isn't pushed into a reset flow on first login.
    const { rows } = await pool.query(
      `INSERT INTO users (email, password, role, restaurant_id, email_verified, force_password_change)
       VALUES ($1, $2, $3, $4, TRUE, FALSE)
       RETURNING id, email, role`,
      [email, hash, role, restaurant.id],
    );
    const u = rows[0];
    console.log(`Created ${u.role} "${u.email}" at "${restaurant.name}" — ready to log in.`);
  } catch (e) {
    // 23505 = unique_violation (email already in use).
    if (e.code === '23505') console.error('Error: a user with that email already exists.');
    else console.error('Error:', e.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    await pool.end();
  }
}

main();
