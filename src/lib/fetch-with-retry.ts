export interface FetchWithRetryOptions extends RequestInit {
  retries?: number;
  retryDelay?: number;
  onRetry?: (error: unknown, attempt: number) => void;
}

/**
 * HTTP status codes that indicate a definitive client error.
 * These will never succeed on retry — the request itself is wrong,
 * not the server state.
 */
const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 405, 422]);

/**
 * A native fetch wrapper that implements exponential backoff.
 * Replaces standard fetch calls to eliminate connection drops and race conditions.
 *
 * Non-retryable status codes (400, 401, 403, 404, 405, 422) throw immediately
 * without wasting retries. Transient errors (429, 5xx, network) are retried.
 */
export async function fetchWithRetry(url: string | URL, options: FetchWithRetryOptions = {}): Promise<Response> {
  const { retries = 3, retryDelay = 1000, onRetry, signal, ...fetchOptions } = options;
  
  let lastError: unknown;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort("TIMEOUT"), 90000);
    const combinedSignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: combinedSignal,
      });

      if (!response.ok) {
        // Fail fast on definitive client errors — retrying won't help
        if (NON_RETRYABLE_STATUSES.has(response.status)) {
          throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
        }
        throw new RetryableError(`HTTP Error: ${response.status} ${response.statusText}`);
      }
      return response;
    } catch (error) {
      lastError = error;

      if (signal?.aborted) {
        throw error;
      }

      // Non-retryable errors propagate immediately
      if (!(error instanceof RetryableError)) {
        // Network errors (TypeError) and timeouts are retryable
        if (!(error instanceof TypeError) && !(error instanceof DOMException)) {
          throw error;
        }
      }

      if (onRetry) onRetry(error, attempt + 1);
      
      if (attempt < retries - 1) {
        // Exponential backoff
        const delay = retryDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
  
  throw lastError instanceof Error 
    ? new Error(`Failed after ${retries} attempts. Last error: ${lastError.message}`)
    : new Error(`Failed after ${retries} attempts.`);
}

/** Marker class to distinguish retryable HTTP errors from non-retryable ones. */
class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableError";
  }
}
