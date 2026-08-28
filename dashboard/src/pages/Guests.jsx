import { useState, useEffect } from 'react';
import { Users, Info, Copy, Check, TrendingDown, Gift, Printer } from 'lucide-react';
import QRCode from 'qrcode';
import Modal from '../components/Modal';
import { useGuestMetrics, useChurnRisk } from '../hooks/useReputation';
import { useWinbackOffers, useCreateWinbackOffer } from '../hooks/useWinback';
import { useCurrency } from '../context/CurrencyContext';

/**
 * Guests — repeat rate and the winback list.
 *
 * Built on loyalty_customers and orders. There is no guest table and no visit
 * table, so the POS only sees guests who joined loyalty or gave their number at
 * the till — usually a minority of covers.
 *
 * The coverage banner is therefore not a caveat tucked at the bottom; it is the
 * first thing on the page. A repeat rate quoted without it looks like a fact
 * about the restaurant when it is a fact about the loyalty programme.
 *
 * There is also no way to SEND a winback message from here. Guest messaging is
 * a stub (see waitlist.notify), so the page hands over the number and the
 * message to copy, and does not pretend to have delivered anything.
 */

const WINDOWS = [
  { days: 30,  label: '30 days' },
  { days: 90,  label: '90 days' },
  { days: 180, label: '6 months' },
  { days: 365, label: '1 year' },
];

const th = {
  padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600,
  color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.06em',
};
const td = { padding: '7px 10px', fontSize: 12.5 };

const btn = (primary = false) => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '5px 10px', borderRadius: 7, cursor: 'pointer',
  fontSize: 12, fontWeight: 500,
  border: `1px solid ${primary ? 'var(--ink)' : 'var(--line-2)'}`,
  background: primary ? 'var(--ink)' : 'transparent',
  color: primary ? 'var(--paper)' : 'var(--ink)',
});

function Stat({ value, label, sub }) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--ink)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--mute)' }}>{label}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--mute)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** Copy a phone number. There is no send path, so copying is the honest verb. */
function CopyButton({ text, label }) {
  const [done, setDone] = useState(false);
  return (
    <button
      style={btn()}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        }).catch(() => {});
      }}
      aria-label={label}
    >
      {done ? <Check size={12} strokeWidth={2.4} /> : <Copy size={12} strokeWidth={2.2} />}
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

const CHURN_STATUS = {
  active:       { label: 'Active',       color: 'var(--ok)',   bg: 'var(--ok-soft)' },
  due:          { label: 'Due back',     color: 'var(--info)', bg: 'var(--info-soft)' },
  overdue:      { label: 'Overdue',      color: 'var(--warn)', bg: 'var(--warn-soft)' },
  likely_lost:  { label: 'Likely lost',  color: 'var(--bad)',  bg: 'var(--bad-soft)' },
};

function ChurnPill({ status }) {
  const s = CHURN_STATUS[status] || CHURN_STATUS.active;
  return (
    <span style={{ padding: '2px 8px', borderRadius: 999, background: s.bg, color: s.color, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>{s.label}</span>
  );
}

const shortDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const shortDateLong = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const offerLine = (o) =>
  `${o.discountValue}% off${o.minOrderAmount > 0 ? ` on orders over ₹${o.minOrderAmount}` : ''}`;

/**
 * Print one winback offer as a hand-over slip: the QR (encoding the code), the
 * code in plain text so the counter can key it in, and the terms. Opens a bare
 * print window rather than fighting the app's layout with print CSS, so what
 * prints is exactly the slip and nothing else.
 */
function printOffer(offer, qrDataUrl) {
  const w = window.open('', '_blank', 'width=420,height=620');
  if (!w) return;
  const esc = (s) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  w.document.write(`<!doctype html><html><head><title>Winback offer ${esc(offer.code)}</title>
    <style>
      body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:32px;color:#1a1a1a;text-align:center}
      .card{border:1.5px dashed #bbb;border-radius:14px;padding:26px 22px;max-width:320px;margin:0 auto}
      h1{font-size:19px;margin:0 0 2px} .sub{color:#666;font-size:13px;margin:0 0 18px}
      img{width:210px;height:210px} .code{font-size:24px;font-weight:700;letter-spacing:2px;margin:16px 0 4px}
      .terms{font-size:15px;font-weight:600;margin:8px 0 2px} .fine{color:#666;font-size:12px;line-height:1.5;margin-top:10px}
    </style></head><body>
    <div class="card">
      <h1>We miss you${offer.guest?.name ? `, ${esc(offer.guest.name.split(' ')[0])}` : ''}!</h1>
      <p class="sub">Here's a little something to bring you back</p>
      <img src="${qrDataUrl}" alt="offer code"/>
      <div class="code">${esc(offer.code)}</div>
      <div class="terms">${esc(offerLine(offer))}</div>
      <p class="fine">Show this at the counter on your next visit. Valid until ${esc(shortDateLong(offer.expiresAt))}. One use.</p>
    </div>
    <script>window.onload=function(){window.print();}</script>
    </body></html>`);
  w.document.close();
}

/** A just-issued (or reopened) offer, shown with its QR and a print button. */
function WinbackCard({ offer, onClose }) {
  const [qr, setQr] = useState(null);
  useEffect(() => {
    QRCode.toDataURL(offer.code, { width: 240, margin: 2 }).then(setQr).catch(() => {});
  }, [offer.code]);

  // Uses the shared Modal (portal, Escape-to-close, mobile bottom-sheet) rather
  // than a hand-rolled overlay, so it behaves like every other dialog in the app.
  return (
    <Modal title="Winback offer" onClose={onClose}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', margin: '0 0 14px' }}>
          {offer.guest?.name || 'Guest'}
        </div>
        {qr
          ? <img src={qr} alt="offer QR code" style={{ width: 200, height: 200 }} />
          : <div style={{ width: 200, height: 200, margin: '0 auto', background: 'var(--paper-3)', borderRadius: 8 }} />}
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2, color: 'var(--ink)', margin: '12px 0 2px', fontFamily: 'ui-monospace, monospace' }}>
          {offer.code}
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-2)' }}>{offerLine(offer)}</div>
        <p style={{ fontSize: 11.5, color: 'var(--mute)', lineHeight: 1.5, margin: '10px 0 16px' }}>
          Printed and handed over — there is no send channel yet. The code applies at the till like any
          coupon; valid until {shortDateLong(offer.expiresAt)}, one use.
        </p>
        <button style={{ ...btn(true), width: '100%', justifyContent: 'center', padding: '8px 10px' }} onClick={() => printOffer(offer, qr)}>
          <Printer size={13} strokeWidth={2.2} /> Print offer
        </button>
      </div>
    </Modal>
  );
}

/**
 * Churn risk from each guest's own cadence — the per-guest answer to the fixed
 * 30-day winback window. "Overdue" means overdue for THIS guest: a weekly
 * regular gone three weeks, not everyone measured against one number.
 */
function ChurnSection({ format }) {
  const { data, isLoading } = useChurnRisk();
  const { data: winback } = useWinbackOffers();
  const createOffer = useCreateWinbackOffer();
  const [activeOffer, setActiveOffer] = useState(null);

  // The open offer per guest, so a guest who already has one shows Print, not
  // Create — the backend refuses a second, and the UI should not invite it.
  const openByGuest = new Map(
    (winback?.offers || [])
      .filter((o) => o.status === 'open')
      .map((o) => [o.guest.customerId, o]),
  );

  const issue = (customerId) => {
    createOffer.mutate(customerId, { onSuccess: (offer) => setActiveOffer(offer) });
  };

  if (isLoading || !data) return null;
  if (data.predictableGuests === 0) {
    return (
      <div style={{ marginBottom: 26 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <TrendingDown size={15} strokeWidth={2} /> Churn risk &amp; reorder prediction
        </h3>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.55 }}>
          No guest yet has the {data.minOrdersForCadence}+ visits needed to measure a cadence, so
          there is nothing to predict against. This fills in as identified guests return.
        </p>
      </div>
    );
  }

  const rows = [...data.atRisk, ...data.dueSoon];

  return (
    <div style={{ marginBottom: 30 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
        <TrendingDown size={15} strokeWidth={2} /> Churn risk &amp; reorder prediction
      </h3>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.55, maxWidth: 760 }}>
        Predicted from each guest's own visit rhythm — the median gap between their visits — not a
        fixed window. "Overdue for them" is the signal a flat 30-day list misses. Value shown is what
        an at-risk guest has already spent, never a projection of winning them back.
      </p>

      <div style={{ display: 'flex', gap: 30, flexWrap: 'wrap', marginBottom: 16 }}>
        <Stat value={data.atRiskCount} label="at risk of churning"
          sub={data.atRiskCount > 0 ? `${format(data.atRiskHistoricSpend)} spent previously` : null} />
        <Stat value={data.dueSoonCount} label="due back soon" />
        <Stat value={data.predictableGuests} label="guests with a cadence"
          sub={data.insufficientHistory > 0 ? `${data.insufficientHistory} too new to predict` : null} />
        {winback && winback.summary.total > 0 && (
          <Stat value={winback.summary.open} label="winback offers open"
            sub={winback.summary.redeemed > 0 ? `${winback.summary.redeemed} redeemed` : null} />
        )}
      </div>

      {createOffer.isError && (
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--bad)' }}>
          {createOffer.error?.response?.data?.error || 'Could not create the offer.'}
        </p>
      )}

      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--mute)' }}>No guest is overdue or due back right now.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid var(--line-2)' }}>
            <th style={th}>Guest</th>
            <th style={th}>Rhythm</th>
            <th style={th}>Last seen</th>
            <th style={th}>Status</th>
            <th style={th}>Predicted next</th>
            <th style={th}>Spent</th>
            <th style={th}>Winback</th>
            <th style={th} />
          </tr></thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.customerId} style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={td}>{g.name || <span style={{ color: 'var(--mute)' }}>no name</span>}</td>
                <td style={{ ...td, color: 'var(--mute)' }}>~every {g.cadenceDays}d · {g.regularity}</td>
                <td style={{ ...td, color: 'var(--mute)' }}>{g.daysSince}d ago</td>
                <td style={td}><ChurnPill status={g.status} /></td>
                <td style={{ ...td, color: 'var(--mute)', fontVariantNumeric: 'tabular-nums' }}>
                  {shortDate(g.predictedNextOrder)}
                  {g.daysUntilPredicted < 0 && <span style={{ color: 'var(--warn)' }}> ({-g.daysUntilPredicted}d late)</span>}
                </td>
                <td style={td}>{format(g.totalSpend)}</td>
                <td style={td}>
                  {openByGuest.has(g.customerId) ? (
                    <button style={btn()} onClick={() => setActiveOffer(openByGuest.get(g.customerId))}>
                      <Printer size={12} strokeWidth={2.2} /> {openByGuest.get(g.customerId).code}
                    </button>
                  ) : (
                    <button
                      style={btn()}
                      disabled={createOffer.isPending}
                      onClick={() => issue(g.customerId)}
                    >
                      <Gift size={12} strokeWidth={2.2} /> Create offer
                    </button>
                  )}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <CopyButton text={g.phone} label={`Copy phone number for ${g.name || 'guest'}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {activeOffer && <WinbackCard offer={activeOffer} onClose={() => setActiveOffer(null)} />}
    </div>
  );
}

export default function Guests() {
  const [days, setDays] = useState(90);
  const { data, isLoading } = useGuestMetrics(days);
  const { format } = useCurrency();

  return (
    <div style={{ padding: '24px 22px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Users size={19} strokeWidth={2} />
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 600, color: 'var(--ink)' }}>Guests</h1>
      </div>

      <div style={{ display: 'flex', gap: 4, margin: '16px 0 14px', flexWrap: 'wrap' }}>
        {WINDOWS.map((w) => (
          <button key={w.days} onClick={() => setDays(w.days)} style={{
            padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5,
            border: '1px solid ' + (days === w.days ? 'var(--ink)' : 'var(--line)'),
            background: days === w.days ? 'var(--ink)' : 'transparent',
            color: days === w.days ? 'var(--paper)' : 'var(--mute)',
            fontWeight: days === w.days ? 600 : 500,
          }}>{w.label}</button>
        ))}
      </div>

      {isLoading && <p style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</p>}

      {data && (
        <>
          {/* First, not last. Everything below is measured over this slice only. */}
          <div style={{
            display: 'flex', gap: 8, padding: '11px 14px', borderRadius: 9,
            background: 'var(--hover)', marginBottom: 18,
          }}>
            <Info size={15} strokeWidth={2} style={{ color: 'var(--mute)', flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
              {data.coverage.pct === null ? (
                <>No paid orders in this window, so there is nothing to measure yet.</>
              ) : (
                <>
                  <strong>{data.coverage.pct}%</strong> of paid orders in the last {days} days could
                  be matched to a known guest ({data.coverage.identifiedOrders} of{' '}
                  {data.coverage.totalOrders}). Everything below describes those guests only —
                  the rest of your covers are anonymous to the POS, so this is not a repeat rate
                  for the restaurant as a whole.
                </>
              )}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 30, flexWrap: 'wrap', marginBottom: 24 }}>
            <Stat value={data.uniqueGuests} label="known guests" />
            <Stat value={data.repeatGuests} label="came back at least once" />
            <Stat
              value={data.repeatRatePct === null ? '—' : `${data.repeatRatePct}%`}
              label="repeat rate"
              sub={data.repeatRatePct === null
                ? `needs ${data.minGuestsForRate}+ known guests`
                : null}
            />
            <Stat
              value={data.lapsedCount}
              label={`not back in ${data.lapsedAfterDays}+ days`}
              sub={data.lapsedCount > 0 ? `${format(data.lapsedHistoricSpend)} spent previously` : null}
            />
          </div>

          <ChurnSection format={format} />

          <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>Winback list</h3>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.55 }}>
            Guests who have not been back in {data.lapsedAfterDays} days, most valuable first.
            CookLyt cannot message them — there is no guest messaging channel connected — so copy
            the number and reach out however you normally would.
          </p>

          {data.lapsedGuests.length === 0 ? (
            // Carries the same bottom margin the table it replaces does, so the
            // empty state does not collide with the next heading.
            <p style={{ margin: '0 0 26px', fontSize: 13, color: 'var(--mute)' }}>
              Nobody has lapsed in this window.
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 26 }}>
              <thead><tr style={{ borderBottom: '1px solid var(--line-2)' }}>
                <th style={th}>Guest</th>
                <th style={th}>Phone</th>
                <th style={th}>Visits</th>
                <th style={th}>Spent</th>
                <th style={th}>Last seen</th>
                <th style={th} />
              </tr></thead>
              <tbody>
                {data.lapsedGuests.map((g) => (
                  <tr key={g.customerId} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={td}>{g.name || <span style={{ color: 'var(--mute)' }}>no name</span>}</td>
                    <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{g.phone}</td>
                    <td style={td}>{g.visits}</td>
                    <td style={td}>{format(g.totalSpend)}</td>
                    <td style={{ ...td, color: 'var(--mute)' }}>{g.daysSince} days ago</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <CopyButton text={g.phone} label={`Copy phone number for ${g.name || 'guest'}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Recently seen</h3>
          {data.recentGuests.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--mute)' }}>No identified guests in this window.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '1px solid var(--line-2)' }}>
                <th style={th}>Guest</th>
                <th style={th}>Visits</th>
                <th style={th}>Spent</th>
                <th style={th}>Avg per visit</th>
                <th style={th}>Last seen</th>
              </tr></thead>
              <tbody>
                {data.recentGuests.map((g) => (
                  <tr key={g.customerId} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={td}>
                      {g.name || <span style={{ color: 'var(--mute)' }}>no name</span>}
                      {g.repeat && (
                        <span style={{
                          marginLeft: 7, padding: '1px 7px', borderRadius: 999,
                          background: 'var(--ok-soft)', color: 'var(--ok)',
                          fontSize: 10, fontWeight: 600,
                        }}>repeat</span>
                      )}
                    </td>
                    <td style={td}>{g.visits}</td>
                    <td style={td}>{format(g.totalSpend)}</td>
                    <td style={td}>{format(g.avgSpend)}</td>
                    <td style={{ ...td, color: 'var(--mute)' }}>
                      {g.daysSince === 0 ? 'today' : `${g.daysSince} days ago`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
