import { Badge } from "@/components/ui/badge";
import { getClassification, getSeverity, getConfidence } from "@/lib/format";

export function ClassificationBadge({ value }: { value: string | null | undefined }) {
  const c = getClassification(value);
  return <Badge variant="outline" className={`${c.className} font-medium`}>{c.label}</Badge>;
}

export function SeverityBadge({ value }: { value: string | null | undefined }) {
  const c = getSeverity(value);
  return <Badge variant="outline" className={`${c.className} font-medium`}>{c.label}</Badge>;
}

export function ConfidenceBadge({ value }: { value: string | null | undefined }) {
  const c = getConfidence(value);
  return <Badge variant="outline" className={`${c.className} font-medium`}>{c.label}</Badge>;
}
