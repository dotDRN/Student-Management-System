import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";

export const validate =
  (schema: z.ZodType<unknown>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ errors: result.error.flatten() });
      return;
    }
    req.body = result.data;
    next();
  };
