import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { MyMeetApiClient } from '../client.js'
import { MeetingIdSchema } from '../types.js'
import { formatToolError } from '../errors.js'
import { buildTranscriptText } from '../followup.js'

export function registerGetTranscript(
	server: McpServer,
	client: MyMeetApiClient,
): void {
	server.tool(
		'mymeet_get_transcript',
		'Get the full transcript of a processed meeting with speaker labels and timestamps. Use only when the user needs exact quotes or full conversation text. WARNING: transcripts can be very large.',
		MeetingIdSchema.shape,
		async ({ meetingId }) => {
			try {
				const result = await client.getMeetingReport(meetingId)
				const transcript = buildTranscriptText(result)
				if (!transcript) {
					return {
						content: [
							{
								type: 'text',
								text: JSON.stringify({
									message: 'No transcript available for this meeting.',
									suggestion:
										'The meeting may still be processing. Use mymeet_get_meeting_status to check.',
								}),
							},
						],
					}
				}

				return {
					content: [{ type: 'text', text: transcript }],
				}
			} catch (error) {
				return formatToolError(error)
			}
		},
	)
}
