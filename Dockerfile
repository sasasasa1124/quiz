FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/scripts/migrate-pg.js ./scripts/migrate-pg.js
COPY --from=builder /app/migrations/drizzle/0000_init_complete.sql ./migrations/drizzle/0000_init_complete.sql
EXPOSE 3000
# Run DB migrations (idempotent) then start the app
CMD ["sh", "-c", "node scripts/migrate-pg.js && npm start"]
