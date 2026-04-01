"use client";

import { CognitoUserPool, CognitoUser, AuthenticationDetails } from "amazon-cognito-identity-js";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { Eye, EyeOff } from "lucide-react";

const pool = new CognitoUserPool({
  UserPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
  ClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
});

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [domainError, setDomainError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const idToken = await new Promise<string>((resolve, reject) => {
        const user = new CognitoUser({ Username: email, Pool: pool });
        const authDetails = new AuthenticationDetails({ Username: email, Password: password });
        user.authenticateUser(authDetails, {
          onSuccess: (result) => resolve(result.getIdToken().getJwtToken()),
          onFailure: reject,
        });
      });

      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error || "ログインに失敗しました");
        return;
      }
      router.push(next);
    } catch (err: unknown) {
      const e = err as { message?: string };
      const msg = e.message ?? "";
      setError(
        msg.includes("Incorrect") || msg.includes("NotAuthorizedException")
          ? "メールアドレスまたはパスワードが正しくありません"
          : msg || "ログインに失敗しました"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-xl font-semibold text-gray-900 mb-6 text-center">ログイン</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
            メールアドレス
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              const val = e.target.value;
              setEmail(val);
              if (val.includes("@") && !val.endsWith("@salesforce.com")) {
                setDomainError("salesforce.com のメールアドレスのみ使用できます");
              } else {
                setDomainError("");
              }
            }}
            required
            className={`w-full h-10 px-3 rounded-xl border text-sm focus:outline-none bg-white transition-colors ${domainError ? "border-rose-300 focus:border-rose-400" : "border-gray-200 focus:border-gray-400"}`}
            placeholder="you@salesforce.com"
          />
          {domainError && <p className="text-xs text-rose-500 mt-1">{domainError}</p>}
        </div>
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
            パスワード
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full h-10 px-3 pr-10 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gray-400 bg-white"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        {error && <p className="text-xs text-rose-500">{error}</p>}
        <button
          type="submit"
          disabled={loading || !!domainError}
          className="w-full h-10 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {loading ? "処理中..." : "ログイン"}
        </button>
        <p className="text-xs text-center text-gray-400">
          アカウントをお持ちでない方は{" "}
          <a href="/sign-up" className="text-gray-700 font-medium hover:underline">新規登録</a>
        </p>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center px-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
