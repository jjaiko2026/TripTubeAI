import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardHeader>
    </Card>
  );
}
