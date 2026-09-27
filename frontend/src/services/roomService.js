import { api } from './api';

/**
 * HTTP-side room operations (see backend routes/roomRoutes.js for
 * the matching endpoints). Real-time actions that need to reach
 * everyone in the room immediately — lock, destroy, remove
 * participant — are socket events instead (see socketService.js);
 * this file is for request/response operations only.
 */

export async function createRoom({ roomName, password, duration, maxParticipants, allowFiles }) {
  return api.post('/rooms', {
    roomName,
    password,
    duration,
    maxParticipants,
    allowFileSharing: allowFiles,
  });
}

export async function joinRoom({ roomId, password }) {
  return api.post('/rooms/join', { roomId, password });
}

export async function getRoomInfo(roomId) {
  return api.get(`/rooms/${roomId}`);
}
