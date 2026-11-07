/**
 * Headers that tell the API which visitor a relayed request is for, so its rate limits count visitors and not our web
 * app. They carry a shared secret, which the API requires before it believes the address. Without PROXY_SECRET nothing
 * is sent and the API falls back to what it can see itself.
 *
 * Behind Google's front end the last entry of X-Forwarded-For is the address that connected to it.
 */
export function clientAddressHeaders(
  incoming: Headers,
): Record<string, string> {
  const secret = process.env.PROXY_SECRET;
  const address = incoming
    .get("x-forwarded-for")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .at(-1);
  if (!secret || !address) return {};
  return {
    "x-dropboard-proxy-secret": secret,
    "x-dropboard-client-ip": address,
  };
}
