import React, { useContext, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useFormat } from "@/components/ui/format-selector";
import { FileContext } from "@/App";
import { 
  Download, 
  CheckCircle, 
  FileImage, 
  RotateCcw, 
  Settings,
  Zap,
  Award,
  Monitor,
  Upload
} from "lucide-react";

const Convert = () => {
  const { files } = useContext(FileContext);
  const { selectedFormat } = useFormat();
  const [tiffUrl, setTiffUrl] = useState(null);
  const [tiffFilename, setTiffFilename] = useState(null);

  useEffect(() => {
  const tiffParam = new URLSearchParams(window.location.search).get("tiff");
  if (tiffParam) {
    const decoded = decodeURIComponent(tiffParam);
    setTiffUrl(decoded.startsWith("http") ? decoded : `http://localhost:4000${decoded}`);
    setTiffFilename(decoded.split("/").pop() || `${selectedFormat.toLowerCase()}_output.tiff`);
  }
}, [selectedFormat]);

  const requiredFiles = selectedFormat === 'A4' ? 1 : 2;
  const hasRequiredCrops = selectedFormat === 'A4' 
    ? sessionStorage.getItem("crop1")
    : sessionStorage.getItem("crop1") && sessionStorage.getItem("crop2");

  if (!files || files.length < requiredFiles || !hasRequiredCrops || !tiffUrl) {
    return (
      <div className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="glass-card p-12 text-center border-border/50">
            <div className="mb-6">
              <FileImage className="h-20 w-20 mx-auto text-muted-foreground mb-6" />
              <h2 className="text-3xl font-bold text-destructive mb-4">No TIFF File Available</h2>
              <p className="text-lg text-muted-foreground max-w-md mx-auto">
                Please complete the cropping and processing steps first to generate your {selectedFormat} TIFF file.
              </p>
            </div>
            <Button
              onClick={() => window.location.href = '/'}
              size="lg"
              className="bg-gradient-primary text-primary-foreground px-8"
            >
              <Upload className="h-5 w-5 mr-2" />
              Start Over
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const handleDownload = () => {
    if (!tiffUrl || !tiffFilename) return;
    
    const link = document.createElement("a");
    link.href = tiffUrl;
    link.download = tiffFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`${selectedFormat} TIFF file downloaded successfully`);
  };

  const handleStartOver = () => {
    // Clear session storage
    sessionStorage.removeItem("crop1");
    sessionStorage.removeItem("crop2");
    window.location.href = '/';
  };

  const specs = selectedFormat === 'A4' ? [
    { label: "Format", value: "A4", color: "bg-green-500" },
    { label: "DPI", value: "300", color: "bg-blue-500" },
    { label: "Mode", value: "Mono", color: "bg-purple-500" },
    { label: "Size", value: "2480×3508", color: "bg-orange-500" }
  ] : [
    { label: "Format", value: "A3", color: "bg-green-500" },
    { label: "DPI", value: "300", color: "bg-blue-500" },
    { label: "Mode", value: "Mono", color: "bg-purple-500" },
    { label: "Size", value: "3508×4961", color: "bg-orange-500" }
  ];

  return (
    <div className="flex-1 p-8 overflow-auto">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 bg-green-500/10 text-green-600 px-4 py-2 rounded-full text-sm font-medium">
            <CheckCircle className="h-4 w-4" />
            Step 3 of 3 - Complete
          </div>
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Your {selectedFormat} TIFF File is Ready
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {selectedFormat === 'A4' 
              ? "Successfully processed your PDF with professional A4 specifications for AutoCAD templates."
              : "Successfully merged and optimized for AutoCAD templates with professional A3 specifications."
            }
          </p>
          
          {/* File Info with Specs */}
          {tiffFilename && (
            <div className="glass-card p-4 max-w-2xl mx-auto border-border/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-accent/10 rounded-lg">
                    <FileImage className="h-5 w-5 text-accent" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-sm">{tiffFilename}</div>
                    <div className="text-xs text-muted-foreground">Monochrome TIFF • LZW Compressed • {selectedFormat}</div>
                  </div>
                </div>
                <div className="flex gap-1">
                  {specs.map((spec) => (
                    <div key={spec.label} className="text-center">
                      <div className={`w-2 h-2 ${spec.color} rounded-full mx-auto mb-1`}></div>
                      <div className="text-xs text-muted-foreground">{spec.label}</div>
                      <div className="text-xs font-medium">{spec.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Preview Section */}
        <div className="flex justify-center">
          <div className={selectedFormat === 'A4' ? "max-w-2xl w-full" : "grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl w-full"}>
            {files.slice(0, requiredFiles).map((file, index) => {
              const cropData = JSON.parse(sessionStorage.getItem(`crop${index + 1}`) || "{}");
              return (
                <div key={index} className="glass-card p-6 border-border/50">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="font-semibold">
                        {selectedFormat === 'A4' ? 'PDF' : `PDF ${index + 1}`}
                      </h3>
                      <p className="text-sm text-muted-foreground">Page {file.pageNumber}</p>
                    </div>
                    <div className="ml-auto">
                      <div className="flex items-center gap-1 bg-green-500/10 text-green-600 px-2 py-1 rounded-full text-xs font-medium">
                        <CheckCircle className="h-3 w-3" />
                        Ready
                      </div>
                    </div>
                  </div>
                  
                  {cropData.croppedImage ? (
                    <div className="space-y-3">
                      <div className="relative w-full max-w-[280px] mx-auto">
                        <img
                          src={cropData.croppedImage}
                          alt={`Cropped PDF ${index + 1}`}
                          className="w-full h-auto rounded-xl border border-border/50 shadow-lg"
                          style={{ imageRendering: "pixelated" }}
                        />
                        <div className="absolute -top-2 -right-2 bg-gradient-primary text-primary-foreground p-1.5 rounded-full shadow-lg">
                          <Award className="h-3 w-3" />
                        </div>
                      </div>
                      <div className="text-center space-y-1">
                        <div className="text-sm font-medium text-foreground">
                          {selectedFormat === 'A4' ? '2480×3508 pixels (A4)' : '900×1200 pixels (3:4 ratio)'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Optimized for AutoCAD compatibility
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-64 bg-muted rounded-xl flex items-center justify-center">
                      <div className="text-center">
                        <Settings className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No preview available</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
          <Button
            onClick={handleDownload}
            size="lg"
            className="px-10 py-4 text-lg bg-gradient-primary text-primary-foreground flex items-center gap-3 shadow-lg hover:shadow-xl transition-all"
            disabled={!tiffUrl}
          >
            <Download className="h-5 w-5" />
            Download {selectedFormat} TIFF File
          </Button>
          
          <Button
            onClick={handleStartOver}
            size="lg"
            variant="outline"
            className="px-8 py-4 text-lg border-border/50 hover:bg-muted/50 flex items-center gap-3"
          >
            <RotateCcw className="h-5 w-5" />
            Process Another {selectedFormat === 'A4' ? 'File' : 'Set'}
          </Button>
        </div>

        {/* AutoCAD Integration Tips */}
        <div className="glass-card p-6 border-border/50 max-w-4xl mx-auto">
          <div className="flex items-start gap-3 mb-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Monitor className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">AutoCAD Integration</h3>
              <p className="text-sm text-muted-foreground">Quick setup instructions for {selectedFormat} format</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Zap className="h-4 w-4 text-blue-500" />
                <span>Use <code className="bg-muted px-1.5 py-0.5 rounded text-xs">INSERT</code> command</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Zap className="h-4 w-4 text-green-500" />
                <span>Maintains 300 DPI precision</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Zap className="h-4 w-4 text-purple-500" />
                <span>Use <code className="bg-muted px-1.5 py-0.5 rounded text-xs">SCALE</code> for adjustments</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Zap className="h-4 w-4 text-orange-500" />
                <span>Ready for {selectedFormat} templates</span>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Indicator */}
        <div className="flex justify-center pt-8">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <div className="w-12 h-1 bg-green-500 rounded-full"></div>
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <div className="w-12 h-1 bg-green-500 rounded-full"></div>
            <div className="w-3 h-3 bg-green-500 rounded-full shadow-lg"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Convert;