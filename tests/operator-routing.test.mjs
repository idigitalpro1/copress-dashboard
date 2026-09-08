import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildOperatorPacket} from '../operator-routing.mjs';
const policy = JSON.parse(readFileSync(new URL('../data/codex/context.json',import.meta.url))).operatorPolicy;
test('Astra is primary and one direct packet preserves task and approved scope',()=>{
  const packet=buildOperatorPacket(policy,{task:'DEV-034: keep the completed header fix; verify mobile navigation.'});
  assert.match(packet,/GPT-6 Astra in Codex \(gpt-6-astra\)/);
  assert.match(packet,/Claude → Grok Bot → Cursor → Hermes 2.0/);
  assert.match(packet,/DEV-034: keep the completed header fix/);
  assert.match(packet,/PDF-to-WordPress refactoring remains audit-only/);
  assert.equal(policy.automaticDispatch,false);
});
test('fallback requires stopped predecessor and reason, then carries the same next action',()=>{
 for(const options of [{target:'claude',task:'next'}, {target:'claude',task:'next',reason:'primary unavailable'}, {target:'claude',task:'next',priorStopped:true}]) assert.throws(()=>buildOperatorPacket(policy,options),/prior executor/);
 assert.match(buildOperatorPacket(policy,{target:'claude',task:'next',reason:'primary unavailable',priorStopped:true}),/Selected operator: Claude/);
});
test('blocked or unknown executors and empty or oversized packets fail without dispatch',()=>{
 assert.throws(()=>buildOperatorPacket(policy,{target:'hermes',task:'next'}),/blocked/);
 assert.throws(()=>buildOperatorPacket(policy,{target:'unknown',task:'next'}),/configured/);
 assert.throws(()=>buildOperatorPacket(policy),/Add a task/);
 assert.throws(()=>buildOperatorPacket(policy,{task:'a'.repeat(12001)}),/12,000/);
});
