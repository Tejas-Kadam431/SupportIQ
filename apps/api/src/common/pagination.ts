import { AppError } from './errors/AppError.js';
export const HISTORY_PAGE_SIZE = 50;
export function historyPage(value: unknown = 1) {
  if (typeof value !== 'string' && typeof value !== 'number') throw new AppError('Invalid history page', 400);
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw new AppError('Invalid history page', 400);
  return { take: HISTORY_PAGE_SIZE, skip: (page - 1) * HISTORY_PAGE_SIZE };
}
