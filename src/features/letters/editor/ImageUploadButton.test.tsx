import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ImageUploadButton, type ImageUploadDependencies } from "./ImageUploadButton";

const LETTER_ID = "22222222-2222-4222-8222-222222222222";
const ASSET_ID = "33333333-3333-4333-8333-333333333333";

afterEach(cleanup);

function dependencies(overrides: Partial<ImageUploadDependencies> = {}): ImageUploadDependencies {
  return {
    compress: vi.fn(async (file) => ({ file, width: 100, height: 80, sizeBytes: file.size })),
    createUpload: vi.fn(async () => ({
      ok: true as const,
      assetId: ASSET_ID,
      path: "user/letter/file.webp",
    })),
    uploadAuthenticated: vi.fn(async () => undefined),
    completeUpload: vi.fn(async () => ({
      ok: true as const,
      assetId: ASSET_ID,
      src: `/api/letter-assets/${ASSET_ID}`,
    })),
    failUpload: vi.fn(async () => ({ ok: true as const, assetId: ASSET_ID })),
    ...overrides,
  };
}

describe("ImageUploadButton", () => {
  it("stays disabled and explains that the first autosave is preparing the paper", () => {
    render(<ImageUploadButton letterId={undefined} onUploaded={() => undefined} deps={dependencies()} />);
    expect(screen.getByRole("button", { name: "插入图片" })).toBeDisabled();
    expect(screen.getByText("正在准备信纸")).toBeVisible();
  });

  it("compresses, uploads, verifies, and only then inserts the stable asset route", async () => {
    const deps = dependencies();
    const onUploaded = vi.fn();
    render(<ImageUploadButton letterId={LETTER_ID} onUploaded={onUploaded} deps={deps} />);
    const file = new File(["image"], "photo.png", { type: "image/png" });

    fireEvent.change(screen.getByLabelText("选择信件图片"), { target: { files: [file] } });

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(`/api/letter-assets/${ASSET_ID}`));
    expect(deps.createUpload).toHaveBeenCalledWith({
      letterId: LETTER_ID,
      mimeType: "image/webp",
      width: 100,
      height: 80,
      sizeBytes: file.size,
    });
    expect(deps.uploadAuthenticated).toHaveBeenCalledWith("user/letter/file.webp", file);
    expect(deps.completeUpload).toHaveBeenCalledWith({
      assetId: ASSET_ID,
      path: "user/letter/file.webp",
    });
  });

  it("keeps a failed image retryable without inserting it", async () => {
    const uploadAuthenticated = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    const deps = dependencies({ uploadAuthenticated });
    const onUploaded = vi.fn();
    render(<ImageUploadButton letterId={LETTER_ID} onUploaded={onUploaded} deps={deps} />);

    fireEvent.change(screen.getByLabelText("选择信件图片"), {
      target: { files: [new File(["image"], "photo.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("图片上传失败"));
    expect(onUploaded).not.toHaveBeenCalled();
    expect(deps.failUpload).toHaveBeenCalledWith({
      assetId: ASSET_ID,
      path: "user/letter/file.webp",
    });
    expect(deps.completeUpload).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "重试图片" }));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledOnce());
    expect(uploadAuthenticated).toHaveBeenCalledTimes(2);
  });

  it("retries confirmation for the same uploaded asset when the first response is lost", async () => {
    const completeUpload = vi
      .fn()
      .mockRejectedValueOnce(new Error("response lost after commit"))
      .mockResolvedValueOnce({
        ok: true as const,
        assetId: ASSET_ID,
        src: `/api/letter-assets/${ASSET_ID}`,
      });
    const deps = dependencies({ completeUpload });
    const onUploaded = vi.fn();
    render(<ImageUploadButton letterId={LETTER_ID} onUploaded={onUploaded} deps={deps} />);

    fireEvent.change(screen.getByLabelText("选择信件图片"), {
      target: { files: [new File(["image"], "photo.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());

    expect(deps.createUpload).toHaveBeenCalledOnce();
    expect(deps.uploadAuthenticated).toHaveBeenCalledOnce();
    expect(deps.failUpload).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "重试图片" }));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledOnce());

    expect(completeUpload).toHaveBeenCalledTimes(2);
    expect(completeUpload).toHaveBeenNthCalledWith(2, {
      assetId: ASSET_ID,
      path: "user/letter/file.webp",
    });
    expect(deps.createUpload).toHaveBeenCalledOnce();
    expect(deps.uploadAuthenticated).toHaveBeenCalledOnce();
    expect(deps.failUpload).not.toHaveBeenCalled();
  });

  it("cleans a tracked tombstone when deletion wins before upload completion", async () => {
    const deps = dependencies({
      completeUpload: vi.fn(async () => ({
        ok: false as const,
        code: "CLEANED" as const,
        message: "late asset cleaned",
      })),
    });
    render(
      <ImageUploadButton
        letterId={LETTER_ID}
        onUploaded={() => undefined}
        deps={deps}
      />,
    );

    fireEvent.change(screen.getByLabelText("选择信件图片"), {
      target: { files: [new File(["image"], "late.jpg", { type: "image/jpeg" })] },
    });

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("late asset cleaned"));
    expect(deps.failUpload).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "重试图片" })).toBeEnabled();
  });
});
