import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/msg91-token
 *
 * Secure server-side configuration endpoint that reads NEXT_MSG91_TOKEN_AUTH
 * from server environment variables and delivers it exclusively to the customer
 * registration widget flow.
 *
 * Security:
 * - Reads server-only NEXT_MSG91_TOKEN_AUTH (never relies on NEXT_PUBLIC_ exposure)
 * - Never exposes backend MSG91_AUTH_KEY
 * - Sets no-store cache headers to prevent intermediate caching
 */
export async function GET() {
  const tokenAuth = (process.env.NEXT_MSG91_TOKEN_AUTH || "").trim();
  const widgetId = (process.env.NEXT_PUBLIC_MSG91_WIDGET_ID || "366b746e3258343539303835").trim();

  if (!tokenAuth) {
    return NextResponse.json(
      {
        success: false,
        message: "MSG91 OTP widget token is not configured on the server.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, max-age=0, must-revalidate",
        },
      }
    );
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        tokenAuth,
        widgetId,
      },
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    }
  );
}
