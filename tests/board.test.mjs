import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getBoard,normalizeCards,snapshot} from '../lib/development-board.js';
const rows=snapshot.cards.map(c=>({id:c.backendId,title:`[${c.key}] ${c.title}`,assignee:c.owner,column:c.column,priority:c.priority}));
test('all reviewed cards have unique persisted identities and acceptance evidence',()=>{assert.equal(new Set(snapshot.cards.map(x=>x.backendId)).size,snapshot.cards.length);assert.ok(snapshot.cards.every(x=>x.backendId&&x.next&&x.acceptance&&x.evidence&&x.owner));});
test('only allowlisted backend records are published',()=>{const cards=normalizeCards([...rows,{id:'private-unrelated',title:'Private customer record'}]);assert.equal(cards.length,snapshot.cards.length);assert.ok(!cards.some(x=>x.title.includes('Private')));});
test('live board reflects persisted column changes',async()=>{const changed=rows.map((r,i)=>i===0?{...r,column:'review'}:r);const b=await getBoard(async()=>({ok:true,json:async()=>({cards:changed})}));assert.equal(b.sourceMode,'live');assert.equal(b.cards[0].column,'review');});
test('upstream failure is an explicitly dated snapshot, never live',async()=>{const b=await getBoard(async()=>{throw new Error('network')});assert.equal(b.sourceMode,'snapshot');assert.ok(b.warning&&b.snapshotUpdatedAt);assert.equal(b.cards.length,snapshot.cards.length);});
test('empty or partial upstream does not erase the reviewed work',async()=>{const b=await getBoard(async()=>({ok:true,json:async()=>({cards:[]})}));assert.equal(b.sourceMode,'snapshot');assert.equal(b.cards.length,snapshot.cards.length);});
