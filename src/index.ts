import { createImageFinder } from "./image-finder.ts";
import { mouseAutomation } from "./mouse.ts";
import { opencvMatcher } from "./opencv.ts";
import { macScreenCapture } from "./screen.ts";
import { macWindowBoundsProvider } from "./window-bounds.ts";
import { Window } from "./window.ts";

export { Image, loadImage } from "./image.ts";
export { point } from "./types.ts";
export type { Match, Point, Size } from "./types.ts";
export { Window } from "./window.ts";

export const getWindow = async (appName: string): Promise<Window> => {
  await macWindowBoundsProvider.get(appName);

  return new Window(appName, {
    automation: mouseAutomation,
    boundsProvider: macWindowBoundsProvider,
    imageFinder: createImageFinder(macScreenCapture, opencvMatcher),
  });
};
