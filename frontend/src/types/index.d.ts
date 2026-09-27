// Ambient type declarations for editor intellisense. The project is
// plain JS/JSX, not TypeScript — these exist purely so VS Code/other
// editors can offer autocomplete on the shapes passed between
// services, hooks, and components. Nothing here is enforced at
// build time unless checkJs is turned on in jsconfig.json.

export interface Participant {
  id: string;
  anonymousName: string;
  isOwner: boolean;
  joinedAt: string;
}

export interface FileAttachment {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
  downloadUrl?: string;
  previewUrl?: string;
  expiresAt: string;
}

export interface ChatMessage {
  id: string;
  clientId?: string;
  type: 'text' | 'file' | 'system';
  senderId: string;
  senderName: string;
  content?: string;
  file?: FileAttachment;
  replyTo?: { messageId: string; senderName: string; content: string };
  timestamp: string;
}

export interface RoomSettings {
  roomId: string;
  roomName?: string;
  locked: boolean;
  acceptingNewMembers: boolean;
  fileSharingEnabled: boolean;
  maxParticipants: number;
  expiresAt: string;
}

export interface Session {
  sessionId: string;
  roomId: string;
  anonymousName: string;
  isOwner: boolean;
}

export type ConnectionState = 'connected' | 'reconnecting' | 'disconnected';
