import { redirect } from "next/navigation";
import { Clock, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-guard";
import { SignOutButton } from "@/components/sign-out-button";
import { RedeemAdminCode } from "@/components/redeem-admin-code";

export default async function PendingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  if (user.status === "approved") redirect("/");

  const rejected = user.status === "rejected";

  return (
    <div className="relative flex min-h-screen items-center justify-center p-6">
      <div className="aurora-bg" />
      <div className="glass w-full max-w-md rounded-2xl p-8 text-center animate-fade-in">
        <div
          className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-xl ${
            rejected ? "bg-destructive" : "brand-gradient"
          }`}
        >
          {rejected ? <ShieldCheck className="h-7 w-7" /> : <Clock className="h-7 w-7" />}
        </div>
        <h1 className="text-xl font-bold">
          {rejected ? "Access not granted" : "Waiting for approval"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {rejected
            ? "An administrator has not granted you access to this library."
            : `You're signed in as ${user.email}. An administrator needs to approve your account before you can use LifeController.`}
        </p>

        <div className="mt-6">
          <RedeemAdminCode />
        </div>

        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
