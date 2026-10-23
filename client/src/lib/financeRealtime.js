// Load the Socket.IO browser client served by the local backend itself.
// This avoids introducing a second frontend package for the presentation demo.
const backend = "http://127.0.0.1:3002";
let clientScriptPromise;

function loadClient() {
  if (window.io) return Promise.resolve(window.io);
  if (clientScriptPromise) return clientScriptPromise;
  clientScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${backend}/socket.io/socket.io.js`;
    script.async = true;
    script.onload = () => window.io ? resolve(window.io) : reject(new Error("Socket.IO client unavailable"));
    script.onerror = () => reject(new Error("Socket.IO server unavailable"));
    document.head.appendChild(script);
  }).catch((error) => {
    clientScriptPromise = null;
    throw error;
  });
  return clientScriptPromise;
}

// Notify clients to refetch from the API; no payment or patient data goes over the socket.
export async function subscribeToFinanceChanges(onChange) {
  const connect = await loadClient();
  const socket = connect(backend, { transports: ["websocket", "polling"], reconnection: true });
  socket.on("finance:changed", onChange);
  socket.on("connect", onChange);
  return () => socket.disconnect();
}
