import { useState } from "react";
import { cloudAuthEnabled } from "../lib/cloudAuth";
import { downloadProtectedExport, getExportUrl } from "../lib/api";

export default function ProtectedExportLink({path, className, children, onClick}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  if(!cloudAuthEnabled) return <a href={getExportUrl(path)} onClick={onClick} className={className}>{children}</a>;
  async function download(){
    if(busy)return;
    setBusy(true);setError("");
    try{await downloadProtectedExport(path);onClick?.();}
    catch{setError("Export failed. Retry after checking your session.");}
    finally{setBusy(false);}
  }
  return <span className="inline-flex flex-col gap-1">
    <button type="button" className={className} disabled={busy} onClick={download}>
      {busy?"Preparing export…":children}
    </button>
    {error?<span role="alert" className="text-xs text-rose-700">{error}</span>:null}
  </span>;
}
