export function HistoryPages({page, count, onChange}: {page:number; count:number; onChange:(page:number)=>void}) {
 return <nav aria-label="History pages"><button type="button" disabled={page===1} onClick={()=>onChange(page-1)}>Newer</button> <span>Page {page} · newest records first</span> <button type="button" disabled={count<50} onClick={()=>onChange(page+1)}>Older</button></nav>;
}
