"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUserProfile } from "@/hooks/useQueries";
import { buildLoginUrl } from "@/lib/authRedirect";

export default function AddressesRedirectPage() {
  const router = useRouter();
  const { data: user, isLoading: isUserLoading } = useUserProfile();

  useEffect(() => {
    if (!isUserLoading) {
      if (!user) {
        router.replace(buildLoginUrl("/addresses"));
      } else {
        router.replace("/account?tab=addresses");
      }
    }
  }, [isUserLoading, user, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F3EA] text-xs text-[#6B776A]">
      Loading your delivery addresses...
    </div>
  );
}

