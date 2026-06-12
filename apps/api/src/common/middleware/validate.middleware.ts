import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

type ParsedRequestParts = {
  body?: unknown;
  params?: unknown;
  query?: unknown;
};

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query
    });

    if (!result.success) {
      return next(result.error);
    }

    const parsedData = result.data as ParsedRequestParts;

    if (parsedData.body !== undefined) {
      req.body = parsedData.body;
    }

    // Do not assign req.query in Express 5 because it is read-only.
    // Do not assign req.params either; route params are already available.

    next();
  };
}