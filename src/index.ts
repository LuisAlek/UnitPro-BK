import express, { Request, Response } from "express";
import cors from "cors";
import { env } from "./config/env";
import { connectDatabase } from "./config/database";
import { migrateTeams } from "./config/seedAdmin";
import authRoutes from "./infrastructure/adapters/api/routes/auth";
import equivalenceRoutes from "./infrastructure/adapters/api/routes/equivalences";
import downloadRoutes from "./infrastructure/adapters/api/routes/downloads";
import teamRoutes from "./infrastructure/adapters/api/routes/teams";
import csvRoutes from "./infrastructure/adapters/api/routes/csv";
import taskRoutes from "./infrastructure/adapters/api/routes/tasks";
import userRoutes from "./infrastructure/adapters/api/routes/users";
import quickbooksRoutes from "./infrastructure/adapters/api/routes/quickbooks";

const app = express();

app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "50mb" }));

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/equivalences", equivalenceRoutes);
app.use("/api/downloads", downloadRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/csv", csvRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/users", userRoutes);
app.use("/api/quickbooks", quickbooksRoutes);

async function start() {
  await connectDatabase();
  await migrateTeams();
  app.listen(env.PORT, () => {
    console.log(`Backend running on http://localhost:${env.PORT}`);
  });
}

start();
