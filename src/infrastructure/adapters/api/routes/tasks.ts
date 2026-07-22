import { Router, Request, Response } from "express";
import { TaskUseCase } from "../../../../core/application/TaskUseCase";
import { MongooseTaskRepository } from "../../persistence/MongooseTaskRepository";
import { MongooseTeamRepository } from "../../persistence/MongooseTeamRepository";
import { AuthRequest, authMiddleware } from "../middleware/auth";

const router = Router();
const taskRepo = new MongooseTaskRepository();
const teamRepo = new MongooseTeamRepository();
const taskUseCase = new TaskUseCase(taskRepo, teamRepo);

function getParam(req: Request, name: string): string {
  const val = req.params[name];
  return Array.isArray(val) ? val[0] : val;
}

// Personal tasks
router.get("/personal", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const tasks = await taskUseCase.getPersonalTasks(authReq.userId!);
    res.json(tasks);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.post("/personal", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { title, description, status } = req.body;
    if (!title) { res.status(400).json({ error: "Title is required" }); return; }
    const task = await taskUseCase.createPersonal({ title, description, status }, authReq.userId!);
    res.status(201).json(task);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

// Team tasks
router.get("/team/:teamId", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const tasks = await taskUseCase.getTeamTasks(getParam(req, "teamId"), authReq.userId!);
    res.json(tasks);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.post("/team/:teamId", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { title, description, status, assignedTo, isPrivate } = req.body;
    if (!title) { res.status(400).json({ error: "Title is required" }); return; }
    const task = await taskUseCase.createForTeam({ title, description, status, assignedTo, isPrivate }, getParam(req, "teamId"), authReq.userId!);
    res.status(201).json(task);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

// Generic task operations
router.put("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { title, description, status, assignedTo, isPrivate } = req.body;
    const task = await taskUseCase.update(getParam(req, "id"), { title, description, status, assignedTo, isPrivate });
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }
    res.json(task);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

router.patch("/:id/status", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    if (!["pending", "in-progress", "done"].includes(status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }
    const task = await taskUseCase.updateStatus(getParam(req, "id"), status);
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }
    res.json(task);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

router.delete("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const deleted = await taskUseCase.delete(getParam(req, "id"));
    if (!deleted) { res.status(404).json({ error: "Task not found" }); return; }
    res.status(204).send();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
