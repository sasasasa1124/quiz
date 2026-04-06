# AWS Deployment Guide

Cloudflare Pages (static/edge) in parallel with AWS App Runner (SSR/API).

---

## Architecture

| Component | AWS Service | Details |
|-----------|-------------|---------|
| App hosting | **App Runner** | Container-based, auto-scaling, managed TLS |
| Database | **RDS PostgreSQL 16** | db.t3.micro, us-west-2 |
| Image registry | **ECR** | 435788423370.dkr.ecr.us-west-2.amazonaws.com/scholion |
| Secrets | **Secrets Manager** | scholion/* prefix |
| CI/CD auth | **IAM OIDC** | GitHub Actions → AWS keyless auth |
| Networking | **VPC Connector** | App Runner → RDS via private VPC |

---

## Resources (us-west-2)

```
Account ID:      435788423370
ECR repo:        435788423370.dkr.ecr.us-west-2.amazonaws.com/scholion
App Runner:      scholion (service name)
RDS endpoint:    scholion-db.cv4wewu84c84.us-west-2.rds.amazonaws.com:5432
DB name:         scholion
DB user:         scholion_admin
IAM role (GHA):  arn:aws:iam::435788423370:role/scholion-github-actions
IAM role (AR):   arn:aws:iam::435788423370:role/scholion-apprunner-role
VPC:             vpc-0b1cdfc949b389fd0 (172.31.0.0/16)
VPC Connector:   arn:aws:apprunner:us-west-2:435788423370:vpcconnector/scholion-vpc-connector/1/3941f5c2c1cc44c48ac2194d40b40dc5
SG (RDS):        sg-01d59f5010d7dd2d2
SG (AppRunner):  sg-0bdb0509923aa1138
```

---

## Secrets Manager entries

| Secret name | App env var |
|-------------|-------------|
| `scholion/GEMINI_API_KEY` | `GEMINI_API_KEY` |
| `scholion/CLERK_SECRET_KEY` | `CLERK_SECRET_KEY` |
| `scholion/DATABASE_URL` | `DATABASE_URL` |
| `scholion/GITHUB_TOKEN` | `APP_GITHUB_TOKEN` |
| `scholion/GITHUB_OWNER` | (plain env var) |
| `scholion/GITHUB_REPO` | (plain env var) |

---

## Deployment

Push `main` to the `deploy/aws` branch to trigger GitHub Actions:

```bash
git push origin main:deploy/aws
```

The workflow (`.github/workflows/deploy-aws.yml`) will:
1. Authenticate to AWS via GitHub OIDC (no stored credentials)
2. Build Docker image and push to ECR
3. Create or update App Runner service
4. Wait for deployment to complete and print the service URL

---

## GitHub Secrets (kota-sasamoto_sfemu/scholion)

| Secret | Purpose |
|--------|---------|
| `AWS_ROLE_ARN` | IAM role for OIDC (`arn:aws:iam::435788423370:role/scholion-github-actions`) |
| `AWS_REGION` | `us-west-2` |
| `AWS_ECR_REGISTRY` | `435788423370.dkr.ecr.us-west-2.amazonaws.com` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (build arg) |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `DATABASE_URL` | RDS connection string |
| `APP_GITHUB_TOKEN` | GitHub PAT for issue/feedback API |

---

## Database

RDS PostgreSQL 16 on db.t3.micro. Not publicly accessible — App Runner connects via VPC connector.

> **Note**: The app's `lib/db.ts` currently uses Cloudflare D1 (SQLite). For full database persistence on AWS, `lib/db.ts` needs a PostgreSQL path that activates when `DATABASE_URL` is set. Without this migration, the app falls back to CSV data only.

### To migrate db.ts to PostgreSQL

1. Add PostgreSQL schema: `lib/schema.pg.ts` using `pgTable` from `drizzle-orm/pg-core`
2. Update `getDrizzle()` in `lib/db.ts` to conditionally use `drizzle-orm/postgres-js` when `DATABASE_URL` is set
3. Run `npm run db:migrate` to apply migrations to RDS
4. Seed initial exam data

---

## Cost estimate (monthly)

| Service | Cost |
|---------|------|
| App Runner (1 vCPU / 2 GB, ~$0.064/vCPU-hr) | ~$10–20 |
| RDS db.t3.micro | ~$13 |
| ECR storage | ~$0.10 |
| Secrets Manager | ~$0.50 |
| **Total** | **~$25–35/month** |
