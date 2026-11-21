export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} was not found. It may have been deleted already.`);
export const badRequest = (message: string, details?: unknown) => new HttpError(400, message, details);
