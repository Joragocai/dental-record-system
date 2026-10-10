export class FinanceInputError extends Error {readonly status=400;constructor(){super("Billing values are invalid or require reconciliation.")}}
export function cents(value:unknown):number{
 if(typeof value!=="string"&&typeof value!=="number")throw new FinanceInputError();
 const text=String(value);
 if(!/^(0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(text))throw new FinanceInputError();
 const [whole,decimal=""]=text.split(".");
 const amount=Number(whole)*100+Number(decimal.padEnd(2,"0"));
 if(!Number.isSafeInteger(amount)||amount>999999999999)throw new FinanceInputError();
 return amount;
}
export function peso(value:number):string{
 if(!Number.isSafeInteger(value)||value<0||value>999999999999)throw new FinanceInputError();
 return Math.floor(value/100)+"."+(value%100).toString().padStart(2,"0");
}
export function draftInvoiceAmounts(treatment:{
 amount_charged:unknown;discount_type:unknown;discount_percent:unknown;
 discount_amount:unknown;net_amount_due:unknown;amount_paid:unknown;balance:unknown;
}){
 const gross=cents(treatment.amount_charged),discount=cents(treatment.discount_amount);
 const net=cents(treatment.net_amount_due),paid=cents(treatment.amount_paid),balance=cents(treatment.balance);
 const type=treatment.discount_type;
 if(!["None","Senior Citizen","PWD","Senior Citizen/PWD","Custom"].includes(String(type))||
   discount>gross||gross-discount!==net||net-paid!==balance||paid!==0)throw new FinanceInputError();
 const percent=Number(treatment.discount_percent);
 if(!Number.isFinite(percent)||percent<0||percent>100)throw new FinanceInputError();
 if(type==="Senior Citizen"||type==="PWD"||type==="Senior Citizen/PWD"){
  if(percent!==20||discount!==Math.floor((gross*20+50)/100))throw new FinanceInputError();
 }else if(type==="None"&&(percent!==0||discount!==0)){
  throw new FinanceInputError();
 }
 return {subtotal:peso(gross),discountTotal:peso(discount),totalAmount:peso(net),amountPaid:"0.00",balanceDue:peso(net)};
}
