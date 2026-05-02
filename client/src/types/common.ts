export interface PaginationParams {
  page?: number;
  per_page?: number;
  search?: string | null;
  sort?: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
  per_page: number;
}

export interface ErrorResponse {
  detail: string;
}
