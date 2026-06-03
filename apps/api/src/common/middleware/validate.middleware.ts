import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";

type RequestValidationSchema = z.ZodType<{
  body?: unknown;
  params?: Request["params"];
  query?: Request["query"];
}>;

export function validate(schema: RequestValidationSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query
    });

    if (!result.success) {
      return next(result.error);
    }

    const data = result.data;

    if (data.body !== undefined) req.body = data.body;
    if (data.params !== undefined) req.params = data.params;
    if (data.query !== undefined) req.query = data.query;

    next();
  };
}