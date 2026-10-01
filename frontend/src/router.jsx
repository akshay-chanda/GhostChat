import { createBrowserRouter } from 'react-router-dom';
import App from './App';
import LandingPage from './pages/LandingPage';
import CreateRoomPage from './pages/CreateRoomPage';
import JoinRoomPage from './pages/JoinRoomPage';
import ChatRoomPage from './pages/ChatRoomPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import RoomExpiredPage from './pages/RoomExpiredPage';
import NotFoundPage from './pages/NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'create', element: <CreateRoomPage /> },
      // CreateRoomForm navigates here (with router state) right
      // after a successful creation — same page component as
      // /create, which branches on whether that state is present.
      { path: 'room-created', element: <CreateRoomPage /> },
      { path: 'join', element: <JoinRoomPage /> },
      { path: 'join/:roomId', element: <JoinRoomPage /> },
      { path: 'room/:roomId', element: <ChatRoomPage /> },
      { path: 'privacy', element: <PrivacyPolicyPage /> },
      { path: 'room-expired', element: <RoomExpiredPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);