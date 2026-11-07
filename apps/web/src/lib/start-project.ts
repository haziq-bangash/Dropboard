import { suggestDashboard, type Starter } from "@dropboard/engine";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { authClient } from "./auth-client";
import { loadFile } from "./ingest";
import { saveProjectData } from "./local-data";
import { newLoadId, setLoaded } from "./loaded-data";
import { useProjectMutations } from "./queries";

/** A sample dataset as a file, built on the spot in the browser. */
export const starterFile = (starter: Starter) =>
  new File([starter.csv()], starter.fileName, { type: "text/csv" });

/**
 * Read a file in the browser, build a first dashboard, save it as a project, keep a copy of the rows on this device,
 * and open it. Used by the new project page (a dropped file) and by the sample cards.
 */
export function useStartProject() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const { create } = useProjectMutations();

  return useMutation({
    mutationFn: async ({
      file,
      title: chosen,
    }: {
      file: File;
      title?: string;
    }) => {
      const { title, profile } = await loadFile(file);
      const created = await create.mutateAsync({
        spec: suggestDashboard(chosen ?? title, profile),
        source: { fileName: file.name, rowCount: profile.rowCount },
      });
      setLoaded({
        projectId: created.id,
        fileName: file.name,
        profile,
        loadId: newLoadId(),
      });
      if (session) await saveProjectData(session.user.id, created.id);
      return created;
    },
    onSuccess: (created) => router.push(`/app/p/${created.id}`),
  });
}
