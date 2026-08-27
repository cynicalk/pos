export function StaffPinBar({ tableInfo, pinFromUrl, staffPin, setStaffPin, staffName, setStaffName, pinVerifying, staffAssigning, staffAssigned, assignStaffToTable, verifyAndAssign }) {
  if (!tableInfo?.staff_assignment_enabled) return null;

  const isLocked = pinFromUrl || staffAssigned || !!tableInfo?.assigned_staff_name;
  const showDots = pinFromUrl || staffAssigned;

  return (
    <div className="flex items-center gap-2" style={{
      padding: '8px 16px',
      background: 'var(--paper)',
      borderBottom: '1px solid var(--line)',
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', whiteSpace: 'nowrap' }}>
        Staff code
      </span>

      {isLocked ? (
        <>
          {showDots && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 70, height: 28,
              border: '1px solid var(--line-2)', borderRadius: 6,
              background: 'var(--paper-2)',
              fontSize: 14, fontFamily: 'monospace', letterSpacing: '0.2em',
              color: 'var(--mute-2)', userSelect: 'none',
            }}>
              {'·'.repeat(staffPin.length || 4)}
            </span>
          )}
          {pinVerifying && (
            <span style={{ fontSize: 11, color: 'var(--mute)' }}>Verifying…</span>
          )}
          {staffName && !pinVerifying && (
            <span style={{ fontSize: 11.5, color: 'var(--ok)', fontWeight: 600 }}>
              ✓ {staffName}
            </span>
          )}
          {!staffName && !pinVerifying && (
            <span style={{ fontSize: 11, color: 'var(--mute-2)' }}>Assigned</span>
          )}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--mute-2)" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 2, flexShrink: 0 }}
               aria-label="Locked">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          {pinFromUrl && staffName && !pinVerifying && (
            <button
              onClick={assignStaffToTable}
              disabled={staffAssigning || staffAssigned}
              style={{
                marginLeft: 'auto', flexShrink: 0,
                height: 26, padding: '0 10px', borderRadius: 6,
                border: staffAssigned ? '1px solid var(--ok)' : '1px solid var(--line-2)',
                background: staffAssigned ? 'rgba(31,138,91,.08)' : 'var(--paper-2)',
                color: staffAssigned ? 'var(--ok)' : 'var(--ink)',
                fontSize: 11.5, fontWeight: 600,
                cursor: staffAssigning || staffAssigned ? 'default' : 'pointer',
                fontFamily: 'inherit',
                transition: 'all .15s',
                opacity: staffAssigning ? 0.6 : 1,
              }}
            >
              {staffAssigning ? 'Assigning…' : staffAssigned ? '✓ Assigned' : 'Set'}
            </button>
          )}
        </>
      ) : (
        <>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={staffPin}
            onChange={(e) => {
              setStaffPin(e.target.value.replace(/\D/g, '').slice(0, 4));
              setStaffName('');
            }}
            placeholder="1234"
            style={{
              width: 70, border: '1px solid var(--line-2)', borderRadius: 6,
              padding: '4px 8px', fontSize: 14, fontFamily: 'monospace',
              letterSpacing: '0.2em', textAlign: 'center',
              background: 'var(--paper-2)', color: 'var(--ink)', outline: 'none',
            }}
          />
          <button
            onClick={verifyAndAssign}
            disabled={staffPin.length !== 4 || staffAssigning}
            style={{
              flexShrink: 0,
              height: 28, padding: '0 10px', borderRadius: 6,
              border: '1px solid var(--line-2)',
              background: 'var(--paper-2)',
              color: staffPin.length === 4 ? 'var(--ink)' : 'var(--mute-2)',
              fontSize: 11.5, fontWeight: 600,
              cursor: staffPin.length !== 4 || staffAssigning ? 'default' : 'pointer',
              fontFamily: 'inherit',
              opacity: staffAssigning ? 0.6 : 1,
            }}
          >
            {staffAssigning ? 'Setting…' : 'Set'}
          </button>
          {staffPin.length === 4 && !staffName && !staffAssigning && (
            <span style={{ fontSize: 11, color: 'var(--mute-2)' }}>Not found</span>
          )}
        </>
      )}
    </div>
  );
}
