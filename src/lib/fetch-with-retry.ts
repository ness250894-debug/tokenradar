export interface FetchWithRetryOptions extends RequestInit {
  retries?: number;
  retryDelay?: number;
  onRetry?: (error: unknown, attempt: number) => void;
}

/**
 * A native fetch wrapper that implements exponential backoff.
 * Replaces standard fetch calls to eliminate connection drops and race conditions.
 */
export async function fetchWithRetry(url: string | URL, options: FetchWithRetryOptions = {}): Promise<Response> {
  const { retries = 3, retryDelay = 1000, onRetry, ...fetchOptions } = options;
  
  let lastError: unknown;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort("TIMEOUT"), 15000);
      
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (onRetry) onRetry(error, attempt + 1);
      
      if (attempt < retries - 1) {
        // Exponential backoff
        const delay = retryDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError instanceof Error 
    ? new Error(`Failed after ${retries} attempts. Last error: ${lastError.message}`)
    : new Error(`Failed after ${retries} attempts.`);
}
