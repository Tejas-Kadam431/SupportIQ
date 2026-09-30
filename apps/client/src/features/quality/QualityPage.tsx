import { ReliabilityLab } from "./ReliabilityLab";
import "./quality.css";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useListOrganizationsQuery, useListMembersQuery } from "../organizations/orgApi";
import { useListKnowledgeDocumentsQuery, useKnowledgeVersionsQuery } from "../knowledge-base/kbApi";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
import { useQualityAssigneesQuery, useQualityOverviewQuery, useQualitySourcesQuery, useQualityIssuesQuery, useQualityIssueQuery, useUpdateQualityIssueMutation, useQualityRunsQuery, useQualityRunQuery, type Rate, type IssueDetail, type IssueStatus } from "./qualityApi";
export function RateValue({ label, value }: {
    label: string;
    value: Rate;
}) { return <p><strong>{label}: {value.percent}%</strong> · {value.numerator} / {value.denominator}</p>; }
function Pages({ page, more, onChange }: {
    page: number;
    more: boolean;
    onChange: (n: number) => void;
}) { return <div><button disabled={page === 1} onClick={() => onChange(page - 1)}>Previous</button> Page {page} <button disabled={!more} onClick={() => onChange(page + 1)}>Next</button></div>; }
export function QualityPage() {
    const { data, isLoading, isError } = useListOrganizationsQuery();
    const [selection, setSelection] = useState("");
    const staff = data?.data.organizations.filter(o => o.role !== "CUSTOMER") ?? [];
    const org = staff.find(o => o.organization.id === selection) ?? staff[0];
    return <main className="siq-card siq-card-padding quality-page"><h1>AI Quality</h1><p>Observed outcomes, knowledge issues, and source versions. Publication does not prove a fix.</p>{isLoading && <p>Loading organizations…</p>}{isError && <p role="alert">Could not load organizations.</p>}{!isLoading && !isError && !org && <p>Staff access is required.</p>}{org && <><label>Organization <select value={org.organization.id} onChange={e => setSelection(e.target.value)}>{staff.map(o => <option key={o.organization.id} value={o.organization.id}>{o.organization.name}</option>)}</select></label><QualityWorkspace key={org.organization.id} orgId={org.organization.id} canManage={org.role === "OWNER" || org.role === "ADMIN"}/></>}</main>;
}
function QualityWorkspace({ orgId, canManage }: {
    orgId: string;
    canManage: boolean;
}) {
    const [tab, setTab] = useState("Overview"), [days, setDays] = useState(30), [issueId, setIssueId] = useState<string | null>(null), [versionId, setVersionId] = useState("");
    return <><nav aria-label="AI Quality sections">{["Overview", "Knowledge Issues", "Source Health", "Copilot Runs", "Reliability Lab"].map(t => <button key={t} aria-pressed={tab === t} onClick={() => { setTab(t); setIssueId(null); }}>{t}</button>)}</nav>{tab !== "Knowledge Issues" && tab !== "Reliability Lab" && <label>Run period <select value={days} onChange={e => setDays(Number(e.target.value))}>{[7, 30, 90].map(n => <option key={n} value={n}>Last {n} days</option>)}</select></label>}
 {issueId ? <IssueView key={issueId} orgId={orgId} issueId={issueId} canManage={canManage} onClose={() => setIssueId(null)}/> : <>{tab === "Reliability Lab" && <ReliabilityLab orgId={orgId} canManage={canManage}/>} {tab === "Overview" && <Overview key={days} orgId={orgId} days={days} onIssue={setIssueId}/>}{tab === "Knowledge Issues" && <IssueList orgId={orgId} versionId={versionId} onClearVersion={() => setVersionId("")} onIssue={setIssueId}/>}{tab === "Source Health" && <Sources key={days} orgId={orgId} days={days} onIssues={id => { setVersionId(id); setTab("Knowledge Issues"); }}/>}{tab === "Copilot Runs" && <Runs key={days} orgId={orgId} days={days} onIssue={setIssueId}/>}</>}</>;
}
function Overview({ orgId, days, onIssue }: {
    orgId: string;
    days: number;
    onIssue: (id: string) => void;
}) {
    const { data, isLoading, isError } = useQualityOverviewQuery({ orgId, days });
    const q = data?.data;
    if (isLoading)
        return <p>Loading metrics…</p>;
    if (isError || !q)
        return <p role="alert">Could not load quality metrics.</p>;
    return <section><h2>Overview</h2><p>{q.totalRuns} Copilot runs · {q.knowledgeFailures} knowledge failures across {q.affectedTickets} tickets · {q.operationalFailures} runs with operational failures</p><RateValue label="Evaluation coverage" value={q.evaluationCoverage}/><p>Every persisted run can receive feedback, including abstentions. Rates use run creation time.</p><RateValue label="Acceptance among evaluated runs" value={q.acceptance}/><RateValue label="Edits among evaluated runs" value={q.edit}/><RateValue label="Rejections among evaluated runs" value={q.rejection}/><RateValue label="Abstention among all runs" value={q.abstention}/><h3>Evidence outcomes</h3><ul>{q.outcomes.map(o => <li key={o.policy}>{o.policy}: {o.count} runs ({o.abstained} abstained)</li>)}</ul><h3>Retrieval health</h3><ul>{q.retrievalHealth.map(r => <li key={r.semantic + r.lexical}>Semantic: {r.semantic} · Lexical: {r.lexical} · {r.count} runs</li>)}</ul><h3>Human feedback reasons</h3><ul>{Object.entries(q.failureReasons).map(([reason, count]) => <li key={reason}>{reason}: {count}</li>)}</ul><p>Mean recorded generation duration: {q.averageLatencyMs === null ? "No data" : Math.round(q.averageLatencyMs) + " ms"} ({q.latencySamples} measured runs)</p><IssueList orgId={orgId} onIssue={onIssue} compact/></section>;
}
function IssueList({ orgId, onIssue, compact = false, versionId, onClearVersion }: {
    orgId: string;
    onIssue: (id: string) => void;
    compact?: boolean;
    versionId?: string;
    onClearVersion?: () => void;
}) {
    const [page, setPage] = useState(1), [status, setStatus] = useState(compact ? "DETECTED" : ""), [severity, setSeverity] = useState(""), [assignee, setAssignee] = useState("");
    const { data: staff } = useQualityAssigneesQuery(orgId, { skip: compact });
    const { data, isLoading, isError } = useQualityIssuesQuery({ orgId, page, status, severity, assignee, versionId });
    return <section><h2>{compact ? "Top detected knowledge issues" : "Knowledge Issues"}</h2><p>Lifetime recurrence, ranked by unique affected tickets. Repeated runs on one ticket count separately as signals.</p>{versionId && <p>Filtered to the selected source version <button onClick={onClearVersion}>Clear source filter</button></p>}{!compact && <div><label>Status <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">All</option>{["DETECTED", "REVIEWING", "FIX_PROPOSED", "PUBLISHED", "VERIFIED", "DISMISSED"].map(s => <option key={s}>{s}</option>)}</select></label><label>Severity <select value={severity} onChange={e => { setSeverity(e.target.value); setPage(1); }}><option value="">All</option>{["LOW", "MEDIUM", "HIGH"].map(s => <option key={s}>{s}</option>)}</select></label><label>Assignee <select value={assignee} onChange={e => { setAssignee(e.target.value); setPage(1); }}><option value="">All staff</option>{staff?.data.map(m => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}</select></label></div>}{isLoading && <p>Loading issues…</p>}{isError && <p role="alert">Could not load issues.</p>}
 <ul>{(compact ? data?.data.issues.slice(0, 5) : data?.data.issues)?.map(i => <li key={i.id}><button onClick={() => onIssue(i.id)}>{i.title}</button> · {i.status} · {i.severity}<p>{i.signalCount} signals / {i.affectedTicketCount} tickets · {i.sourceCount} source versions · {i.assigneeName ?? "Unassigned"}</p><p>First {new Date(i.firstDetectedAt).toLocaleDateString()} · Last {new Date(i.lastDetectedAt).toLocaleDateString()} · {i.reason}</p></li>)}</ul>{data?.data.issues.length === 0 && <p>No matching issues.</p>}{!compact && <Pages page={page} more={data?.data.hasMore ?? false} onChange={setPage}/>}</section>;
}
function Sources({ orgId, days, onIssues }: {
    orgId: string;
    days: number;
    onIssues: (id: string) => void;
}) { const [page, setPage] = useState(1); const { data, isLoading, isError } = useQualitySourcesQuery({ orgId, days, page }); return <section><h2>Source Health</h2><p>One eligible source-version use per run. Observed flags are associations, not proof of causation. Legacy sources without version identity are excluded.</p>{isLoading && <p>Loading sources…</p>}{isError && <p role="alert">Could not load source health.</p>}<ul>{data?.data.sources.map(s => <li key={s.versionId}><strong>{s.documentName} · v{s.versionNumber}</strong> · {s.isCurrent ? "Current publication" : s.status}<p>{s.runsUsingSource} uses · {s.acceptedRuns} accepted / {s.editedRuns} edited / {s.rejectedRuns} rejected</p><RateValue label="Observed knowledge flags among evaluated uses" value={s.observedFailureRate}/><p>{s.knowledgeFailureRuns} total human/policy flags · Wrong knowledge {s.wrongKnowledgeRuns} · Irrelevant evidence {s.irrelevantEvidenceRuns} · Conflicting knowledge {s.conflictingKnowledgeRuns}</p>{s.limitedData && <p>Limited data: fewer than 10 evaluated uses.</p>}<button onClick={() => onIssues(s.versionId)}>{s.issueCount} linked issues</button></li>)}</ul>{data?.data.sources.length === 0 && <p>No versioned source usage in this period.</p>}<Pages page={page} more={data?.data.hasMore ?? false} onChange={setPage}/></section>; }
function Runs({ orgId, days, onIssue }: {
    orgId: string;
    days: number;
    onIssue: (id: string) => void;
}) { const [page, setPage] = useState(1), [selected, setSelected] = useState<{
    ticketId: string;
    runId: string;
} | null>(null); const { data, isLoading, isError } = useQualityRunsQuery({ orgId, days, page }); return <section><h2>Copilot Runs</h2>{isLoading && <p>Loading runs…</p>}{isError && <p role="alert">Could not load runs.</p>}<ul>{data?.data.runs.map(r => <li key={r.id}><button onClick={() => setSelected({ ticketId: r.ticketId, runId: r.id })}>{r.id}</button> · {r.evaluation?.disposition ?? (r.abstained ? "Abstained" : "Awaiting feedback")} · {new Date(r.createdAt).toLocaleString()} <Link to={'/tickets/' + r.ticketId}>Ticket</Link> {r.knowledgeSignal && <button onClick={() => onIssue(r.knowledgeSignal!.issueId)}>Knowledge issue</button>}</li>)}</ul><Pages page={page} more={data?.data.hasMore ?? false} onChange={setPage}/>{selected && <RunView {...selected}/>}</section>; }
function RunView({ ticketId, runId }: {
    ticketId: string;
    runId: string;
}) { const { data, isLoading, isError } = useQualityRunQuery({ ticketId, runId }); const run = data?.data.run; return <article><h3>Historical run {runId}</h3>{isLoading && <p>Loading run…</p>}{isError && <p role="alert">Could not load historical run.</p>}{run && <><p>{run.suggestedReply ?? "No generated reply"}</p><p>Human decision: {run.evaluation?.disposition ?? "Not evaluated"} · {run.evaluation?.reason}</p>{run.evaluation?.finalMessage && <p>Final reply: {run.evaluation.finalMessage}</p>}<ul>{Array.isArray(run.sources) && run.sources.map((s, i) => <li key={i}>{s.documentName} · {s.versionNumber ? `v${s.versionNumber}` : "Legacy version unknown"}<p>{s.content}</p></li>)}</ul></>}</article>; }
export function IssueView({ orgId, issueId, canManage, onClose }: {
    orgId: string;
    issueId: string;
    canManage: boolean;
    onClose: () => void;
}) {
    const [page, setPage] = useState(1), [run, setRun] = useState<{
        ticketId: string;
        runId: string;
    } | null>(null);
    const { data, isLoading, isError } = useQualityIssueQuery({ orgId, issueId, page });
    const issue = data?.data;
    const [showLab, setShowLab] = useState(false);
    return <section><button onClick={onClose}>Back</button>{isLoading && <p>Loading issue…</p>}{isError && <p role="alert">Could not load issue.</p>}{issue && <><h2>{issue.title}</h2><p>{issue.status} · {issue.severity} · {issue.signalCount} signals / {issue.affectedTicketCount} affected tickets · {issue.reason} · {issue.assignee?.user.name ?? "Unassigned"}</p><p>First {new Date(issue.firstDetectedAt).toLocaleString()} · Last {new Date(issue.lastDetectedAt).toLocaleString()}</p>{issue.candidateVersion && <p>Candidate: {issue.candidateVersion.originalName} v{issue.candidateVersion.versionNumber} · {issue.candidateVersion.status}{issue.candidateVersion.publishedAt && ' · Published ' + new Date(issue.candidateVersion.publishedAt).toLocaleString()}. Publication is not verification.</p>}{issue.fixNote && <p>Proposed fix: {issue.fixNote}</p>}{issue.recurringAfterPublication && <p>New signals arrived after the recorded publication. Review recurrence.</p>}{canManage && <IssueControls key={issue.revision} orgId={orgId} issue={issue}/>}<button onClick={() => setShowLab(!showLab)}>Reliability Lab experiments</button>{showLab && <ReliabilityLab orgId={orgId} canManage={canManage} issueId={issue.id} versionId={issue.candidateVersion?.id}/>}<h3>Supporting signals</h3><ul>{issue.signals.map(s => <li key={s.id}>{s.reason} · {new Date(s.occurredAt).toLocaleString()} <Link to={'/tickets/' + s.run.ticketId}>Ticket</Link> <button onClick={() => setRun({ ticketId: s.run.ticketId, runId: s.run.id })}>Run {s.run.id}</button><ul>{s.sources.map(source => <li key={source.version.id}>{source.version.originalName} v{source.version.versionNumber} · {source.attributed ? "Plausible knowledge attribution" : "Associated evidence only"}</li>)}</ul></li>)}</ul><Pages page={page} more={issue.hasMore} onChange={setPage}/>{run && <RunView {...run}/>}<h3>Recent audit history</h3><ul>{issue.history.map(h => <li key={h.id}>{h.event} · {new Date(h.createdAt).toLocaleString()} · {h.actorIdentity ?? "System"} {h.metadata.note && <p>{h.metadata.note}</p>}{h.event === "VERIFIED" && typeof h.metadata.failureCases === "number" && typeof h.metadata.guardrailCases === "number" && <p>Verified against {h.metadata.failureCases + h.metadata.guardrailCases} historical cases. <button onClick={() => setShowLab(true)}>View verification experiments</button></p>}</li>)}</ul></>}</section>;
}
export function IssueControls({ orgId, issue }: {
    orgId: string;
    issue: IssueDetail;
}) {
    const [update, { isLoading }] = useUpdateQualityIssueMutation();
    const { data: members } = useListMembersQuery(orgId);
    const { data: docs } = useListKnowledgeDocumentsQuery(orgId);
    const [assignee, setAssignee] = useState(issue.assignee?.user.id ?? ""), [documentId, setDocumentId] = useState(""), [candidate, setCandidate] = useState(""), [note, setNote] = useState(""), [dismissal, setDismissal] = useState("NOT_A_KNOWLEDGE_PROBLEM"), [error, setError] = useState("");
    const { data: versions } = useKnowledgeVersionsQuery({ orgId, documentId }, { skip: !documentId });
    async function change(status?: IssueStatus) { setError(""); try {
        await update({ orgId, issueId: issue.id, expectedRevision: issue.revision, ...(status ? { status } : { assignedToUserId: assignee || null }), ...(status === "FIX_PROPOSED" ? { candidateVersionId: candidate, note } : {}), ...(status === "DISMISSED" ? { dismissalReason: dismissal, note } : {}) }).unwrap();
    }
    catch (e) {
        setError(getApiErrorMessage(e, "Issue update failed. Refresh and retry."));
    } }
    return <fieldset disabled={isLoading}><legend>Manage issue</legend><label>Assignee <select value={assignee} onChange={e => setAssignee(e.target.value)}><option value="">Unassigned</option>{members?.data.members.filter(m => m.role !== "CUSTOMER").map(m => <option key={m.id} value={m.userId}>{m.user.name}</option>)}</select></label><button onClick={() => change()}>Assign</button>{issue.status !== "VERIFIED" && issue.status !== "REVIEWING" && <button onClick={() => change("REVIEWING")}>Review issue</button>}{issue.status === "REVIEWING" && <><label>Fix document <select value={documentId} onChange={e => { setDocumentId(e.target.value); setCandidate(""); }}><option value="">Select document</option>{docs?.data.documents.map(d => <option key={d.id} value={d.id}>{d.originalName}</option>)}</select></label><label>READY version <select value={candidate} onChange={e => setCandidate(e.target.value)}><option value="">Select prepared version</option>{versions?.data.document.versions.filter(v => v.status === "READY").map(v => <option key={v.id} value={v.id}>v{v.versionNumber}</option>)}</select></label><button disabled={!candidate || !note.trim()} onClick={() => change("FIX_PROPOSED")}>Propose fix</button><Link to="/knowledge-base">Prepare knowledge version</Link></>}{issue.status === "FIX_PROPOSED" && <button disabled={issue.candidateVersion?.status !== "PUBLISHED"} onClick={() => change("PUBLISHED")}>Record published fix</button>}<label>Review note <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000}/></label>{!["DISMISSED", "VERIFIED"].includes(issue.status) && <><label>Dismissal reason <select value={dismissal} onChange={e => setDismissal(e.target.value)}>{["NOT_A_KNOWLEDGE_PROBLEM", "DUPLICATE", "EXPECTED_BEHAVIOR", "OTHER"].map(r => <option key={r}>{r}</option>)}</select></label><button disabled={!note.trim()} onClick={() => change("DISMISSED")}>Dismiss issue</button></>}<p>Verification will require Reliability Lab evidence; it cannot be set here.</p>{error && <p role="alert">{error}</p>}</fieldset>;
}
