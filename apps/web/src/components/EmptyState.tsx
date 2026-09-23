import { ReactNode } from "react";
import { Card, CardBody } from "./ui/Card";

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card>
      <CardBody className="text-center py-12">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {children && <div className="mt-2 text-sm text-muted">{children}</div>}
      </CardBody>
    </Card>
  );
}
