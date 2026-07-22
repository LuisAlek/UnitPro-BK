import { Router, Request, Response } from "express";
import { MongooseUserRepository } from "../../persistence/MongooseUserRepository";
import { MongooseTaskRepository } from "../../persistence/MongooseTaskRepository";
import { AuthRequest, authMiddleware } from "../middleware/auth";

const router = Router();
const userRepo = new MongooseUserRepository();
const taskRepo = new MongooseTaskRepository();

router.get("/batch", authMiddleware, async (req: Request, res: Response) => {
  try {
    const idsParam = req.query.ids as string;
    if (!idsParam) { res.json([]); return; }
    const ids = idsParam.split(",").filter(Boolean);
    const users = await userRepo.findByIds(ids);
    res.json(users.map((u) => ({ id: u.id, name: u.name, email: u.email, teamIds: u.teamIds })));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/search", authMiddleware, async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string;
    if (!q || q.length < 2) { res.json({ users: [], teams: [] }); return; }
    const users = await userRepo.searchUsers(q);
    const { TeamModel } = require("../../persistence/models/TeamModel");
    const teamDocs = await TeamModel.find({ name: { $regex: q, $options: "i" } }).limit(20);
    const teams = teamDocs.map((t: any) => ({ id: t._id.toString(), name: t.name, memberCount: t.memberIds.length, isPublic: t.isPublic }));
    res.json({
      users: users.map((u) => ({ id: u.id, name: u.name, email: u.email })),
      teams,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/:id/stats", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.params.id as string;
    const user = await userRepo.findById(userId);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    const allTasks = await taskRepo.findAllByUser(userId);
    const completedTasks = allTasks.filter((t) => t.status === "done").length;
    const totalTasks = allTasks.length;
    const { TeamModel } = require("../../persistence/models/TeamModel");
    const teamDocs = await TeamModel.find({ memberIds: userId });
    const teams = teamDocs.map((t: any) => ({
      id: t._id.toString(),
      name: t.name,
      joinedAt: t.createdAt,
      memberCount: t.memberIds.length,
      createdBy: t.createdBy,
    }));
    const achievements: string[] = [];
    if (teams.length >= 1) achievements.push("Encontré una familia!");
    if (teams.length >= 3) achievements.push("Colaborador");
    if (completedTasks >= 1) achievements.push("Primera tarea completada");
    if (completedTasks >= 10) achievements.push("Task Master");
    res.json({
      user: { id: user.id, name: user.name, email: user.email, teamIds: user.teamIds },
      stats: { completedTasks, totalTasks, teamsCount: teams.length },
      teams,
      achievements,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
