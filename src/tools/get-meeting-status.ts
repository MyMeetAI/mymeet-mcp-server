import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MyMeetApiClient } from '../client.js';
import { MeetingIdSchema, isReadyStatus } from '../types.js';
import { ApiError, NotFoundError, formatToolError } from '../errors.js';

const BatchEntryErrorSchema = z.object({ error: z.enum(['not_found', 'forbidden']) });
const StatusEntrySchema = z.object({
  status: z.string().min(1),
  reason: z.string().nullish(),
  media_import: z.unknown(),
});
const MediaImportStatusSchema = z.object({
  phase: z.string().min(1),
  error: z.object({ code: z.string(), retryable: z.boolean() }).optional(),
  downloaded_bytes: z.number().finite().nonnegative().optional(),
  total_bytes: z.number().finite().nonnegative().optional(),
  generation: z.number().int().positive().optional(),
  attempt: z.number().int().nonnegative().optional(),
  processing_percentage: z.number().int().min(0).max(100).optional(),
}).transform((state) => ({
  phase: state.phase,
  error: state.error,
  downloadedBytes: state.downloaded_bytes,
  totalBytes: state.total_bytes,
  generation: state.generation,
  attempt: state.attempt,
  processingPercentage: state.processing_percentage,
}));

export function buildStatusPayload(meetingId: string, result: unknown) {
  const failure = BatchEntryErrorSchema.safeParse(result);
  if (failure.success) {
    if (failure.data.error === 'not_found') throw new NotFoundError(meetingId);
    throw new ApiError(403, 'This meeting is unavailable to the current account.');
  }

  const entry = StatusEntrySchema.safeParse(typeof result === 'string' ? { status: result } : result);
  if (!entry.success) return { meetingId, status: 'unknown', ready: false, parseError: true };

  const { status, reason, media_import } = entry.data;
  const importState = MediaImportStatusSchema.safeParse(media_import);
  const mediaImport = importState.success ? importState.data : undefined;
  return {
    meetingId,
    status: reason ? `${status}: ${reason}` : status,
    ready: mediaImport?.phase !== 'cancelled' && isReadyStatus(status),
    ...(mediaImport && { mediaImport }),
    ...(media_import != null && !importState.success && { parseError: true }),
  };
}

export function registerGetMeetingStatus(server: McpServer, client: MyMeetApiClient): void {
  server.registerTool(
    'mymeet_get_meeting_status',
    {
      description:
        'Check processing status of a meeting. `ready` means this meeting or part is available (`new` or `processed`). ' +
        'For a linked recording, use `mediaImport.phase` with the original import meeting ID. ' +
        'Check again until `completed`, `failed`, or `cancelled`. ' +
        'If the phase is `failed`, report `mediaImport.error.code` and whether it is retryable. ' +
        '`parseError: true` means some or all of the status could not be read. Check again before reporting completion.',
      inputSchema: MeetingIdSchema.shape,
      annotations: { readOnlyHint: true },
    },
    async ({ meetingId }) => {
      try {
        const payload = buildStatusPayload(meetingId, await client.getMeetingStatus(meetingId));
        return {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        };
      } catch (error) {
        return formatToolError(error);
      }
    },
  );
}
