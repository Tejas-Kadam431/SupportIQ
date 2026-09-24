import { isAllowedOrigin } from "../config/origins.js";
const original = process.env.CLIENT_URL;
afterEach(() => {
  if (original === undefined) delete process.env.CLIENT_URL;
  else process.env.CLIENT_URL = original;
});
test("normalizes comma-separated origins without wildcard credentials", () => {
  process.env.CLIENT_URL = " https://one.example, https://two.example ,*,,";
  expect(isAllowedOrigin("https://one.example")).toBe(true);
  expect(isAllowedOrigin("https://two.example")).toBe(true);
  expect(isAllowedOrigin("https://one.example.evil")).toBe(false);
  expect(isAllowedOrigin("https://evil.example")).toBe(false);
  expect(isAllowedOrigin("*")).toBe(false);
  expect(isAllowedOrigin("null")).toBe(false);
  expect(isAllowedOrigin(undefined)).toBe(true);
});
