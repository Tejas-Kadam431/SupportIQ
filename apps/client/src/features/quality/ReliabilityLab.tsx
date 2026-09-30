import { useState } from 'react';
import { useListKnowledgeDocumentsQuery, useKnowledgeVersionsQuery } from '../knowledge-base/kbApi';
import { getApiErrorMessage } from '../../utils/getApiErrorMessage';
import { useReplayExperimentsQuery, useReplayExperimentQuery, useReplaySuitesQuery, useCreateReplaySuiteMutation, useCreateReplayExperimentMutation, useReplayActionMutation, useVerifyReplayMutation, type Experiment } from './reliabilityApi';
export function ReplaySummary({ summary }: {
    summary: Experiment['summary'];
}) { return <div><p>{summary.completed} / {summary.total} cases completed</p>{summary.counts && <p>{Object.entries(summary.counts).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}{summary.failures && <p>Failure cases improved: {summary.failures.passed} / {summary.failures.total}</p>}{summary.guardrails && <p>Guardrails preserved: {summary.guardrails.preserved} / {summary.guardrails.total}</p>}</div>; }
export function ReliabilityLab({ orgId, canManage, issueId, versionId }: {
    orgId: string;
    canManage: boolean;
    issueId?: string;
    versionId?: string;
}) {
    const [selected, setSelected] = useState(''), [creating, setCreating] = useState(false), [page, setPage] = useState(1), [status, setStatus] = useState(''), [purpose, setPurpose] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState('');
    const { data, isLoading, isError } = useReplayExperimentsQuery({ orgId, page, status, purpose, issueId, from: from ? new Date(from).toISOString() : undefined, to: to ? new Date(to).toISOString() : undefined });
    return <section><h2>Reliability Lab</h2><p>Replay immutable support history without sending messages. Human acceptance is a usefulness signal, not proof of correctness.</p>{canManage && <button onClick={() => setCreating(!creating)}>{issueId ? 'Evaluate candidate / published fix' : 'New experiment'}</button>}{creating && <ReplayCreate orgId={orgId} issueId={issueId} versionId={versionId} onCreated={id => { setSelected(id); setCreating(false); }}/>}<div><label>Experiment status <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">All</option>{['DRAFT', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'].map(x => <option key={x}>{x}</option>)}</select></label><label>Purpose <select value={purpose} onChange={e => { setPurpose(e.target.value); setPage(1); }}><option value="">All</option>{['PRE_PUBLICATION', 'POST_PUBLICATION_VERIFICATION', 'GENERAL_COMPARISON'].map(x => <option key={x}>{x}</option>)}</select></label><label>Created from <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }}/></label><label>Before <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }}/></label></div>{isLoading && <p>Loading experiments…</p>}{isError && <p role="alert">Could not load experiments.</p>}<ul>{data?.data.experiments.map(e => <li key={e.id}><button onClick={() => setSelected(e.id)}>{e.name}</button> · {e.purpose} · {e.status}<p>{e.suite.name} · {e.suite._count?.cases} cases · {e.scope.map(v => `${v.version.originalName} v${v.version.versionNumber}`).join(', ') || 'Current publication snapshot'}</p><p>{new Date(e.createdAt).toLocaleString()} · Actor {e.actorIdentity}</p><ReplaySummary summary={e.summary}/></li>)}</ul>{data?.data.experiments.length === 0 && <p>No experiments yet.</p>}<button disabled={page === 1} onClick={() => setPage(page - 1)}>Previous experiments</button> Page {page} <button disabled={!data?.data.hasMore} onClick={() => setPage(page + 1)}>Next experiments</button>{selected && <ReplayDetail key={selected} orgId={orgId} id={selected} canManage={canManage}/>}</section>;
}
function ReplayCreate({ orgId, issueId, versionId, onCreated }: {
    orgId: string;
    issueId?: string;
    versionId?: string;
    onCreated: (id: string) => void;
}) {
    const [name, setName] = useState('Historical knowledge comparison'), [source, setSource] = useState(issueId ? 'issue' : 'history'), [suiteId, setSuiteId] = useState(''), [caseCount, setCaseCount] = useState(0), [issue, setIssue] = useState(issueId ?? ''), [disposition, setDisposition] = useState('REJECTED'), [abstained, setAbstained] = useState(''), [decision, setDecision] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState(''), [documentId, setDocumentId] = useState(''), [candidate, setCandidate] = useState(versionId ?? ''), [generation, setGeneration] = useState(false), [hybrid, setHybrid] = useState(false), [purpose, setPurpose] = useState(issueId ? 'PRE_PUBLICATION' : 'GENERAL_COMPARISON'), [error, setError] = useState(''), [suitePage, setSuitePage] = useState(1);
    const { data: suites } = useReplaySuitesQuery({ orgId, page: suitePage }), { data: documents } = useListKnowledgeDocumentsQuery(orgId), { data: versions } = useKnowledgeVersionsQuery({ orgId, documentId }, { skip: !documentId });
    const [createSuite, { isLoading: makingSuite }] = useCreateReplaySuiteMutation(), [createExperiment, { isLoading: makingExperiment }] = useCreateReplayExperimentMutation();
    async function prepare() { setError(''); try {
        const r = await createSuite({ orgId, body: { name, ...(source === 'issue' ? { issueId: issue } : { ...(disposition ? { disposition } : {}), ...(abstained ? { abstained: abstained === 'true' } : {}), ...(decision ? { evidenceDecision: decision } : {}), ...(from ? { from: new Date(from).toISOString() } : {}), ...(to ? { to: new Date(to).toISOString() } : {}) }) } }).unwrap();
        setSuiteId(r.data.id);
        setCaseCount(r.data._count.cases);
    }
    catch (e) {
        setError(getApiErrorMessage(e, 'Could not prepare suite.'));
    } }
    async function create() { setError(''); try {
        const r = await createExperiment({ orgId, body: { name, suiteId, purpose, generation, hybrid, configurationId: 'support-replay-v1', overrideVersionIds: candidate ? [candidate] : [] } }).unwrap();
        onCreated(r.data.id);
    }
    catch (e) {
        setError(getApiErrorMessage(e, 'Could not create experiment.'));
    } }
    return <fieldset disabled={makingSuite || makingExperiment}><legend>Prepare experiment</legend><label>Name <input value={name} maxLength={160} onChange={e => setName(e.target.value)}/></label><label>Case source <select value={source} onChange={e => { setSource(e.target.value); setSuiteId(''); setCaseCount(0); }}><option value="history">Historical run filters</option><option value="issue">Knowledge issue with guardrails</option><option value="suite">Existing immutable suite</option></select></label>{source === 'suite' ? <><label>Suite <select value={suiteId} onChange={e => { setSuiteId(e.target.value); setCaseCount(suites?.data.suites.find(s => s.id === e.target.value)?._count.cases ?? 0); }}><option value="">Select suite</option>{suites?.data.suites.map(s => <option key={s.id} value={s.id}>{s.name} ({s._count.cases})</option>)}</select></label><button disabled={suitePage === 1} onClick={() => setSuitePage(suitePage - 1)}>Previous suites</button><button disabled={!suites?.data.hasMore} onClick={() => setSuitePage(suitePage + 1)}>Next suites</button></> : <fieldset disabled={!!suiteId}>{source === 'issue' ? <label>Knowledge issue ID <input value={issue} onChange={e => setIssue(e.target.value)}/></label> : <><label>Human disposition <select value={disposition} onChange={e => setDisposition(e.target.value)}><option value="">Any</option>{['ACCEPTED', 'EDITED', 'REJECTED'].map(s => <option key={s}>{s}</option>)}</select></label><label>Abstained <select value={abstained} onChange={e => setAbstained(e.target.value)}><option value="">Any</option><option value="true">Yes</option><option value="false">No</option></select></label><label>Evidence decision <select value={decision} onChange={e => setDecision(e.target.value)}><option value="">Any</option>{['ANSWER_SUPPORTED', 'INSUFFICIENT_KNOWLEDGE', 'CONFLICTING_KNOWLEDGE', 'NEEDS_CUSTOMER_INFO', 'RETRIEVAL_DEGRADED'].map(s => <option key={s}>{s}</option>)}</select></label><label>Run from <input type="date" value={from} onChange={e => setFrom(e.target.value)}/></label><label>Run before <input type="date" value={to} onChange={e => setTo(e.target.value)}/></label></>}<button onClick={prepare}>Prepare immutable suite</button></fieldset>}
 <label>Purpose <select value={purpose} onChange={e => setPurpose(e.target.value)}>{['GENERAL_COMPARISON', 'PRE_PUBLICATION', 'POST_PUBLICATION_VERIFICATION'].map(s => <option key={s}>{s}</option>)}</select></label><label>Candidate document <select value={documentId} onChange={e => { setDocumentId(e.target.value); setCandidate(''); }}><option value="">Current snapshot / linked candidate</option>{documents?.data.documents.map(d => <option key={d.id} value={d.id}>{d.originalName}</option>)}</select></label><label>Candidate version <select value={candidate} onChange={e => setCandidate(e.target.value)}><option value="">No override</option>{versionId && !documentId && <option value={versionId}>Linked issue candidate</option>}{versions?.data.document.versions.filter(v => ['READY', 'PUBLISHED', 'SUPERSEDED'].includes(v.status)).map(v => <option key={v.id} value={v.id}>v{v.versionNumber} · {v.status}</option>)}</select></label><p>Registered configuration: current evidence-v2 / support-copilot-v3. Default retrieval uses lexical search and makes no provider calls.</p><label><input type="checkbox" checked={hybrid} onChange={e => setHybrid(e.target.checked)}/> Enable hybrid semantic search (paid embeddings may apply)</label><label><input type="checkbox" checked={generation} onChange={e => setGeneration(e.target.checked)}/> Generate replies using configured provider chain (paid calls may apply)</label><p>Review: {caseCount} / 50 cases. Up to {hybrid ? caseCount : 0} embedding calls and {generation ? caseCount * 2 : 0} generation attempts. Generation is evidence-gated and limited to 10 cases. Estimated currency cost is unavailable.</p><p>Creating a draft pins knowledge content. It does not execute replay, publish knowledge, or send messages.</p><button disabled={!suiteId || !name.trim()} onClick={create}>Create experiment draft</button>{error && <p role="alert">{error}</p>}</fieldset>;
}
function ReplayDetail({ orgId, id, canManage }: {
    orgId: string;
    id: string;
    canManage: boolean;
}) {
    const { data, isLoading, isError } = useReplayExperimentQuery({ orgId, id }, { pollingInterval: 5000 }), [action, { isLoading: busy }] = useReplayActionMutation(), [verify, { isLoading: verifying }] = useVerifyReplayMutation(), [error, setError] = useState(''), [verified, setVerified] = useState('');
    const e = data?.data;
    async function execute(kind: 'execute' | 'cancel') { setError(''); try {
        await action({ orgId, id, action: kind }).unwrap();
    }
    catch (ex) {
        setError(getApiErrorMessage(ex, 'Experiment action failed.'));
    } }
    async function verifyFix() { if (!e?.suite.issueId)
        return; setError(''); try {
        const result = await verify({ orgId, id, issueId: e.suite.issueId }).unwrap();
        setVerified(`Verified against ${result.data.failureCases + result.data.guardrailCases} historical cases.`);
    }
    catch (ex) {
        setError(getApiErrorMessage(ex, 'Verification criteria did not pass.'));
    } }
    if (isLoading)
        return <p>Loading experiment…</p>;
    if (isError || !e)
        return <p role="alert">Could not load experiment.</p>;
    return <article><h3>{e.name} · {e.status}</h3><ReplaySummary summary={e.summary}/><p>Verification means defined historical evidence criteria passed; it does not establish objective correctness.</p>{canManage && <>{e.status === 'DRAFT' && <button disabled={busy} onClick={() => execute('execute')}>Execute replay</button>}{['DRAFT', 'RUNNING'].includes(e.status) && <button onClick={() => execute('cancel')}>Cancel experiment</button>}{e.status === 'COMPLETED' && e.purpose === 'POST_PUBLICATION_VERIFICATION' && e.suite.issueId && <button disabled={verifying} onClick={verifyFix}>Verify published fix</button>}</>}{verified && <p role="status">{verified}</p>}{error && <p role="alert">{error}</p>}<details><summary>Frozen configuration and scope</summary><pre>{JSON.stringify({ configuration: e.configuration, scope: e.scope }, null, 2)}</pre></details>{e.suite.cases?.map(c => { const r = e.results?.find(r => r.caseId === c.id); const candidate = r?.candidate as { decision?: string; suggestedReply?: string | null } | undefined; return <details key={c.id}><summary>{c.kind} · {r?.classification ?? 'Not completed'} · {c.historicalCopilotRunId}</summary><h4>Immutable historical input</h4><pre>{JSON.stringify(c.input, null, 2)}</pre><div className="replay-comparison"><section><h4>Historical baseline</h4><p>{c.baseline.decision} · Human disposition: {c.baseline.disposition ?? 'None'}</p><p>{c.baseline.suggestedReply ?? 'No suggestion'}</p><h5>Historical final response</h5><p>{c.baseline.finalMessage ?? 'No final response recorded'}</p><pre>{JSON.stringify(c.baseline, null, 2)}</pre></section><section><h4>Candidate</h4><p>{candidate?.decision ?? "No decision recorded"}</p><p>{candidate?.suggestedReply ?? "No generated reply (retrieval-only, gated, or failed)"}</p><p>{r?.durationMs} ms</p><pre>{JSON.stringify(r?.comparison ?? {}, null, 2)}</pre><pre>{JSON.stringify(r?.candidate ?? {}, null, 2)}</pre></section></div></details>; })}</article>;
}
