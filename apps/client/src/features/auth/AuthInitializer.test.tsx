// @vitest-environment jsdom
import { StrictMode } from "react";
import { render, waitFor, cleanup } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AuthInitializer } from "./AuthInitializer";

const { refresh, dispatch } = vi.hoisted(() => ({ refresh: vi.fn(), dispatch: vi.fn() }));
vi.mock("../../app/hooks", () => ({ useAppDispatch: () => dispatch, useAppSelector: () => false }));
vi.mock("./authApi", () => ({ useRefreshMutation: () => [refresh] }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

test("StrictMode startup effect replay sends only one refresh", async () => {
  refresh.mockReturnValue({ unwrap: async () => ({ data: { user: { id: "u" }, accessToken: "access" } }) });
  render(<StrictMode><AuthInitializer><div>App</div></AuthInitializer></StrictMode>);
  await waitFor(() => expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "auth/setAuthReady" })));
  expect(refresh).toHaveBeenCalledTimes(1);
});

test("failed startup refresh finishes initialization without an automatic replay", async () => {
  refresh.mockReturnValue({ unwrap: async () => { throw new Error("denied"); } });
  render(<StrictMode><AuthInitializer><div>App</div></AuthInitializer></StrictMode>);
  await waitFor(() => expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "auth/clearCredentials" })));
  expect(refresh).toHaveBeenCalledTimes(1);
});
