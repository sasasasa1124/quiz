import { ShieldX } from "lucide-react";
import { getUserEmail } from "@/lib/user";

export const runtime = "edge";

export default async function UnauthorizedPage() {
  const email = await getUserEmail();
  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col items-center justify-center p-8">
      <div className="bg-white rounded-2xl border border-gray-200 p-10 max-w-sm w-full text-center space-y-4">
        <ShieldX size={32} className="mx-auto text-red-400" strokeWidth={1.5} />
        <h1 className="text-base font-semibold text-gray-900">Access Restricted</h1>
        <p className="text-sm text-gray-500">
          This app is available to{" "}
          <span className="font-medium text-gray-700">@salesforce.com</span> accounts only.
        </p>
        <p className="text-xs text-gray-400 font-mono">{email}</p>
      </div>
    </div>
  );
}
