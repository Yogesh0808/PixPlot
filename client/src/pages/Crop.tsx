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
import "react-image-crop/dist/ReactCrop.css";

interface CropProps {
  className?: string;
}

const Crop: React.FC<CropProps> = ({ className }) => {
  const { files } = useContext(FileContext);
  const navigate = useNavigate();
  const [crop1, setCrop1] = useState<Crop>({ unit: "px", x: 0, y: 0, width: 0, height: 0 });
  const [crop2, setCrop2] = useState<Crop>({ unit: "px", x: 0, y: 0, width: 0, height: 0 });
  const [croppedAreaPixels1, setCroppedAreaPixels1] = useState<PixelCrop | null>(null);
  const [croppedAreaPixels2, setCroppedAreaPixels2] = useState<PixelCrop | null>(null);
  const [isCropping1, setIsCropping1] = useState(false);
  const [isCropping2, setIsCropping2] = useState(false);
  const [isGeneratingPreview1, setIsGeneratingPreview1] = useState(false);
  const [isGeneratingPreview2, setIsGeneratingPreview2] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [cropApplied1, setCropApplied1] = useState(false);
  const [cropApplied2, setCropApplied2] = useState(false);
  const [highResImage1, setHighResImage1] = useState<string | null>(null);
  const [highResImage2, setHighResImage2] = useState<string | null>(null);
  const [previewImage1, setPreviewImage1] = useState<string | null>(null);
  const [previewImage2, setPreviewImage2] = useState<string | null>(null);
  const [zoom1, setZoom1] = useState(1);
  const [zoom2, setZoom2] = useState(1);
  const imgRef1 = useRef<HTMLImageElement>(null);
  const imgRef2 = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const fetchHighResPreviews = async () => {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.serverId || !file.pageNumber) continue;
        try {
          const response = await axios.post(
            "http://localhost:4000/high_res_preview",
            { file_id: file.serverId, page_number: file.pageNumber },
            { headers: { "Content-Type": "application/json" }, timeout: 15000 }
          );
          const highResUrl = `http://localhost:4000${response.data.preview}`;
          console.log(`[Crop] High-res preview for PDF ${i + 1}:`, highResUrl);
          if (i === 0) setHighResImage1(highResUrl);
          else setHighResImage2(highResUrl);
        } catch (error: any) {
          const errorMsg = error.response?.data?.detail || error.message || "Failed to load high-res preview";
          console.error(`[Crop] High-res preview error for PDF ${i + 1}:`, error);
          toast.error(`Failed to load high-res preview for PDF ${i + 1}: ${errorMsg}`);
        }
      }
    };
    if (files.length === 2) fetchHighResPreviews();
  }, [files]);

  useEffect(() => {
    if (imgRef1.current && !crop1.width) {
      const img = imgRef1.current;
      const width = img.width * 0.5;
      const height = img.height * 0.5;
      setCrop1({
        unit: "px",
        x: (img.width - width) / 2,
        y: (img.height - height) / 2,
        width,
        height,
      });
    }
    if (imgRef2.current && !crop2.width) {
      const img = imgRef2.current;
      const width = img.width * 0.5;
      const height = img.height * 0.5;
      setCrop2({
        unit: "px",
        x: (img.width - width) / 2,
        y: (img.height - height) / 2,
        width,
        height,
      });
    }
  }, [highResImage1, highResImage2]);

  const onCropComplete1 = useCallback(
    (crop: PixelCrop) => {
      console.log("[Crop] Crop coordinates PDF 1:", crop);
      setCroppedAreaPixels1(crop);
    },
    []
  );

  const onCropComplete2 = useCallback(
    (crop: PixelCrop) => {
      console.log("[Crop] Crop coordinates PDF 2:", crop);
      setCroppedAreaPixels2(crop);
    },
    []
  );

  const generatePreview = async (index: number) => {
    const file = files[index];
    const croppedAreaPixels = index === 0 ? croppedAreaPixels1 : croppedAreaPixels2;
    const setIsGeneratingPreview = index === 0 ? setIsGeneratingPreview1 : setIsGeneratingPreview2;
    const setPreviewImage = index === 0 ? setPreviewImage1 : setPreviewImage2;
    const imgRef = index === 0 ? imgRef1 : imgRef2;

    if (!file || !file.serverId || !file.pageNumber || !croppedAreaPixels || !imgRef.current) {
      toast.error(`No file, crop area, or image loaded for PDF ${index + 1}`);
      return;
    }

    const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
    const scaleY = imgRef.current.naturalHeight / imgRef.current.height;
    const scaledCrop = {
      x: Math.round(croppedAreaPixels.x * scaleX),
      y: Math.round(croppedAreaPixels.y * scaleY),
      width: Math.round(croppedAreaPixels.width * scaleX),
      height: Math.round(croppedAreaPixels.height * scaleY),
    };

    console.log(`[Crop] Generating preview for PDF ${index + 1}:`, scaledCrop);

    if (scaledCrop.width <= 0 || scaledCrop.height <= 0 || scaledCrop.x < 0 || scaledCrop.y < 0) {
      toast.error(`Invalid crop coordinates for PDF ${index + 1}`);
      console.error(`[Crop] Invalid coordinates:`, scaledCrop);
      return;
    }

    setIsGeneratingPreview(true);
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
        {
          headers: { "Content-Type": "application/json" },
          timeout: 15000,
        }
      );
      const previewUrl = `http://localhost:4000${response.data.preview}`;
      setPreviewImage(previewUrl);
      console.log(`[Crop] Preview generated for PDF ${index + 1}:`, previewUrl);
      toast.success(`Preview generated for PDF ${index + 1}`);
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.message || "Failed to generate preview";
      console.error(`[Crop] Error generating preview for PDF ${index + 1}:`, error);
      toast.error(`Failed to generate preview for PDF ${index + 1}: ${errorMsg}`);
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const handleCrop = async (index: number) => {
    const file = files[index];
    const croppedAreaPixels = index === 0 ? croppedAreaPixels1 : croppedAreaPixels2;
    const setIsCropping = index === 0 ? setIsCropping1 : setIsCropping2;
    const setCropApplied = index === 0 ? setCropApplied1 : setCropApplied2;
    const imgRef = index === 0 ? imgRef1 : imgRef2;

    if (!file || !file.serverId || !file.pageNumber || !croppedAreaPixels || !imgRef.current) {
      toast.error(`No file, crop area, or image loaded for PDF ${index + 1}`);
      return;
    }

    const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
    const scaleY = imgRef.current.naturalHeight / imgRef.current.height;
    const scaledCrop = {
      x: Math.round(croppedAreaPixels.x * scaleX),
      y: Math.round(croppedAreaPixels.y * scaleY),
      width: Math.round(croppedAreaPixels.width * scaleX),
      height: Math.round(croppedAreaPixels.height * scaleY),
    };

    console.log(`[Crop] Applying crop for PDF ${index + 1}:`, scaledCrop);

    if (scaledCrop.width <= 0 || scaledCrop.height <= 0 || scaledCrop.x < 0 || scaledCrop.y < 0) {
      toast.error(`Invalid crop coordinates for PDF ${index + 1}`);
      console.error(`[Crop] Invalid coordinates:`, scaledCrop);
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
        {
          headers: { "Content-Type": "application/json" },
          timeout: 15000,
        }
      );
      console.log(`[Crop] Crop response for PDF ${index + 1}:`, response.data);

      const croppedImageUrl = `http://localhost:4000${response.data.cropped_image}`;
      toast.success(`PDF ${index + 1} cropped successfully`);

      sessionStorage.setItem(`crop${index + 1}`, JSON.stringify({
        serverId: file.serverId,
        pageNumber: file.pageNumber,
        croppedImage: croppedImageUrl,
        cropArea: scaledCrop,
        width: response.data.width,
        height: response.data.height,
      }));

      setCropApplied(true);
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.message || "Failed to crop image";
      console.error(`[Crop] Error cropping PDF ${index + 1}:`, error);
      toast.error(`Failed to crop PDF ${index + 1}: ${errorMsg}`);
    } finally {
      setIsCropping(false);
    }
  };

  const resetCrop = (index: number) => {
    if (index === 0 && imgRef1.current) {
      const img = imgRef1.current;
      const width = img.width * 0.5;
      const height = img.height * 0.5;
      setCrop1({
        unit: "px",
        x: (img.width - width) / 2,
        y: (img.height - height) / 2,
        width,
        height,
      });
      setCroppedAreaPixels1(null);
      setCropApplied1(false);
      setPreviewImage1(null);
      setZoom1(1);
    } else if (index === 1 && imgRef2.current) {
      const img = imgRef2.current;
      const width = img.width * 0.5;
      const height = img.height * 0.5;
      setCrop2({
        unit: "px",
        x: (img.width - width) / 2,
        y: (img.height - height) / 2,
        width,
        height,
      });
      setCroppedAreaPixels2(null);
      setCropApplied2(false);
      setPreviewImage2(null);
      setZoom2(1);
    }
    sessionStorage.removeItem(`crop${index + 1}`);
    toast.info(`Crop and zoom reset for PDF ${index + 1}`);
  };

  const handleZoom = (index: number, value: number) => {
    if (index === 0) {
      setZoom1(value);
    } else {
      setZoom2(value);
    }
  };

  const handleMerge = async () => {
    if (!cropApplied1 || !cropApplied2) {
      toast.error("Please crop both PDFs before merging");
      return;
    }

    setIsMerging(true);
    try {
      const crop1 = JSON.parse(sessionStorage.getItem("crop1") || "{}");
      const crop2 = JSON.parse(sessionStorage.getItem("crop2") || "{}");

      const filesData = [
        {
          file_id: crop1.serverId || files[0].serverId,
          page_number: crop1.pageNumber || files[0].pageNumber,
          crop_x: crop1.cropArea?.x || 0,
          crop_y: crop1.cropArea?.y || 0,
          crop_width: crop1.cropArea?.width || 100,
          crop_height: crop1.cropArea?.height || 100,
        },
        {
          file_id: crop2.serverId || files[1].serverId,
          page_number: crop2.pageNumber || files[1].pageNumber,
          crop_x: crop2.cropArea?.x || 0,
          crop_y: crop2.cropArea?.y || 0,
          crop_width: crop2.cropArea?.width || 100,
          crop_height: crop2.cropArea?.height || 100,
        },
      ];

      const response = await axios.post("http://localhost:4000/merge", { files: filesData });
      console.log("[Crop] Merge response:", response.data);

      navigate("/convert", {
        state: {
          files: files.map((file: any, index: number) => ({
            ...file,
            croppedImage: JSON.parse(sessionStorage.getItem(`crop${index + 1}`) || "{}").croppedImage,
          })),
          tiffUrl: `http://localhost:4000${response.data.tiff_file}`,
        },
      });
      toast.success("PDFs merged successfully");
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.message || "Failed to merge PDFs";
      console.error("[Crop] Merge error:", error);
      toast.error(`Failed to merge PDFs: ${errorMsg}`);
    } finally {
      setIsMerging(false);
    }
  };

  if (files.length !== 2) {
    navigate("/");
    return null;
  }

  return (
    <div className={cn("container mx-auto p-4 space-y-8 max-w-6xl", className)}>
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 bg-accent/10 text-accent px-4 py-2 rounded-full text-sm font-medium mb-6">
          Step 2 of 3
        </div>
        <h1 className="text-4xl font-bold mb-4 bg-gradient-primary bg-clip-text text-transparent">
          Crop Your PDFs
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Adjust the crop area for each PDF to select the regions you want to merge into a single high-quality TIFF file.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">1</div>
              <h2 className="text-xl font-semibold">First PDF Page {files[0].pageNumber}</h2>
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
          <div className="relative w-full max-w-[800px] h-[800px] mx-auto rounded-lg border border-border/50 shadow-sm overflow-hidden bg-white">
            {highResImage1 ? (
              <ReactCrop
                crop={crop1}
                onChange={(crop, pixelCrop) => {
                  setCrop1(crop);
                  onCropComplete1(pixelCrop);
                }}
                onComplete={onCropComplete1}
              >
                <img
                  ref={imgRef1}
                  src={highResImage1}
                  alt="PDF 1"
                  style={{ width: "100%", height: "100%", objectFit: "contain", imageRendering: "crisp-edges", transform: `scale(${zoom1})` }}
                />
              </ReactCrop>
            ) : (
              <p className="text-muted-foreground flex items-center justify-center h-full">Loading high-res image...</p>
            )}
          </div>
          <div className="flex justify-center items-center gap-4 mt-4">
            <span className="text-sm font-medium">Zoom:</span>
            <Slider
              value={[zoom1]}
              onValueChange={([value]) => handleZoom(0, value)}
              min={0.5}
              max={2}
              step={0.1}
              className="w-48"
            />
            <Button
              onClick={() => handleZoom(0, zoom1 + 0.1)}
              size="sm"
              variant="outline"
              disabled={zoom1 >= 2}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => handleZoom(0, zoom1 - 0.1)}
              size="sm"
              variant="outline"
              disabled={zoom1 <= 0.5}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-4 flex justify-center">
            <h3 className="text-sm font-medium mb-2">Crop Preview</h3>
          </div>
          <div className="flex justify-center">
            {previewImage1 ? (
              <img
                src={previewImage1}
                alt="Crop Preview 1"
                className="w-full max-w-[300px] h-auto rounded-lg border border-border/50 shadow-sm"
                style={{ imageRendering: "crisp-edges" }}
              />
            ) : (
              <p className="text-muted-foreground text-sm">Select area and generate preview</p>
            )}
          </div>
          <div className="flex justify-center gap-4">
            <Button
              onClick={() => generatePreview(0)}
              disabled={isGeneratingPreview1 || !croppedAreaPixels1}
              className="bg-gradient-primary text-primary-foreground flex items-center gap-2"
            >
              {isGeneratingPreview1 ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating Preview...
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
                  Confirming Crop...
                </>
              ) : (
                <>
                  Confirm Crop PDF 1
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">2</div>
              <h2 className="text-xl font-semibold">Second PDF Page {files[1].pageNumber}</h2>
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
          <div className="relative w-full max-w-[800px] h-[800px] mx-auto rounded-lg border border-border/50 shadow-sm overflow-hidden bg-white">
            {highResImage2 ? (
              <ReactCrop
                crop={crop2}
                onChange={(crop, pixelCrop) => {
                  setCrop2(crop);
                  onCropComplete2(pixelCrop);
                }}
                onComplete={onCropComplete2}
              >
                <img
                  ref={imgRef2}
                  src={highResImage2}
                  alt="PDF 2"
                  style={{ width: "100%", height: "100%", objectFit: "contain", imageRendering: "crisp-edges", transform: `scale(${zoom2})` }}
                />
              </ReactCrop>
            ) : (
              <p className="text-muted-foreground flex items-center justify-center h-full">Loading high-res image...</p>
            )}
          </div>
          <div className="flex justify-center items-center gap-4 mt-4">
            <span className="text-sm font-medium">Zoom:</span>
            <Slider
              value={[zoom2]}
              onValueChange={([value]) => handleZoom(1, value)}
              min={0.5}
              max={2}
              step={0.1}
              className="w-48"
            />
            <Button
              onClick={() => handleZoom(1, zoom2 + 0.1)}
              size="sm"
              variant="outline"
              disabled={zoom2 >= 2}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => handleZoom(1, zoom2 - 0.1)}
              size="sm"
              variant="outline"
              disabled={zoom2 <= 0.5}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-4 flex justify-center">
            <h3 className="text-sm font-medium mb-2">Crop Preview</h3>
          </div>
          <div className="flex justify-center">
            {previewImage2 ? (
              <img
                src={previewImage2}
                alt="Crop Preview 2"
                className="w-full max-w-[300px] h-auto rounded-lg border border-border/50 shadow-sm"
                style={{ imageRendering: "crisp-edges" }}
              />
            ) : (
              <p className="text-muted-foreground text-sm">Select area and generate preview</p>
            )}
          </div>
          <div className="flex justify-center gap-4">
            <Button
              onClick={() => generatePreview(1)}
              disabled={isGeneratingPreview2 || !croppedAreaPixels2}
              className="bg-gradient-primary text-primary-foreground flex items-center gap-2"
            >
              {isGeneratingPreview2 ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating Preview...
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
                  Confirming Crop...
                </>
              ) : (
                <>
                  Confirm Crop PDF 2
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
      <div className="flex justify-center">
        <Button
          onClick={handleMerge}
          disabled={isMerging || !cropApplied1 || !cropApplied2 || !sessionStorage.getItem("crop1") || !sessionStorage.getItem("crop2")}
          size="lg"
          className="px-8 py-3 text-lg bg-gradient-primary text-primary-foreground flex items-center gap-2"
        >
          {isMerging ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Merging...
            </>
          ) : (
            <>
              Merge & Convert
              <ChevronRight className="h-5 w-5" />
            </>
          )}
        </Button>
      </div>
      <div className="mt-12 flex justify-center">
        <div className="flex items-center gap-4">
          <div className="w-3 h-3 bg-border rounded-full"></div>
          <div className="w-8 h-1 bg-border rounded-full"></div>
          <div className="w-3 h-3 bg-accent rounded-full"></div>
          <div className="w-8 h-1 bg-border rounded-full"></div>
          <div className="w-3 h-3 bg-border rounded-full"></div>
        </div>
      </div>
    </div>
  );
};

export default Crop;