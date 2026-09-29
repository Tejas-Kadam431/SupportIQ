// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { test, expect, vi, afterEach, beforeEach } from "vitest";
import { VersionHistory } from "./DocumentList";
const { publish, upload } = vi.hoisted(() => ({ publish: vi.fn(), upload: vi.fn() }));
vi.mock("./kbApi", () => ({ useKnowledgeVersionsQuery: () => ({ data: { data: { document: { currentPublishedVersionId: "v1", versions: [{ id: "v2", versionNumber: 2, status: "READY", createdAt: "2026-09-27" }, { id: "v1", versionNumber: 1, status: "PUBLISHED", createdAt: "2026-09-26", publishedAt: "2026-09-26" }] } } } }), usePublishKnowledgeVersionMutation: () => [publish, {}], useUploadKnowledgeVersionMutation: () => [upload, {}] }));
beforeEach(() => { vi.resetAllMocks(); publish.mockReturnValue({ unwrap: async () => ({}) }); upload.mockReturnValue({ unwrap: async () => ({}) }); });
afterEach(cleanup);
test("ready publication submits observed current pointer and shows retained history", async () => {
    render(<VersionHistory orgId="org" documentId="doc" canManage/>);
    expect(screen.getByText("v1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Publish v2" }));
    await waitFor(() => expect(publish).toHaveBeenCalledWith({ orgId: "org", documentId: "doc", versionId: "v2", expectedCurrentVersionId: "v1" }));
});
test("publication conflict is displayed without silent retry", async () => {
    publish.mockReturnValue({ unwrap: async () => { throw { status: 409, data: { message: "Publication changed" } }; } });
    render(<VersionHistory orgId="org" documentId="doc" canManage/>);
    fireEvent.click(screen.getByRole("button", { name: "Publish v2" }));
    await screen.findByText("Publication changed");
    expect(publish).toHaveBeenCalledTimes(1);
});
test("replacement upload uses logical document identity", async () => {
    render(<VersionHistory orgId="org" documentId="doc" canManage/>);
    const file = new File(["new source"], "policy.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("Replacement document"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload new version" }));
    await waitFor(() => expect(upload).toHaveBeenCalledWith({ orgId: "org", documentId: "doc", file }));
});
test("staff history does not expose admin mutation controls", () => { render(<VersionHistory orgId="org" documentId="doc" canManage={false}/>); expect(screen.queryByRole("button", { name: "Publish v2" })).toBeNull(); expect(screen.queryByLabelText("Replacement document")).toBeNull(); });
