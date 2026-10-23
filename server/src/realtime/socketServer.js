import { FINANCE_CHANGED_EVENT, registerFinanceBroadcaster } from "./financeEvents.js";

const allowedOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
const allowedOriginSet = new Set(allowedOrigins);

/**
 * Attach Socket.IO to the existing Express HTTP server.
 * Keep the local demo usable before its Socket.IO dependency is installed.
 */
export async function attachRealtimeServer(httpServer) {
  let SocketIOServer;
  try {
    ({ Server: SocketIOServer } = await import("socket.io"));
  } catch (error) {
    if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
    console.warn("[realtime] Socket.IO is not installed. Run npm install to enable live balance updates.");
    return null;
  }

  const io = new SocketIOServer(httpServer, {
    cors: { origin: allowedOrigins, methods: ["GET", "POST"] },
    allowRequest(request, done) {
      // This is a local interview demo without authenticated staff roles.
      // A production multi-user version must authenticate each connection.
      const origin = request.headers.origin;
      done(null, !origin || allowedOriginSet.has(origin));
    }
  });
  registerFinanceBroadcaster((event) => io.emit(FINANCE_CHANGED_EVENT, event));
  return io;
}
