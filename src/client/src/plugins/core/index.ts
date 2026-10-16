import type { PiStudioPlugin } from "../types";
import { createCoreActions } from "./actions";
import { createCoreMessageActions } from "./messageActions";
export const corePlugin: PiStudioPlugin = {
  apiVersion: 4,
  name: "PI STUDIO Core",
  activate: () => ({
    contributions: {
      actions: createCoreActions(),
      messageActions: createCoreMessageActions(),
    },
  }),
};
