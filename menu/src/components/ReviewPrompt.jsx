import { CheckCircle } from 'lucide-react';
import { useReview } from '../hooks/useReview';
import { StarRow } from './StarRow';

export function ReviewPrompt({ tableId, showToast, hasServedOrders, paid = false }) {
  const {
    reviewDone, reviewSubmitted,
    reviewRating, setReviewRating,
    reviewFoodRating, setReviewFoodRating,
    reviewServiceRating, setReviewServiceRating,
    reviewComment, setReviewComment,
    reviewPhone, setReviewPhone,
    reviewSubmitting, submitReview, dismissReview,
  } = useReview(tableId, showToast, { paid });

  if (!hasServedOrders || reviewDone) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--paper)', padding: '18px 16px' }}>
        {reviewSubmitted ? (
          <div className="flex flex-col items-center py-4 text-center">
            <CheckCircle size={34} style={{ color: 'var(--ok)', marginBottom: 10 }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: '0 0 4px' }}>Thank you!</p>
            <p style={{ fontSize: 12, color: 'var(--mute)' }}>Your feedback helps us improve.</p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', margin: '0 0 16px' }}>
              How was your experience?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <StarRow value={reviewRating}        onChange={setReviewRating}        label="Overall *" />
              <StarRow value={reviewFoodRating}    onChange={setReviewFoodRating}    label="Food quality" />
              <StarRow value={reviewServiceRating} onChange={setReviewServiceRating} label="Service" />
            </div>

            <textarea
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="Add a note… (optional)"
              maxLength={500}
              rows={2}
              style={{
                width: '100%', boxSizing: 'border-box', marginTop: 14,
                borderRadius: 8, border: '1px solid var(--line-2)',
                background: 'var(--paper-2)', color: 'var(--ink)',
                fontSize: 13, padding: '9px 12px',
                fontFamily: 'inherit', resize: 'none', outline: 'none',
              }}
            />
            <input
              type="tel"
              value={reviewPhone}
              onChange={(e) => setReviewPhone(e.target.value)}
              placeholder="Phone number (optional)"
              style={{
                width: '100%', boxSizing: 'border-box', marginTop: 8,
                borderRadius: 8, border: '1px solid var(--line-2)',
                background: 'var(--paper-2)', color: 'var(--ink)',
                fontSize: 13, padding: '9px 12px',
                fontFamily: 'inherit', outline: 'none',
              }}
            />
            <p style={{ fontSize: 11, color: 'var(--mute)', margin: '4px 0 0', textAlign: 'center' }}>
              Share your number to link this to your loyalty account
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              <button
                onClick={submitReview}
                disabled={reviewSubmitting || !reviewRating}
                style={{
                  width: '100%', borderRadius: 8, padding: '12px 0',
                  background: reviewRating ? 'var(--ink)' : 'var(--paper-2)',
                  color: reviewRating ? 'var(--accent-on)' : 'var(--mute-2)',
                  border: reviewRating ? 0 : '1px solid var(--line-2)',
                  fontSize: 14, fontWeight: 600,
                  cursor: reviewSubmitting || !reviewRating ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: reviewSubmitting ? 0.6 : 1,
                  transition: 'all .15s',
                }}
              >
                {reviewSubmitting ? 'Submitting…' : 'Submit Review'}
              </button>
              <button
                onClick={dismissReview}
                style={{
                  background: 'none', border: 'none', fontSize: 12,
                  color: 'var(--mute)', cursor: 'pointer', fontFamily: 'inherit',
                  padding: '4px 0', textAlign: 'center',
                }}
              >
                Maybe later
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
