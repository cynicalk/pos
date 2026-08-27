/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper:      'var(--paper)',
        paper2:     'var(--paper-2)',
        ink:        'var(--ink)',
        ink2:       'var(--ink-2)',
        mute:       'var(--mute)',
        mute2:      'var(--mute-2)',
        accent:     'var(--accent)',
        'accent-on':'var(--accent-on)',
        ok:         'var(--ok)',
        warn:       'var(--warn)',
        bad:        'var(--bad)',
        info:       'var(--info)',
      },
      borderColor: {
        line:  'var(--line)',
        line2: 'var(--line-2)',
      },
      backgroundColor: {
        hover: 'var(--hover)',
      },
      fontFamily: {
        sans: ['"Geist"', 'ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
