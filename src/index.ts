import express, { Request, Response } from "express";
import cors from "cors";
import { env } from "./config/env";
import { connectDatabase } from "./config/database";
import { seedAdmin, migrateTeams } from "./config/seedAdmin";
import { MongooseUserRepository } from "./infrastructure/adapters/persistence/MongooseUserRepository";
import authRoutes from "./infrastructure/adapters/api/routes/auth";
import equivalenceRoutes from "./infrastructure/adapters/api/routes/equivalences";
import downloadRoutes from "./infrastructure/adapters/api/routes/downloads";
import teamRoutes from "./infrastructure/adapters/api/routes/teams";
import csvRoutes from "./infrastructure/adapters/api/routes/csv";
import taskRoutes from "./infrastructure/adapters/api/routes/tasks";
import userRoutes from "./infrastructure/adapters/api/routes/users";

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

async function start() {
  await connectDatabase();
  const userRepo = new MongooseUserRepository();
  await migrateTeams();
  await seedAdmin(userRepo);
  app.listen(env.PORT, () => {
    console.log(`Backend running on http://localhost:${env.PORT}`);
  });
}

start();
