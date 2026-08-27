import type { Instrumentation } from "next";

// Auto-capture every uncaught server-side request error (server components,
// route handlers, server actions) so a guest-app 500 is never invisible.
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const { captureError } = await import("@/lib/observability");
  captureError(error, {
    source: `request:${request.path}`,
    method: request.method,
    routeType: context.routeType,
    routePath: context.routePath,
  });
};
