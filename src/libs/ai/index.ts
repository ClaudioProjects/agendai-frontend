import { z } from "zod";
import { EVENT_TYPES, RECURRENCE_TYPES } from "../alarm";

const alarmDraftSchema = z.object({
  id: z.string().nullable(),
  eventType: z.enum(EVENT_TYPES).nullable(),
  date: z.string().date().nullable(),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  recurrence: z
    .object({
      type: z.enum(RECURRENCE_TYPES).nullable(),
      endDate: z.string().date().nullable(),
      daysOfWeek: z.array(z.number().int().min(0).max(6)).nullable(),
    })
    .nullable(),
  notifications: z.array(z.number().int().nonnegative()).nullable(),
  status: z.enum(["pending", "completed"]).nullable(),
  createdAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime().nullable(),
  exceptions: z
    .record(z.string(), z.enum(["completed", "cancelled"]))
    .nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  eventColor: z.string().nullable(),
});

export type AlarmDraft = z.infer<typeof alarmDraftSchema>;

type TimeContext = {
  currentDateTime: string;
  timezone: string;
  locale: string;
};

export class AiApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function browserTimeContext(): TimeContext {
  const date = new Date();
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offset);
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    currentDateTime: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(absoluteOffset / 60))}:${pad(absoluteOffset % 60)}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: navigator.language || "pt-BR",
  };
}

function apiConfiguration() {
  const baseUrl = import.meta.env.VITE_AGENDAI_API_URL?.replace(/\/$/, "");
  const token =
    import.meta.env.VITE_APP_AUTH_TEST_TOKEN?.trim() ||
    import.meta.env.VITE_FIREBASE_APP_CHECK_TOKEN?.trim();
  if (!baseUrl)
    throw new AiApiError(
      "AI_API_NOT_CONFIGURED",
      "Defina VITE_AGENDAI_API_URL para usar a IA.",
    );
  if (!token)
    throw new AiApiError(
      "APP_CHECK_TOKEN_REQUIRED",
      "Defina VITE_APP_AUTH_TEST_TOKEN ou VITE_FIREBASE_APP_CHECK_TOKEN para usar a IA.",
    );
  return { baseUrl, token };
}

let registeredToken: string | undefined;

async function readError(response: Response): Promise<AiApiError> {
  const fallback = `A API não pôde concluir a solicitação (${response.status}).`;
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };
    return new AiApiError(
      body.error?.code ?? "AI_API_ERROR",
      body.error?.message ?? fallback,
    );
  } catch {
    return new AiApiError("AI_API_ERROR", fallback);
  }
}

async function registerBrowserToken(
  baseUrl: string,
  token: string,
): Promise<void> {
  if (registeredToken === token) return;
  const response = await fetch(`${baseUrl}/register-auth`, {
    method: "POST",
    headers: { "X-Firebase-AppCheck": token },
  });
  if (!response.ok) throw await readError(response);
  registeredToken = token;
}

async function authorizedRequest(
  path: string,
  init: RequestInit,
  retry = true,
): Promise<Response> {
  const { baseUrl, token } = apiConfiguration();
  await registerBrowserToken(baseUrl, token);
  const headers = new Headers(init.headers);
  headers.set("X-Firebase-AppCheck", token);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  } catch {
    throw new AiApiError(
      "PROVIDER_UNAVAILABLE",
      "Não foi possível conectar ao serviço de IA.",
    );
  }
  if (response.status === 401 && retry) {
    registeredToken = undefined;
    return authorizedRequest(path, init, false);
  }
  if (!response.ok) throw await readError(response);
  return response;
}

async function parseResponse(response: Response): Promise<AlarmDraft[]> {
  return z.array(alarmDraftSchema).parse(await response.json());
}

export interface AiInterpreter {
  interpretText(text: string): Promise<AlarmDraft[]>;
  interpretAudio(audio: Blob): Promise<AlarmDraft[]>;
}

export const aiInterpreter: AiInterpreter = {
  async interpretText(text) {
    const response = await authorizedRequest("/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, context: browserTimeContext() }),
    });
    return parseResponse(response);
  },
  async interpretAudio(audio) {
    const context = browserTimeContext();
    const form = new FormData();
    form.set("audio", audio, "lembrete.webm");
    form.set("currentDateTime", context.currentDateTime);
    form.set("timezone", context.timezone);
    form.set("locale", context.locale);
    const response = await authorizedRequest("/transcribe", {
      method: "POST",
      body: form,
    });
    return parseResponse(response);
  },
};
