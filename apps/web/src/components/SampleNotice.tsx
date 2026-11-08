import type { TableProfile } from "@dropboard/engine";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Said whenever the table is a random sample, because totals and counts then describe the sample and not the file. */
export function SampleNotice({ sample }: { sample: NonNullable<TableProfile["sample"]> }) {
  const rows = sample.rows.toLocaleString();
  return (
    <Alert data-testid="sample-notice">
      <AlertTitle>Built from a sample of the file</AlertTitle>
      <AlertDescription>
        {sample.of > sample.rows ? `This file has ${sample.of.toLocaleString()} rows, more than your browser can hold at once, so` : "This file is more than your browser can hold at once, so"} the
        dashboard uses a random sample of {rows} rows. Counts and totals describe the sample, not the whole file. A smaller file, or one with fewer columns, is read in full.
      </AlertDescription>
    </Alert>
  );
}
