"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/services/authService";
import { User } from "@/types";
import { Loader2 } from "lucide-react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (parent: HTMLElement, options: any) => void;
          prompt: (notification?: any) => void;
        };
      };
    };
  }
}

interface GoogleSignInButtonProps {
  returnTo?: string;
  mode?: "signin" | "signup";
  onSuccess?: (user: User) => void;
  onError?: (errorMessage: string) => void;
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  returnTo = "/",
  mode = "signin",
  onSuccess,
  onError,
}) => {
  const router = useRouter();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGisReady, setIsGisReady] = useState(false);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

  useEffect(() => {
    if (!clientId) {
      return;
    }

    const scriptId = "google-identity-services-script";

    const initGis = () => {
      if (typeof window === "undefined" || !window.google?.accounts?.id || !buttonRef.current) {
        return;
      }

      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse,
          cancel_on_tap_outside: true,
          auto_select: false,
        });

        // Clear existing children before rendering button
        if (buttonRef.current) {
          buttonRef.current.innerHTML = "";
          window.google.accounts.id.renderButton(buttonRef.current, {
            theme: "outline",
            size: "large",
            width: "100%",
            text: mode === "signup" ? "signup_with" : "signin_with",
            shape: "pill",
            logo_alignment: "left",
          });
        }

        setIsGisReady(true);
      } catch (err: any) {
        console.error("[GoogleSignIn] Initialization failed:", err);
      }
    };

    if (window.google?.accounts?.id) {
      initGis();
      return;
    }

    let existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => {
        initGis();
      };
      script.onerror = () => {
        setErrorMessage("Failed to load Google Sign-In SDK. Please refresh the page.");
        onError?.("Failed to load Google Sign-In SDK.");
      };
      document.body.appendChild(script);
    } else {
      existingScript.addEventListener("load", initGis);
      return () => {
        existingScript?.removeEventListener("load", initGis);
      };
    }
  }, [clientId, mode]);

  const handleCredentialResponse = async (response: any) => {
    if (!response || !response.credential) {
      const msg = "No credential received from Google.";
      setErrorMessage(msg);
      onError?.(msg);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const authResult = await authService.googleLogin(response.credential);
      if (onSuccess) {
        onSuccess(authResult.user);
      }

      // Hard redirect or client navigate to destination to ensure cookie and header propagation
      const targetUrl = returnTo && returnTo.startsWith("/") ? returnTo : "/";
      window.location.href = targetUrl;
    } catch (err: any) {
      setIsLoading(false);
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Google authentication failed. Please try again.";
      setErrorMessage(msg);
      onError?.(msg);
    }
  };

  if (!clientId) {
    return null;
  }

  return (
    <div className="w-full space-y-2">
      {errorMessage && (
        <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
          {errorMessage}
        </div>
      )}

      {isLoading ? (
        <div className="w-full py-3 rounded-full border border-[#E5DFC5] bg-[#F7F3EA] flex items-center justify-center gap-2 text-xs font-semibold text-[#354B35]">
          <Loader2 className="w-4 h-4 animate-spin text-[#B99A60]" />
          <span>Signing in with Google...</span>
        </div>
      ) : (
        <div className="w-full flex justify-center">
          <div ref={buttonRef} className="w-full flex justify-center min-h-[44px]" />
        </div>
      )}
    </div>
  );
};
