import { createImageFinder } from "./image-finder.ts";
import { mouseAutomation } from "./mouse.ts";
import { opencvMatcher } from "./opencv.ts";
import { macScreenCapture } from "./screen.ts";
import { macWindowBoundsProvider, type WindowTarget } from "./window-bounds.ts";
import { Window } from "./window.ts";

export { Image, loadImage } from "./image.ts";
export { point } from "./types.ts";
export { checkRequirements } from "./requirements.ts";
export type { CheckRequirementsOptions } from "./requirements.ts";
export type { Match, Point, Size } from "./types.ts";
export type { WindowTarget } from "./window-bounds.ts";
export { Window } from "./window.ts";

export const getWindow = async (target: WindowTarget): Promise<Window> => {
  const bounds = await macWindowBoundsProvider.get(target);

  return new Window(target, {
    automation: mouseAutomation,
    bounds,
    boundsProvider: macWindowBoundsProvider,
    imageFinder: createImageFinder(macScreenCapture, opencvMatcher),
  });
};
