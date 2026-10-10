import assert from "node:assert/strict";
import test from "node:test";
import {cents,peso,draftInvoiceAmounts,FinanceInputError} from "./invoiceMoney.js";
const original={amount_charged:"1000.00",discount_type:"Senior Citizen/PWD",discount_percent:"20.00",discount_amount:"200.00",net_amount_due:"800.00",amount_paid:"0.00",balance:"800.00"};
test("cent parsing is exact and rejects negative or precision overflow",()=>{
 assert.equal(cents("0.01"),1);assert.equal(cents("1000.05"),100005);
 assert.equal(peso(100005),"1000.05");
 for(const bad of [-1,1.001,"1.001","-1.00","Infinity","1e5",null])assert.throws(()=>cents(bad),FinanceInputError);
});
test("Senior and PWD overlap is a single 20 percent discount",()=>{
 assert.deepEqual(draftInvoiceAmounts(original),{subtotal:"1000.00",discountTotal:"200.00",totalAmount:"800.00",amountPaid:"0.00",balanceDue:"800.00"});
 assert.deepEqual(draftInvoiceAmounts({...original,discount_type:"PWD"}),draftInvoiceAmounts(original));
});
test("legacy paid or inconsistent totals are never silently invoiced",()=>{
 for(const change of [{amount_paid:"1.00",balance:"799.00"},{discount_percent:"40.00",discount_amount:"400.00",net_amount_due:"600.00",balance:"600.00"},{balance:"0.00"},{discount_amount:"201.00"}]){
  assert.throws(()=>draftInvoiceAmounts({...original,...change}),FinanceInputError);
 }
});
