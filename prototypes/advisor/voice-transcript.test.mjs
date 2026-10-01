import test from 'node:test';
import assert from 'node:assert/strict';
import {formatVoiceTranscript as format} from './public/voice-transcript.js';
test('formats the actual Danish savings response and observation date',()=>{
 assert.equal(format('Din samlede opsparing er trehundrede seksogtyve tusind firehundrede kroner. Saldi er fra den tolvte september totusindseksogtyve.'),'Din samlede opsparing er 326.400 kr. Saldi er fra 12. september 2026.');
});
test('handles streamed partial words without inventing a value',()=>{
 assert.equal(format('Du har femoghalvfjerds tusind trehundrede otteog'),'Du har femoghalvfjerds tusind trehundrede otteog');
 assert.equal(format('Du har femoghalvfjerds tusind trehundrede otteogfirs kroner'),'Du har 75.388 kr.');
});
test('preserves existing numerals, ordinary prose, English and unsupported number forms',()=>{
 for(const text of ['326.400 kr. den 12. september 2026','En konto og tre opsparingskonti','Three hundred kroner','halvanden million kroner']) assert.equal(format(text),text);
});
