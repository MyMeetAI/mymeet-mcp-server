/**
 * Zod schemas and TypeScript types for MyMeet API.
 */
import { z } from 'zod';

// ── Templates ────────────────────────────────────────────────────────────────

export const TEMPLATES = [
  'default-meeting',
  'sales-meeting',
  'sales-coaching',
  'hr-interview',
  'research-interview',
  'team-sync',
  'article',
  'lecture-notes',
  'one-to-one',
  'protocol',
  'medicine',
] as const;

export type Template = (typeof TEMPLATES)[number];

export const TemplateSchema = z.enum(TEMPLATES);

export const TEMPLATE_DESCRIPTIONS: Record<Template, string> = {
  'default-meeting': 'Standard meeting summary with key points and action items',
  'sales-meeting': 'Sales call analysis: objections, next steps, deal signals',
  'sales-coaching': 'Sales coaching feedback: technique assessment, improvement areas',
  'hr-interview': 'HR interview summary: candidate evaluation, key answers',
  'research-interview': 'Research interview: insights, patterns, methodology notes',
  'team-sync': 'Team sync: updates per person, blockers, decisions made',
  'article': 'SEO article/blog post generated from meeting content',
  'lecture-notes': 'Educational content: key concepts, examples, takeaways',
  'one-to-one': 'Manager 1:1: feedback, goals, action items',
  'protocol': 'Formal meeting protocol: agenda, decisions, responsible parties',
  'medicine': 'Medical consultation: anamnesis, symptoms, recommendations',
};

// ── Meeting platforms ────────────────────────────────────────────────────────

export const SOURCES = [
  'gmeet',
  'zoom',
  'telemost',
  'sberjazz',
  'trueconf',
  'konturtalk',
  'teams',
  'jitsi',
] as const;

export type Source = (typeof SOURCES)[number];

export const SourceSchema = z.enum(SOURCES);

// ── Export formats ───────────────────────────────────────────────────────────

export const FORMATS = ['pdf', 'docx', 'md', 'json'] as const;

export type Format = (typeof FORMATS)[number];

export const FormatSchema = z.enum(FORMATS);

// ── Processing statuses ──────────────────────────────────────────────────────

export const STATUSES = ['new', 'queued', 'processing', 'processed', 'failed'] as const;

export type MeetingStatus = (typeof STATUSES)[number];

export const StatusSchema = z.enum(STATUSES);

// ── Meeting visibility scope ─────────────────────────────────────────────────

export const MEETING_SCOPES = ['mine', 'workspace'] as const;

export type MeetingScope = (typeof MEETING_SCOPES)[number];

export const MeetingScopeSchema = z.enum(MEETING_SCOPES);

// ── Tool input schemas ───────────────────────────────────────────────────────

export const ListMeetingsSchema = z.object({
  scope: MeetingScopeSchema.optional().describe(
    'Meeting visibility scope. Defaults to "mine" for the current user. Use "workspace" only when the user explicitly asks for all workspace meetings.',
  ),
  page: z.number().int().positive().optional().describe('Page number (default: 1)'),
  perPage: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Results per page (default: 20, max: 50)'),
});

export const SearchMeetingsSchema = z.object({
  scope: MeetingScopeSchema.optional().describe(
    'Meeting visibility scope. Defaults to "mine" for the current user. Use "workspace" only when the user explicitly asks for all workspace meetings.',
  ),
  query: z
    .string()
    .optional()
    .describe('Search by meeting title/name/entityName, authors, speakers, or participants'),
  dateFrom: z
    .string()
    .optional()
    .describe('Filter meetings on or after this date (ISO 8601, e.g. 2024-01-15)'),
  dateTo: z
    .string()
    .optional()
    .describe('Filter meetings on or before this date (ISO 8601). Date-only values include the full day.'),
  status: StatusSchema.optional().describe('Filter by processing status'),
  page: z.number().int().positive().optional().describe('Page number (default: 1)'),
  perPage: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Filtered results per page (default: 50, max: 50)'),
});

export const MeetingIdSchema = z.object({
  meetingId: z.string().describe('The unique meeting ID'),
});

export const DownloadMeetingSchema = z.object({
  meetingId: z.string().describe('The unique meeting ID'),
  format: FormatSchema.describe(
    'Export format: md and json return content directly; pdf and docx return a download URL',
  ),
});

export const RecordMeetingSchema = z.object({
  link: z
    .string()
    .url()
    .describe('Meeting URL (Google Meet, Zoom, Teams, Telemost, SberJazz, TrueConf, KonturTalk, Jitsi)'),
  title: z.string().min(1).describe('Meeting title'),
  dateTime: z
    .string()
    .describe('Local datetime for recording start (ISO 8601, e.g. 2024-03-15T14:00:00)'),
  template: TemplateSchema.describe('Template for AI analysis after recording'),
  source: SourceSchema.optional().describe(
    'Meeting platform. Auto-detected from URL if omitted.',
  ),
  password: z.string().optional().describe('Meeting password, if required'),
  cron: z
    .string()
    .optional()
    .describe('UTC cron expression for recurring recordings (e.g. "0 14 * * 1" for every Monday at 14:00 UTC)'),
  participants: z
    .array(z.string())
    .optional()
    .describe('Expected participant names'),
});

export const RenameMeetingSchema = z.object({
  meetingId: z.string().describe('The unique meeting ID'),
  name: z.string().min(1).describe('New meeting title'),
});

export const RegenerateTemplateSchema = z.object({
  meetingId: z.string().describe('The unique meeting ID'),
  template: TemplateSchema.describe('New template to re-analyze the meeting with'),
});

export const UpdateSummarySchema = z.object({
  meetingId: z.string().describe('The unique meeting ID'),
  templateId: z
    .string()
    .describe('ID of the template whose section to edit (from the meeting report)'),
  entityName: z.string().describe('Name of the summary section/entity to update'),
  newSummaryText: z.string().describe('New text for that section'),
});

export const DeleteMeetingSchema = z.object({
  meetingId: z
    .string()
    .describe('The unique meeting ID. WARNING: This permanently deletes the meeting.'),
});
