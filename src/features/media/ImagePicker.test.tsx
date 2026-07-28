import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./compress-image", () => ({ compressJournalImage: vi.fn() }));

import { compressJournalImage } from "./compress-image";
import { ImagePicker } from "./ImagePicker";

const mockCompress = vi.mocked(compressJournalImage);

describe("ImagePicker", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:journal-preview"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("accepts one supported image and returns only the compressed Blob", async () => {
    const compressed = new Blob([new Uint8Array(400)], { type: "image/webp" });
    mockCompress.mockResolvedValue(compressed);
    const onChange = vi.fn();

    render(<ImagePicker value={null} onChange={onChange} />);
    const input = screen.getByLabelText("添加一张图片") as HTMLInputElement;
    expect(input).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    expect(input).not.toHaveAttribute("multiple");

    fireEvent.change(input, {
      target: {
        files: [
          new File([new Uint8Array(1_024)], "photo.jpg", { type: "image/jpeg" }),
          new File([new Uint8Array(1_024)], "ignored.png", { type: "image/png" }),
        ],
      },
    });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(compressed));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(onChange.mock.calls[0][0]).not.toHaveProperty("imagePath");
  });

  it("shows a preview and revokes its object URL when removed", async () => {
    const value = new Blob([new Uint8Array(400)], { type: "image/webp" });
    const onChange = vi.fn();

    function ControlledPicker() {
      const [image, setImage] = useState<Blob | null>(value);
      return (
        <ImagePicker
          value={image}
          onChange={(nextImage) => {
            onChange(nextImage);
            setImage(nextImage);
          }}
        />
      );
    }

    render(<ControlledPicker />);

    expect(await screen.findByAltText("所选日记图片预览")).toHaveAttribute(
      "src",
      "blob:journal-preview",
    );
    fireEvent.click(screen.getByRole("button", { name: "移除图片" }));

    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.queryByAltText("所选日记图片预览")).not.toBeInTheDocument();
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:journal-preview"));
  });

  it("announces compression errors without changing the current value", async () => {
    mockCompress.mockRejectedValue(new Error("压缩后的图片仍然过大，请选择内容更简单的图片。"));
    const onChange = vi.fn();

    render(<ImagePicker value={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("添加一张图片"), {
      target: {
        files: [new File([new Uint8Array(1_024)], "photo.jpg", { type: "image/jpeg" })],
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("压缩后的图片仍然过大");
    expect(onChange).not.toHaveBeenCalled();
  });
});
