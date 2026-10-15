import { Router, type IRouter } from "express";
import healthRouter from "./health";
import vaultRouter from "./vault";

const router: IRouter = Router();

router.use(healthRouter);
router.use(vaultRouter);

export default router;
