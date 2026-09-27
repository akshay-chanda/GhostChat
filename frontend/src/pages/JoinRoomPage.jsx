import { useParams } from 'react-router-dom';

import JoinRoomForm from '../components/room/JoinRoomForm';

/**
 * JoinRoomPage
 *
 * Handles both:
 *
 *   /join
 *   /join/:roomId
 *
 * When a room ID is present in the URL, it is passed to
 * JoinRoomForm so the room ID can be prefilled.
 */
export default function JoinRoomPage() {
  const { roomId } = useParams();

  return (
    <main
      className="
        min-h-[100dvh]
        w-full
        flex
        items-center
        justify-center
        px-3
        xs:px-4
        sm:px-6
        md:px-8
        lg:px-10
        py-20
        sm:py-24
        md:py-28
        overflow-x-hidden
      "
    >
      <div
        className="
          w-full
          max-w-2xl
          mx-auto
          min-w-0
          flex
          items-center
          justify-center
        "
      >
        <div className="w-full min-w-0">
          <JoinRoomForm
            initialRoomId={roomId || ''}
          />
        </div>
      </div>
    </main>
  );
}