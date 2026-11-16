'use strict';
// Optional reference classroom service. Static public/ can also be deployed separately.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const KM=require('./public/engine'),Tutor=require('./public/tutor'),{createAI}=require('./ai-service');
function createApp(options={}){
 const dir=options.dataDir||process.env.DATA_DIR||path.join(__dirname,'data');fs.mkdirSync(dir,{recursive:true});
 const dbfile=path.join(dir,'classroom.json'),keyfile=path.join(dir,'teacher-access.txt');
 const random=()=>crypto.randomBytes(24).toString('hex'),hash=v=>crypto.createHash('sha256').update(v).digest('hex');
 let key=options.teacherKey||process.env.TEACHER_KEY;if(!key){if(!fs.existsSync(keyfile))fs.writeFileSync(keyfile,random(),{mode:0o600});key=fs.readFileSync(keyfile,'utf8').trim();}
 let db=fs.existsSync(dbfile)?JSON.parse(fs.readFileSync(dbfile,'utf8')):{rooms:{},students:{},sessions:{}};
 const ai=createAI({dir,fetchImpl:options.fetchImpl,allowLocalEndpoints:options.allowLocalEndpoints,env:options.aiEnv||process.env}),artDir=path.join(dir,'artwork'),artBusy=new Set();
 let queue=Promise.resolve();const limits=new Map();
 function save(){const snapshot=JSON.stringify(db);queue=queue.catch(()=>{}).then(async()=>{await fs.promises.writeFile(dbfile+'.tmp',snapshot,{mode:0o600});await fs.promises.rename(dbfile+'.tmp',dbfile);});return queue;}
 function fail(status,msg){const e=Error(msg);e.status=status;throw e;}
 function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
 function clean(v,max=100){return typeof v==='string'?v.trim().slice(0,max):'';}
 function equal(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
 function token(req){return String(req.headers.authorization||'').replace(/^Bearer /,'');}
 function localTeacher(req){
  const enabled=options.allowLocalTeacher??(process.env.NODE_ENV!=='production'&&process.env.ALLOW_LOCAL_TEACHER!=='false');
  if(!enabled||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return false;
  const host=req.headers.host||'';
  if(!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host))return false;
  if(Object.keys(req.headers).some(h=>h==='forwarded'||h==='via'||h==='x-real-ip'||h.startsWith('x-forwarded-')))return false;
  if(req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))return false;
  if(req.headers.origin){try{const origin=new URL(req.headers.origin);if(origin.host.toLowerCase()!==host.toLowerCase()||!['http:','https:'].includes(origin.protocol))return false;}catch{return false;}}
  return true;
 }
 function session(req,role){const s=db.sessions[hash(token(req))];if(!s||s.expires<Date.now())fail(401,'请重新登录课堂。');if(s.role!==role)fail(403,'没有访问此功能的权限。');return s;}
 function student(req){const sess=session(req,'student'),s=db.students[sess.id];if(!s)fail(401,'学生记录已失效。');if(db.rooms[s.code]?.deletedAt)fail(410,'这个班级已被教师删除，请联系教师恢复或加入其他课堂。');return s;}
 function makeSession(role,id){const t=random();db.sessions[hash(t)]={role,id,expires:Date.now()+(role==='teacher'?12:168)*3600000};return t;}
 function rate(k,max=30){const now=Date.now(),old=limits.get(k);const v=old&&now-old.at<60000?old:{at:now,count:0};v.count++;limits.set(k,v);if(v.count>max)fail(429,'操作较频繁，请稍后再试。');if(limits.size>10000)for(const [id,x]of limits)if(now-x.at>120000)limits.delete(id);}
 async function body(req){let b='';for await(const chunk of req){b+=chunk;if(Buffer.byteLength(b)>500000)fail(413,'提交内容过大。');}try{return JSON.parse(b||'{}');}catch{fail(400,'提交格式无法读取。');}}
 function roomFor(s){const r=db.rooms[s.code];if(!r)fail(404,'课堂不存在。');return r;}
 function roomPublic(r){const votes=[0,0,0];Object.values(db.students).filter(s=>s.code===r.code).forEach(s=>{if(Number.isInteger(s.state.vote)&&s.state.vote>=0&&s.state.vote<3)votes[s.state.vote]++;});return {code:r.code,name:r.name,unlocked:r.unlocked,frozen:r.frozen,votes,artwork:publishedArt(r)};}
 function view(s){return {id:s.id,state:KM.upgradeState(KM.clone(s.state)),room:roomPublic(roomFor(s))};}
 function validateState(incoming,old){
   if(!incoming||typeof incoming!=='object'||Array.isArray(incoming))fail(400,'无效的学习记录。');
   const s=KM.clone(incoming);s.name=old.name;s.className=old.className;
   if(old.datasetVersion===KM.DATA_VERSION&&s.datasetVersion!==KM.DATA_VERSION)fail(409,'教学样本已更新，请刷新页面后继续，已有记录会保留。');
   if(![0,1,2,3].includes(s.stage)||!Array.isArray(s.completed)||s.completed.length!==4||s.completed.some(x=>typeof x!=='boolean')||![2,3,4].includes(s.k))fail(400,'学习记录中的环节或 k 无效。');
   if(s.vote!==null&&![0,1,2].includes(s.vote))fail(400,'无效的投票。');
   if(!s.evidence||!s.experiments||!Array.isArray(s.centers)||s.centers.length!==3||s.centers.some(c=>!Array.isArray(c)||c.length!==2||c.some(v=>!Number.isFinite(v))))fail(400,'学习证据不完整。');
   const oldRound=old.handRound||0,round=s.handRound||0,history=s.handHistory||[],oldHistory=old.handHistory||[];
   if(!Number.isInteger(round)||round<oldRound||round>100||!Array.isArray(history)||history.length!==round)fail(400,'手算轮次记录无效。');
   if(!Number.isInteger(s.step)||s.step<0||s.step>5||(s.exploreView!==undefined&&(!Number.isInteger(s.exploreView)||s.exploreView< -1||s.exploreView>s.step)))fail(400,'手算步骤无效。');
   const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
   function verifyRound(record,existing,index){
     const init=record.initialCenters||KM.handInitial(record);
     if(!Array.isArray(init)||init.length!==3||init.some(c=>!Array.isArray(c)||c.length!==2||c.some(x=>!Number.isFinite(x)||x<0||x>10)))fail(400,'初始中心无效。');
     const locked=existing&&(existing.initialCenters||existing.step>=2);
     if(locked&&!same(KM.handInitial(existing),init))fail(400,'更换起点时，请保留此前的手算记录并开启新一轮。');
     if(!locked&&(record.step>=2||index<round)&&!KM.sampleCenters(init))fail(400,'请选择三个不同的样本点作为初始中心。');
     for(const field of ['distance','mean']){
       const e=record.evidence?.[field],prior=existing?.evidence?.[field];
       if(!e||!Array.isArray(e.attempts)||e.attempts.length>1000||!Number.isInteger(e.hints)||e.hints<0)fail(400,'作答记录不完整。');
       if(prior&&(e.hints<prior.hints||e.attempts.length<prior.attempts.length||prior.attempts.some((a,i)=>!same(a.answer,e.attempts[i].answer)||a.hints!==e.attempts[i].hints||a.at!==e.attempts[i].at)))fail(400,'不能移除或改写已记录的作答或提示。');
       e.attempts.forEach(a=>{if(!a.answer)fail(400,'作答内容不完整。');a.passed=field==='distance'?KM.checkDistance({centers:init},a.answer.value,a.answer.cluster):KM.checkMean({centers:init},a.answer.x,a.answer.y);});e.passed=e.attempts.some(a=>a.passed);
     }
   }
   history.forEach((h,i)=>{if(h.round!==i)fail(400,'历史轮次不连续。');if(i<oldRound&&!same(h,oldHistory[i]))fail(400,'不能改写历史手算记录。');verifyRound(h,i<oldRound?oldHistory[i]:i===oldRound?old:null,i);});
   verifyRound(s,round===oldRound?old:null,round);
   // Preserve legacy coordinates before upgrading the state schema.
   const legacyIncoming=s.datasetVersion!==KM.DATA_VERSION;
   KM.upgradeState(s);
   const preserved=KM.upgradeState(KM.clone(old)).previousDataset;
   if(!legacyIncoming&&preserved)s.previousDataset=preserved;
   s.completed[0]=s.vote!==null;
   if(s.completed[1]&&(!s.evidence.distance.passed||!s.evidence.mean.passed||!s.converged||s.step!==5))fail(400,'请先完成距离、均值和收敛任务。');
   const experimentKeys=Object.keys(s.experiments);if(experimentKeys.some(k=>!['2','3','4'].includes(k)))fail(400,'无效的实验记录。');
   for(const k of experimentKeys){const record=s.experiments[k];if(!record||!Number.isInteger(record.seed)||record.seed<0||record.seed>1000000000)fail(400,'实验起点记录无效。');record.result=KM.canonical(KM.run(KM.DATA,+k,{seed:record.seed}));}
   s.reason=clean(s.reason,400);if(s.completed[2]&&!KM.validateReason(s))fail(400,'请比较至少两种 k 并填写理由。');
   if(s.reasonReview?.key===Tutor.reasonKey(s))s.reasonReview={key:s.reasonReview.key,text:clean(s.reasonReview.text,300),source:clean(s.reasonReview.source,40),at:clean(s.reasonReview.at,30)};else delete s.reasonReview;
   if(!Array.isArray(s.names)||s.names.length>4||s.names.some(n=>typeof n!=='string'||n.length>16))fail(400,'簇名格式无效。');
   s.names=s.names.map(n=>n.trim());if(s.named&&(s.names.length!==s.k||s.names.some(n=>!n)||new Set(s.names).size!==s.k||!s.experiments[s.k]))fail(400,'请完成不同簇的命名。');
   if(s.selftest){if(!s.named)fail(400,'请先命名再自测。');const t=s.selftest,point=KM.normalize(t.sleep,t.move),result=KM.align(KM.run([...KM.DATA,point],s.k,{seed:2026}),s.experiments[s.k].result.centers);s.selftest={...t,point,result,cluster:result.labels[40],type:KM.typed(result.centers[result.labels[40]])};}
   if(!Array.isArray(s.selfRatings)||s.selfRatings.length>5||s.selfRatings.some(r=>!['完全做到','基本做到','还需努力'].includes(r)))fail(400,'自评格式无效。');
   if(s.completed[3]&&(!s.selftest||s.selfRatings.length!==5))fail(400,'请完成自测和五项自评。');
   if(!Array.isArray(s.messages)||s.messages.length>30)fail(400,'对话记录过长。');s.messages=s.messages.map(m=>({role:m.role==='user'?'user':'assistant',text:clean(m.text,500),source:clean(m.source,30)}));s.updatedAt=new Date().toISOString();return s;
 }
 function publishedArt(r){return {cover:r.artwork?.cover||null,cards:r.artwork?.cards||{}};}
 async function chat(s,event,question){const fallback=()=>({text:Tutor.fallback(event,s,question),source:'本地导学'});if(s.stage===1&&(!s.evidence.distance.passed||!s.evidence.mean.passed))return fallback();if(!ai.enabled('chat'))return fallback();
  const context={stage:s.stage,k:s.k,names:s.names,reason:s.reason,passed:{distance:s.evidence.distance.passed,mean:s.evidence.mean.passed},selftest:s.selftest?{cluster:s.selftest.cluster,feature:KM.feature(s.selftest.result.centers[s.selftest.cluster]),guess:KM.TYPES[s.vote]}:null};
  try{if(event==='reason'){if(!KM.validateReason(s)||!s.experiments[s.k]?.result)return fallback();return await ai.chat([{role:'system',content:Tutor.REASON_SYSTEM},{role:'user',content:JSON.stringify(Tutor.reasonContext(s,KM.dataset(s.datasetVersion)))}]);}return await ai.chat([{role:'system',content:Tutor.SYSTEM},...(s.messages||[]).slice(-6).map(m=>({role:m.role==='user'?'user':'assistant',content:m.text})),{role:'user',content:JSON.stringify({event,context,question})}]);}catch{return {...fallback(),source:'本地导学 · 在线服务暂不可用'};}}
 function imagePrompt(kind,type,style){const styles={paper:'柔和纸艺拼贴，细腻纸张纹理，奶油色背景、鼠尾草绿、珊瑚橙与雾蓝配色',watercolor:'清透水彩插画，温柔纸张纹理，柔和自然光，绿色、蓝色和暖橙色',space:'精致3D黏土风格，圆润友好，微缩星球，柔和光影和留白'};const scene=kind==='cover'?'横向视觉构图，以星球、月亮、太阳、植物和运动元素构成丰富有层次的作息探索世界':type===0?'一个精神饱满的友好星球角色，在晨光与运动元素旁':type===1?'一个安静舒展的友好星球角色，周围是月亮、书本与休憩元素':'一个温柔好奇的友好星球角色，周围是夜空、云朵与微光';return '为高中人工智能课堂“作息星球”创作高品质装饰插画。'+styles[style]+'。'+scene+'。主体完整，适合裁切为封面或卡片。不要文字、字母、数字、图表、坐标、真实人物或医疗暗示，不评价人格或优劣。';}
 async function generateArtwork(req,b){session(req,'teacher');const r=db.rooms[clean(b.code,20)];if(!r||r.deletedAt)fail(404,'未找到课堂。');if(!['cover','card'].includes(b.kind)||!['paper','watercolor','space'].includes(b.style)||(b.kind==='card'&&![0,1,2].includes(b.type)))fail(400,'请选择图片用途与风格。');if(artBusy.has(r.code))fail(409,'这个班级已有图片正在生成，请稍候。');rate('image:'+r.code,6);artBusy.add(r.code);try{const generated=await ai.image(imagePrompt(b.kind,b.type,b.style));if(r.deletedAt)fail(409,'班级已删除，图片未应用。');await fs.promises.mkdir(artDir,{recursive:true});const id=random(),filename=id+'.'+generated.extension;await fs.promises.writeFile(path.join(artDir,filename),generated.bytes,{mode:0o600});const art={id,kind:b.kind,type:b.kind==='card'?b.type:null,style:b.style,source:generated.source,model:generated.model,createdAt:new Date().toISOString()};db.artworks??={};db.artworks[id]={...art,code:r.code,filename,mime:generated.mime};r.artwork??={cards:{}};r.artwork.draft=art;await save();return art;}finally{artBusy.delete(r.code);}}
 const staticNames=new Set(['index.html','style.css','config.js','engine.js','store.js','tutor.js','features.js','app.js','offline.html','data-40.csv']);
 const server=http.createServer(async(req,res)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');const origin=req.headers.origin,allow=process.env.APP_ORIGIN;if(allow&&origin===allow){res.setHeader('Access-Control-Allow-Origin',allow);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');}if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  try{const u=new URL(req.url,'http://localhost'),p=u.pathname,m=req.method;if(p.startsWith('/api/')){
   if(p==='/api/health'&&m==='GET')return send(res,200,{app:'sleep-kmeans',version:'1.2.0',localTeacher:localTeacher(req),ai:ai.enabled('chat'),images:ai.enabled('image')});
   if(p==='/api/teacher/local-login'&&m==='POST'){if(!localTeacher(req))fail(403,'自动进入仅限教师电脑本机，远程访问请使用教师身份。');rate('local-teacher:'+req.socket.remoteAddress,30);await body(req);const current=db.sessions[hash(token(req))];if(current?.role==='teacher'&&current.expires>Date.now())return send(res,200,{token:token(req)});const t=makeSession('teacher');await save();return send(res,200,{token:t});}
   if(p==='/api/teacher/login'&&m==='POST'){rate('login:'+req.socket.remoteAddress,12);const b=await body(req);if(!equal(clean(b.key,500),key))fail(401,'教师口令不正确。');const t=makeSession('teacher');await save();return send(res,200,{token:t});}
   if(p==='/api/join'&&m==='POST'){rate('join:'+req.socket.remoteAddress,120);const b=await body(req),r=db.rooms[clean(b.code,20)],name=clean(b.name,24),className=clean(b.className,40);if(!r||r.deletedAt)fail(404,'课堂码不存在或已删除，请向老师确认。');if(!name||!className)fail(400,'请填写姓名和班级。');if(className!==r.name)fail(400,'班级名称应为“'+r.name+'”，请核对。');if(r.frozen)fail(409,'课堂已定格，请打开课后图鉴。');const id=random(),state=KM.newState(name,className),s={id,code:r.code,state};db.students[id]=s;const t=makeSession('student',id);await save();return send(res,200,{...view(s),token:t});}
   if(p==='/api/me'&&m==='GET')return send(res,200,view(student(req)));
   if(p==='/api/save'&&m==='POST'){const s=student(req);rate('save:'+s.id,180);if(roomFor(s).frozen)fail(409,'课堂成果已定格，当前改动只保存在本机。');const b=await body(req);s.state=validateState(b.state,s.state);await save();return send(res,200,{ok:true,updatedAt:s.state.updatedAt});}
   if(p==='/api/chat'&&m==='POST'){const s=student(req);rate('chat:'+s.id,24);const b=await body(req),event=clean(b.event,30),question=clean(b.question,500);if(event==='reason'&&b.reasonKey!==undefined&&b.reasonKey!==Tutor.reasonKey(s.state))fail(409,'理由或实验已变更，请保存当前方案后再获取反馈。');return send(res,200,await chat(s.state,event,question));}
   if(p==='/api/teacher'&&m==='GET'){session(req,'teacher');return send(res,200,{rooms:Object.values(db.rooms).filter(r=>!r.deletedAt).map(r=>({...roomPublic(r),artwork:r.artwork||{cards:{}}})),deletedRooms:Object.values(db.rooms).filter(r=>r.deletedAt).map(r=>({code:r.code,name:r.name,deletedAt:r.deletedAt})),students:Object.values(db.students).filter(s=>!db.rooms[s.code]?.deletedAt).map(s=>({id:s.id,code:s.code,state:KM.upgradeState(KM.clone(s.state))}))});}
   if(p==='/api/teacher/ai-settings'&&m==='GET'){session(req,'teacher');return send(res,200,ai.publicSettings());}
   if(p==='/api/teacher/ai-settings'&&m==='POST'){session(req,'teacher');const b=await body(req);return send(res,200,await ai.update(b.kind,b.settings||{}));}
   if(p==='/api/teacher/ai-test'&&m==='POST'){session(req,'teacher');rate('ai-test',10);await body(req);const answer=await ai.chat([{role:'system',content:'你是连接测试助手。请用中文简短回复连接成功。'},{role:'user',content:'连接测试'}]);return send(res,200,{ok:true,...answer});}
   if(['/api/teacher/delete','/api/teacher/restore'].includes(p)&&m==='POST'){session(req,'teacher');const b=await body(req),r=db.rooms[clean(b.code,20)];if(!r)fail(404,'未找到课堂。');if(p.endsWith('/delete')){if(b.confirmName!==r.name)fail(400,'删除确认与班级不一致，请重新操作。');r.deletedAt=new Date().toISOString();}else delete r.deletedAt;await save();return send(res,200,{ok:true});}
   if(p==='/api/teacher/artwork/generate'&&m==='POST')return send(res,200,await generateArtwork(req,await body(req)));
   if(p==='/api/teacher/artwork/apply'&&m==='POST'){session(req,'teacher');const b=await body(req),r=db.rooms[clean(b.code,20)],a=db.artworks?.[b.id];if(!r||r.deletedAt||!a||a.code!==r.code||r.artwork?.draft?.id!==a.id)fail(400,'请先生成并预览当前图片。');const art=r.artwork.draft;if(art.kind==='cover')r.artwork.cover=art;else{r.artwork.cards??={};r.artwork.cards[art.type]=art;}delete r.artwork.draft;await save();return send(res,200,publishedArt(r));}
   if(p==='/api/artwork'&&m==='GET'){const a=db.artworks?.[u.searchParams.get('id')],r=a&&db.rooms[a.code];if(!a||!r||r.deletedAt)fail(404,'图片不存在。');const auth=db.sessions[hash(token(req))],valid=auth&&auth.expires>Date.now(),isPublished=[r.artwork?.cover,...Object.values(r.artwork?.cards||{})].some(x=>x?.id===a.id);const canRead=valid&&(auth.role==='teacher'||auth.role==='student'&&db.students[auth.id]?.code===r.code&&isPublished)||r.frozen&&isPublished;if(!canRead)fail(403,'没有访问此图片的权限。');const bytes=await fs.promises.readFile(path.join(artDir,a.filename));return send(res,200,{dataUrl:'data:'+a.mime+';base64,'+bytes.toString('base64')});}
   if(p==='/api/teacher/create'&&m==='POST'){session(req,'teacher');const b=await body(req),name=clean(b.name,40);if(!name)fail(400,'请填写班级名称。');let code;do{code=crypto.randomBytes(3).toString('hex').toUpperCase();}while(db.rooms[code]);const r={code,name,unlocked:0,frozen:false,createdAt:new Date().toISOString()};db.rooms[code]=r;await save();return send(res,200,roomPublic(r));}
   if(['/api/teacher/unlock','/api/teacher/freeze','/api/teacher/unfreeze'].includes(p)&&m==='POST'){session(req,'teacher');const b=await body(req),r=db.rooms[clean(b.code,20)];if(!r||r.deletedAt)fail(404,'未找到课堂。');if(p.endsWith('/unlock')){if(![0,1,2,3].includes(b.stage))fail(400,'无效环节。');r.unlocked=b.stage;}
    if(p.endsWith('/freeze')){const snap=b.snapshot;if(!snap||![2,3,4].includes(snap.k)||!Array.isArray(snap.names)||snap.names.length!==snap.k||snap.names.some(n=>typeof n!=='string'||!n.trim()||n.length>16)||!Array.isArray(snap.centers)||snap.centers.length!==snap.k||snap.centers.some(c=>!Array.isArray(c)||c.length!==2||c.some(v=>!Number.isFinite(v)))||!Array.isArray(snap.labels)||snap.labels.length!==40||snap.labels.some(l=>!Number.isInteger(l)||l<0||l>=snap.k))fail(400,'请选取一份完整的命名成果。');if(![undefined,KM.DATA_VERSION,KM.LEGACY_DATA_VERSION].includes(snap.datasetVersion))fail(400,'无效的样本版本。');r.snapshot={datasetVersion:snap.datasetVersion||KM.LEGACY_DATA_VERSION,k:snap.k,centers:snap.centers,labels:snap.labels,names:snap.names,reason:clean(snap.reason,400),participantCount:Object.values(db.students).filter(s=>s.code===r.code).length,frozenAt:new Date().toISOString()};r.frozen=true;}
    if(p.endsWith('/unfreeze'))r.frozen=false;await save();return send(res,200,roomPublic(r));}
   if(p==='/api/atlas'&&m==='GET'){const r=db.rooms[clean(u.searchParams.get('code'),20)];if(!r||r.deletedAt||!r.frozen||!r.snapshot)fail(404,'这个课堂还没有定格成果。');return send(res,200,{name:r.name,snapshot:r.snapshot,artwork:publishedArt(r)});}
   fail(404,'接口不存在。');
  }
  if(m!=='GET'&&m!=='HEAD')fail(405,'不支持此请求。');const name=p==='/'?'index.html':decodeURIComponent(p.slice(1));if(!staticNames.has(name))fail(404,'页面不存在。');const file=path.join(__dirname,'public',name);if(!fs.existsSync(file))fail(404,'文件不存在。');const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.csv':'text/csv'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'Content-Type':mime+'; charset=utf-8','Cache-Control':'no-cache'});if(m==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
  }catch(e){if(!res.headersSent)send(res,e.status||400,{error:e.status?e.message:'请求未完成，请检查输入后重试。'});else res.end();}
 });return server;
}
if(require.main===module){const server=createApp(),port=Number(process.env.PORT||4186);server.listen(port,'0.0.0.0',()=>console.log(`作息星球已启动：http://localhost:${port}\n教师端：http://localhost:${port}/?view=teacher\n本机教师端自动进入；远程教师身份由部署配置管理。`));}
module.exports={createApp};
