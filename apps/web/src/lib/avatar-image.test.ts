import { describe, expect, it } from "vitest";
import { avatarCropRect } from "./avatar-image";

describe("profile photo crop geometry", () => {
  it("centers a landscape image by default", () => {
    expect(avatarCropRect(800, 600, { zoom: 1, x: 0.5, y: 0.5 })).toEqual({ side: 600, x: 100, y: 0 });
  });

  it("lets the member zoom and align the square without drawing outside the source", () => {
    expect(avatarCropRect(800, 600, { zoom: 2, x: 1, y: 0 })).toEqual({ side: 300, x: 500, y: 0 });
    expect(avatarCropRect(800, 600, { zoom: 10, x: -1, y: 2 })).toEqual({ side: 200, x: 0, y: 400 });
  });
});
