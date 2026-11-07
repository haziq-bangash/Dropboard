import { clientAddressHeaders } from "@/lib/forward";

// TEMPORARY: shows what this server receives about the caller, to settle how visitor addresses arrive on Cloud Run.
// It returns only the caller's own request details and no configuration values. Removed right after use.
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  return Response.json({
    proxySecretConfigured: Boolean(process.env.PROXY_SECRET),
    forwardedFor: forwarded,
    forwardedForEntries: forwarded ? forwarded.split(",").length : 0,
    wouldSendTrustedHeaders: Object.keys(clientAddressHeaders(req.headers)).length > 0,
  });
}
