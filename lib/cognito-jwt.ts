import { createLocalJWKSet, jwtVerify, type JWTPayload } from "jose";
import jwksData from "./cognito-jwks.json";

const JWKS = createLocalJWKSet(jwksData as Parameters<typeof createLocalJWKSet>[0]);

const REGION = process.env.NEXT_PUBLIC_COGNITO_REGION ?? "us-west-2";
const POOL_ID = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!;
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!;

export async function verifyIdToken(token: string): Promise<JWTPayload & { email: string }> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://cognito-idp.${REGION}.amazonaws.com/${POOL_ID}`,
    audience: CLIENT_ID,
  });
  const email = payload["email"] as string;
  if (!email) throw new Error("No email in token");
  return { ...payload, email };
}
