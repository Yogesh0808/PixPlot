import React, { useState, useCallback, useRef, useEffect } from "react";
import { Upload, File, X, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import axios from "axios";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface FileUploadProps {
  onFileSelect: (file: File & { serverId?: string; serverPath?: string; pageNumber?: number; totalPages?: number; preview?: string }) => void;
  accept?: string;
  maxSize?: number;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  file?: File | null;
  onRemove?: () => void;
}

export function FileUpload({
  onFileSelect,
  accept = ".pdf",
  maxSize = 10,
  className,
  placeholder = "Drag & drop your PDF here or click to browse",
  disabled = false,
  file,
  onRemove,
}: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [selectedPage, setSelectedPage] = useState<number>(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentFileId = useRef<string | null>(null);
  const pendingFile = useRef<File | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const validateFile = (file: File): string | null => {
    if (!file.type.includes("pdf")) {
      return "Please select a PDF file";
    }
    if (file.size > maxSize * 1024 * 1024) {
      return `File size must be less than ${maxSize}MB`;
    }
    return null;
  };

  const handleUpload = async (selectedFile: File) => {
    setError(null);
    setPreview(null);
    setShowDialog(false);
    setTotalPages(0);
    setSelectedPage(1);
    currentFileId.current = null;
    pendingFile.current = null;

    console.log("[FileUpload] Starting file upload:", selectedFile.name);
    try {
      const validationError = validateFile(selectedFile);
      if (validationError) {
        setError(validationError);
        toast.error(validationError);
        return;
      }

      const formData = new FormData();
      formData.append("file", selectedFile);
      console.log("[FileUpload] Uploading to server...");
      const response = await axios.post("http://localhost:4000/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 15000,
      });
      console.log("[FileUpload] Server response:", response.data);

      const { fileId, filePath, preview: previewUrl, totalPages, pageNumber } = response.data;
      if (!fileId || !filePath || !previewUrl || !totalPages || !pageNumber) {
        throw new Error("Invalid server response: missing required fields");
      }

      currentFileId.current = fileId;
      setTotalPages(totalPages);
      pendingFile.current = selectedFile;

      if (totalPages > 1) {
        console.log("[FileUpload] Opening page selection dialog for multi-page PDF");
        setShowDialog(true);
      } else {
        console.log("[FileUpload] Single-page PDF, setting preview directly");
        const fullPreviewUrl = `http://localhost:4000${previewUrl}`;
        setPreview(fullPreviewUrl);
        setSelectedPage(pageNumber);

        const enhancedFile = Object.assign(selectedFile, {
          serverId: fileId,
          serverPath: filePath,
          pageNumber,
          totalPages,
          preview: fullPreviewUrl,
        });

        console.log("[FileUpload] Calling onFileSelect with:", {
          name: enhancedFile.name,
          serverId: fileId,
          pageNumber,
          totalPages,
          preview: fullPreviewUrl,
        });
        onFileSelect(enhancedFile);
      }
    } catch (error: any) {
      console.error("[FileUpload] Upload error:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      const errorMsg = error.response?.data?.detail || error.message || "Network error";
      setError(`Failed to upload PDF: ${errorMsg}`);
      toast.error(`Failed to upload PDF: ${errorMsg}`);
    }
  };

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (disabled) return;
      const files = e.dataTransfer.files;
      if (files && files[0]) {
        console.log("[FileUpload] File dropped:", files[0].name);
        await handleUpload(files[0]);
      }
    },
    [disabled]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      const files = e.target.files;
      if (files && files[0]) {
        console.log("[FileUpload] File selected:", files[0].name);
        await handleUpload(files[0]);
      }
      if (e.target) e.target.value = "";
    },
    [disabled]
  );

  const handlePageSelect = async (pageNumber: number) => {
    if (!currentFileId.current || !pendingFile.current) {
      console.error("[FileUpload] No fileId or pending file available for page selection", {
        fileId: currentFileId.current,
        pendingFile: pendingFile.current ? pendingFile.current.name : null,
      });
      toast.error("No PDF file loaded");
      setShowDialog(false);
      return;
    }

    console.log("[FileUpload] Generating preview for page:", {
      file_id: currentFileId.current,
      page_number: pageNumber,
    });

    if (typeof currentFileId.current !== "string" || currentFileId.current.trim() === "") {
      console.error("[FileUpload] Invalid file_id:", currentFileId.current);
      toast.error("Invalid file ID");
      setShowDialog(false);
      return;
    }
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      console.error("[FileUpload] Invalid page_number:", pageNumber);
      toast.error("Invalid page number");
      setShowDialog(false);
      return;
    }

    try {
      const payload = { file_id: currentFileId.current, page_number: pageNumber };
      console.log("[FileUpload] Sending payload to /preview_page:", payload);
      const response = await axios.post(
        "http://localhost:4000/preview_page",
        payload,
        {
          headers: { "Content-Type": "application/json" },
          timeout: 15000,
        }
      );
      console.log("[FileUpload] Preview response:", response.data);

      if (!response.data.preview) {
        throw new Error("Invalid server response: missing preview URL");
      }

      const previewUrl = `http://localhost:4000${response.data.preview}`;
      setPreview(previewUrl);
      setSelectedPage(pageNumber);

      const enhancedFile = Object.assign(pendingFile.current, {
        serverId: currentFileId.current,
        serverPath: `/uploads/${currentFileId.current}.pdf`,
        pageNumber,
        totalPages,
        preview: previewUrl,
      });

      console.log("[FileUpload] Calling onFileSelect with:", {
        name: enhancedFile.name,
        serverId: currentFileId.current,
        pageNumber,
        totalPages,
        preview: previewUrl,
      });
      onFileSelect(enhancedFile);
      setShowDialog(false);
      pendingFile.current = null;
    } catch (error: any) {
      let errorMsg = error.response?.data?.detail || error.message || "Failed to generate page preview";
      if (Array.isArray(errorMsg)) {
        errorMsg = errorMsg.map((err: any) => err.msg).join("; ");
      }
      console.error("[FileUpload] Page preview error:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        payload: { file_id: currentFileId.current, page_number: pageNumber },
      });
      toast.error(`Failed to load page preview: ${errorMsg}`);
      setShowDialog(false);
      setError(`Failed to load page preview: ${errorMsg}`);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  useEffect(() => {
    console.log("[FileUpload] File prop changed:", file ? file.name : "null");
    if (file && file.preview) {
      setPreview(file.preview);
      setTotalPages(file.totalPages || 0);
      setSelectedPage(file.pageNumber || 1);
      currentFileId.current = file.serverId || null;
    }
  }, [file]);

  return (
    <div className={cn("relative", className)}>
      {file ? (
        <div className={cn("glass-card p-6", className)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="font-medium text-sm truncate max-w-xs">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(file.size)} • Page {file.pageNumber || 1} of {file.totalPages || 1}
                </p>
              </div>
            </div>
            {onRemove && (
              <Button
                onClick={() => {
                  console.log("[FileUpload] Removing file:", file.name);
                  onRemove();
                  setPreview(null);
                  setTotalPages(0);
                  setSelectedPage(1);
                  currentFileId.current = null;
                  pendingFile.current = null;
                }}
                variant="destructive"
                size="icon"
                className="w-8 h-8"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {preview ? (
            <div className="mt-4 relative w-full max-w-[200px] mx-auto">
              <div className="relative overflow-hidden rounded-lg border border-border shadow-sm">
                <img
                  src={preview}
                  alt="PDF Preview"
                  className="w-full h-auto max-h-[150px] object-contain"
                  style={{ imageRendering: "pixelated" }}
                  onError={(e) => {
                    console.error("[FileUpload] Preview image failed to load:", preview);
                    setError("Failed to load preview image");
                    toast.error("Failed to load preview image");
                  }}
                />
                <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                  Page {file.pageNumber || 1} of {file.totalPages || 1}
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground text-center">Loading preview...</p>
          )}
        </div>
      ) : (
        <div
          className={cn(
            "glass-card p-8 border-2 border-dashed transition-all duration-300 cursor-pointer group",
            dragActive && "border-accent bg-accent/5 scale-[1.02]",
            !dragActive && "border-border hover:border-accent/50 hover:bg-accent/5",
            disabled && "opacity-50 cursor-not-allowed",
            error && "border-destructive bg-destructive/5"
          )}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !disabled && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={handleFileSelect}
            className="hidden"
            disabled={disabled}
          />
          <div className="flex flex-col items-center text-center space-y-4">
            <div
              className={cn(
                "w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300",
                dragActive ? "bg-accent text-accent-foreground scale-110" : "bg-muted group-hover:bg-accent/10"
              )}
            >
              <Upload
                className={cn(
                  "h-8 w-8 transition-all duration-300",
                  dragActive ? "text-accent-foreground" : "text-muted-foreground group-hover:text-accent"
                )}
              />
            </div>
            <div className="space-y-2">
              <p
                className={cn(
                  "font-medium transition-colors duration-300",
                  dragActive ? "text-accent" : "text-foreground"
                )}
              >
                {dragActive ? "Drop your PDF here" : placeholder}
              </p>
              <p className="text-sm text-muted-foreground">
                Supports PDF files up to {maxSize}MB
              </p>
            </div>
            {error && (
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <p className="text-sm">{error}</p>
              </div>
            )}
          </div>
        </div>
      )}
      <Dialog.Root open={showDialog} onOpenChange={(open) => {
        console.log("[FileUpload] Dialog open state:", open);
        setShowDialog(open);
        if (!open) {
          pendingFile.current = null;
        }
      }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background glass-card p-6 rounded-xl shadow-lg max-w-md w-full animate-dialog">
            <Dialog.Title className="text-xl font-semibold mb-4">Select PDF Page</Dialog.Title>
            <p className="text-muted-foreground mb-4">This PDF has {totalPages} pages. Choose a page to preview and crop.</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <Button
                  key={pageNum}
                  onClick={() => {
                    console.log("[FileUpload] Page button clicked:", pageNum);
                    setSelectedPage(pageNum);
                  }}
                  variant={selectedPage === pageNum ? "default" : "outline"}
                  size="sm"
                  className="w-10 h-10"
                >
                  {pageNum}
                </Button>
              ))}
            </div>
            <div className="flex gap-3">
              <Dialog.Close asChild>
                <Button variant="outline" className="flex-1">Cancel</Button>
              </Dialog.Close>
              <Button
                onClick={() => handlePageSelect(selectedPage)}
                className="flex-1"
                disabled={!selectedPage}
              >
                Confirm
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}