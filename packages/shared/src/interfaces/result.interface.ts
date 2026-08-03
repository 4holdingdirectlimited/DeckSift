export interface Response {
  success: boolean;
  /** Optional human-readable message — many routes only return success/data. */
  message?: string;
}

export interface Result<T> extends Response {
  data?: T;
}

export interface AuthResponse extends Response {
  redirect?: string;
}
