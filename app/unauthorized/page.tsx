"use client";

import { ShieldX } from "lucide-react";
import { useClerk, useUser } from "@clerk/nextjs";

export default function UnauthorizedPage() {
  const { signOut } = useClerk();
  const { user } = useUser();
  const email = user?.emailAddresses[0]?.emailAddress ?? "";

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col items-center justify-center p-8">
      <div className="bg-white rounded-2xl border border-gray-200 p-10 max-w-sm w-full text-center space-y-4">
        <ShieldX size={32} className="mx-auto text-red-400" strokeWidth={1.5} />
        <h1 className="text-base font-semibold text-gray-900">Access Restricted</h1>
        <p className="text-sm text-gray-500">
          This app is available to{" "}
          <span className="font-medium text-gray-700">@salesforce.com</span> accounts only.
        </p>
        {email && <p className="text-xs text-gray-400 font-mono">{email}</p>}
        <a
          href="/"
          className="block w-full h-10 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors flex items-center justify-center"
        >
          ホームに戻る
        </a>
        <button
          onClick={() => signOut({ redirectUrl: "/login" })}
          className="w-full h-10 rounded-xl border border-gray-200 text-gray-500 text-sm hover:bg-gray-50 transition-colors"
        >
          別のアカウントでログイン
        </button>
      </div>
    </div>
  );
}
