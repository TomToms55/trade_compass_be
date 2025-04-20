declare module 'tmai-api' {

  // Generic structure for API responses
  interface ApiResponse<T> {
    success: boolean;
    message: string;
    length: number;
    data: T;
  }

  // Interface for the data items in the trader grades response
  interface TraderGradeDataItem {
    TOKEN_ID: number;
    TOKEN_NAME: string;
    TOKEN_SYMBOL: string;
    DATE: string; // Could potentially be Date if parsed
    TA_GRADE: number;
    QUANT_GRADE: number;
    TM_TRADER_GRADE: number;
    TM_TRADER_GRADE_24H_PCT_CHANGE: number;
  }

  type GetOptions = Record<string, string | number | undefined>;

  interface ApiEndpoint<T> {
    get(options: GetOptions): Promise<ApiResponse<T[]>>;
  }

  export class TokenMetricsClient {
    constructor(apiKey: string);
    traderGrades: ApiEndpoint<TraderGradeDataItem>;
    [key: string]: any;
  }
} 