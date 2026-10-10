import {buildPgFoundationConfig} from "../postgres/config.js";
import {createPgPoolManager,type PgPoolManager} from "../postgres/pool.js";
import {buildAttachmentStorageConfig} from "../attachments/attachmentStorageConfig.js";
import {createSupabaseAttachmentStorageAdapter} from "../attachments/attachmentStorageAdapter.js";
import {createPortalDocumentsService} from "../services/portalDocumentsService.js";
import {createPortalAccountService} from "../services/portalAccountService.js";
export function createPortalPrivacyRuntime(){
 let pool:PgPoolManager|null=null;
 function getPool(){return pool??(pool=createPgPoolManager(buildPgFoundationConfig()))}
 return {
  getServices(){const p=getPool();return {documents:createPortalDocumentsService(p,createSupabaseAttachmentStorageAdapter(buildAttachmentStorageConfig())),account:createPortalAccountService(p)}},
  async shutdown(){if(pool){const p=pool;pool=null;await p.shutdown()}}
 };
}
