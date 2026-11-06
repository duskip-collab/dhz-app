"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";

export function ImageUploadField({
  name,
  currentPhotoUrl,
  onFileChange,
  caption = "JPG, PNG alebo WebP.",
  disabled = false,
  rounded = false,
}: {
  name?: string;
  currentPhotoUrl?: string | null;
  onFileChange?: (file: File | null) => void;
  caption?: string;
  disabled?: boolean;
  rounded?: boolean;
}) {
  const generatedId = useId().replace(/:/g, "");
  const filesRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<"files" | "camera" | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleChange = (source: "files" | "camera", selectedInput: HTMLInputElement) => {
    const file = selectedInput.files?.[0] ?? null;
    const otherInput = source === "files" ? cameraRef.current : filesRef.current;
    if (otherInput) otherInput.value = "";
    setSelectedSource(file ? source : null);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
    onFileChange?.(file);
  };

  const clearSelection = () => {
    if (filesRef.current) {
      filesRef.current.value = "";
    }
    if (cameraRef.current) {
      cameraRef.current.value = "";
    }
    setSelectedSource(null);
    setPreviewUrl(null);
    onFileChange?.(null);
  };

  return (
    <div className="flex items-center gap-4">
      {previewUrl || currentPhotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl ?? currentPhotoUrl ?? ""}
          alt="Náhľad fotografie"
          className={`h-24 w-24 shrink-0 border border-gray-200 object-cover ${rounded ? "rounded-full" : "rounded-lg"}`}
        />
      ) : (
        <span className={`flex h-24 w-24 shrink-0 items-center justify-center bg-[#C62828]/10 text-[#C62828] ${rounded ? "rounded-full" : "rounded-lg"}`}>
          <ImagePlus className="h-9 w-9" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <input
          ref={filesRef}
          id={`${generatedId}-files`}
          type="file"
          name={selectedSource === "files" ? name : undefined}
          accept="image/*"
          className="sr-only"
          disabled={disabled}
          onChange={(event) => handleChange("files", event.currentTarget)}
        />
        <input
          ref={cameraRef}
          id={`${generatedId}-camera`}
          type="file"
          name={selectedSource === "camera" ? name : undefined}
          accept="image/*"
          capture="environment"
          className="sr-only"
          disabled={disabled}
          onChange={(event) => handleChange("camera", event.currentTarget)}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => filesRef.current?.click()}
            className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition hover:border-red-200 hover:text-[#C62828] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ImagePlus className="h-4 w-4" />
            Vybrať zo súborov
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => cameraRef.current?.click()}
            className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition hover:border-red-200 hover:text-[#C62828] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Camera className="h-4 w-4" />
            Odfotiť fotoaparátom
          </button>
          {previewUrl && (
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm font-semibold text-gray-500 transition hover:text-[#C62828]"
              aria-label="Odstrániť vybranú fotografiu"
            >
              <X className="h-4 w-4" />
              Zrušiť
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-400">{caption}</p>
      </div>
    </div>
  );
}
