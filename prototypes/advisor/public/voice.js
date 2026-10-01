import {t} from './i18n.js';
import {evidenceValues,ungroundedAmounts,redactAmounts} from './voice-transcript.js';
// Voice belongs to the trusted shell. The generated iframe never sees audio or provider credentials.
export function setupVoice({ api, context, apply, onTranscript = () => {}, onError = () => {}, onActivity = () => {}, onState = () => {}, onCaption = () => {}, onLevel = () => {}, onEnd = () => {} }) {
  const $ = id => document.getElementById(id);
  let peer, channel, input, id, ready = false, ending = false, timer, closeTimer, audioContext, testDestination, silence, recorder;
  let epoch = 0, taskVersion = 0, transcript = [], utterances = {}, seen = new Set(), recordings = [], currentSource, speechTimer;
  const pendingSpeech = new Map();
  let mayRespond = false, contextSent = false;
  let phase='idle', meterContext, inputMeter, outputMeter, meterTimer, toolRequest=null;
  // Figures from verified backend answers in this call; anything else the voice model says is flagged.
  let evidence=[], corrected=new Set(), figureTimer;
  function publish(next){phase=next;onState({active:Boolean(peer),state:next,toolActive:toolRequest!==null});}
  function meter(stream,output=false){try{meterContext ||= new AudioContext();const source=meterContext.createMediaStreamSource(stream),analyser=meterContext.createAnalyser();analyser.fftSize=256;source.connect(analyser);if(output)outputMeter=analyser;else inputMeter=analyser;if(!meterTimer)meterTimer=setInterval(()=>{const current=phase==='speaking'?outputMeter:inputMeter;if(!current)return;const values=new Uint8Array(current.fftSize);current.getByteTimeDomainData(values);const rms=Math.sqrt(values.reduce((sum,v)=>sum+((v-128)/128)**2,0)/values.length);onLevel(Math.min(1,rms*7));},100);}catch{/* Metering must never prevent a voice connection. */}}
  function allowResponse() { mayRespond=true;$('voice-audio').muted=false; }
  const testMode = new URLSearchParams(location.search).get('voiceTest') === '1';
  $('voice-test').hidden = !testMode;
  const state = message => { $('voice-status').textContent = t(message);publish(!peer?'idle':ending?'ending':!ready?'connecting':message.startsWith('Advisor responding')?'speaking':/^(Checking|Preparing response)/.test(message)?'working':'listening'); };
  function append(role, value, startMs, endMs) {
    if (!value) return;
    const timed = Number.isFinite(startMs) && Number.isFinite(endMs);
    const recent = utterances[role];
    const last = timed ? (recent && startMs - recent.end <= 1800 ? recent.message : null) : (transcript.at(-1)?.role === role ? transcript.at(-1) : null);
    let message = last;
    if (message) message.text += value;
    else { message = { id: crypto.randomUUID(), at: new Date().toISOString(), role, text: value }; transcript.push(message); }
    onTranscript(message);
    if (timed) utterances[role] = { message, end: endMs };
    transcript = transcript.slice(-40);
    for (const x of transcript) x.text = x.text.slice(-5000);
    $('voice-transcript').replaceChildren(...transcript.slice(-12).map(x => { const p = document.createElement('p'); const b = document.createElement('strong'); b.textContent = t(x.role === 'user' ? 'You: ' : 'Advisor: '); p.append(b, document.createTextNode(x.text)); return p; }));
    $('voice-transcript').scrollTop = $('voice-transcript').scrollHeight;
  }
  const send = (type, content, delegationId = null) => {
    if (channel?.readyState !== 'open') return;
    const event_id = crypto.randomUUID();
    channel.send(JSON.stringify({ type, event_id, delegation_id: delegationId, content: String(content).slice(0, 1600) }));
    if (type === 'session.commentary.append') pendingSpeech.set(event_id, setTimeout(() => {
      pendingSpeech.delete(event_id); if (ready && !ending) state('Result ready on screen; voice delivery was not confirmed.');
    }, 12000));
  };
  function spokenFacts(result) {
    if (typeof result.spokenAnswer==='string' && result.spokenAnswer.trim()) {
      const unverified=Array.isArray(result.unverifiedFigures)?result.unverifiedFigures.filter(x=>typeof x==='string'&&x):[];
      return 'Verified backend answer for the current request. Read it faithfully. Say every amount exactly as written, with its currency; do not round, estimate, convert or add amounts, and do not add figures from earlier conversation: '+result.spokenAnswer+(unverified.length?` These figures could not be matched to Banking records: ${unverified.join(', ')}. Say explicitly that they could not be verified.`:'');
    }
    if ('spokenAnswer' in result) return 'No verified financial answer is available for this request. Say that you could not verify the figure. Do not supply any balance or amount from memory.';
    const s = result.scenario || (typeof result.extra === 'number' ? result : result.baselineScenario || null);
    const selection = result.baselineScenario && !result.scenario ? 'No saved scenario is selected in this chat. These are the CURRENT BASELINE figures, not a saved scenario. Explain that distinction. Do not assume all available money is saved. ' : '';
    const baseline = typeof result.income === 'number' ? `Verified monthly synthetic baseline, DKK: income ${result.income}, expenses ${result.expenses}, savings ${result.savings}, available ${result.available}. Categories: ${result.categories.map(x => x.name + ' ' + x.amount).join(', ')}. ` : '';
    if (s) return selection + baseline + `Verified Demo figures: extra saving ${s.extra} DKK per month; total goal contribution ${s.monthly} DKK per month; money left ${s.available} DKK per month; goal date ${s.targetDate}; ${s.months} deposits; ${s.monthsEarlier} months earlier than baseline ${s.baselineDate}. Assumes monthly deposits from October 2026, no interest or withdrawals. Quote only these calculated figures; never infer a different contribution or date. Answer the user's latest question now, briefly, in their language. ${result.chartUpdated === false ? 'The existing visual does not support this control; results are displayed separately.' : ''}`;
    if (baseline) return baseline + "Answer the latest question now in the user's language.";
    return JSON.stringify(result);
  }
  // The voice model speaks on its own; compare its words with verified answers and user-stated figures.
  function checkFigures(message, session) {
    if (!message || message.role !== 'assistant' || session !== epoch || !ready) return;
    const said = transcript.filter(x => x.role === 'user').map(x => x.text);
    const bad = ungroundedAmounts(message.text, evidenceValues(evidence, said));
    if (!bad.length) return;
    message.unverified = [...new Set([...(message.unverified || []), ...bad])];
    onTranscript(message);
    const fresh = bad.filter(x => !corrected.has(x));
    if (!fresh.length) return;
    fresh.forEach(x => corrected.add(x));
    send('session.commentary.append', `Correction required: you said ${fresh.join(', ')}, which is not in any verified Banking answer in this conversation. In one short sentence tell the user that this figure was not verified and must not be relied on, and offer to check it. Do not state a replacement figure unless it comes from a verified backend answer.`);
  }
  function voiceContext() {
    const value = context();
    return { ...value, conversation: (value.conversation || []).map(x => ({ ...x, text: redactAmounts(x.text) })) };
  }
  function controls() {
    const button=$('voice-start'), active=Boolean(peer);
    button.disabled=ending;button.classList.toggle('is-voice-active',active);
    button.setAttribute('aria-label',t(active?'Stop voice':'Start voice'));button.title=t(active?'Stop voice':'Start voice');
    button.setAttribute('aria-pressed',String(active));
    $('voice-test-play').disabled=!ready||ending;
    publish(!active?'idle':ending?'ending':!ready?'connecting':phase==='idle'?'listening':phase);
  }
  async function cleanup(message, error = false) {
    ++epoch; ++taskVersion; toolRequest=null; ready = false; ending = false; clearTimeout(timer); clearTimeout(closeTimer); clearTimeout(speechTimer); clearTimeout(figureTimer);
    for (const timeout of pendingSpeech.values()) clearTimeout(timeout); pendingSpeech.clear();
    currentSource?.stop(); currentSource = null; silence?.stop(); silence = null;
    input?.getTracks().forEach(t => t.stop()); input = null;
    if (recorder?.state === 'recording') recorder.stop();
    channel?.close(); channel = null; peer?.close(); peer = null;
    $('voice-audio').srcObject = null; $('voice-audio').hidden = true; audioContext?.close(); audioContext = null;
    clearInterval(meterTimer);meterTimer=null;meterContext?.close();meterContext=inputMeter=outputMeter=null;onLevel(0);onCaption('');
    const old = id; id = null; onEnd(); if (old) api('voice/end', { id: old }).catch(() => {});
    controls();
    if (message) state(message);
    if (error) onError(message);
  }
  async function delegate(event) {
    if(!mayRespond)return;
    const delegationId = event.delegation?.id;
    if (!delegationId || seen.has(delegationId)) return; seen.add(delegationId);
    const turn = ++taskVersion, session = epoch;
    // Delegation metadata carries no utterance; collect the current transcript before routing.
    await new Promise(r => setTimeout(r, 300));
    if (!ready || ending || turn !== taskVersion || session !== epoch) return;
    state('Checking your requestâ€¦');onActivity('Reading Banking data and checking your request');
    toolRequest=turn;publish(phase);
    const selected = context();
    try {
      const result = await api('voice/delegate', { id, delegationId, transcript: transcript.slice(-30), ...selected });
      if (!ready || ending || session !== epoch || turn !== taskVersion) return;
      if(result.action?.type==='end-voice'){onActivity('Ending voice conversation','end_voice_session');await end();return;}
      // Do not apply an answer to a different analysis/version selected while work was running.
      const now = context();
      if (selected.artifactId !== now.artifactId || selected.revision !== now.revision || JSON.stringify(selected.state) !== JSON.stringify(now.state)) {
        send('session.commentary.append', 'The selected analysis changed while I was checking. Please repeat the request for the current analysis.', delegationId); return;
      }
      onActivity('',result.tool);
      let confirmed = result.result;
      if (result.action) confirmed = await apply(result.action, confirmed);
      if (!ready || session !== epoch || turn !== taskVersion) return;
      const row = document.createElement('li'); row.textContent = result.tool + ' Â· completed'; $('voice-tools').append(row);
      $('voice-tools').dataset.lastResult = JSON.stringify({ tool: result.tool, result: confirmed });
      const facts = spokenFacts(confirmed);
      evidence=evidenceValues(evidence,confirmed);
      if (confirmed.spokenAnswer && facts.length > 1200) {
        // Small quiet chunks preserve the complete backend answer within Live's
        // 500-token append limit; only the final event asks it to speak.
        const chunks = Array.from(facts).reduce((all, char) => { if(all.at(-1).length>=350)all.push('');all[all.length-1]+=char;return all; }, ['']);
        chunks.forEach((part,index) => send('session.thinking.append', `Verified answer part ${index+1}/${chunks.length}: ${part}`, delegationId));
        send('session.commentary.append', 'Answer the latest question using the complete verified answer just supplied. Be concise and preserve its factual qualifications.', delegationId);
      } else send('session.commentary.append', facts, delegationId);
      state('Preparing responseâ€¦');
    } catch (e) {
      if (session !== epoch || turn !== taskVersion) return;
      state(e.message); send('session.commentary.append', 'The requested action did not complete: ' + e.message, delegationId);
    } finally {
      if(session===epoch && turn===taskVersion && toolRequest===turn){toolRequest=null;publish(phase);}
    }
  }
  async function end() {
    if (!peer || ending) return; ending = true; ++taskVersion; controls(); state('Ending conversationâ€¦');
    input?.getTracks().forEach(t => t.stop());
    if (!ready) { await cleanup('Voice stopped.'); return; }
    if (channel?.readyState === 'open') channel.send(JSON.stringify({ type: 'session.close' }));
    closeTimer = setTimeout(() => cleanup('Disconnected Â· final provider usage was not confirmed.'), 10000);
  }
  $('voice-start').onclick = async () => {
    if (peer) { await end(); return; }
    const session = ++epoch; seen = new Set(); recordings = []; utterances = {}; evidence = []; corrected = new Set(); $('voice-tools').replaceChildren(); delete $('voice-status').dataset.finalized;
    mayRespond=false;contextSent=false;$('voice-audio').muted=true;
    state(testMode ? 'Connecting with synthetic test audioâ€¦' : 'Allow your microphone to startâ€¦');
    try {
      peer = new RTCPeerConnection(); controls();
      if (testMode) { audioContext = new AudioContext(); await audioContext.resume(); testDestination = audioContext.createMediaStreamDestination();
        // Keep the WebRTC audio clock running between clips, just like a quiet microphone.
        silence = audioContext.createConstantSource(); silence.offset.value = 0; silence.connect(testDestination); silence.start(); input = testDestination.stream;
      }
      else {
        const acquired = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        if(session!==epoch){acquired.getTracks().forEach(t=>t.stop());return;}
        input=acquired;
      }
      if (session !== epoch) { input?.getTracks().forEach(t => t.stop()); return; }
      for (const track of input.getAudioTracks()) peer.addTrack(track, input);
      meter(input);
      peer.ontrack = event => {
        if(session!==epoch)return;
        const stream = new MediaStream([event.track]); $('voice-audio').srcObject = stream;
        meter(stream,true);
        $('voice-audio').play().catch(() => onError('Audio playback was blocked. Stop voice and start it again to enable sound.'));
        if (testMode && typeof MediaRecorder !== 'undefined') {
          recorder = new MediaRecorder(stream); const capture = recorder, chunks = recordings; recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
          recorder.onstop = async () => { const blob = new Blob(chunks, { type: capture.mimeType }); const bytes = new Uint8Array(await blob.arrayBuffer());
            let binary = ''; for (const b of bytes) binary += String.fromCharCode(b);
            try { await api('voice/test-recording', { audio: btoa(binary) }); $('voice-test-result').textContent = `Recorded ${bytes.length} bytes of provider audio for verification.`; } catch (e) { $('voice-test-result').textContent = e.message; }
          }; recorder.start(1000);
        }
      };
      peer.onconnectionstatechange = () => { if (session===epoch && peer?.connectionState === 'failed') cleanup('Voice connection failed. You can still type your question.',true); };
      channel = peer.createDataChannel('oai-events');
      channel.onmessage = ({ data }) => {
        if (session !== epoch) return;
        let e; try { e = JSON.parse(data); } catch { return; }
        if (e.type === 'session.commentary.appended' && pendingSpeech.has(e.client_event_id)) { clearTimeout(pendingSpeech.get(e.client_event_id)); pendingSpeech.delete(e.client_event_id); }
        const recent = JSON.parse($('voice-status').dataset.events || '[]'); recent.push(e.type); $('voice-status').dataset.events = JSON.stringify(recent.slice(-30));
        if (e.type === 'session.started') { clearTimeout(closeTimer);ready = true; controls(); state('Listeningâ€¦'); timer = setTimeout(end, 290000);
        }
        else if (e.type === 'session.closed') { $('voice-status').dataset.finalized = 'true'; cleanup('Voice ended. Continue here whenever you like.'); }
        else if (e.type === 'session.input_transcript.delta') {
          if(e.delta?.trim()) {
            allowResponse();
            if(!contextSent){contextSent=true;send('session.thinking.append','Application selection and previous conversation for reference only; earlier amounts are removed because they are not verified. Do not speak as the user or replay earlier messages. Respond to the current live user request: '+JSON.stringify(voiceContext()));}
          }
          clearTimeout(speechTimer);append('user',e.delta,e.start_ms,e.end_ms);state('Listeningâ€¦');onCaption('');
        }
        else if (e.type === 'session.output_transcript.delta' && mayRespond) { append('assistant', e.delta, e.start_ms, e.end_ms); state('Advisor respondingâ€¦');onCaption(transcript.at(-1)?.text||''); clearTimeout(speechTimer); speechTimer = setTimeout(() => { if (ready && !ending) {state('Listeningâ€¦');onCaption('');} }, 2500); const spoken=transcript.at(-1); clearTimeout(figureTimer); figureTimer=setTimeout(()=>checkFigures(spoken,session),1500); }
        else if (e.type === 'session.delegation.created') delegate(e);
        else if (e.type === 'error' || e.type === 'session.error') { state('Voice service reported an error. Stop voice and retry.'); onError('Voice service reported an error. Stop voice and retry.'); $('voice-status').dataset.providerError = String(e.error?.code || e.code || 'unknown'); }
      };
      channel.onclose = () => { if (session === epoch && peer) cleanup('Voice disconnected Â· final usage unconfirmed.'); };
      await peer.setLocalDescription(await peer.createOffer());
      if (peer.iceGatheringState !== 'complete') await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Could not prepare the voice connection.')), 10000);
        peer.addEventListener('icegatheringstatechange', function done() { if (peer?.iceGatheringState === 'complete') { clearTimeout(timeout); peer.removeEventListener('icegatheringstatechange', done); resolve(); } });
      });
      if(session!==epoch)return;
      const result = await api('voice/session', { sdp: peer.localDescription.sdp });
      if (session !== epoch) { await api('voice/end', { id: result.id }); return; }
      id=result.id;
      await peer.setRemoteDescription({ type: 'answer', sdp: result.transport.sdp });
      closeTimer = setTimeout(() => { if (!ready) cleanup('Voice did not connect. Please retry.',true); }, 20000);
    } catch (e) { if(session===epoch)await cleanup(e.name === 'NotAllowedError' ? 'Microphone access was declined. Allow it in Chrome or keep typing.' : e.message,true); }
  };
  $('voice-test-play').onclick = async () => {
    try { const response = await fetch(new URL('./api/voice/test-audio',import.meta.url)); if (!response.ok) throw new Error('Test audio is not enabled on this local server.');
      const buffer = await audioContext.decodeAudioData(await response.arrayBuffer()); currentSource?.stop(); currentSource = audioContext.createBufferSource(); currentSource.buffer = buffer; currentSource.connect(testDestination); currentSource.start();
      $('voice-test-result').textContent = 'Synthetic recording sent through the WebRTC audio track.';
    } catch (e) { state(e.message); }
  };
  window.addEventListener('pagehide', () => { if (channel?.readyState === 'open') channel.send(JSON.stringify({ type: 'session.close' })); input?.getTracks().forEach(t => t.stop()); peer?.close(); if (id) navigator.sendBeacon(new URL('./api/voice/end',import.meta.url), new Blob([JSON.stringify({ id })], { type: 'application/json' })); });
  controls();
  return { notify: message => {allowResponse();evidence=evidenceValues(evidence,message);send('session.commentary.append',message);}, noteText: value => {allowResponse();transcript.push({role:'user',text:value});utterances={};}, isActive: () => Boolean(peer), reset: messages => { transcript=messages.map(x=>({...x}));utterances={}; }, end };
}
