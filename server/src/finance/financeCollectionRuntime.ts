import {createPgPoolManager} from "../postgres/pool.js";
import {buildPgFoundationConfig} from "../postgres/config.js";
import {createFinanceCollectionService} from "./financeCollectionService.js";
export function createFinanceCollectionRuntime(){
 let service:ReturnType<typeof createFinanceCollectionService>|null=null;
 return {getService(){return service??(service=createFinanceCollectionService(createPgPoolManager(buildPgFoundationConfig())))}}; 
}
