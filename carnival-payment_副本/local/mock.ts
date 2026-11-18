// Local-only API adapter. No network calls, platform credentials or real transactions.
const card={cardUid:'22309',employeeMaskedName:'演示员工',cardLast4:'22309'};
const seed={families:[],payPasswordSet:true};
function state(){try{const s=JSON.parse(localStorage.getItem('carnival-demo')||'null')||structuredClone(seed);s.families=s.families.filter((f:any)=>f.id!=='demo-family');return s}catch{return structuredClone(seed)}}
function save(s:any){localStorage.setItem('carnival-demo',JSON.stringify(s))}
const order={id:'DEMO-001',paymentLedgerId:1,passCode:'0001',stallName:'家年华美食摊',payerName:'演示员工',employeeName:'演示员工',custNum:'22309',amountFen:1800,balanceAfterFen:28200,status:'SUCCESS',macOrdId:'DEMO-001',paidAt:'2026-11-17T04:30:00.000Z',createdAt:'2026-11-17T04:30:00.000Z'};
export async function localRequest(c:any):Promise<any>{
 const u=new URL(c.url,'http://localhost'), p=u.pathname, d=c.data||{}, s=state(), unbound=new URLSearchParams(location.search).has('unbound');
 const family=(token:string)=>s.families.find((f:any)=>f.linkToken===token)||s.families[0];
 if(p==='/api/employee/session')return {loggedIn:true,userId:'local-demo',userName:'演示员工',card:unbound?null:card,balance:282,inEventWindow:true};
 if(p==='/api/employee/auto-bind')return {bound:!unbound,custNum:unbound?null:'22309',reason:unbound?'NO_MATCH':null};
 if(p==='/api/employee/bind-card'){history.replaceState({},'',location.pathname);return {card:{...card,cardUid:d.custNum,cardLast4:d.custNum},openIdBound:false}}
 if(p==='/api/employee/identities')return {self:{displayName:'演示员工'},families:s.families,familyPayPassword:{payPasswordSet:s.payPasswordSet,payLocked:false},card,balance:282,familyLimit:5};
 if(p==='/api/employee/family' && c.method==='POST'){const id='family-'+Date.now();const identity={...d,id,linkToken:id,relationLabel:({spouse:'配偶',child:'子女',elder:'长辈',other:'其他'} as any)[d.relation],shared:false,status:'active'};s.families.push(identity);save(s);return {identity}}
 if(p.startsWith('/api/employee/family/')){const id=p.split('/')[4];if(c.method==='DELETE')s.families=s.families.filter((f:any)=>f.id!==id);else {const f=s.families.find((f:any)=>f.id===id);if(f)f.shared=true}save(s);return {deleted:true,shared:true}}
 if(p.includes('/pay-password')){s.payPasswordSet=true;save(s);return {payPasswordSet:true,unlocked:true}}
 if(p==='/api/employee/self-token')return {linkToken:'demo-self'};
 if(p==='/api/me/orders'||p==='/api/family/orders')return {balanceFen:28200,items:[order]};
 if(p.startsWith('/api/me/order/')||p.startsWith('/api/family/order/'))return {...order,refundable:true,refund:null};
 if(p.startsWith('/api/family/')){const f=family(p.split('/').at(-1));return {displayName:f?.displayName||'家人一号',relationLabel:f?.relationLabel||'配偶',employeeMaskedName:'演示员工',cardLast4:'22309',balance:282,inEventWindow:true,isSelf:false,payPasswordSet:s.payPasswordSet,payLocked:false}}
 if(p==='/api/merchant/session')return {loggedIn:true,userName:'演示摊主',binding:unbound?null:{pin:'A1b2',stallName:'家年华美食摊'}};
 if(p==='/api/merchant/bind'){history.replaceState({},'',location.pathname);return {pin:d.pin,stallNo:'0001',stallName:'家年华美食摊'}}
 if(p==='/api/merchant/summary')return {stallName:'家年华美食摊',netAmount:180,txCount:10,refundCount:0,refundAmount:0,commissionRate:0.05,commission:9,takeHome:171};
 if(p.startsWith('/api/merchant/stall-token'))return {stallToken:'ST-demo-local',stallNo:'0001',stallName:'家年华美食摊'};
 if(p==='/api/merchant/ledger')return [{txnNo:'DEMO-001',stallName:order.stallName,payerIdentity:'演示员工',amount:18,balanceAfter:282,status:'success',txnTime:order.paidAt,employeeName:'演示员工',employeeCustNum:'22309',operatorName:'自助扫码'}];
 if(p==='/api/merchant/refund/pending')return [];
 if(p==='/api/payment/stall-feed')return {transactions:[],cursor:u.searchParams.get('after')||new Date().toISOString()};
 if(p==='/api/pay/context')return {stall:{stallNo:'0001',stallName:'家年华美食摊'},payer:{displayName:'演示员工',relationLabel:'本人',employeeMaskedName:'演示员工',cardLast4:'22309'},balance:282,inEventWindow:true,code:'OK',passwordRequired:false};
 if(p==='/api/pay/precheck')return {commonKey:'DEMO',stallName:order.stallName,passCode:'0001',amountFen:Math.round(Number(d.amountYuan)*100),payerName:'演示员工',balanceFen:28200,note:'本地演示'};
 if(p==='/api/pay/confirm')return {status:'FAILED',macOrdId:'DEMO',failReason:'本地预览不执行真实扣款'};
 if(p==='/api/pay/verify-password')return {ok:true,remainingAttempts:5,locked:false,message:''};
 if(p==='/api/pay/first-login-notify')return {sent:false};
 if(p==='/api/admin/session')return {isAdmin:false,userName:'演示员工'};
 throw new Error('本地预览暂不支持此操作：'+p);
}
