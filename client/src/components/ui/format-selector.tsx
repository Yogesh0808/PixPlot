import React, { createContext, useContext, useState, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileText, Copy } from "lucide-react";

type FormatType = "A4" | "A3";

interface FormatContextType {
  selectedFormat: FormatType;
  setSelectedFormat: (format: FormatType) => void;
  requiredFiles: number;
}

const FormatContext = createContext<FormatContextType | null>(null);
export const useFormat = () => {
  const ctx = useContext(FormatContext);
  if (!ctx) throw new Error("useFormat must be used inside FormatProvider");
  return ctx;
};

export const FormatProvider = ({ children }: { children: ReactNode }) => {
  const [selectedFormat, setSelectedFormat] = useState<FormatType>("A4");
  const requiredFiles = selectedFormat === "A4" ? 1 : 2;
  return (
    <FormatContext.Provider value={{ selectedFormat, setSelectedFormat, requiredFiles }}>
      {children}
    </FormatContext.Provider>
  );
};

interface FormatSelectorProps {
  onFormatSelect: (format: FormatType) => void;
  selectedFormat: FormatType;
}

export function FormatSelector({ onFormatSelect, selectedFormat }: FormatSelectorProps) {
  return (
    <div
      className={cn(
        "mx-auto mb-8 max-w-2xl p-8 rounded-2xl border border-border/40",
        "bg-gradient-to-b from-background/70 to-background/40 backdrop-blur-sm shadow-xl"
      )}
    >
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold tracking-tight text-primary-dark">Choose Output Format</h2>
        <p className="mt-2 text-muted-foreground">
          Select the format that best matches your requirements
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Button
          onClick={() => onFormatSelect("A4")}
          variant="outline"
          className={cn(
            "h-28 p-6 flex flex-col items-center justify-center gap-3 rounded-xl transition-all duration-300 shadow-md",
            selectedFormat === "A4"
              ? "border-primary-dark text-primary-dark shadow-lg"
              : "hover:bg-muted/30 border-border]"
          )}
        >
          <FileText className="h-9 w-9" />
          <div className="text-center">
            <div className="font-semibold text-lg">A4 Format</div>
            <div className="text-xs text-muted-foreground">Single PDF • Portrait</div>
          </div>
        </Button>

        <Button
          onClick={() => onFormatSelect("A3")}
          variant="outline"
          className={cn(
            "h-28 p-6 flex flex-col items-center justify-center gap-3 rounded-xl transition-all duration-300 shadow-md",
            selectedFormat === "A3"
              ? "bg-primary-dark/20 border-primary-dark text-primary-dark shadow-lg"
              : "hover:bg-muted/30 border-border"
          )}
        >
          <Copy className="h-9 w-9" />
          <div className="text-center">
            <div className="font-semibold text-lg">A3 Format</div>
            <div className="text-xs text-muted-foreground">Dual PDF • Side-by-Side</div>
          </div>
        </Button>
      </div>

      <div
        className={cn(
          "mt-8 p-5 rounded-xl border border-border/40 bg-muted/20 text-sm shadow-inner"
        )}
      >
        <strong className="text-primary-dark">{selectedFormat} Format:</strong>
        <ul className="mt-3 space-y-1 text-muted-foreground">
          {selectedFormat === "A4" ? (
            <>
              <li>• Upload 1 PDF file</li>
              <li>• Crop single page</li>
              <li>• Export as TIFF (A4 size)</li>
            </>
          ) : (
            <>
              <li>• Upload 2 PDF files</li>
              <li>• Crop both pages</li>
              <li>• Merge side-by-side (A3 size)</li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}
