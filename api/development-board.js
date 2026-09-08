import { getBoard } from '../lib/development-board.js';
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json');
  if (req.method !== 'GET' && req.method !== 'HEAD') {res.setHeader('Allow','GET, HEAD');res.statusCode=405;res.end(JSON.stringify({error:'Read-only board. Use the existing Admin Kanban for edits.'}));return;}
  const board=await getBoard();res.statusCode=200;res.end(req.method==='HEAD' ? undefined : JSON.stringify(board));
}
