import { useRef, useState } from 'react';
import { AccessPathPanel, useAccessPath } from '@accesspath/react';
import type { AccessPathPanelHandle } from '@accesspath/react';

const STORAGE_KEY = 'accesspath-react-demo';

export function App() {
  const panelRef = useRef<AccessPathPanelHandle>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const { prefs } = useAccessPath(STORAGE_KEY);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}>
        <h1>AccessPath — React demo</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setIsDarkTheme((v) => !v)}>
            {isDarkTheme ? 'Light theme' : 'Dark theme'}
          </button>
          <button type="button" onClick={() => panelRef.current?.open()}>
            Open accessibility panel
          </button>
        </div>
      </header>

      <div
        ref={setContainer}
        className="a11y-target"
        style={{
          position: 'relative',
          margin: 16,
          padding: 16,
          minHeight: 420,
          borderRadius: 12,
          background: isDarkTheme ? '#1a1a2e' : '#fff',
          color: isDarkTheme ? '#fff' : '#111',
          border: '1px solid #e2e2ea',
        }}
      >
        <p>Hello! What are you craving today?</p>
        <p>Current text size preference: {prefs.fontSize}</p>

        <AccessPathPanel
          ref={panelRef}
          container={container}
          isDarkTheme={isDarkTheme}
          storageKey={STORAGE_KEY}
        />
      </div>
    </div>
  );
}
