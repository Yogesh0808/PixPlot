import React, { useState, useCallback, useContext, useEffect, useRef } from "react";
import ReactCrop, { Crop, PixelCrop } from "react-image-crop";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Loader2, ChevronRight, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { FileContext } from "@/App";
import { useFormat } from "@/components/ui/format-selector";
import "react-image-crop/dist/ReactCrop.css";

interface CropProps {
  className?: string;
}

const Crop: React.FC<CropProps> = ({ className }) => {
  const { files, setFiles } = useContext(FileContext);
  const { selectedFormat, requiredFiles } = useFormat();
  const navigate = useNavigate();

  // Crops + pixel crops
  const [crop1, setCrop1] = useState<Crop>({ unit: "px", x: 0, y: 0, width: 0, height: 0 });
  const [crop2, setCrop2] = useState<Crop>({ unit: "px", x: 0, y: 0, width: 0, height: 0 });
  const [croppedAreaPixels1, setCroppedAreaPixels1] = useState<PixelCrop | null>(null);
  const [croppedAreaPixels2, setCroppedAreaPixels2] = useState<PixelCrop | null>(null);

  // UI / status
  const [isCropping1, setIsCropping1] = useState(false);
  const [isCropping2, setIsCropping2] = useState(false);
  const [isGeneratingPreview1, setIsGeneratingPreview1] = useState(false);
  const [isGeneratingPreview2, setIsGeneratingPreview2] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [cropApplied1, setCropApplied1] = useState(false);
  const [cropApplied2, setCropApplied2] = useState(false);

  const [highResImage1, setHighResImage1] = useState<string | null>(null);
  const [highResImage2, setHighResImage2] = useState<string | null>(null);
  const [previewImage1, setPreviewImage1] = useState<string | null>(null);
  const [previewImage2, setPreviewImage2] = useState<string | null>(null);

  const [zoom1, setZoom1] = useState(1);
  const [zoom2, setZoom2] = useState(1);

  const imgRef1 = useRef<HTMLImageElement | null>(null);
  const imgRef2 = useRef<HTMLImageElement | null>(null);

  const isA4 = selectedFormat === "A4";

  // Redirect if required files not present, with fallback to sessionStorage
  useEffect(() => {
    const checkFiles = async () => {
      console.log("[Crop] Files in context:", files.map(f => ({
        name: f.name,
        serverId: f.serverId,
        pageNumber: f.pageNumber,
      })));

      // Try to restore files from sessionStorage if context is empty
      if (files.length === 0) {
        const storedFiles = sessionStorage.getItem("uploadedFiles");
        if (storedFiles) {
          const parsedFiles = JSON.parse(storedFiles);
          console.log("[Crop] Restoring files from sessionStorage:", parsedFiles);
          setFiles(parsedFiles);
          return;
        }
      }

      // Delay validation to ensure context is populated
      const timer = setTimeout(() => {
        if (files.length !== requiredFiles || !files.every(f => f.serverId && f.pageNumber)) {
          console.error("[Crop] Validation failed:", {
            filesLength: files.length,
            requiredFiles,
            hasServerIds: files.every(f => f.serverId),
            hasPageNumbers: files.every(f => f.pageNumber),
          });
          toast.error(`Please upload ${requiredFiles} PDF${requiredFiles > 1 ? "s" : ""} before cropping.`);
          navigate("/");
        }
      }, 500);

      return () => clearTimeout(timer);
    };

    checkFiles();
  }, [files, requiredFiles, navigate, setFiles]);

  // Persist files to sessionStorage when they change
  useEffect(() => {
    if (files.length > 0) {
      console.log("[Crop] Saving files to sessionStorage:", files.map(f => ({
        name: f.name,
        serverId: f.serverId,
        pageNumber: f.pageNumber,
      })));
      sessionStorage.setItem("uploadedFiles", JSON.stringify(files));
    }
  }, [files]);

  // Fetch high res previews for all uploaded files
  useEffect(() => {
    const fetchHighResPreviews = async () => {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file?.serverId || !file?.pageNumber) continue;
        try {
          console.log("[Crop] Fetching high-res preview for file:", {
            serverId: file.serverId,
            pageNumber: file.pageNumber,
          });
          const response = await axios.post(
            "http://localhost:4000/high_res_preview",
            { file_id: file.serverId, page_number: file.pageNumber },
            { headers: { "Content-Type": "application/json" }, timeout: 15000 }
          );
          const highResUrl = `http://localhost:4000${response.data.preview}`;
          console.log("[Crop] High-res preview URL:", highResUrl);
          if (i === 0) setHighResImage1(highResUrl);
          else setHighResImage2(highResUrl);
        } catch (error: any) {
          const errorMsg = error.response?.data?.detail || error.message || "Failed to load high-res preview";
          console.error("[Crop] High-res preview error:", error);
          toast.error(`Failed to load high-res preview for PDF ${i + 1}: ${errorMsg}`);
        }
      }
    };

    if (files.length >= 1) fetchHighResPreviews();
  }, [files]);

  // After image loaded, initialize crop box based on rendered size
  useEffect(() => {
    const setInitialCrop = (imgEl: HTMLImageElement | null, setCrop: typeof setCrop1) => {
      if (!imgEl) return;
      const rect = imgEl.getBoundingClientRect();
      const width = Math.round(rect.width * 0.6);
      const height = Math.round(rect.height * 0.8); // Increased height for visibility
      setCrop({
        unit: "px",
        x: Math.round((rect.width - width) / 2),
        y: Math.round((rect.height - height) / 2),
        width,
        height,
      });
    };

    setTimeout(() => {
      if (imgRef1.current && !crop1.width && highResImage1) setInitialCrop(imgRef1.current, setCrop1);
      if (imgRef2.current && !crop2.width && highResImage2 && !isA4) setInitialCrop(imgRef2.current, setCrop2);
    }, 50);
  }, [highResImage1, highResImage2, isA4]);

  // onCropComplete handlers
  const onCropComplete1 = useCallback((pixelCrop: PixelCrop) => {
    setCroppedAreaPixels1(pixelCrop);
  }, []);
  const onCropComplete2 = useCallback((pixelCrop: PixelCrop) => {
    setCroppedAreaPixels2(pixelCrop);
  }, []);

  // Utility: compute scaling factors
  const computeScaledCrop = (pixelCrop: PixelCrop, imgEl: HTMLImageElement) => {
    const rendered = imgEl.getBoundingClientRect();
    const scaleX = imgEl.naturalWidth / rendered.width;
    const scaleY = imgEl.naturalHeight / rendered.height;
    return {
      x: Math.round(pixelCrop.x * scaleX),
      y: Math.round(pixelCrop.y * scaleY),
      width: Math.round(pixelCrop.width * scaleX),
      height: Math.round(pixelCrop.height * scaleY),
    };
  };

  // Generate preview
  const generatePreview = async (index: number) => {
    const file = files[index];
    const croppedAreaPixels = index === 0 ? croppedAreaPixels1 : croppedAreaPixels2;
    const imgRef = index === 0 ? imgRef1 : imgRef2;
    const setPreview = index === 0 ? setPreviewImage1 : setPreviewImage2;
    const setIsGenerating = index === 0 ? setIsGeneratingPreview1 : setIsGeneratingPreview2;

    if (!file || !file.serverId || !file.pageNumber || !croppedAreaPixels || !imgRef.current) {
      toast.error(`No file, crop area, or image loaded for PDF ${index + 1}`);
      return;
    }

    const scaledCrop = computeScaledCrop(croppedAreaPixels, imgRef.current);
    if (scaledCrop.width <= 0 || scaledCrop.height <= 0) {
      toast.error("Invalid crop area");
      return;
    }

    setIsGenerating(true);
    try {
      const response = await axios.post(
        "http://localhost:4000/crop_preview",
        {
          file_id: file.serverId,
          page_number: file.pageNumber,
          crop_x: scaledCrop.x,
          crop_y: scaledCrop.y,
          crop_width: scaledCrop.width,
          crop_height: scaledCrop.height,
        },
        { headers: { "Content-Type": "application/json" }, timeout: 15000 }
      );
      const previewUrl = `http://localhost:4000${response.data.preview}`;
      setPreview(previewUrl);
      console.log("[Crop] Preview generated for PDF", index + 1, ":", previewUrl);
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.message || "Failed to generate preview";
      console.error("[Crop] Preview error:", error);
      toast.error(`Failed to generate preview for PDF ${index + 1}: ${errorMsg}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Apply crop
  const handleCrop = async (index: number) => {
    const file = files[index];
    const croppedAreaPixels = index === 0 ? croppedAreaPixels1 : croppedAreaPixels2;
    const imgRef = index === 0 ? imgRef1 : imgRef2;
    const setIsCropping = index === 0 ? setIsCropping1 : setIsCropping2;
    const setCropApplied = index === 0 ? setCropApplied1 : setCropApplied2;

    if (!file || !file.serverId || !file.pageNumber || !croppedAreaPixels || !imgRef.current) {
      toast.error(`No file, crop area, or image loaded for PDF ${index + 1}`);
      return;
    }

    const scaledCrop = computeScaledCrop(croppedAreaPixels, imgRef.current);
    if (scaledCrop.width <= 0 || scaledCrop.height <= 0) {
      toast.error("Invalid crop area");
      return;
    }

    setIsCropping(true);
    try {
      const response = await axios.post(
        "http://localhost:4000/crop",
        {
          file_id: file.serverId,
          page_number: file.pageNumber,
          crop_x: scaledCrop.x,
          crop_y: scaledCrop.y,
          crop_width: scaledCrop.width,
          crop_height: scaledCrop.height,
        },
        { headers: { "Content-Type": "application/json" }, timeout: 15000 }
      );
      const croppedImage = `http://localhost:4000${response.data.cropped_image}`;
      console.log("[Crop] Crop applied for PDF", index + 1, ":", croppedImage);
      sessionStorage.setItem(`crop${index + 1}`, JSON.stringify({ croppedImage, crop: scaledCrop }));
      setCropApplied(true);
      toast.success(`Crop applied successfully for PDF ${index + 1}`);
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.message || "Failed to apply crop";
      console.error("[Crop] Crop error:", error);
      toast.error(`Failed to apply crop for PDF ${index + 1}: ${errorMsg}`);
    } finally {
      setIsCropping(false);
    }
  };

  // Reset crop
  const resetCrop = (index: number) => {
    const setCrop = index === 0 ? setCrop1 : setCrop2;
    const setCroppedAreaPixels = index === 0 ? setCroppedAreaPixels1 : setCroppedAreaPixels2;
    const setPreview = index === 0 ? setPreviewImage1 : setPreviewImage2;
    const setCropApplied = index === 0 ? setCropApplied1 : setCropApplied2;
    const imgRef = index === 0 ? imgRef1 : imgRef2;

    setCrop({ unit: "px", x: 0, y: 0, width: 0, height: 0 });
    setCroppedAreaPixels(null);
    setPreview(null);
    setCropApplied(false);
    sessionStorage.removeItem(`crop${index + 1}`);
    if (imgRef.current) {
      const rect = imgRef.current.getBoundingClientRect();
      const width = Math.round(rect.width * 0.6);
      const height = Math.round(rect.height * 0.8); // Increased height for visibility
      setCrop({
        unit: "px",
        x: Math.round((rect.width - width) / 2),
        y: Math.round((rect.height - height) / 2),
        width,
        height,
      });
    }
  };

  // Process to TIFF
  const handleProcess = async () => {
    if (isProcessing) return;

    const hasRequiredCrops = isA4
      ? sessionStorage.getItem("crop1")
      : sessionStorage.getItem("crop1") && sessionStorage.getItem("crop2");

    if (!hasRequiredCrops) {
      toast.error("Please apply crops to all required PDFs before processing.");
      return;
    }

    setIsProcessing(true);
    try {
      const payload = isA4
        ? {
            format: "A4",
            files: [
              {
                file_id: files[0].serverId,
                page_number: files[0].pageNumber,
                crop: JSON.parse(sessionStorage.getItem("crop1") || "{}").crop,
              },
            ],
          }
        : {
            format: "A3",
            files: [
              {
                file_id: files[0].serverId,
                page_number: files[0].pageNumber,
                crop: JSON.parse(sessionStorage.getItem("crop1") || "{}").crop,
              },
              {
                file_id: files[1].serverId,
                page_number: files[1].pageNumber,
                crop: JSON.parse(sessionStorage.getItem("crop2") || "{}").crop,
              },
            ],
          };

      console.log("[Crop] Processing TIFF with payload:", payload);
      const response = await axios.post(
        "http://localhost:4000/process",
        payload,
        { headers: { "Content-Type": "application/json" }, timeout: 30000 }
      );

      const tiffUrl = `http://localhost:4000${response.data.tiff}`;
      console.log("[Crop] TIFF generated:", tiffUrl);
      navigate(`/convert?tiff=${encodeURIComponent(response.data.tiff)}`);
      toast.success(`${selectedFormat} TIFF generated successfully`);
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.message || "Failed to process TIFF";
      console.error("[Crop] Process error:", error);
      toast.error(`Failed to process TIFF: ${errorMsg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className={cn("flex-1 p-8", className)}>
      <div className="max-w-7xl mx-auto space-y-12">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 bg-accent/10 text-accent px-4 py-2 rounded-full text-sm font-medium">
            Step 2 of 3
          </div>
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Crop Your {isA4 ? "PDF" : "PDFs"}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {isA4
              ? "Crop the selected PDF page to fit the A4 template for AutoCAD."
              : "Crop both PDF pages to fit the A3 template for AutoCAD merging."}
          </p>
        </div>

        <div className={isA4 ? "max-w-2xl mx-auto space-y-8" : "grid grid-cols-1 lg:grid-cols-2 gap-12 mx-auto max-w-7xl"}>
          {/* PDF 1 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">1</div>
                <h2 className="text-xl font-semibold">PDF Page {files[0]?.pageNumber || ""}</h2>
              </div>
              <Button
                onClick={() => resetCrop(0)}
                size="sm"
                variant="outline"
                disabled={isCropping1 || isGeneratingPreview1}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset Crop
              </Button>
            </div>

            <div className="relative w-full max-w-md h-[600px] mx-auto rounded-lg border border-border/50 shadow-sm overflow-hidden bg-white">
              {highResImage1 ? (
                <ReactCrop
                  crop={crop1}
                  onChange={(crop, pixelCrop) => {
                    setCrop1(crop);
                    if (pixelCrop) setCroppedAreaPixels1(pixelCrop);
                  }}
                  onComplete={onCropComplete1}
                >
                  <img
                    ref={imgRef1}
                    src={highResImage1}
                    alt="PDF 1"
                    className="w-full h-full object-contain"
                    style={{ imageRendering: "crisp-edges", transform: `scale(${zoom1})` }}
                  />
                </ReactCrop>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>

            <div className="flex justify-center items-center gap-4 mt-4">
              <span className="text-sm font-medium">Zoom:</span>
              <Slider
                value={[zoom1]}
                onValueChange={([value]) => setZoom1(value)}
                min={0.5}
                max={2}
                step={0.1}
                className="w-48"
              />
              <Button
                onClick={() => setZoom1((z) => Math.min(2, +(z + 0.1).toFixed(2)))}
                size="sm"
                variant="outline"
                disabled={zoom1 >= 2}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => setZoom1((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
                size="sm"
                variant="outline"
                disabled={zoom1 <= 0.5}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-medium mb-2 text-center">Crop Preview</h3>
              <div className="flex justify-center">
                {previewImage1 ? (
                  <img
                    src={previewImage1}
                    alt="Crop Preview 1"
                    className="w-full max-w-[400px] h-auto rounded-lg border-2 border-primary/50 shadow-md"
                    style={{ imageRendering: "crisp-edges", objectFit: "contain" }}
                  />
                ) : (
                  <p className="text-muted-foreground text-sm">Select area and generate preview</p>
                )}
              </div>
            </div>

            <div className="flex justify-center gap-4 mt-4">
              <Button
                onClick={() => generatePreview(0)}
                disabled={isGeneratingPreview1 || !croppedAreaPixels1}
                className="flex items-center gap-2"
              >
                {isGeneratingPreview1 ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    Generate Preview
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </Button>

              <Button
                onClick={() => handleCrop(0)}
                disabled={isCropping1 || !croppedAreaPixels1}
                className="bg-gradient-primary text-primary-foreground flex items-center gap-2"
              >
                {isCropping1 ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    Confirm Crop
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* PDF 2 for A3 */}
          {!isA4 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">2</div>
                  <h2 className="text-xl font-semibold">PDF Page {files[1]?.pageNumber || ""}</h2>
                </div>
                <Button
                  onClick={() => resetCrop(1)}
                  size="sm"
                  variant="outline"
                  disabled={isCropping2 || isGeneratingPreview2}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset Crop
                </Button>
              </div>

              <div className="relative w-full max-w-md h-[600px] mx-auto rounded-lg border border-border/50 shadow-sm overflow-hidden bg-white">
                {highResImage2 ? (
                  <ReactCrop
                    crop={crop2}
                    onChange={(crop, pixelCrop) => {
                      setCrop2(crop);
                      if (pixelCrop) setCroppedAreaPixels2(pixelCrop);
                    }}
                    onComplete={onCropComplete2}
                  >
                    <img
                      ref={imgRef2}
                      src={highResImage2}
                      alt="PDF 2"
                      className="w-full h-full object-contain"
                      style={{ imageRendering: "crisp-edges", transform: `scale(${zoom2})` }}
                    />
                  </ReactCrop>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>

              <div className="flex justify-center items-center gap-4 mt-4">
                <span className="text-sm font-medium">Zoom:</span>
                <Slider
                  value={[zoom2]}
                  onValueChange={([value]) => setZoom2(value)}
                  min={0.5}
                  max={2}
                  step={0.1}
                  className="w-48"
                />
                <Button
                  onClick={() => setZoom2((z) => Math.min(2, +(z + 0.1).toFixed(2)))}
                  size="sm"
                  variant="outline"
                  disabled={zoom2 >= 2}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  onClick={() => setZoom2((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
                  size="sm"
                  variant="outline"
                  disabled={zoom2 <= 0.5}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-4">
                <h3 className="text-sm font-medium mb-2 text-center">Crop Preview</h3>
                <div className="flex justify-center">
                  {previewImage2 ? (
                    <img
                      src={previewImage2}
                      alt="Crop Preview 2"
                      className="w-full max-w-[400px] h-auto rounded-lg border-2 border-primary/50 shadow-md"
                      style={{ imageRendering: "crisp-edges", objectFit: "contain" }}
                    />
                  ) : (
                    <p className="text-muted-foreground text-sm">Select area and generate preview</p>
                  )}
                </div>
              </div>

              <div className="flex justify-center gap-4">
                <Button
                  onClick={() => generatePreview(1)}
                  disabled={isGeneratingPreview2 || !croppedAreaPixels2}
                  className="flex items-center gap-2"
                >
                  {isGeneratingPreview2 ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      Generate Preview
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </Button>

                <Button
                  onClick={() => handleCrop(1)}
                  disabled={isCropping2 || !croppedAreaPixels2}
                  className="bg-gradient-primary text-primary-foreground flex items-center gap-2"
                >
                  {isCropping2 ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Applying...
                    </>
                  ) : (
                    <>
                      Confirm Crop
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-center mt-8">
          <Button
            onClick={handleProcess}
            disabled={
              isProcessing ||
              (isA4 ? !sessionStorage.getItem("crop1") : !(sessionStorage.getItem("crop1") && sessionStorage.getItem("crop2")))
            }
            size="lg"
            className="px-8 py-3 text-lg bg-gradient-primary text-primary-foreground flex items-center gap-2"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : isA4 ? (
              <>
                Convert to TIFF
                <ChevronRight className="h-5 w-5" />
              </>
            ) : (
              <>
                Merge & Convert
                <ChevronRight className="h-5 w-5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Crop;