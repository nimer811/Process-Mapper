import { DEV_USER_HEADER, type InterviewStreamEvent } from '@process-ai/shared';
import { getDevUserId } from '@/auth/dev-session';
import { ApiError } from '@/lib/api';

/** Posts a message and yields the interviewer's server-sent events as they arrive. */
export async function* sendInterviewMessage(
  interviewId: string,
  text: string,
): AsyncGenerator<InterviewStreamEvent> {
  const headers = new Headers({ 'content-type': 'application/json', accept: 'text/event-stream' });
  const devUserId = getDevUserId();
  if (devUserId) headers.set(DEV_USER_HEADER, devUserId);

  const res = await fetch(`/api/v1/interviews/${interviewId}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text }),
  });
  if (!res.ok || !res.body) {
    const problem = await res
      .json()
      .catch(() => ({ type: 'about:blank', title: res.statusText, status: res.status }));
    throw new ApiError(problem);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = chunk
        .split('\n')
        .filter((l) => l.startsWith('data: '))
        .map((l) => l.slice(6))
        .join('\n');
      if (data) yield JSON.parse(data) as InterviewStreamEvent;
    }
  }
}
