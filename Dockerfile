FROM public.ecr.aws/docker/library/node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_COGNITO_USER_POOL_ID
ARG NEXT_PUBLIC_COGNITO_CLIENT_ID
ARG NEXT_PUBLIC_COGNITO_REGION=us-west-2
ENV NEXT_PUBLIC_COGNITO_USER_POOL_ID=$NEXT_PUBLIC_COGNITO_USER_POOL_ID
ENV NEXT_PUBLIC_COGNITO_CLIENT_ID=$NEXT_PUBLIC_COGNITO_CLIENT_ID
ENV NEXT_PUBLIC_COGNITO_REGION=$NEXT_PUBLIC_COGNITO_REGION
# Strip Edge runtime declarations — App Runner runs Node.js (not Cloudflare Workers).
# Cloudflare uses a separate build pipeline (npm run build:cf) so this doesn't affect it.
RUN grep -rl "export const runtime = 'edge'" app/ | xargs sed -i "s/export const runtime = 'edge';//g" || true
RUN npm run build

FROM public.ecr.aws/docker/library/node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/scripts/migrate-pg.js ./scripts/migrate-pg.js
COPY --from=builder /app/migrations/drizzle/ ./migrations/drizzle/
EXPOSE 3000
# Run DB migrations (idempotent) then start the app
CMD ["sh", "-c", "node scripts/migrate-pg.js && npm start"]
