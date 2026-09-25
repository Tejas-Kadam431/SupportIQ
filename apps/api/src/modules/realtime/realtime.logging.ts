export function logRealtimeFailure(operation: "join" | "leave" | "delivery" | "notification") {
  // Never serialize errors, handshake data, JWTs, message bodies or DB strings.
  console.error({ event: "realtime.operation_failed", operation });
}
