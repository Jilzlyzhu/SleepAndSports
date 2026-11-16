const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('../server');
(async()=>{
 const server=createApp({dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'sleep-entry-')),teacherKey:'entry-test'});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext(),page=await context.newPage(),base='http://127.0.0.1:'+server.address().port,errors=[];
  page.on('pageerror',e=>errors.push(e.message));let joinRequests=0;page.on('request',r=>{if(r.url().endsWith('/api/join'))joinRequests++;});
  await page.goto(base);await page.getByLabel('你的姓名').fill('体验同学');await page.getByLabel('所在班级').fill('测试班');await page.getByLabel('课堂码',{exact:true}).fill('test01');await page.getByRole('button',{name:'进入作息实验室'}).click();await page.locator('#joinError').filter({hasText:'课堂码不存在'}).waitFor();assert.equal(joinRequests,1);
  await page.getByRole('button',{name:'无需课堂码，先体验 →'}).click();await page.waitForURL('**mode=experience');assert.equal(await page.getByLabel('课堂码',{exact:true}).count(),0);assert.equal(await page.getByLabel('你的姓名').inputValue(),'体验同学');assert.equal(await page.getByLabel('所在班级').inputValue(),'测试班');
  await page.getByRole('button',{name:'进入作息实验室'}).click();await page.getByRole('heading',{name:'先猜一猜，你是哪种作息星人？'}).waitFor();await page.getByRole('button',{name:/满格型 睡够/}).click();await page.getByRole('button',{name:'留下我的猜测 →'}).click();await page.getByRole('button',{name:'继续下一环节 →'}).waitFor();assert.equal(joinRequests,1);await page.reload();await page.getByRole('button',{name:'继续下一环节 →'}).waitFor();await page.locator('.brand').click();await page.waitForURL('**index.html?mode=experience');await page.getByRole('button',{name:'继续下一环节 →'}).waitFor();
  // A separate cloud record must survive a local experience session in the same browser.
  const post=async(route,data,token)=>{const r=await fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});assert.equal(r.status,200);return r.json();};
  const teacher=await post('teacher/login',{key:'entry-test'}),room=await post('teacher/create',{name:'正式课堂'},teacher.token),cloud=await post('join',{name:'正式同学',className:'正式课堂',code:room.code});
  await page.evaluate(record=>localStorage.setItem('sleep-kmeans-session-v1',JSON.stringify({...record,mode:'cloud'})),cloud);await page.goto(base+'/offline.html');await page.getByRole('button',{name:'继续下一环节 →'}).waitFor();await page.locator('.brand').click();assert(new URL(page.url()).pathname.endsWith('/offline.html'));await page.getByRole('button',{name:'退出',exact:true}).click();assert.equal(await page.getByLabel('课堂码',{exact:true}).count(),0);await page.getByRole('link',{name:'教师工作台 ↗'}).click();await page.getByRole('heading',{name:'每一步探索，都有迹可循'}).waitFor();assert.equal(await page.getByLabel('教师口令').count(),0);const localLink=await page.getByRole('link',{name:'打开学生入口 ↗'}).getAttribute('href');assert(new URL(localLink).pathname.endsWith('/offline.html'));
  await page.goto(base);await page.getByRole('heading',{name:'先猜一猜，你是哪种作息星人？'}).waitFor();assert(await page.locator('.identity').innerText().then(t=>t.includes('正式同学')));assert.deepEqual(errors,[]);
  // Direct experience URL works without any classroom service or pre-created code.
  const fresh=await browser.newPage({viewport:{width:390,height:844}});await fresh.goto(base+'/index.html?mode=experience');await fresh.getByLabel('你的姓名').waitFor();assert.equal(await fresh.getByLabel('课堂码',{exact:true}).count(),0);assert(await fresh.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  console.log('PASS: test01错误可见且可转体验；姓名班级保留；免码进入、投票、刷新；离线首页与教师入口不跳云端；正式会话保留；移动布局无溢出。');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
