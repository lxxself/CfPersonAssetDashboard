import { app } from "./routes";
import { refreshExchangeRates } from "./exchange";
import type { Bindings } from "./types";

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(
      refreshExchangeRates(env, event.scheduledTime).catch((error) => {
        console.warn(
          JSON.stringify({
            event: "exchange_rates_refresh_failed",
            scheduled_time: new Date(event.scheduledTime).toISOString(),
            message: error instanceof Error ? error.message : String(error)
          })
        );
      })
    );
  }
};
