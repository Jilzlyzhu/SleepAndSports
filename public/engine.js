(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.KM=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const HAND=[[8,6],[7,7],[9,5],[8,2],[7,1],[9,2],[2,1],[3,2]];
  const INITIAL=[[7,7],[7,1],[2,1]];
  const LEGACY_INITIAL=[[7,8],[9,1],[1,2]];
  const TYPES=['满格型','蓄能型','待机型'];
  const clone=x=>JSON.parse(JSON.stringify(x));
  function rng(seed){return function(){let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
  function distance2(a,b){return a.reduce((v,x,i)=>v+(x-b[i])**2,0);}
  function nearest(p,centers){let best=0;for(let i=1;i<centers.length;i++)if(distance2(p,centers[i])<distance2(p,centers[best])-1e-12)best=i;return best;}
  function assign(points,centers){return points.map(p=>nearest(p,centers));}
  function update(points,labels,centers){return centers.map((old,j)=>{const members=points.filter((_,i)=>labels[i]===j);return members.length?old.map((_,d)=>members.reduce((v,p)=>v+p[d],0)/members.length):old.slice();});}
  function movement(a,b){return Math.max(...a.map((p,i)=>Math.sqrt(distance2(p,b[i]))));}
  function normalize(sleep,move){if(!Number.isFinite(sleep)||!Number.isFinite(move)||sleep<0||sleep>24||move<0||move>1440)throw Error('请填写有效时长：睡眠 0–24 小时，运动 0–1440 分钟。');return [(sleep-6)/3*10,move/90*10];}
  function raw(p){return [6+p[0]*.3,p[1]*9];}
  function gaussian(r){return Math.sqrt(-2*Math.log(Math.max(r(),1e-12)))*Math.cos(2*Math.PI*r());}
  function generate(){const r=rng(20261116),centers=[[8,7],[8,1.5],[2.5,1.5]],counts=[14,13,13];return centers.flatMap((c,g)=>Array.from({length:counts[g]},()=>c.map((v,d)=>{const lo=g===2&&d===0?1:d===0?7:g===0?5:0,hi=g===2&&d===0?4:d===0?9:g===0?9:3;return Math.round(Math.max(lo,Math.min(hi,v+gaussian(r)*.5))*100)/100;})));}
  const LEGACY_DATA=generate(),DATA_VERSION='continuous-v2',LEGACY_DATA_VERSION='three-clouds-v1';
  // A broad, continuous teaching distribution, with no planted class labels.
  // Fixed coordinates keep comparisons across k and classroom devices reproducible.
  const DATA=[[6.2,4.7],[7.4,3.5],[2,6.3],[8.8,6.1],[3.9,5.4],[1.9,5.2],[5.7,6.3],[4.8,3.5],[5.3,5.6],[8,5],[5.6,7.9],[8.9,3.9],[5.2,2.4],[6.6,7.2],[6.7,5],[5.6,5],[4.3,8.2],[9.3,4.3],[4,4.2],[3.1,2.5],[3.5,4.6],[2.5,2.7],[8.2,8.3],[8.2,3.2],[4.2,2.4],[2.5,2],[5.6,3.6],[3.2,3.6],[5.3,7.2],[7.2,4.7],[6.9,6.6],[6.3,3.7],[6.9,8.2],[4.3,0.9],[3.3,5.6],[2.8,8.2],[5,0.8],[6,7],[6.4,2.6],[4.9,1.5]];
  function dataset(version){if(version===DATA_VERSION)return DATA;if(!version||version===LEGACY_DATA_VERSION)return LEGACY_DATA;throw Error('无法识别这份样本，请刷新页面。');}
  function upgradeDataset(s){
    if(s.datasetVersion===DATA_VERSION)return false;
    if(s.datasetVersion&&s.datasetVersion!==LEGACY_DATA_VERSION)throw Error('无法识别这份样本，请刷新页面。');
    if(Object.keys(s.experiments||{}).length||s.reason||s.named||s.selftest){
      s.previousDataset=clone({datasetVersion:LEGACY_DATA_VERSION,experiments:s.experiments,k:s.k,reason:s.reason,names:s.names,named:s.named,selftest:s.selftest,selfRatings:s.selfRatings,completed:s.completed.slice(2),nameFeedback:s.nameFeedback,nameFeedbackSource:s.nameFeedbackSource});
    }
    s.datasetVersion=DATA_VERSION;s.experiments={};s.reason='';s.names=[];s.named=false;s.selftest=null;s.selfRatings=[];s.completed[2]=false;s.completed[3]=false;delete s.nameFeedback;delete s.nameFeedbackSource;if(s.stage===3)s.stage=2;return true;
  }
  function run(points,k,options={}){
    if(!Array.isArray(points)||!points.length||!Number.isInteger(k)||k<1||k>points.length||points.some(p=>!Array.isArray(p)||p.length!==2||p.some(x=>!Number.isFinite(x))))throw Error('无效的聚类数据或 k 值');
    const random=options.random||rng(options.seed??101),restarts=options.initial?1:(options.restarts??24);let best;
    for(let r=0;r<restarts;r++){
      const ids=points.map((_,i)=>i);for(let i=ids.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}
      let centers=options.initial?clone(options.initial):ids.slice(0,k).map(i=>points[i].slice());
      const frames=[];let labels=[],converged=false;
      for(let i=0;i<100;i++){labels=assign(points,centers);const next=update(points,labels,centers),delta=movement(centers,next);frames.push({centers:clone(centers),next:clone(next),labels:labels.slice(),movement:delta});centers=next;if(delta<1e-8){converged=true;break;}}
      labels=assign(points,centers);const score=points.reduce((v,p,i)=>v+distance2(p,centers[labels[i]]),0);
      const used=new Set(labels).size,candidate={centers,labels,frames,score,converged,iterations:frames.length,used};
      if(!best||used>best.used||(used===best.used&&score<best.score))best=candidate;
    }
    return best;
  }
  function canonical(result){const order=result.centers.map((_,i)=>i).sort((a,b)=>result.centers[b][1]-result.centers[a][1]||result.centers[b][0]-result.centers[a][0]);return {...result,centers:order.map(i=>result.centers[i]),labels:result.labels.map(i=>order.indexOf(i))};}
  function permutations(arr){return arr.length?arr.flatMap((x,i)=>permutations(arr.filter((_,j)=>i!==j)).map(p=>[x,...p])):[[]];}
  function align(result,reference){let order,cost=Infinity;for(const p of permutations(result.centers.map((_,i)=>i))){const v=p.reduce((s,x,i)=>s+distance2(result.centers[x],reference[i]),0);if(v<cost){order=p;cost=v;}}return {...result,centers:order.map(i=>result.centers[i]),labels:result.labels.map(i=>order.indexOf(i))};}
  function feature(c){return `${c[0]>=6?'睡眠较多':c[0]>=3?'睡眠居中':'睡眠较少'} · ${c[1]>=4?'运动较多':'运动较少'}`;}
  function typed(c){return c[0]>=5?(c[1]>=4?0:1):2;}
  function newEvidence(){return {distance:{attempts:[],hints:0,passed:false},mean:{attempts:[],hints:0,passed:false}};}
  function newState(name,className){return {version:2,datasetVersion:DATA_VERSION,name,className,stage:0,completed:[false,false,false,false],vote:null,normalized:false,step:0,exploreView:0,handRound:0,handHistory:[],centers:clone(INITIAL),labels:Array(8).fill(-1),selected:0,assigned:false,updated:false,repeatCount:0,converged:false,evidence:newEvidence(),experiments:{},k:3,seed:100,reason:'',names:[],named:false,selftest:null,selfRatings:[],messages:[],updatedAt:new Date().toISOString()};}
  function sampleCenters(centers){return Array.isArray(centers)&&centers.length===3&&centers.every(c=>Array.isArray(c)&&c.length===2&&HAND.some(p=>p[0]===c[0]&&p[1]===c[1]))&&new Set(centers.map(c=>c.join(','))).size===3;}
  function handInitial(s){return s.initialCenters||(s.version===1?LEGACY_INITIAL:INITIAL);}
  function upgradeState(s){
    if(s.version===1&&(s.step>=2||['distance','mean'].some(k=>s.evidence[k].attempts.length||s.evidence[k].hints)))s.initialCenters=clone(handInitial(s));
    s.handRound??=0;s.handHistory??=[];s.exploreView??=s.step;s.version=2;upgradeDataset(s);return s;
  }
  function handSnapshot(s){return clone({round:s.handRound||0,initialCenters:handInitial(s),evidence:s.evidence,step:s.step,centers:s.centers,labels:s.labels,repeatCount:s.repeatCount,converged:s.converged,completed:s.completed[1]});}
  function startHand(s,centers){
    upgradeState(s);
    if(!sampleCenters(centers))throw Error('请选择三个不同的样本点作为初始中心。');
    if(s.initialCenters&&JSON.stringify(s.initialCenters)===JSON.stringify(centers)&&s.step>=2){s.exploreView=2;return false;}
    if(s.step>=2||['distance','mean'].some(k=>s.evidence[k].attempts.length||s.evidence[k].hints)){if(s.handRound>=100)throw Error('已保留 100 轮练习，请下载学习记录后另开一次体验。');s.handHistory.push(handSnapshot(s));s.handRound++;}
    s.initialCenters=clone(centers);s.centerDraft=clone(centers);s.centers=clone(centers);s.labels=Array(8).fill(-1);s.previous=[];s.selected=0;s.assigned=false;s.updated=false;s.repeatCount=0;s.converged=false;s.evidence=newEvidence();s.completed[1]=false;s.step=2;s.exploreView=2;return true;
  }
  // The displayed step is independent of progress: reviewing never rewinds evidence or the live iteration.
  function handView(s,step=s.exploreView??s.step){
    const initial=handInitial(s),firstLabels=assign(HAND,initial),firstMeans=update(HAND,firstLabels,initial);
    if(step===0)return {centers:[],labels:Array(8).fill(-1),previous:[]};
    if(step===1)return {centers:s.centerDraft||(sampleCenters(initial)?initial:INITIAL),labels:Array(8).fill(-1),previous:[]};
    if(step===2)return {centers:initial,labels:s.step===2?s.labels:firstLabels,previous:[]};
    if(step===3)return {centers:s.updated?firstMeans:initial,labels:firstLabels,previous:s.updated?initial:[]};
    return {centers:s.centers,labels:s.labels,previous:s.previous||[]};
  }
  function number(v){return v===null||v===undefined||String(v).trim()===''?NaN:Number(v);}
  function checkDistance(s,value,cluster){const expected=distance2(HAND[0],s.centers[0]);return Math.abs(number(value)-expected)<.02&&Number(cluster)===nearest(HAND[0],s.centers);}
  function checkMean(s,x,y){const labels=assign(HAND,s.centers),expected=update(HAND,labels,s.centers)[1];return Math.abs(number(x)-expected[0])<=.025&&Math.abs(number(y)-expected[1])<=.05;}
  function grade(e){return !e.passed?'待完成':e.hints?'提示后完成':e.attempts.length>1?'订正后完成':'首次独立完成';}
  function validateReason(s){const text=String(s.reason||'').trim();return Object.keys(s.experiments).length>=2&&text.length>=12&&text.length<=400;}
  return {HAND,INITIAL,LEGACY_INITIAL,TYPES,DATA,LEGACY_DATA,DATA_VERSION,LEGACY_DATA_VERSION,dataset,upgradeDataset,clone,rng,distance2,nearest,assign,update,movement,normalize,raw,run,canonical,align,feature,typed,newState,newEvidence,sampleCenters,handInitial,upgradeState,handSnapshot,startHand,handView,checkDistance,checkMean,grade,validateReason,number};
});
