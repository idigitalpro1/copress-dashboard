const OPT_OUT = 'Reply STOP to opt out. Reply HELP for help.';

export function withOptOut(body) {
  const text = String(body || '').trim();
  return text.includes('Reply STOP to opt out') ? text : `${text}\n${OPT_OUT}`;
}

export function helpText() {
  return 'Colorado News Press Video Desk: send a video clip to submit it for review. Reviewers reply YES CODE to publish or NO CODE to reject. Reply STOP to opt out, START to opt in.';
}

export function stopText() {
  return 'SATCOM Video Review: you are opted out and will not receive more review texts. Reply START to opt back in.';
}

export function startText() {
  return withOptOut('SATCOM Video Review: you are opted in. You will get a text when a video is ready for review and when one goes live.');
}

export function unknownText() {
  return withOptOut('SATCOM Video Review: reply YES CODE or NO CODE. Example: YES K7Q2');
}

export function unknownCodeText(code) {
  return withOptOut(`SATCOM Video Review: code ${code} was not found.`);
}

export function expiredText(code) {
  return withOptOut(`SATCOM Video Review: code ${code} has expired. Open the review link or wait for a new text.`);
}

export function alreadyDecidedText(video) {
  return withOptOut(`SATCOM Video Review: "${video.title}" is already ${video.status}.`);
}

export function needCodeText(pending) {
  if (!pending.length) return withOptOut('SATCOM Video Review: no video is waiting for review.');
  const codes = pending.map(video => video.short_code).join(', ');
  return withOptOut(`SATCOM Video Review: more than one video is pending. Reply YES CODE or NO CODE. Pending: ${codes}`);
}

export function confirmationText(video, status) {
  const verb = status === 'published' ? 'published' : 'rejected';
  return withOptOut(`SATCOM Video Review: "${video.title}" (${video.short_code}) is ${verb}.`);
}

export function reviewRequestText({ title, code, link }) {
  return withOptOut(`SATCOM Video Review: "${title}" is ready for review. Reply YES ${code} to publish or NO ${code} to reject.\nReview: ${link}`);
}

export function nowLiveText({ title, watchUrl, link }) {
  return withOptOut(`SATCOM Video: "${title}" is now live.${watchUrl ? ` Watch: ${watchUrl}` : ''}\nReview: ${link}`);
}

export { clipReceivedText } from './creators.js';
