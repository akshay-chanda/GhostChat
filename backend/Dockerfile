# Debian-slim, not alpine: argon2's native bindings compile against
# glibc, and musl (alpine's libc) is a well-known source of subtle
# argon2 build/runtime issues. Slim avoids that class of problem
# entirely at a modest image-size cost.
FROM node:18-bookworm-slim

WORKDIR /app

# Separate dependency install from source copy so Docker's layer
# cache is only invalidated by a package.json change, not by every
# source edit.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Uploaded ciphertext lives here transiently — see uploads/.gitkeep.
# Not declared as a VOLUME: this app's privacy model is "nothing
# outlives the room," and a named volume would quietly survive
# container restarts, working against that.
RUN mkdir -p /app/uploads

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
