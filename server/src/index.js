import app from "./app.js";
import { initializeDatabase } from "./db/database.js";

const port = 3002;

initializeDatabase();

app.listen(port, "127.0.0.1", () => {
  console.log(`Dental server running at http://127.0.0.1:${port}`);
});
