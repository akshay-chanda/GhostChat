import { createContext, useContext, useState, useCallback } from 'react';

const SessionContext = createContext(null);

/**
 * Deliberately in-memory only — no localStorage/sessionStorage. A
 * page refresh ending the session is a feature here, not a bug:
 * this app's privacy model is "nothing survives you leaving," and
 * persisting the session (or worse, the derived room key) across a
 * reload would quietly extend that beyond what the UI promises.
 * Reconnection after a brief network drop is handled separately by
 * useReconnect, which re-uses the still-live socket rather than
 * re-deriving anything from storage.
 */
export function SessionProvider({ children }) {
  const [session, setSession] = useState(null); // { sessionId, roomId, anonymousName, isOwner }

  const startSession = useCallback((newSession) => {
    setSession(newSession);
  }, []);

  const endSession = useCallback(() => {
    setSession(null);
  }, []);

  return (
    <SessionContext.Provider value={{ session, startSession, endSession }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
