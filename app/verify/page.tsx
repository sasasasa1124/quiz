"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MailCheck, Loader2 } from "lucide-react";

export default function VerifyPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [resendMsg, setResendMsg] = useState("");

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, purpose: "verify" }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Invalid or expired code");
        return;
      }
      router.push("/");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResendMsg("");
    setError("");
    setResending(true);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "verify" }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to resend code");
        return;
      }
      setResendMsg("Code resent");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col items-center justify-center p-8">
      <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-sm w-full space-y-6 text-center">
        <MailCheck size={32} className="mx-auto text-gray-400" strokeWidth={1.5} />

        <div className="space-y-1">
          <h1 className="text-base font-semibold text-gray-900">Verify your email</h1>
          <p className="text-xs text-gray-500">
            We sent a 6-digit code to your email address. Enter it below to confirm your account.
          </p>
        </div>

        <form onSubmit={handleVerify} className="space-y-4 text-left">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Verification code</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              required
              autoFocus
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 bg-white tracking-widest text-center font-mono"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : "Verify email"}
          </button>
        </form>

        <div className="space-y-1">
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            {resending ? "Sending..." : "Resend code"}
          </button>
          {resendMsg && <p className="text-xs text-green-600">{resendMsg}</p>}
        </div>
      </div>
    </div>
  );
}
