const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),KM=require('../../public/engine');
function legacyState(){
 const s=KM.newState('旧样本同学','样本更新班');delete s.datasetVersion;s.vote=0;s.normalized=true;s.step=5;s.exploreView=5;s.stage=3;s.initialCenters=KM.clone(KM.INITIAL);
 s.evidence.distance={attempts:[{answer:{value:'2',cluster:'0'},passed:true,hints:0,at:'2026-11-16'}],hints:0,passed:true};s.evidence.mean={attempts:[{answer:{x:'8',y:'1.7'},passed:true,hints:0,at:'2026-11-16'}],hints:0,passed:true};
 const hand=KM.run(KM.HAND,3,{initial:s.initialCenters});s.centers=hand.centers;s.labels=hand.labels;s.updated=true;s.converged=true;s.repeatCount=1;s.completed=[true,true,true,true];
 for(const k of [2,3])s.experiments[k]={seed:100,at:'2026-11-16',result:KM.canonical(KM.run(KM.LEGACY_DATA,k,{seed:100}))};s.reason='旧样本中三个群体间隔明显，我选择三类并比较了两类。';s.names=['晨光型','充电型','月亮型'];s.named=true;s.selfRatings=Array(5).fill('基本做到');
 const point=KM.normalize(8.4,54),result=KM.align(KM.run([...KM.LEGACY_DATA,point],3,{seed:2026}),s.experiments[3].result.centers);s.selftest={sleep:8.4,move:54,point,result,cluster:result.labels[40],type:KM.typed(result.centers[result.labels[40]]),at:'2026-11-16'};return s;
}
function legacyFixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sleep-dataset-')),state=legacyState(),token='dataset-student-test',teacherToken='dataset-teacher-test',hash=t=>crypto.createHash('sha256').update(t).digest('hex'),r=state.experiments[3].result;
 const snapshot={k:3,centers:r.centers,labels:r.labels,names:state.names,reason:state.reason,participantCount:1,frozenAt:'2026-11-16'};
 const db={rooms:{CHANGE:{code:'CHANGE',name:state.className,unlocked:0,frozen:false},FROZEN:{code:'FROZEN',name:'旧班级图鉴',unlocked:0,frozen:true,snapshot}},students:{old:{id:'old',code:'CHANGE',state}},sessions:{[hash(token)]:{role:'student',id:'old',expires:Date.now()+3600000},[hash(teacherToken)]:{role:'teacher',expires:Date.now()+3600000}}};fs.writeFileSync(path.join(dir,'classroom.json'),JSON.stringify(db));return {dir,state,snapshot,token,teacherToken};
}
module.exports={legacyState,legacyFixture};
