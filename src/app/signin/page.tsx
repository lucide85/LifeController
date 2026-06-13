import { redirect } from "next/navigation";
import { Boxes } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-guard";
import { GoogleSignInButton } from "@/components/google-signin-button";

export default async function SignInPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect(user.status === "approved" ? "/" : "/pending");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center p-6">
      <div className="aurora-bg" />
      <div className="glass w-full max-w-md rounded-2xl p-8 animate-fade-in">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="brand-gradient mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-xl shadow-primary/40">
            <Boxes className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-gradient">LifeController</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your single source of truth for everything you own and care about.
          </p>
        </div>

        <GoogleSignInButton />

        <p className="mt-6 text-center text-xs text-muted-foreground">
          New accounts require admin approval before access is granted.
        </p>
      </div>
    </div>
  );
}
