import {
  askForAccessibilityAccess,
  askForScreenCaptureAccess,
  getAuthStatus,
  type PermissionType,
} from "@nut-tree-fork/node-mac-permissions";

export interface CheckRequirementsOptions {
  screenRecording?: boolean;
}

const isAuthorized = (status: PermissionType | "not determined"): boolean =>
  status === "authorized";

export const checkRequirements = async (options: CheckRequirementsOptions = {}): Promise<void> => {
  if (!isAuthorized(getAuthStatus("accessibility"))) {
    askForAccessibilityAccess();

    throw new Error("Accessibility permission is required");
  }

  if (!options.screenRecording) {
    return;
  }

  if (!isAuthorized(getAuthStatus("screen"))) {
    askForScreenCaptureAccess();

    throw new Error("Screen Recording permission is required");
  }
};
