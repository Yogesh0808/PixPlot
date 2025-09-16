import React, { useContext, useState, useEffect } from "react";
import { FileUpload } from "@/components/ui/file-upload";
import { FormatSelector, useFormat } from "@/components/ui/format-selector";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ChevronRight, ArrowLeft } from "lucide-react";
import { FileContext } from "@/App";
import { useNavigate } from "react-router-dom";

const Upload = () => {
  const { files, setFiles } = useContext(FileContext);
  const { selectedFormat, setSelectedFormat } = useFormat();
  const [showFormatSelector, setShowFormatSelector] = useState(true);
  const [hasSelectedFormat, setHasSelectedFormat] = useState(false);
  const navigate = useNavigate();

  const { requiredFiles } = useFormat();

  useEffect(() => {
    // Clear files when format changes
    setFiles([]);
    // Clear session storage
    sessionStorage.removeItem("crop1");
    sessionStorage.removeItem("crop2");
  }, [selectedFormat, setFiles]);

  const handleFormatSelect = (format) => {
    setSelectedFormat(format);
    setHasSelectedFormat(true);
    setShowFormatSelector(false);
  };

  const handleFileSelect = (file) => {
    setFiles((prev) => {
      const newFiles = [...prev.filter(f => f.serverId !== file.serverId), file].slice(0, requiredFiles);
      console.log("[Upload] Updated files:", newFiles.map(f => ({
        name: f.name,
        serverId: f.serverId,
        pageNumber: f.pageNumber,
        totalPages: f.totalPages,
        preview: f.preview,
      })));
      if (newFiles.length === requiredFiles) {
        toast.success(`${selectedFormat} PDF${requiredFiles > 1 ? 's' : ''} uploaded successfully`);
      }
      return newFiles;
    });
  };

  const handleRemove = (serverId) => {
    if (!serverId) return;
    setFiles((prev) => prev.filter(f => f.serverId !== serverId));
    console.log("[Upload] Removed file with serverId:", serverId);
  };

  const handleContinue = () => {
    const hasRequiredFiles = files.length === requiredFiles;
    const hasPageNumbers = files.every(f => f.pageNumber);

    if (!hasRequiredFiles || !hasPageNumbers) {
      toast.error(`Please upload ${requiredFiles} PDF${requiredFiles > 1 ? 's' : ''} and select a page for each`);
      return;
    }

    console.log("[Upload] Navigating to /crop with files:", files.map(f => ({
      name: f.name,
      serverId: f.serverId,
      pageNumber: f.pageNumber,
      totalPages: f.totalPages,
      preview: f.preview,
    })));

    navigate("/crop");
  };
  
  const handleBackToFormat = () => {
    setShowFormatSelector(true);
    setHasSelectedFormat(false);
    setFiles([]);
  };

  if (showFormatSelector) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-primary bg-clip-text text-transparent">
            Welcome to PixPlot
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Professional PDF to TIFF converter with advanced cropping and merging capabilities for AutoCAD workflows.
          </p>
        </div>
        
        <FormatSelector 
          onFormatSelect={handleFormatSelect}
          selectedFormat={selectedFormat}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 bg-accent/10 text-accent px-4 py-2 rounded-full text-sm font-medium mb-6">
          Step 1 of 3
        </div>
        <div className="flex items-center justify-center gap-4 mb-6">
          <Button
            onClick={handleBackToFormat}
            variant="outline"
            size="sm"
            className="text-sm"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Change Format
          </Button>
          <div className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
            {selectedFormat} Format Selected
          </div>
        </div>
        
        <h1 className="text-4xl font-bold mb-4 bg-gradient-primary bg-clip-text text-transparent">
          Upload Your PDF {selectedFormat === 'A3' ? 'Files' : 'File'}
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          {selectedFormat === 'A4' 
            ? "Select one PDF file and choose a page to crop into a professional A4 TIFF document."
            : "Select two PDF files and choose a page from each to crop and merge into a professional A3 TIFF document."
          } Each file should be under 10MB.
        </p>
      </div>

      {selectedFormat === 'A4' ? (
        <div className="max-w-2xl mx-auto mb-12">
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">1</div>
              <h2 className="text-xl font-semibold">PDF Document</h2>
            </div>
            <FileUpload
              onFileSelect={handleFileSelect}
              file={files[0] || null}
              onRemove={() => handleRemove(files[0]?.serverId)}
              placeholder="Upload PDF file for A4 conversion"
              className="h-64"
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">1</div>
              <h2 className="text-xl font-semibold">First PDF Document</h2>
            </div>
            <FileUpload
              onFileSelect={handleFileSelect}
              file={files[0] || null}
              onRemove={() => handleRemove(files[0]?.serverId)}
              placeholder="Upload first PDF file"
              className="h-64"
            />
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">2</div>
              <h2 className="text-xl font-semibold">Second PDF Document</h2>
            </div>
            <FileUpload
              onFileSelect={handleFileSelect}
              file={files[1] || null}
              onRemove={() => handleRemove(files[1]?.serverId)}
              placeholder="Upload second PDF file"
              className="h-64"
            />
          </div>
        </div>
      )}

      <div className="flex justify-center">
        <Button
          onClick={handleContinue}
          disabled={files.length !== requiredFiles || !files.every(f => f.pageNumber)}
          size="lg"
          className={cn(
            "px-8 py-3 text-lg transition-all duration-300 bg-gradient-primary text-primary-foreground flex items-center gap-2",
            (files.length !== requiredFiles || !files.every(f => f.pageNumber)) && "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          Continue to Cropping
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      <div className="mt-12 flex justify-center">
        <div className="flex items-center gap-4">
          <div className="w-3 h-3 bg-accent rounded-full"></div>
          <div className="w-8 h-1 bg-border rounded-full"></div>
          <div className="w-3 h-3 bg-border rounded-full"></div>
          <div className="w-8 h-1 bg-border rounded-full"></div>
          <div className="w-3 h-3 bg-border rounded-full"></div>
        </div>
      </div>
    </div>
  );
};

export default Upload;