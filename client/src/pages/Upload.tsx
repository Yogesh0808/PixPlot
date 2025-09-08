import React, { useContext } from "react";
import { FileUpload } from "@/components/ui/file-upload";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { FileContext } from "@/App";

const Upload: React.FC = () => {
  const { files, setFiles } = useContext(FileContext);
  const navigate = useNavigate();

  const handleFileSelect = (file: File & { serverId?: string; serverPath?: string; pageNumber?: number; totalPages?: number; preview?: string }) => {
    setFiles((prev) => {
      const newFiles = [...prev.filter(f => f.serverId !== file.serverId), file].slice(0, 2);
      console.log("[Upload] Updated files:", newFiles.map(f => ({
        name: f.name,
        serverId: f.serverId,
        pageNumber: f.pageNumber,
        totalPages: f.totalPages,
        preview: f.preview,
      })));
      if (newFiles.length === 2) {
        toast.success("Both PDFs uploaded successfully");
      }
      return newFiles;
    });
  };

  const handleRemove = (serverId: string | undefined) => {
    if (!serverId) return;
    setFiles((prev) => prev.filter(f => f.serverId !== serverId));
    console.log("[Upload] Removed file with serverId:", serverId);
  };

  const handleContinue = () => {
    if (files.length !== 2 || !files[0]?.pageNumber || !files[1]?.pageNumber) {
      toast.error("Please upload two PDFs and select a page for each");
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

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 bg-accent/10 text-accent px-4 py-2 rounded-full text-sm font-medium mb-6">
          Step 1 of 3
        </div>
        <h1 className="text-4xl font-bold mb-4 bg-gradient-primary bg-clip-text text-transparent">
          Upload Your PDF Files
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Select two PDF files and choose a page from each to crop and merge into a professional TIFF document. Each file should be under 10MB.
        </p>
      </div>
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
      <div className="flex justify-center">
        <Button
          onClick={handleContinue}
          disabled={files.length !== 2 || !files[0]?.pageNumber || !files[1]?.pageNumber}
          size="lg"
          className={cn(
            "px-8 py-3 text-lg transition-all duration-300 bg-gradient-primary text-primary-foreground flex items-center gap-2",
            (files.length !== 2 || !files[0]?.pageNumber || !files[1]?.pageNumber) && "bg-muted text-muted-foreground cursor-not-allowed"
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