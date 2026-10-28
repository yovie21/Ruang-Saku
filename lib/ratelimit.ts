// In-memory store for rate limiting (simple; use Redis in production)
const limits = new Map<string, { count: number; reset: number }>();

export function createRateLimiter(
  maxRequests: number,
  windowMs: number
) {
  return (identifier: string): { allowed: boolean; remaining: number } => {
    const now = Date.now();
    let record = limits.get(identifier);

    if (!record || now > record.reset) {
      record = { count: 0, reset: now + windowMs };
      limits.set(identifier, record);
    }

    record.count++;
    const remaining = Math.max(0, maxRequests - record.count);

    return {
      allowed: record.count <= maxRequests,
      remaining
    };
  };
}

// Pre-configured limiters
export const loginLimiter = createRateLimiter(5, 15 * 60 * 1000); // 5 requests / 15 min
export const apiLimiter = createRateLimiter(30, 60 * 1000); // 30 requests / min
