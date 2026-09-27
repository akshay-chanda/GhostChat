import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import { SessionProvider } from './context/SessionContext';

/**
 * Root layout. Footer is deliberately omitted on the active chat
 * screen — that route needs the full viewport height for the
 * message list (see ChatRoomPage's h-screen layout) and a footer
 * would just get pushed below the fold or force extra scrolling.
 * Navbar already knows how to shrink itself for that route on its own.
 */
export default function App() {
  const location = useLocation();
  const isChatRoom = location.pathname.startsWith('/room/');

  return (
    <SessionProvider>
      <Navbar />
      <main>
        <Outlet />
      </main>
      {!isChatRoom && <Footer />}
    </SessionProvider>
  );
}
