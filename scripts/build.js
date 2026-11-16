'use strict';
const fs=require('node:fs'),path=require('node:path'),KM=require('../public/engine');
const root=path.join(__dirname,'..','public');let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
html=html.replace('<link rel="stylesheet" href="style.css">',()=>'<style>'+fs.readFileSync(path.join(root,'style.css'),'utf8')+'</style>');
for(const name of ['config.js','engine.js','tutor.js','store.js','features.js','app.js'])html=html.replace(`<script src="${name}"></script>`,()=>'<script>'+(name==='config.js'?'window.LEARNING_CONFIG={apiBase:"",discoverApi:false,pollMs:5000};':fs.readFileSync(path.join(root,name),'utf8')).replace(/<\/script/gi,'<\\/script')+'</script>');
fs.writeFileSync(path.join(root,'offline.html'),html);
const csv='\uFEFF样本,睡眠小时,运动分钟,睡眠分,运动分,数据来源\r\n'+KM.DATA.map((p,i)=>{const raw=KM.raw(p);return ['S'+(i+1),raw[0].toFixed(3),raw[1].toFixed(2),...p,'教学模拟'].join(',');}).join('\r\n');fs.writeFileSync(path.join(root,'data-40.csv'),csv);
console.log('已生成 public/offline.html 与 public/data-40.csv。');
