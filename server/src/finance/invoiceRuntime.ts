import {buildPgFoundationConfig} from "../postgres/config.js";
import {createPgPoolManager} from "../postgres/pool.js";
import {createInvoiceDraftService} from "./invoiceDraftService.js";
import {createInvoiceLifecycleService} from "./invoiceLifecycleService.js";
export function createInvoiceRuntime(){
 let service:ReturnType<typeof createInvoiceDraftService>|null=null;
 let lifecycle:ReturnType<typeof createInvoiceLifecycleService>|null=null;
 let pool:ReturnType<typeof createPgPoolManager>|null=null;
 const getPool=()=>pool??(pool=createPgPoolManager(buildPgFoundationConfig()));
 return {getService(){return service??(service=createInvoiceDraftService(getPool()))},
 getLifecycle(){return lifecycle??(lifecycle=createInvoiceLifecycleService(getPool()))}};
}
