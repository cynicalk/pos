import { useState } from 'react';
import { BookMarked, History, Check, Save } from 'lucide-react';
import { useSops, useSopHistory, useAdoptSop, useSaveSop } from '../hooks/useCompliance';

/**
 * Playbook — the restaurant's written procedures.
 *
 * Two things carried over from the source's design, both load-bearing:
 *
 * · Every topic is listed whether or not it has been adopted, showing the
 *   built-in template as its content. An unwritten SOP is the most important
 *   row on this page, and hiding it would hide exactly that.
 * · Saving never edits. Each save is a new version and the old text stays
 *   readable, because "what did the procedure say in March" is the whole reason
 *   to version a document people are audited against.
 */

const SOURCE_LABEL = {
  template: 'built-in template',
  ai: 'drafted by Yumzy',
  manual: 'written here',
};

const btn = (primary = false) => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '6px 11px', borderRadius: 7, cursor: 'pointer',
  fontSize: 12.5, fontWeight: 500,
  border: `1px solid ${primary ? 'var(--ink)' : 'var(--line-2)'}`,
  background: primary ? 'var(--ink)' : 'transparent',
  color: primary ? 'var(--paper)' : 'var(--ink)',
});

function History_({ slug }) {
  const { data } = useSopHistory(slug);
  if (!data || data.versions.length === 0) {
    return <p style={{ fontSize: 12.5, color: 'var(--mute)' }}>No saved versions yet.</p>;
  }
  return data.versions.map((v) => (
    <details key={v.id} style={{ borderBottom: '1px solid var(--line)', padding: '7px 0' }}>
      <summary style={{ cursor: 'pointer', fontSize: 12.5, color: 'var(--ink)' }}>
        Version {v.version}
        <span style={{ color: 'var(--mute)' }}>
          {' '}· {SOURCE_LABEL[v.source] || v.source} · {String(v.created_at).slice(0, 10)}
        </span>
      </summary>
      <pre style={{
        margin: '8px 0 0', padding: '10px 12px', background: 'var(--paper-2)',
        borderRadius: 8, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap',
        fontFamily: 'inherit', color: 'var(--ink-2)',
      }}>{v.content}</pre>
    </details>
  ));
}

export default function Sops() {
  const { data: sops = [], isLoading } = useSops();
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const adopt = useAdoptSop();
  const save = useSaveSop();

  const active = sops.find((s) => s.slug === selected) || sops[0];

  const startEditing = (sop) => {
    setSelected(sop.slug);
    setDraft(sop.content);
    setShowHistory(false);
  };

  return (
    <div style={{ padding: '24px 22px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <BookMarked size={19} strokeWidth={2} />
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 600, color: 'var(--ink)' }}>Playbook</h1>
      </div>
      <p style={{ margin: '8px 0 16px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.55 }}>
        Your written procedures. Nothing is edited in place — every save is a new version, so an
        older revision stays readable.
      </p>

      {isLoading ? (
        <p style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</p>
      ) : (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '0 0 210px', minWidth: 190 }}>
            {sops.map((s) => (
              <button
                key={s.slug}
                onClick={() => startEditing(s)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                  padding: '9px 11px', marginBottom: 5, borderRadius: 8, fontSize: 13,
                  border: '1px solid ' + (active?.slug === s.slug ? 'var(--ink)' : 'var(--line)'),
                  background: active?.slug === s.slug ? 'var(--paper-2)' : 'transparent',
                  color: 'var(--ink)',
                }}
              >
                {s.title}
                <div style={{ marginTop: 3, fontSize: 11, color: s.adopted ? 'var(--mute)' : 'var(--warn)' }}>
                  {s.adopted ? `v${s.version} · ${SOURCE_LABEL[s.source] || s.source}` : 'not adopted yet'}
                </div>
              </button>
            ))}
          </div>

          {active && (
            <div style={{ flex: 1, minWidth: 300 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{active.title}</h2>
                {!active.adopted && (
                  <span style={{
                    padding: '2px 8px', borderRadius: 999, background: 'var(--warn-soft)',
                    color: 'var(--warn)', fontSize: 10, fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '.06em',
                  }}>Template</span>
                )}
                <button
                  style={{ ...btn(), marginLeft: 'auto' }}
                  onClick={() => setShowHistory((v) => !v)}
                >
                  <History size={13} strokeWidth={2.2} /> {active.versionCount} version{active.versionCount === 1 ? '' : 's'}
                </button>
              </div>

              {!active.adopted && (
                <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.55 }}>
                  This is the built-in procedure, not yours yet. Adopt it as written, or edit it
                  below and save your own version.
                </p>
              )}

              {showHistory ? (
                <History_ slug={active.slug} />
              ) : (
                <>
                  <textarea
                    style={{
                      width: '100%', minHeight: 320, padding: '11px 13px', borderRadius: 8,
                      border: '1px solid var(--line-2)', background: 'var(--paper)',
                      color: 'var(--ink)', fontSize: 13, lineHeight: 1.6,
                      fontFamily: 'inherit', resize: 'vertical',
                    }}
                    value={selected === active.slug ? draft : active.content}
                    onChange={(e) => { setSelected(active.slug); setDraft(e.target.value); }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    {!active.adopted && (
                      <button
                        style={btn()}
                        disabled={adopt.isPending}
                        onClick={() => adopt.mutate(active.slug)}
                      >
                        <Check size={13} strokeWidth={2.2} /> Adopt as written
                      </button>
                    )}
                    <button
                      style={btn(true)}
                      disabled={save.isPending || !(selected === active.slug ? draft : active.content).trim()}
                      onClick={() => save.mutate({
                        slug: active.slug,
                        content: selected === active.slug ? draft : active.content,
                        source: 'manual',
                      })}
                    >
                      <Save size={13} strokeWidth={2.2} /> Save as version {active.version + 1}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
