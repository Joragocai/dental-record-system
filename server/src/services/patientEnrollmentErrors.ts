export type PatientEnrollmentErrorCode = "INVALID_INPUT" | "NOT_ELIGIBLE" | "ALREADY_LINKED" | "EMAIL_CONFLICT" | "IDENTITY_UNVERIFIED" | "PERSISTENCE_ERROR";
const messages: Record<PatientEnrollmentErrorCode,string> = {
 INVALID_INPUT:"Patient enrollment details are invalid.", NOT_ELIGIBLE:"Patient enrollment is not authorized.",
 ALREADY_LINKED:"Patient enrollment is not available for this record.", EMAIL_CONFLICT:"Patient enrollment cannot use this email.",
 IDENTITY_UNVERIFIED:"Patient identity verification is required.", PERSISTENCE_ERROR:"Patient enrollment could not be saved safely."
};
const statuses:Record<PatientEnrollmentErrorCode,number>={INVALID_INPUT:400,NOT_ELIGIBLE:403,ALREADY_LINKED:409,EMAIL_CONFLICT:409,IDENTITY_UNVERIFIED:403,PERSISTENCE_ERROR:503};
export class PatientEnrollmentError extends Error {
 readonly status:number;
 constructor(readonly code:PatientEnrollmentErrorCode){super(messages[code]);this.name="PatientEnrollmentError";this.status=statuses[code]}
}
export function toPatientEnrollmentError(error:unknown):PatientEnrollmentError {
 if(error instanceof PatientEnrollmentError)return error;
 if(error && typeof error==="object" && "code" in error && error.code==="23505")return new PatientEnrollmentError("ALREADY_LINKED");
 return new PatientEnrollmentError("PERSISTENCE_ERROR");
}
