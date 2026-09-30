import { HistoryPages } from "../../components/HistoryPages";
import { useState } from "react";
import { type KnowledgeDocument, useDeleteKnowledgeDocumentMutation, useReprocessKnowledgeDocumentMutation, useKnowledgeVersionsQuery, useUploadKnowledgeVersionMutation, usePublishKnowledgeVersionMutation } from "./kbApi";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
import "./kb.css";
type Props = {
    orgId: string;
    documents: KnowledgeDocument[];
    isLoading: boolean;
    isError: boolean;
    isFetching?: boolean;
    canManage?: boolean;
};
export function DocumentList({ orgId, documents, isLoading, isError, canManage = false }: Props) {
    return <section className="siq-card kb-documents-card"><h2>Knowledge publications</h2><p>Upload and prepare a version, then publish it when ready. Previous publications remain in history.</p>
 {isLoading && <p>Loading documents…</p>}{isError && <p role="alert">Could not load documents.</p>}
 {!isLoading && !documents.length && <p>No active knowledge documents.</p>}
 {documents.map(doc => <DocumentCard key={doc.id} orgId={orgId} document={doc} canManage={canManage}/>)}
 </section>;
}
function DocumentCard({ orgId, document: doc, canManage }: {
    orgId: string;
    document: KnowledgeDocument;
    canManage: boolean;
}) {
    const [expanded, setExpanded] = useState(false), [error, setError] = useState("");
    const [archive, { isLoading: archiving }] = useDeleteKnowledgeDocumentMutation();
    const [retry, { isLoading: retrying }] = useReprocessKnowledgeDocumentMutation();
    const latest = doc.versions?.[0], current = doc.currentPublishedVersion;
    async function action(kind: "archive" | "retry") {
        setError("");
        try {
            await (kind === "archive" ? archive({ orgId, documentId: doc.id }) : retry({ orgId, documentId: doc.id })).unwrap();
        }
        catch (e) {
            setError(getApiErrorMessage(e, "Knowledge update failed"));
        }
    }
    return <article className="siq-card" style={{ padding: 16, marginTop: 12 }}><h3>{doc.originalName}</h3>
 <p>{current ? "Published v" + current.versionNumber + " · " + new Date(current.publishedAt!).toLocaleString() : "Not published"}</p>
 {latest && latest.id !== current?.id && <p>Latest update: v{latest.versionNumber} · {latest.status.toLowerCase()}</p>}
 {latest?.errorMessage && <p role="alert">{latest.errorMessage}</p>}
 <button className="siq-button" onClick={() => setExpanded(!expanded)}>{expanded ? "Hide history" : "Version history"}</button>{" "}
 {canManage && <><button className="siq-button" disabled={archiving} onClick={() => action("archive")}>Archive</button>{" "}
 {latest && ["FAILED", "UPLOADED"].includes(latest.status) && <button className="siq-button" disabled={retrying} onClick={() => action("retry")}>Retry processing</button>}</>}
 {error && <p role="alert">{error}</p>}{expanded && <VersionHistory orgId={orgId} documentId={doc.id} canManage={canManage}/>}
 </article>;
}
export function VersionHistory({ orgId, documentId, canManage }: {
    orgId: string;
    documentId: string;
    canManage: boolean;
}) {
    const [page, setPage] = useState(1);
    const { data, isLoading, isError } = useKnowledgeVersionsQuery({ orgId, documentId, page }, { pollingInterval: 5000 });
    const [upload, { isLoading: uploading }] = useUploadKnowledgeVersionMutation();
    const [publish, { isLoading: publishing }] = usePublishKnowledgeVersionMutation();
    const [file, setFile] = useState<File | null>(null), [error, setError] = useState("");
    const [retry, { isLoading: retrying }] = useReprocessKnowledgeDocumentMutation();
    const doc = data?.data.document;
    async function retryVersion(versionId: string) { setError(""); try {
        await retry({ orgId, documentId, versionId }).unwrap();
    }
    catch (e) {
        setError(getApiErrorMessage(e, "Retry failed"));
    } }
    async function uploadFile() {
        if (!file)
            return;
        setError("");
        try {
            await upload({ orgId, documentId, file }).unwrap();
            setFile(null);
        }
        catch (e) {
            setError(getApiErrorMessage(e, "Upload failed"));
        }
    }
    async function publishVersion(versionId: string) {
        if (!doc)
            return;
        setError("");
        try {
            await publish({ orgId, documentId, versionId, expectedCurrentVersionId: doc.currentPublishedVersionId }).unwrap();
        }
        catch (e) {
            setError(getApiErrorMessage(e, "Publication changed. Refresh history and retry."));
        }
    }
    return <section aria-label="Version history"><h4>Version history</h4>{isLoading && <p>Loading versions…</p>}{isError && <p role="alert">Could not load version history.</p>}
 <ul>{doc?.versions.map(v => <li key={v.id}><strong>v{v.versionNumber}</strong> · {v.status.toLowerCase()} · {new Date(v.publishedAt ?? v.createdAt).toLocaleString()}{" "}
 {v.ingestion && <p>Stage: {v.ingestion.stage.toLowerCase()} · Attempts: {v.ingestion.attempts} · Lexical: {v.ingestion.lexicalReady ? "ready" : "not ready"} · Semantic: {v.ingestion.semanticReady ? "ready" : "unavailable/incomplete"} ({v.ingestion.chunksEmbedded}/{v.ingestion.chunksTotal}){v.ingestion.errorCategory && " · " + v.ingestion.errorCategory}{v.ingestion.startedAt && " · Last attempt: " + new Date(v.ingestion.startedAt).toLocaleString()}</p>}
 {canManage && v.status === "FAILED" && v.ingestion?.retryable && <button disabled={retrying} onClick={() => retryVersion(v.id)}>Retry v{v.versionNumber}</button>}
 {v.status === "FAILED" && v.ingestion?.retryable === false && <p>Upload corrected content as a new version.</p>}
 {canManage && v.status === "READY" && <button className="siq-button" disabled={publishing} onClick={() => publishVersion(v.id)}>Publish v{v.versionNumber}</button>}</li>)}</ul>
 {canManage && <div><label>Replacement document <input aria-label="Replacement document" type="file" accept=".pdf,.txt,.md,.markdown" onChange={e => setFile(e.target.files?.[0] ?? null)}/></label><button className="siq-button" disabled={!file || uploading} onClick={uploadFile}>Upload new version</button></div>}
 {error && <p role="alert">{error}</p>}<HistoryPages page={page} count={doc?.versions.length ?? 0} onChange={setPage}/></section>;
}
