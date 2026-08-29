import { useEffect, useState } from "react";

export type HTTPMethod = "GET" | "POST" | "PUT" | "DELETE";
export type WebAction<
  R extends object,
  Body extends object | string | undefined,
> = (key: string, body?: Body) => WebRequestResult<R>;
export type WebRequestResult<R extends object> = {
  result: R | null;
  error: Error | null;
  loading: boolean;
};

function coerceRequestBody(body: object | string | undefined): string {
  if (body === undefined) return ""; // Confirm how backend expects no-body requests - empty string or null/None?
  if (typeof body === "string") return body;
  else return JSON.stringify(body);
}

export function useWebAction<R extends object>(
  action: "GET",
  URL: string,
): WebAction<R, undefined>;
export function useWebAction<R extends object, B extends object | string>(
  action: "POST" | "PUT" | "DELETE",
  URL: string,
): WebAction<R, B>;

export function useWebAction<R extends object, B extends object | string>(
  action: HTTPMethod,
  URL: string,
): WebAction<R, B> {
  throw new Error(`useWebAction is not implemented yet for ${action} ${URL} (${coerceRequestBody({} as B)})`);
}

export function useWebGet<R extends object>(
  URL: string,
): WebAction<R, undefined> {
  return useWebAction("GET", URL);
}

export function useWebPoll<R extends object>(
  URL: string,
  interval: number,
  key?: string,
): WebRequestResult<R> {
  const [result, setResult] = useState<WebRequestResult<R>>({
    result: null,
    error: null,
    loading: true,
  });
  const getRaw = useWebGet<R>(URL);
  const get = () => getRaw(key ?? URL); // Use URL as cache key if not provided
  useEffect(() => {
    // Look into syncExternalStore for a more robust solution if needed, and/or do a suspend. maybe generalise existing logic?
    setResult(get());
    const poll = setInterval(() => {
      setResult(get());
    }, interval);
    return () => clearInterval(poll);
  }, [URL, interval]);
  return result;
}

export function useWebPush<R extends object, B extends object | string>(
  URL: string,
): WebAction<R, B> {
  return useWebAction("POST", URL);
}
