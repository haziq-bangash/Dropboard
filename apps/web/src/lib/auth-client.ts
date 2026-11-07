import { createAuthClient } from "better-auth/react";

// Same-origin: requests go to /api/auth/* and are proxied to the API.
export const authClient = createAuthClient();
