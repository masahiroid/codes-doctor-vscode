/** HTTP status codes used by the web server's JSON and HTML responses. */
export const HTTP_STATUS = Object.freeze({
  badRequest: 400,
  notFound: 404,
  payloadTooLarge: 413,
  internalServerError: 500,
});

const BYTES_PER_MEGABYTE = 1024 * 1024;

/** Whole megabytes, for human-readable upload limits. */
export function toMegabytes(bytes: number): number {
  return Math.round(bytes / BYTES_PER_MEGABYTE);
}
