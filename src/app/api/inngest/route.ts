import { inngest } from "@/lib/jobs/inngest-client";
import { serve } from "inngest/next";

import { inngestFunctions } from "@/lib/jobs/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestFunctions,
});
