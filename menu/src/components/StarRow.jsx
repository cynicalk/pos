import { Star } from 'lucide-react';

export function StarRow({ value, onChange, label }) {
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--mute)', margin: '0 0 6px' }}>
        {label}
      </p>
      <div style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onChange(n === value ? 0 : n)}
            style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', lineHeight: 0, fontFamily: 'inherit' }}
          >
            <Star
              size={28}
              fill={n <= value ? '#b3781f' : 'none'}
              stroke={n <= value ? '#b3781f' : 'var(--mute-2)'}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
