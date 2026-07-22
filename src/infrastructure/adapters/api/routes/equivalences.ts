import { Router, Request, Response } from "express";
import { ManageEquivalencesUseCase } from "../../../../core/application/ManageEquivalencesUseCase";
import { MongooseEquivalenceRepository } from "../../persistence/MongooseEquivalenceRepository";
import { AuthRequest, authMiddleware } from "../middleware/auth";

const router = Router();
const equivRepo = new MongooseEquivalenceRepository();
const manageEquivalences = new ManageEquivalencesUseCase(equivRepo);

router.get("/", async (req: Request, res: Response) => {
  try {
    const equivalences = await manageEquivalences.getAllPublic();
    res.json(equivalences);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/properties", async (req: Request, res: Response) => {
  try {
    const equivalences = await manageEquivalences.getAllPublic();
    const properties = [...new Set(equivalences.map((e: { propertyId: string }) => e.propertyId))].sort();
    res.json(properties);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

function getParam(req: Request, name: string): string {
  const val = req.params[name];
  return Array.isArray(val) ? val[0] : val;
}

// Team-specific equivalences
router.get("/team/:teamId", authMiddleware, async (req: Request, res: Response) => {
  try {
    const equivalences = await manageEquivalences.getByTeam(getParam(req, "teamId"));
    res.json(equivalences);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.post("/team/:teamId", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { adTitle, propertyId } = req.body;
    if (!adTitle || !propertyId) {
      res.status(400).json({ error: "adTitle and propertyId are required" });
      return;
    }
    const equivalence = await manageEquivalences.createForTeam({ adTitle, propertyId }, getParam(req, "teamId"));
    res.status(201).json(equivalence);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

router.post("/team/:teamId/seed", authMiddleware, async (req: Request, res: Response) => {
  try {
    const created = await manageEquivalences.seedForTeam(getParam(req, "teamId"));
    res.status(201).json({ seeded: created.length, equivalences: created });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

router.post("/seed", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const created = await manageEquivalences.seed(authReq.userId!);
    res.status(201).json({ seeded: created.length, equivalences: created });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

router.post("/reseed", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const created = await manageEquivalences.reseed(authReq.userId!);
    res.json({ reseeded: created.length, equivalences: created });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

router.post("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { adTitle, propertyId } = req.body;
    if (!adTitle || !propertyId) {
      res.status(400).json({ error: "adTitle and propertyId are required" });
      return;
    }
    const equivalence = await manageEquivalences.create({ adTitle, propertyId }, authReq.userId!);
    res.status(201).json(equivalence);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

router.put("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { adTitle, propertyId } = req.body;
    const equivalence = await manageEquivalences.update(getParam(req, "id"), { adTitle, propertyId });
    if (!equivalence) {
      res.status(404).json({ error: "Equivalence not found" });
      return;
    }
    res.json(equivalence);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

router.delete("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const deleted = await manageEquivalences.delete(getParam(req, "id"));
    if (!deleted) {
      res.status(404).json({ error: "Equivalence not found" });
      return;
    }
    res.status(204).send();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
