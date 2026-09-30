import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { decryptApiKey, NewsflowError, requireNewsflowConfig } from './crypto.js';

export interface VaultKeyItem {
  id: string;
  label: string;
  provider: 'gemini' | 'openai' | 'anthropic' | 'custom';
  maskedKey: string;
  encryptedData: string;
  envVarName?: string;
  customEndpointUrl?: string;
  customHeader?: string;
  status: 'active' | 'invalid' | 'revoked' | 'untested';
  validationMessage: string;
  lastValidatedAt?: string;
  latencyMs?: number;
  isDefault: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PromptVersionItem {
  version: string;
  systemPrompt: string;
  userTemplate: string;
  notes: string;
  createdAt: string;
  author: string;
}

export interface SystemPromptItem {
  id: string;
  title: string;
  description: string;
  category: 'headline-byline' | 'column-layout' | 'wire-normalizer' | 'sports-scores' | 'caption-parser' | 'custom';
  currentVersion: string;
  systemPrompt: string;
  userTemplate: string;
  targetFormat: 'json' | 'markdown' | 'text';
  recommendedModel: string;
  mappedKeyId: string | null;
  temperature: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  versions: PromptVersionItem[];
}

export type SecurityActionType =
  | 'VALIDATION_ATTEMPT'
  | 'VALIDATION_SUCCESS'
  | 'VALIDATION_FAILED'
  | 'KEY_ROTATED'
  | 'KEY_REVOKED'
  | 'KEY_REACTIVATED'
  | 'KEY_CREATED'
  | 'KEY_DELETED'
  | 'ENV_IMPORTED'
  | 'DEFAULT_SET'
  | 'PROMPT_EXECUTED'
  | 'PROMPT_EXECUTION_FAILED'
  // Legacy aliases for backward compatibility
  | 'validation'
  | 'rotation'
  | 'revocation'
  | 'reactivation'
  | 'creation'
  | 'deletion'
  | 'import'
  | 'set_default';

export type SecurityTrigger = 'manual' | 'automated';

export type SecurityStatus = 'success' | 'warning' | 'failure' | 'info';

export interface SecurityLogItem {
  id: string;
  timestamp: string;
  action: SecurityActionType;
  trigger: SecurityTrigger;
  keyId?: string;
  keyLabel?: string;
  provider?: string;
  maskedKey?: string;
  status: SecurityStatus;
  actor: string;
  details: string;
  latencyMs?: number;
  ip?: string;
  origin?: string;
  metadata?: Record<string, any>;
}

const identifier = z.string().min(1).max(200).regex(/^[A-Za-z0-9._-]+$/);
const isoDate = z.string().datetime();
const boundedText = (max: number) => z.string().max(max).refine(value => !value.includes('\0'));
const providerSchema = z.enum(['gemini', 'openai', 'anthropic', 'custom']);
const versionSchema = z.object({ version: boundedText(32), systemPrompt: boundedText(30000), userTemplate: boundedText(30000),
  notes: boundedText(2000), createdAt: isoDate, author: boundedText(100) });
const keySchema = z.object({
  id: identifier, label: boundedText(120), provider: providerSchema, maskedKey: boundedText(100),
  encryptedData: z.string().max(32826).regex(/^[a-f0-9]{24}:[a-f0-9]{32}:(?:[a-f0-9]{2}){8,16384}$/i),
  envVarName: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/).optional(),
  status: z.enum(['active', 'invalid', 'revoked', 'untested']), validationMessage: boundedText(1000),
  lastValidatedAt: isoDate.optional(), latencyMs: z.number().finite().nonnegative().max(3600000).optional(),
  isDefault: z.boolean(), usageCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), createdAt: isoDate, updatedAt: isoDate,
});
const promptSchema = z.object({
  id: identifier, title: boundedText(200), description: boundedText(2000),
  category: z.enum(['headline-byline', 'column-layout', 'wire-normalizer', 'sports-scores', 'caption-parser', 'custom']),
  currentVersion: boundedText(32), systemPrompt: boundedText(30000), userTemplate: boundedText(30000),
  targetFormat: z.enum(['json', 'markdown', 'text']), recommendedModel: boundedText(100), mappedKeyId: identifier.nullable(),
  temperature: z.number().finite().min(0).max(2), tags: z.array(boundedText(60)).max(20),
  createdAt: isoDate, updatedAt: isoDate, versions: z.array(versionSchema).max(100),
});
const logSchema = z.object({
  id: identifier, timestamp: isoDate,
  action: z.enum(['VALIDATION_ATTEMPT', 'VALIDATION_SUCCESS', 'VALIDATION_FAILED', 'KEY_ROTATED', 'KEY_REVOKED', 'KEY_REACTIVATED',
    'KEY_CREATED', 'KEY_DELETED', 'ENV_IMPORTED', 'DEFAULT_SET', 'PROMPT_EXECUTED', 'PROMPT_EXECUTION_FAILED',
    'validation', 'rotation', 'revocation', 'reactivation', 'creation', 'deletion', 'import', 'set_default']),
  trigger: z.enum(['manual', 'automated']), status: z.enum(['success', 'warning', 'failure', 'info']), actor: boundedText(120), details: boundedText(2000),
  keyId: identifier.optional(), keyLabel: boundedText(120).optional(), provider: providerSchema.optional(),
  maskedKey: z.string().transform(() => '••••••••••••').optional(), latencyMs: z.number().finite().nonnegative().max(3600000).optional(),
});
const schemas = { 'keys.json': z.array(keySchema).max(2000), 'prompts.json': z.array(promptSchema).max(2000), 'security_logs.json': z.array(logSchema).max(500) };
function validatedRows(filename: string, data: unknown): any[] {
  const schema = schemas[filename as keyof typeof schemas];
  const result = schema?.safeParse(data);
  if (!result?.success || new Set(result.data.map(item => item.id)).size !== result.data.length) throw new Error();
  return result.data;
}
function owned(stat: fs.Stats) { return typeof process.getuid !== 'function' || stat.uid === process.getuid(); }
function privateFile(stat: fs.Stats) {
  return stat.isFile() && owned(stat) && stat.nlink === 1 && (stat.mode & 0o7777) === 0o600 && stat.size <= 16 * 1024 * 1024;
}
function sameFile(left: fs.Stats, right: fs.Stats) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

function directory() {
  const dir = requireNewsflowConfig().dataDir;
  try {
    const webRoot = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
    const requested = path.resolve(dir);
    if (requested === path.parse(requested).root || requested === webRoot || requested.startsWith(webRoot + path.sep)) throw new Error();
    // Resolve the existing ancestor before creating anything through an alias into the website.
    let ancestor = requested;
    const missing: string[] = [];
    while (!fs.existsSync(ancestor)) {
      missing.unshift(path.basename(ancestor));
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw new Error();
      ancestor = parent;
    }
    const prospective = path.resolve(fs.realpathSync(ancestor), ...missing);
    if (prospective === webRoot || prospective.startsWith(webRoot + path.sep)) throw new Error();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const stat = fs.lstatSync(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink() || !owned(stat) || (stat.mode & 0o7777) !== 0o700) throw new Error();
    const resolved = fs.realpathSync(dir);
    if (resolved === webRoot || resolved.startsWith(webRoot + path.sep)) throw new Error();
    return resolved;
  } catch { throw new NewsflowError('Private vault storage is unavailable.', 503); }
}

function readArray<T>(filename: string, empty: () => T[] = () => []): T[] {
  const target = path.join(directory(), filename);
  let fd: number | undefined;
  try {
    let before: fs.Stats;
    try { before = fs.lstatSync(target); if (!privateFile(before)) throw new Error(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return empty(); throw error; }
    fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(fd);
    if (!privateFile(stat) || !sameFile(before, stat)) throw new Error();
    // Allocate from the checked size; an externally growing file cannot cause an unbounded read.
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (!count) throw new Error();
      offset += count;
    }
    if (!sameFile(stat, fs.fstatSync(fd)) || !sameFile(stat, fs.lstatSync(target))) throw new Error();
    return validatedRows(filename, JSON.parse(bytes.toString('utf8')));
  } catch { throw new NewsflowError('Stored vault data could not be read. No data was reset.', 503); }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}

function writeArray(filename: string, rows: unknown[]) {
  if (!Array.isArray(rows) || rows.length > 2000) throw new NewsflowError('Vault storage limits exceeded.');
  const dir = directory();
  const target = path.join(dir, filename);
  const temporary = path.join(dir, '.' + filename + '.' + crypto.randomUUID() + '.tmp');
  let fd: number | undefined;
  try {
    let before: fs.Stats | undefined;
    try { before = fs.lstatSync(target); if (!privateFile(before)) throw new Error(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    // Validate existing contents even for clear/delete operations. Corruption is never silently reset.
    if (before) readArray(filename);
    const content = JSON.stringify(validatedRows(filename, rows));
    if (Buffer.byteLength(content) > 16 * 1024 * 1024) throw new Error();
    fd = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600);
    fs.writeFileSync(fd, content, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    let current: fs.Stats | undefined;
    try { current = fs.lstatSync(target); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (before ? !current || !privateFile(current) || !sameFile(before, current) : current !== undefined) throw new Error();
    fs.renameSync(temporary, target);
    // Rename is the commit point. A directory-sync failure must not falsely report rollback.
    try {
      const dirFd = fs.openSync(dir, fs.constants.O_RDONLY);
      try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
    } catch { /* The complete new file has already been committed atomically. */ }
  } catch { throw new NewsflowError('Vault data could not be saved.', 503); }
  finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temporary); } catch { /* The committed temporary file no longer exists. */ }
  }
}

export function getAllKeys(): VaultKeyItem[] {
  const keys = readArray<VaultKeyItem>('keys.json');
  for (const key of keys) {
    if (typeof key.encryptedData !== 'string' || !['gemini', 'openai', 'anthropic', 'custom'].includes(key.provider)
      || typeof key.label !== 'string' || !['active', 'invalid', 'untested', 'revoked'].includes(key.status)) {
      throw new NewsflowError('Stored vault metadata is invalid. No data was reset.', 503);
    }
  }
  return keys;
}
export function saveAllKeys(keys: VaultKeyItem[]) { writeArray('keys.json', keys); }
export function findKeyById(id: string) { return getAllKeys().find(key => key.id === id); }
export function getDecryptedKeyById(id: string): string | null {
  const key = findKeyById(id);
  return key ? decryptApiKey(key.encryptedData) : null;
}
export function safeKeyMetadata(key: VaultKeyItem) {
  return { id: key.id, label: key.label, provider: key.provider, maskedKey: '••••••••••••', status: key.status,
    validationMessage: key.validationMessage, lastValidatedAt: key.lastValidatedAt, latencyMs: key.latencyMs,
    isDefault: key.isDefault, usageCount: key.usageCount, createdAt: key.createdAt, updatedAt: key.updatedAt, envVarName: key.envVarName };
}
export function getAllPrompts(): SystemPromptItem[] { return readArray('prompts.json', initializeDefaultPrompts); }
export function saveAllPrompts(prompts: SystemPromptItem[]) { writeArray('prompts.json', prompts); }
export function findPromptById(id: string) { return getAllPrompts().find(prompt => prompt.id === id); }

function initializeDefaultPrompts(): SystemPromptItem[] {
  const defaultPrompts: SystemPromptItem[] = [
    {
      id: 'prompt-headline-byline',
      title: 'Headline, Kicker & Byline Extractor',
      description: 'Extracts standardized AP Style headline, subhead deck, author bylines, dateline, and section categorization from noisy OCR newspaper columns.',
      category: 'headline-byline',
      currentVersion: '1.2.0',
      targetFormat: 'json',
      recommendedModel: 'gemini-3.8-flash',
      mappedKeyId: null,
      temperature: 0.1,
      tags: ['Extraction', 'AP Style', 'Metadata', 'JSON'],
      createdAt: '2026-09-15T10:00:00.000Z',
      updatedAt: '2026-09-28T14:30:00.000Z',
      systemPrompt: `You are an expert newsroom copy editor and newspaper archivist.
Your job is to analyze noisy, OCR-extracted raw text from newspaper print editions and parse the headline structure into rigorous AP Style JSON.

Extract:
1. "headline": Main banner or primary display title (strip trailing OCR noise).
2. "kicker": Small uppercase label/category tag positioned directly above or beside headline (e.g. "EXCLUSIVE", "ANALYSIS", "CITY HALL").
3. "subhead": Secondary explanatory deck or summary bullet points below the headline.
4. "byline": Name of reporter(s), wire credits (e.g. "By Sarah Jenkins and David Cole").
5. "reporter_title": Title or bureau affiliation if specified (e.g. "Chief Political Correspondent").
6. "dateline": Geographic origin and date (e.g. "WASHINGTON — Sept. 28").
7. "newspaper_section": Probable newspaper desk (A-Section/National, Metro, Business, Opinion, Sports, Culture).
8. "lead_paragraph": The opening 1-2 inverted-pyramid sentences establishing who/what/when/where/why.
9. "tags": 3-5 topical taxonomy keywords.

Respond strictly in valid JSON format matching this schema without markdown code blocks.`,
      userTemplate: `Analyze the provided newspaper print OCR extract and extract all headline and byline metadata.`,
      versions: [
        {
          version: '1.0.0',
          systemPrompt: 'Extract headline, byline and dateline from newspaper article in JSON format.',
          userTemplate: 'Parse this newspaper text.',
          notes: 'Initial production baseline.',
          createdAt: '2026-09-15T10:00:00.000Z',
          author: 'Desk Editor Alex',
        },
        {
          version: '1.1.0',
          systemPrompt: 'Extract headline, kicker, subhead, byline, dateline and section assignment in JSON.',
          userTemplate: 'Extract all editorial front matter from this OCR text.',
          notes: 'Added kicker and subhead deck differentiation.',
          createdAt: '2026-09-22T08:15:00.000Z',
          author: 'Lead Architect Marcus',
        },
        {
          version: '1.2.0',
          systemPrompt: `You are an expert newsroom copy editor and newspaper archivist.
Your job is to analyze noisy, OCR-extracted raw text from newspaper print editions and parse the headline structure into rigorous AP Style JSON.

Extract:
1. "headline": Main banner or primary display title (strip trailing OCR noise).
2. "kicker": Small uppercase label/category tag positioned directly above or beside headline (e.g. "EXCLUSIVE", "ANALYSIS", "CITY HALL").
3. "subhead": Secondary explanatory deck or summary bullet points below the headline.
4. "byline": Name of reporter(s), wire credits (e.g. "By Sarah Jenkins and David Cole").
5. "reporter_title": Title or bureau affiliation if specified (e.g. "Chief Political Correspondent").
6. "dateline": Geographic origin and date (e.g. "WASHINGTON — Sept. 28").
7. "newspaper_section": Probable newspaper desk (A-Section/National, Metro, Business, Opinion, Sports, Culture).
8. "lead_paragraph": The opening 1-2 inverted-pyramid sentences establishing who/what/when/where/why.
9. "tags": 3-5 topical taxonomy keywords.

Respond strictly in valid JSON format matching this schema without markdown code blocks.`,
          userTemplate: `Analyze the provided newspaper print OCR extract and extract all headline and byline metadata.`,
          notes: 'Enforced lead paragraph isolation and AP style dateline normalization.',
          createdAt: '2026-09-28T14:30:00.000Z',
          author: 'Senior Systems Editor Clara',
        },
      ],
    },
    {
      id: 'prompt-column-layout',
      title: 'Multi-Column Demarcator & Jump Stitcher',
      description: 'Resolves newspaper PDF multi-column OCR interleaving, strips recurring running headers, and cleanly bridges "Continued on Page B4" jump lines.',
      category: 'column-layout',
      currentVersion: '1.1.0',
      targetFormat: 'markdown',
      recommendedModel: 'gemini-3.8-flash',
      mappedKeyId: null,
      temperature: 0.15,
      tags: ['Layout', 'OCR Cleanup', 'Jump Lines', 'De-hyphenation'],
      createdAt: '2026-09-18T11:20:00.000Z',
      updatedAt: '2026-09-26T16:45:00.000Z',
      systemPrompt: `You are an automated pre-press layout reconciliation engine for newspaper archives.
When newspapers are digitized from broadsheet PDF pages, multi-column text often gets garbled:
- Left column flows into middle column prematurely.
- Running headers, page folios ("THE DAILY HERALD • FRIDAY, OCTOBER 3 • PAGE 4A"), and banner ads cut into mid-sentence text.
- Jump lines ("CONTINUED ON PAGE A14", "FROM PAGE 1A") break the narrative thread.
- End-of-line soft hyphens break words into fragmented tokens ("inves- tigation").

Your task:
1. Demarcate and stitch the continuous narrative reading order across all columns.
2. Remove all extraneous page headers, footers, jump line tags, and advertisement blurbs.
3. Fix split hyphenated words across line boundaries.
4. Output the reconstructed story in clean, well-spaced Markdown paragraphs with proper heading hierarchy.
5. If sidebars or pulled quotes are embedded, isolate them in a dedicated Markdown blockquote:
   > **Sidebar / Pull Quote**: [text]`,
      userTemplate: `Reconstruct the continuous narrative text flow from the following multi-column newspaper scan.`,
      versions: [
        {
          version: '1.0.0',
          systemPrompt: 'Stitch multi-column newspaper text and remove jump lines.',
          userTemplate: 'Reconstruct continuous story.',
          notes: 'Initial multi-column de-scrambler.',
          createdAt: '2026-09-18T11:20:00.000Z',
          author: 'Marcus Lee',
        },
        {
          version: '1.1.0',
          systemPrompt: `You are an automated pre-press layout reconciliation engine for newspaper archives.
When newspapers are digitized from broadsheet PDF pages, multi-column text often gets garbled:
- Left column flows into middle column prematurely.
- Running headers, page folios ("THE DAILY HERALD • FRIDAY, OCTOBER 3 • PAGE 4A"), and banner ads cut into mid-sentence text.
- Jump lines ("CONTINUED ON PAGE A14", "FROM PAGE 1A") break the narrative thread.
- End-of-line soft hyphens break words into fragmented tokens ("inves- tigation").

Your task:
1. Demarcate and stitch the continuous narrative reading order across all columns.
2. Remove all extraneous page headers, footers, jump line tags, and advertisement blurbs.
3. Fix split hyphenated words across line boundaries.
4. Output the reconstructed story in clean, well-spaced Markdown paragraphs with proper heading hierarchy.
5. If sidebars or pulled quotes are embedded, isolate them in a dedicated Markdown blockquote:
   > **Sidebar / Pull Quote**: [text]`,
          userTemplate: `Reconstruct the continuous narrative text flow from the following multi-column newspaper scan.`,
          notes: 'Added sidebar isolation and pull-quote block formatting.',
          createdAt: '2026-09-26T16:45:00.000Z',
          author: 'Senior Systems Editor Clara',
        },
      ],
    },
    {
      id: 'prompt-wire-normalizer',
      title: 'Wire Copy Normalizer & De-duplicator',
      description: 'Parses AP, Reuters, Bloomberg, and AFP wire feed dispatches, removes syndication sluglines, and enforces internal publication style rules.',
      category: 'wire-normalizer',
      currentVersion: '1.0.0',
      targetFormat: 'markdown',
      recommendedModel: 'gemini-3.8-flash',
      mappedKeyId: null,
      temperature: 0.2,
      tags: ['Wire Service', 'Syndication', 'AP/Reuters', 'Editorial'],
      createdAt: '2026-09-20T09:00:00.000Z',
      updatedAt: '2026-09-20T09:00:00.000Z',
      systemPrompt: `You are a wire desk automated copy editor for a major metropolitan publication.
You receive raw wire dispatches containing teletype headers, routing slugs (e.g. "BC-US--ELECTION-ECONOMY-RDP", "09-28 0824EST"), embargo warnings, and wire photographer credits.

Perform the following operations:
1. Strip all teletype headers, transmission IDs, priority flags (URGENT, BULLETIN), and syndication routing codes.
2. Standardize datelines to publication style: **CITY (Wire Service)** — e.g. **GENEVA (AP)** —
3. Ensure AP Style numbers, titles, and state abbreviations are properly formatted.
4. Output:
   - **Headline**: Catchy news headline.
   - **Summary (3 Bullets)**: 3 high-impact bullet points for social/push notification.
   - **Full Clean Article**: In Markdown format ready for immediate CMS publishing.`,
      userTemplate: `Process this raw incoming wire dispatch and prepare it for editorial publication.`,
      versions: [
        {
          version: '1.0.0',
          systemPrompt: `You are a wire desk automated copy editor for a major metropolitan publication.
You receive raw wire dispatches containing teletype headers, routing slugs (e.g. "BC-US--ELECTION-ECONOMY-RDP", "09-28 0824EST"), embargo warnings, and wire photographer credits.

Perform the following operations:
1. Strip all teletype headers, transmission IDs, priority flags (URGENT, BULLETIN), and syndication routing codes.
2. Standardize datelines to publication style: **CITY (Wire Service)** — e.g. **GENEVA (AP)** —
3. Ensure AP Style numbers, titles, and state abbreviations are properly formatted.
4. Output:
   - **Headline**: Catchy news headline.
   - **Summary (3 Bullets)**: 3 high-impact bullet points for social/push notification.
   - **Full Clean Article**: In Markdown format ready for immediate CMS publishing.`,
          userTemplate: `Process this raw incoming wire dispatch and prepare it for editorial publication.`,
          notes: 'Initial wire service cleaning rule set.',
          createdAt: '2026-09-20T09:00:00.000Z',
          author: 'Desk Editor Alex',
        },
      ],
    },
    {
      id: 'prompt-sports-scores',
      title: 'Tabular Sports Box Score & Matrix Formatter',
      description: 'Converts garbled OCR sports agate, box scores, pitching lines, and team standing columns into clean structured JSON tables.',
      category: 'sports-scores',
      currentVersion: '1.0.0',
      targetFormat: 'json',
      recommendedModel: 'gemini-3.8-flash',
      mappedKeyId: null,
      temperature: 0.1,
      tags: ['Sports Agate', 'Box Scores', 'Tabular Parsing', 'JSON'],
      createdAt: '2026-09-24T15:30:00.000Z',
      updatedAt: '2026-09-24T15:30:00.000Z',
      systemPrompt: `You are a sports desk statistical data engineer.
Newspaper sports agate pages pack dense game results, inning-by-inning linescores, and player stats in microscopic print that OCR engines frequently misalign into scrambled text columns.

Analyze the raw sports box score and extract:
1. "sport": e.g. Baseball, Basketball, Football, Hockey, Soccer.
2. "matchup": { "homeTeam": string, "awayTeam": string, "homeScore": number, "awayScore": number, "venue": string, "attendance": string | null }
3. "lineScore": Array of inning/quarter periods with runs/points scored by each team, plus R-H-E or final totals.
4. "topPerformers": Array of notable player performances (e.g. pitchers with IP/H/R/ER/BB/SO, or scorers with PTS/REB/AST).
5. "gameSummaryRecap": 2-sentence highlight summary of the game deciding moment.

Return strict JSON only.`,
      userTemplate: `Parse the following OCR sports box score into structured statistical JSON.`,
      versions: [
        {
          version: '1.0.0',
          systemPrompt: `You are a sports desk statistical data engineer.
Newspaper sports agate pages pack dense game results, inning-by-inning linescores, and player stats in microscopic print that OCR engines frequently misalign into scrambled text columns.

Analyze the raw sports box score and extract:
1. "sport": e.g. Baseball, Basketball, Football, Hockey, Soccer.
2. "matchup": { "homeTeam": string, "awayTeam": string, "homeScore": number, "awayScore": number, "venue": string, "attendance": string | null }
3. "lineScore": Array of inning/quarter periods with runs/points scored by each team, plus R-H-E or final totals.
4. "topPerformers": Array of notable player performances (e.g. pitchers with IP/H/R/ER/BB/SO, or scorers with PTS/REB/AST).
5. "gameSummaryRecap": 2-sentence highlight summary of the game deciding moment.

Return strict JSON only.`,
          userTemplate: `Parse the following OCR sports box score into structured statistical JSON.`,
          notes: 'Baseline agate box score parsing schema.',
          createdAt: '2026-09-24T15:30:00.000Z',
          author: 'Sports Desk Sam',
        },
      ],
    },
    {
      id: 'prompt-caption-parser',
      title: 'Photo Caption & Metadata Matcher',
      description: 'Identifies newspaper photo cutlines, credit lines (Staff Photo by / AP Photo), license attributions, and tags depicted persons.',
      category: 'caption-parser',
      currentVersion: '1.0.0',
      targetFormat: 'json',
      recommendedModel: 'gemini-3.8-flash',
      mappedKeyId: null,
      temperature: 0.1,
      tags: ['Photojournalism', 'Cutlines', 'Attribution', 'Metadata'],
      createdAt: '2026-09-25T13:00:00.000Z',
      updatedAt: '2026-09-25T13:00:00.000Z',
      systemPrompt: `You are a photo desk archivist. Newspaper cutlines (photo captions) appear in distinct italic or bold typefaces near images, often accompanied by credit lines.

Analyze the newspaper page text and identify:
1. "caption_text": The literal caption text explaining the scene.
2. "photo_credit": Photographer name (e.g. "Jane Doe").
3. "organization": Publication or wire agency (e.g. "Staff Photographer", "Associated Press", "Getty Images").
4. "people_identified": List of named individuals in the caption (often marked 'from left to right' or 'foreground').
5. "action_description": Concise description of the visual event portrayed.
6. "suggested_alt_text": Clean accessibility alt-text for modern web publication.

Return strictly formatted JSON.`,
      userTemplate: `Extract all photo cutlines and credits from this scanned newspaper text.`,
      versions: [
        {
          version: '1.0.0',
          systemPrompt: 'Identify photo captions and photographer credits in JSON.',
          userTemplate: 'Extract photo cutlines.',
          notes: 'Initial photo caption matcher.',
          createdAt: '2026-09-25T13:00:00.000Z',
          author: 'Desk Editor Alex',
        },
      ],
    },
  ];

  return defaultPrompts;
}

export function getAllSecurityLogs(): SecurityLogItem[] { return readArray('security_logs.json'); }
export function saveAllSecurityLogs(logs: SecurityLogItem[]) { writeArray('security_logs.json', logs.slice(0, 500)); }
export function addSecurityLogEntry(entry: Pick<SecurityLogItem, 'action' | 'status'> & Partial<SecurityLogItem>): SecurityLogItem {
  const item: SecurityLogItem = {
    id: 'log-' + crypto.randomUUID(), timestamp: new Date().toISOString(), action: entry.action,
    status: entry.status, trigger: 'manual', actor: 'Authenticated operator',
    details: 'An authenticated vault operation completed.',
    ...(typeof entry.keyId === 'string' && /^key-[a-z0-9-]+$/.test(entry.keyId) ? { keyId: entry.keyId } : {}),
  };
  saveAllSecurityLogs([item, ...getAllSecurityLogs()]);
  return item;
}
export function clearSecurityLogs() { saveAllSecurityLogs([]); }

export function recordSecurityEvent(action: SecurityActionType, status: SecurityStatus, keyId?: string) {
  // Audit is separate from the credential transaction; failure cannot undo an acknowledged save.
  try { addSecurityLogEntry({ action, status, keyId }); return true; } catch { return false; }
}
