import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { logger } from './logger.js'
import { AuthError, NotFoundError, RateLimitError, ApiError, MediaImportError } from './errors.js'
import type { Format, ImportMediaInput, MeetingScope, Source, Template } from './types.js'

const DEFAULT_BASE_URL = 'https://backend.mymeet.ai'
const REQUEST_TIMEOUT_MS = 15_000
const MAX_RETRIES = 3
const RETRY_DELAYS = [1_000, 2_000, 4_000] // exponential backoff

const MeetingStatusBatchSchema = z.object({ statuses: z.record(z.unknown()) })
const ImportAcceptedSchema = z.object({
	meeting_id: z.string().min(1),
	source: z.enum(['youtube', 'yandex_disk', 'google_drive']),
	status: z.string().min(1),
})
const ImportRejectionSchema = z.object({
	code: z.string().min(1).optional(),
	message: z.string().min(1),
})

function parseBody(text: string): unknown {
	if (!text) return null
	try {
		return JSON.parse(text)
	} catch {
		return text
	}
}

export type Credential =
	| { kind: 'apikey'; apiKey: string }
	| { kind: 'oauth'; email: string }

export class MyMeetApiClient {
	private credential: Credential
	private serviceSecret: string
	private baseUrl: string

	constructor(credential: Credential | string, baseUrl = DEFAULT_BASE_URL) {
		this.credential =
			typeof credential === 'string'
				? { kind: 'apikey', apiKey: credential }
				: credential
		this.serviceSecret = process.env.MYMEET_SERVICE_SECRET ?? ''
		if (this.credential.kind === 'oauth' && !this.serviceSecret) {
			throw new Error('MYMEET_SERVICE_SECRET is required for OAuth credentials')
		}
		this.baseUrl = baseUrl.replace(/\/$/, '')
	}

	private async request(
		method: string,
		path: string,
		body?: Record<string, unknown>,
		idempotencyKey?: string,
		attempt = 0,
	): Promise<unknown> {
		const url = new URL(path, this.baseUrl)

		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

		const headers: Record<string, string> =
			this.credential.kind === 'apikey'
				? { 'X-API-KEY': this.credential.apiKey }
				: {
						'X-Service-Secret': this.serviceSecret,
						'X-User-Email': this.credential.email,
					}
		if (body) headers['Content-Type'] = 'application/json'
		if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey

		try {
			logger.debug(`${method} ${path}`, { attempt })

			const response = await fetch(url.toString(), {
				method,
				headers,
				body: body ? JSON.stringify(body) : undefined,
				signal: controller.signal,
			})

			if (!response.ok) {
				const text = await response.text().catch(() => '')

				if (idempotencyKey) {
					const rejection = ImportRejectionSchema.safeParse(parseBody(text))
					if (rejection.success && (rejection.data.code || response.status === 403)) {
						throw new MediaImportError(
							rejection.data.code ?? 'forbidden',
							rejection.data.message,
							response.status,
							idempotencyKey,
						)
					}
					if (response.status === 429) {
						throw new MediaImportError('rate_limit_exceeded', 'Too many import requests.', 429, idempotencyKey)
					}
				}

				if (response.status === 401) {
					throw new AuthError()
				}

				if (response.status === 404) {
					const idMatch = path.match(/meeting(?:Id|_ids?)?[=/]([^/?&]+)/i)
					throw new NotFoundError(idMatch?.[1] ?? 'unknown')
				}

				if (
					(response.status === 429 || response.status >= 500) &&
					attempt < MAX_RETRIES
				) {
					const delay = RETRY_DELAYS[attempt] ?? 4_000
					logger.warn(`Retrying ${method} ${path} after ${delay}ms`, {
						status: response.status,
						attempt: attempt + 1,
					})
					await new Promise(resolve => setTimeout(resolve, delay))
					return this.request(method, path, body, idempotencyKey, attempt + 1)
				}

				if (response.status === 429) {
					throw new RateLimitError()
				}

				throw new ApiError(response.status, text)
			}

			return parseBody(await response.text())
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				if (attempt < MAX_RETRIES) {
					const delay = RETRY_DELAYS[attempt] ?? 4_000
					logger.warn(`Timeout on ${method} ${path}, retrying after ${delay}ms`)
					await new Promise(resolve => setTimeout(resolve, delay))
					return this.request(method, path, body, idempotencyKey, attempt + 1)
				}
				throw new ApiError(0, `Request timeout after ${REQUEST_TIMEOUT_MS}ms`)
			}
			throw error
		} finally {
			clearTimeout(timeout)
		}
	}

	async listMeetings(
		page = 1,
		perPage = 20,
		scope: MeetingScope = 'mine',
	): Promise<unknown> {
		const backendPage = Math.max(0, page - 1)
		const path =
			scope === 'workspace'
				? '/api/workspaces/active/all-meetings'
				: '/api/workspaces/active/user-meetings'
		const params = new URLSearchParams({
			page: String(backendPage),
			perPage: String(perPage),
		})

		return this.request('GET', `${path}?${params.toString()}`)
	}

	async getMeetingStatus(meetingId: string): Promise<unknown> {
		const response = await this.request(
			'GET',
			`/api/meeting/status?meeting_ids=${encodeURIComponent(meetingId)}`,
		)
		const batch = MeetingStatusBatchSchema.safeParse(response)
		if (!batch.success) return response
		return Object.hasOwn(batch.data.statuses, meetingId) ? batch.data.statuses[meetingId] : null
	}

	async getMeetingReport(meetingId: string): Promise<unknown> {
		return this.request(
			'GET',
			`/api/video/report?meeting_id=${encodeURIComponent(meetingId)}`,
		)
	}

	async downloadMeeting(meetingId: string, format: Format): Promise<unknown> {
		return this.request(
			'GET',
			`/api/storage/download?meeting_id=${encodeURIComponent(meetingId)}&format=${format}`,
		)
	}

	async recordMeeting(params: {
		link: string
		title: string
		dateTime: string
		template: Template
		source?: Source
		password?: string
		cron?: string
		participants?: string[]
	}): Promise<unknown> {
		return this.request('POST', '/api/record-meeting', {
			link: params.link,
			title: params.title,
			local_date_time: params.dateTime,
			template_name: params.template,
			source: params.source ?? this.detectSource(params.link),
			meeting_password: params.password,
			cron: params.cron,
			participants: params.participants,
		})
	}

	async importMedia({ url, templateName, speakersNumber, requestId = randomUUID() }: ImportMediaInput) {
		let response: unknown
		try {
			response = await this.request(
				'POST',
				'/api/video/import-link',
				{ url, template_name: templateName, speakers_number: speakersNumber },
				requestId,
			)
		} catch (error) {
			const transportFailed = error instanceof TypeError
			const responseUnconfirmed =
				error instanceof ApiError && (error.statusCode === 0 || (error.statusCode ?? 0) >= 500)
			if (!transportFailed && !responseUnconfirmed) throw error
			throw new MediaImportError('import_request_uncertain', 'The import request could not be confirmed.', 0, requestId)
		}
		const accepted = ImportAcceptedSchema.safeParse(response)
		if (!accepted.success) {
			throw new MediaImportError('import_request_uncertain', 'The import response could not be read.', 0, requestId)
		}
		const { meeting_id, source, status } = accepted.data
		return { meetingId: meeting_id, source, status, requestId }
	}

	async renameMeeting(meetingId: string, name: string): Promise<unknown> {
		return this.request('PUT', '/api/meeting', {
			meetingId,
			newName: name,
		})
	}

	async regenerateTemplate(
		meetingId: string,
		template: Template,
	): Promise<unknown> {
		return this.request('POST', '/api/generate-new-template', {
			meeting_id: meetingId,
			template_name: template,
		})
	}

	async updateSummary(
		meetingId: string,
		params: { templateId: string; entityName: string; newSummaryText: string },
	): Promise<unknown> {
		return this.request('PUT', `/api/meeting/${encodeURIComponent(meetingId)}/summary`, {
			templateId: params.templateId,
			entityName: params.entityName,
			newSummaryText: params.newSummaryText,
		})
	}

	async deleteMeeting(meetingId: string): Promise<unknown> {
		// Deletion is handled by the DELETE branch of /api/video/report —
		// there is no separate /api/delete-meeting endpoint.
		return this.request('DELETE', `/api/video/report?meeting_id=${encodeURIComponent(meetingId)}`)
	}

	private detectSource(url: string): string {
		const lower = url.toLowerCase()
		if (lower.includes('meet.google.com')) return 'gmeet'
		if (lower.includes('zoom.us') || lower.includes('zoom.com')) return 'zoom'
		if (
			lower.includes('teams.microsoft.com') ||
			lower.includes('teams.live.com')
		)
			return 'teams'
		if (lower.includes('telemost.yandex')) return 'telemost'
		if (lower.includes('jazz.sber') || lower.includes('salute.online'))
			return 'sberjazz'
		if (lower.includes('trueconf.')) return 'trueconf'
		if (lower.includes('konturtalk.')) return 'konturtalk'
		if (lower.includes('jitsi') || lower.includes('meet.jit.si')) return 'jitsi'
		return 'gmeet' // fallback
	}
}
