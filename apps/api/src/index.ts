import { serve } from "@hono/node-server";
import { app } from "./app";

const port = Number(process.env.PORT ?? 8080); // Cloud Run injects PORT
const server = serve({ fetch: app.fetch, port }, () => console.log(`api listening on :${port}`));

// Cloud Run sends SIGTERM on scale-down
process.on("SIGTERM", () => server.close());
