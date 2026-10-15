import { Router, type IRouter } from "express";
import healthRouter from "./health.ts";
import vaultRouter from "./vault.ts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(vaultRouter);

export default router;
