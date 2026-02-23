export type PaginationParams = {
  page?: number;
  pageSize?: number;
  defaultPage?: number;
  defaultPageSize?: number;
  maxPageSize?: number;
};

export const getPaginationParams = (params: PaginationParams) => {
  const page = params.page && params.page > 0 ? params.page : params.defaultPage ?? 1;
  const rawPageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : params.defaultPageSize ?? 12;
  const pageSize = params.maxPageSize ? Math.min(rawPageSize, params.maxPageSize) : rawPageSize;
  const skip = (page - 1) * pageSize;

  return { page, pageSize, skip };
};

export const buildPaginatedResponse = <T>(data: T[], total: number, page: number, pageSize: number) => ({
  data,
  total,
  totalPages: Math.ceil(total / pageSize),
  page,
  pageSize,
});
