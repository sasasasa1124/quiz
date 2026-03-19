import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center">
      <SignIn />
    </div>
  );
}
