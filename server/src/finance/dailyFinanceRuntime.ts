import {createPgPoolManager} from "../postgres/pool.js";
import {buildPgFoundationConfig} from "../postgres/config.js";
import {createDailyFinanceService} from "./dailyFinanceService.js";
export function createDailyFinanceRuntime(){
 let service:ReturnType<typeof createDailyFinanceService>|null=null;
 return {getService(){return service??(service=createDailyFinanceService(createPgPoolManager(buildPgFoundationConfig())))}}; 
}
