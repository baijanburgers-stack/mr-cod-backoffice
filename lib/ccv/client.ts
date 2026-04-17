import { randomUUID } from 'crypto';
import {
  CCV_HOSTS,
  CcvEnvironment,
  CcvCreatePaymentRequest,
  CcvCreateRefundRequest,
  CcvCreateTransactionResponse,
  CcvReadTransactionResponse,
  CcvApiError,
} from './types';

// ── CCV HTTP Client ──────────────────────────────────────────────────────────
// Implements the CCV Cloud Connect (Attended) v2.2 REST API
// Auth: Basic base64(API_KEY:)  — empty password
// Idempotency-Reference: UUID per transaction (prevent duplicate charges)

const USER_AGENT = 'MrCod-POS/2.0 (ccv-integration/1.0)';

export class CcvClientError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly ccvError:   CcvApiError,
    public readonly raw:        string,
  ) {
    super(ccvError.message ?? `CCV API error ${statusCode}`);
    this.name = 'CcvClientError';
  }
}

export class CcvClient {
  private readonly baseUrl:  string;
  private readonly authHeader: string;

  constructor(apiKey: string, environment: CcvEnvironment) {
    this.baseUrl    = CCV_HOSTS[environment];
    // Basic base64(API_KEY:) — password is empty
    const creds     = Buffer.from(`${apiKey}:`).toString('base64');
    this.authHeader = `Basic ${creds}`;
  }

  // ── Create sale transaction ──────────────────────────────────────────────

  async createPayment(
    body:               CcvCreatePaymentRequest,
    idempotencyRef:     string = randomUUID(),
  ): Promise<CcvCreateTransactionResponse> {
    return this.post<CcvCreateTransactionResponse>(
      '/payment',
      body,
      idempotencyRef,
    );
  }

  // ── Create refund transaction ────────────────────────────────────────────

  async createRefund(
    body:           CcvCreateRefundRequest,
    idempotencyRef: string = randomUUID(),
  ): Promise<CcvCreateTransactionResponse> {
    return this.post<CcvCreateTransactionResponse>(
      '/refund',
      body,
      idempotencyRef,
    );
  }

  // ── Read transaction status ──────────────────────────────────────────────

  async readTransaction(reference: string): Promise<CcvReadTransactionResponse> {
    return this.get<CcvReadTransactionResponse>(
      '/transaction',
      { reference },
    );
  }

  // ── Private HTTP helpers ─────────────────────────────────────────────────

  private headers(idempotencyRef?: string): Record<string, string> {
    const h: Record<string, string> = {
      'Authorization':  this.authHeader,
      'Content-Type':   'application/json; charset=UTF-8',
      'Accept':         'application/json',
      'User-Agent':     USER_AGENT,
    };
    if (idempotencyRef) {
      h['Idempotency-Reference'] = idempotencyRef;
    }
    return h;
  }

  private async post<T>(
    path:           string,
    body:           unknown,
    idempotencyRef: string,
  ): Promise<T> {
    const url  = `${this.baseUrl}${path}`;
    const raw  = JSON.stringify(body);

    let res: Response;
    try {
      res = await fetch(url, {
        method:  'POST',
        headers: this.headers(idempotencyRef),
        body:    raw,
      });
    } catch (err) {
      throw new CcvClientError(0, {
        type:    'network_error',
        message: `Failed to reach CCV at ${url}: ${String(err)}`,
      }, '');
    }

    return this.parseResponse<T>(res);
  }

  private async get<T>(
    path:   string,
    params: Record<string, string>,
  ): Promise<T> {
    const qs  = new URLSearchParams(params).toString();
    const url = `${this.baseUrl}${path}?${qs}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method:  'GET',
        headers: this.headers(),
      });
    } catch (err) {
      throw new CcvClientError(0, {
        type:    'network_error',
        message: `Failed to reach CCV at ${url}: ${String(err)}`,
      }, '');
    }

    return this.parseResponse<T>(res);
  }

  private async parseResponse<T>(res: Response): Promise<T> {
    const text = await res.text();

    if (res.ok) {
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new CcvClientError(res.status, {
          type:    'parse_error',
          message: `CCV returned non-JSON response: ${text.slice(0, 200)}`,
        }, text);
      }
    }

    // Parse CCV error body
    let ccvError: CcvApiError = { message: text };
    try {
      ccvError = JSON.parse(text) as CcvApiError;
    } catch { /* use raw text */ }

    throw new CcvClientError(res.status, ccvError, text);
  }
}

// ── Factory function ─────────────────────────────────────────────────────────

export function createCcvClient(
  apiKey:      string,
  environment: CcvEnvironment,
): CcvClient {
  return new CcvClient(apiKey, environment);
}
