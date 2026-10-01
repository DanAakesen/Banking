import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import * as figures from './public/voice-transcript.js';

const source=(await readFile(new URL('./public/voice.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace('export function setupVoice','function setupVoice').replaceAll('import.meta.url',JSON.stringify('http://127.0.0.1:5450/voice.js'));
function harness(getUserMedia, handleApi = async()=>undefined){
 const elements=new Map(),peers=[],requests=[],errors=[],messages=[],states=[],captions=[],timers=[];
 const element=id=>{
  if(!elements.has(id)){const classes=new Set();elements.set(id,{dataset:{},hidden:false,disabled:false,attributes:{},textContent:'',
   classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name),contains:name=>classes.has(name)},
   setAttribute(name,value){this.attributes[name]=value;},replaceChildren(){},append(){},play:async()=>{}});}
  return elements.get(id);
 };
 class Peer{
  constructor(){this.iceGatheringState='complete';peers.push(this);}
  addTrack(){} async createOffer(){return {sdp:'v=0 test'};}
  async setLocalDescription(value){this.localDescription=value;}
  async setRemoteDescription(){}
  createDataChannel(){return this.channel={readyState:'open',sent:[],send(value){this.sent.push(JSON.parse(value));},close(){this.readyState='closed';}};}
  close(){this.closed=true;}
 }
 const scope={t:value=>value,document:{getElementById:element,createElement:()=>element(Symbol()),createTextNode:value=>value},navigator:{mediaDevices:{getUserMedia}},location:{search:''},URL,URLSearchParams,
  crypto:webcrypto,RTCPeerConnection:Peer,window:{addEventListener(){}},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},setInterval:()=>1,clearInterval(){},Map,Set,console,...figures};
 vm.runInNewContext(source+'\nthis.setupVoice=setupVoice;',scope);
 const voice=scope.setupVoice({api:async(path,data)=>{requests.push({path,data});return await handleApi(path,data)??{id:'voice_test',transport:{sdp:'answer'}};},context:()=>({}),apply:async()=>{},onState:value=>states.push(value),onCaption:value=>captions.push(value),onError:message=>errors.push(message),onTranscript:message=>messages.push(message)});
 return {button:element('voice-start'),element,peers,requests,errors,messages,states,captions,voice,timers};
}

test('one voice button becomes Stop while connecting and cancels late microphone permission safely',async()=>{
 let grant,stops=0;const h=harness(()=>new Promise(resolve=>grant=resolve));
 const starting=h.button.onclick();
 assert.equal(h.button.attributes['aria-label'],'Stop voice');assert.equal(h.button.disabled,false);
 assert.equal(h.button.classList.contains('is-voice-active'),true);
 await h.button.onclick();
 assert.equal(h.button.attributes['aria-label'],'Start voice');assert.equal(h.peers[0].closed,true);
 grant({getTracks:()=>[{stop:()=>stops++}]});await starting;
 assert.equal(stops,1);assert.equal(h.requests.length,0);
});

test('same Stop button closes connected voice and audio never reveals a player',async()=>{
 let stops=0;const track={stop:()=>stops++};const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
 const h=harness(async()=>stream);h.element('voice-audio').hidden=true;
 await h.button.onclick();
 h.peers[0].channel.onmessage({data:JSON.stringify({type:'session.started'})});
 assert.equal(h.button.attributes['aria-label'],'Stop voice');assert.equal(h.button.disabled,false);
 assert.equal(h.element('voice-audio').hidden,true);
 h.voice.notify('The background analysis failed.');
 assert.equal(h.peers[0].channel.sent.at(-1).type,'session.commentary.append');
 await h.button.onclick();assert.equal(stops,1);assert.equal(h.button.disabled,true);
 assert.equal(h.peers[0].channel.sent.at(-1).type,'session.close');
 h.peers[0].channel.onmessage({data:JSON.stringify({type:'session.closed'})});
 assert.equal(h.button.attributes['aria-label'],'Start voice');assert.equal(h.button.disabled,false);assert.equal(h.errors.length,0);
});

test('microphone failure restores the button and reports in the conversation',async()=>{
 const h=harness(async()=>{throw Object.assign(new Error('denied'),{name:'NotAllowedError'});});
 await h.button.onclick();assert.equal(h.button.attributes['aria-label'],'Start voice');
 assert.equal(h.errors.length,1);assert.match(h.errors[0],/Microphone access was declined/);
});

test('voice startup cannot speak or delegate before new user input',async()=>{
 const track={stop(){}};const h=harness(async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]}));
 await h.button.onclick();const channel=h.peers[0].channel;
 const event=value=>channel.onmessage({data:JSON.stringify(value)});
 event({type:'session.started'});
 event({type:'session.output_transcript.delta',delta:'Invented question'});
 event({type:'session.delegation.created',delegation:{id:'unsolicited'}});
 assert.equal(h.element('voice-audio').muted,true);assert.equal(h.messages.length,0);
 assert.equal(channel.sent.length,0);assert.equal(h.requests.filter(x=>x.path==='voice/delegate').length,0);
 event({type:'session.input_transcript.delta',delta:'Hello',start_ms:100,end_ms:400});
 assert.equal(h.element('voice-audio').muted,false);assert.equal(h.messages[0].role,'user');
 assert.equal(channel.sent[0].type,'session.thinking.append');
 event({type:'session.output_transcript.delta',delta:'How can I help?',start_ms:500,end_ms:900});
 assert.equal(h.messages[1].role,'assistant');assert.equal(h.messages[1].text,'How can I help?');
 event({type:'session.closed'});
});

test('companion state and replacing captions follow assistant speech only and clear on user input and stop',async()=>{
 const track={stop(){}};const h=harness(async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]}));
 await h.button.onclick();assert.equal(h.states.at(-1).state,'connecting');
 const event=value=>h.peers[0].channel.onmessage({data:JSON.stringify(value)});
 event({type:'session.started'});assert.equal(h.states.at(-1).state,'listening');
 event({type:'session.output_transcript.delta',delta:'Unsolicited'});assert.equal(h.captions.length,0);
 event({type:'session.input_transcript.delta',delta:'My question'});assert.equal(h.captions.at(-1),'');
 event({type:'session.output_transcript.delta',delta:'Car is behind. '});
 event({type:'session.output_transcript.delta',delta:'The shortfall is 2500.'});
 assert.equal(h.captions.at(-1),'Car is behind. The shortfall is 2500.');assert.equal(h.states.at(-1).state,'speaking');
 event({type:'session.input_transcript.delta',delta:'Thanks'});assert.equal(h.captions.at(-1),'');
 await h.voice.end();event({type:'session.closed'});assert.equal(h.states.at(-1).active,false);assert.equal(h.captions.at(-1),'');
});

test('tool activity starts at delegation and clears before preparing the spoken response',async()=>{
 let complete;const track={stop(){}};
 const h=harness(async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]}),async path=>path==='voice/delegate'?await new Promise(resolve=>complete=resolve):undefined);
 await h.button.onclick();const event=value=>h.peers[0].channel.onmessage({data:JSON.stringify(value)});
 event({type:'session.started'});event({type:'session.input_transcript.delta',delta:'Read my accounts'});
 event({type:'session.delegation.created',delegation:{id:'tool-1'}});h.timers.find(x=>x.ms===300).fn();
 await new Promise(setImmediate);assert.equal(h.states.at(-1).toolActive,true);
 complete({tool:'read_accounts',result:{spokenAnswer:'Your accounts are ready.'}});
 await new Promise(setImmediate);assert.equal(h.states.at(-1).toolActive,false);assert.equal(h.states.at(-1).state,'working');
 event({type:'session.output_transcript.delta',delta:'Your accounts are ready.'});assert.equal(h.states.at(-1).state,'speaking');
 event({type:'session.closed'});assert.equal(h.states.at(-1).toolActive,false);
});

test('closing while a tool is pending clears activity and ignores the late tool result',async()=>{
 let complete;const track={stop(){}};
 const h=harness(async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]}),async path=>path==='voice/delegate'?await new Promise(resolve=>complete=resolve):undefined);
 await h.button.onclick();const event=value=>h.peers[0].channel.onmessage({data:JSON.stringify(value)});
 event({type:'session.started'});event({type:'session.input_transcript.delta',delta:'Read my accounts'});
 event({type:'session.delegation.created',delegation:{id:'tool-2'}});h.timers.find(x=>x.ms===300).fn();
 await new Promise(setImmediate);assert.equal(h.states.at(-1).toolActive,true);
 event({type:'session.closed'});const count=h.states.length;
 complete({tool:'read_accounts',result:{spokenAnswer:'Too late.'}});await new Promise(setImmediate);
 assert.equal(h.states.at(-1).toolActive,false);assert.equal(h.states.at(-1).active,false);assert.equal(h.states.length,count);
});

test('a failed delegated tool clears activity and reports the failure',async()=>{
 const track={stop(){}};
 const h=harness(async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]}),async path=>{
  if(path==='voice/delegate')throw new Error('Tool unavailable');
 });
 await h.button.onclick();const event=value=>h.peers[0].channel.onmessage({data:JSON.stringify(value)});
 event({type:'session.started'});event({type:'session.input_transcript.delta',delta:'Read my accounts'});
 event({type:'session.delegation.created',delegation:{id:'tool-failure'}});h.timers.find(x=>x.ms===300).fn();
 await new Promise(setImmediate);
 assert.equal(h.states.at(-1).toolActive,false);
 assert.ok(h.states.some(x=>x.toolActive));
 assert.equal(h.element('voice-status').textContent,'Tool unavailable');
 assert.match(JSON.stringify(h.peers[0].channel.sent.at(-1)),/requested action did not complete/);
 event({type:'session.closed'});
});

test('empty verified voice answers cannot fall back to fixture balances',async()=>{
 const track={stop(){}};
 const h=harness(async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]}),async path=>path==='voice/delegate'?{tool:'clarify',result:{spokenAnswer:'',income:50000,expenses:30000,savings:184000,available:32500,categories:[]}}:undefined);
 await h.button.onclick();const event=value=>h.peers[0].channel.onmessage({data:JSON.stringify(value)});
 event({type:'session.started'});event({type:'session.input_transcript.delta',delta:'Read savings'});
 event({type:'session.delegation.created',delegation:{id:'empty-answer'}});h.timers.find(x=>x.ms===300).fn();await new Promise(setImmediate);
 const result=h.peers[0].channel.sent.filter(x=>x.type==='session.commentary.append').at(-1).content;
 assert.match(result,/No verified financial answer/);assert.doesNotMatch(result,/184000|32500/);
 event({type:'session.closed'});
});

test('spoken figures without verified evidence are flagged once and corrected; verified figures pass',async()=>{
 const track={stop(){}};
 const h=harness(async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]}),async path=>path==='voice/delegate'?{tool:'read_banking_data',result:{savingsBalance:326400,accounts:[{name:'Lønkonto',available:75388,booked:75563}],spokenAnswer:'Opsparing: 326.400 kr. Lønkonto: 75.388 kr. til rådighed.'}}:undefined);
 await h.button.onclick();const event=value=>h.peers[0].channel.onmessage({data:JSON.stringify(value)});
 const corrections=()=>h.peers[0].channel.sent.filter(x=>x.type==='session.commentary.append'&&/Correction required/.test(x.content));
 const settle=()=>h.timers.filter(x=>x.ms===1500).at(-1).fn();
 event({type:'session.started'});event({type:'session.input_transcript.delta',delta:'How much have I saved?'});
 // Speaking before any delegation: nothing is verified yet.
 event({type:'session.output_transcript.delta',delta:'You have about 184,000 DKK saved.'});settle();
 assert.deepEqual([...h.messages.at(-1).unverified],['184,000 DKK']);assert.equal(corrections().length,1);assert.match(corrections()[0].content,/184,000 DKK/);
 event({type:'session.output_transcript.delta',delta:' Sorry, the 184,000 DKK was not verified.'});settle();
 assert.equal(corrections().length,1);
 event({type:'session.input_transcript.delta',delta:'Please check it'});
 event({type:'session.delegation.created',delegation:{id:'checked'}});h.timers.find(x=>x.ms===300).fn();await new Promise(setImmediate);
 const facts=h.peers[0].channel.sent.filter(x=>x.type==='session.commentary.append').at(-1).content;
 assert.match(facts,/do not round, estimate/);assert.match(facts,/326\.400 kr\./);
 event({type:'session.output_transcript.delta',delta:'Your savings are 326,400 DKK and about 75,000 DKK is available.'});settle();
 assert.equal(h.messages.at(-1).unverified,undefined);assert.equal(corrections().length,1);
 event({type:'session.closed'});
});

test('earlier conversation amounts are removed before the voice model sees them, and unverified answer figures are disclosed',async()=>{
 const track={stop(){}};
 const h=harness(async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]}),async path=>path==='voice/delegate'?{tool:'read_banking_data',result:{spokenAnswer:'Savings are 326,400 DKK.',unverifiedFigures:['9,999 DKK']}}:undefined);
 await h.button.onclick();const event=value=>h.peers[0].channel.onmessage({data:JSON.stringify(value)});
 event({type:'session.started'});event({type:'session.input_transcript.delta',delta:'Savings?'});
 const context=h.peers[0].channel.sent.find(x=>x.type==='session.thinking.append').content;
 assert.match(context,/earlier amounts are removed/);
 event({type:'session.delegation.created',delegation:{id:'disclose'}});h.timers.find(x=>x.ms===300).fn();await new Promise(setImmediate);
 const facts=h.peers[0].channel.sent.filter(x=>x.type==='session.commentary.append').at(-1).content;
 assert.match(facts,/could not be matched to Banking records: 9,999 DKK/);
 event({type:'session.closed'});
});