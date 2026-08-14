export interface ServerTypeScriptProof {
  readonly runtime: "node";
  readonly version: number;
}

export function createServerTypeScriptProof(version: number): ServerTypeScriptProof {
  return {
    runtime: "node",
    version
  };
}
