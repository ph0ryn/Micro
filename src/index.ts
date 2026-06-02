import { nutAutomation } from "./nut-automation.ts";
import { macWindowBoundsProvider } from "./window-bounds.ts";
import { Window } from "./window.ts";

export { point } from "./types.ts";
export type { Point, Size } from "./types.ts";
export { Window } from "./window.ts";

export const getWindow = async (appName: string): Promise<Window> => {
  await macWindowBoundsProvider.get(appName);

  return new Window(appName, {
    automation: nutAutomation,
    boundsProvider: macWindowBoundsProvider,
  });
};
