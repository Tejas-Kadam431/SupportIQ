// @vitest-environment jsdom
import {render,screen,fireEvent,waitFor,cleanup} from "@testing-library/react";
import {test,expect,vi,beforeEach,afterEach} from "vitest";
import {VersionHistory} from "./DocumentList";
const state=vi.hoisted(()=>({retry:vi.fn(),retryable:true}));
vi.mock("./kbApi",()=>({useKnowledgeVersionsQuery:()=>({data:{data:{document:{currentPublishedVersionId:"v1",versions:[{id:"v2",versionNumber:2,status:"FAILED",createdAt:"2026-09-30",ingestion:{stage:"FAILED",attempts:3,retryable:state.retryable,errorCategory:"STORAGE_UNAVAILABLE",lexicalReady:false,semanticReady:false,chunksEmbedded:0,chunksTotal:4,startedAt:"2026-09-30"}}]}}}}),useReprocessKnowledgeDocumentMutation:()=>[state.retry,{}],usePublishKnowledgeVersionMutation:()=>[vi.fn(),{}],useUploadKnowledgeVersionMutation:()=>[vi.fn(),{}]}));
beforeEach(()=>{state.retryable=true;state.retry.mockReset();state.retry.mockReturnValue({unwrap:async()=>({})});});afterEach(cleanup);
test("admin retry retains exact version and displays safe processing diagnostics",async()=>{render(<VersionHistory orgId="org" documentId="doc" canManage/>);expect(screen.getByText(/Attempts: 3/)).toBeTruthy();expect(screen.getByText(/Semantic: unavailable/)).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"Retry v2"}));await waitFor(()=>expect(state.retry).toHaveBeenCalledWith({orgId:"org",documentId:"doc",versionId:"v2"}));});
test("nonretryable source directs a new upload",()=>{state.retryable=false;render(<VersionHistory orgId="org" documentId="doc" canManage/>);expect(screen.queryByRole("button",{name:"Retry v2"})).toBeNull();expect(screen.getByText("Upload corrected content as a new version.")).toBeTruthy();});
test("staff can inspect diagnostics without a retry mutation control",()=>{render(<VersionHistory orgId="org" documentId="doc" canManage={false}/>);expect(screen.queryByRole("button",{name:"Retry v2"})).toBeNull();});
