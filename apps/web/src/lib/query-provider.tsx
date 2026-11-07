"use client";

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "./projects";

/** A session that has expired shows up as a 401 from any request: send the person to sign in once, from one place. */
function onUnauthorized(error: unknown) {
  if (
    error instanceof ApiError &&
    error.status === 401 &&
    typeof window !== "undefined" &&
    window.location.pathname !== "/login"
  ) {
    window.location.assign("/login");
  }
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: onUnauthorized }),
        mutationCache: new MutationCache({ onError: onUnauthorized }),
        defaultOptions: {
          queries: {
            // a wrong answer (404, 401, 402) will not fix itself on a retry
            retry: (count, error) =>
              !(error instanceof ApiError && error.status < 500) && count < 2,
            staleTime: 30_000,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
