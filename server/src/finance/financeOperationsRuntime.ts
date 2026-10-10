import {createPgPoolManager} from "../postgres/pool.js";
import {buildPgFoundationConfig} from "../postgres/config.js";
import {createFinanceOperationsService} from "./financeOperationsService.js";
export function createFinanceOperationsRuntime(){
 let service:ReturnType<typeof createFinanceOperationsService>|null=null;
 return {getService(){return service??(service=createFinanceOperationsService(createPgPoolManager(buildPgFoundationConfig())))}};
}
