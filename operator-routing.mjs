// Pure task-packet builder; no model dispatch, filesystem or network side effects.
export function buildOperatorPacket(policy, { target = policy.primary, task = '', reason = '', priorStopped = false } = {}) {
  const operator = policy.operators.find(item => item.id === target);
  if (!operator) throw new Error('Select a configured operator.');
  if (!operator.availableForHandoff) throw new Error(operator.name + ' is blocked. ' + operator.next);
  if (!task.trim()) throw new Error('Add a task ID, recommendation or next action.');
  if (task.length > 12000) throw new Error('Keep the task packet below 12,000 characters.');
  if (target !== policy.primary && (!priorStopped || !reason.trim())) throw new Error('Record the fallback reason and confirm the prior executor has stopped.');
  return [
    'SATCOM direct development handoff',
    'Selected operator: ' + operator.name + (operator.model ? ' (' + operator.model + ')' : ''),
    'Primary: GPT-6 Astra in Codex. Fallback order: ' + policy.fallbackOrder.map(id => policy.operators.find(x => x.id === id).name).join(' → '),
    'Kanban: https://satcom.conews.press/kanban',
    'Context and prompts: https://satcom.conews.press/codex',
    'Read-only MCP: https://satcom.conews.press/mcp — use satcom_board with one project and a small limit.',
    'Follow Astra recommendations recorded on the relevant card. Preserve its completed work, evidence and remaining next action.',
    'Mission control is under development; direct prompts are the primary workflow for both site GUI and content, including activity and town sites.',
    'Work directly. Do not delegate or spawn agents. One active executor at a time. A copied packet is not proof of execution.',
    'Execute only the current publisher-authorized scope. PDF-to-WordPress refactoring remains audit-only until its sequence is approved; no CMS browser automation.',
    'Partners in the Community is the primary advertising and sponsorship platform. Preserve editorial provenance and unique, credited imagery.',
    'Keep context small, preserve unrelated changes, verify the result and record the exact outcome or blocker on the card. Do not expose secrets.',
    target !== policy.primary ? 'Fallback reason: ' + reason.trim() + '\nPrior executor: operator confirmed stopped.' : 'Primary route selected.',
    '', 'Task / Astra recommendation / completed work / next action:', task.trim()
  ].join('\n');
}
