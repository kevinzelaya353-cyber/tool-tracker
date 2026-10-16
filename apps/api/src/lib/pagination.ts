export interface Page<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function pageArgs(q: { page: number; pageSize: number }) {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

export function toPage<T>(data: T[], total: number, q: { page: number; pageSize: number }): Page<T> {
  return { data, total, page: q.page, pageSize: q.pageSize };
}
