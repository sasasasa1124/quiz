"use client";

import { useSignUp } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState, Suspense } from "react";
import { Eye, EyeOff } from "lucide-react";

const DOMAIN = "salesforce.com";

function SignUpForm() {
  const { signUp, setActive, isLoaded } = useSignUp();
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
    if (!isLoaded || !signUp) return;
    if (!username.trim()) { setError("Username is required"); return; }
    setError("");
    setLoading(true);
    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setStep("verify");
    } catch (err: unknown) {
      const clerkError = err as { errors?: { message: string }[] };
      setError(clerkError.errors?.[0]?.message || "Sign-up failed");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;
    setError("");
    setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push("/");
      }
    } catch (err: unknown) {
      const clerkError = err as { errors?: { message: string }[] };
      setError(clerkError.errors?.[0]?.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  if (step === "verify") {
    return (
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-gray-900 mb-2 text-center">Check your email</h1>
        <p className="text-sm text-gray-400 text-center mb-6">
          We sent a code to <span className="font-medium text-gray-700">{email}</span>
        </p>
        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
              Verification code
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
          <button
            type="submit"
            disabled={loading || !isLoaded}
            className="w-full h-10 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Verify"}
          </button>
          <button
            type="button"
            onClick={() => { setStep("form"); setError(""); setCode(""); }}
            className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Back
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-xl font-semibold text-gray-900 mb-6 text-center">Create account</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
            Salesforce email
          </label>
          <div className="flex h-10 rounded-xl border border-gray-200 bg-white overflow-hidden focus-within:border-gray-400">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/@.*/g, ""))}
              required
              autoComplete="username"
              className="flex-1 min-w-0 px-3 text-sm focus:outline-none bg-transparent"
              placeholder="yourname"
            />
            <span className="flex items-center pr-3 text-sm text-gray-400 select-none shrink-0">
              @{DOMAIN}
            </span>
          </div>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
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
          disabled={loading || !isLoaded}
          className="w-full h-10 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Create account"}
        </button>
        <p className="text-xs text-center text-gray-400">
          Already have an account?{" "}
          <a href="/login" className="text-gray-700 font-medium hover:underline">Log in</a>
        </p>
      </form>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center px-4">
      <Suspense>
        <SignUpForm />
      </Suspense>
    </div>
  );
}
