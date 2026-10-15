import { Router, type IRouter, type RequestHandler, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { ObjectId } from "mongodb";
import { getMongoDb } from "../lib/mongo.ts";

type VaultPayload = {
  version: 1;
  algorithm: "AES-256-GCM";
  kdf: "PBKDF2-SHA-256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  kind: "text" | "image";
  mimeType?: string;
  fileName?: string;
};

type VaultItemInput = {
  name: string;
  kind: "text" | "image";
  mimeType?: string;
  fileSize?: number;
  payload: VaultPayload;
};

type VaultDocument = VaultItemInput & {
  userId: string;
  createdAt: Date;
  updatedAt: Date;
};

const router: IRouter = Router();

const requireAuth: RequestHandler = (req: Request, res: Response, next: Function) => {
  const auth = getAuth(req);
  const userId = auth.userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to use saved vault history." });
    return;
  }
  res.locals.userId = userId;
  next();
};

function isPayload(value: unknown): value is VaultPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<VaultPayload>;
  return (
    payload.version === 1 &&
    payload.algorithm === "AES-256-GCM" &&
    payload.kdf === "PBKDF2-SHA-256" &&
    typeof payload.iterations === "number" &&
    payload.iterations > 0 &&
    typeof payload.salt === "string" &&
    typeof payload.iv === "string" &&
    typeof payload.ciphertext === "string" &&
    (payload.kind === "text" || payload.kind === "image")
  );
}

router.get("/vault/items", requireAuth, async (req: Request, res: Response) => {
  try {
    const db = await getMongoDb();
    const items = await db
      .collection<VaultDocument>("vault_items")
      .find({ userId: res.locals.userId })
      .project({
        payload: 0,
      })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    res.json(
      items.map((item) => ({
        id: item._id?.toString(),
        name: item.name,
        kind: item.kind,
        mimeType: item.mimeType,
        fileSize: item.fileSize,
        createdAt: item.createdAt.toISOString(),
      })),
    );
  } catch (error) {
    req.log.error({ error }, "Could not list vault items");
    res.status(503).json({ error: "Vault history is temporarily unavailable." });
  }
});

router.get("/vault/items/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (typeof id !== "string" || !ObjectId.isValid(id)) {
      res.status(400).json({ error: "Invalid vault item id." });
      return;
    }

    const db = await getMongoDb();
    const item = await db
      .collection<VaultDocument>("vault_items")
      .findOne({ _id: new ObjectId(id), userId: res.locals.userId });

    if (!item) {
      res.status(404).json({ error: "Vault item not found." });
      return;
    }

    res.json({
      id: item._id?.toString(),
      name: item.name,
      kind: item.kind,
      mimeType: item.mimeType,
      fileSize: item.fileSize,
      payload: item.payload,
      createdAt: item.createdAt.toISOString(),
    });
  } catch (error) {
    req.log.error({ error }, "Could not load vault item");
    res.status(503).json({ error: "Vault item is temporarily unavailable." });
  }
});

router.post("/vault/items", requireAuth, async (req: Request, res: Response) => {
  const input = req.body as Partial<VaultItemInput>;
  if (
    typeof input.name !== "string" ||
    input.name.trim().length === 0 ||
    input.name.length > 180 ||
    (input.kind !== "text" && input.kind !== "image") ||
    !isPayload(input.payload) ||
    input.payload.kind !== input.kind ||
    (input.kind === "image" && !input.payload.mimeType)
  ) {
    res.status(400).json({ error: "Invalid encrypted vault item." });
    return;
  }

  if (input.payload.ciphertext.length > 30_000_000) {
    res.status(413).json({ error: "That encrypted file is too large to save." });
    return;
  }

  try {
    const now = new Date();
    const document: VaultDocument = {
      name: input.name.trim(),
      kind: input.kind,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      payload: input.payload,
      userId: res.locals.userId,
      createdAt: now,
      updatedAt: now,
    };
    const db = await getMongoDb();
    const result = await db.collection<VaultDocument>("vault_items").insertOne(document);
    res.status(201).json({
      id: result.insertedId.toString(),
      name: document.name,
      kind: document.kind,
      mimeType: document.mimeType,
      fileSize: document.fileSize,
      createdAt: now.toISOString(),
    });
  } catch (error) {
    req.log.error({ error }, "Could not save vault item");
    res.status(503).json({ error: "Vault history is temporarily unavailable." });
  }
});

router.delete("/vault/items/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (typeof id !== "string" || !ObjectId.isValid(id)) {
      res.status(400).json({ error: "Invalid vault item id." });
      return;
    }
    const db = await getMongoDb();
    const result = await db
      .collection<VaultDocument>("vault_items")
      .deleteOne({ _id: new ObjectId(id), userId: res.locals.userId });
    if (result.deletedCount === 0) {
      res.status(404).json({ error: "Vault item not found." });
      return;
    }
    res.status(204).end();
  } catch (error) {
    req.log.error({ error }, "Could not delete vault item");
    res.status(503).json({ error: "Vault history is temporarily unavailable." });
  }
});

export default router;