const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const KM=require('../public/engine'),{createApp}=require('../server');
const alternative=[KM.HAND[2],KM.HAND[4],KM.HAND[6]];
function finish(s){KM.startHand(s,KM.INITIAL);s.evidence.distance={attempts:[{answer:{value:'2',cluster:'0'},passed:true,hints:0,at:'2026-11-16'}],hints:0,passed:true};s.evidence.mean={attempts:[{answer:{x:'8',y:'1.7'},passed:true,hints:0,at:'2026-11-16'}],hints:0,passed:true};const r=KM.run(KM.HAND,3,{initial:s.initialCenters});s.centers=r.centers;s.labels=r.labels;s.updated=true;s.converged=true;s.repeatCount=1;s.step=5;s.exploreView=5;s.completed[1]=true;return s;}
test('整数样本初始化；每一步回看显示对应中心且不改进度；同一起点不重置证据',()=>{
 assert(KM.sampleCenters(KM.INITIAL));assert(!KM.sampleCenters([KM.HAND[0],KM.HAND[0],KM.HAND[6]]));assert(!KM.sampleCenters([[8.4,6.2],[8.6,1],[2.5,1.7]]));
 const s=finish(KM.newState('甲','一班')),original=KM.clone(s),means=[[8,6],[8,5/3],[2.5,1.5]];
 assert.deepEqual(KM.handView(s,0).centers,[]);assert.deepEqual(KM.handView(s,1).centers,KM.INITIAL);assert.deepEqual(KM.handView(s,2).centers,KM.INITIAL);assert.deepEqual(KM.handView(s,3).centers,means);assert.deepEqual(KM.handView(s,4).centers,means);assert.deepEqual(s,original);
 assert.equal(KM.startHand(s,KM.INITIAL),false);assert.equal(s.step,5);assert.equal(s.exploreView,2);assert(s.evidence.distance.passed);assert(s.completed[1]);
});
test('重新初始化归档旧作答，不继承通过状态，也不删除40点实验与成果',()=>{
 const s=finish(KM.newState('甲','一班')),snapshot=KM.handSnapshot(s);s.reason='比较两种 k 后的解释';s.experiments={3:{seed:100}};
 KM.startHand(s,alternative);assert.deepEqual(s.handHistory,[snapshot]);assert.equal(s.handRound,1);assert.equal(s.step,2);assert(!s.completed[1]);assert(!s.converged);assert.deepEqual(s.evidence,KM.newEvidence());assert.equal(s.reason,'比较两种 k 后的解释');assert.deepEqual(s.experiments,{3:{seed:100}});
});
test('旧版小数起点与旧默认起点原样保留，可切换整数样本',()=>{
 for(const init of [undefined,[[8.4,6.2],[8.6,1],[2.5,1.7]]]){const s=KM.newState('旧记录','一班');s.version=1;delete s.exploreView;delete s.handRound;delete s.handHistory;s.step=2;if(init)s.initialCenters=init;KM.upgradeState(s);assert.deepEqual(s.initialCenters,init||KM.LEGACY_INITIAL);assert.deepEqual(KM.handView(s,2).centers,init||KM.LEGACY_INITIAL);KM.startHand(s,KM.INITIAL);assert.deepEqual(s.handHistory[0].initialCenters,init||KM.LEGACY_INITIAL);assert.deepEqual(s.centers,KM.INITIAL);}
});
test('云端接受回看、重新初始化及多轮离线补传；拒绝丢失历史或篡改已有作答',async t=>{
 const server=createApp({dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'sleep-review-')),teacherKey:'review'});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 const api=async(route,data,token)=>{const r=await fetch(base+'/api/'+route,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,data:await r.json()};};
 const teacher=(await api('teacher/login',{key:'review'})).data,room=(await api('teacher/create',{name:'回看测试'},teacher.token)).data,student=(await api('join',{name:'甲',className:room.name,code:room.code})).data;let s=finish(student.state);
 assert.equal((await api('save',{state:s},student.token)).status,200);s.exploreView=2;assert.equal((await api('save',{state:s},student.token)).status,200);s=(await api('me',undefined,student.token)).data.state;assert(s.completed[1]);assert.equal(s.step,5);assert.equal(s.exploreView,2);
 const bad=KM.clone(s);bad.initialCenters=alternative;assert.equal((await api('save',{state:bad},student.token)).status,400);
 KM.startHand(s,alternative);assert.equal((await api('save',{state:s},student.token)).status,200);s=(await api('me',undefined,student.token)).data.state;assert(!s.evidence.distance.passed);assert(s.handHistory[0].evidence.distance.passed);
 const erased=KM.clone(s);erased.handHistory=[];assert.equal((await api('save',{state:erased},student.token)).status,400);
 const tampered=KM.clone(s);tampered.handHistory[0].evidence.distance.attempts[0].answer.value='3';assert.equal((await api('save',{state:tampered},student.token)).status,400);
 KM.startHand(s,KM.INITIAL);KM.startHand(s,alternative);assert.equal((await api('save',{state:s},student.token)).status,200);assert.equal((await api('me',undefined,student.token)).data.state.handHistory.length,3);
});
