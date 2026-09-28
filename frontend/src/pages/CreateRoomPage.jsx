import { useState } from 'react';
import { useLocation } from 'react-router-dom';

import CreateRoomForm from '../components/room/CreateRoomForm';
import RoomCreatedCard from '../components/room/RoomCreatedCard';
import QRModal from '../components/room/QRModal';

/**
 * CreateRoomPage
 *
 * Handles both:
 *   /create
 *   /room-created
 *
 * CreateRoomForm navigates here with the newly created
 * room details in router state after successful creation.
 *
 * The QR invitation is generated entirely on the
 * frontend using:
 *
 *   window.location.origin
 *   roomId
 *   password
 *
 * The backend Render shareLink is NOT used for QR
 * codes or QR "Copy link".
 */
export default function CreateRoomPage() {
  const location = useLocation();

  const createdRoom = location.state;

  const [qrOpen, setQrOpen] = useState(false);

  // --------------------------------------------------
  // Show QR modal
  // --------------------------------------------------

  const handleShowQr = () => {
    if (!createdRoom?.roomId) {
      return;
    }

    setQrOpen(true);
  };

  // --------------------------------------------------
  // Close QR modal
  // --------------------------------------------------

  const handleCloseQr = () => {
    setQrOpen(false);
  };

  // --------------------------------------------------
  // Page
  // --------------------------------------------------

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
          flex
          items-center
          justify-center
        "
      >
        {createdRoom ? (
          <>
            {/* ------------------------------------------
                Room Created Card
            ------------------------------------------ */}

            <div className="w-full min-w-0">
              <RoomCreatedCard
                roomId={createdRoom.roomId}
                password={createdRoom.password}
                sessionId={createdRoom.sessionId}
                anonymousName={
                  createdRoom.anonymousName
                }
                isOwner={true}
                onShowQr={handleShowQr}
              />
            </div>

            {/* ------------------------------------------
                QR Modal

                IMPORTANT:
                No shareLink is passed here.

                QRModal creates the invitation URL from:
                  - window.location.origin
                  - roomId
                  - password

                Therefore the Render backend URL cannot
                be used by the QR Copy Link button.
            ------------------------------------------ */}

            <QRModal
              open={qrOpen}
              onClose={handleCloseQr}
              roomId={createdRoom.roomId}
              password={createdRoom.password}
            />
          </>
        ) : (
          /* --------------------------------------------
             Create Room Form
          -------------------------------------------- */

          <div className="w-full min-w-0">
            <CreateRoomForm />
          </div>
        )}
      </div>
    </main>
  );
}