const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const KM=require('../public/engine'),{createApp}=require('../server');
(async()=>{
 const server=createApp({dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'sleep-hand-ui-')),teacherKey:'review'});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}}),p=await context.newPage(),base='http://127.0.0.1:'+server.address().port,errors=[],failures=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.url().includes('/api/save')&&r.status()!==200)failures.push(r.status());});
  const post=async(route,data,token)=>{const r=await fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});assert.equal(r.status,200,await r.clone().text());return r.json();};
  const teacher=await post('teacher/login',{key:'review'}),room=await post('teacher/create',{name:'回退测试班'},teacher.token);
  await p.goto(base);await p.getByLabel('你的姓名').fill('回退同学');await p.getByLabel('所在班级').fill(room.name);await p.getByLabel('课堂码',{exact:true}).fill(room.code);await p.getByRole('button',{name:'进入作息实验室'}).click();
  const click=name=>p.getByRole('button',{name,exact:true}).click(),step=n=>p.locator(`[data-action="exploreView"][data-step="${n}"]`).click();
  await p.getByRole('button',{name:/满格型 睡够/}).click();await click('留下我的猜测 →');await click('继续下一环节 →');await click('一键标准化 →');await click('确认 k=3 →');
  assert.equal(await p.getByLabel('中心 A 的样本').inputValue(),'1');assert.equal(await p.getByLabel('中心 B 的样本').inputValue(),'4');assert.equal(await p.getByLabel('中心 C 的样本').inputValue(),'6');assert.equal(await p.locator('[data-center-axis]').count(),0);
  assert.equal(await p.getByLabel('中心 A 的样本').locator('option[value="4"]').getAttribute('disabled'),'');assert(await p.locator('[data-step="4"]').isDisabled());
  for(const width of [390,768,1440]){await p.setViewportSize({width,height:1000});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:path.join(__dirname,`../artifacts/hand-init-${width}.png`),fullPage:true});}
  await click('从这里开始分配 →');await p.getByLabel('到 A 的距离平方').fill('7');await p.getByLabel('最近的中心').selectOption('1');await click('检验我的判断');await click('需要一点提示？');
  await click('← 上一步');await p.getByLabel('中心 A 的样本').waitFor();await click('回到本轮分配 →');assert.equal(await p.getByLabel('到 A 的距离平方').inputValue(),'7');assert.equal(await p.getByLabel('最近的中心').inputValue(),'1');
  await p.getByLabel('到 A 的距离平方').fill('2');await p.getByLabel('最近的中心').selectOption('0');await click('检验我的判断');await click('其余点自动分配');await click('分配完成，计算均值 →');
  await p.getByLabel('新中心横坐标').fill('8');await p.getByLabel('新中心纵坐标').fill('1.7');await click('← 上一步');await p.getByRole('heading',{name:'按初始中心判断归属'}).waitFor();await click('继续回看下一步 →');assert.equal(await p.getByLabel('新中心纵坐标').inputValue(),'1.7');
  await click('检验我的均值');await click('重算均值 →');await click('继续下一轮 →');await click('再分配 → 再更新');await click('中心不动了，去总结 →');await click('完成探究 ✓');
  await step(2);await p.getByRole('heading',{name:'按初始中心判断归属'}).waitFor();assert.equal(await p.locator('[data-center="0"] title').textContent(),'中心 A (7, 7)');await step(3);assert.equal(await p.locator('[data-center="1"] title').textContent(),'中心 B (8, 1.67)');
  await p.screenshot({path:path.join(__dirname,'../artifacts/hand-review.png'),fullPage:true});await p.waitForFunction(()=>!JSON.parse(localStorage.getItem('sleep-kmeans-session-v1')).pending);await p.reload();await p.getByRole('heading',{name:'第一轮均值更新'}).waitFor();
  await click('← 上一环节');await p.getByRole('heading',{name:'先猜一猜，你是哪种作息星人？'}).waitFor();await click('继续下一环节 →');await step(1);await p.getByLabel('中心 A 的样本').selectOption('3');await click('用这些样本开始新一轮 →');await p.getByLabel('到 A 的距离平方').waitFor();assert.equal(await p.getByLabel('到 A 的距离平方').inputValue(),'');
  await p.waitForFunction(()=>!JSON.parse(localStorage.getItem('sleep-kmeans-session-v1')).pending);const ss=await p.evaluate(()=>JSON.parse(localStorage.getItem('sleep-kmeans-session-v1')));assert.equal(ss.state.handRound,1);assert.equal(ss.state.handHistory[0].evidence.distance.attempts.length,2);assert.equal(ss.state.evidence.distance.passed,false);assert.equal(ss.state.completed[1],false);
  await p.reload();await p.getByLabel('到 A 的距离平方').waitFor();assert.equal(await p.locator('[data-center="0"] title').textContent(),'中心 A (8, 2)');await p.locator('.hand-history summary').click();await p.locator('.hand-history').getByText('第 1 轮 · 已完成探究',{exact:true}).waitFor();
  const t=await context.newPage();await t.goto(base+'/?view=teacher');await t.getByText('查看作答过程与学习自评',{exact:true}).click();await t.getByText('此前手算记录（1 轮）',{exact:true}).click();await t.getByText('第 1 轮 · 已完成探究',{exact:true}).waitFor();
  // A legacy decimal record remains usable, then can switch to real samples.
  const legacy=KM.newState('旧版同学','离线班');legacy.version=1;legacy.stage=1;legacy.normalized=true;legacy.vote=0;legacy.completed[0]=true;legacy.step=2;legacy.centers=[[8.4,6.2],[8.6,1],[2.5,1.7]];legacy.initialCenters=KM.clone(legacy.centers);delete legacy.exploreView;delete legacy.handRound;delete legacy.handHistory;
  const l=await context.newPage();await l.goto(base+'/?mode=experience');await l.evaluate(state=>{localStorage.setItem('sleep-kmeans-v1',JSON.stringify({students:{legacy:state},rooms:{'离线班':{name:'离线班',unlocked:0,frozen:false}}}));localStorage.setItem('sleep-kmeans-session-local-v1',JSON.stringify({id:'legacy',mode:'local'}));},legacy);await l.reload();await l.getByLabel('到 A 的距离平方').waitFor();assert.equal(await l.locator('[data-center="0"] title').textContent(),'中心 A (8.4, 6.2)');await l.getByRole('button',{name:'← 上一步',exact:true}).click();await l.getByRole('button',{name:'用这些样本开始新一轮 →'}).click();await l.getByLabel('到 A 的距离平方').waitFor();assert.equal(await l.locator('[data-center="0"] title').textContent(),'中心 A (7, 7)');
  assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);console.log('PASS: 样本初始化、禁重复选择、逐步回退、草稿保留、历史中心、刷新恢复、换起点重算、教师历史、旧小数记录兼容、390/768/1440布局。');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
