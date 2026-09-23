import { DocsShell } from "@/components/docs/DocsShell";
import { buildSearchIndex, docGroups } from "@/lib/docs";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const groups = docGroups().map((g) => ({ group: g.group, docs: g.docs.map((d) => ({ slug: d.slug, title: d.title })) }));
  const index = buildSearchIndex();
  return (
    <DocsShell groups={groups} index={index}>
      {children}
    </DocsShell>
  );
}
