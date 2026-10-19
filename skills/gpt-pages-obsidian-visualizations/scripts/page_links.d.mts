export interface PageLinkTarget {
  pageId: string;
  occurrences: number;
}

export interface PageLinkEdit {
  /** Offsets in the original JavaScript string (UTF-16), not UTF-8 byte offsets. */
  start: number;
  end: number;
  oldText: string;
  newText: string;
}

export type PageLinkUnresolvedReason =
  | 'raw-html-document'
  | 'unsupported-page-uri'
  | 'ambiguous-definition'
  | 'definition-used-by-image'
  | 'destination-not-located'
  | 'read-failed'
  | 'not-resolved'
  | 'page-id-mismatch'
  | 'missing-url'
  | 'invalid-https-url';

export interface UnresolvedPageLink {
  pageId: string | null;
  url: string;
  line: number;
  reason: PageLinkUnresolvedReason;
}

export interface PageLinkPlan {
  sourceSha256: string;
  targets: PageLinkTarget[];
  edits: PageLinkEdit[];
  unresolved: UnresolvedPageLink[];
}

/** Receipts are untrusted tool/JSON input and are validated at runtime. */
export function planPageLinks(source: string, receipts?: unknown): PageLinkPlan;
export function applyPageLinkPlan(source: string, plan: PageLinkPlan): string;
