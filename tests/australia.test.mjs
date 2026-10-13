import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../public/js/australia-ui.js',import.meta.url),'utf8');
const data=JSON.parse(readFileSync(new URL('../public/data/australia.json',import.meta.url)));
function harness(response=data, ok=true){
 const window={},view={innerHTML:'',querySelector:()=>({addEventListener(){}})};
 vm.runInNewContext(code,{window,fetch:async()=>({ok,json:async()=>response}),location:{},FormData});
 return {ui:window.StreamBoxAustralia,view};
}
test('all 391 distinct source entries retain their guide identifiers without fake streams',()=>{
 assert.equal(data.channels.length,391);assert.equal(new Set(data.channels.map(c=>c.siteId)).size,391);
 assert(data.channels.every(c=>c.name&&c.guideId&&!('url' in c)));
 assert(data.channels.some(c=>c.name==='A&E'));assert.match(data.source,new RegExp(data.revision));
});
test('stream matching uses exact guide IDs and rejects wrong regional names, dead and non-stream records',async()=>{
 const {ui}=harness();await ui.ready;
 const entry={name:'Nine Sydney',siteId:'Nine-Syd',guideId:'Nine Sydney'};
 const stream={type:'live',url:'https://example.test/live.m3u8',tvgId:'Nine-Syd'};
 assert.equal(ui.matchingStreams(entry,[stream]).length,1);
 for(const other of [{...stream,tvgId:'Nine-Mel',name:'Nine Sydney'},{...stream,dead:true},{...stream,isPlaylist:true},{...stream,url:'javascript:bad()'},{...stream,type:'movie'}])assert.equal(ui.matchingStreams(entry,[other]).length,0);
});
test('directory renders all entries and searches regional identifiers; titles are escaped',async()=>{
 const {ui,view}=harness();await ui.ready;ui.render(view,'',{streams:[],card:()=>''});
 assert.equal((view.innerHTML.match(/<article /g)||[]).length,391);assert.match(view.innerHTML,/Stream not supplied/);
 ui.render(view,'Nine-Syd',{streams:[],card:()=>''});assert.match(view.innerHTML,/Nine Sydney/);assert(!view.innerHTML.includes('Prime Canberra'));
 const unsafe=harness({country:'Australia',channels:[{siteId:'evil',guideId:'<script>',name:'<img onerror=bad()>'}]});await unsafe.ui.ready;unsafe.ui.render(unsafe.view,'',{streams:[],card:()=>''});assert(!unsafe.view.innerHTML.includes('<img'));assert.match(unsafe.view.innerHTML,/&lt;script&gt;/);
});
test('failed or malformed catalog renders a recoverable error',async()=>{
 for(const h of [harness({},false),harness({country:'Australia',channels:[{}]})]){await h.ui.ready;h.ui.render(h.view,'',{streams:[],card:()=>''});assert.match(h.view.innerHTML,/Please reload/);}
});
