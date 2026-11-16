const test=require('node:test'),assert=require('node:assert/strict'),KM=require('../public/engine'),{createApp}=require('../server'),{legacyState,legacyFixture}=require('./fixtures/legacy-dataset');
test('样本升级保留手算与旧实验原文，不沿用旧结论；重复升级不清空新实验',()=>{
 const old=legacyState(),s=KM.upgradeState(KM.clone(old));assert.equal(s.datasetVersion,KM.DATA_VERSION);assert.equal(s.stage,2);assert.deepEqual(s.completed,[true,true,false,false]);assert.deepEqual(s.evidence,old.evidence);assert.deepEqual(s.experiments,{});assert.equal(s.reason,'');assert.equal(s.selftest,null);
 assert.deepEqual(s.previousDataset.experiments,old.experiments);assert.deepEqual(s.previousDataset.selftest,old.selftest);assert.equal(s.previousDataset.reason,old.reason);assert.deepEqual(s.previousDataset.names,old.names);
 s.experiments[4]={seed:100,result:KM.run(KM.DATA,4,{seed:100})};const snapshot=KM.clone(s);KM.upgradeState(s);assert.deepEqual(s,snapshot);
});
test('新样本不再呈现三个分离点团；k=2/3/4都存在边界样本',()=>{
 function silhouette(points,labels){return points.reduce((sum,p,i)=>{const means=[...new Set(labels)].map(k=>{const others=points.filter((_,j)=>j!==i&&labels[j]===k);return {k,d:others.reduce((a,q)=>a+Math.sqrt(KM.distance2(p,q)),0)/others.length};});const a=means.find(x=>x.k===labels[i]).d,b=Math.min(...means.filter(x=>x.k!==labels[i]).map(x=>x.d));return sum+(b-a)/Math.max(a,b);},0)/points.length;}
 const old=silhouette(KM.LEGACY_DATA,KM.run(KM.LEGACY_DATA,3,{seed:100}).labels),scores=[];
 for(const k of [2,3,4]){const r=KM.run(KM.DATA,k,{seed:100}),score=silhouette(KM.DATA,r.labels);scores.push(score);assert(score<.6);assert(score<old-.2);assert(r.centers.every((_,i)=>r.labels.filter(l=>l===i).length>=5));}
 assert(Math.max(...scores)-Math.min(...scores)<.1);
});
test('正式课堂升级、旧图鉴保留原样本、保存与教师导出不混用数据版本',async t=>{
 const f=legacyFixture(),server=createApp({dataDir:f.dir,teacherKey:'fixture'});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 const api=async(route,data,token=f.token)=>{const r=await fetch(base+'/api/'+route,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,data:await r.json()};};
 let s=(await api('me')).data.state;assert.equal(s.datasetVersion,KM.DATA_VERSION);assert.deepEqual(s.previousDataset.experiments,f.state.experiments);assert.deepEqual((await api('atlas?code=FROZEN')).data.snapshot,f.snapshot);assert.deepEqual(KM.dataset(f.snapshot.datasetVersion),KM.LEGACY_DATA);
 const teacher=(await api('teacher',undefined,f.teacherToken)).data;assert.equal(teacher.students[0].state.previousDataset.reason,f.state.reason);
 for(const k of [2,3,4])s.experiments[k]={seed:100,result:{tampered:true}};s.reason='比较两类和四类后，选择三类便于说明中间过渡样本的差异。';s.completed[2]=true;s.previousDataset.reason='不能改写归档';assert.equal((await api('save',{state:s})).status,200);
 s=(await api('me')).data.state;assert.equal(s.previousDataset.reason,f.state.reason);assert.deepEqual(s.experiments[3].result,KM.canonical(KM.run(KM.DATA,3,{seed:100})));assert.equal((await api('save',{state:f.state})).status,409);
 s.names=['运动较多','睡眠较多','运动较少'];s.named=true;s.selftest={sleep:8.4,move:54};s.selfRatings=Array(5).fill('基本做到');s.completed[3]=true;assert.equal((await api('save',{state:s})).status,200);s=(await api('me')).data.state;const r=s.experiments[3].result;
 assert.deepEqual(s.selftest.result,KM.align(KM.run([...KM.DATA,KM.normalize(8.4,54)],3,{seed:2026}),r.centers));const snap={datasetVersion:KM.DATA_VERSION,k:3,centers:r.centers,labels:r.labels,names:s.names,reason:s.reason};assert.equal((await api('teacher/freeze',{code:'CHANGE',snapshot:snap},f.teacherToken)).status,200);assert.equal((await api('atlas?code=CHANGE')).data.snapshot.datasetVersion,KM.DATA_VERSION);
});
