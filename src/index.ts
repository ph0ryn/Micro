import { createImageFinder } from "./image-finder.ts";
import { mouseAutomation } from "./mouse.ts";
import { opencvMatcher } from "./opencv.ts";
import { macScreenCapture } from "./screen.ts";
import { macWindowFrameProvider, type WindowTarget } from "./window-frame.ts";
import { Window } from "./window.ts";

export { Image, loadImage } from "./image.ts";
export { point } from "./types.ts";
export { sleep } from "./util.ts";
export { checkRequirements } from "./requirements.ts";
export type { CheckRequirementsOptions } from "./requirements.ts";
export type { FrameOptions, FindOptions, Match, MoveOptions, Point, Size } from "./types.ts";
export type { WindowTarget } from "./window-frame.ts";
export { Window } from "./window.ts";

export interface GetWindowOptions {
  cacheFrame?: boolean;
}

export const getWindow = async (
  target: WindowTarget,
  options: GetWindowOptions = {},
): Promise<Window> => {
  const frame = await macWindowFrameProvider.get(target);

  return new Window(target, {
    automation: mouseAutomation,
    cacheFrame: options.cacheFrame,
    frame,
    frameProvider: macWindowFrameProvider,
    imageFinder: createImageFinder(macScreenCapture, opencvMatcher),
  });
};
