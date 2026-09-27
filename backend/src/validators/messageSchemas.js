const { z } = require('zod');
const { MAX_MESSAGE_LENGTH } = require('../utils/constants');

/**
 * Validates the shape of an incoming message:send payload.
 *
 * The server does not decrypt messages.
 * Ciphertext and IV are treated as encrypted data.
 */

const messageSendSchema = z.object({
  clientId: z.string().uuid().optional(),

  ciphertext: z.string()
    .min(1)
    .max(MAX_MESSAGE_LENGTH * 2),

  iv: z.string()
    .min(1)
    .max(64),

  // Supports both string IDs and null values
  replyToMessageId: z.string()
    .nullable()
    .optional(),
});

const messageDeleteSchema = z.object({
  messageId: z.string().min(1),
});

module.exports = {
  messageSendSchema,
  messageDeleteSchema,
};