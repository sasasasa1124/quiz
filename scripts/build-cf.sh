#!/bin/sh
# Cloudflare Pages build script.
# 1. Create .vercel/project.json stub so vercel build works without credentials.
# 2. Run vercel build (calls npm run build internally).
# 3. Delete local-dev-only API routes from Vercel output AFTER vercel rebuilds them.
# 4. Run @cloudflare/next-on-pages --skip-build to process the cleaned output.

set -e

mkdir -p .vercel
if [ ! -f .vercel/project.json ]; then
  echo '{"projectId":"_","orgId":"_","settings":{"framework":"nextjs"}}' > .vercel/project.json
fi

npx vercel build

rm -rf \
  .vercel/output/functions/api/local-exams.func \
  .vercel/output/functions/api/local-exams.rsc.func \
  .vercel/output/functions/api/local-questions

npx @cloudflare/next-on-pages --skip-build
