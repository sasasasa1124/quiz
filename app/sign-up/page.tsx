"use client";

import { CognitoUserPool, CognitoUser, CognitoUserAttribute, AuthenticationDetails } from "amazon-cognito-identity-js";
import { useRouter } from "next/navigation";
import { useState, Suspense } from "react";
import { Eye, EyeOff } from "lucide-react";

const DOMAIN = "salesforce.com";
const pool = new CognitoUserPool({
  UserPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
  ClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
});

function SignUpForm() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "verify">("form");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const email = `${username.trim()}@${DOMAIN}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) { setError("ユーザー名を入力してください"); return; }
    setError("");
    setLoading(true);
    try {
      await new Promise<void>((resolve, reject) => {
        const attrs = [new CognitoUserAttribute({ Name: "email", Value: email })];
        pool.signUp(email, password, attrs, [], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      setStep("verify");
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || "登録に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Confirm registration
      await new Promise<void>((resolve, reject) => {
        const user = new CognitoUser({ Username: email, Pool: pool });
        user.confirmRegistration(code, true, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Auto-login after verification
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
      if (!res.ok) throw new Error("セッション作成に失敗しました");
      router.push("/");
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || "確認に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  if (step === "verify") {
    return (
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-gray-900 mb-2 text-center">メール確認</h1>
        <p className="text-sm text-gray-400 text-center mb-6">
          確認コードを <span className="font-medium text-gray-700">{email}</span> に送信しました
        </p>
        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
              確認コード
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoComplete="one-time-code"
              inputMode="numeric"
              className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gray-400 bg-white tracking-widest text-center"
              placeholder="123456"
            />
          </div>
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full h-10 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-50">
            {loading ? "確認中..." : "確認する"}
          </button>
          <button type="button" onClick={() => { setStep("form"); setError(""); setCode(""); }}
            className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors">
            戻る
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-xl font-semibold text-gray-900 mb-6 text-center">新規登録</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
            メールアドレス
          </label>
          <div className="flex h-10 rounded-xl border border-gray-200 bg-white overflow-hidden focus-within:border-gray-400">
            <input type="text" value={username}
              onChange={(e) => setUsername(e.target.value.replace(/@.*/g, ""))}
              required autoComplete="username"
              className="flex-1 min-w-0 px-3 text-sm focus:outline-none bg-transparent"
              placeholder="yourname" />
            <span className="flex items-center pr-3 text-sm text-gray-400 select-none shrink-0">@{DOMAIN}</span>
          </div>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
            パスワード
          </label>
          <div className="relative">
            <input type={showPassword ? "text" : "password"} value={password}
              onChange={(e) => setPassword(e.target.value)}
              required autoComplete="new-password"
              className="w-full h-10 px-3 pr-10 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gray-400 bg-white" />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        {error && <p className="text-xs text-rose-500">{error}</p>}
        <button type="submit" disabled={loading}
          className="w-full h-10 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-50">
          {loading ? "登録中..." : "アカウント作成"}
        </button>
        <p className="text-xs text-center text-gray-400">
          すでにアカウントをお持ちの方は{" "}
          <a href="/login" className="text-gray-700 font-medium hover:underline">ログイン</a>
        </p>
      </form>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center px-4">
      <Suspense><SignUpForm /></Suspense>
    </div>
  );
}
