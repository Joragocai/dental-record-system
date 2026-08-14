import type { ReactElement } from "react";
import { clientTypeScriptProof } from "./types/proof";

export function renderClientTypeScriptProof(): ReactElement {
  return <span data-proof={clientTypeScriptProof.name}>{clientTypeScriptProof.name}</span>;
}
