import { handle } from "hono/vercel";
import { app } from "./_lib/app.js";

export default handle(app);
