# Archive project prediction

**INTENDED OUTPUT.** This report mirrors the README archive example. It was
not produced by the Skia CLI. The CLI shell is unimplemented. The simplified
view is **not executable** and does not prove that the writes are atomic.

## Change

The interesting part of the synthetic diff is the success path: authorize,
then mutate, then audit, then notify.

```diff
 export async function archiveProject(
   input: ArchiveProjectInput,
   deps: Dependencies,
 ): Promise<ArchiveResult> {
   const project = await deps.projects.findById(input.projectId);
   if (!project) return { ok: false, reason: "not_found" };
+  const isOwner = project.ownerId === input.userId;
+  const isAdmin = input.roles.includes("admin");
+  if (!isOwner && !isAdmin) {
+    return { ok: false, reason: "forbidden" };
+  }
+  if (project.status === "archived") {
+    return { ok: true, reason: "already_archived" };
+  }
+  await deps.projects.updateStatus(project.id, "archived");
+  await deps.audit.write({
+    actorId: input.userId,
+    action: "project.archived",
+    projectId: project.id,
+  });
+  await deps.notifications.enqueue("project-archived", {
+    projectId: project.id,
+    ownerId: project.ownerId,
+  });
   return { ok: true, reason: "archived" };
 }
```

## Simplified view

```text
SIMPLIFIED VIEW — not executable
src/projects/archiveProject.ts:8-31

project missing                    -> not_found; no writes
caller is not owner AND not admin  -> forbidden; no writes
project already archived            -> already_archived; no writes
otherwise:
  update project status             -> archived
  write audit event                 -> project.archived
  enqueue owner notification        -> project-archived
  return                            -> archived

coverage note: status, audit, and notification calls are ordered side effects;
failure behavior after the status update must be checked in the source.
```

## Prediction prompt

```text
Given: project exists, caller is an admin, project.status="active"
What happens before the function returns?
```

Example answer, `developer_supplied`:

```text
status update, audit write, and notification enqueue
```

The useful follow-up is the coverage note. "Authorized" in this reading does
not mean the status update, the audit write, and the notification are one
transaction. If the audit write failed after the status update, this
simplified view does not say whether the project stays archived. That path
is for source inspection.

## Coverage for this sample

| Region | State in this illustration | Next action |
|---|---|---|
| Missing project, forbidden caller, already archived | Shown as early returns with no writes | Read those branches in the original source |
| Ordered side effects on the success path | Shown, with a coverage note | Inspect transaction and dependency behavior |
| Rollback after a failed audit write | `unchecked` in this reading | Do not invent a rollback from the short view |

Labels such as `supported` on a future real run would mean "analyzed inside
the contract," not "correct in production."
