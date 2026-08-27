import { Component } from 'react';

// Generic error boundary used both around the lazy-loaded route tree and
// around the authenticated app's <Outlet />. Pass a `key` that changes on
// navigation (e.g. key={pathname}) so a caught error doesn't persist when
// the user navigates away.
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Unhandled error in component tree:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '40vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12,
          padding: 40, textAlign: 'center', color: 'var(--mute)',
        }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>
            Something went wrong loading this page.
          </p>
          <p style={{ fontSize: 12.5 }}>
            Try reloading. If the problem continues, contact support.
          </p>
          <button className="btn-secondary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
